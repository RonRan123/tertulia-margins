import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { checkCitations, type CitationCheck } from "./citations.ts";
import { COMMANDS, isCommandName, type Command } from "./commands.ts";
import { ACTIONS, DAEMON_IDS, DAEMONS, isSameRemark, sentenceAround, type DaemonId, type DaemonsRequest, type MarginRemark, type Nugget } from "./daemons.ts";
import { LIMITS } from "./limits.ts";
import { isReferenceTooLong, pageCitePattern, parsePages, parsePassage, type BookPage } from "./passage.ts";
import { findExcerpt } from "./blocks.ts";
import type { DraftTrace } from "./trace.ts";
import { ANGLES, BLANK, BLANK_LIMITS, CHOICES_PER_QUESTION, checkQuestions, isAvoidList, isGradeRequest, isQuizSetup, pickAngles, type Angle, KEY_POINT_LIMITS, OPTIONS_PER_BLANK, QUIZ_STYLES, QUIZ_TOPICS, quizSchema, shuffleChoices, VERDICTS, type GradeRequest, type QuizQuestion, type QuizSetup, type Verdict } from "./quiz.ts";

// D12: one model for the MVP, low effort for a fast first token.
const MODEL = "claude-sonnet-5-5";

export type Book = { title?: string; author?: string; edition?: string };
export type Turn = { role: "user" | "assistant"; content: string };
// `question` is what the reader sees in chat (e.g. "/define gravitas"); `command` says what to run.
export type ConverseRequest = {
  passage: string;
  question: string; // "" for a daemon run
  notes?: string;
  history?: Turn[];
  book?: Book;
  command?: Command;
  daemons?: DaemonsRequest; // a daemon run (D37): no question, no history
  quiz?: QuizRequest; // a quiz to write (D42): no question, no history
  grade?: GradeRequest; // a free response to grade (D44): no question, no history
};
export type ConverseErrorCode = "rate_limited" | "auth_failed" | "overloaded" | "api_error";
export type ConverseRequestError =
  | "body_invalid"
  | "passage_missing"
  | "passage_empty" // only page markers: nothing to ground on
  | "reference_too_long" // over the D32 cap: refused before any paid call
  | "question_missing"
  | "question_too_long"
  | "notes_invalid"
  | "notes_too_long"
  | "history_invalid"
  | "history_too_long"
  | "book_invalid"
  | "command_invalid" // not { name, selection: string }
  | "command_unknown"
  | "selection_missing" // /define needs a selected word
  | "daemons_invalid" // not { excerpt: string, mustPick?: boolean }
  | "excerpt_missing"
  | "quiz_invalid" // not a QuizSetup
  | "grade_invalid" // not a GradeRequest
  | "request_conflict"; // more than one of a command, a daemon run, a quiz and a grading in one request

export type ConverseStats = {
  model: string;
  stopReason: string | null;
  ttftMs: number | null; // time to first text token; null if no text came back
  totalMs: number;
  usage: Anthropic.Beta.BetaUsage;
  reviewerUsage?: Anthropic.Beta.BetaUsage; // a daemon run's second call, or a quiz's top-up call, when it ran
  citations: CitationCheck[];
};

// A quiz to write: the setup, and the book's recent questions not to repeat (variety).
export type QuizRequest = QuizSetup & { avoid?: string[] };

// The wire format of POST /api/converse: one JSON object per line (NDJSON): a "text" event per
// delta (or one "daemons" event for a daemon run), then "done" or "error".
export type ConverseEvent =
  // A daemon run's result: every nugget that survived the checks, and the ones the reviewer picked to
  // show, as indexes into `nuggets`, best first (none: nothing worth interrupting the reader; D51:
  // several, each on different words). The rest are runners-up.
  // `drafts`: every daemon's draft and what became of it (passed, dropped and why, runner-up, picked), for traces (D48).
  | { type: "daemons"; picks: number[]; nuggets: Nugget[]; drafts: DraftTrace[] }
  // A quiz (D42): its questions, checked and shuffled, or (verdict "insufficient") why not.
  | { type: "quiz"; verdict: "ok" | "insufficient"; feedback: string; questions: QuizQuestion[] }
  // A free response's grade (D44): right, partly right or wrong, and one line on why.
  | { type: "grade"; verdict: Verdict; feedback: string }
  | { type: "text"; text: string }
  | { type: "done"; stats: ConverseStats }
  | { type: "error"; code: ConverseErrorCode };
