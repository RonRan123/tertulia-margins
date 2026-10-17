// Browser-only: records trace events (D48) and posts them to /api/trace in small batches, every few
// seconds and when the tab is hidden. Tracing must never break the app: every step swallows errors,
// and a failed send is dropped rather than retried.
import type { TraceEvent } from "@/core/trace.ts";

type Body = TraceEvent extends infer E ? (E extends TraceEvent ? Omit<E, "at" | "book"> : never) : never;

const BROWSER_KEY = "tertulia-margins:trace-browser";
const FLUSH_MS = 5_000;
const queue: TraceEvent[] = [];
let book: string | undefined; // the open book's title, stamped on each event
let timer: ReturnType<typeof setTimeout> | undefined;
let session: string | undefined;
let browser: string | undefined;

function ids(): { browser: string; session: string } {
  session ??= crypto.randomUUID();
  if (!browser) {
    try {
      browser = window.localStorage.getItem(BROWSER_KEY) ?? undefined;
      if (!browser) window.localStorage.setItem(BROWSER_KEY, (browser = crypto.randomUUID()));
    } catch {
      browser = crypto.randomUUID(); // storage blocked: one id for this tab
    }
  }
  return { browser: browser!, session };
}

export const setTraceBook = (title: string | undefined) => {
  book = title;
};

export function trace(event: Body): void {
  try {
    queue.push({ ...event, at: new Date().toISOString(), ...(book && { book }) } as TraceEvent);
    timer ??= setTimeout(flush, FLUSH_MS);
  } catch {
    // never let tracing break the app
  }
}

// Sends what's queued. `isLeaving`: the tab is closing, so use sendBeacon, which outlives the page.
export function flush(isLeaving = false): void {
  clearTimeout(timer);
  timer = undefined;
  while (queue.length > 0) {
    try {
      const body = JSON.stringify({ ...ids(), events: queue.splice(0, BATCH_SIZE) });
      if (isLeaving && navigator.sendBeacon) {
        navigator.sendBeacon("/api/trace", new Blob([body], { type: "application/json" }));
        continue;
      }
      void fetch("/api/trace", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    } catch {
      // dropped
    }
  }
}

const BATCH_SIZE = 50; // events per request, well under the route's caps (core/trace.ts)
