import { expect, test } from "vitest";
import { findExcerpt, parseRouterKind, reactTarget } from "./reactions.ts";

test("the router's answer → the first kind it names, any case; otherwise question", () => {
  expect(parseRouterKind("pushback")).toBe("pushback");
  expect(parseRouterKind("  Connection.\n")).toBe("connection");
  expect(parseRouterKind("I'd say PUSHBACK, not connection")).toBe("pushback");
  expect(parseRouterKind("")).toBe("question");
  expect(parseRouterKind("pushbacks connections")).toBe("question"); // whole words only
  expect(parseRouterKind("Not sure.")).toBe("question");
});

const notes = "First idea.\n\nSecond line one\nsecond line two.\n\n\nThird.";
const at = (text: string) => notes.indexOf(text);

test("React targets the trimmed selection", () => {
  const [start, end] = [at("Second") - 2, at("one") + 3];
  expect(reactTarget(notes, start, end)).toBe("Second line one");
});

test("a selection of only whitespace targets nothing", () => {
  expect(reactTarget(notes, at("\n\nSecond"), at("Second"))).toBeUndefined();
});

test("with no selection, React targets the paragraph at the cursor", () => {
  const cursor = (n: number) => reactTarget(notes, n, n);
  expect(cursor(at("line two"))).toBe("Second line one\nsecond line two.");
  expect(cursor(at("Second"))).toBe("Second line one\nsecond line two."); // at a paragraph's start
  expect(cursor(at("two.") + 4)).toBe("Second line one\nsecond line two."); // at its end
  expect(cursor(0)).toBe("First idea.");
  expect(cursor(notes.length)).toBe("Third.");
});

test("a cursor on a blank line, or in empty notes, targets nothing", () => {
  expect(reactTarget(notes, at("\n\nSecond") + 1, at("\n\nSecond") + 1)).toBeUndefined();
  expect(reactTarget(notes, at("Third") - 1, at("Third") - 1)).toBeUndefined(); // second of two blank lines
  expect(reactTarget("", 0, 0)).toBeUndefined();
  expect(reactTarget("  \n ", 1, 1)).toBeUndefined();
});

test("a blank line holding only spaces still separates paragraphs", () => {
  expect(reactTarget("A.\n   \nB.", 8, 8)).toBe("B.");
});

test("findExcerpt anchors by text: exact first, then ignoring whitespace changes", () => {
  expect(findExcerpt(notes, "First idea.")).toEqual({ start: 0, end: 11 });
  expect(findExcerpt(notes, "  Third. ")).toEqual({ start: at("Third"), end: notes.length });
  const rewrapped = findExcerpt(notes, "Second line one second  line two.");
  expect(rewrapped).toEqual({ start: at("Second"), end: at("two.") + 4 });
});

test("findExcerpt: rewritten text, blank excerpt or empty notes → undefined (note changed)", () => {
  expect(findExcerpt(notes, "First thought.")).toBeUndefined();
  expect(findExcerpt(notes, "  ")).toBeUndefined();
  expect(findExcerpt("", "First idea.")).toBeUndefined();
  expect(findExcerpt("a (b) c?", "(b)  c?")).toEqual({ start: 2, end: 8 }); // regex characters are literal
});