// What converse() yields while it runs; the route forwards each one as is.
export type ConverseChunk = Extract<ConverseEvent, { type: "text" | "daemons" | "quiz" | "grade" }>;

// prompts/*.md are Ronith's: drop the owner comment before sending.
function readPrompt(file: string): string {
  const raw = readFileSync(join(process.cwd(), "prompts", file), "utf8");
  return raw.replace(/^\s*<!--[\s\S]*?-->\s*/, "");
}

// Fills system.md's {{placeholders}} from the book.
function systemPrompt(book: Book = {}): string {
  return readPrompt("system.md").replace(/\{\{(\w+)\}\}/g, (_, key: string) => book[key as keyof Book] ?? "unknown");
}

// Checks an untrusted JSON body (POST /api/converse) before any paid call is made.
export function parseConverseRequest(body: unknown): ConverseRequest | { error: ConverseRequestError } {
  if (!isRecord(body)) return { error: "body_invalid" };
  const { passage, question, notes, history, book, command, daemons, quiz, grade } = body;
  if (!isText(passage)) return { error: "passage_missing" };
  const isQuestionOptional = (daemons !== undefined || quiz !== undefined || grade !== undefined) && (question === undefined || typeof question === "string");
  if (!isText(question) && !isQuestionOptional) return { error: "question_missing" };
  if (parsePassage(passage).length === 0) return { error: "passage_empty" };
  if (isReferenceTooLong(passage)) return { error: "reference_too_long" };
  const isNotesValid = notes === undefined || typeof notes === "string";
  if (!isNotesValid) return { error: "notes_invalid" };
  if (typeof question === "string" && question.length > LIMITS.questionChars) return { error: "question_too_long" };
  if (typeof notes === "string" && notes.length > LIMITS.notesChars) return { error: "notes_too_long" };

  const isTurn = (t: unknown) => isRecord(t) && (t.role === "user" || t.role === "assistant") && isText(t.content);
  const isHistoryValid = history === undefined || (Array.isArray(history) && history.every(isTurn));
  if (!isHistoryValid) return { error: "history_invalid" };
  if (Array.isArray(history) && history.length > LIMITS.historyTurns) return { error: "history_too_long" };

  const isOptionalString = (v: unknown) => v === undefined || typeof v === "string";
  const isBookValid = book === undefined || (isRecord(book) && [book.title, book.author, book.edition].every(isOptionalString));
  if (!isBookValid) return { error: "book_invalid" };

  const isCommandShaped = command === undefined || (isRecord(command) && typeof command.selection === "string");
  if (!isCommandShaped) return { error: "command_invalid" };
  if (command !== undefined && !isCommandName(command.name)) return { error: "command_unknown" };
  const isSelectionMissing = command?.name === "define" && !isText(command.selection);
  if (isSelectionMissing) return { error: "selection_missing" };

  const kinds = [command, daemons, quiz, grade].filter((v) => v !== undefined).length;
  if (kinds > 1) return { error: "request_conflict" };
  const avoid = isRecord(quiz) ? quiz.avoid : undefined;
  const isQuizValid = isQuizSetup(quiz) && (avoid === undefined || isAvoidList(avoid));
  if (quiz !== undefined && !isQuizValid) return { error: "quiz_invalid" };
  if (grade !== undefined && !isGradeRequest(grade)) return { error: "grade_invalid" };
  const isRemark = (r: unknown) => isRecord(r) && DAEMON_IDS.includes(r.daemon as DaemonId) && typeof r.text === "string" && typeof r.anchor === "string";
  const isDaemonsShaped = daemons === undefined || (isRecord(daemons) && typeof daemons.excerpt === "string" &&
    (daemons.mustPick === undefined || typeof daemons.mustPick === "boolean") &&
    (daemons.margin === undefined || (Array.isArray(daemons.margin) && daemons.margin.length <= MAX_MARGIN && daemons.margin.every(isRemark))) &&
    (daemons.maxCards === undefined || (Number.isInteger(daemons.maxCards) && (daemons.maxCards as number) >= 1 && (daemons.maxCards as number) <= LIMITS.daemons.maxCardsPerRun)));
  if (!isDaemonsShaped) return { error: "daemons_invalid" };
  if (daemons !== undefined && !isText(daemons.excerpt)) return { error: "excerpt_missing" };

  return {
    passage,
    question: typeof question === "string" ? question : "",
    notes,
    history: ((history ?? []) as Turn[]).map(({ role, content }) => ({ role, content })),
    book: book === undefined ? undefined : pickBook(book as Book),
    ...(command !== undefined && { command: { name: command.name, selection: command.selection } as Command }),
    ...(daemons !== undefined && {
      daemons: {
        excerpt: daemons.excerpt as string,
        mustPick: daemons.mustPick === true,
        ...(Array.isArray(daemons.margin) && { margin: (daemons.margin as MarginRemark[]).map(({ daemon, text, anchor }) => ({ daemon, text, anchor })) }),
        ...(typeof daemons.maxCards === "number" && { maxCards: daemons.maxCards }),
      },
    }),
    ...(isQuizSetup(quiz) && {
      quiz: { topics: [...new Set(quiz.topics)], count: quiz.count, difficulty: quiz.difficulty, styles: [...new Set(quiz.styles)], ...(isAvoidList(avoid) && { avoid: [...avoid] }) },
    }),
    ...(isGradeRequest(grade) && { grade: { question: grade.question, modelAnswer: grade.modelAnswer, keyPoints: [...grade.keyPoints], answer: grade.answer } }),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const pickBook = ({ title, author, edition }: Book): Book => ({ title, author, edition });

// The single entry point: yields reply text as it streams (or a daemon run's one result), returns
// stats when done.
// Aborting `signal` (the client went away) stops the upstream request. Tests pass a fake `client`.
export async function* converse(
  request: ConverseRequest,
  signal?: AbortSignal,
  client: Anthropic = new Anthropic(), // reads ANTHROPIC_API_KEY
): AsyncGenerator<ConverseChunk, ConverseStats> {
  const start = performance.now();
  if (request.daemons) return yield* runDaemons(client, request, request.daemons, start, signal);
  if (request.quiz) return yield* runQuiz(client, request, request.quiz, start, signal);
  if (request.grade) return yield* runGrade(client, request, request.grade, start, signal);
  const { pages, system, messages, maxTokens } = buildContext(request);
  let ttftMs: number | null = null;
  let text = "";

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // retry a mis-flagged refusal on another model (D12)
    system,
    messages,
  }, { signal });

  for await (const event of stream) {
    if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
    ttftMs ??= performance.now() - start;
    text += event.delta.text;
    yield { type: "text", text: event.delta.text };
  }

  const final = await stream.finalMessage();
  return {
    model: final.model,
    stopReason: final.stop_reason,
    ttftMs,
    totalMs: performance.now() - start,
    usage: final.usage,
    citations: checkCitations(text, pages, request.notes),
  };
}

