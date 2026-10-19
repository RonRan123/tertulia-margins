// Browser-only OCR (D55): turns a scanned PDF (pictures of pages) into a text PDF, on the reader's
// machine. Each page without text is drawn as an image, read by Tesseract.js, and its words are
// written back over the picture as invisible text (core/ocr-layout places them), as "make
// searchable" tools do. Everything downstream then reads it like any text PDF. Tesseract.js,
// pdf-lib and the English model load only when a scan needs them; `npm run copy-assets` serves
// the model and engine from public/tesseract/.
import { placeWords, repairWords, type OcrLine, type OcrStats } from "@/core/ocr-layout.ts";
import { openPdf } from "./pdf-import.ts";

const IMAGE_WIDTH = 2500; // px a page is read at: ~300 dpi for a letter page, what Tesseract likes

// The same PDF with an invisible text layer on `pages` (readPdf's scanned pages), and how sure
// the reading was (D56). `onPage(done, total)` reports progress; an aborted `signal` stops between
// pages (the promise rejects with "ocr_cancelled"). All pages are read before any is written, so
// doubtful words are repaired from the whole document's words.
export async function ocrPdf(
  data: Blob,
  pages: number[],
  onPage: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ data: Blob; stats: OcrStats }> {
  const [{ createWorker, OEM }, pdfLib, { task, close }] = await Promise.all([import("tesseract.js"), import("pdf-lib"), openPdf(data)]);
  const asset = (path: string) => new URL(path, location.href).href;
  const ocr = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: asset("/tesseract/worker.min.js"),
    corePath: asset("/tesseract/core"),
    langPath: asset("/tesseract/lang"),
    workerBlobURL: false,
  });
  try {
    const doc = await task.promise;
    const out = await pdfLib.PDFDocument.load(await data.arrayBuffer(), { ignoreEncryption: true });
    const font = await out.embedFont(pdfLib.StandardFonts.Helvetica);
    const charset = new Set(font.getCharacterSet());
    // Helvetica here covers Latin text; a character it can't draw is left out of the layer.
    const drawable = (text: string) => [...text.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")].filter((c) => charset.has(c.codePointAt(0)!)).join("");

    onPage(0, pages.length);
    const read: { n: number; lines: OcrLine[]; scale: number; toPdf: (x: number, y: number) => number[] }[] = [];
    for (const [i, n] of pages.entries()) {
      if (signal.aborted) throw new Error("ocr_cancelled");
      const page = await doc.getPage(n);
      const scale = IMAGE_WIDTH / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const { data: result } = await ocr.recognize(canvas, {}, { blocks: true });
      const lines: OcrLine[] = (result.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.map((line) => ({
            baseline: line.baseline,
            words: line.words.map((w) => ({ text: w.text, confidence: w.confidence, ...w.bbox })),
          })),
        ),
      );
      read.push({ n, lines, scale, toPdf: (x, y) => viewport.convertToPdfPoint(x, y) });
      canvas.width = 0; // frees the image's memory now rather than at garbage collection
      onPage(i + 1, pages.length);
    }

    const { pages: repaired, stats } = repairWords(read.map((page) => page.lines));
    for (const [i, { n, scale, toPdf }] of read.entries()) {
      const lines = repaired[i].map((line) => ({ ...line, words: line.words.map((w) => ({ ...w, text: drawable(w.text) })) }));
      const placed = placeWords(lines, scale, toPdf, (text) => font.widthOfTextAtSize(text, 1));
      const target = out.getPage(n - 1);
      target.pushOperators(pdfLib.pushGraphicsState(), pdfLib.setTextRenderingMode(pdfLib.TextRenderingMode.Invisible));
      for (const word of placed) {
        target.pushOperators(pdfLib.setCharacterSqueeze(word.squeeze));
        target.drawText(word.text, { x: word.x, y: word.y, size: word.size, font });
      }
      target.pushOperators(pdfLib.popGraphicsState());
    }
    return { data: new Blob([(await out.save()) as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), stats };
  } finally {
    await ocr.terminate();
    await close();
  }
}
