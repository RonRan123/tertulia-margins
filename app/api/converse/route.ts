// Thin shell (DESIGN §6.1): parse, call core, stream NDJSON out.
// Runs on Node (the Next.js default): core reads prompts/system.md from disk.
import { converse, errorCode, parseConverseRequest, type ConverseEvent } from "@/core/converse.ts";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined); // malformed JSON → body_invalid
  const parsed = parseConverseRequest(body);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  // If the client disconnects, cancel() aborts the upstream Claude stream so we stop paying for it.
  const abort = new AbortController();
  const reply = converse(parsed, abort.signal);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ConverseEvent) => {
        if (abort.signal.aborted) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        let step = await reply.next();
        while (!step.done) {
          send({ type: "text", text: step.value });
          step = await reply.next();
        }
        send({ type: "done", stats: step.value });
      } catch (error) {
        if (abort.signal.aborted) return; // the client left: nothing to report, nobody to tell
        console.error("converse failed:", error);
        send({ type: "error", code: errorCode(error) });
      }
      if (!abort.signal.aborted) controller.close();
    },
    // The abort ends the SDK stream, so the pending reply.next() in start() settles and it exits.
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
