// Turns positioned PDF text items into reference text: paragraphs separated by one blank line,
// with a `[PDF p. N]` marker before the first paragraph that starts on page N, or inline where a
// paragraph carries over from the previous page (D13). Pure: the pdfjs adapter lives in lib/.

// x/y are PDF user-space coordinates of the item's baseline start (y grows upwards).
export type PdfTextItem = { str: string; x: number; y: number; width: number; height: number; hasEOL: boolean };
export type PdfPage = { pageNumber: number; items: PdfTextItem[] };

type Line = { text: string; x: number; y: number; right: number; height: number };
type PageLines = { pageNumber: number; lines: Line[] };

export type PdfParagraphs = {
  text: string;
  hyphenJoins: number; // lines rejoined across a line-end hyphen
  hyphensDropped: number; // of those, how many were soft hyphens (removed)
};

// pdfjs `getTextContent().items`, typed structurally so core/ needs no pdfjs import:
// text items carry `str`; marked-content items (no text) are skipped.
type PdfJsItem = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean } | { type: string };

export function textItemsOf(items: PdfJsItem[]): PdfTextItem[] {
  return items.flatMap((it) =>
    "str" in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height, hasEOL: it.hasEOL }] : [],
  );
}

// The single entry point: reference text plus join counts (for scripts/pdf-check.ts).
export function paragraphsFromPages(pages: PdfPage[]): PdfParagraphs {
  const pageLines = dropRunningHeadersAndFooters(
    pages.map((p) => ({ pageNumber: p.pageNumber, lines: linesOf(p.items) })).filter((p) => p.lines.length > 0),
  );
  const allLines = pageLines.flatMap((p) => p.lines);
  if (allLines.length === 0) return { text: "", hyphenJoins: 0, hyphensDropped: 0 };

  const gaps = pageLines.flatMap((p) => p.lines.slice(1).map((l, i) => p.lines[i].y - l.y));
  const lineGap = gaps.length > 0 ? mode(gaps, "smallest") : 1.2 * Math.max(...allLines.map((l) => l.height));
  const docMargin = leftMargin(allLines);
  const indentTolerance = (height: number) => Math.max(3, 0.5 * height);
  const docRight = mode(allLines.map((l) => l.right), "largest");
  const knownWords = new Set(allLines.flatMap((l) => [...l.text.toLowerCase().matchAll(WORD)].map((m) => m[0])));

  const paragraphs: string[] = [];
  let current: string | undefined;
  let prev: { line: Line; pageRight: number } | undefined;
  let hyphenJoins = 0;
  let hyphensDropped = 0;

  for (const page of pageLines) {
    const hasEnoughLines = page.lines.length >= 5;
    // On dialogue-heavy pages few lines start at the true margin, so the page's own margin can
    // land on the indent; then every line would look unindented. Fall back to the document's.
    const pageMargin = leftMargin(page.lines);
    const isMarginOnIndent = pageMargin > docMargin + indentTolerance(mode(page.lines.map((l) => l.height), "smallest"));
    const margin = hasEnoughLines && !isMarginOnIndent ? pageMargin : docMargin;
    const pageRight = hasEnoughLines ? mode(page.lines.map((l) => l.right), "largest") : docRight;
    const marker = `[PDF p. ${page.pageNumber}]`;
    let markerPlaced = false;

    page.lines.forEach((line, i) => {
      const isFirstOnPage = i === 0;
      const isIndented = line.x > margin + indentTolerance(line.height);
      const isAfterGap = !isFirstOnPage && page.lines[i - 1].y - line.y > 1.5 * lineGap;
      const prevReachedRightEdge = prev !== undefined && prev.line.right >= prev.pageRight - Math.max(2, prev.line.height);
      const continuesFromPrevPage = isFirstOnPage && !isIndented && (prevReachedRightEdge || endsWithHyphen(prev?.line.text));
      const startsParagraph = current === undefined || isIndented || isAfterGap || (isFirstOnPage && !continuesFromPrevPage);

      if (startsParagraph) {
        if (current !== undefined) paragraphs.push(current);
        current = markerPlaced ? line.text : `${marker}\n${line.text}`;
        markerPlaced = true;
      } else {
        const joined = joinLines(current!, line.text, knownWords, isFirstOnPage ? marker : undefined);
        current = joined.text;
        if (isFirstOnPage) markerPlaced = true;
        if (joined.hyphen) hyphenJoins++;
        if (joined.hyphen === "dropped") hyphensDropped++;
      }
      prev = { line, pageRight };
    });
  }
  if (current !== undefined) paragraphs.push(current);
  return { text: paragraphs.join("\n\n"), hyphenJoins, hyphensDropped };
}

// Words, keeping internal hyphens: "light-headedness" is one word.
const WORD = /\p{L}+(?:-\p{L}+)*/gu;

function endsWithHyphen(text: string | undefined): boolean {
  return text !== undefined && /\p{L}-$/u.test(text);
}

