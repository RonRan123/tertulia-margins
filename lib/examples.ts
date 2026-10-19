// Browser-only: fetches the example books (D49) from public/examples, stores each PDF (IndexedDB)
// and book state (localStorage), and returns their ids and titles for the library. The reference
// text comes from the PDF with the same import a reader's upload uses.
import { bookKey, saveState, type KeyValueStorage } from "@/core/store.ts";
import { EXAMPLES, exampleState, isExampleFile } from "@/core/examples.ts";
import { importPdf } from "./pdf-import.ts";
import { savePdf } from "./pdf-store.ts";

// Throws if an example can't be fetched or read; nothing is half-written to the library, which the
// caller updates only after this returns.
export async function installExamples(storage: KeyValueStorage): Promise<{ id: string; title: string }[]> {
  const installed: { id: string; title: string }[] = [];
  for (const { id, file } of EXAMPLES) {
    const meta: unknown = await fetch(`/examples/${file}.json`).then((r) => r.json());
    if (!isExampleFile(meta)) throw new Error(`example_invalid: ${file}`);
    const pdf = await fetch(`/examples/${meta.pdf}`).then((r) => r.blob());
    const reference = await importPdf(pdf);
    await savePdf(id, { name: meta.pdf, data: pdf });
    saveState(storage, bookKey(id), exampleState(meta, reference, () => crypto.randomUUID()));
    installed.push({ id, title: meta.title });
  }
  return installed;
}