// A daemon run (D37): one panel call where every daemon drafts a nugget or passes, a grounding
// filter, then (only if there is a choice to make) a small reviewer call that picks one or none.
// Not streamed: nuggets are short and only the reviewer's pick is shown.
async function* runDaemons(
  client: Anthropic,
  request: ConverseRequest,
  run: DaemonsRequest,
  start: number,
  signal?: AbortSignal,
): AsyncGenerator<ConverseChunk, ConverseStats> {
  const { pages, system } = systemBlocks(request, "daemon-role.md");
  const panel = await client.beta.messages.create({
    model: MODEL,
    max_tokens: LIMITS.replyTokens.panel,
    output_config: { effort: "low", format: { type: "json_schema", schema: PANEL_SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: panelTurn(run.excerpt, run.margin) }],
  }, { signal });
  // Structured output cut off by max_tokens may still parse, but it is a failed run (Sonnet 5.5 guide).
  const isCutOff = panel.stop_reason === "max_tokens";
  const { nuggets, drafts } = isCutOff ? { nuggets: [], drafts: [] } : screenDrafts(jsonOf(panel), pages, request.notes ?? "", run.excerpt, run.margin);

  const { picks, usage: reviewerUsage } = await reviewNuggets(client, nuggets, pages, run, signal);
  const traced = drafts.map((d) => (d.card !== undefined && picks.includes(d.card) ? { ...d, outcome: "picked" as const } : d));
  yield { type: "daemons", picks, nuggets, drafts: traced };
  const picked = picks.length > 0 ? nuggets[picks[0]] : undefined;
  return {
    model: panel.model,
    stopReason: panel.stop_reason,
    ttftMs: null,
    totalMs: performance.now() - start,
    usage: panel.usage,
    ...(reviewerUsage && { reviewerUsage }),
    citations: picked ? checkCitations(picked.text, pages, request.notes) : [],
  };
}

