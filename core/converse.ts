import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { checkCitations, type CitationCheck } from "./citations.ts";
import { COMMANDS, isCommandName, type Command } from "./commands.ts";
import { ACTIONS, DAEMON_IDS, DAEMONS, type DaemonId, type DaemonsRequest, type Nugget } from "./daemons.ts";
import { LIMITS } from "./limits.ts";
import { isReferenceTooLong, pageCitePattern, parsePages, parsePassage, type BookPage } from "./passage.ts";
import { findExcerpt } from "./blocks.ts";

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
  | "request_conflict"; // a command and a daemon run in one request

export type ConverseStats = {
  model: string;
  stopReason: string | null;
  ttftMs: number | null; // time to first text token; null if no text came back
  totalMs: number;
  usage: Anthropic.Beta.BetaUsage;
  reviewerUsage?: Anthropic.Beta.BetaUsage; // a daemon run's second call, when it ran
  citations: CitationCheck[];
};

// The wire format of POST /api/converse: one JSON object per line (NDJSON): a "text" event per
// delta (or one "daemons" event for a daemon run), then "done" or "error".
export type ConverseEvent =
  // A daemon run's result: every nugget that survived the grounding check, and the one the reviewer
  // picked to show (null: nothing worth interrupting the reader). The rest are runners-up.
  | { type: "daemons"; pick: DaemonId | null; nuggets: Nugget[] }
  | { type: "text"; text: string }
  | { type: "done"; stats: ConverseStats }
  | { type: "error"; code: ConverseErrorCode };
// What converse() yields while it runs; the route forwards each one as is.
export type ConverseChunk = Extract<ConverseEvent, { type: "text" | "daemons" }>;

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
  const { passage, question, notes, history, book, command, daemons } = body;
  if (!isText(passage)) return { error: "passage_missing" };
  const isQuestionOptional = daemons !== undefined && (question === undefined || typeof question === "string");
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

  if (daemons !== undefined && command !== undefined) return { error: "request_conflict" };
  const isDaemonsShaped = daemons === undefined || (isRecord(daemons) && typeof daemons.excerpt === "string" &&
    (daemons.mustPick === undefined || typeof daemons.mustPick === "boolean"));
  if (!isDaemonsShaped) return { error: "daemons_invalid" };
  if (daemons !== undefined && !isText(daemons.excerpt)) return { error: "excerpt_missing" };

  return {
    passage,
    question: typeof question === "string" ? question : "",
    notes,
    history: ((history ?? []) as Turn[]).map(({ role, content }) => ({ role, content })),
    book: book === undefined ? undefined : pickBook(book as Book),
    ...(command !== undefined && { command: { name: command.name, selection: command.selection } as Command }),
    ...(daemons !== undefined && { daemons: { excerpt: daemons.excerpt as string, mustPick: daemons.mustPick === true } }),
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
    messages: [{ role: "user", content: panelTurn(run.excerpt) }],
  }, { signal });
  // Structured output cut off by max_tokens may still parse, but it is a failed run (Sonnet 5.5 guide).
  const isCutOff = panel.stop_reason === "max_tokens";
  const nuggets = isCutOff ? [] : groundedNuggets(jsonOf(panel), pages, request.notes ?? "", run.excerpt);

  const { pick, usage: reviewerUsage } = await reviewNuggets(client, nuggets, pages, run, signal);
  yield { type: "daemons", pick, nuggets };
  const picked = nuggets.find((n) => n.daemon === pick);
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

// The panel's user turn: each daemon (its action, then its persona), then the excerpt. The shared
// rules and examples are the daemon role, in the system blocks.
export function panelTurn(excerpt: string): string {
  const daemons = DAEMON_IDS.map((id) => {
    const { name, action, promptFile } = DAEMONS[id];
    const actionPrompt = readPrompt(ACTIONS[action].promptFile).trim();
    return `<daemon id="${id}" name="${name}">\n<action>\n${actionPrompt}\n</action>\n<persona>\n${readPrompt(promptFile).trim()}\n</persona>\n</daemon>`;
  });
  return [`<daemons>\n${daemons.join("\n\n")}\n</daemons>`, `<excerpt>\n${excerpt.trim()}\n</excerpt>`].join("\n\n");
}

