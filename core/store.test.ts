import { expect, test } from "vitest";
import { emptyState, loadState, saveState, type AppState, type KeyValueStorage } from "./store.ts";

const KEY = "tertulia-margins:v1";
const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  const storage: KeyValueStorage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  return { storage, data };
};
const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

const state: AppState = {
  reference: "[p. 1] One.\n\nTwo.",
  notes: "My note",
  messages: [
    { role: "user", content: "Why?" },
    { role: "assistant", content: "Because [¶1].", pages: { 1: "p. 1" }, citations: [] },
  ],
};

test("save then load round-trips the state", () => {
  const { storage } = memoryStorage();
  expect(saveState(storage, state)).toBeUndefined();
  expect(loadState(storage)).toEqual(state);
});

test("missing, corrupt or wrongly shaped data loads as empty state", () => {
  expect(loadState(memoryStorage().storage)).toEqual(emptyState());
  for (const raw of ["{not json", "null", "[]", '"text"', '{"reference": 3, "notes": null, "messages": "x"}'])
    expect(loadState(memoryStorage({ [KEY]: raw }).storage)).toEqual(emptyState());
});

test("malformed messages are dropped and unknown fields stripped", () => {
  const raw = JSON.stringify({
    reference: "R",
    notes: "N",
    messages: [
      { role: "system", content: "x" },
      { role: "user", content: "Hi", extra: 1, citations: {} },
      { role: "assistant", content: "Hello", pages: [] },
    ],
  });
  expect(loadState(memoryStorage({ [KEY]: raw }).storage)).toEqual({
    reference: "R",
    notes: "N",
    messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }],
  });
});

test("a reply still streaming is not saved, nor its question", () => {
  const { storage } = memoryStorage();
  const streaming: AppState = {
    ...state,
    messages: [...state.messages, { role: "user", content: "And?" }, { role: "assistant", content: "Half", isStreaming: true }],
  };
  saveState(storage, streaming);
  expect(loadState(storage).messages).toEqual(state.messages);
});

test("storage that throws never crashes: load is empty, save reports save_failed", () => {
  expect(loadState(throwing)).toEqual(emptyState());
  expect(saveState(throwing, state)).toBe("save_failed");
});
