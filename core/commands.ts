// Commands on a selection (DESIGN §6.1, D17): a command is a row in a table. No model column
// yet: the MVP uses one model (D11, D12). Browser-safe (no node:fs): the UI imports this too.
import { LIMITS } from "./limits.ts";
import { parsePassage } from "./passage.ts";

export const COMMANDS = {
  define: { promptFile: "define.md", maxTokens: LIMITS.replyTokens.define },
  quiz: { promptFile: "quiz.md", maxTokens: LIMITS.replyTokens.quiz },
};

export type CommandName = keyof typeof COMMANDS;
export type Command = { name: CommandName; selection: string };

export const isCommandName = (name: unknown): name is CommandName => typeof name === "string" && Object.hasOwn(COMMANDS, name);

// /define takes a word or short phrase: one line, at most 4 words and 40 characters (D17 UX).
export function isDefinable(selection: string): boolean {
  const phrase = selection.trim();
  const isOneLine = !phrase.includes("\n");
  return phrase !== "" && isOneLine && phrase.length <= 40 && phrase.split(/\s+/).length <= 4;
}

// What chat shows for a command: "/define melancholy", "/quiz", or "/quiz on: “first 60 chars…”".
// The full selection travels separately, in `command.selection`.
export function commandLabel({ name, selection }: Command): string {
  const text = selection.trim().replace(/\s+/g, " ");
  if (name === "define") return `/define ${text}`;
  if (text === "") return "/quiz";
  const isLong = text.length > 60;
  return `/quiz on: “${isLong ? `${text.slice(0, 60)}…` : text}”`;
}

// How far around the selection a note cite counts as "nearby": the selection's own lines plus
// this many lines above and below. Among those, the cite closest in characters wins (D17).
const NEARBY_LINES = 5;

// A ¶ cite swallows a page that follows inside its brackets ("[¶4, p. 12]", "[¶12 · p. 101]") so the
// ¶ number, the more precise one, decides. Otherwise a page cite: "p. 48", "[p. 48]", "pp. 10-11".
const NOTE_CITE = /¶\s*(\d+)(?:\s*[-–]\s*(\d+))?(?:\s*[,·]\s*(?:pdf\s*)?pp?\.?\s*[\divxlc]+(?:\s*[-–]\s*[\divxlc]+)?)?|\bpp?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi;
// Split after . ! ? (and a closing quote or bracket), but not after a title like "Mr.".
const SENTENCE_END = /(?<!\b(?:Mr|Mrs|Ms|Dr|St)\.)(?<=[.!?]["”’)]?)\s+/;

type Span = { from: number; to: number };
type Occurrence = { paragraph: number; page?: string; sentence: string };

// The /define quote for the selection notes[start, end): one verbatim passage sentence containing
// the selected word or phrase, formatted `> “sentence” [¶4, p. 12]`. Undefined if it's not in the passage.
export function defineQuote(passage: string, notes: string, start: number, end: number): string | undefined {
  const occurrences = findOccurrences(passage, notes.slice(start, end));
  if (occurrences.length === 0) return undefined;
  const cite = nearestCite(notes, start, end);
  const distance = (o: Occurrence) => {
    if (!cite) return 0;
    if (cite.kind === "paragraph") return gap(cite.span, { from: o.paragraph, to: o.paragraph });
    const pages = pageSpan(o.page);
    return pages ? gap(cite.span, pages) : Infinity;
  };
  // reduce keeps the earlier occurrence on a tie, so no cite (or no usable page) → the first one.
  const best = occurrences.reduce((a, b) => (distance(b) < distance(a) ? b : a));
  // Dialogue already carries its own quote marks: don't wrap it in a second pair.
  const isQuoted = /^["“‘']/.test(best.sentence) && /["”’'][.!?,;:]*$/.test(best.sentence);
  const quoted = isQuoted ? best.sentence : `“${best.sentence}”`;
  return `> ${quoted} [¶${best.paragraph}${best.page ? `, ${best.page}` : ""}]`;
}

// The word or phrase a selection names: stray markdown and punctuation at either end dropped
// ("**Netherfield**," → "Netherfield"). Define matches, labels and sends this.
export const trimPhrase = (selection: string) => selection.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

// Puts `line` on its own line after the selection's last line; returns the new notes and the caret
// position just after the inserted line. A blank line follows it if the next line has text, so
// markdown doesn't fold that text into the blockquote.
export function insertAfterLine(notes: string, end: number, line: string): { notes: string; caret: number } {
  const isEndAfterNewline = end > 0 && notes[end - 1] === "\n"; // a whole-line selection ends on the next line
  const lineEnd = notes.indexOf("\n", isEndAfterNewline ? end - 1 : end);
  const at = lineEnd === -1 ? notes.length : lineEnd;
  const rest = notes.slice(at);
  const isNextLineText = /^\n[^\S\n]*\S/.test(rest);
  const inserted = `\n${line}${isNextLineText ? "\n" : ""}`;
  return { notes: notes.slice(0, at) + inserted + rest, caret: at + 1 + line.length };
}

// Every passage sentence containing the phrase (case-insensitive, whole words, any spacing), in order.
function findOccurrences(passage: string, selection: string): Occurrence[] {
  const phrase = trimPhrase(selection);
  if (phrase === "") return [];
  const words = phrase.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(String.raw`(?<![\p{L}\p{N}])${words.join(String.raw`\s+`)}(?![\p{L}\p{N}])`, "iu");

  return parsePassage(passage).flatMap(({ text, page }, i) =>
    text
      .split(SENTENCE_END)
      .filter((sentence) => pattern.test(sentence))
      .map((sentence) => ({ paragraph: i + 1, page, sentence: sentence.replace(/\s+/g, " ") })),
  );
}

function nearestCite(notes: string, start: number, end: number) {
  const lineOf = (offset: number) => notes.slice(0, offset).split("\n").length - 1;
  const [firstLine, lastLine] = [lineOf(start), lineOf(end)];
  let nearest: { kind: "paragraph" | "page"; span: Span; distance: number } | undefined;

  for (const match of notes.matchAll(NOTE_CITE)) {
    const [from, to] = [match.index, match.index + match[0].length];
    const isNearby = lineOf(from) >= firstLine - NEARBY_LINES && lineOf(from) <= lastLine + NEARBY_LINES;
    if (!isNearby) continue;
    const distance = gap({ from: start, to: end }, { from, to });
    if (nearest && nearest.distance <= distance) continue;
    const isParagraph = match[1] !== undefined;
    const [first, last] = isParagraph ? [match[1], match[2]] : [match[3], match[4]];
    const span = { from: Number(first), to: Number(last ?? first) };
    nearest = { kind: isParagraph ? "paragraph" : "page", span, distance };
  }
  return nearest;
}

// "p. 12" → 12–12, "pp. 10–11" → 10–11, "PDF p. 8" → 8–8. Roman numerals have no usable number.
function pageSpan(label: string | undefined): Span | undefined {
  const numbers = (label?.match(/\d+/g) ?? []).map(Number);
  if (numbers.length === 0) return undefined;
  return { from: Math.min(...numbers), to: Math.max(...numbers) };
}

// How far apart two spans are; 0 if they overlap.
const gap = (a: Span, b: Span) => Math.max(0, a.from - b.to, b.from - a.to);
