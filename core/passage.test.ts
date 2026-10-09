import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { citedPages, labelCitations, parsePassage } from "./passage.ts";

test("no markers: paragraphs split on blank lines, no pages", () => {
  expect(parsePassage("One.\n\n  \nTwo,\nstill two.\n\n")).toEqual([{ text: "One." }, { text: "Two,\nstill two." }]);
});

test("a marker labels every paragraph after it until the next marker", () => {
  const reference = "Before.\n\n[p. 101]\n\nA.\n\nB.\n\n[P.102]\nC.";
  expect(parsePassage(reference)).toEqual([
    { text: "Before." },
    { text: "A.", page: "p. 101" },
    { text: "B.", page: "p. 101" },
    { text: "C.", page: "p. 102" },
  ]);
});

test("a marker inside a paragraph gives it a range and is stripped", () => {
  const reference = "[p. 101]\n\nStarts here and [p. 102] ends here.\n\nNext.";
  expect(parsePassage(reference)).toEqual([
    { text: "Starts here and ends here.", page: "pp. 101–102" },
    { text: "Next.", page: "p. 102" },
  ]);
});

test("a marker at the start of a paragraph is not a range", () => {
  expect(parsePassage("[p. 7] First.\n\nSecond.")).toEqual([
    { text: "First.", page: "p. 7" },
    { text: "Second.", page: "p. 7" },
  ]);
});

test("PDF markers, case-insensitive, with ranges", () => {
  const reference = "[PDF p. 81]\n\nOne line\n[pdf  p.82]\nnext line.\n\nAfter.";
  expect(parsePassage(reference)).toEqual([
    { text: "One line next line.", page: "PDF pp. 81–82" },
    { text: "After.", page: "PDF p. 82" },
  ]);
});

test("the Pride and Prejudice sample still has 35 paragraphs", () => {
  const sample = readFileSync(join(__dirname, "..", "samples", "pride-and-prejudice-ch1.txt"), "utf8");
  const paragraphs = parsePassage(sample);
  expect(paragraphs).toHaveLength(35);
  expect(paragraphs.every((p) => p.page === undefined)).toBe(true);
});

test("labelCitations adds page labels beside [¶n]", () => {
  const paragraphs = [{ text: "A", page: "p. 101" }, { text: "B", page: "pp. 101–102" }, { text: "C" }];
  const reply = "See [¶1], [¶3], [¶9] and [¶1-2].";
  expect(labelCitations(reply, citedPages(reply, paragraphs))).toBe(
    "See [¶1 · p. 101], [¶3], [¶9] and [¶1-2 · p. 101, pp. 101–102].",
  );
});

test("citedPages keeps only the labels a reply cites, both ends of a range", () => {
  const paragraphs = Array.from({ length: 3000 }, (_, i) => ({ text: `P${i + 1}`, page: `p. ${i + 1}` }));
  expect(citedPages("See [¶5], [¶10–12] and [¶9999]; no cite here.", paragraphs)).toEqual({ 5: "p. 5", 10: "p. 10", 12: "p. 12" });
  expect(citedPages("No citations.", paragraphs)).toEqual({});
});

test("D15 marker spellings: no dot, explicit range, roman numerals, PDF prefix", () => {
  const reference = "[p 101]\n\nNo dot.\n\n[pp. 10-11]\n\nA range.\n\n[p. xii]\n\nPreface.\n\n[PDF pp. 3–4]\n\nPDF range.";
  expect(parsePassage(reference)).toEqual([
    { text: "No dot.", page: "p. 101" },
    { text: "A range.", page: "pp. 10–11" },
    { text: "Preface.", page: "p. xii" },
    { text: "PDF range.", page: "PDF pp. 3–4" },
  ]);
});

test("D15 markers are stripped from text the model sees", () => {
  const [paragraph] = parsePassage("Start [p xii] end, and [pp. 5-6] more.");
  expect(paragraph.text).toBe("Start end, and more.");
});
