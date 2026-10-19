// OCR text layer (D55): where each word Tesseract read off a scanned page goes as invisible text in
// the PDF, so pdfjs reads the page like any text PDF (import, page links, autocomplete, search and
// highlights). Each word starts where it was seen, on its line's baseline, at the line's height,
// squeezed or stretched to the width it covered on the page. Before that, words OCR doubted are
// repaired from the document's own confident words where a common misread explains them (D56).
// Pure: lib/pdf-ocr.ts runs the OCR and writes the PDF.

// A word as OCR saw it, in image pixels (y grows downwards).
export type OcrWord = { text: string; confidence: number; x0: number; y0: number; x1: number; y1: number };
export type OcrLine = { words: OcrWord[]; baseline?: { y0: number; y1: number } };

// A word as drawn: PDF points with y growing upwards, at its baseline. `squeeze` is the horizontal
// scaling (PDF's Tz) in percent that makes the font's width match the word's.
export type PlacedWord = { text: string; x: number; y: number; size: number; squeeze: number };

export type OcrStats = { words: number; fixed: number; uncertain: number };

const DOUBTFUL = 60; // under this confidence (%) a word is likely misread (D56)
const CONFIDENT = 80; // a word read at least this surely, twice, is known to be in the document
// Common OCR misreads, as [read, meant]: each is tried alone at every place it occurs.
const CONFUSIONS: [string, string][] = [
  ["¢", "i"], ["¢", "c"], ["rn", "m"], ["m", "rn"], ["cl", "d"], ["vv", "w"], ["0", "o"], ["1", "l"],
  ["1", "i"], ["|", "l"], ["|", "i"], ["!", "l"], ["ﬁ", "fi"], ["ﬂ", "fl"], ["#", ""], ["*", ""], ["^", ""], ["~", ""],
];

// Every word under DOUBTFUL confidence that the document doesn't know becomes the first variant (one confusion undone) that the
// document read confidently at least twice, keeping its surrounding punctuation; the others stay
// as read and count as uncertain. `pages` holds each page's lines; returns them repaired.
export function repairWords(pages: OcrLine[][]): { pages: OcrLine[][]; stats: OcrStats } {
  const words = pages.flat().flatMap((line) => line.words).filter((w) => w.text.trim() !== "");
  const counts = new Map<string, number>();
  for (const w of words) if (w.confidence >= CONFIDENT) counts.set(core(w.text), (counts.get(core(w.text)) ?? 0) + 1);
  const isKnown = (text: string) => (counts.get(core(text)) ?? 0) >= 2;
  const stats: OcrStats = { words: words.length, fixed: 0, uncertain: 0 };

  const repaired = pages.map((lines) =>
    lines.map((line) => ({
      ...line,
      words: line.words.map((w) => {
        const isFine = w.confidence >= DOUBTFUL || w.text.trim() === "" || isKnown(w.text); // a doubted "if" read right
        if (isFine) return w;
        const fix = variants(w.text).find(isKnown);
        if (fix === undefined) {
          stats.uncertain++;
          return w;
        }
        stats.fixed++;
        return { ...w, text: fix, confidence: DOUBTFUL };
      }),
    })),
  );
  return { pages: repaired, stats };
}

// A word without its quotes, brackets and end punctuation, lowercased: what "the same word" means.
// Symbols stay, so "¢f" isn't taken for the "F." in "F. A. Hayek".
const core = (text: string) => text.toLowerCase().replace(/[“”"‘’'()[\]]/g, "").replace(/[.,;:!?*]+$/, "");

function variants(text: string): string[] {
  const out: string[] = [];
  for (const [read, meant] of CONFUSIONS) {
    for (let at = text.indexOf(read); at !== -1; at = text.indexOf(read, at + 1)) {
      const variant = text.slice(0, at) + meant + text.slice(at + read.length);
      if (core(variant) !== "") out.push(variant);
    }
  }
  return out;
}

// `toPdf` maps an image pixel to PDF user space (pdfjs's viewport.convertToPdfPoint); `scale` is
// image pixels per PDF point; `widthAt1` is the font's width of a text at size 1.
export function placeWords(
  lines: OcrLine[],
  scale: number,
  toPdf: (x: number, y: number) => number[],
  widthAt1: (text: string) => number,
): PlacedWord[] {
  return lines.flatMap((line) => {
    const words = line.words.filter((w) => w.text.trim() !== "" && w.x1 > w.x0);
    if (words.length === 0) return [];
    // One baseline and size per line, so pdfjs reads the line's words as one line.
    const height = median(words.map((w) => w.y1 - w.y0));
    const baseline = line.baseline ? (line.baseline.y0 + line.baseline.y1) / 2 : median(words.map((w) => w.y1));
    const size = height / scale;
    return words.flatMap((w) => {
      const text = w.text.trim();
      const natural = widthAt1(text) * size;
      if (natural <= 0) return [];
      const [x, y] = toPdf(w.x0, baseline);
      const squeeze = clamp((100 * (w.x1 - w.x0)) / scale / natural, 10, 500);
      return [{ text, x, y, size, squeeze }];
    });
  });
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
