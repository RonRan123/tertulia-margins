// Quote autocomplete (D46): once the last 4+ words before the caret match the book exactly, the
// notes show the book's next few words as ghost text, up to the end of the clause. Matching is
// normalized like checkCitations (case, curly quotes, _italics_ and *markdown* markers, runs of
// whitespace); the suggestion keeps the book's own casing and punctuation.
import { pageCitePattern } from "./passage.ts";

const MIN_WORDS = 4;
const MAX_WORDS = 5;
const WORD_CHAR = /[\p{L}\p{N}]/u;
// A token ends a clause with . , ; : ! ? (and any closing quotes or brackets after it), or with a
// closing double quote.
const CLAUSE_END = /(?:[.,;:!?]["'”’)\]]*|[”"])$/;

// The book, cleaned, and the same text normalized for matching. `origin[i]` is where normalized
// character i sits in `text`.
export type QuoteIndex = { text: string; normalized: string; origin: number[] };

// Built once per source text (the PDF's whole text, else the reference text).
export function quoteIndex(source: string): QuoteIndex {
  const text = source
    .replace(pageCitePattern(), " ") // page markers never show in a suggestion
    .replace(/(\p{L})-[ \t]*\n\s*(\p{Ll})/gu, "$1$2") // "charis-\nma" → "charisma"
    .replace(/(\p{L})- +(\p{Ll})/gu, "$1$2") // PDF text's "charis- ma" → "charisma"
    .replace(/\s+/g, " ")
    .trim();
  let normalized = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = normalizeChar(text[i]);
    if (char === "") continue;
    normalized += char;
    origin.push(i);
  }
  return { text, normalized, origin };
}

// The book's next words after `before` (the line up to the caret), as they'd be inserted, with
// their leading space; undefined when there's nothing to suggest. When the book continues the
// phrase in more than one way, only the words every continuation shares.
export function suggestQuote(index: QuoteIndex, before: string): string | undefined {
  const tail = normalizeText(before);
  const wordStarts = [...tail.matchAll(/\S+/g)].filter(([token]) => WORD_CHAR.test(token)).map((m) => m.index);
  if (wordStarts.length < MIN_WORDS) return undefined;

  // The longest run of the reader's last words (4 at least) the book has; more words, fewer matches.
  let ends: number[] = [];
  for (let k = MIN_WORDS; k <= wordStarts.length; k++) {
    const key = trimLeadingPunctuation(tail.slice(wordStarts[wordStarts.length - k]));
    const found = k === MIN_WORDS ? occurrences(index.normalized, key) : ends.filter((end) => isMatchAt(index.normalized, key, end - key.length));
    if (found.length === 0) break;
    ends = found;
  }
  if (ends.length === 0) return undefined;

  const continuations = ends.map((end) => nextWords(index.text.slice(index.origin[end - 1] + 1)));
  const shared: string[] = [];
  for (const [i, token] of continuations[0].entries()) {
    const isShared = continuations.every((c) => c[i] !== undefined && normalizeText(c[i]) === normalizeText(token));
    if (!isShared) break;
    shared.push(token);
  }
  const suggestion = shared.join("");
  return suggestion.trim() === "" ? undefined : suggestion;
}

// Up to MAX_WORDS tokens (each with its leading space), stopping after one that ends a clause.
function nextWords(rest: string): string[] {
  const tokens: string[] = [];
  for (const [token] of rest.matchAll(/\s*\S+/g)) {
    tokens.push(token);
    if (tokens.length === MAX_WORDS || CLAUSE_END.test(token)) break;
  }
  return tokens;
}

// Where `key` ends, at each place it starts a word in the book.
function occurrences(normalized: string, key: string): number[] {
  const ends: number[] = [];
  for (let at = normalized.indexOf(key); at !== -1; at = normalized.indexOf(key, at + 1)) {
    if (isMatchAt(normalized, key, at)) ends.push(at + key.length);
  }
  return ends;
}

function isMatchAt(normalized: string, key: string, at: number): boolean {
  const isWordStart = at === 0 || !WORD_CHAR.test(normalized[at - 1]) || !WORD_CHAR.test(key[0]);
  return at >= 0 && isWordStart && normalized.startsWith(key, at);
}

function trimLeadingPunctuation(key: string): string {
  const first = key.search(WORD_CHAR);
  return first === -1 ? key : key.slice(first);
}

function normalizeText(text: string): string {
  return [...text].map(normalizeChar).join("").replace(/ +/g, " ");
}

// One character for matching: lowercase, straight quotes, any whitespace a space; markdown's _ and
// * dropped.
function normalizeChar(char: string): string {
  if (char === "_" || char === "*") return "";
  if (/\s/.test(char)) return " ";
  if (char === "‘" || char === "’") return "'";
  if (char === "“" || char === "”") return '"';
  const lower = char.toLowerCase();
  return lower.length === 1 ? lower : char;
}
