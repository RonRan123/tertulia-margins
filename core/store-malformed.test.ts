import { expect, test } from "vitest";
import { loadState, type KeyValueStorage } from "./store.ts";

const KEY = "tertulia-margins:v1";
const storageWith = (value: unknown): KeyValueStorage => ({
  getItem: (k) => (k === KEY ? JSON.stringify(value) : null),
  setItem: () => {},
});

// Sprint 3 e2e: an unchecked citation entry crashed Chat's CitationWarnings (`c.cited.length`),
// and since the bad save was never overwritten, every reload crashed until site data was cleared.
test("citation entries without quote, cited and status are dropped on load", () => {
  const { messages } = loadState(
    storageWith({
      reference: "One.",
      notes: "",
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "x [¶1]", citations: [{ nope: 1 }, { quote: "One", cited: [1], status: "ok" }] },
      ],
    }),
  );
  expect(messages[1].citations).toEqual([{ quote: "One", cited: [1], status: "ok" }]);
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
  );
  expect(messages.slice(1)).toEqual([
    { role: "assistant", content: "x", citations: [], pages: { 1: "p. 1" } },
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
  );
  expect(messages).toEqual([user("Q2"), ai("A2"), user("Q4"), ai("A4")]);
});
