import { expect, test } from "vitest";
import { examplesFirst, exampleState, isExampleFile, withExamples } from "./examples.ts";

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

test("withExamples: examples go to the top in table order, one already there keeps its title; the open book is kept unless asked", () => {
  const library = { books: [{ id: "first", title: "My first book" }, { id: "ex-b", title: "Renamed B" }], currentId: "first" };
  const examples = [{ id: "ex-a", title: "A" }, { id: "ex-b", title: "B" }];
  expect(withExamples(library, examples)).toEqual({ books: [{ id: "ex-a", title: "A" }, { id: "ex-b", title: "Renamed B" }, { id: "first", title: "My first book" }], currentId: "first" });
  expect(withExamples(library, examples, "ex-a").currentId).toBe("ex-a");
});

test("examplesFirst: held examples move to the top in table order; missing ones aren't added; titles kept", () => {
  const old = { books: [{ id: "example-politics-as-a-vocation", title: "Weber" }, { id: "example-pride-and-prejudice", title: "P&P" }, { id: "mine", title: "Mine" }], currentId: "mine" };
  expect(examplesFirst(old).books.map((b) => b.title)).toEqual(["P&P", "Weber", "Mine"]);
  const deleted = { books: [{ id: "mine", title: "Mine" }, { id: "example-politics-as-a-vocation", title: "Weber" }], currentId: "mine" };
  expect(examplesFirst(deleted)).toEqual({ books: [{ id: "example-politics-as-a-vocation", title: "Weber" }, { id: "mine", title: "Mine" }], currentId: "mine" });
});
