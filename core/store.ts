// The only module that touches storage (D7): books (D31), each with its reference text, notes, chat
// and margin reactions, survive a reload. Storage is injected ({ getItem, setItem, removeItem }) so
// the page passes localStorage and tests pass a fake.
import type { CitationCheck } from "./citations.ts";
import type { Turn } from "./converse.ts";
import type { PageLabels } from "./passage.ts";
import { isReactionKind, type ReactionKind } from "./reactions.ts";

// An assistant message keeps the page labels of the paragraphs it cites (see citedPages), so
// editing the reference text later doesn't change old replies' labels. Only those few labels:
// one per paragraph of the book, per reply, would fill the ~5 MB storage quota.
export type ChatMessage = Turn & {
  pages?: PageLabels;
  citations?: CitationCheck[];
  error?: string;
  isStreaming?: boolean;
};
// A margin reaction (D18, D20) is a thread anchored to the exact excerpt it reacted to.
// `messages` starts with the AI's reaction, then (reader reply, AI answer) pairs. A reply's
// request sends `messages` as `history` (with `reaction: { excerpt, kind }`).
export type Reaction = { id: string; excerpt: string; kind: ReactionKind; messages: ChatMessage[] };
export type AppState = { reference: string; notes: string; messages: ChatMessage[]; reactions: Reaction[] };
export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export type StoreError = "save_failed"; // storage full, blocked (private mode) or unavailable

export const STORAGE_KEY = "tertulia-margins:v1"; // v1's single book; kept as a backup after migration
export const emptyState = (): AppState => ({ reference: "", notes: "", messages: [], reactions: [] });

// ---- Books (D31) ----
// The library lists the books and which one is open; each book's state lives under its own key,
// in the v1 shape, so one large reference text never has to be rewritten to save another book.
export type BookMeta = { id: string; title: string };
export type Library = { books: BookMeta[]; currentId: string };
export const LIBRARY_KEY = "tertulia-margins:library";
export const bookKey = (id: string) => `tertulia-margins:book:${id}`;
const FIRST_BOOK: BookMeta = { id: "first", title: "My first book" };

// Missing library: the first run of v2. v1's saved state (if any) is copied into "My first book";
// the v1 key is left as it was, as a backup. A corrupt library is rebuilt the same way, keeping
// any book keys already there. Never throws.
export function loadLibrary(storage: KeyValueStorage): Library {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(LIBRARY_KEY) ?? "null");
  } catch {
    saved = null;
  }
  const books = isRecord(saved) && Array.isArray(saved.books) ? saved.books.filter(isBookMeta).map(({ id, title }) => ({ id, title })) : [];
  const uniqueBooks = books.filter((b, i) => books.findIndex((o) => o.id === b.id) === i);
  if (uniqueBooks.length > 0) {
    const savedId = isRecord(saved) ? saved.currentId : undefined;
    const currentId = uniqueBooks.some((b) => b.id === savedId) ? (savedId as string) : uniqueBooks[0].id;
    return { books: uniqueBooks, currentId };
  }
  const library: Library = { books: [FIRST_BOOK], currentId: FIRST_BOOK.id };
  try {
    const v1 = storage.getItem(STORAGE_KEY);
    const isFirstBookSaved = storage.getItem(bookKey(FIRST_BOOK.id)) !== null;
    if (v1 !== null && !isFirstBookSaved) storage.setItem(bookKey(FIRST_BOOK.id), v1);
    storage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    // Unwritable storage: the page still opens with the first book; its save reports the problem.
  }
  return library;
}

export function saveLibrary(storage: KeyValueStorage, library: Library): StoreError | undefined {
  try {
    storage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    return "save_failed";
  }
}

// Library edits are pure; the page saves the result. A title is trimmed; an empty one is refused.
export type BookError = "title_empty" | "last_book";
export function addBook(library: Library, id: string, title: string): Library | BookError {
  const name = title.trim();
  if (name === "") return "title_empty";
  return { books: [...library.books, { id, title: name }], currentId: id };
}

export function renameBook(library: Library, id: string, title: string): Library | BookError {
  const name = title.trim();
  if (name === "") return "title_empty";
  return { ...library, books: library.books.map((b) => (b.id === id ? { ...b, title: name } : b)) };
}

// The last book can't be deleted: there is always a book to write in. Deleting the open book
// opens the one before it (or the new first one).
export function deleteBook(library: Library, id: string): Library | BookError {
  if (library.books.length <= 1) return "last_book";
  const index = library.books.findIndex((b) => b.id === id);
  const books = library.books.filter((b) => b.id !== id);
  const isCurrent = library.currentId === id;
  return { books, currentId: isCurrent ? books[Math.max(0, index - 1)].id : library.currentId };
}

const isBookMeta = (b: unknown): b is BookMeta =>
  isRecord(b) && typeof b.id === "string" && b.id !== "" && typeof b.title === "string" && b.title.trim() !== "";

// ---- One book's state ----

// Missing, corrupt or unreadable storage falls back to empty state: loading never throws.
export function loadState(storage: KeyValueStorage, key: string): AppState {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(key) ?? "null");
  } catch {
    return emptyState();
  }
  if (!isRecord(saved)) return emptyState();
  const messages = Array.isArray(saved.messages) ? pairs(saved.messages.filter(isMessage).map(pickMessage)) : [];
  return {
    reference: typeof saved.reference === "string" ? saved.reference : "",
    notes: typeof saved.notes === "string" ? saved.notes : "",
    messages: finishedMessages(messages),
    reactions: Array.isArray(saved.reactions) ? finishedReactions(saved.reactions.filter(isReaction).map(pickReaction)) : [],
  };
}

