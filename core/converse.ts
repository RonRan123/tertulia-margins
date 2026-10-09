import Anthropic from "@anthropic-ai/sdk";

// D12: one model for the MVP, low effort for a fast first token.
const MODEL = "claude-sonnet-5-5";

export type ConverseRequest = { passage: string; question: string };

export type ConverseStats = {
  model: string;
  stopReason: string | null;
  ttftMs: number | null; // time to first text token; null if no text came back
  totalMs: number;
  usage: Anthropic.Beta.BetaUsage;
};

// The single entry point: yields reply text as it streams, returns stats when done.
export async function* converse(request: ConverseRequest): AsyncGenerator<string, ConverseStats> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const start = performance.now();
  let ttftMs: number | null = null;

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // retry a mis-flagged refusal on another model (D12)
    messages: [
      { role: "user", content: `<passage>\n${request.passage}\n</passage>\n\n${request.question}` },
    ],
  });

  for await (const event of stream) {
    if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
    ttftMs ??= performance.now() - start;
    yield event.delta.text;
  }

  const final = await stream.finalMessage();
  return {
    model: final.model,
    stopReason: final.stop_reason,
    ttftMs,
    totalMs: performance.now() - start,
    usage: final.usage,
  };
}
