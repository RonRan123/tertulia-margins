// Daemons (D37): named companions in the margin, each one persona × one action. Like COMMANDS and
// REACTIONS, both are rows. The action is app-owned: its prompt sets the job and what it must cite;
// the persona (name, colour, and a prompt file holding voice, personality and free-text prompt) sets
// who says it. Browser-safe (no node:fs): the UI imports the table and the cadence below.
import { findExcerpt, splitBlocks } from "./blocks.ts";
import { LIMITS } from "./limits.ts";

// `isBeyondBook`: the action may bring knowledge from outside the book (D39); its cards say so.
export const ACTIONS = {
  connect: { promptFile: "action-connect.md", isBeyondBook: false },
  counter: { promptFile: "action-counter.md", isBeyondBook: false },
  widen: { promptFile: "action-widen.md", isBeyondBook: true },
};

export const DAEMONS = {
  author: { name: "The Author", colour: "#8a7650", action: "connect", promptFile: "daemon-author.md" },
  "devils-advocate": { name: "The Devil's Advocate", colour: "#b4441a", action: "counter", promptFile: "daemon-devils-advocate.md" },
  scholar: { name: "The Scholar", colour: "#2f7a6b", action: "widen", promptFile: "daemon-scholar.md" },
} as const satisfies Record<string, { name: string; colour: string; action: keyof typeof ACTIONS; promptFile: string }>;

export type DaemonId = keyof typeof DAEMONS;
export const DAEMON_IDS = Object.keys(DAEMONS) as DaemonId[];

// One run looks at `excerpt`: the reader's new or changed lines, and (D51) the paragraphs whose lines
// have no card yet. `mustPick`: the margin has gone too long without a card, so the reviewer must
// show one if any daemon drafted something. `margin`: the cards already shown, which no new remark
// may repeat (D51). `maxCards`: how many cards this run may show (LIMITS.daemons.maxCardsPerRun).
export type MarginRemark = { daemon: DaemonId; text: string; anchor: string };
export type DaemonsRequest = { excerpt: string; mustPick?: boolean; margin?: MarginRemark[]; maxCards?: number };
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
// `isAsked`: the reader pressed "React to notes", so run now, on all the notes, and show something.
export type DaemonPlan =
  | { kind: "wait"; lines: number }
  | { kind: "promote"; card: DaemonCard }
  | { kind: "run"; excerpt: string; paragraphs: string[]; lines: number; mustPick: boolean };

// D51: a run reads every paragraph holding a new line, and every paragraph with a line of the
// reader's own that no card answers yet (the margin is sparse there, e.g. after cards were
// dismissed); only new lines count toward starting one.
export function planDaemons(notes: string, state: DaemonState, isAsked = false): DaemonPlan {
  const blocks = splitBlocks(notes);
  const isSeen = seenChecker(state.seen);
  const isCovered = coverageChecker(notes, state.cards);
  const paragraphs: string[] = [];
  let lines = 0;
  for (const block of blocks) {
    const blockLines = splitLines(block);
    const newLines = blockLines.filter((l) => !isSeen(l.text)).reduce((sum, l) => sum + ownLines(l.text), 0);
    const isSparse = blockLines.some((l) => ownLines(l.text) > 0 && !isCovered(l));
    if (newLines === 0 && !isSparse) continue;
    paragraphs.push(block.text);
    lines += newLines;
  }
  if (isAsked) {
    const all = blocks.map((b) => b.text);
    const hasOwnWords = all.some((text) => ownLines(text) > 0);
    if (!hasOwnWords) return { kind: "wait", lines: 0 };
    return { kind: "run", excerpt: all.join("\n\n"), paragraphs: all, lines, mustPick: true };
  }
  const isFloorDue = state.linesSinceCard + lines >= LIMITS.daemons.floorLines;
  const runnerUp = isFloorDue ? state.pool.find((c) => findExcerpt(notes, c.anchor) && !state.cards.some((s) => isSameRemark(s.text, c.text))) : undefined;
  if (runnerUp) return { kind: "promote", card: runnerUp };
  if (lines < LIMITS.daemons.minLines) return { kind: "wait", lines };
  return { kind: "run", excerpt: paragraphs.join("\n\n"), paragraphs, lines, mustPick: isFloorDue };
}

// D53: what "React to notes" reads: the parts of the notes no card answers, in sections of about
// LIMITS.daemons.sectionLines of the reader's own lines (a long paragraph split by lines, short ones
// grouped), the most recent LIMITS.daemons.maxSections of them, in the notes' order; each becomes one
// run, the first of which must show something. With every line already answered, one run over all
// the notes, as before.
export type RunPlan = Extract<DaemonPlan, { kind: "run" }>;
export function askedRuns(notes: string, state: DaemonState): RunPlan[] {
  const { sectionLines, maxSections } = LIMITS.daemons;
  const isSeen = seenChecker(state.seen);
  const isCovered = coverageChecker(notes, state.cards);
  const own = (lines: Line[]) => lines.reduce((sum, l) => sum + ownLines(l.text), 0);
  const isBare = (lines: Line[]) => lines.some((l) => ownLines(l.text) > 0 && !isCovered(l));

  // Pieces: whole paragraphs, or runs of a long paragraph's lines, that hold a line no card answers.
  const pieces: Line[][] = [];
  for (const block of splitBlocks(notes)) {
    let chunk: Line[] = [];
    const flush = () => {
      if (isBare(chunk)) pieces.push(chunk);
      chunk = [];
    };
    for (const line of splitLines(block)) {
      if (chunk.length > 0 && own(chunk) + ownLines(line.text) > sectionLines) flush();
      chunk.push(line);
    }
    flush();
  }
  // Sections: consecutive pieces packed up to sectionLines own lines.
  const sections: Line[][][] = [];
  for (const piece of pieces) {
    const last = sections.at(-1);
    const fits = last !== undefined && own(last.flat()) + own(piece) <= sectionLines;
    if (fits) last.push(piece);
    else sections.push([piece]);
  }
  if (sections.length === 0) {
    const all = planDaemons(notes, state, true);
    return all.kind === "run" ? [all] : [];
  }
  return sections.slice(-maxSections).map((section, i) => {
    const paragraphs = section.map((piece) => piece.map((l) => l.text).join("\n"));
    const lines = section.flat().filter((l) => !isSeen(l.text)).reduce((sum, l) => sum + ownLines(l.text), 0);
    return { kind: "run", excerpt: paragraphs.join("\n\n"), paragraphs, lines, mustPick: i === 0 };
  });
}

