import { expect, test } from "vitest";
import { findPageRefs, linkHighlight, linkPageRefs, pageLabel, pdfParagraphs, pillName, suggestPageCite } from "./page-links.ts";

const refsIn = (notes: string) => findPageRefs(notes).map((r) => ({ text: notes.slice(r.start, r.end), page: r.page, isPdfPage: r.isPdfPage }));

test("finds every reference form, each once", () => {
  const notes = [
    "Bracketed [p. 42] and [pp. 10-11] and [PDF p. 7].",
    "Loose p. 42, pp. 10–11, pg 9 and pg. 8.",
    "Spelled page 12 and pages 30-31.",
    "“a truth universally acknowledged” (42) and “so well fixed in” — 43",
  ].join("\n\n");
  expect(refsIn(notes)).toEqual([
    { text: "[p. 42]", page: 42, isPdfPage: false },
    { text: "[pp. 10-11]", page: 10, isPdfPage: false },
    { text: "[PDF p. 7]", page: 7, isPdfPage: true },
    { text: "p. 42", page: 42, isPdfPage: false },
    { text: "pp. 10–11", page: 10, isPdfPage: false },
    { text: "pg 9", page: 9, isPdfPage: false },
    { text: "pg. 8", page: 8, isPdfPage: false },
    { text: "page 12", page: 12, isPdfPage: false },
    { text: "pages 30-31", page: 30, isPdfPage: false },
    { text: "(42)", page: 42, isPdfPage: false },
    { text: "— 43", page: 43, isPdfPage: false },
  ]);
});

test("ignores cites, roman numerals, a bare (42) and words that merely contain p.", () => {
  expect(refsIn("The AI's cite [¶4] and [¶4, p. 12]? Front matter [p. xii]. A list (42). Step 3. Map. 4")).toEqual([
    { text: "p. 12", page: 12, isPdfPage: false },
  ]);
});

test("context: the quote before the reference, a blockquote above it, else its sentence", () => {
  const [quoted] = findPageRefs("He says “a single man in possession” [p. 3] here.");
  expect(quoted.quote).toBe("a single man in possession");
  const [block] = findPageRefs("> it is a truth universally acknowledged\n[p. 3]");
  expect(block.quote).toBe("it is a truth universally acknowledged");
  const [plain] = findPageRefs("First thought. The families want the man p. 3 badly. Next.");
  expect(plain.quote).toBeUndefined();
  expect(plain.context).toBe("The families want the man badly");
});

// A PDF whose page 5 holds the book's page 1 (front matter): offset +4.
const pdf = [
  "[PDF p. 5]\nIt is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
  "[PDF p. 6]\nHowever little known the feelings or views of such a man may be on his first entering a neighbourhood.",
  "[PDF p. 7]\nMr. Bennet replied that he had not.",
  "[PDF p. 8]\nNetherfield Park is let at last, said Mrs Bennet to her husband.",
].join("\n\n");

test("exact quotes link to their paragraph and teach the page offset; overlap and page use it", () => {
  const notes = [
    "“a single man in possession of a good fortune” [p. 1]",
    "Bennet's dry reply to his wife about Netherfield p. 4",
    "Something unrelated entirely p. 2",
  ].join("\n\n");
  const links = linkPageRefs(findPageRefs(notes), pdfParagraphs(pdf));
  expect(links.map(({ method, pdfPage }) => ({ method, pdfPage }))).toEqual([
    { method: "exact", pdfPage: 5 },
    { method: "overlap", pdfPage: 8 },
    { method: "page", pdfPage: 6 },
  ]);
  expect(links[1].match).toContain("Netherfield Park");
});

test("exact matching tolerates curly quotes, case, spacing and line-break hyphens", () => {
  const paragraphs = pdfParagraphs("[PDF p. 2]\nShe said \"It is a truth uni-\nversally  acknowledged\" then.");
  const [link] = linkPageRefs(findPageRefs("“it is a truth universally acknowledged” [PDF p. 2]"), paragraphs);
  expect(link).toMatchObject({ method: "exact", pdfPage: 2 });
});

test("an exact quote may run across a paragraph or page break, and ignores footnote numbers an older import left in it (D52)", () => {
  const paragraphs = pdfParagraphs("[PDF p. 19]\nExample after example, Scott shows that the state removes the autonomy that exist in social life for something\n\n[PDF p. 20]\nmuch more fixed. The troubling feature follows.");
  const notes = "“Example after example, Scott shows that the state removes the autonomy that exist in social life for something 32 much more fixed.” [p. 17]";
  const [link] = linkPageRefs(findPageRefs(notes), paragraphs);
  expect(link).toMatchObject({ method: "exact", pdfPage: 19 });
  expect(linkHighlight(link)).not.toContain(" 32 "); // the PDF view searches without it
});

