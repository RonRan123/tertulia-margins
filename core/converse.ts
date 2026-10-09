import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { checkCitations, type CitationCheck } from "./citations.ts";

// D12: one model for the MVP, low effort for a fast first token.
const MODEL = "claude-sonnet-5-5";

export type Book = { title?: string; author?: string; edition?: string };
export type ConverseRequest = { passage: string; question: string; book?: Book };

export type ConverseStats = {
  model: string;
  stopReason: string | null;
  ttftMs: number | null; // time to first text token; null if no text came back
  totalMs: number;
  usage: Anthropic.Beta.BetaUsage;
  citations: CitationCheck[];
};

// Paragraphs are separated by blank lines. [¶n] is 1-based: paragraphs[n - 1].
export function splitParagraphs(passage: string): string[] {
  return passage
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// prompts/system.md is Ronith's: drop the owner comment, fill {{placeholders}} from the book.
function systemPrompt(book: Book = {}): string {
  const raw = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf8");
  const withoutComment = raw.replace(/^\s*<!--[\s\S]*?-->\s*/, "");
  return withoutComment.replace(/\{\{(\w+)\}\}/g, (_, key: string) => book[key as keyof Book] ?? "unknown");
}

// The single entry point: yields reply text as it streams, returns stats when done.
export async function* converse(request: ConverseRequest): AsyncGenerator<string, ConverseStats> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const paragraphs = splitParagraphs(request.passage);
  const labelled = paragraphs
    .map((p, i) => `[¶${i + 1}] ${p}`)
    .join("\n\n");
  const start = performance.now();
  let ttftMs: number | null = null;
  let text = "";

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // retry a mis-flagged refusal on another model (D12)
    system: systemPrompt(request.book),
    messages: [{ role: "user", content: `<passage>\n${labelled}\n</passage>\n\n${request.question}` }],
  });

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
