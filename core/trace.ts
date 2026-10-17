// Traces (D48): a timeline of what the reader did and what each agent answered, kept so a person can
// read a session and follow it. The browser records events (lib/trace.ts), the route stores them
// (.scratch/traces on localhost, Vercel Blob when hosted), and renderTrace turns them into markdown.
// Book text is never traced: only titles, page numbers, the reader's notes and words, and AI output.
// Browser-safe: no node:fs.
import { isRightAnswer, QUIZ_STYLES, QUIZ_TOPICS, quizScore, type QuizAnswer, type QuizQuestion, type QuizSetup, type QuizState } from "./quiz.ts";

// One draft from a daemon run, and what became of it: shown, kept as a runner-up, passed, or dropped
// by the grounding check (with the reason). `anchorFound`: false when the anchor wasn't in the
// excerpt, so the card fell back to the excerpt's first line.
export type DraftTrace = {
  daemon: string;
  outcome: "picked" | "runner-up" | "passed" | "dropped";
  text: string;
  anchor: string;
  anchorFound: boolean;
  reason?: string;
};

export type TokenUse = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

export type TraceEvent = { at: string; book?: string } & (
  | { kind: "session"; view: string; books: string[] }
  | { kind: "book"; action: "open" | "create" | "rename" | "delete" | "restore-examples"; title: string }
  | { kind: "view"; view: string }
  | { kind: "settings"; change: string }
  | { kind: "notes"; added: string[]; removed: string[]; lines: number }
  | { kind: "pdf"; action: "added" | "opened-page"; page?: number }
  | { kind: "chat"; question: string; reply: string; ms: number; tokens?: TokenUse; citations: string[]; error?: string }
  | {
      kind: "daemons";
      trigger: "pause" | "asked";
      excerpt: string;
      mustPick: boolean;
      drafts: DraftTrace[];
      pick: string | null;
      ms: number;
      tokens?: TokenUse;
      reviewerTokens?: TokenUse;
      error?: string;
    }
  | { kind: "promote"; daemon: string; text: string }
  | { kind: "card"; action: "highlight" | "clear" | "dismiss"; daemon: string; text: string }
  | { kind: "quiz"; action: "start"; setup: string }
  | { kind: "quiz"; action: "ready"; ms: number; tokens?: TokenUse; questions: string[]; feedback?: string; error?: string }
  | { kind: "quiz"; action: "answer"; question: string; answer: string; isRight: boolean }
  | { kind: "quiz"; action: "grade"; question: string; answer: string; verdict: string; feedback: string; ms: number; error?: string }
  | { kind: "quiz"; action: "end"; score: string }
);

// A batch as the browser posts it. `browser`: a random id kept per browser, so one tester's sessions
// group together; `session`: per tab load.
export type TraceBatch = { browser: string; session: string; events: TraceEvent[] };

const ID = /^[a-z0-9-]{8,64}$/;
const MAX_EVENTS = 200; // per batch; the browser sends every few seconds, so far more than needed
const MAX_CHARS = 200_000; // per batch, as JSON: a few long notes diffs and replies

// The route's guard: a well-formed batch, or undefined. Events are trusted for shape only loosely
// (each has an `at` and a known `kind`); renderTrace tolerates missing fields.
export function parseTraceBatch(body: unknown): TraceBatch | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { browser, session, events } = body as Record<string, unknown>;
  const isValid =
    typeof browser === "string" && ID.test(browser) && typeof session === "string" && ID.test(session) &&
    Array.isArray(events) && events.length > 0 && events.length <= MAX_EVENTS && JSON.stringify(events).length <= MAX_CHARS &&
    events.every((e) => typeof e === "object" && e !== null && typeof e.at === "string" && typeof e.kind === "string" && e.kind in KIND_NAMES);
  return isValid ? { browser, session, events: events as TraceEvent[] } : undefined;
}

const KIND_NAMES: Record<TraceEvent["kind"], true> = {
  session: true, book: true, view: true, settings: true, notes: true, pdf: true, chat: true,
  daemons: true, promote: true, card: true, quiz: true,
};

// The lines added and removed between two versions of the notes (blank lines ignored; a moved line
// is neither). A line edited in place shows as one removed and one added.
export function diffLines(before: string, after: string): { added: string[]; removed: string[] } {
  const count = (text: string) => {
    const lines = new Map<string, number>();
    for (const line of text.split("\n")) if (line.trim() !== "") lines.set(line, (lines.get(line) ?? 0) + 1);
    return lines;
  };
  const was = count(before);
  const now = count(after);
  const extra = (a: Map<string, number>, b: Map<string, number>) =>
    [...a].flatMap(([line, n]) => Array<string>(Math.max(0, n - (b.get(line) ?? 0))).fill(line));
  return { added: extra(now, was), removed: extra(was, now) };
}

