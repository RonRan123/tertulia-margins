// Marginalia (D18, D20): a reaction is the AI's reply in the margin to one excerpt of the notes.
// Like COMMANDS, each kind is a row; a router call picks the kind when the reader doesn't.
// Browser-safe (no node:fs): the UI imports the kinds and the anchoring helpers too.
import type { Turn } from "./converse.ts";

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

// The margin's order: reactions whose excerpt is still in the notes, by where it starts (ties keep
// creation order), then the detached ones ("Your note changed"), which stay until deleted.
export function placeReactions<R extends { excerpt: string }>(
  notes: string,
  reactions: R[],
): { placed: { reaction: R; start: number; end: number }[]; detached: R[] } {
  const placed: { reaction: R; start: number; end: number }[] = [];
  const detached: R[] = [];
  for (const reaction of reactions) {
    const range = findExcerpt(notes, reaction.excerpt);
    if (range) placed.push({ reaction, ...range });
    else detached.push(reaction);
  }
  placed.sort((a, b) => a.start - b.start); // stable sort: same start keeps creation order
  return { placed, detached };
}

// A thread reply's `history`: the AI's opening reaction, then the (reply, answer) pairs that got an
// answer. A failed answer is dropped with the reply that prompted it, like chat. An opening that
// failed leaves nothing to reply to: [] (the UI offers no Reply then).
export function threadHistory(messages: (Turn & { error?: string })[]): Turn[] {
  const isAnswered = (m?: Turn & { error?: string }) => m?.role === "assistant" && m.content !== "" && !m.error;
  if (!isAnswered(messages[0])) return [];
  const history: Turn[] = [{ role: "assistant", content: messages[0].content }];
  for (let i = 1; i + 1 < messages.length; i += 2) {
    const [reply, answer] = [messages[i], messages[i + 1]];
    if (isAnswered(answer)) history.push({ role: "user", content: reply.content }, { role: "assistant", content: answer.content });
  }
  return history;
}
