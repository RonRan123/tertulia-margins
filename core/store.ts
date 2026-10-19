// The only module that touches storage (D7): books (D31), each with its reference text, notes, chat
// and daemons (D37), survive a reload. Storage is injected ({ getItem, setItem, removeItem }) so
// the page passes localStorage and tests pass a fake.
import type { CitationCheck } from "./citations.ts";
import type { Turn } from "./converse.ts";
import type { PageLabels } from "./passage.ts";
import { DAEMON_IDS, freshDaemonState, type DaemonCard, type DaemonState } from "./daemons.ts";
import { freshQuiz, pickQuiz, type QuizState } from "./quiz.ts";

// An assistant message keeps the page labels of the paragraphs it cites (see citedPages), so
// editing the reference text later doesn't change old replies' labels. Only those few labels:
// one per paragraph of the book, per reply, would fill the ~5 MB storage quota.
export type ChatMessage = Turn & {
  pages?: PageLabels;
  citations?: CitationCheck[];
  error?: string;
  isStreaming?: boolean;
};
// `daemons`: the margin's cards and what the daemons have read (D37). Margin reactions (D18, D20)
// were replaced by daemons: a book saved with them loads without them. `quiz`: the current quiz,
// so a reload or a book switch resumes it (D42).
export type AppState = { reference: string; notes: string; messages: ChatMessage[]; daemons: DaemonState; quiz: QuizState };
export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export type StoreError = "save_failed"; // storage full, blocked (private mode) or unavailable

export const STORAGE_KEY = "tertulia-margins:v1"; // v1's single book; kept as a backup after migration
export const emptyState = (): AppState => ({ reference: "", notes: "", messages: [], daemons: freshDaemonState(""), quiz: freshQuiz() });

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
  const notes = typeof saved.notes === "string" ? saved.notes : "";
  return {
    reference: typeof saved.reference === "string" ? saved.reference : "",
    notes,
    messages: finishedMessages(messages),
    // No daemon state yet (a new book, or one saved before D37): what's written counts as seen.
    daemons: pickDaemons(saved.daemons) ?? freshDaemonState(notes),
    quiz: pickQuiz(saved.quiz) ?? freshQuiz(),
  };
}

export function saveState(storage: KeyValueStorage, key: string, state: AppState): StoreError | undefined {
  const { reference, notes, messages, daemons, quiz } = state;
  try {
    const saved = { reference, notes, messages: finishedMessages(messages), daemons, quiz };
    storage.setItem(key, JSON.stringify(saved));
  } catch {
    return "save_failed";
  }
}

// Layout (D22), remembered per browser under its own key so it never touches the reader's data.
// "notes+…" views put margin, quiz (D42), PDF or chat beside the notes; the others fill the space alone.
export const VIEWS = ["notes+margin", "notes+quiz", "notes+pdf", "notes+chat", "notes", "quiz", "pdf", "chat"] as const;
export type View = (typeof VIEWS)[number];
export type Theme = "light" | "dark"; // D28: light unless the reader switches
// notesShare: the notes' fraction of the width beside the sidebar when a pane sits beside them
// (the draggable divider); the rest goes to the margin, PDF or chat.
// autocomplete, pageLinks: switches in the settings gear (D47), on unless the reader turns them off.
// reactions: the margin's Show/Hide reactions toggle (D50); hidden, the daemons do nothing at all.
// pdfDark: the settings gear's "Dark PDF pages" (D57), off unless the reader turns it on.
export type UiState = {
  view: View;
  isSidebarOpen: boolean;
  theme: Theme;
  notesShare: number;
  autocomplete: boolean;
  pageLinks: boolean;
  reactions: boolean;
  pdfDark: boolean;
};
export const UI_KEY = "tertulia-margins:ui";
export const NOTES_SHARE = { min: 0.35, max: 0.75, step: 0.02 };
export const defaultUi: UiState = {
  view: "notes+margin",
  isSidebarOpen: true,
  theme: "light",
  notesShare: 0.6,
  autocomplete: true,
  pageLinks: true,
  reactions: true,
  pdfDark: false,
};
// Rounded to 0.1%, so arrow-key steps don't pile up float noise.
export const clampNotesShare = (share: number) =>
  Math.round(Math.min(NOTES_SHARE.max, Math.max(NOTES_SHARE.min, share)) * 1000) / 1000;

