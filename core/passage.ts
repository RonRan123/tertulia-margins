// The reference text: paragraphs (for [¶n]) and the page each one is on (D13).
import { citationPattern } from "./citations.ts";
import { LIMITS } from "./limits.ts";

// [¶n] is 1-based: paragraphs[n - 1]. `page` is a display label like "p. 101" or "PDF pp. 81–82".
export type Paragraph = { text: string; page?: string };

type Marker = { isPdf: boolean; page: string; lastPage?: string }; // lastPage: an explicit [pp. 10-11] range

// D15: [p. 101], [p 101], [pp. 10-11], [p. xii], each optionally prefixed "PDF"; case-insensitive.
const PAGE = String.raw`(\d+|[ivxlcdm]+)`;
const PAGE_MARKER = String.raw`\[\s*(pdf\s*)?pp?\.?\s*${PAGE}(?:\s*[-–]\s*${PAGE})?\s*\]`;
const pageMarkers = () => new RegExp(PAGE_MARKER, "gi");

// Paragraphs are separated by blank lines. A [p. N] marker means "page N begins here": it labels
// every paragraph after it until the next marker. A paragraph's range ends at its last marker that
// has text after it, so a marker at the very end of a paragraph only labels what follows.
export function parsePassage(reference: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Marker | undefined; // the page we are on; undefined before the first marker

  for (const block of reference.split(/\n\s*\n/)) {
    const markers = [...block.matchAll(pageMarkers())].map((m) => ({
      isPdf: Boolean(m[1]),
      page: m[2],
      lastPage: m[3],
      hasTextBefore: stripMarkers(block.slice(0, m.index)) !== "",
      hasTextAfter: stripMarkers(block.slice(m.index + m[0].length)) !== "",
    }));
    const text = stripMarkers(block);
    const before = current;
    current = markers.at(-1) ?? current;
    if (text === "") continue; // blank, or markers on their own

    const opensWithMarker = markers.length > 0 && !markers[0].hasTextBefore;
    const start = opensWithMarker ? markers[0] : before;
    const end = markers.findLast((m) => m.hasTextAfter) ?? before;
    // A paragraph that spans the first marker has no known start page: label it with the end page.
    const page = pageLabel(start ?? end, end);
    paragraphs.push(page ? { text, page } : { text });
  }
  return paragraphs;
}

// Removes markers and the spaces around them. A marker between words leaves one space; one
// before closing punctuation ("word [p. 8], next") or glued between characters leaves none.
function stripMarkers(text: string): string {
  const withSpaces = new RegExp(String.raw`(\s*)${PAGE_MARKER}(\s*)`, "gi");
  return text
    .replace(withSpaces, (match: string, spaceBefore: string, _pdf, _page, _lastPage, spaceAfter: string, offset: number) => {
      const isBeforePunctuation = /^[,.;:!?)\]}”’]/.test(text.slice(offset + match.length));
      const isGlued = spaceBefore === "" && spaceAfter === "";
      return isBeforePunctuation || isGlued ? "" : " ";
    })
    .trim();
}

function pageLabel(start: Marker | undefined, end: Marker | undefined): string | undefined {
  if (!start || !end) return undefined;
  const prefix = (m: Marker) => (m.isPdf ? "PDF " : "");
  const last = end.lastPage ?? end.page;
  const isSinglePage = start.isPdf === end.isPdf && start.page === last;
  if (isSinglePage) return `${prefix(start)}p. ${start.page}`;
  if (start.isPdf !== end.isPdf) return `${prefix(start)}p. ${start.page}–${prefix(end)}p. ${last}`;
  return `${prefix(start)}pp. ${start.page}–${last}`;
}

// The pages the reference text covers: "p. 101 to p. 108", "p. 101" if one page, undefined if unlabelled.
export function pageRange(paragraphs: Paragraph[]): string | undefined {
  const pages = paragraphs.map((p) => p.page).filter((p) => p !== undefined);
  if (pages.length === 0) return undefined;
  const [first, last] = [pages[0], pages[pages.length - 1]];
  return first === last ? first : `${first} to ${last}`;
}

// Page labels by paragraph number ({ 12: "p. 101" }): only what a reply's citations need.
export type PageLabels = Record<number, string>;

// What a finished reply keeps: the labels of the paragraphs it cites (both ends of a range), so
// editing the reference text later doesn't change old replies, and storage holds a few labels per
// reply, not one per paragraph of the book.
export function citedPages(reply: string, paragraphs: Paragraph[]): PageLabels {
  const pages: PageLabels = {};
  for (const [, from, to] of reply.matchAll(citationPattern())) {
    for (const n of [Number(from), Number(to ?? from)]) {
      const page = paragraphs[n - 1]?.page;
      if (page !== undefined) pages[n] = page;
    }
  }
  return pages;
}

// "[¶12]" → "[¶12 · p. 101]"; a range shows the pages of its first and last paragraph.
// Citations of unlabelled or nonexistent paragraphs are left as written.
export function labelCitations(reply: string, pages: PageLabels): string {
  return reply.replace(citationPattern(), (citation, from: string, to?: string) => {
    const ends = [pages[Number(from)], pages[Number(to ?? from)]];
    const labels = [...new Set(ends.filter((p) => p !== undefined))];
    if (labels.length === 0) return citation;
    return `${citation.slice(0, -1)} · ${labels.join(", ")}]`;
  });
}

// The page a labelled cite points at, for opening the PDF there (D23: the page as given; R4 will
// match the text instead). "[¶2 · p. 1]" → 1, "[¶2 · PDF p. 3]" → 3, a range → its first page.
// Undefined with no page label, or a roman-numeral page (front matter isn't numbered in the PDF).
export function citedPage(cite: string): number | undefined {
  const match = /·\s*(?:PDF\s+)?pp?\.\s*(\d+)/i.exec(cite);
  return match ? Number(match[1]) : undefined;
}

// ---- The reference-text cap (D32) ----
// Every AI call sends the whole reference text, so its size is capped: ~25K tokens is 2–3
// chapters and ~5¢ a turn on Sonnet 5.5. Tokens are estimated as characters ÷ 4.
export const REFERENCE_TOKEN_LIMIT = LIMITS.referenceTokens; // set in core/limits.ts
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
export const isReferenceTooLong = (reference: string) => estimateTokens(reference) > REFERENCE_TOKEN_LIMIT;

// PDF text from lib/pdf-import carries a `[PDF p. N]` marker where each page's text starts.
const PDF_MARKER = /\[PDF p\. (\d+)\]/g;

// The highest PDF page with text (0 when the text has no PDF markers).
export function pdfPageCount(text: string): number {
  return Math.max(0, ...[...text.matchAll(PDF_MARKER)].map((m) => Number(m[1])));
}

// The text of PDF pages from..to (inclusive): from page `from`'s marker up to page to+1's.
// A paragraph running across the cut is cut with it.
export function slicePdfPages(text: string, from: number, to: number): string {
  const markers = [...text.matchAll(PDF_MARKER)].map((m) => ({ page: Number(m[1]), index: m.index }));
  const start = markers.find((m) => m.page >= from)?.index ?? text.length;
  const end = markers.find((m) => m.page > to)?.index ?? text.length;
  return end > start ? text.slice(start, end).trim() : "";
}

// The last page `to` such that pages from..to fit the cap; `from` itself if even it doesn't.
export function fitPdfPages(text: string, from: number, limit = REFERENCE_TOKEN_LIMIT): number {
  const last = pdfPageCount(text);
  let to = from;
  while (to < last && estimateTokens(slicePdfPages(text, from, to + 1)) <= limit) to++;
  return to;
}