// ---- Rendering: one markdown file a person can read top to bottom ----

const DAEMON_NAMES: Record<string, string> = { author: "The Author", "devils-advocate": "The Devil's Advocate", scholar: "The Scholar" };
const daemonName = (id: string) => DAEMON_NAMES[id] ?? id;
const time = (at: string) => at.slice(11, 19); // HH:MM:SS of an ISO time (UTC)
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const tokens = (t?: TokenUse) =>
  t ? `${t.input} in / ${t.output} out${t.cacheRead ? `, ${t.cacheRead} from cache` : ""}${t.cacheWrite ? `, ${t.cacheWrite} cached` : ""}` : "";
const quote = (text: string) => text.trim().split("\n").map((line) => `  > ${line}`).join("\n");
const said = (text: string) => `“${text.trim().replace(/\s+/g, " ")}”`;

// Who acted: the reader, or an agent. Shown in bold at the start of each entry.
function entry(event: TraceEvent): { who: string; what: string; details?: string } {
  switch (event.kind) {
    case "session":
      return { who: "App", what: `opened in view "${event.view}" with ${event.books.length} books: ${event.books.join(", ")}` };
    case "book":
      return { who: "Reader", what: `${event.action === "restore-examples" ? "restored the example books" : `${event.action === "open" ? "opened" : event.action + "d"} book "${event.title}"`}` };
    case "view":
      return { who: "Reader", what: `switched the view to "${event.view}"` };
    case "settings":
      return { who: "Reader", what: `changed a setting: ${event.change}` };
    case "notes": {
      const counts = `+${event.added.length} / −${event.removed.length} lines, ${event.lines} lines in all`;
      const details = [...event.removed.map((l) => `  − ${l}`), ...event.added.map((l) => `  + ${l}`)].join("\n");
      return { who: "Reader", what: `edited the notes (${counts})`, details };
    }
    case "pdf":
      return { who: "Reader", what: event.action === "added" ? "added a PDF" : `opened the PDF at page ${event.page}` };
    case "chat": {
      const outcome = event.error ? `failed: ${event.error}` : `replied in ${secs(event.ms)}${event.tokens ? ` (${tokens(event.tokens)})` : ""}`;
      const cites = event.citations.length > 0 ? `\n  Quote checks: ${event.citations.join("; ")}` : "";
      return { who: "Reader → Chat", what: `asked ${said(event.question)}; the AI ${outcome}`, details: (event.reply ? quote(event.reply) : "") + cites };
    }
    case "daemons": {
      const why = event.trigger === "asked" ? "the reader pressed React to notes" : "the reader paused";
      const head = event.error
        ? `run failed (${event.error}) after ${why}`
        : `ran after ${why}${event.mustPick ? " (must show a card)" : ""}: ${event.pick ? `${daemonName(event.pick)}'s card shown` : "no card shown"}, ${secs(event.ms)}`;
      const usage = [event.tokens && `panel ${tokens(event.tokens)}`, event.reviewerTokens && `reviewer ${tokens(event.reviewerTokens)}`].filter(Boolean).join("; ");
      const drafts = event.drafts.map((d) => {
        const name = daemonName(d.daemon);
        if (d.outcome === "passed") return `  - ${name}: passed`;
        const anchor = d.anchorFound ? `anchor ${said(d.anchor)}` : `anchor ${said(d.anchor)} not in the excerpt, fell back to its first line`;
        const fate = d.outcome === "dropped" ? `DROPPED (${d.reason})` : d.outcome === "picked" ? "SHOWN" : "kept as runner-up";
        return `  - ${name}: ${said(d.text)} (${d.text.trim().split(/\s+/).length} words; ${anchor}) → ${fate}`;
      });
      const details = [`  Excerpt the daemons read:`, quote(event.excerpt).replace(/^ {2}/gm, "    "), ...drafts, usage && `  Tokens: ${usage}`].filter(Boolean).join("\n");
      return { who: "Daemons", what: head, details };
    }
    case "promote":
      return { who: "Daemons", what: `showed a saved runner-up without a call: ${daemonName(event.daemon)} ${said(event.text)}` };
    case "card": {
      const verb = event.action === "highlight" ? "clicked (highlighting its words)" : event.action === "clear" ? "clicked again (clearing the highlight)" : "dismissed";
      return { who: "Reader", what: `${verb} ${daemonName(event.daemon)}'s card ${said(event.text)}` };
    }
    case "quiz":
      switch (event.action) {
        case "start":
          return { who: "Reader → Quiz", what: `started a quiz: ${event.setup}` };
        case "ready": {
          if (event.error) return { who: "Quiz agent", what: `failed after ${secs(event.ms)}: ${event.error}` };
          if (event.feedback) return { who: "Quiz agent", what: `declined in ${secs(event.ms)}: ${said(event.feedback)}` };
          const list = event.questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n");
          return { who: "Quiz agent", what: `wrote ${event.questions.length} questions in ${secs(event.ms)}${event.tokens ? ` (${tokens(event.tokens)})` : ""}`, details: list };
        }
        case "answer":
          return { who: "Reader", what: `answered ${said(event.question)} with ${said(event.answer)}: ${event.isRight ? "right" : "wrong"}` };
        case "grade":
          return {
            who: "Quiz grader",
            what: event.error ? `failed after ${secs(event.ms)}: ${event.error}` : `graded ${said(event.answer)} as ${event.verdict} in ${secs(event.ms)}: ${said(event.feedback)}`,
            details: `  Question: ${event.question}`,
          };
        case "end":
          return { who: "Reader", what: `finished the quiz: ${event.score}` };
      }
  }
}

