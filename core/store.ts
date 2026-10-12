// The only module that touches storage (D7): reference text, notes, chat and margin reactions survive a reload.
// Storage is injected ({ getItem, setItem }) so the page passes localStorage and tests pass a fake.
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
export type KeyValueStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type StoreError = "save_failed"; // storage full, blocked (private mode) or unavailable

export const STORAGE_KEY = "tertulia-margins:v1"; // the page listens for other tabs writing it
export const emptyState = (): AppState => ({ reference: "", notes: "", messages: [], reactions: [] });

// Missing, corrupt or unreadable storage falls back to empty state: loading never throws.
export function loadState(storage: KeyValueStorage): AppState {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
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

export function saveState(storage: KeyValueStorage, state: AppState): StoreError | undefined {
  const { reference, notes, messages, reactions } = state;
  try {
    const saved = { reference, notes, messages: finishedMessages(messages), reactions: finishedReactions(reactions) };
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    return "save_failed";
  }
}

// Layout (D22), remembered per browser under its own key so it never touches the reader's data.
// "notes+…" views put margin, PDF or chat beside the notes; the others fill the space alone.
export const VIEWS = ["notes+margin", "notes+pdf", "notes+chat", "notes", "pdf", "chat"] as const;
export type View = (typeof VIEWS)[number];
export type UiState = { view: View; isSidebarOpen: boolean };
export const UI_KEY = "tertulia-margins:ui";
const defaultUi: UiState = { view: "notes+margin", isSidebarOpen: true };

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
