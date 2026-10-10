import { expect, test } from "vitest";
import { findExcerpt, parseRouterKind, placeReactions, threadHistory } from "./reactions.ts";

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

test("the margin orders reactions by where their excerpt is in the notes; detached ones go last", () => {
  const reactions = [
    { id: "a", excerpt: "Third." },
    { id: "b", excerpt: "gone from the notes" },
    { id: "c", excerpt: "First idea." },
    { id: "d", excerpt: "Third." },
    { id: "e", excerpt: "line one   second line" }, // rewrapped: still found
  ];
  const { placed, detached } = placeReactions(notes, reactions);
  expect(placed.map((p) => p.reaction.id)).toEqual(["c", "e", "a", "d"]);
  expect(placed[0]).toMatchObject({ start: 0, end: "First idea.".length });
  expect(detached.map((r) => r.id)).toEqual(["b"]);
});

test("a thread's history: the opening, then answered pairs; a failed opening leaves nothing", () => {
  const ai = (content: string, error?: string) => ({ role: "assistant" as const, content, ...(error && { error }) });
  const user = (content: string) => ({ role: "user" as const, content });
  expect(threadHistory([ai("Hm?"), user("Q1"), ai("", "api_error"), user("Q2"), ai("A2"), user("Q3"), ai("Ha", undefined)])).toEqual([
    ai("Hm?"),
    user("Q2"),
    ai("A2"),
    user("Q3"),
    ai("Ha"),
  ]);
  expect(threadHistory([ai("", "overloaded")])).toEqual([]);
  expect(threadHistory([])).toEqual([]);
});
