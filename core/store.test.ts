import { expect, test } from "vitest";
import { freshQuiz } from "./quiz.ts";
import {
  addBook,
  bookKey,
  deleteBook,
  emptyState,
  loadDaemonRunsToday,
  loadLibrary,
  loadState,
  loadRepliesToday,
  loadUi,
  localDay,
  recordDaemonRun,
  recordReply,
  renameBook,
  saveLibrary,
  saveState,
  saveUi,
  type AppState,
  type KeyValueStorage,
  type Library,
} from "./store.ts";

const KEY = "tertulia-margins:v1";
const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  const storage: KeyValueStorage = {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
  return { storage, data };
};
const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {},
};

const state: AppState = {
  reference: "[p. 1] One.\n\nTwo.",
  notes: "My note",
  messages: [
    { role: "user", content: "Why?" },
    { role: "assistant", content: "Because [¶1].", pages: { 1: "p. 1" }, citations: [] },
  ],
  daemons: {
    cards: [{ id: "c1", daemon: "author", text: "Look at [p. 1].", anchor: "My note" }],
    pool: [{ id: "c2", daemon: "devils-advocate", text: "Is it?", anchor: "My note" }],
    seen: ["my note"],
    linesSinceCard: 0,
  },
  quiz: {
    stage: "taking",
    setup: { topics: ["book-concepts"], count: 1, difficulty: "easy", styles: ["true-false"] },
    questions: [{ topic: "book-concepts", kind: "true-false", question: "One comes first.", choices: [{ text: "True", why: "It does [p. 1]." }, { text: "False", why: "It does." }], answer: 0 }],
    answers: [null],
    current: 0,
  },
};

test("save then load round-trips the state", () => {
  const { storage } = memoryStorage();
  expect(saveState(storage, KEY, state)).toBeUndefined();
  expect(loadState(storage, KEY)).toEqual(state);
});

test("missing, corrupt or wrongly shaped data loads as empty state", () => {
  expect(loadState(memoryStorage().storage, KEY)).toEqual(emptyState());
  for (const raw of ["{not json", "null", "[]", '"text"', '{"reference": 3, "notes": null, "messages": "x"}'])
    expect(loadState(memoryStorage({ [KEY]: raw }).storage, KEY)).toEqual(emptyState());
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
  expect(loadState(memoryStorage({ [KEY]: raw }).storage, KEY)).toEqual({
    reference: "R",
    notes: "N",
    messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }],
    daemons: { cards: [], pool: [], seen: ["n"], linesSinceCard: 0 },
    quiz: freshQuiz(), // none saved (or a malformed one): a fresh setup
  });
});

test("a save from before daemons (D37): its reactions are dropped and its notes count as seen", () => {
  const old = { reference: "R", notes: "First line.\n\nSecond line.", messages: [], reactions: [{ id: "r1", excerpt: "N", kind: "question", messages: [] }] };
  const { storage, data } = memoryStorage({ [KEY]: JSON.stringify(old) });
  const loaded = loadState(storage, KEY);
  expect(loaded.daemons).toEqual({ cards: [], pool: [], seen: ["first line", "second line"], linesSinceCard: 0 });
  saveState(storage, KEY, loaded);
  expect(JSON.parse(data[KEY])).not.toHaveProperty("reactions");
});

test("daemon runs are counted per day under their own key, apart from chat replies", () => {
  const { storage, data } = memoryStorage();
  expect(recordDaemonRun(storage, "2026-10-13")).toBe(1);
  expect(recordDaemonRun(storage, "2026-10-13")).toBe(2);
  expect(loadDaemonRunsToday(storage, "2026-10-14")).toBe(0);
  expect(loadRepliesToday(storage, "2026-10-13")).toBe(0);
  expect(Object.keys(data)).toEqual(["tertulia-margins:daemon-usage"]);
});

test("a reply still streaming is not saved, nor its question", () => {
  const { storage } = memoryStorage();
  const streaming: AppState = {
    ...state,
    messages: [...state.messages, { role: "user", content: "And?" }, { role: "assistant", content: "Half", isStreaming: true }],
  };
  saveState(storage, KEY, streaming);
  expect(loadState(storage, KEY).messages).toEqual(state.messages);
});

test("storage that throws never crashes: load is empty, save reports save_failed", () => {
  expect(loadState(throwing, KEY)).toEqual(emptyState());
  expect(saveState(throwing, KEY, state)).toBe("save_failed");
});

test("layout round-trips under its own key and leaves the notes' key alone", () => {
  const { storage, data } = memoryStorage();
  saveUi(storage, { view: "notes+pdf", isSidebarOpen: false, theme: "dark", notesShare: 0.5 });
  expect(loadUi(storage)).toEqual({ view: "notes+pdf", isSidebarOpen: false, theme: "dark", notesShare: 0.5 });
  expect(Object.keys(data)).toEqual(["tertulia-margins:ui"]);
});

test("missing, corrupt or unknown layout falls back to notes + margin, sidebar open, light theme, 60% notes", () => {
  const fallback = { view: "notes+margin", isSidebarOpen: true, theme: "light", notesShare: 0.6 };
  expect(loadUi(memoryStorage().storage)).toEqual(fallback);
  expect(loadUi(memoryStorage({ "tertulia-margins:ui": "{oops" }).storage)).toEqual(fallback);
  expect(loadUi(memoryStorage({ "tertulia-margins:ui": '{"view":"drawer","isSidebarOpen":"yes"}' }).storage)).toEqual(fallback);
  expect(loadUi(throwing)).toEqual(fallback);
  expect(loadUi(memoryStorage({ "tertulia-margins:ui": '{"view":"chat","isSidebarOpen":false,"theme":"purple"}' }).storage)).toEqual({ ...fallback, view: "chat", isSidebarOpen: false });
  expect(() => saveUi(throwing, { view: "chat", isSidebarOpen: true, theme: "light", notesShare: 0.6 })).not.toThrow();
});

