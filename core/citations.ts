// DESIGN.md §6.2 step 3 (D38): every quote in AI text is checked against the book. A quote with a
// page cite in its sentence must be on that page; one without must be in the book or the notes.
import { pageCitePattern, type BookPage } from "./passage.ts";

export type CitationStatus =
  | "ok"
  | "page_not_found" // cites a page the reference text doesn't have
  | "quote_not_on_page" // the quote isn't on the cited page (or running on to the next)
  | "quote_not_in_text"; // an uncited quote that is neither in the book nor in the reader's notes

// `pages`: the cited pages as written ("12", "xii"); empty for an uncited quote.
export type CitationCheck = { quote: string; pages: string[]; status: CitationStatus };

const MIN_QUOTE_WORDS = 3; // shorter spans are scare-quotes, not citations
const QUOTE = /[“"]([^“”"]+)[”"]/g;
// Split after . ! ? but not after a title like "Mr." (period-ending abbreviations).
const SENTENCE_END = /(?<!\b(?:Mr|Mrs|Ms|Dr|St)\.)(?<=[.!?])\s+|\n+/;

export function checkCitations(reply: string, book: BookPage[], notes = ""): CitationCheck[] {
  // Swap quotes and cites for placeholders so their periods ("Mr.", "[p. 4]") don't end the sentence.
  const quotes: string[] = [];
  const cites: { from: string; to?: string }[] = [];
  const masked = reply
    .replace(QUOTE, (_, q: string) => `\u0000${quotes.push(q) - 1}\u0000`)
    .replace(pageCitePattern(), (_m, _pdf, from: string, to?: string) => `\u0001${cites.push({ from: from.toLowerCase(), to: to?.toLowerCase() }) - 1}\u0001`);

  const checks: CitationCheck[] = [];
  for (const sentence of masked.split(SENTENCE_END)) {
    const sentenceCites = [...sentence.matchAll(/\u0001(\d+)\u0001/g)].map(([, i]) => cites[Number(i)]);
    for (const [, index] of sentence.matchAll(/\u0000(\d+)\u0000/g)) {
      const quote = quotes[Number(index)];
      const isScareQuote = quote.trim().split(/\s+/).length < MIN_QUOTE_WORDS;
      if (isScareQuote) continue;
      const pages = sentenceCites.flatMap(({ from, to }) => (to ? [from, to] : [from]));
      checks.push({ quote, pages, status: statusOf(quote, sentenceCites, book, notes) });
    }
  }
  return checks;
}

function statusOf(quote: string, cites: { from: string; to?: string }[], book: BookPage[], notes: string): CitationStatus {
  // An ellipsis means "text omitted": each fragment must appear.
  const fragments = normalize(quote).split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean);
  const holds = (text: string) => fragments.every((f) => normalize(text).includes(f));
  if (cites.length === 0) return holds(book.map((p) => p.text).join("\n\n")) || holds(notes) ? "ok" : "quote_not_in_text";

  const spans = cites.map(({ from, to }) => pagesBetween(book, from, to ?? from));
  if (spans.some((span) => span.length === 0)) return "page_not_found";
  // The cited pages plus the page after them: a quote may run across a page break.
  const isOnPage = spans.some((span) => holds(book.slice(span[0], span.at(-1)! + 2).map((p) => p.text).join(" ")));
  return isOnPage ? "ok" : "quote_not_on_page";
}

// Indexes of the pages from `from` to `to` (a single page when equal). Numbers compare as numbers;
// roman or other labels only match exactly.
function pagesBetween(book: BookPage[], from: string, to: string): number[] {
  const [low, high] = [Number(from), Number(to)];
  const isNumeric = Number.isFinite(low) && Number.isFinite(high);
  return book.flatMap((p, i) => {
    if (p.page === undefined) return [];
    const isIn = isNumeric ? Number(p.page) >= low && Number(p.page) <= high : p.page === from || p.page === to;
    return isIn ? [i] : [];
  });
}

// Compare text, not typography: case, curly quotes, _italics_ and *markdown* markers, trailing
// punctuation, and all whitespace, since PDF text often breaks words with stray spaces ("c aprice").
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[_*]/g, "")
    .trim()
    .replace(/[.,;:!?]+$/, "")
    .replace(/\s+/g, "");
}
