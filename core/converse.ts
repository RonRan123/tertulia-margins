import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { checkCitations, type CitationCheck } from "./citations.ts";
import { parsePassage } from "./passage.ts";

// D12: one model for the MVP, low effort for a fast first token.
const MODEL = "claude-sonnet-5-5";

export type Book = { title?: string; author?: string; edition?: string };
export type Turn = { role: "user" | "assistant"; content: string };
export type ConverseRequest = { passage: string; question: string; notes?: string; history?: Turn[]; book?: Book };
export type ConverseErrorCode = "rate_limited" | "auth_failed" | "overloaded" | "api_error";
export type ConverseRequestError =
  | "body_invalid"
  | "passage_missing"
  | "passage_empty" // only page markers: nothing to ground on
  | "question_missing"
  | "notes_invalid"
  | "history_invalid"
  | "book_invalid";

export type ConverseStats = {
  model: string;
  stopReason: string | null;
  ttftMs: number | null; // time to first text token; null if no text came back
  totalMs: number;
  usage: Anthropic.Beta.BetaUsage;
  citations: CitationCheck[];
};

// The wire format of POST /api/converse: one JSON object per line (NDJSON),
// a "text" event per delta, then "done" or "error".
export type ConverseEvent =
  | { type: "text"; text: string }
  | { type: "done"; stats: ConverseStats }
  | { type: "error"; code: ConverseErrorCode };

// prompts/system.md is Ronith's: drop the owner comment, fill {{placeholders}} from the book.
function systemPrompt(book: Book = {}): string {
  const raw = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf8");
  const withoutComment = raw.replace(/^\s*<!--[\s\S]*?-->\s*/, "");
  return withoutComment.replace(/\{\{(\w+)\}\}/g, (_, key: string) => book[key as keyof Book] ?? "unknown");
}

// Checks an untrusted JSON body (POST /api/converse) before any paid call is made.
export function parseConverseRequest(body: unknown): ConverseRequest | { error: ConverseRequestError } {
  if (!isRecord(body)) return { error: "body_invalid" };
  const { passage, question, notes, history, book } = body;
  if (!isText(passage)) return { error: "passage_missing" };
  if (!isText(question)) return { error: "question_missing" };
  if (parsePassage(passage).length === 0) return { error: "passage_empty" };
  const isNotesValid = notes === undefined || typeof notes === "string";
  if (!isNotesValid) return { error: "notes_invalid" };

  const isTurn = (t: unknown) => isRecord(t) && (t.role === "user" || t.role === "assistant") && isText(t.content);
  const isHistoryValid = history === undefined || (Array.isArray(history) && history.every(isTurn));
  if (!isHistoryValid) return { error: "history_invalid" };

  const isOptionalString = (v: unknown) => v === undefined || typeof v === "string";
  const isBookValid = book === undefined || (isRecord(book) && [book.title, book.author, book.edition].every(isOptionalString));
  if (!isBookValid) return { error: "book_invalid" };

  return {
    passage,
    question,
    notes,
    history: ((history ?? []) as Turn[]).map(({ role, content }) => ({ role, content })),
    book: book === undefined ? undefined : pickBook(book as Book),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const pickBook = ({ title, author, edition }: Book): Book => ({ title, author, edition });

// The single entry point: yields reply text as it streams, returns stats when done.
// Aborting `signal` (the client went away) stops the upstream request.
export async function* converse(request: ConverseRequest, signal?: AbortSignal): AsyncGenerator<string, ConverseStats> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const { paragraphs, system, messages } = buildContext(request);
  const start = performance.now();
  let ttftMs: number | null = null;
  let text = "";

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
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
    yield event.delta.text;
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

// What the model sees, ordered stable to volatile (DESIGN §6.3) so a cache prefix stays valid:
// instructions, the passage, the reader's notes (only if any), then the conversation and the question.
export function buildContext(request: ConverseRequest) {
  // Page markers are stripped here: the model sees [¶n] only; pages are for the reader (D13).
  const paragraphs = parsePassage(request.passage).map((p) => p.text);
  const labelled = paragraphs.map((p, i) => `[¶${i + 1}] ${p}`).join("\n\n");
  const notes = request.notes?.trim() ?? "";
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: systemPrompt(request.book) },
    { type: "text", text: `<passage>\n${labelled}\n</passage>` },
  ];
  if (notes !== "") system.push({ type: "text", text: `<notes>\n${notes}\n</notes>` });
  const messages: Turn[] = [...(request.history ?? []), { role: "user", content: request.question }];
  return { paragraphs, system, messages };
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