const PANEL_SCHEMA = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          daemon: { type: "string", enum: DAEMON_IDS },
          pass: { type: "boolean" },
          nugget: { type: "string" },
          anchor: { type: "string" },
        },
        required: ["daemon", "pass", "nugget", "anchor"],
        additionalProperties: false,
      },
    },
  },
  required: ["drafts"],
  additionalProperties: false,
};

// The panel's user turn: each daemon (its action, then its persona), what's already in the margin
// (D51), then the excerpt. The shared rules and examples are the daemon role, in the system blocks.
export function panelTurn(excerpt: string, margin: MarginRemark[] = []): string {
  const daemons = DAEMON_IDS.map((id) => {
    const { name, action, promptFile } = DAEMONS[id];
    const actionPrompt = readPrompt(ACTIONS[action].promptFile).trim();
    return `<daemon id="${id}" name="${name}">\n<action>\n${actionPrompt}\n</action>\n<persona>\n${readPrompt(promptFile).trim()}\n</persona>\n</daemon>`;
  });
  const shown = margin.map((r) => `<remark daemon="${DAEMONS[r.daemon].name}" answers="${r.anchor.replace(/"/g, "'")}">\n${r.text}\n</remark>`);
  return [
    `<daemons>\n${daemons.join("\n\n")}\n</daemons>`,
    `<margin>\n${shown.join("\n") || "(empty)"}\n</margin>`,
    `<excerpt>\n${excerpt.trim()}\n</excerpt>`,
  ].join("\n\n");
}

const MAX_MARGIN = 100; // cards sent with a run, so no new remark repeats one (D51)
const DRAFTS_PER_DAEMON = 2; // D51: a daemon may answer two different parts of the excerpt

// The panel's drafts → nuggets worth reviewing: passes and blanks dropped, at most two per daemon
// (D51), and any whose quote fails the check (D38: cites a missing page, isn't on its page, or is in
// neither the book nor the notes), or that repeat a remark already in the margin or kept from this
// run (D51). An anchor is widened to its whole sentence (D51); one that isn't in the excerpt falls
// back to the excerpt's first line.
export function groundedNuggets(output: unknown, pages: BookPage[], notes: string, excerpt: string, margin: MarginRemark[] = []): Nugget[] {
  return screenDrafts(output, pages, notes, excerpt, margin).nuggets;
}

