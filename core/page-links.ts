// Page links (R4, D33): every page reference in the notes ("[p. 42]", "p. 42", "page 42",
// “…” (42), “…” — 42) is linked to a spot in the book's PDF, by the free methods only, cheapest
// and surest first:
//   1. exact   – the quote next to the reference is found in the PDF's text
//   2. overlap – the paragraph near the estimated page that shares the most distinctive words
//   3. page    – the estimated page alone
// Paper pages and PDF pages differ (D13), so exact hits teach an offset (PDF page − book page)
// that moves every estimate. The links are a layer computed from the notes and the PDF: nothing
// is written into the notes, so the markdown file stays the reader's own. Pure and browser-safe.
export type PageRef = {
  start: number; // the reference's span in the notes
  end: number;
  page: number; // as written: a book page, or a PDF page if marked "PDF"
  isPdfPage: boolean;
  quote?: string; // the quoted words it cites, if there are any
  context: string; // the quote, else the sentence it sits in
};

export type LinkMethod = "exact" | "overlap" | "page";
export type PageLink = PageRef & { pdfPage: number; method: LinkMethod; match?: string };

// ---- Finding references ----

const RANGE = String.raw`(\d+)(?:\s*[-–]\s*\d+)?`;
// Earlier patterns win where two overlap: "[p. 42]" isn't also read as "p. 42".
const REF_PATTERNS: { pattern: RegExp }[] = [
  { pattern: new RegExp(String.raw`\[(PDF\s+)?pp?\.?\s*${RANGE}\]`, "gi") },
  { pattern: new RegExp(String.raw`(?<![\w¶])(PDF\s+)?(?:pp?\.|pg\.?)\s*${RANGE}\b`, "gi") },
  { pattern: new RegExp(String.raw`\b()pages?\s+${RANGE}\b`, "gi") },
  { pattern: new RegExp(String.raw`(?<=["”]\s*)()\(${RANGE}\)`, "g") },
  { pattern: new RegExp(String.raw`(?<=["”]\s*)()[—–]\s*${RANGE}\b`, "g") },
];
// “…” or "…" of at least three words.
const QUOTE = /[“"]([^“”"\n]*?\S(?:\s+\S+){2,}[^“”"\n]*?)[”"]/g;

export function findPageRefs(notes: string): PageRef[] {
  const refs: PageRef[] = [];
  const isTaken = (start: number, end: number) => refs.some((r) => start < r.end && end > r.start);
  for (const { pattern } of REF_PATTERNS) {
    for (const m of notes.matchAll(pattern)) {
      const start = m.index;
      const end = start + m[0].length;
      if (isTaken(start, end)) continue;
      const { quote, context } = contextOf(notes, start, end);
      refs.push({ start, end, page: Number(m[2]), isPdfPage: Boolean(m[1]), ...(quote && { quote }), context });
    }
  }
  return refs.sort((a, b) => a.start - b.start);
}

