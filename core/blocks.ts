// Blocks (D18, D20): the notes stay one markdown string; a block is a run of non-blank lines,
// separated from the next by one or more blank (whitespace-only) lines. Blocks are derived on
// every render and carry offsets into the string, so an edit writes back into exactly its own
// slice: separators and leading/trailing blank lines are never rewritten, and export is unchanged.
// A blank line inside a ``` fence splits the fence too (accepted cost, D20).
// Browser-safe and pure: the UI imports all of this.
import { Marked, type Tokens } from "marked";
import { placeReactions } from "./reactions.ts";

// notes.slice(start, end) === text. A block never starts or ends on a line break; with CRLF notes,
// the last line's "\r" is left in the separator.
export type Block = { text: string; start: number; end: number };
type Range = { start: number; end: number };

export function splitBlocks(notes: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | undefined; // the block the previous line belongs to
  let lineStart = 0;
  while (true) {
    const newline = notes.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? notes.length : newline;
    const isBlank = notes.slice(lineStart, lineEnd).trim() === "";
    const contentEnd = notes[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
    if (isBlank) open = undefined;
    else if (open) open.end = contentEnd;
    else blocks.push((open = { text: "", start: lineStart, end: contentEnd }));
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  for (const block of blocks) block.text = notes.slice(block.start, block.end);
  return blocks;
}

// `block` must come from splitBlocks(notes), or be the range of a block being edited. Every byte
// outside the block is kept.
export function replaceBlock(notes: string, block: Range, newText: string): string {
  return notes.slice(0, block.start) + newText + notes.slice(block.end);
}

// A new block at the end: adds just enough line breaks for one blank line before it
// (in the notes' own line ending), none if the notes are empty or already end on a blank line.
export function appendBlock(notes: string, text: string): string {
  const eol = notes.includes("\r\n") ? "\r\n" : "\n";
  const endsOnBlankLine = /\n[^\S\n]*\n$/.test(notes);
  if (notes === "" || endsOnBlankLine) return notes + text;
  if (notes.endsWith("\n")) return notes + eol + text;
  return notes + eol + eol + text;
}

// Removes the block and the separator after it; the last block takes the separator before it
// instead, so the notes' trailing blank lines stay as they were.
export function removeBlock(notes: string, block: Range): string {
  const blocks = splitBlocks(notes);
  const next = blocks.find((b) => b.start >= block.end);
  if (next) return notes.slice(0, block.start) + notes.slice(next.start);
  const previous = blocks.findLast((b) => b.end <= block.start);
  if (previous) return notes.slice(0, previous.end) + notes.slice(block.end);
  return notes.slice(0, block.start) + notes.slice(block.end);
}

// The block containing a caret offset (its start and end both count). Undefined on a separator.
export function blockAt(blocks: Block[], offset: number): Block | undefined {
  return blocks.find((b) => offset >= b.start && offset <= b.end);
}

// What a command (React, Quiz, Define) acts on: the trimmed selection; with a caret and no
// selection, the whole block under it (D20). Undefined when that is empty (a caret on a blank line).
export function commandTarget(notes: string, start: number, end: number): string | undefined {
  const selection = notes.slice(start, end).trim();
  if (selection !== "") return selection;
  const isOnlyWhitespaceSelected = end > start;
  if (isOnlyWhitespaceSelected) return undefined;
  return blockAt(splitBlocks(notes), start)?.text.trim() || undefined;
}

// Leaving a block: one left empty (or only whitespace) is removed with its separator, so an
// abandoned block leaves no stray blank lines. Any other block leaves the notes as they are.
export function closeBlock(notes: string, block: Range): string {
  const isEmpty = notes.slice(block.start, block.end).trim() === "";
  return isEmpty ? removeBlock(notes, block) : notes;
}

// One row of the notes view: a block and the reactions beside it.
export type Row<R> = Block & { isEditing: boolean; reactions: { reaction: R; start: number; end: number }[] };

// The notes view (D20): one row per block, except that the block being edited stays one row
// while it is open, even after a blank line typed into it (it splits once it closes), and shows
// even when empty. A reaction sits beside the row where its excerpt starts, in note order;
// `detached` are those whose excerpt is gone ("Your note changed").
export function layoutRows<R extends { excerpt: string }>(
  notes: string,
  reactions: R[],
  editing?: Range,
): { rows: Row<R>[]; detached: R[] } {
  const rows: Row<R>[] = [];
  const editRow: Row<R> | undefined = editing && {
    ...editing,
    text: notes.slice(editing.start, editing.end),
    isEditing: true,
    reactions: [],
  };
  let isEditRowPlaced = false;
  for (const block of splitBlocks(notes)) {
    const isInEditRow = editing !== undefined && block.start < editing.end && block.end > editing.start;
    const isPastEditRow = editing !== undefined && block.start >= editing.end;
    if (editRow && !isEditRowPlaced && (isInEditRow || isPastEditRow)) {
      rows.push(editRow);
      isEditRowPlaced = true;
    }
    if (!isInEditRow) rows.push({ ...block, isEditing: false, reactions: [] });
  }
  if (editRow && !isEditRowPlaced) rows.push(editRow);

  const { placed, detached } = placeReactions(notes, reactions);
  for (const item of placed) {
    const row = rows.find((r) => item.start >= r.start && item.start < r.end);
    if (row) row.reactions.push(item);
    else detached.push(item.reaction);
  }
  return { rows, detached };
}

// The margin on wide screens, like comments in Google Docs (D18): each block's stack of cards
// wants to start at its block's top (`anchor`); one that would overlap the stack before it is
// pushed down to just below it, `gap` apart. Stacks in note order; returns each stack's top.
export function stackCards(stacks: { anchor: number; height: number }[], gap: number): number[] {
  let nextFree = -Infinity;
  return stacks.map(({ anchor, height }) => {
    const top = Math.max(anchor, nextFree);
    nextFree = top + height + gap;
    return top;
  });
}

// ---- Rendering a block as markdown (D18) ----

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// A link is safe with no scheme (relative, #anchor) or http(s)/mailto. Entities are decoded and
// whitespace/control characters dropped first, the way a browser reads "java&#58;script:" or "java\tscript:".
function isSafeHref(href: string): boolean {
  const decoded = href
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&colon;/gi, ":")
    .replace(/&(tab|newline);/gi, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decoded.replace(/[\u0000- \u007f]/g, ""));
  return !scheme || ["http", "https", "mailto"].includes(scheme[1].toLowerCase());
}

// [¶4], [¶3-4], [¶4, p. 12], [¶12 · p. 101], [¶2, PDF p. 3]. Tokenized inline, so code spans and
// code blocks (never inline-lexed) keep their text as written.
const CITE = /^\[¶\s*\d[^[\]\n]*\]/;

const markdown = new Marked({
  gfm: true,
  breaks: true, // a single newline is a line break, like Obsidian with "strict line breaks" off
  renderer: {
    // Raw HTML is shown as text, never rendered (D20).
    html({ text, block }: Tokens.HTML | Tokens.Tag) {
      return block ? `<p>${escapeHtml(text.trim())}</p>\n` : escapeHtml(text);
    },
    // An unsafe link keeps its text and loses the link; false → marked's default rendering.
    link({ href, tokens }: Tokens.Link) {
      return isSafeHref(href) ? false : this.parser.parseInline(tokens);
    },
    image({ href, text }: Tokens.Image) {
      return isSafeHref(href) ? false : escapeHtml(text);
    },
  },
  extensions: [
    {
      name: "cite",
      level: "inline",
      start: (src: string) => src.indexOf("[¶"),
      tokenizer(src: string) {
        const match = CITE.exec(src);
        return match ? { type: "cite", raw: match[0] } : undefined;
      },
      renderer: (token) => `<span class="cite">${escapeHtml(token.raw)}</span>`,
    },
  ],
});

// One block's markdown → HTML, synchronously, safe for dangerouslySetInnerHTML. Links open in a
// new tab, so following one never leaves the notes. Raw HTML and code are escaped, so every
// "<a href=" in the output is one marked rendered from a markdown link.
export function renderMarkdown(text: string): string {
  return markdown.parse(text, { async: false }).replaceAll("<a href=", '<a target="_blank" rel="noopener noreferrer" href=');
}
