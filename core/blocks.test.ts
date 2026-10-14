import { expect, test } from "vitest";
import { blockAt, findExcerpt, layoutRows, placeByExcerpt, splitBlocks, stackCards } from "./blocks.ts";

const texts = (notes: string) => splitBlocks(notes).map((b) => b.text);

const SAMPLES = [
  "",
  "one",
  "one\ntwo",
  "one\n\ntwo",
  "one\n\n\n\ntwo\n\nthree",
  "one\n   \n\t\ntwo", // whitespace-only lines are blank
  "\n\n  one\n\ntwo\n\n\n", // leading and trailing blank lines
  "one\r\n\r\ntwo\r\nstill two\r\n",
  "trailing spaces  \n\n> “quote” [¶4, p. 12]",
  "```\ncode\n\nmore\n```",
  "  \n \n",
];

test("blocks are runs of non-blank lines; offsets slice back to their text", () => {
  expect(texts("one\ntwo\n\nthree")).toEqual(["one\ntwo", "three"]);
  expect(texts("one\n\n\n\ntwo")).toEqual(["one", "two"]);
  expect(texts("one\n  \n\t\ntwo")).toEqual(["one", "two"]);
  expect(texts("")).toEqual([]);
  expect(texts("  \n \n")).toEqual([]);
  for (const notes of SAMPLES) for (const b of splitBlocks(notes)) expect(notes.slice(b.start, b.end)).toBe(b.text);
});

test("leading and trailing blank lines belong to no block", () => {
  const notes = "\n\n  one\n\ntwo\n\n\n";
  expect(texts(notes)).toEqual(["  one", "two"]); // a block keeps its indentation
  expect(splitBlocks(notes)[0].start).toBe(2);
});

test("CRLF notes: blocks don't carry the \\r of their last line", () => {
  expect(texts("one\r\n\r\ntwo\r\nstill two\r\n")).toEqual(["one", "two\r\nstill two"]);
});

test("a blank line inside a ``` fence splits it (accepted cost, D20)", () => {
  expect(texts("```\ncode\n\nmore\n```")).toEqual(["```\ncode", "more\n```"]);
});

test("blockAt finds the block under a caret, or nothing on a separator", () => {
  const notes = "one\n\ntwo";
  const blocks = splitBlocks(notes);
  expect(blockAt(blocks, 0)?.text).toBe("one");
  expect(blockAt(blocks, 3)?.text).toBe("one"); // at the end of the block
  expect(blockAt(blocks, 4)).toBeUndefined(); // on the blank line
  expect(blockAt(blocks, notes.length)?.text).toBe("two");
});

const anchorNotes = "First idea.\n\nSecond line one\nsecond line two.\n\n\nThird.";
const at = (text: string) => anchorNotes.indexOf(text);

test("findExcerpt anchors by text: exact first, then ignoring whitespace changes", () => {
  expect(findExcerpt(anchorNotes, "First idea.")).toEqual({ start: 0, end: 11 });
  expect(findExcerpt(anchorNotes, "  Third. ")).toEqual({ start: at("Third"), end: anchorNotes.length });
  const rewrapped = findExcerpt(anchorNotes, "Second line one second  line two.");
  expect(rewrapped).toEqual({ start: at("Second"), end: at("two.") + 4 });
});

test("findExcerpt: rewritten text, blank excerpt or empty notes → undefined (note changed)", () => {
  expect(findExcerpt(anchorNotes, "First thought.")).toBeUndefined();
  expect(findExcerpt(anchorNotes, "  ")).toBeUndefined();
  expect(findExcerpt("", "First idea.")).toBeUndefined();
  expect(findExcerpt("a (b) c?", "(b)  c?")).toEqual({ start: 2, end: 8 }); // regex characters are literal
});

test("cards are ordered by where their excerpt is in the notes; detached ones go last", () => {
  const cards = [
    { id: "a", excerpt: "Third." },
    { id: "b", excerpt: "gone from the notes" },
    { id: "c", excerpt: "First idea." },
    { id: "d", excerpt: "Third." },
    { id: "e", excerpt: "line one   second line" }, // rewrapped: still found
  ];
  const { placed, detached } = placeByExcerpt(anchorNotes, cards);
  expect(placed.map((p) => p.card.id)).toEqual(["c", "e", "a", "d"]);
  expect(placed[0]).toMatchObject({ start: 0, end: "First idea.".length });
  expect(detached.map((r) => r.id)).toEqual(["b"]);
});

test("layoutRows: cards sit beside the row where their excerpt starts; detached go last", () => {
  const notes = "First idea.\n\nSecond line one\nsecond line two.\n\nThird.";
  const cards = [
    { id: "a", excerpt: "Third." },
    { id: "b", excerpt: "line two" },
    { id: "c", excerpt: "Second line one second line two." }, // rewrapped: still found
    { id: "d", excerpt: "idea.\n\nSecond" }, // spans blocks: where it starts
    { id: "e", excerpt: "rewritten away" },
  ];
  const { rows, detached } = layoutRows(notes, cards);
  expect(rows.map((r) => r.cards.map((p) => p.card.id))).toEqual([["d"], ["c", "b"], ["a"]]);
  expect(rows[2].cards[0]).toMatchObject({ start: notes.indexOf("Third."), end: notes.length });
  expect(detached.map((r) => r.id)).toEqual(["e"]);
});

test("margin stacks start at their block's top; one that would overlap is pushed below the one before", () => {
  expect(stackCards([], 12)).toEqual([]);
  // Room between blocks: each stack sits at its anchor.
  expect(stackCards([{ anchor: 0, height: 50 }, { anchor: 100, height: 30 }], 12)).toEqual([0, 100]);
  // A tall stack pushes the next ones down, and the push carries on down the margin.
  expect(stackCards([{ anchor: 0, height: 200 }, { anchor: 40, height: 30 }, { anchor: 80, height: 30 }], 12)).toEqual([0, 212, 254]);
  // Once there is room again, a stack returns to its anchor.
  expect(stackCards([{ anchor: 0, height: 20 }, { anchor: 10, height: 20 }, { anchor: 500, height: 20 }], 12)).toEqual([0, 32, 500]);
  expect(stackCards([{ anchor: 0, height: 10 }, { anchor: 100, height: 10 }], 4, 50)).toEqual([50, 100]); // none above `top`
});