export function saveState(storage: KeyValueStorage, key: string, state: AppState): StoreError | undefined {
  const { reference, notes, messages, reactions } = state;
  try {
    const saved = { reference, notes, messages: finishedMessages(messages), reactions: finishedReactions(reactions) };
    storage.setItem(key, JSON.stringify(saved));
  } catch {
    return "save_failed";
  }
}

// Layout (D22), remembered per browser under its own key so it never touches the reader's data.
// "notes+…" views put margin, PDF or chat beside the notes; the others fill the space alone.
export const VIEWS = ["notes+margin", "notes+pdf", "notes+chat", "notes", "pdf", "chat"] as const;
export type View = (typeof VIEWS)[number];
export type Theme = "light" | "dark"; // D28: light unless the reader switches
export type UiState = { view: View; isSidebarOpen: boolean; theme: Theme };
export const UI_KEY = "tertulia-margins:ui";
const defaultUi: UiState = { view: "notes+margin", isSidebarOpen: true, theme: "light" };

export function loadUi(storage: KeyValueStorage): UiState {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(UI_KEY) ?? "null");
  } catch {
    return defaultUi;
  }
  if (!isRecord(saved)) return defaultUi;
  const isKnownView = VIEWS.includes(saved.view as View);
  return {
    view: isKnownView ? (saved.view as View) : defaultUi.view,
    isSidebarOpen: typeof saved.isSidebarOpen === "boolean" ? saved.isSidebarOpen : defaultUi.isSidebarOpen,
    theme: saved.theme === "dark" ? "dark" : "light",
  };
}

// Losing the layout is harmless, so a failed save is ignored (the notes' save reports storage problems).
export function saveUi(storage: KeyValueStorage, ui: UiState) {
  try {
    storage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {}
}

// A reply still streaming is not saved, nor the question that prompted it: after a reload it would
// be a half-written answer, and history must keep its (question, reply) pairs.
function finishedMessages(messages: ChatMessage[]): ChatMessage[] {
  const last = messages.at(-1);
  const isLastStreaming = last?.role === "assistant" && last.isStreaming === true;
  return isLastStreaming ? messages.slice(0, -2) : messages;
}

// The same rule per thread: an AI answer still streaming isn't saved, nor the reader's reply that
// prompted it; a reaction still streaming its opening message isn't saved at all.
function finishedReactions(reactions: Reaction[]): Reaction[] {
  return reactions
    .map((r) => {
      const last = r.messages.at(-1);
      const isLastStreaming = last?.role === "assistant" && last.isStreaming === true;
      return isLastStreaming ? { ...r, messages: r.messages.slice(0, r.messages.length === 1 ? 0 : -2) } : r;
    })
    .filter((r) => r.messages.length > 0);
}

const isReaction = (r: unknown): r is Reaction =>
  isRecord(r) && typeof r.id === "string" && typeof r.excerpt === "string" && isReactionKind(r.kind) && Array.isArray(r.messages);

// Like chat: malformed messages are dropped, then the thread keeps its shape (the opening
// reaction, then pairs). A thread with no valid opening reaction is dropped.
function pickReaction({ id, excerpt, kind, messages }: Reaction): Reaction {
  const kept = messages.filter(isMessage).map(pickMessage);
  const isOpeningValid = kept[0]?.role === "assistant";
  return { id, excerpt, kind, messages: isOpeningValid ? [kept[0], ...pairs(kept.slice(1))] : [] };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isMessage = (m: unknown): m is ChatMessage =>
  isRecord(m) && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";

// Drops unknown fields and malformed optional ones (or their bad entries), so a bad save can't
// crash rendering. Labels saved in an older shape (`paragraphs`) are ignored.
function pickMessage({ role, content, pages, citations, error, isStreaming }: ChatMessage): ChatMessage {
  return {
    role,
    content,
    ...(isRecord(pages) && { pages: pickPages(pages) }),
    ...(Array.isArray(citations) && { citations: citations.filter(isCitation) }),
    ...(typeof error === "string" && { error }),
    ...(isStreaming === true && { isStreaming }),
  };
}

const isCitation = (c: unknown): c is CitationCheck =>
  isRecord(c) &&
  typeof c.quote === "string" &&
  typeof c.status === "string" &&
  Array.isArray(c.cited) &&
  c.cited.every((n) => typeof n === "number");

const pickPages = (pages: Record<string, unknown>): PageLabels =>
  Object.fromEntries(Object.entries(pages).filter((e): e is [string, string] => /^\d+$/.test(e[0]) && typeof e[1] === "string"));

// History must alternate (question, reply). Dropping a malformed message can leave a reply with
// no question or a question with no reply: those are dropped too, and the intact pairs kept.
function pairs(messages: ChatMessage[]): ChatMessage[] {
  const kept: ChatMessage[] = [];
  for (let i = 0; i + 1 < messages.length; i++) {
    const isPair = messages[i].role === "user" && messages[i + 1].role === "assistant";
    if (!isPair) continue;
    kept.push(messages[i], messages[i + 1]);
    i++;
  }
  return kept;
}
