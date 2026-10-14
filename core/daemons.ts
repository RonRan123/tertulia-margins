// Daemons (D37): named companions in the margin, each one persona × one action. Like COMMANDS and
// REACTIONS, both are rows. The action is app-owned: its prompt sets the job and what it must cite;
// the persona (name, colour, and a prompt file holding voice, personality and free-text prompt) sets
// who says it. Browser-safe (no node:fs): the UI imports the table and the cadence below.
import { findExcerpt, splitBlocks } from "./blocks.ts";
import { LIMITS } from "./limits.ts";

export const ACTIONS = {
  connect: { promptFile: "action-connect.md" },
  counter: { promptFile: "action-counter.md" },
};

export const DAEMONS = {
  author: { name: "The Author", colour: "#8a7650", action: "connect", promptFile: "daemon-author.md" },
  "devils-advocate": { name: "The Devil's Advocate", colour: "#b4441a", action: "counter", promptFile: "daemon-devils-advocate.md" },
} as const satisfies Record<string, { name: string; colour: string; action: keyof typeof ACTIONS; promptFile: string }>;

export type DaemonId = keyof typeof DAEMONS;
export const DAEMON_IDS = Object.keys(DAEMONS) as DaemonId[];

// One run looks at `excerpt`: the reader's new or changed lines. `mustPick`: the margin has gone too
// long without a card, so the reviewer must show one if any daemon drafted something.
export type DaemonsRequest = { excerpt: string; mustPick?: boolean };
// A daemon's draft that survived the grounding check. `anchor`: the words of the excerpt it answers.
export type Nugget = { daemon: DaemonId; text: string; anchor: string };

// ---- When daemons look (D37) ----
// A book's daemon state. `cards`: shown in the margin. `pool`: runners-up the reviewer didn't
// pick, kept to fill the floor later without a call. `seen`: fingerprints of the lines the daemons
// have read. `linesSinceCard`: the reader's own lines read since the last card appeared.
export type DaemonCard = Nugget & { id: string };
export type DaemonState = { cards: DaemonCard[]; pool: DaemonCard[]; seen: string[]; linesSinceCard: number };

// A book the daemons haven't met yet: what is already written counts as seen, so they never
// sweep the reader's backlog.
export const freshDaemonState = (notes: string): DaemonState => ({ cards: [], pool: [], seen: linePrints(notes), linesSinceCard: 0 });

// What to do now that the reader has paused. Free first: once the floor is due, a runner-up
// whose words are still in the notes is shown without a call. Otherwise a run, once enough of the
// reader's own lines are new; it reads every paragraph holding one, whole, for context. `wait`
// says how many new lines there are so far, for the margin's status.
// `isAsked`: the reader pressed "React to notes", so run now and show something: on the new lines
// if there are any, else on the most recent ~minLines lines of the notes.
export type DaemonPlan =
  | { kind: "wait"; lines: number }
  | { kind: "promote"; card: DaemonCard }
  | { kind: "run"; excerpt: string; paragraphs: string[]; lines: number; mustPick: boolean };

export function planDaemons(notes: string, state: DaemonState, isAsked = false): DaemonPlan {
  const blocks = splitBlocks(notes);
  const isSeen = seenChecker(state.seen);
  const paragraphs: string[] = [];
  let lines = 0;
  for (const { text } of blocks) {
    const newLines = text.split("\n").filter((line) => !isSeen(line)).reduce((sum, line) => sum + ownLines(line), 0);
    if (newLines === 0) continue;
    paragraphs.push(text);
    lines += newLines;
  }
  if (isAsked) {
    const recent = lines > 0 ? paragraphs : recentParagraphs(blocks.map((b) => b.text));
    if (recent.length === 0) return { kind: "wait", lines: 0 };
    return { kind: "run", excerpt: recent.join("\n\n"), paragraphs: recent, lines, mustPick: true };
  }
  const isFloorDue = state.linesSinceCard + lines >= LIMITS.daemons.floorLines;
  const runnerUp = isFloorDue ? state.pool.find((c) => findExcerpt(notes, c.anchor)) : undefined;
  if (runnerUp) return { kind: "promote", card: runnerUp };
  if (lines < LIMITS.daemons.minLines) return { kind: "wait", lines };
  return { kind: "run", excerpt: paragraphs.join("\n\n"), paragraphs, lines, mustPick: isFloorDue };
}