// The panel's drafts → nuggets worth reviewing: passes and blanks dropped, one per daemon, and any
// whose quote fails the check (D38: cites a missing page, isn't on its page, or is in neither the
// book nor the notes). An anchor that isn't in the excerpt falls back to the excerpt's first line.
export function groundedNuggets(output: unknown, pages: BookPage[], notes: string, excerpt: string): Nugget[] {
  const drafts = isRecord(output) && Array.isArray(output.drafts) ? output.drafts : [];
  const firstLine = excerpt.trim().split("\n")[0].trim();
  const nuggets: Nugget[] = [];
  for (const draft of drafts) {
    if (!isRecord(draft) || draft.pass === true || !isText(draft.nugget)) continue;
    const daemon = draft.daemon as DaemonId;
    const isKnown = DAEMON_IDS.includes(daemon) && !nuggets.some((n) => n.daemon === daemon);
    if (!isKnown) continue;
    const text = draft.nugget.trim();
    const isInvented = checkCitations(text, pages, notes).some((c) => c.status !== "ok");
    if (isInvented) continue;
    const anchor = typeof draft.anchor === "string" && findExcerpt(excerpt, draft.anchor) ? draft.anchor.trim() : firstLine;
    nuggets.push({ daemon, text, anchor });
  }
  return nuggets;
}

// The reviewer sees no book: only the excerpt, the nuggets and the pages they cite. No call
// when there is nothing to choose: no nuggets, or one that must be shown anyway.
async function reviewNuggets(
  client: Anthropic,
  nuggets: Nugget[],
  pages: BookPage[],
  run: DaemonsRequest,
  signal?: AbortSignal,
): Promise<{ pick: DaemonId | null; usage?: Anthropic.Beta.BetaUsage }> {
  if (nuggets.length === 0) return { pick: null };
  if (nuggets.length === 1 && run.mustPick) return { pick: nuggets[0].daemon };
  const choices = [...nuggets.map((n) => n.daemon), ...(run.mustPick ? [] : ["none"])];
  const review = await client.beta.messages.create({
    model: MODEL,
    max_tokens: LIMITS.replyTokens.reviewer,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: { type: "object", properties: { pick: { type: "string", enum: choices } }, required: ["pick"], additionalProperties: false } },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: readPrompt("daemon-reviewer.md").trim(),
    messages: [{ role: "user", content: reviewerTurn(nuggets, pages, run) }],
  }, { signal });
  const answer = jsonOf(review);
  const pick = isRecord(answer) ? nuggets.find((n) => n.daemon === answer.pick)?.daemon ?? null : null;
  return { pick: pick ?? (run.mustPick ? nuggets[0].daemon : null), usage: review.usage };
}

export function reviewerTurn(nuggets: Nugget[], pages: BookPage[], run: DaemonsRequest): string {
  const candidates = nuggets.map((n) => {
    const { name, action } = DAEMONS[n.daemon];
    const beyond = ACTIONS[action].isBeyondBook ? ' beyond_the_book="true"' : "";
    return `<candidate id="${n.daemon}" name="${name}"${beyond}>\n${n.text}\n</candidate>`;
  });
  // Every page any nugget cites ([pp. 3–4] spelled out), in book order.
  const cites = nuggets.flatMap(({ text }) => [...text.matchAll(pageCitePattern())].map((m) => ({ from: m[2].toLowerCase(), to: (m[3] ?? m[2]).toLowerCase() })));
  const isCited = (page?: string) =>
    page !== undefined && cites.some(({ from, to }) => page === from || page === to || (Number(page) >= Number(from) && Number(page) <= Number(to)));
  const cited = pages.filter((p) => isCited(p.page)).map((p) => `<page n="${p.page}">\n${p.text}\n</page>`).join("\n\n");
  return [
    `<excerpt>\n${run.excerpt.trim()}\n</excerpt>`,
    ...candidates,
    `<cited>\n${cited}\n</cited>`,
    `<must_pick>${run.mustPick === true}</must_pick>`,
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
