import { expect, test } from "vitest";
import { checkCitations } from "./citations.ts";
import { parsePages } from "./passage.ts";

// Three pages of a tiny book (D38: cites are pages, as the markers number them).
const book = parsePages(
  [
    "[p. 1]",
    "It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.",
    "[p. 2]",
    "“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”",
    "[p. 3]",
    "“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”",
  ].join("\n\n"),
);
const notes = "Mrs. Bennet seems desperate to marry off her daughters.";
const statuses = (reply: string) => checkCitations(reply, book, notes).map((c) => c.status);

test("the book splits into pages at its markers", () => {
  expect(book.map((p) => p.page)).toEqual(["1", "2", "3"]);
  expect(parsePages("No markers here.\n\nAt all.")).toEqual([{ text: "No markers here.\n\nAt all." }]);
  expect(parsePages("Before.\n\n[PDF p. xii] After.")).toEqual([{ text: "Before." }, { page: "xii", text: "After." }]);
});

test("a real quote with its page passes", () => {
  expect(statuses('The opening claims a man "must be in want of a wife" [p. 1].')).toEqual(["ok"]);
  expect(checkCitations('Look: "must be in want of a wife" [p. 1].', book)[0]).toEqual({ quote: "must be in want of a wife", pages: ["1"], status: "ok" });
});

test("an invented quote fails, cited or not", () => {
  expect(statuses('Austen writes that "every rich man secretly hates marriage" [p. 1].')).toEqual(["quote_not_on_page"]);
  expect(statuses('Austen writes that "every rich man secretly hates marriage".')).toEqual(["quote_not_in_text"]);
});

test("a quote on the wrong page fails; a range or a quote running onto the next page passes", () => {
  expect(statuses('She insists "Mrs. Long has just been here" [p. 1].')).toEqual(["quote_not_on_page"]);
  expect(statuses('She insists "Mrs. Long has just been here" [pp. 1–3].')).toEqual(["ok"]);
  expect(statuses('She insists "Mrs. Long has just been here" [p. 2].')).toEqual(["ok"]); // page 2 runs on into page 3
});

test("an uncited quote passes if it is in the book or the reader's notes", () => {
  expect(statuses('She asks whether "Netherfield Park is let at last".')).toEqual(["ok"]);
  expect(statuses('You wrote that she "seems desperate to marry".')).toEqual(["ok"]);
});

test("a cite to a page the book doesn't have is flagged", () => {
  expect(statuses('Someone says "a single man in possession" [p. 9].')).toEqual(["page_not_found"]);
});

test("general remarks need no cite, and quotes under 3 words are ignored", () => {
  expect(statuses("The opening is ironic about marriage.")).toEqual([]);
  expect(statuses('Her "design" is plain [p. 2].')).toEqual([]);
});

test("curly quotes, case, italics markers and ellipses are normalized", () => {
  expect(statuses("It begins “It is a truth … in want of a _wife_” [p. 1].")).toEqual(["ok"]);
});

test('"Mr." does not end a sentence (regression from a real reply)', () => {
  expect(statuses('On [p. 3], Mr. Bennet hears "she told me all about it".')).toEqual(["ok"]);
});

test("each quote is paired only with cites in its own sentence", () => {
  expect(statuses('First, "said his lady to him" [p. 2]. Then "she told me all about it" [p. 3].')).toEqual(["ok", "ok"]);
  expect(statuses('First, "she told me all about it". Then [p. 1] says more.')).toEqual(["ok"]); // uncited: anywhere in the book
});
