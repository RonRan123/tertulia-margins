// The reference text: paragraphs (for [¶n]) and the page each one is on (D13).
import { citationPattern } from "./citations.ts";

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