// The same screening, keeping every draft and what became of it, for traces (D48). A kept draft is
// "runner-up" here; runDaemons marks the reviewer's pick.
export function screenDrafts(output: unknown, pages: BookPage[], notes: string, excerpt: string, margin: MarginRemark[] = []): { nuggets: Nugget[]; drafts: DraftTrace[] } {
  const raw = isRecord(output) && Array.isArray(output.drafts) ? output.drafts : [];
  const firstLine = excerpt.trim().split("\n")[0].trim();
  const nuggets: Nugget[] = [];
  const drafts: DraftTrace[] = [];
  for (const draft of raw) {
    if (!isRecord(draft)) continue;
    const daemon = String(draft.daemon);
    const text = isText(draft.nugget) ? draft.nugget.trim() : "";
    const anchor = typeof draft.anchor === "string" ? draft.anchor.trim() : "";
    const anchorFound = anchor !== "" && findExcerpt(excerpt, anchor) !== undefined;
    const traced = (outcome: DraftTrace["outcome"], reason?: string, card?: number) =>
      drafts.push({ daemon, outcome, text, anchor, anchorFound, ...(reason && { reason }), ...(card !== undefined && { card }) });
    if (draft.pass === true || text === "") {
      traced("passed");
      continue;
    }
    const isKnown = DAEMON_IDS.includes(daemon as DaemonId) && nuggets.filter((n) => n.daemon === daemon).length < DRAFTS_PER_DAEMON;
    if (!isKnown) {
      traced("dropped", "unknown_or_repeated_daemon");
      continue;
    }
    if (margin.some((r) => isSameRemark(r.text, text))) {
      traced("dropped", "repeats_margin");
      continue;
    }
    if (nuggets.some((n) => isSameRemark(n.text, text))) {
      traced("dropped", "repeats_draft");
      continue;
    }
    const failed = checkCitations(text, pages, notes).find((c) => c.status !== "ok");
    if (failed) {
      traced("dropped", failed.status);
      continue;
    }
    nuggets.push({ daemon: daemon as DaemonId, text, anchor: anchorFound ? sentenceAround(excerpt, anchor) : firstLine });
    traced("runner-up", undefined, nuggets.length - 1);
  }
  return { nuggets, drafts };
}

// The reviewer sees no book: only the excerpt, the nuggets and the pages they cite. It picks up to
// `maxCards` (D51), best first, or none. No call when there is nothing to choose: no nuggets, or one
// that must be shown anyway. Our code keeps the picks on different words of the notes.
async function reviewNuggets(
  client: Anthropic,
  nuggets: Nugget[],
  pages: BookPage[],
  run: DaemonsRequest,
  signal?: AbortSignal,
): Promise<{ picks: number[]; usage?: Anthropic.Beta.BetaUsage }> {
  if (nuggets.length === 0) return { picks: [] };
  if (nuggets.length === 1 && run.mustPick) return { picks: [0] };
  const maxCards = run.maxCards ?? 1;
  const ids = nuggets.map((_, i) => String(i + 1));
  const schema = {
    type: "object",
    properties: { picks: { type: "array", items: { type: "string", enum: ids }, ...(run.mustPick && { minItems: 1 }) } },
    required: ["picks"],
    additionalProperties: false,
  };
  const review = await client.beta.messages.create({
    model: MODEL,
    max_tokens: LIMITS.replyTokens.reviewer,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: readPrompt("daemon-reviewer.md").trim(),
    messages: [{ role: "user", content: reviewerTurn(nuggets, pages, run) }],
  }, { signal });
  const answer = jsonOf(review);
  const chosen = isRecord(answer) && Array.isArray(answer.picks) ? answer.picks.map((id) => ids.indexOf(String(id))).filter((i) => i >= 0) : [];
  const picks = distinctPicks(chosen, nuggets, maxCards);
  return { picks: picks.length === 0 && run.mustPick ? [0] : picks, usage: review.usage };
}

// Picks in order, each once, at most `max`, none on the same words as an earlier one (overlapping anchors).
export function distinctPicks(chosen: number[], nuggets: Nugget[], max: number): number[] {
  const picks: number[] = [];
  for (const i of chosen) {
    const anchor = nuggets[i].anchor;
    const overlaps = picks.some((p) => nuggets[p].anchor.includes(anchor) || anchor.includes(nuggets[p].anchor));
    if (!picks.includes(i) && !overlaps && picks.length < max) picks.push(i);
  }
  return picks;
}

