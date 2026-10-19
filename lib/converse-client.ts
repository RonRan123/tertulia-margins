// Browser-only: the one client for POST /api/converse. Chat (and Define) stream through
// streamMessage; a daemon run goes through runDaemons, a quiz through makeQuiz, a free response's
// grade through gradeAnswer. The NDJSON parsing
// lives in one place.
import type { ConverseEvent, ConverseRequest, ConverseStats } from "@/core/converse.ts";
import { citedPages, parsePassage } from "@/core/passage.ts";
import type { DaemonId, Nugget } from "@/core/daemons.ts";
import type { QuizQuestion, Verdict } from "@/core/quiz.ts";
import { LIMITS } from "@/core/limits.ts";
import { loadDaemonRunsToday, loadRepliesToday, localDay, recordDaemonRun, recordReply, type ChatMessage } from "@/core/store.ts";
import { describeSetup, tokenUse, type DraftTrace } from "@/core/trace.ts";
import { trace } from "./trace.ts";

export type MessagePatch = (message: ChatMessage) => ChatMessage;

// Streams one reply into one assistant message: `update` applies each change to that message (the
// caller targets it, e.g. the last chat message). The message always ends with isStreaming false
// and its page labels, or with an error code; this never throws.
export async function streamMessage(
  body: ConverseRequest,
  update: (patch: MessagePatch) => void,
  options: { signal?: AbortSignal } = {},
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
  // D48: the question, the whole reply and its quote checks go in the trace once it ends.
  const start = performance.now();
  const traced: { reply: string; error?: string; stats?: ConverseStats } = { reply: "" };
  try {
    const requestError = await streamReply(body, options.signal, (event) => {
      if (event.type === "text") traced.reply += event.text;
      if (event.type === "done") traced.stats = event.stats;
      if (event.type === "error") traced.error = event.code;
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
    traced.error ??= requestError;
  } catch {
    update((m) => ({ ...m, error: "network_error" }));
    traced.error = "network_error";
  }
  update((m) => ({ ...m, pages: citedPages(m.content, paragraphs), isStreaming: false }));
  trace({
    kind: "chat",
    question: body.command ? `/${body.command.name} ${body.command.selection}` : body.question,
    reply: traced.reply,
    ms: Math.round(performance.now() - start),
    tokens: tokenUse(traced.stats?.usage),
    citations: (traced.stats?.citations ?? []).map((c) => `“${c.quote}” ${c.status}`),
    ...(traced.error && { error: traced.error }),
  });
}

// One daemon run (D37): the reviewer's picks (indexes into the nuggets, D51) and the nuggets, or an error code. Runs count against
// their own daily cap (LIMITS.daemons.dailyRuns), apart from chat replies. Never throws.
// `trigger`: why the run started, for the trace (D48).
export async function runDaemons(
  body: ConverseRequest,
  signal: AbortSignal,
  trigger: "pause" | "asked" = "pause",
): Promise<{ picks: number[]; nuggets: Nugget[] } | { error: string }> {
  const day = localDay(new Date());
  if (loadDaemonRunsToday(window.localStorage, day) >= LIMITS.daemons.dailyRuns) return { error: "daemon_limit" };
  recordDaemonRun(window.localStorage, day);
  const start = performance.now();
  let result: { picks: number[]; nuggets: Nugget[] } | undefined;
  let drafts: DraftTrace[] = [];
  let stats: ConverseStats | undefined;
  let error: string | undefined;
  try {
    const requestError = await streamReply(body, signal, (event) => {
      if (event.type === "daemons") {
        result = { picks: event.picks, nuggets: event.nuggets };
        drafts = event.drafts ?? [];
      }
      if (event.type === "done") stats = event.stats;
      if (event.type === "error") error = event.code;
    });
    error ??= requestError;
  } catch {
    error = signal.aborted ? "aborted" : "network_error";
  }
  if (error !== "aborted")
    trace({
      kind: "daemons",
      trigger,
      excerpt: body.daemons?.excerpt ?? "",
      mustPick: body.daemons?.mustPick === true,
      drafts,
      picks: (result?.picks ?? []).map((i) => result!.nuggets[i]?.daemon).filter((d): d is DaemonId => d !== undefined),
      ms: Math.round(performance.now() - start),
      tokens: tokenUse(stats?.usage),
      reviewerTokens: tokenUse(stats?.reviewerUsage),
      ...(error && { error }),
    });
  return result && !error ? result : { error: error ?? "empty_reply" };
}

// One quiz (D42): its questions, or the agent's reason there aren't any, or an error code. A quiz
// counts as one of the day's AI replies (D35). Never throws.
export async function makeQuiz(
  body: ConverseRequest,
  signal: AbortSignal,
): Promise<{ verdict: "ok" | "insufficient"; feedback: string; questions: QuizQuestion[] } | { error: string }> {
  const day = localDay(new Date());
  if (loadRepliesToday(window.localStorage, day) >= LIMITS.dailyReplies) return { error: "daily_limit" };
  recordReply(window.localStorage, day);
  if (body.quiz) trace({ kind: "quiz", action: "start", setup: describeSetup(body.quiz) });
  const start = performance.now();
  let result: { verdict: "ok" | "insufficient"; feedback: string; questions: QuizQuestion[] } | undefined;
  let stats: ConverseStats | undefined;
  let error: string | undefined;
  try {
    const requestError = await streamReply(body, signal, (event) => {
      if (event.type === "quiz") result = { verdict: event.verdict, feedback: event.feedback, questions: event.questions };
      if (event.type === "done") stats = event.stats;
      if (event.type === "error") error = event.code;
    });
    error ??= requestError;
  } catch {
    error = signal.aborted ? "aborted" : "network_error";
  }
  trace({
    kind: "quiz",
    action: "ready",
    ms: Math.round(performance.now() - start),
    tokens: tokenUse(stats?.usage),
    questions: result?.questions.map((q) => q.question) ?? [],
    ...(result?.verdict === "insufficient" && { feedback: result.feedback }),
    ...(error && { error }),
  });
  return result && !error ? result : { error: error ?? "empty_reply" };
}

// One free response's grade (D44): a verdict and one line of feedback, or an error code. Each
// grading counts as one of the day's AI replies (Ronith). Never throws.
export async function gradeAnswer(body: ConverseRequest, signal: AbortSignal): Promise<{ verdict: Verdict; feedback: string } | { error: string }> {
  const day = localDay(new Date());
  if (loadRepliesToday(window.localStorage, day) >= LIMITS.dailyReplies) return { error: "daily_limit" };
  recordReply(window.localStorage, day);
  const start = performance.now();
  let result: { verdict: Verdict; feedback: string } | undefined;
  let error: string | undefined;
  try {
    const requestError = await streamReply(body, signal, (event) => {
      if (event.type === "grade") result = { verdict: event.verdict, feedback: event.feedback };
      if (event.type === "error") error = event.code;
    });
    error ??= requestError;
  } catch {
    error = signal.aborted ? "aborted" : "network_error";
  }
  trace({
    kind: "quiz",
    action: "grade",
    question: body.grade?.question ?? "",
    answer: body.grade?.answer ?? "",
    verdict: result?.verdict ?? "",
    feedback: result?.feedback ?? "",
    ms: Math.round(performance.now() - start),
    ...(error && { error }),
  });
  return result && !error ? result : { error: error ?? "empty_reply" };
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
