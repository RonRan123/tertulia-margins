// Browser-only: reads a PDF the user picked, entirely on their machine (D9), and turns it into
// reference text with [PDF p. N] markers. Paragraph inference lives in core/pdf-paragraphs.ts.
import { paragraphsFromPages, textItemsOf, type PdfPage } from "@/core/pdf-paragraphs.ts";

export type PdfImportError = "pdf_unreadable" | "pdf_no_text";

let worker: Worker | undefined;

// Throws Error("pdf_unreadable") or Error("pdf_no_text") (an image-only PDF has no text layer).
export async function importPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // The bundler emits the worker as its own chunk; one worker is reused across imports.
  worker ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  pdfjs.GlobalWorkerOptions.workerPort = worker;

  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pages: PdfPage[] = [];
  try {
    const doc = await loading.promise.catch(() => {
      throw new Error("pdf_unreadable" satisfies PdfImportError);
    });
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push({ pageNumber: n, items: textItemsOf(content.items) });
    }
  } finally {
    await loading.destroy();
  }

  const { text } = paragraphsFromPages(pages);
  if (text.length === 0) throw new Error("pdf_no_text" satisfies PdfImportError);
  return text;
}
