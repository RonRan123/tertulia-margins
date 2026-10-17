import { expect, test } from "vitest";
import { exampleState, isExampleFile, withExamples } from "./examples.ts";

const file = { title: "Example: X", pdf: "x.pdf", notes: "My claim here.\n\nAnother thought.", cards: [{ daemon: "author" as const, text: "Is it?", anchor: "My claim" }], messages: [] };

test("an example's state: its notes and cards, the notes already read, a fresh quiz", () => {
  let n = 0;
  const state = exampleState(file, "[PDF p. 1]\nText.", () => `id-${++n}`);
  expect(state.notes).toBe(file.notes);
  expect(state.reference).toBe("[PDF p. 1]\nText.");
  expect(state.daemons.cards).toEqual([{ daemon: "author", text: "Is it?", anchor: "My claim", id: "id-1" }]);
  expect(state.daemons.seen.length).toBeGreaterThan(0); // the daemons won't sweep the example's notes
  expect(state.quiz.stage).toBe("setup");
  expect(isExampleFile(file)).toBe(true);
  expect(isExampleFile({ ...file, cards: "x" })).toBe(false);
});

test("withExamples: missing examples go first, ones already there keep place and title; the open book is kept unless asked", () => {
  const library = { books: [{ id: "first", title: "My first book" }, { id: "ex-b", title: "Renamed B" }], currentId: "first" };
  const examples = [{ id: "ex-a", title: "A" }, { id: "ex-b", title: "B" }];
  expect(withExamples(library, examples)).toEqual({ books: [{ id: "ex-a", title: "A" }, { id: "first", title: "My first book" }, { id: "ex-b", title: "Renamed B" }], currentId: "first" });
  expect(withExamples(library, examples, "ex-a").currentId).toBe("ex-a");
});
