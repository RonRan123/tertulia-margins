// Sprint 2 test pass: PDF import → reference text → parsePassage, plus [p. N] marker edge cases.
import { expect, test } from "vitest";
import { checkCitations } from "./citations.ts";
import { parsePassage } from "./passage.ts";
import { paragraphsFromPages, type PdfPage, type PdfTextItem } from "./pdf-paragraphs.ts";

const referenceTextFromPages = (pages: PdfPage[]) => paragraphsFromPages(pages).text;

// Same synthetic layout as pdf-paragraphs.test.ts: margin 72, indent 90, right edge 540, 18pt lines.
type Row = { text: string; indent?: boolean; full?: boolean };
function page(pageNumber: number, rows: Row[]): PdfPage {
  const items: PdfTextItem[] = rows.map((r, i) => {
    const x = r.indent ? 90 : 72;
    return { str: r.text, x, y: 720 - 18 * i, width: r.full ? 540 - x : r.text.length * 5, height: 12, hasEOL: true };
  });
  return { pageNumber, items };
}

const ANY_MARKER = /\[\s*(pdf\s*)?p\./i;

test("PDF round trip: page labels follow [PDF p. N] markers and no marker text survives", () => {
  const reference = referenceTextFromPages([
    page(4, [
      { text: "First paragraph opens", indent: true, full: true },
      { text: "and closes." },
      { text: "Second paragraph runs", indent: true, full: true },
      { text: "to the very bottom edge", full: true },
    ]),
    page(5, [
      { text: "and carries over here." },
      { text: "Third paragraph.", indent: true },
    ]),
    page(6, [{ text: "Fourth starts a page.", indent: true }]),
  ]);
  const paragraphs = parsePassage(reference);
  expect(paragraphs).toEqual([
    { text: "First paragraph opens and closes.", page: "PDF p. 4" },
    { text: "Second paragraph runs to the very bottom edge and carries over here.", page: "PDF pp. 4–5" },
    { text: "Third paragraph.", page: "PDF p. 5" },
    { text: "Fourth starts a page.", page: "PDF p. 6" },
  ]);
  expect(paragraphs.some((p) => ANY_MARKER.test(p.text))).toBe(false);
});

test("two markers in one paragraph give a range from the page before to the last marker", () => {
  expect(parsePassage("[p. 7]\n\nA [p. 8] b [p. 9] c.")).toEqual([{ text: "A b c.", page: "pp. 7–9" }]);
});

// A marker means "page N begins here": with no text after it, the paragraph never reaches page N.
test("a marker at the very end of a paragraph is not a range and labels what follows", () => {
  expect(parsePassage("[p. 7]\n\nAll on seven. [p. 8]\n\nNext.")).toEqual([
    { text: "All on seven.", page: "p. 7" },
    { text: "Next.", page: "p. 8" },
  ]);
  expect(parsePassage("First para ends page. [p. 102]\n\nNext.")).toEqual([
    { text: "First para ends page." },
    { text: "Next.", page: "p. 102" },
  ]);
});

test("CRLF line endings split paragraphs and labels the same as LF", () => {
  const crlf = parsePassage("[p. 7]\r\n\r\nOne\r\nline two.\r\n\r\n[p. 8]\r\nTwo.\r\n");
  expect(crlf.map((p) => p.page)).toEqual(["p. 7", "p. 8"]);
  expect(crlf.map((p) => p.text.replace(/\s+/g, " "))).toEqual(["One line two.", "Two."]);
});

test("marker spelling variants: extra spaces and capital P", () => {
  expect(parsePassage("[p.  7] A.\n\n[P. 8] B.\n\n[ PDF  p.9 ] C.")).toEqual([
    { text: "A.", page: "p. 7" },
    { text: "B.", page: "p. 8" },
    { text: "C.", page: "PDF p. 9" },
  ]);
});

// Regression (pdf-paragraphs joinLines): rejoining a line-end hyphen inserted a space before
// punctuation that follows the rejoined word ("twenty-four ,"). Seen 3 times in the real PDF.
test("hyphen rejoin keeps punctuation attached to the word", () => {
  const reference = referenceTextFromPages([
    page(1, [
      { text: "They counted to twenty-", indent: true, full: true },
      { text: "four, then stopped." },
    ]),
  ]);
  expect(parsePassage(reference)[0].text).toBe("They counted to twenty-four, then stopped.");
});

// Same bug, user-visible: a correctly quoted span failed checkCitations.
test("a verbatim quote across a hyphen rejoin passes checkCitations", () => {
  const reference = referenceTextFromPages([
    page(1, [
      { text: "They counted to twenty-", indent: true, full: true },
      { text: "four, then stopped." },
    ]),
  ]);
  const paragraphs = parsePassage(reference).map((p) => p.text);
  expect(checkCitations('She writes "counted to twenty-four, then stopped" [¶1].', paragraphs)[0].status).toBe("ok");
});

// Regression (passage.ts): stripping a marker that sits right before punctuation left "word ,".
test("a marker before punctuation is stripped without leaving a space", () => {
  expect(parsePassage("[p. 7] The word [p. 8], next.")[0].text).toBe("The word, next.");
  expect(parsePassage("word [p. 8], next.")).toEqual([{ text: "word, next.", page: "p. 8" }]);
});

test("a hyphen rejoin across a page break keeps punctuation attached and the page range", () => {
  const reference = referenceTextFromPages([
    page(1, [{ text: "They counted to twenty-", indent: true, full: true }]),
    page(2, [{ text: "four, then stopped." }]),
  ]);
  expect(parsePassage(reference)).toEqual([{ text: "They counted to twenty-four, then stopped.", page: "PDF pp. 1–2" }]);
});

test("a closed line-end dash joins with no space, also across a page break", () => {
  const reference = referenceTextFromPages([
    page(1, [
      { text: "She was amazed—", indent: true, full: true },
      { text: "anyone would think so. Then at—", full: true },
    ]),
    page(2, [{ text: "last it ended." }]),
  ]);
  expect(parsePassage(reference)).toEqual([
    { text: "She was amazed—anyone would think so. Then at—last it ended.", page: "PDF pp. 1–2" },
  ]);
});
