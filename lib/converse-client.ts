// Browser-only: the one client for POST /api/converse. Chat, Define/Quiz, margin reactions and
// thread replies all stream through streamMessage, so the NDJSON parsing lives in one place.
import type { ConverseEvent, ConverseRequest } from "@/core/converse.ts";
import { citedPages, parsePassage } from "@/core/passage.ts";
import type { ReactionKind } from "@/core/reactions.ts";
import { LIMITS } from "@/core/limits.ts";
import { loadRepliesToday, localDay, recordReply, type ChatMessage } from "@/core/store.ts";

export type MessagePatch = (message: ChatMessage) => ChatMessage;

// Streams one reply into one assistant message: `update` applies each change to that message (the
// caller targets it, e.g. the last chat message or the last message of thread `id`). A "kind" event
// (reactions) goes to onKind. The message always ends with isStreaming false and its page labels,
// or with an error code; this never throws.
export async function streamMessage(
  body: ConverseRequest,
  update: (patch: MessagePatch) => void,
  options: { onKind?: (kind: ReactionKind) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const paragraphs = parsePassage(body.passage); // as sent, for the finished reply's page labels
  // D35: every AI reply passes here, so the daily count lives here too. The page also pauses the
  // buttons at the cap; this catches a request that started before the page caught up.
  const day = localDay(new Date());
  if (loadRepliesToday(window.localStorage, day) >= LIMITS.dailyReplies) {
    update((m) => ({ ...m, error: "daily_limit", isStreaming: false }));
    return;
  }
  recordReply(window.localStorage, day);
  try {
    const requestError = await streamReply(body, options.signal, (event) => {
      if (event.type === "kind") options.onKind?.(event.kind);
      if (event.type === "text") update((m) => ({ ...m, content: m.content + event.text }));
      // An empty reply (e.g. a refusal) is an error, not a blank bubble.
      if (event.type === "done")
        update((m) =>
          m.content === ""
            ? { ...m, error: `empty_reply (stop_reason: ${event.stats.stopReason})` }
            : { ...m, citations: event.stats.citations },
        );
      if (event.type === "error") update((m) => ({ ...m, error: event.code }));
    });
    if (requestError) update((m) => ({ ...m, error: requestError }));
  } catch {
    update((m) => ({ ...m, error: "network_error" }));
  }
  update((m) => ({ ...m, pages: citedPages(m.content, paragraphs), isStreaming: false }));
}

// POST to the route and call onEvent for each NDJSON line as it arrives.
// Returns an error code if the request was rejected (e.g. "passage_missing"), a line was not JSON
// ("bad_response"), or the stream ended without a "done" or "error" line ("stream_incomplete").
async function streamReply(
  body: ConverseRequest,
  signal: AbortSignal | undefined,
  onEvent: (event: ConverseEvent) => void,
): Promise<string | undefined> {
  const response = await fetch("/api/converse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const { error } = await response.json().catch(() => ({ error: "api_error" }));
    return String(error);
  }
  let isFinished = false;
  const handleLine = (line: string): boolean => {
    if (!line.trim()) return true;
    let event: ConverseEvent;
    try {
      event = JSON.parse(line);
    } catch {
      return false;
    }
    if (event.type === "done" || event.type === "error") isFinished = true;
    onEvent(event);
    return true;
  };

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep a partial last line for the next chunk
    if (!lines.every(handleLine)) {
      void reader.cancel();
      return "bad_response";
    }
  }
  if (!handleLine(buffer)) return "bad_response"; // a last line with no trailing newline
  return isFinished ? undefined : "stream_incomplete";
}