export function reviewerTurn(nuggets: Nugget[], pages: BookPage[], run: DaemonsRequest): string {
  const candidates = nuggets.map((n, i) => {
    const { name, action } = DAEMONS[n.daemon];
    const beyond = ACTIONS[action].isBeyondBook ? ' beyond_the_book="true"' : "";
    return `<candidate id="${i + 1}" name="${name}"${beyond} answers="${n.anchor.replace(/"/g, "'")}">\n${n.text}\n</candidate>`;
  });
  const cited = citedPages(nuggets.map((n) => n.text), pages);
  return [
    `<excerpt>\n${run.excerpt.trim()}\n</excerpt>`,
    ...candidates,
    `<cited>\n${cited}\n</cited>`,
    `<max_picks>${run.maxCards ?? 1}</max_picks>`,
    `<must_pick>${run.mustPick === true}</must_pick>`,
  ].join("\n\n");
}

// A quiz (D42): one call writes the questions as JSON (or says why the material can't support
// them); our code checks each one and shuffles its choices. If some fail, one more call asks for
// replacements, told what went wrong; a quiz still short after that runs with what passed.
async function* runQuiz(
  client: Anthropic,
  request: ConverseRequest,
  setup: QuizRequest,
  start: number,
  signal?: AbortSignal,
): AsyncGenerator<ConverseChunk, ConverseStats> {
  const { pages, system } = systemBlocks(request, "quiz-maker.md");
  const notes = request.notes ?? "";
  const ask = (turn: string) =>
    client.beta.messages.create({
      model: MODEL,
      max_tokens: LIMITS.replyTokens.quiz,
      output_config: { effort: "medium", format: { type: "json_schema", schema: quizSchema(setup) } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: turn }],
    }, { signal });

  const first = await ask(quizTurn(setup, pickAngles(setup.count)));
  // Structured output cut off by max_tokens may still parse, but it is a failed run (Sonnet 5.5 guide).
  const output = first.stop_reason === "max_tokens" ? undefined : jsonOf(first);
  const isInsufficient = isRecord(output) && output.verdict === "insufficient";
  const feedback = isRecord(output) && typeof output.feedback === "string" ? output.feedback.trim() : "";
  const checked = checkQuestions(isInsufficient ? undefined : output, setup, pages, notes);
  let questions = checked.questions;
  let topUpUsage: Anthropic.Beta.BetaUsage | undefined;

  const missing = setup.count - questions.length;
  if (!isInsufficient && output !== undefined && missing > 0) {
    const message = await ask(quizTurn(setup, pickAngles(missing), { missing, kept: questions, rejected: checked.rejected }));
    topUpUsage = message.usage;
    const more = message.stop_reason === "max_tokens" ? undefined : jsonOf(message);
    const isMoreOk = isRecord(more) && more.verdict === "ok";
    if (isMoreOk) questions = [...questions, ...checkQuestions(more, setup, pages, notes).questions].slice(0, setup.count);
  }

  const isFailed = !isInsufficient && questions.length === 0;
  yield {
    type: "quiz",
    verdict: isInsufficient || isFailed ? "insufficient" : "ok",
    feedback: isInsufficient
      ? feedback || "There isn't enough material for this quiz. Try fewer questions or another topic."
      : isFailed
        ? "The quiz couldn't be written this time. Try again, or try fewer questions."
        : "",
    questions: isInsufficient ? [] : questions.map((q) => shuffleChoices(q)),
  };
  return {
    model: first.model,
    stopReason: first.stop_reason,
    ttftMs: null,
    totalMs: performance.now() - start,
    usage: first.usage,
    ...(topUpUsage && { reviewerUsage: topUpUsage }),
    citations: [],
  };
}

