// Browser-only: reads a PDF the user picked, entirely on their machine (D9), and turns it into
// reference text with [PDF p. N] markers. Paragraph inference lives in core/pdf-paragraphs.ts.
import { paragraphsFromPages, textItemsOf, type PdfPage } from "@/core/pdf-paragraphs.ts";

export type PdfImportError = "pdf_unreadable" | "pdf_no_text";

// Opens a PDF on its own worker, which `close` ends with the document. The import and the viewer
// (D29) both open documents; a shared worker would be torn down when either closed its own.
// pdfjs is loaded on first use, so it stays out of the first page load.
export async function openPdf(data: Blob) {
  const pdfjs = await import("pdfjs-dist");
  // The bundler emits the worker script as its own chunk.
  const port = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  // pdfjs's generated types say `port?: null`; its PDFWorker constructor takes a Worker.
  const worker = new pdfjs.PDFWorker({ port: port as unknown as null });
  // Scanned pages (fax-compressed or JPEG 2000 images) need pdfjs's wasm decoders, which
  // `npm run copy-assets` copies to public/ before dev and build; without them those pages stay blank.
  const wasmUrl = new URL("/pdfjs-wasm/", location.href).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()), worker, wasmUrl });
  const close = async () => {
    await task.destroy().catch(() => {});
    worker.destroy();
    port.terminate();
  };
  return { pdfjs, task, close };
}

// Throws Error("pdf_unreadable") or Error("pdf_no_text") (an image-only PDF has no text layer).
export async function importPdf(file: Blob): Promise<string> {
  const { text } = await readPdf(file);
  if (text.length === 0) throw new Error("pdf_no_text" satisfies PdfImportError);
  return text;
}

// The PDF's reference text ("" if it has none), and its scanned pages (1-based): pages with a
// picture but no text, which OCR can read (D55). A blank page has neither, so it isn't one.
// Throws Error("pdf_unreadable").
export async function readPdf(file: Blob): Promise<{ text: string; scanned: number[] }> {
  const { pdfjs, task: loading, close } = await openPdf(file);
  const imageOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject]);
  const pages: PdfPage[] = [];
  const scanned: number[] = [];
  try {
    const doc = await loading.promise.catch(() => {
      throw new Error("pdf_unreadable" satisfies PdfImportError);
    });
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const items = textItemsOf((await page.getTextContent()).items);
      pages.push({ pageNumber: n, items });
      if (items.some((it) => it.str.trim() !== "")) continue;
      const { fnArray } = await page.getOperatorList();
      if (fnArray.some((op) => imageOps.has(op))) scanned.push(n);
    }
  } finally {
    await close();
  }
  return { text: paragraphsFromPages(pages).text, scanned };
}
