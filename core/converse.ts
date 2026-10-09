import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { checkCitations, type CitationCheck } from "./citations.ts";
import { COMMANDS, isCommandName, type Command } from "./commands.ts";
import { parsePassage } from "./passage.ts";
import { isReactionKind, parseRouterKind, REACTIONS, ROUTER, type ReactionKind, type ReactionRequest } from "./reactions.ts";

// D12: one model for the MVP, low effort for a fast first token.
const MODEL = "claude-sonnet-5-5";
const CHAT_MAX_TOKENS = 16000; // a command uses its row's maxTokens instead

export type Book = { title?: string; author?: string; edition?: string };
export type Turn = { role: "user" | "assistant"; content: string };
// `question` is what the reader sees in chat (e.g. "/define gravitas"); `command` says what to run.
// `reaction` is a margin reaction (D18, D20): its first call has no history and no question; a reply
// in its thread sends the kind it got, the thread so far as `history` (starting with the AI's
// reaction) and the reader's reply as `question`.
export type ConverseRequest = {
  passage: string;
  question: string; // "" for a first reaction
  notes?: string;
  history?: Turn[];
  book?: Book;
  command?: Command;
  reaction?: ReactionRequest;
};
export type ConverseErrorCode = "rate_limited" | "auth_failed" | "overloaded" | "api_error";
export type ConverseRequestError =
  | "body_invalid"
  | "passage_missing"
  | "passage_empty" // only page markers: nothing to ground on
  | "question_missing"
  | "notes_invalid"
  | "history_invalid"
  | "book_invalid"
  | "command_invalid" // not { name, selection: string }
  | "command_unknown"
  | "selection_missing" // /define needs a selected word
  | "reaction_invalid" // not { excerpt: string, kind? }
  | "excerpt_missing"
  | "kind_unknown"
  | "kind_missing" // a thread reply must say its kind: the router only runs on a first reaction
  | "request_conflict"; // a command and a reaction in one request

export type ConverseStats = {
  model: string;
  stopReason: string | null;
  ttftMs: number | null; // time to first text token; null if no text came back
  totalMs: number;
  usage: Anthropic.Beta.BetaUsage;
  citations: CitationCheck[];
};

// The wire format of POST /api/converse: one JSON object per line (NDJSON): for a reaction a
// "kind" event first, then a "text" event per delta, then "done" or "error".
export type ConverseEvent =
  | { type: "kind"; kind: ReactionKind }
  | { type: "text"; text: string }
  | { type: "done"; stats: ConverseStats }
  | { type: "error"; code: ConverseErrorCode };
// What converse() yields while it runs; the route forwards each one as is.
export type ConverseChunk = Extract<ConverseEvent, { type: "kind" | "text" }>;

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
  const { passage, question, notes, history, book, command, reaction } = body;
  if (!isText(passage)) return { error: "passage_missing" };
  const isFirstReaction = reaction !== undefined && !(Array.isArray(history) && history.length > 0);
  const isQuestionOptional = isFirstReaction && (question === undefined || typeof question === "string");
  if (!isText(question) && !isQuestionOptional) return { error: "question_missing" };
  if (parsePassage(passage).length === 0) return { error: "passage_empty" };
  const isNotesValid = notes === undefined || typeof notes === "string";
  if (!isNotesValid) return { error: "notes_invalid" };

  const isTurn = (t: unknown) => isRecord(t) && (t.role === "user" || t.role === "assistant") && isText(t.content);
  const isHistoryValid = history === undefined || (Array.isArray(history) && history.every(isTurn));
  if (!isHistoryValid) return { error: "history_invalid" };

  const isOptionalString = (v: unknown) => v === undefined || typeof v === "string";
  const isBookValid = book === undefined || (isRecord(book) && [book.title, book.author, book.edition].every(isOptionalString));
  if (!isBookValid) return { error: "book_invalid" };

  const isCommandShaped = command === undefined || (isRecord(command) && typeof command.selection === "string");
  if (!isCommandShaped) return { error: "command_invalid" };
  if (command !== undefined && !isCommandName(command.name)) return { error: "command_unknown" };
  const isSelectionMissing = command?.name === "define" && !isText(command.selection);
  if (isSelectionMissing) return { error: "selection_missing" };

  if (reaction !== undefined && command !== undefined) return { error: "request_conflict" };
  const isReactionShaped = reaction === undefined || (isRecord(reaction) && typeof reaction.excerpt === "string");
  if (!isReactionShaped) return { error: "reaction_invalid" };
  if (reaction !== undefined && !isText(reaction.excerpt)) return { error: "excerpt_missing" };
  const isKindUnknown = reaction?.kind !== undefined && !isReactionKind(reaction.kind);
  if (isKindUnknown) return { error: "kind_unknown" };
  const isReply = reaction !== undefined && !isFirstReaction;
  if (isReply && reaction.kind === undefined) return { error: "kind_missing" };
  // A thread starts with the AI's reaction: core re-sends the opening user turn itself.
  if (isReply && (history as Turn[])[0].role !== "assistant") return { error: "history_invalid" };

  return {
    passage,
    question: typeof question === "string" ? question : "",
    notes,
    history: ((history ?? []) as Turn[]).map(({ role, content }) => ({ role, content })),
    book: book === undefined ? undefined : pickBook(book as Book),
    ...(command !== undefined && { command: { name: command.name, selection: command.selection } as Command }),
    ...(reaction !== undefined && { reaction: pickReaction(reaction as ReactionRequest) }),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const pickBook = ({ title, author, edition }: Book): Book => ({ title, author, edition });
const pickReaction = ({ excerpt, kind }: ReactionRequest): ReactionRequest => ({ excerpt, ...(kind !== undefined && { kind }) });

// The single entry point: yields reply text as it streams, returns stats when done. A reaction
// first yields its kind, picked by a short router call when the request doesn't name one (D20).
// Aborting `signal` (the client went away) stops the upstream request. Tests pass a fake `client`.
export async function* converse(
  request: ConverseRequest,
  signal?: AbortSignal,
  client: Anthropic = new Anthropic(), // reads ANTHROPIC_API_KEY
): AsyncGenerator<ConverseChunk, ConverseStats> {
  const start = performance.now(); // before the router: TTFT is what the reader waits for
  if (request.reaction) {
    const kind = request.reaction.kind ?? (await routeReaction(client, request, signal));
    request = { ...request, reaction: { ...request.reaction, kind } };
    yield { type: "kind", kind };
  }
  const { paragraphs, system, messages, maxTokens } = buildContext(request);
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
    citations: checkCitations(text, paragraphs),
  };
}