// The last paragraphs of the notes holding about minLines of the reader's own lines (fewer if the
// notes are shorter), in note order.
function recentParagraphs(paragraphs: string[]): string[] {
  const recent: string[] = [];
  let lines = 0;
  for (const text of [...paragraphs].reverse()) {
    if (lines >= LIMITS.daemons.minLines) break;
    const own = ownLines(text);
    if (own === 0) continue;
    recent.unshift(text);
    lines += own;
  }
  return recent;
}

// A run's result folded in: its paragraphs are seen; the pick becomes a card; the rest join the pool.
export function afterRun(state: DaemonState, plan: Extract<DaemonPlan, { kind: "run" }>, pick: DaemonId | null, nuggets: Nugget[], newId: () => string): DaemonState {
  const made = nuggets.map((n) => ({ ...n, id: newId() }));
  const card = made.find((c) => c.daemon === pick);
  const runnersUp = made.filter((c) => c !== card);
  return {
    cards: card ? [...state.cards, card] : state.cards,
    pool: [...runnersUp, ...state.pool].slice(0, LIMITS.daemons.poolSize),
    seen: [...state.seen, ...linePrints(plan.paragraphs.join("\n"))].slice(-SEEN_LIMIT),
    linesSinceCard: card ? 0 : state.linesSinceCard + plan.lines,
  };
}

export function afterPromote(state: DaemonState, card: DaemonCard): DaemonState {
  return { ...state, cards: [...state.cards, card], pool: state.pool.filter((c) => c.id !== card.id), linesSinceCard: 0 };
}

export const dismissCard = (state: DaemonState, id: string): DaemonState => ({ ...state, cards: state.cards.filter((c) => c.id !== id) });

const SEEN_LIMIT = 5_000; // line fingerprints kept per book: far more than a book's notes hold
const UNCHANGED = 0.8; // share of words two versions of a line share when it's only been touched up
const MIN_WORDS_TO_COMPARE = 6;
const WORDS_PER_LINE = 12; // about one line of the notes column (700px), so long unwrapped lines count fairly

// How many lines of the reader's own words a piece of the notes holds: a line is ~12 words, and
// headings, blockquotes, bare page references and lines that are mostly a quote don't count,
// since a daemon has nothing to answer in words copied from the book.
export function ownLines(text: string): number {
  return text.split("\n").reduce((sum, line) => {
    const trimmed = line.trim();
    const isHeading = /^#{1,6}\s/.test(trimmed);
    const isBlockquote = trimmed.startsWith(">");
    const isPageRefOnly = trimmed.replace(/\[?\s*(?:pdf\s*)?(?:pp?\.|pages?)\s*[\divxlc]+(?:\s*[-–]\s*[\divxlc]+)?\s*\]?/gi, "").replace(/[\s\-*+.,;:()]/g, "") === "";
    const quoted = [...trimmed.matchAll(/[“"]([^“”"]*)[”"]/g)].reduce((total, m) => total + m[0].length, 0);
    const isMostlyQuote = quoted > trimmed.length * 0.6;
    const isOwn = trimmed !== "" && !isHeading && !isBlockquote && !isPageRefOnly && !isMostlyQuote;
    return isOwn ? sum + Math.ceil(trimmed.split(/\s+/).length / WORDS_PER_LINE) : sum;
  }, 0);
}

// A line counts as seen if its words match a seen one, or, for a line long enough to tell, nearly
// all of them do (a typo fixed). Short lines must match exactly: two different short lines can
// share most of their few words. The seen lines are indexed once per check of the notes.
function seenChecker(seen: string[]): (line: string) => boolean {
  const exact = new Set(seen);
  const wordSets = seen.map((print) => new Set(print.split(" "))).filter((words) => words.size >= MIN_WORDS_TO_COMPARE);
  return (line) => {
    const print = fingerprint(line);
    if (print === "" || exact.has(print)) return true;
    const words = new Set(print.split(" "));
    if (words.size < MIN_WORDS_TO_COMPARE) return false;
    return wordSets.some((other) => {
      const shared = [...words].filter((w) => other.has(w)).length;
      return shared / Math.max(words.size, other.size) >= UNCHANGED;
    });
  };
}

const fingerprint = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const linePrints = (text: string) => text.split("\n").map(fingerprint).filter((print) => print !== "");
