// Server-only: where trace batches go (D48). On localhost (next dev) each session is appended to
// .scratch/traces/<day>/<browser>-<session>.jsonl and rendered beside it as .md, to read as you go.
// Hosted, with a Vercel Blob store connected, each batch is a private blob under
// traces/<day>/<browser>/<session>/; `npm run traces` downloads and renders them. Otherwise nothing.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { renderTrace, type TraceBatch, type TraceEvent } from "@/core/trace.ts";

const isLocal = process.env.NODE_ENV === "development";
const hasBlobStore = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

export async function storeTrace(batch: TraceBatch): Promise<void> {
  const day = batch.events[0].at.slice(0, 10);
  if (isLocal) return writeLocal(day, batch);
  if (!hasBlobStore) return;
  const path = `traces/${day}/${batch.browser}/${batch.session}/${Date.now()}.json`;
  await put(path, JSON.stringify(batch), { access: "private", contentType: "application/json", addRandomSuffix: true });
}

async function writeLocal(day: string, batch: TraceBatch) {
  const dir = join(process.cwd(), ".scratch", "traces", day);
  const base = join(dir, `${batch.browser.slice(0, 8)}-${batch.session.slice(0, 8)}`);
  await mkdir(dir, { recursive: true });
  await appendFile(`${base}.jsonl`, batch.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const events = (await readFile(`${base}.jsonl`, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as TraceEvent);
  await writeFile(`${base}.md`, renderTrace(batch, events));
}
