import { expect, test } from "vitest";
import { quoteIndex, suggestQuote } from "./quote-complete.ts";

const OPENING =
  "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.\n\n" +
  "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.";
const book = quoteIndex(OPENING);
const suggest = (before: string, index = book) => suggestQuote(index, before);

test("suggests the next words once exactly 4 words match", () => {
  expect(suggest("It is a truth")).toBe(" universally acknowledged,");
});

test("no suggestion under 4 words, or when the words aren't in the book", () => {
  expect(suggest("It is a")).toBeUndefined();
  expect(suggest("is a truth")).toBeUndefined(); // 3 words, even though they match
  expect(suggest("It is a lie")).toBeUndefined();
  expect(suggest("")).toBeUndefined();
});

test("matching ignores case, curly vs straight quotes and runs of whitespace", () => {
  expect(suggest("IT IS  A\tTRUTH")).toBe(" universally acknowledged,");
  const quoted = quoteIndex("He said, “it’s a fine day for a walk,” and left the room.");
  expect(suggest('He said, "it\'s a fine', quoted)).toBe(" day for a walk,”");
  expect(suggest("said, “it’s a fine", quoted)).toBe(" day for a walk,”");
});

test("the reader's own words before the quote don't matter, nor do quote marks or markdown", () => {
  expect(suggest("Austen opens: “It is a truth")).toBe(" universally acknowledged,");
  expect(suggest("> It is a truth")).toBe(" universally acknowledged,");
  expect(suggest("_It is a truth")).toBe(" universally acknowledged,");
});

test("stops at punctuation that ends a clause, and at 5 words", () => {
  expect(suggest("It is a truth universally acknowledged,")).toBe(" that a single man in");
  expect(suggest("a single man in possession")).toBe(" of a good fortune,");
  expect(suggest("in want of a")).toBe(" wife.");
});

test("a trailing space or a half-typed word continues from where the reader is", () => {
  expect(suggest("It is a truth ")).toBe("universally acknowledged,");
  expect(suggest("It is a truth univ")).toBe("ersally acknowledged,");
});

test("chaining: accepting a suggestion and asking again gives the next words", () => {
  let line = "It is a truth";
  for (let i = 0; i < 3; i++) line += suggest(line) ?? "";
  expect(line).toBe("It is a truth universally acknowledged, that a single man in possession of a good fortune,");
});

test("more than one continuation: only the words they all share, or none", () => {
  const index = quoteIndex("She was in the house of her aunt. Later she was in the house of mourning.");
  expect(suggest("she was in the", index)).toBe(" house of");
  const split = quoteIndex("He walked to the door slowly. Then he walked to the window.");
  expect(suggest("he walked to the", split)).toBeUndefined();
});

test("the reader's longer context picks between continuations", () => {
  const index = quoteIndex("Early she was in the garden. Late at night she was in the house.");
  expect(suggest("she was in the", index)).toBeUndefined();
  expect(suggest("night she was in the", index)).toBe(" house.");
});

test("matches start at a word, not inside one", () => {
  const index = quoteIndex("The goal is a truth universally kept. It is a truth worth telling.");
  expect(suggest("It is a truth", index)).toBe(" worth telling.");
  expect(suggest("lit is a truth", quoteIndex("Split is a truth of sorts. Lit is a truth bright."))).toBe(" bright.");
});

test("line-break hyphens are joined, PDF style or not", () => {
  const index = quoteIndex("Mr. Darcy had a certain charis-\nma about him, they said.");
  expect(suggest("Darcy had a certain", index)).toBe(" charisma about him,");
  const pdf = quoteIndex("Mr. Darcy had a certain charis- ma about him, they said.");
  expect(suggest("had a certain charisma", pdf)).toBe(" about him,");
  // A real hyphen stays.
  expect(suggest("a well-known man in", quoteIndex("He was a well-known man in town."))).toBe(" town.");
});

test("double spaces and line breaks collapse to one space", () => {
  const index = quoteIndex("It  is a\ntruth   universally\n\nacknowledged, that");
  expect(suggest("It is a truth", index)).toBe(" universally acknowledged,");
});

test("page markers never show and don't break a match", () => {
  const index = quoteIndex("[PDF p. 1]\nIt is a truth universally [p. 12] acknowledged, that a single [PDF p. 2] man in possession.");
  expect(suggest("It is a truth", index)).toBe(" universally acknowledged,");
  expect(suggest("acknowledged, that a single", index)).toBe(" man in possession.");
});

test("a match at the end of the book suggests nothing", () => {
  expect(suggest("one or other of their daughters.")).toBeUndefined();
});

test("an empty book suggests nothing", () => {
  expect(suggest("It is a truth", quoteIndex(""))).toBeUndefined();
});