test("a PDF page reference ignores the offset; estimates stay inside the PDF", () => {
  const notes = "“a single man in possession of a good fortune” [p. 1]\n\nnothing here [PDF p. 7]\n\nfar away p. 999";
  const links = linkPageRefs(findPageRefs(notes), pdfParagraphs(pdf));
  expect(links.map((l) => l.pdfPage)).toEqual([5, 7, 8]);
});

test("a paragraph the import joined across a page break is split at the marker, each piece on its page", () => {
  const paragraphs = pdfParagraphs("[PDF p. 4]\nThe parcel arrived. [PDF p. 5] The crimson heron rested.\n\nMore on five.");
  expect(paragraphs.map(({ text, page }) => ({ text, page }))).toEqual([
    { text: "The parcel arrived.", page: 4 },
    { text: "The crimson heron rested.", page: 5 },
    { text: "More on five.", page: 5 },
  ]);
});

// Regression (S8.2a, an AI reply): a short straight-quoted phrase before a long one paired the
// short quote's closing mark with the long one's opening, so the cite got the text between them.
test("straight quotes pair in order; a short quote before a long one doesn't swallow the text between", () => {
  const text = 'Her "large fortune" echoes the opening line\'s "a single man in possession of a good fortune" [p. 1].';
  expect(findPageRefs(text)[0].quote).toBe("a single man in possession of a good fortune");
});

test("a reference's pill label reads the same whatever form it was written in (D45)", () => {
  const notes = "[p. 42] p. 42 page 42 pg. 42 “three words here” (42) “three words here” — 42 [pp. 10-11] pages 10–11 [PDF p. 7] PDF p. 7";
  expect(findPageRefs(notes).map((r) => pageLabel(notes.slice(r.start, r.end)))).toEqual([
    "p. 42", "p. 42", "p. 42", "p. 42", "p. 42", "p. 42", "pp. 10–11", "pp. 10–11", "PDF p. 7", "PDF p. 7",
  ]);
});

test("a reference never spans a line break, so it can be drawn on one line (D45)", () => {
  const cases = ["Key ideas on this page\n1. first idea", "see p.\n42 below", "pages 10 -\n11 here", "“three words here” —\n42"];
  for (const notes of cases) {
    for (const ref of findPageRefs(notes)) expect(notes.slice(ref.start, ref.end)).not.toContain("\n");
  }
  expect(findPageRefs("pages 10 -\n11 here").map((r) => [r.start, r.end])).toEqual([[0, 8]]); // "pages 10" alone
});

test("pageLabel keeps a PDF range's PDF, and pillName names the match for screen readers", () => {
  expect(pageLabel("[PDF pp. 3–4]")).toBe("PDF pp. 3–4");
  expect(pillName("p. 42", "exact")).toBe("Open p. 42 in the PDF (quote found)");
});

// D54: the page cite suggested after a quote the reader just closed.
test("suggestPageCite offers the page of a closed 4+ word quote found on one page", () => {
  const pdf = pdfParagraphs("[PDF p. 7]\nEvery state is founded on force, said Trotsky.\n\n[PDF p. 8]\nThe monopoly of the legitimate use of physical force.");
  const cite = (notes: string) => suggestPageCite(notes, notes.length, pdf);
  expect(cite('- "every state is founded on force"')).toBe(" [p. 7]"); // no exact refs yet: the PDF page
  expect(cite('"monopoly of the legitimate use" [p. 5]\n- "every state is founded on force"')).toBe(" [p. 4]"); // offset 3 learned
  expect(cite('"every state is founded"')).toBe(" [p. 7]"); // 4 words
  expect(cite('"state is founded"')).toBeUndefined(); // too short
  expect(cite('"every state is founded on force')).toBeUndefined(); // not closed
  expect(cite('"every state is founded on force" and')).toBeUndefined(); // caret not right after the quote
  expect(cite('"words that are not in the book"')).toBeUndefined();
  expect(cite('"every state is founded on force" [p. 7] and "')).toBeUndefined(); // an opening mark
});

test("suggestPageCite stays quiet when the quote is on more than one page", () => {
  const pdf = pdfParagraphs("[PDF p. 1]\nThe power of the state is great.\n\n[PDF p. 2]\nThe power of the state is great.");
  expect(suggestPageCite('"power of the state is"', 23, pdf)).toBeUndefined();
});
