import { expect, test } from "vitest";
import { checkCitations } from "./citations.ts";

// Paragraphs 1-3 of a tiny passage; [¶n] is paragraphs[n - 1].
const paragraphs = [
  "It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.",
  "“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”",
  "“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”",
];

const statuses = (reply: string) => checkCitations(reply, paragraphs).map((c) => c.status);

test("a real quote with its citation passes", () => {
  expect(statuses('The opening claims a man "must be in want of a wife" [¶1].')).toEqual(["ok"]);
});

test("an invented quote fails", () => {
  expect(statuses('Austen writes that "every rich man secretly hates marriage" [¶1].')).toEqual([
    "quote_not_in_paragraph",
  ]);
});

test("a range passes if the quote is in any paragraph of it", () => {
  expect(statuses('She insists "Mrs. Long has just been here" [¶1-3].')).toEqual(["ok"]);
});

test("a quote with no citation in its sentence is flagged", () => {
  expect(statuses('She asks whether "Netherfield Park is let at last". Later [¶2] says more.')).toEqual([
    "citation_missing",
  ]);
});

test("a citation to a paragraph that does not exist is flagged", () => {
  expect(statuses('Someone says "a single man in possession" [¶9].')).toEqual(["citation_not_found"]);
});

test("quotes under 3 words are ignored", () => {
  expect(statuses('Her "design" is plain [¶2].')).toEqual([]);
});

test("curly quotes, case, italics markers and ellipses are normalized", () => {
  const reply = "It begins “It is a truth … in want of a _wife_” [¶1].";
  expect(statuses(reply)).toEqual(["ok"]);
});

test('"Mr." does not end a sentence (regression from a real reply)', () => {
  const reply = 'In [¶3], Mr. Bennet hears "she told me all about it".';
  expect(statuses(reply)).toEqual(["ok"]);
});

test("each quote is paired only with citations in its own sentence", () => {
  const reply = 'First, "said his lady to him" [¶2]. Then "she told me all about it" [¶3].';
  expect(statuses(reply)).toEqual(["ok", "ok"]);
});