test("the divider's saved width is clamped to its range; a non-number falls back to 60%", () => {
  const load = (notesShare: unknown) => loadUi(memoryStorage({ "tertulia-margins:ui": JSON.stringify({ notesShare }) }).storage).notesShare;
  expect(load(0.42)).toBe(0.42);
  expect(load(0.123456 + 0.4)).toBe(0.523);
  expect(load(0.1)).toBe(0.35);
  expect(load(0.99)).toBe(0.75);
  expect(load("wide")).toBe(0.6);
  expect(load(null)).toBe(0.6);
});

// ---- Books (D31) ----
const LIBRARY = "tertulia-margins:library";

test("first v2 run: v1's state becomes \"My first book\", and the v1 key stays as a backup", () => {
  const v1 = JSON.stringify(state);
  const { storage, data } = memoryStorage({ [KEY]: v1 });
  const library = loadLibrary(storage);
  expect(library).toEqual({ books: [{ id: "first", title: "My first book" }], currentId: "first" });
  expect(data[bookKey("first")]).toBe(v1);
  expect(data[KEY]).toBe(v1);
  expect(loadState(storage, bookKey("first"))).toEqual(state);
  expect(JSON.parse(data[LIBRARY])).toEqual(library);
});

test("no v1 data: one empty first book", () => {
  const { storage, data } = memoryStorage();
  expect(loadLibrary(storage).books).toEqual([{ id: "first", title: "My first book" }]);
  expect(data[bookKey("first")]).toBeUndefined();
});

test("a corrupt library is rebuilt without overwriting a first book already saved", () => {
  const saved = JSON.stringify({ ...state, notes: "newer notes" });
  const { storage, data } = memoryStorage({ [LIBRARY]: "{oops", [KEY]: JSON.stringify(state), [bookKey("first")]: saved });
  expect(loadLibrary(storage).currentId).toBe("first");
  expect(data[bookKey("first")]).toBe(saved);
});

test("library round-trips; bad books are dropped, duplicates kept once, a missing current id falls back", () => {
  const { storage } = memoryStorage();
  const library: Library = { books: [{ id: "a", title: "Austen" }, { id: "b", title: "Harpman" }], currentId: "b" };
  expect(saveLibrary(storage, library)).toBeUndefined();
  expect(loadLibrary(storage)).toEqual(library);
  const raw = JSON.stringify({ books: [{ id: "a", title: "Austen" }, { id: "a", title: "Again" }, { id: "", title: "x" }, { id: "c", title: " " }, 7], currentId: "zzz" });
  expect(loadLibrary(memoryStorage({ [LIBRARY]: raw }).storage)).toEqual({ books: [{ id: "a", title: "Austen" }], currentId: "a" });
  expect(loadLibrary(throwing).books).toHaveLength(1);
  expect(saveLibrary(throwing, library)).toBe("save_failed");
});

test("books are added (and opened), renamed and deleted; titles must not be empty; the last book stays", () => {
  const one: Library = { books: [{ id: "first", title: "My first book" }], currentId: "first" };
  const two = addBook(one, "b", "  Harpman  ") as Library;
  expect(two).toEqual({ books: [{ id: "first", title: "My first book" }, { id: "b", title: "Harpman" }], currentId: "b" });
  expect(addBook(one, "c", "   ")).toBe("title_empty");
  expect((renameBook(two, "first", "Austen") as Library).books[0].title).toBe("Austen");
  expect(renameBook(two, "first", "")).toBe("title_empty");
  expect(deleteBook(two, "b")).toEqual({ books: [{ id: "first", title: "My first book" }], currentId: "first" });
  expect(deleteBook({ ...two, currentId: "first" }, "b")).toMatchObject({ currentId: "first" });
  expect(deleteBook(one, "first")).toBe("last_book");
});

test("each book's state lives under its own key", () => {
  const { storage } = memoryStorage();
  saveState(storage, bookKey("a"), state);
  saveState(storage, bookKey("b"), { ...emptyState(), notes: "other" });
  expect(loadState(storage, bookKey("a"))).toEqual(state);
  expect(loadState(storage, bookKey("b")).notes).toBe("other");
});

test("daily replies count per local day, reset on a new day, and never throw (D35)", () => {
  const { storage } = memoryStorage();
  expect(localDay(new Date(2026, 9, 2))).toBe("2026-10-02");
  expect(loadRepliesToday(storage, "2026-10-12")).toBe(0);
  expect(recordReply(storage, "2026-10-12")).toBe(1);
  expect(recordReply(storage, "2026-10-12")).toBe(2);
  expect(loadRepliesToday(storage, "2026-10-12")).toBe(2);
  expect(loadRepliesToday(storage, "2026-10-13")).toBe(0);
  expect(recordReply(storage, "2026-10-13")).toBe(1);
  expect(loadRepliesToday(memoryStorage({ "tertulia-margins:usage": "{oops" }).storage, "2026-10-12")).toBe(0);
  expect(loadRepliesToday(throwing, "2026-10-12")).toBe(0);
  expect(recordReply(throwing, "2026-10-12")).toBe(1);
});
