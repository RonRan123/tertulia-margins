// DESIGN.md §6.2 step 3: verify every quoted span appears in the paragraph it cites.

export type CitationStatus =
  | "ok"
  | "citation_missing" // quote has no [¶n] in its sentence
  | "citation_not_found" // cites a paragraph number that does not exist
  | "quote_not_in_paragraph"; // the quote is not in any cited paragraph

export type CitationCheck = { quote: string; cited: number[]; status: CitationStatus };

const MIN_QUOTE_WORDS = 3; // shorter spans are scare-quotes, not citations
const QUOTE = /[“"]([^“”"]+)[”"]/g;
// A fresh global RegExp per call: a shared one would carry `lastIndex` state between callers.
export const citationPattern = () => /\[¶(\d+)(?:\s*[-–]\s*(\d+))?\]/g;
// Split after . ! ? but not after a title like "Mr." (period-ending abbreviations).
const SENTENCE_END = /(?<!\b(?:Mr|Mrs|Ms|Dr|St)\.)(?<=[.!?])\s+|\n+/;

export function checkCitations(reply: string, paragraphs: string[]): CitationCheck[] {
  // Swap quotes for placeholders so periods inside a quote don't end the sentence.
  const quotes: string[] = [];
  const masked = reply.replace(QUOTE, (_, q: string) => `\u0000${quotes.push(q) - 1}\u0000`);
  const sentences = masked.split(SENTENCE_END);

  const checks: CitationCheck[] = [];
  for (const sentence of sentences) {
    const cited = [...sentence.matchAll(citationPattern())].flatMap(([, from, to]) => range(Number(from), Number(to ?? from)));
    for (const [, index] of sentence.matchAll(/\u0000(\d+)\u0000/g)) {
      const quote = quotes[Number(index)];
      const isScareQuote = quote.trim().split(/\s+/).length < MIN_QUOTE_WORDS;
      if (isScareQuote) continue;
      checks.push({ quote, cited, status: statusOf(quote, cited, paragraphs) });
    }
  }
  return checks;
}

function statusOf(quote: string, cited: number[], paragraphs: string[]): CitationStatus {
  if (cited.length === 0) return "citation_missing";
  const citesMissingParagraph = cited.some((n) => n < 1 || n > paragraphs.length);
  if (citesMissingParagraph) return "citation_not_found";
  // An ellipsis means "text omitted": each fragment must appear in the paragraph.
  const fragments = normalize(quote).split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean);
  const isFound = cited.some((n) => fragments.every((f) => normalize(paragraphs[n - 1]).includes(f)));
  return isFound ? "ok" : "quote_not_in_paragraph";
}

// Compare text, not typography: case, curly quotes, _italics_ and *markdown* markers, spacing, trailing punctuation.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[_*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "");
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(to - from + 1, 1) }, (_, i) => from + i);
}