// Joins a line onto the paragraph so far. A line-end hyphen before a lowercase letter is rejoined
// without a space; the hyphen is dropped only if the unhyphenated word appears elsewhere in the
// document (a soft hyphen, "neigh-bourhood"), since most line-end hyphens are real ("twenty-four").
// A closed line-end dash ("word—") joins with no space; the book style is "word—word".
function joinLines(
  paragraph: string,
  next: string,
  knownWords: Set<string>,
  marker: string | undefined,
): { text: string; hyphen?: "kept" | "dropped" } {
  const isDashBreak = /\S[—–]$/u.test(paragraph);
  if (isDashBreak) return { text: `${paragraph}${marker ?? ""}${next}` }; // parsePassage drops a glued marker
  const isHyphenBreak = endsWithHyphen(paragraph) && /^\p{Ll}/u.test(next);
  if (!isHyphenBreak) return { text: `${paragraph} ${marker ? `${marker} ` : ""}${next}` };

  const head = paragraph.match(/\p{L}+(?:-\p{L}+)*-$/u)![0].slice(0, -1);
  const tail = next.match(/^\p{L}+(?:-\p{L}+)*/u)![0];
  const plain = (head + tail).toLowerCase();
  const isSoftHyphen = knownWords.has(plain) && !knownWords.has(`${head}-${tail}`.toLowerCase());
  const glued = isSoftHyphen ? paragraph.slice(0, -1) + tail : paragraph + tail;
  const rest = next.slice(tail.length).trim();
  // "twenty-" + "four, then" → "twenty-four, then": no space before punctuation after the word.
  const isWordEnd = rest === "" || /^[,.;:!?)\]}”’—–]/u.test(rest);
  const markerPart = marker ? ` ${marker}` : "";
  return { text: `${glued}${markerPart}${isWordEnd ? "" : " "}${rest}`, hyphen: isSoftHyphen ? "dropped" : "kept" };
}

// Groups items into lines by baseline (top to bottom), ordering each line's items left to right.
function linesOf(items: PdfTextItem[]): Line[] {
  const visible = items.filter((it) => it.str.length > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: PdfTextItem[][] = [];
  for (const it of visible) {
    const last = groups.at(-1);
    const isSameLine = last !== undefined && Math.abs(last[0].y - it.y) <= Math.max(1, 0.4 * (last[0].height || it.height));
    if (isSameLine) last.push(it);
    else groups.push([it]);
  }

  return groups.flatMap((group) => {
    const parts = group.sort((a, b) => a.x - b.x);
    const inked = parts.filter((it) => it.str.trim().length > 0);
    if (inked.length === 0) return [];

    let text = "";
    let prevEnd: number | undefined;
    for (const it of parts) {
      const hasGap = prevEnd !== undefined && it.x - prevEnd > 0.15 * (it.height || 10);
      const needsSpace = hasGap && !/\s$/.test(text) && !/^\s/.test(it.str);
      text += (needsSpace ? " " : "") + it.str;
      prevEnd = it.x + it.width;
    }
    const last = inked.at(-1)!;
    return [{
      text: text.replace(/\s+/g, " ").trim(),
      x: inked[0].x,
      y: group[0].y,
      right: last.x + last.width,
      height: Math.max(...inked.map((it) => it.height)),
    }];
  });
}

// Drops running headers/footers and page numbers: a first or last line whose text (digits ignored)
// recurs as a first or last line on many pages. A bare number counts only if bare numbers recur
// too, so a lone date ("2019") survives. Short PDFs have too few pages to tell, so nothing is dropped.
const MIN_PAGES_FOR_HEADERS = 10;

function dropRunningHeadersAndFooters(pages: PageLines[]): PageLines[] {
  if (pages.length < MIN_PAGES_FOR_HEADERS) return pages;
  const key = (l: Line) => l.text.replace(/\d+/g, "#").toLowerCase();
  const edgeLines = (p: PageLines) => [...new Set([p.lines[0], p.lines.at(-1)!])];
  const counts = new Map<string, number>();
  for (const p of pages) for (const k of new Set(edgeLines(p).map(key))) counts.set(k, (counts.get(k) ?? 0) + 1);
  const minRepeats = Math.max(3, Math.ceil(0.3 * pages.length));

  return pages
    .map((p) => {
      const edges = edgeLines(p);
      const isRunning = (l: Line) => (counts.get(key(l)) ?? 0) >= minRepeats;
      return { ...p, lines: p.lines.filter((l) => !(edges.includes(l) && isRunning(l))) };
    })
    .filter((p) => p.lines.length > 0);
}

// The leftmost x that many lines start at. Not simply the most common x: on dialogue-heavy pages
// indented first lines can outnumber lines at the margin.
function leftMargin(lines: Line[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(Math.round(l.x), (counts.get(Math.round(l.x)) ?? 0) + 1);
  const minCount = Math.max(2, 0.1 * lines.length);
  const frequent = [...counts].filter(([, n]) => n >= minCount).map(([x]) => x);
  return frequent.length > 0 ? Math.min(...frequent) : Math.min(...counts.keys());
}

// Most common value after rounding to whole points; ties go to the smallest or largest.
function mode(values: number[], tie: "smallest" | "largest"): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(Math.round(v), (counts.get(Math.round(v)) ?? 0) + 1);
  let best: [number, number] = [NaN, 0];
  for (const [v, n] of counts) {
    const isTieWinner = n === best[1] && (tie === "smallest" ? v < best[0] : v > best[0]);
    if (n > best[1] || isTieWinner) best = [v, n];
  }
  return best[0];
}