// Picks a reaction's kind: one short, non-streamed call with the same cached prefix as chat.
async function routeReaction(client: Anthropic, request: ConverseRequest, signal?: AbortSignal): Promise<ReactionKind> {
  const { system, messages } = routerContext(request);
  const reply = await client.beta.messages.create({
    model: MODEL,
    max_tokens: ROUTER.maxTokens,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages,
  }, { signal });
  const answer = reply.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  return parseRouterKind(answer);
}

// What the model sees, ordered stable to volatile (DESIGN §6.3) so a cache prefix stays valid:
// instructions, the passage, the reader's notes (only if any), then the conversation and the question.
// A command's instructions go in the last user turn, not the system blocks, so that prefix is the
// same for chat and every command. That turn is <command>prompt file</command>, <selection> (if
// any), then the question as shown in chat. History holds only what the reader saw, so it stays plain.
// A reaction works the same way: <reaction>prompt file</reaction> and <excerpt> open its thread.
// On a first reaction that is the last user turn; on a reply it is re-sent before the thread
// (which starts with the AI's reaction), and the reader's reply is the last turn.
export function buildContext(request: ConverseRequest) {
  const { paragraphs, system } = systemBlocks(request);
  const { reaction } = request;
  if (reaction) {
    if (!reaction.kind) throw new Error("reaction_kind_missing"); // converse() routes before this
    const prompt = REACTIONS[reaction.kind];
    const opening = tagged("reaction", readPrompt(prompt.promptFile), reaction.excerpt);
    const history = request.history ?? [];
    const messages: Turn[] = history.length === 0
      ? [{ role: "user", content: [opening, request.question.trim()].filter(Boolean).join("\n\n") }]
      : [{ role: "user", content: opening }, ...history, { role: "user", content: request.question }];
    return { paragraphs, system, messages, maxTokens: prompt.maxTokens };
  }
  const messages: Turn[] = [...(request.history ?? []), { role: "user", content: userTurn(request) }];
  const maxTokens = request.command ? COMMANDS[request.command.name].maxTokens : CHAT_MAX_TOKENS;
  return { paragraphs, system, messages, maxTokens };
}

// The router sees the same prefix and one user turn: <router>prompt file</router>, <excerpt>.
export function routerContext(request: ConverseRequest) {
  const { system } = systemBlocks(request);
  const excerpt = request.reaction?.excerpt ?? "";
  const messages: Turn[] = [{ role: "user", content: tagged("router", readPrompt(ROUTER.promptFile), excerpt) }];
  return { system, messages };
}

function systemBlocks(request: ConverseRequest) {
  // Page markers are stripped here: the model sees [¶n] only; pages are for the reader (D13).
  const paragraphs = parsePassage(request.passage).map((p) => p.text);
  const labelled = paragraphs.map((p, i) => `[¶${i + 1}] ${p}`).join("\n\n");
  const notes = request.notes?.trim() ?? "";
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: systemPrompt(request.book) },
    { type: "text", text: `<passage>\n${labelled}\n</passage>` },
  ];
  if (notes !== "") system.push({ type: "text", text: `<notes>\n${notes}\n</notes>` });
  return { paragraphs, system };
}

// "<tag>\nprompt\n</tag>\n\n<excerpt>\nexcerpt\n</excerpt>"
const tagged = (tag: string, prompt: string, excerpt: string) =>
  `<${tag}>\n${prompt.trim()}\n</${tag}>\n\n<excerpt>\n${excerpt.trim()}\n</excerpt>`;

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