// One session's events as markdown: a heading, then one entry per event in time order, each with
// who acted, what happened, and (indented) the text involved. Times are UTC.
export function renderTrace(batch: { browser: string; session: string }, events: TraceEvent[]): string {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const first = sorted[0]?.at ?? "";
  const lines = [
    `# Session ${batch.session.slice(0, 8)} · browser ${batch.browser.slice(0, 8)}`,
    "",
    `${first.slice(0, 10)}, times in UTC. ${sorted.length} events.`,
    "",
  ];
  let book: string | undefined;
  for (const event of sorted) {
    if (event.book && event.book !== book) {
      book = event.book;
      lines.push(`## In "${book}"`, "");
    }
    const { who, what, details } = entry(event);
    lines.push(`- **${time(event.at)} · ${who}** ${what}`);
    if (details) lines.push(details);
  }
  return lines.join("\n") + "\n";
}

// ---- Quiz events from state changes ----
// The page compares each quiz state with the one before (one book, no reload in between) and traces
// what the reader did: an answer to a choice or blanks question, and finishing. Free responses are
// traced with their grade instead (lib/converse-client).
type TraceBody<E = TraceEvent> = E extends TraceEvent ? Omit<E, "at" | "book"> : never;

export function quizEvents(before: QuizState, after: QuizState): TraceBody[] {
  if (after.stage === "setup" || before.stage === "setup" || before.questions !== after.questions) return [];
  const events: TraceBody[] = [];
  after.answers.forEach((answer, i) => {
    const question = after.questions[i];
    const isNew = answer !== null && before.answers[i] === null && question.kind !== "free-response";
    if (isNew) events.push({ kind: "quiz", action: "answer", question: question.question, answer: answerText(question, answer), isRight: isRightAnswer(question, answer) });
  });
  if (before.stage === "taking" && after.stage === "review")
    events.push({ kind: "quiz", action: "end", score: `${quizScore(after.questions, after.answers)} of ${after.questions.length} right` });
  return events;
}

function answerText(question: QuizQuestion, answer: QuizAnswer): string {
  if (question.kind === "fill-blanks") return Array.isArray(answer) ? question.blanks.map((b, i) => b.choices[answer[i]]?.text ?? "?").join(" / ") : "?";
  if (question.kind === "free-response") return typeof answer === "object" && answer !== null && !Array.isArray(answer) ? answer.text : "?";
  return typeof answer === "number" ? (question.choices[answer]?.text ?? "?") : "?";
}

// A quiz setup in words, e.g. "5 medium questions on Big ideas, Characters (multiple choice)".
export const describeSetup = (setup: QuizSetup) =>
  `${setup.count} ${setup.difficulty} questions on ${setup.topics.map((t) => QUIZ_TOPICS[t]?.label ?? t).join(", ")} (${setup.styles.map((s) => QUIZ_STYLES[s]?.label.toLowerCase() ?? s).join(", ")})`;

// The API's token counts in a trace's shape.
export function tokenUse(usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined): TokenUse | undefined {
  if (!usage) return undefined;
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    ...(usage.cache_read_input_tokens ? { cacheRead: usage.cache_read_input_tokens } : {}),
    ...(usage.cache_creation_input_tokens ? { cacheWrite: usage.cache_creation_input_tokens } : {}),
  };
}