export function loadUi(storage: KeyValueStorage): UiState {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(UI_KEY) ?? "null");
  } catch {
    return defaultUi;
  }
  if (!isRecord(saved)) return defaultUi;
  const isKnownView = VIEWS.includes(saved.view as View);
  const isOn = (setting: unknown) => setting !== false; // older saved UI has no settings: on
  return {
    view: isKnownView ? (saved.view as View) : defaultUi.view,
    isSidebarOpen: typeof saved.isSidebarOpen === "boolean" ? saved.isSidebarOpen : defaultUi.isSidebarOpen,
    theme: saved.theme === "dark" ? "dark" : "light",
    notesShare: Number.isFinite(saved.notesShare) ? clampNotesShare(saved.notesShare as number) : defaultUi.notesShare,
    autocomplete: isOn(saved.autocomplete),
    pageLinks: isOn(saved.pageLinks),
    reactions: isOn(saved.reactions),
    pdfDark: saved.pdfDark === true,
  };
}

// Losing the layout is harmless, so a failed save is ignored (the notes' save reports storage problems).
export function saveUi(storage: KeyValueStorage, ui: UiState) {
  try {
    storage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {}
}

// ---- Daily AI replies (D35) ----
// Per browser, under its own key: how many AI replies were asked for on `day` (local "YYYY-MM-DD").
// Another day's count reads as 0. Never throws: unreadable storage counts as 0 and a failed save
// is ignored, as the cap is a courtesy and the Anthropic spend limit the real ceiling (D34).
export const USAGE_KEY = "tertulia-margins:usage";
export const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const loadRepliesToday = (storage: KeyValueStorage, day: string) => countToday(storage, USAGE_KEY, "replies", day);
// Counts one more reply today; returns the new count.
export const recordReply = (storage: KeyValueStorage, day: string) => addToday(storage, USAGE_KEY, "replies", day);

// Daemon runs (D37) are counted the same way, under their own key, against their own daily cap.
export const DAEMON_USAGE_KEY = "tertulia-margins:daemon-usage";
export const loadDaemonRunsToday = (storage: KeyValueStorage, day: string) => countToday(storage, DAEMON_USAGE_KEY, "runs", day);
export const recordDaemonRun = (storage: KeyValueStorage, day: string) => addToday(storage, DAEMON_USAGE_KEY, "runs", day);

function countToday(storage: KeyValueStorage, key: string, field: string, day: string): number {
  try {
    const saved: unknown = JSON.parse(storage.getItem(key) ?? "null");
    const isToday = isRecord(saved) && saved.day === day && Number.isInteger(saved[field]);
    return isToday ? Math.max(0, saved[field] as number) : 0;
  } catch {
    return 0;
  }
}

function addToday(storage: KeyValueStorage, key: string, field: string, day: string): number {
  const count = countToday(storage, key, field, day) + 1;
  try {
    storage.setItem(key, JSON.stringify({ day, [field]: count }));
  } catch {}
  return count;
}

// A reply still streaming is not saved, nor the question that prompted it: after a reload it would
// be a half-written answer, and history must keep its (question, reply) pairs.
function finishedMessages(messages: ChatMessage[]): ChatMessage[] {
  const last = messages.at(-1);
  const isLastStreaming = last?.role === "assistant" && last.isStreaming === true;
  return isLastStreaming ? messages.slice(0, -2) : messages;
}

// A saved daemon state, or undefined if it's missing or malformed (then the page starts fresh).
// Malformed cards are dropped one by one.
function pickDaemons(saved: unknown): DaemonState | undefined {
  if (!isRecord(saved)) return undefined;
  const { cards, pool, seen, linesSinceCard } = saved;
  const isSeenValid = Array.isArray(seen) && seen.every((x) => typeof x === "string");
  const isValid = Array.isArray(cards) && Array.isArray(pool) && isSeenValid && Number.isInteger(linesSinceCard);
  if (!isValid) return undefined;
  return {
    cards: cards.filter(isDaemonCard).map(pickDaemonCard),
    pool: pool.filter(isDaemonCard).map(pickDaemonCard),
    seen: seen as string[],
    linesSinceCard: Math.max(0, linesSinceCard as number),
  };
}

const isDaemonCard = (c: unknown): c is DaemonCard =>
  isRecord(c) && typeof c.id === "string" && DAEMON_IDS.includes(c.daemon as DaemonCard["daemon"]) && typeof c.text === "string" && typeof c.anchor === "string";
const pickDaemonCard = ({ id, daemon, text, anchor }: DaemonCard): DaemonCard => ({ id, daemon, text, anchor });

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
    ...(Array.isArray(citations) && { citations: citations.filter(isCitation).map(pickCitation) }),
    ...(typeof error === "string" && { error }),
    ...(isStreaming === true && { isStreaming }),
  };
}

// Page cites since D38 (`pages`); a check saved before then (`cited` paragraph numbers) keeps its
// quote and status, with no pages.
const isCitation = (c: unknown): c is CitationCheck => isRecord(c) && typeof c.quote === "string" && typeof c.status === "string";
const pickCitation = ({ quote, status, pages }: CitationCheck): CitationCheck => ({
  quote,
  status,
  pages: Array.isArray(pages) ? pages.filter((p) => typeof p === "string") : [],
});

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
