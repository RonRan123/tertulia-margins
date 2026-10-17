// Example books (D49): two books every visitor gets once, so nobody starts from an empty page:
// Pride and Prejudice ch. I–VIII (public domain, with labelled sample notes) and Politics as a
// Vocation (Gerth & Mills, shown with the publisher's permission, with Ronith's notes). Each lives
// in public/examples/<file>.json (title, notes, daemon cards, chat) beside its PDF; the browser
// builds the reference text from the PDF when it seeds them (lib/examples.ts). They are ordinary,
// editable books; "Restore examples" puts them back as shipped. Browser-safe.
import { freshDaemonState, type Nugget } from "./daemons.ts";
import { freshQuiz } from "./quiz.ts";
import type { AppState, ChatMessage, Library } from "./store.ts";

export const EXAMPLES = [
  { id: "example-politics-as-a-vocation", file: "politics-as-a-vocation" },
  { id: "example-pride-and-prejudice", file: "pride-and-prejudice" },
] as const;
export const EXAMPLES_KEY = "tertulia-margins:examples"; // set once a browser has been given them

export type ExampleFile = { title: string; pdf: string; notes: string; cards: Nugget[]; messages: ChatMessage[] };

export function isExampleFile(v: unknown): v is ExampleFile {
  if (typeof v !== "object" || v === null) return false;
  const { title, pdf, notes, cards, messages } = v as Record<string, unknown>;
  return typeof title === "string" && typeof pdf === "string" && typeof notes === "string" && Array.isArray(cards) && Array.isArray(messages);
}

// The book as a visitor first sees it: its notes, its cards (with fresh ids), its chat, and the
// notes counted as already read, so the daemons answer only what the visitor adds.
export function exampleState(file: ExampleFile, reference: string, newId: () => string): AppState {
  return {
    reference,
    notes: file.notes,
    messages: file.messages,
    daemons: { ...freshDaemonState(file.notes), cards: file.cards.map((card) => ({ ...card, id: newId() })) },
    quiz: freshQuiz(),
  };
}

// The library with the examples at the top (an example already there keeps its place and title).
// `openId`: the book to open, or keep the open one.
export function withExamples(library: Library, examples: { id: string; title: string }[], openId = library.currentId): Library {
  const missing = examples.filter((e) => !library.books.some((b) => b.id === e.id)).map(({ id, title }) => ({ id, title }));
  return { books: [...missing, ...library.books], currentId: openId };
}
