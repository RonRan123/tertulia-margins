// Thin shell (DESIGN §6.1): parse a trace batch from the browser and store it (D48). Tracing never
// fails loudly: a store error is logged and the browser still gets 204.
import { parseTraceBatch } from "@/core/trace.ts";
import { storeTrace } from "@/lib/trace-store.ts";

export async function POST(request: Request) {
  const batch = parseTraceBatch(await request.json().catch(() => undefined));
  if (!batch) return Response.json({ error: "trace_invalid" }, { status: 400 });
  try {
    await storeTrace(batch);
  } catch (error) {
    console.error("trace not stored:", error);
  }
  return new Response(null, { status: 204 });
}
