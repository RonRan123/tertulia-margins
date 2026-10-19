// OCR text layer (D55): where each word Tesseract read off a scanned page goes as invisible text in
// the PDF, so pdfjs reads the page like any text PDF (import, page links, autocomplete, search and
// highlights). Each word starts where it was seen, on its line's baseline, at the line's height,
// squeezed or stretched to the width it covered on the page. Pure: lib/pdf-ocr.ts runs the OCR and
// writes the PDF.

// A word as OCR saw it, in image pixels (y grows downwards).
export type OcrWord = { text: string; confidence: number; x0: number; y0: number; x1: number; y1: number };
export type OcrLine = { words: OcrWord[]; baseline?: { y0: number; y1: number } };

// A word as drawn: PDF points with y growing upwards, at its baseline. `squeeze` is the horizontal
// scaling (PDF's Tz) in percent that makes the font's width match the word's.
export type PlacedWord = { text: string; x: number; y: number; size: number; squeeze: number };

const MIN_CONFIDENCE = 20; // below this a "word" is usually a speck, a rule or part of a picture

// `toPdf` maps an image pixel to PDF user space (pdfjs's viewport.convertToPdfPoint); `scale` is
// image pixels per PDF point; `widthAt1` is the font's width of a text at size 1.
export function placeWords(
  lines: OcrLine[],
  scale: number,
  toPdf: (x: number, y: number) => number[],
  widthAt1: (text: string) => number,
): PlacedWord[] {
  return lines.flatMap((line) => {
    const words = line.words.filter((w) => w.text.trim() !== "" && w.confidence >= MIN_CONFIDENCE && w.x1 > w.x0);
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
