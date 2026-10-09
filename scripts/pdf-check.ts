// Usage: npm run pdf-check -- <file.pdf> [fromPage] [toPage] [samplePage]
// Runs the same paragraph inference as the browser import and prints stats only (no book text
// beyond 60-character prefixes), so a PDF can be checked without copying it anywhere.
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { paragraphsFromPages, textItemsOf, type PdfPage } from "../core/pdf-paragraphs.ts";

const [file, fromArg, toArg, sampleArg] = process.argv.slice(2);
if (!file) {
  console.error("usage: npm run pdf-check -- <file.pdf> [fromPage] [toPage] [samplePage]");
  process.exit(1);
}

const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
const from = Number(fromArg ?? 1);
const to = Math.min(Number(toArg ?? doc.numPages), doc.numPages);
const pages: PdfPage[] = [];
for (let n = from; n <= to; n++) {
  const content = await (await doc.getPage(n)).getTextContent();
  pages.push({ pageNumber: n, items: textItemsOf(content.items) });
}

const { text, hyphenJoins, hyphensDropped } = paragraphsFromPages(pages);
const MARKER = /\[PDF p\. (\d+)\]/g;
const perPage = new Map<number, string[]>();
let page = 0;
let crossings = 0;
for (const block of text.split("\n\n")) {
  const markers = [...block.matchAll(MARKER)];
  const startsWithMarker = block.startsWith("[PDF p.");
  const startPage = startsWithMarker ? Number(markers[0][1]) : page;
  if (markers.length > (startsWithMarker ? 1 : 0)) crossings++;
  perPage.set(startPage, [...(perPage.get(startPage) ?? []), block.replace(MARKER, "").replace(/\s+/g, " ").trim()]);
  page = Number(markers.at(-1)?.[1] ?? page);
}

const paragraphs = [...perPage.values()].flat();
const avg = paragraphs.reduce((sum, p) => sum + p.length, 0) / Math.max(1, paragraphs.length);
console.log(`PDF pages: ${doc.numPages}; checked ${from}-${to}`);
console.log(`paragraphs: ${paragraphs.length}; average ${Math.round(avg)} chars`);
console.log(`crossed a page break: ${crossings}; hyphen joins: ${hyphenJoins} (${hyphensDropped} hyphens dropped)`);
// Join artefacts: a space before closing punctuation ("word ,") or after a closed dash mid-word.
const spaceBeforePunctuation = paragraphs.filter((p) => /\S [,.;:!?](\s|$)/.test(p)).length;
console.log(`paragraphs with a space before punctuation: ${spaceBeforePunctuation}`);
console.log(`paragraphs starting per page: ${[...perPage].map(([n, ps]) => `${n}:${ps.length}`).join(" ")}`);

const sample = Number(sampleArg ?? [...perPage.keys()][Math.floor(perPage.size / 2)]);
console.log(`first paragraphs starting on PDF p. ${sample}:`);
for (const p of (perPage.get(sample) ?? []).slice(0, 3)) console.log(`  ${p.slice(0, 60)}`);
