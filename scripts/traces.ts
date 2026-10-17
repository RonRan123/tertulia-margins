// Usage: npm run traces [-- <YYYY-MM-DD>]
// Downloads the hosted app's traces (D48) from Vercel Blob and renders one markdown file per session
// into .scratch/traces/hosted/<day>/. Needs BLOB_READ_WRITE_TOKEN in .env.local (`vercel env pull`).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { get, list } from "@vercel/blob";
import { renderTrace, type TraceBatch } from "../core/trace.ts";

const day = process.argv[2] ?? "";
const sessions = new Map<string, TraceBatch>(); // "<day>/<browser>/<session>" → all its events
let cursor: string | undefined;
do {
  const page = await list({ prefix: `traces/${day}`, cursor });
  for (const { pathname } of page.blobs) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) continue;
    const batch = JSON.parse(await new Response(result.stream).text()) as TraceBatch;
    const key = pathname.split("/").slice(1, 4).join("/");
    const known = sessions.get(key);
    if (known) known.events.push(...batch.events);
    else sessions.set(key, { ...batch, events: [...batch.events] });
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

for (const [key, batch] of sessions) {
  const [sessionDay] = key.split("/");
  const dir = join(".scratch", "traces", "hosted", sessionDay);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${batch.browser.slice(0, 8)}-${batch.session.slice(0, 8)}.md`);
  writeFileSync(file, renderTrace(batch, batch.events));
  console.log(`${file}: ${batch.events.length} events`);
}
console.log(`${sessions.size} sessions`);