// The quote a reference cites: the last quote before it in its paragraph, or a blockquote line
// just above it. Without one, the sentence around the reference, minus the reference.
function contextOf(notes: string, start: number, end: number): { quote?: string; context: string } {
  const paragraphStart = notes.lastIndexOf("\n\n", start) + 1;
  const nextBreak = notes.indexOf("\n\n", end);
  const paragraphEnd = nextBreak === -1 ? notes.length : nextBreak;
  const before = notes.slice(paragraphStart, start);
  const quote = [...before.matchAll(QUOTE)].at(-1)?.[1];
  if (quote) return { quote: quote.trim(), context: quote.trim() };
  const blockquote = before.match(/^\s*>\s*(.+)$/m)?.[1];
  if (blockquote && blockquote.trim().split(/\s+/).length >= 3) return { quote: blockquote.trim(), context: blockquote.trim() };
  const sentenceStart = Math.max(paragraphStart, ...[". ", "! ", "? ", "\n"].map((s) => notes.lastIndexOf(s, start) + s.length));
  const sentenceEnds = [". ", "! ", "? ", "\n"].map((s) => notes.indexOf(s, end)).filter((i) => i !== -1);
  const sentenceEnd = Math.min(paragraphEnd, ...sentenceEnds);
  const sentence = (notes.slice(sentenceStart, start) + " " + notes.slice(end, sentenceEnd)).replace(/[#>*_`[\]()]/g, " ");
  return { context: sentence.replace(/\s+/g, " ").trim() };
}

// ---- Matching ----

type PdfParagraph = { text: string; norm: string; words: string[]; page: number };

// Lowercase, straight quotes, no line-break hyphens, single spaces: how notes and PDF text compare.
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
const STOPWORDS = new Set(
  "the and that this with from have were which their there would could should about into than then them they what when where while your been being also very more most some such only other upon must said".split(" "),
);
const wordsOf = (text: string) => normalize(text).match(/[a-zÀ-ɏ]{4,}/g)?.filter((w) => !STOPWORDS.has(w)) ?? [];

// The PDF's text in pieces that each sit on one page: split at blank lines and at every
// [PDF p. N] marker, since the import joins a paragraph that runs across a page break.
export function pdfParagraphs(pdfText: string): PdfParagraph[] {
  const pieces: PdfParagraph[] = [];
  let page = 0;
  for (const part of pdfText.split(/(\[PDF p\. \d+\])/)) {
    const marker = /^\[PDF p\. (\d+)\]$/.exec(part);
    if (marker) {
      page = Number(marker[1]);
      continue;
    }
    if (page === 0) continue; // text before the first marker has no page
    for (const block of part.split(/\n\s*\n/)) {
      const text = block.replace(/\s+/g, " ").trim();
      // normalize reads the raw block: it rejoins words hyphenated across a line break.
      if (text) pieces.push({ text, norm: normalize(block), words: wordsOf(block), page });
    }
  }
  return pieces;
}

const WINDOW = 3; // pages either side of the estimate searched by word overlap
const OVERLAP_MIN = 0.35; // share of the reference's word weight a paragraph must cover
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function linkPageRefs(refs: PageRef[], paragraphs: PdfParagraph[]): PageLink[] {
  const lastPage = Math.max(1, ...paragraphs.map((p) => p.page));
  const clamp = (page: number) => Math.min(Math.max(1, page), lastPage);

  // 1. Exact: each quote, anywhere in the PDF; the hits closest to their written page teach the offset.
  const exact = new Map<PageRef, PdfParagraph[]>();
  for (const ref of refs) {
    const quote = ref.quote && normalize(ref.quote);
    const hits = quote ? paragraphs.filter((p) => p.norm.includes(quote)) : [];
    if (hits.length > 0) exact.set(ref, hits);
  }
  const closest = (hits: PdfParagraph[], target: number) =>
    hits.reduce((best, p) => (Math.abs(p.page - target) < Math.abs(best.page - target) ? p : best));
  const offsets = [...exact].filter(([ref]) => !ref.isPdfPage).map(([ref, hits]) => closest(hits, ref.page).page - ref.page);
  const offset = offsets.length > 0 ? median(offsets) : 0;

  // How rare each word is in the book: shared rare words count for more than common ones.
  const documentFrequency = new Map<string, number>();
  for (const p of paragraphs) for (const w of new Set(p.words)) documentFrequency.set(w, (documentFrequency.get(w) ?? 0) + 1);
  const weight = (w: string) => Math.log(1 + paragraphs.length / (documentFrequency.get(w) ?? 1));

  return refs.map((ref) => {
    const estimate = clamp(ref.isPdfPage ? ref.page : ref.page + offset);
    const hits = exact.get(ref);
    if (hits) {
      const hit = closest(hits, estimate);
      return { ...ref, pdfPage: hit.page, method: "exact", match: ref.quote };
    }
    // 2. Overlap: the nearby paragraph covering the largest share of the reference's word weight.
    const refWords = [...new Set(wordsOf(ref.context))];
    const total = refWords.reduce((sum, w) => sum + weight(w), 0);
    let best: { p: PdfParagraph; score: number } | undefined;
    for (const p of paragraphs) {
      if (Math.abs(p.page - estimate) > WINDOW) continue;
      const pWords = new Set(p.words);
      const shared = refWords.filter((w) => pWords.has(w));
      const score = shared.length >= 2 && total > 0 ? shared.reduce((sum, w) => sum + weight(w), 0) / total : 0;
      if (!best || score > best.score) best = { p, score };
    }
    if (best && best.score >= OVERLAP_MIN) return { ...ref, pdfPage: best.p.page, method: "overlap", match: best.p.text };
    // 3. Page: the estimate alone.
    return { ...ref, pdfPage: estimate, method: "page" };
  });
}

// The words the PDF view finds and selects when a link opens: the quote itself, or the start of
// the matched paragraph (short, so a line break in the PDF doesn't break the search).
export function linkHighlight(link: PageLink): string | undefined {
  if (!link.match) return undefined;
  return link.method === "exact" ? link.match : link.match.split(/\s+/).slice(0, 6).join(" ");
}