// A run's result folded in: its paragraphs are seen; the picks (indexes into `nuggets`, D51) become
// cards, except any that repeat a card already shown; the rest join the pool.
export function afterRun(state: DaemonState, plan: Extract<DaemonPlan, { kind: "run" }>, picks: number[], nuggets: Nugget[], newId: () => string): DaemonState {
  const made = nuggets.map((n) => ({ ...n, id: newId() }));
  const cards = picks.map((i) => made[i]).filter((c) => c && !state.cards.some((s) => isSameRemark(s.text, c.text)));
  const runnersUp = made.filter((c) => !cards.includes(c));
  return {
    cards: [...state.cards, ...cards],
    pool: [...runnersUp, ...state.pool].slice(0, LIMITS.daemons.poolSize),
    seen: [...state.seen, ...linePrints(plan.paragraphs.join("\n"))].slice(-SEEN_LIMIT),
    linesSinceCard: cards.length > 0 ? 0 : state.linesSinceCard + plan.lines,
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

// ---- One margin, no repeats (D51) ----

// Two remarks make the same point when most of their content words are shared, or when they cite
// the same page and share a good part of them: the same remark reworded, or anchored on other words.
const STOP = new Set(("about above after again against also because been before being below between both could does doing down during each from further have having here into itself just more most much other ought over same should some such than that their them then there these they this those through under until very were what when where which while whom will with would your yours you'll the and but for not are was").split(" "));
export function isSameRemark(a: string, b: string): boolean {
  const words = (text: string) =>
    new Set(
      text.toLowerCase().replace(/\[pp?\.[^\]]*\]/g, " ").replace(/[^\p{L}\s]/gu, " ").split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w))
        .map((w) => w.replace(/s$/, "")),
    );
  const pages = (text: string) => new Set([...text.matchAll(/\[pp?\.\s*([^\]]+)\]/g)].map((m) => m[1].trim()));
  const [wa, wb] = [words(a), words(b)];
  const smaller = Math.min(wa.size, wb.size);
  if (smaller === 0) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length / smaller;
  const isSamePage = [...pages(a)].some((p) => pages(b).has(p));
  return shared >= 0.6 || (isSamePage && shared >= 0.4);
}

// The whole sentence of `text` that holds `anchor` (D51), so the highlight shows what the remark
// answers in context, not a phrase. A sentence ends at . ! or ? followed by a space, or at the end of
// the line; a list marker isn't part of it. The anchor as given if it isn't in `text`, or if its
// sentence runs past MAX_ANCHOR characters.
const MAX_ANCHOR = 400;
export function sentenceAround(text: string, anchor: string): string {
  const found = findExcerpt(text, anchor);
  if (!found) return anchor.trim();
  const lineStart = text.lastIndexOf("\n", found.start - 1) + 1;
  const lineEndAt = text.indexOf("\n", found.end);
  const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
  const before = text.slice(lineStart, found.start);
  const ends = [...before.matchAll(/[.!?]["”')\]]*\s+/g)];
  const last = ends.at(-1);
  let start = last ? lineStart + last.index + last[0].length : lineStart;
  if (!last) start += /^\s*(?:[-*+]|\d+[.)]|>)?\s*/.exec(text.slice(lineStart, lineEnd))![0].length;
  const after = /[.!?]["”')\]]*(?=\s|$)/.exec(text.slice(found.end, lineEnd));
  const end = after ? found.end + after.index + after[0].length : lineEnd;
  const sentence = text.slice(start, end).trim();
  return sentence.length <= MAX_ANCHOR && sentence.length >= anchor.trim().length ? sentence : anchor.trim();
}

// Which lines of the notes a card already answers: a line counts as covered when a card's anchor
// overlaps it. `line` carries its offsets in the notes.
type Line = { text: string; start: number; end: number };
function splitLines(block: { text: string; start: number }): Line[] {
  let at = block.start;
  return block.text.split("\n").map((text) => {
    const line = { text, start: at, end: at + text.length };
    at += text.length + 1;
    return line;
  });
}
function coverageChecker(notes: string, cards: DaemonCard[]): (line: Line) => boolean {
  const ranges = cards.map((c) => findExcerpt(notes, c.anchor)).filter((r) => r !== undefined);
  return (line) => ranges.some((r) => r.start < line.end && r.end > line.start);
}
