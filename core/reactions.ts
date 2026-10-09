// Marginalia (D18, D20): a reaction is the AI's reply in the margin to one excerpt of the notes.
// Like COMMANDS, each kind is a row; a router call picks the kind when the reader doesn't.
// Browser-safe (no node:fs): the UI imports the kinds and the anchoring helpers too.

export const REACTIONS = {
  question: { promptFile: "react-question.md", maxTokens: 4000 },
  pushback: { promptFile: "react-pushback.md", maxTokens: 4000 },
  connection: { promptFile: "react-connection.md", maxTokens: 4000 },
};
// The router answers one word, but Sonnet 5.5 thinks adaptively even at effort low (no way to turn
// it off without changing the cached request shape), so leave room for that before the word.
export const ROUTER = { promptFile: "react-router.md", maxTokens: 1000 };

export type ReactionKind = keyof typeof REACTIONS;
// `kind` absent → the router picks it. A thread reply always sends the kind it already has.
export type ReactionRequest = { excerpt: string; kind?: ReactionKind };

export const isReactionKind = (kind: unknown): kind is ReactionKind => typeof kind === "string" && Object.hasOwn(REACTIONS, kind);

// The router's answer → a kind: the first of the three words it mentions, any case.
// Anything else (empty, cut off, chatty) falls back to "question", the gentlest kind.
export function parseRouterKind(answer: string): ReactionKind {
  const match = answer.match(/\b(question|pushback|connection)\b/i);
  return match ? (match[1].toLowerCase() as ReactionKind) : "question";
}

// What React acts on: the trimmed selection, or with no selection the blank-line-separated
// paragraph (block, D20) around the cursor. Undefined when that is empty (cursor on a blank line).
export function reactTarget(notes: string, selectionStart: number, selectionEnd: number): string | undefined {
  const selection = notes.slice(selectionStart, selectionEnd).trim();
  if (selection !== "") return selection;
  const isOnlyWhitespaceSelected = selectionEnd > selectionStart;
  if (isOnlyWhitespaceSelected) return undefined;

  const blankLines = /\n(?:[^\S\n]*\n)+/g; // one or more blank lines between paragraphs
  let start = 0;
  for (const match of notes.matchAll(blankLines)) {
    const [from, to] = [match.index, match.index + match[0].length];
    const isCursorInside = selectionStart > from && selectionStart < to; // on the blank line itself
    if (isCursorInside) return undefined;
    if (to <= selectionStart) start = to;
    if (from >= selectionStart) return notes.slice(start, from).trim() || undefined;
  }
  return notes.slice(start).trim() || undefined;
}

// Where a reaction's excerpt is in the notes now (D20: anchor by text, not position).
// Exact match first; then one that differs only in whitespace (a rewrapped line). Undefined → "note changed".
export function findExcerpt(notes: string, excerpt: string): { start: number; end: number } | undefined {
  const target = excerpt.trim();
  if (target === "") return undefined;
  const exact = notes.indexOf(target);
  if (exact !== -1) return { start: exact, end: exact + target.length };

  const words = target.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const loose = new RegExp(words.join(String.raw`\s+`)).exec(notes);
  return loose ? { start: loose.index, end: loose.index + loose[0].length } : undefined;
}