// The quiz agent's user turn: the request, and for a top-up, the questions kept (not to repeat)
// and the ones set aside, with why.
// Variety: each question's angle (chosen by our code, at random) and the book's recent questions.
export function quizTurn(
  setup: QuizRequest,
  angles: Angle[],
  topUp?: { missing: number; kept: QuizQuestion[]; rejected: { question: string; reason: string }[] },
): string {
  const topics = setup.topics.map((t) => `- ${t} ("${QUIZ_TOPICS[t].label}"): ${QUIZ_TOPICS[t].ask}`).join("\n");
  const kinds = {
    "multiple-choice": `multiple-choice (exactly ${CHOICES_PER_QUESTION} choices)`,
    "true-false": "true-false (a statement with the choices True and False)",
    "fill-blanks": `fill-blanks (one sentence with ${BLANK_LIMITS.min}–${BLANK_LIMITS.max} blanks marked ${BLANK}, each with ${OPTIONS_PER_BLANK} options)`,
    "free-response": `free-response (a model answer and ${KEY_POINT_LIMITS.min}–${KEY_POINT_LIMITS.max} key points)`,
  };
  const styles = setup.styles.map((s) => `${kinds[s]} ("${QUIZ_STYLES[s].label}")`);
  const style = styles.length === 1 ? `${styles[0]} for every question` : `a mix: choose per question among ${styles.join(", ")}, using each at least once when there are enough questions`;
  const count = topUp ? topUp.missing : setup.count;
  const request = [
    "<quiz_request>",
    `<topics>\n${topics}\n</topics>`,
    `<questions>${count}</questions>`,
    `<difficulty>${setup.difficulty}</difficulty>`,
    `<style>${style}</style>`,
    `<angles>\n${angles.map((a, i) => `${i + 1}. ${a}: ${ANGLES[a]}`).join("\n")}\n</angles>`,
    ...(setup.avoid?.length ? [`<already_asked>\n${setup.avoid.map((q) => `- ${q}`).join("\n")}\n</already_asked>`] : []),
    "</quiz_request>",
  ].join("\n");
  if (!topUp) return request;
  const kept = topUp.kept.map((q) => `- ${q.question}`).join("\n");
  const rejected = topUp.rejected.map((r) => `- ${r.question} (${r.reason})`).join("\n");
  return [
    request,
    `<already_in_the_quiz>\n${kept || "(none)"}\n</already_in_the_quiz>`,
    `<set_aside>\n${rejected || "(none)"}\n</set_aside>`,
    `These questions were set aside for the reasons given. Write ${count} new question${count === 1 ? "" : "s"} on words or ideas not already in the quiz, avoiding those problems.`,
  ].join("\n\n");
}

// Every page the texts cite ([pp. 3–4] spelled out), in book order, as <page> blocks.
function citedPages(texts: string[], pages: BookPage[]): string {
  const cites = texts.flatMap((text) => [...text.matchAll(pageCitePattern())].map((m) => ({ from: m[2].toLowerCase(), to: (m[3] ?? m[2]).toLowerCase() })));
  const isCited = (page?: string) =>
    page !== undefined && cites.some(({ from, to }) => page === from || page === to || (Number(page) >= Number(from) && Number(page) <= Number(to)));
  return pages.filter((p) => isCited(p.page)).map((p) => `<page n="${p.page}">\n${p.text}\n</page>`).join("\n\n");
}

