import { expect, test } from "vitest";
import { loadState, type KeyValueStorage } from "./store.ts";

const KEY = "tertulia-margins:v1";
const storageWith = (value: unknown): KeyValueStorage => ({
  getItem: (k) => (k === KEY ? JSON.stringify(value) : null),
  setItem: () => {},
  removeItem: () => {},
});

// Sprint 3 e2e: an unchecked citation entry crashed Chat's CitationWarnings (`c.cited.length`),
// and since the bad save was never overwritten, every reload crashed until site data was cleared.
test("citation entries without quote and status are dropped on load; older paragraph checks keep no pages", () => {
  const { messages } = loadState(
    storageWith({
      reference: "One.",
      notes: "",
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "x [¶1]", citations: [{ nope: 1 }, { quote: "One", cited: [1], status: "ok" }, { quote: "Two", pages: ["3", 4], status: "quote_not_on_page" }] },
      ],
    }),
    KEY,
  );
  expect(messages[1].citations).toEqual([
    { quote: "One", pages: [], status: "ok" },
    { quote: "Two", pages: ["3"], status: "quote_not_on_page" },
  ]);
});

test("bad citation fields and page labels are dropped, so rendering never sees them", () => {
  const { messages } = loadState(
    storageWith({
      reference: "One.",
      notes: "",
      messages: [
        { role: "user", content: "q" },
        {
          role: "assistant",
          content: "x",
          citations: [{ quote: "a", cited: ["1"], status: "ok" }, { quote: 1, cited: [], status: "ok" }, null],
          pages: { 1: "p. 1", 2: 5, x: "p. 3" },
        },
        { role: "user", content: "q2" },
        { role: "assistant", content: "y", pages: "bad", citations: "bad" },
        { role: "user", content: "q3" },
        { role: "assistant", content: "z", paragraphs: [{ page: "p. 1" }] }, // older shape: ignored
      ],
    }),
    KEY,
  );
  expect(messages.slice(1)).toEqual([
    { role: "assistant", content: "x", citations: [{ quote: "a", pages: [], status: "ok" }], pages: { 1: "p. 1" } },
    { role: "user", content: "q2" },
    { role: "assistant", content: "y" },
    { role: "user", content: "q3" },
    { role: "assistant", content: "z" },
  ]);
});

test("dropping a malformed message drops its partner too, so roles keep alternating", () => {
  const user = (content: string) => ({ role: "user", content });
  const ai = (content: string) => ({ role: "assistant", content });
  const { messages } = loadState(
    storageWith({ reference: "One.", notes: "", messages: [{ role: "user" }, ai("A1"), user("Q2"), ai("A2"), user("Q3"), { role: "assistant" }, user("Q4"), ai("A4"), user("Q5")] }),
    KEY,
  );
  expect(messages).toEqual([user("Q2"), ai("A2"), user("Q4"), ai("A4")]);
});

test("saved daemons: malformed cards are dropped; a malformed state starts fresh with the notes seen", () => {
  const card = (fields: object) => ({ id: "c", daemon: "author", text: "T", anchor: "A", ...fields });
  const { daemons } = loadState(
    storageWith({
      reference: "One.",
      notes: "",
      messages: [],
      daemons: {
        cards: [null, card({ id: 3 }), card({ daemon: "narrator" }), card({ text: undefined }), card({ id: "kept", extra: 1 })],
        pool: [card({ id: "p" })],
        seen: ["a line"],
        linesSinceCard: 4,
      },
    }),
    KEY,
  );
  expect(daemons).toEqual({ cards: [card({ id: "kept" })], pool: [card({ id: "p" })], seen: ["a line"], linesSinceCard: 4 });

  const broken = loadState(storageWith({ reference: "", notes: "Old line.", messages: [], daemons: { cards: "x" } }), KEY);
  expect(broken.daemons).toEqual({ cards: [], pool: [], seen: ["old line"], linesSinceCard: 0 });
});
