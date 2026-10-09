import { expect, test } from "vitest";
import { paragraphsFromPages, textItemsOf, type PdfPage, type PdfTextItem } from "./pdf-paragraphs.ts";

const referenceTextFromPages = (pages: PdfPage[]) => paragraphsFromPages(pages).text;

// Synthetic page layout: left margin 72, indent 90, right edge 540, 18pt line spacing from the top.
// A row is [indent?, text, fullWidth?]; `full` lines reach the right edge (justified text).
type Row = { text: string; indent?: boolean; full?: boolean; gapBefore?: number };

function page(pageNumber: number, rows: Row[]): PdfPage {
  let y = 720;
  const items: PdfTextItem[] = rows.map((r, i) => {
    if (i > 0) y -= 18 + (r.gapBefore ?? 0);
    const x = r.indent ? 90 : 72;
    const width = r.full ? 540 - x : r.text.length * 5;
    return { str: r.text, x, y, width, height: 12, hasEOL: true };
  });
  return { pageNumber, items };
}

test("an indented first line starts a new paragraph", () => {
  const text = referenceTextFromPages([
    page(3, [
      { text: "First paragraph opens", indent: true, full: true },
      { text: "and closes here." },
      { text: "Second paragraph opens", indent: true, full: true },
      { text: "and ends." },
    ]),
  ]);
  expect(text).toBe("[PDF p. 3]\nFirst paragraph opens and closes here.\n\nSecond paragraph opens and ends.");
});

test("a vertical gap larger than the line spacing starts a new paragraph", () => {
  const text = referenceTextFromPages([
    page(1, [
      { text: "Block one line one", full: true },
      { text: "block one line two." },
      { text: "Block two after a gap.", gapBefore: 14 },
    ]),
  ]);
  expect(text).toBe("[PDF p. 1]\nBlock one line one block one line two.\n\nBlock two after a gap.");
});

test("a paragraph crossing a page break gets the marker inline", () => {
  const text = referenceTextFromPages([
    page(11, [{ text: "Opening line that runs", indent: true, full: true }, { text: "to the end of the page", full: true }]),
    page(12, [{ text: "and carries on here." }, { text: "A new one starts.", indent: true }]),
  ]);
  expect(text).toBe(
    "[PDF p. 11]\nOpening line that runs to the end of the page [PDF p. 12] and carries on here.\n\nA new one starts.",
  );
});

test("a page whose first line is indented starts a new paragraph with the marker before it", () => {
  const text = referenceTextFromPages([
    page(4, [{ text: "A paragraph that", indent: true, full: true }, { text: "ends short." }]),
    page(5, [{ text: "A fresh paragraph", indent: true, full: true }, { text: "starts here." }]),
  ]);
  expect(text).toBe("[PDF p. 4]\nA paragraph that ends short.\n\n[PDF p. 5]\nA fresh paragraph starts here.");
});

test("line-end hyphens are rejoined; soft hyphens dropped only when the whole word appears elsewhere", () => {
  const { text, hyphenJoins, hyphensDropped } = paragraphsFromPages([
    page(1, [
      { text: "Our neighbourhood is quiet, the neigh-", indent: true, full: true },
      { text: "bourhood of a well-known twenty-", full: true },
      { text: "four hour town — calm." },
    ]),
  ]);
  expect(text).toBe("[PDF p. 1]\nOur neighbourhood is quiet, the neighbourhood of a well-known twenty-four hour town — calm.");
  expect({ hyphenJoins, hyphensDropped }).toEqual({ hyphenJoins: 2, hyphensDropped: 1 });
});

test("empty pages are skipped and get no marker", () => {
  const cover: PdfPage = { pageNumber: 1, items: [{ str: " ", x: 0, y: 0, width: 0, height: 0, hasEOL: false }] };
  const text = referenceTextFromPages([cover, page(2, [{ text: "Text begins.", indent: true }])]);
  expect(text).toBe("[PDF p. 2]\nText begins.");
});

test("items on the same baseline join into one line, with spaces from gaps", () => {
  const items: PdfTextItem[] = [
    { str: "italic", x: 120, y: 700.4, width: 30, height: 12, hasEOL: false },
    { str: "An", x: 90, y: 700, width: 12, height: 12, hasEOL: false },
    { str: " ", x: 102, y: 700, width: 3, height: 12, hasEOL: false },
    { str: "word", x: 105, y: 700, width: 12, height: 12, hasEOL: true },
  ];
  expect(referenceTextFromPages([{ pageNumber: 7, items }])).toBe("[PDF p. 7]\nAn word italic");
});

// Ten pages with a running header and a page number; the last page ends with a dated signature.
function bookPages(count: number): PdfPage[] {
  return Array.from({ length: count }, (_, i) => i + 1).map((n) =>
    page(n, [
      { text: "THE BOOK TITLE" },
      { text: `Paragraph on`, indent: true, full: true, gapBefore: 20 },
      { text: `page ${n}.` },
      ...(n === count ? [{ text: "2019", indent: true }] : []),
      { text: `${n}`, gapBefore: 20 },
    ]),
  );
}
const expectedBody = (count: number) =>
  Array.from({ length: count }, (_, i) => `[PDF p. ${i + 1}]\nParagraph on page ${i + 1}.`).join("\n\n");

test("running headers and recurring page numbers are dropped; a lone date is kept", () => {
  expect(referenceTextFromPages(bookPages(10))).toBe(`${expectedBody(10)}\n\n2019`);
});

test("a bare number at a page edge is kept unless bare numbers recur", () => {
  const pages = bookPages(10).map((p, i) => (i === 4 ? p : { ...p, items: p.items.slice(0, -1) }));
  // Only page 5 has a page number: one bare number does not make a running footer.
  expect(referenceTextFromPages(pages).split("\n\n")).toContain("5");
});

test("PDFs under 10 pages keep their edge lines (too few pages to tell headers apart)", () => {
  expect(referenceTextFromPages(bookPages(3))).toMatch(/^\[PDF p\. 1\]\nTHE BOOK TITLE/);
});

test("a dialogue-heavy page with few lines at the margin still splits on indents", () => {
  const prose = page(1, Array.from({ length: 4 }, (_, i) => [
    { text: `Prose paragraph ${i} opens`, indent: true, full: true },
    { text: "and closes." },
  ]).flat());
  const dialogue = page(2, [
    ...Array.from({ length: 12 }, (_, i) => ({ text: `‘Line ${i} of dialogue.’`, indent: true })),
    { text: "A longer paragraph that", indent: true, full: true },
    { text: "wraps once." },
  ]);
  const paragraphs = referenceTextFromPages([prose, dialogue]).split("\n\n");
  expect(paragraphs).toHaveLength(4 + 13);
  expect(paragraphs.at(-1)).toBe("A longer paragraph that wraps once.");
});

test("textItemsOf maps pdfjs items and skips marked content", () => {
  const items = [
    { type: "beginMarkedContent" },
    { str: "Hi", transform: [12, 0, 0, 12, 72, 700], width: 10, height: 12, hasEOL: true },
  ];
  expect(textItemsOf(items)).toEqual([{ str: "Hi", x: 72, y: 700, width: 10, height: 12, hasEOL: true }]);
});