// A free response's grade (D44): one small call without the book. The grader sees the question,
// the model answer, the key points, the pages they cite and the reader's answer, and replies with a
// verdict and one line of feedback (JSON). No usable reply: no event, so the client reports it.
async function* runGrade(
  client: Anthropic,
  request: ConverseRequest,
  grade: GradeRequest,
  start: number,
  signal?: AbortSignal,
): AsyncGenerator<ConverseChunk, ConverseStats> {
  const message = await client.beta.messages.create({
    model: MODEL,
    max_tokens: LIMITS.replyTokens.grade,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: { type: "object", properties: { verdict: { type: "string", enum: VERDICTS }, feedback: { type: "string" } }, required: ["verdict", "feedback"], additionalProperties: false },
      },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: readPrompt("quiz-grader.md").trim(),
    messages: [{ role: "user", content: gradeTurn(grade, parsePages(request.passage)) }],
  }, { signal });
  const answer = message.stop_reason === "max_tokens" ? undefined : jsonOf(message);
  const isGraded = isRecord(answer) && VERDICTS.includes(answer.verdict as Verdict) && isText(answer.feedback);
  if (isGraded) yield { type: "grade", verdict: answer.verdict as Verdict, feedback: (answer.feedback as string).trim() };
  return { model: message.model, stopReason: message.stop_reason, ttftMs: null, totalMs: performance.now() - start, usage: message.usage, citations: [] };
}

export function gradeTurn({ question, modelAnswer, keyPoints, answer }: GradeRequest, pages: BookPage[]): string {
  return [
    `<question>\n${question.trim()}\n</question>`,
    `<model_answer>\n${modelAnswer.trim()}\n</model_answer>`,
    `<key_points>\n${keyPoints.map((p) => `- ${p.trim()}`).join("\n")}\n</key_points>`,
    `<cited>\n${citedPages([modelAnswer, ...keyPoints], pages)}\n</cited>`,
    `<answer>\n${answer.trim()}\n</answer>`,
  ].join("\n\n");
}

// A structured-output reply's JSON, or undefined if it isn't any (cut off, refused).
function jsonOf(message: Anthropic.Beta.BetaMessage): unknown {
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// What the model sees, ordered stable to volatile (DESIGN §6.3) so a cache prefix stays valid:
// the book, the role, the reader's notes (only if any), then the conversation and the question.
// A command's instructions go in the last user turn, not the system blocks, so that prefix is the
// same for chat and every command. That turn is <command>prompt file</command>, <selection> (if
// any), then the question as shown in chat. History holds only what the reader saw, so it stays plain.
export function buildContext(request: ConverseRequest) {
  const { pages, system } = systemBlocks(request);
  const messages: Turn[] = [...(request.history ?? []), { role: "user", content: userTurn(request) }];
  const maxTokens = request.command ? COMMANDS[request.command.name].maxTokens : LIMITS.replyTokens.chat;
  return { pages, system, messages, maxTokens };
}

// D38: the book comes first (long documents above instructions; the prefix every call shares), split
// at its page markers so the AI cites pages it can see. Then the role: chat's system.md, or the
// daemon role. Then the reader's notes, if any.
function systemBlocks(request: ConverseRequest, rolePrompt = "system.md") {
  const pages = parsePages(request.passage);
  const book = pages.map((p) => (p.page === undefined ? p.text : `<page n="${p.page}">\n${p.text}\n</page>`)).join("\n\n");
  const notes = request.notes?.trim() ?? "";
  const role = rolePrompt === "system.md" ? systemPrompt(request.book) : readPrompt(rolePrompt).trim();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: `<book_text>\n${book}\n</book_text>` },
    { type: "text", text: role },
  ];
  if (notes !== "") system.push({ type: "text", text: `<notes>\n${notes}\n</notes>` });
  return { pages, system };
}

function userTurn({ question, command }: ConverseRequest): string {
  if (!command) return question;
  const instructions = `<command>\n${readPrompt(COMMANDS[command.name].promptFile).trim()}\n</command>`;
  const selection = command.selection.trim();
  const selectionBlock = selection && `<selection>\n${selection}\n</selection>`;
  return [instructions, selectionBlock, question].filter(Boolean).join("\n\n");
}

// SDK errors → self-describing codes the UI can show.
export function errorCode(error: unknown): ConverseErrorCode {
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.AuthenticationError) return "auth_failed";
  // A mid-stream overloaded error arrives as an SSE event: no HTTP status, only the error type.
  const isOverloaded = error instanceof Anthropic.APIError && (error.status === 529 || error.type === "overloaded_error");
  if (isOverloaded) return "overloaded";
  return "api_error";
}
