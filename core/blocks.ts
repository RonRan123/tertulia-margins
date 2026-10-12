// Paragraphs of the notes (D20, D25): the notes are one markdown string, edited in one CodeMirror
// editor; a block is a run of non-blank lines, separated from the next by one or more blank
// (whitespace-only) lines. React acts on the block under the caret, and margin cards group by the
// block their excerpt starts in. Browser-safe and pure.
import { placeReactions } from "./reactions.ts";

// notes.slice(start, end) === text. A block never starts or ends on a line break; with CRLF notes,
// the last line's "\r" is left in the separator.
export type Block = { text: string; start: number; end: number };

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

// The block containing a caret offset (its start and end both count). Undefined on a separator.
export function blockAt(blocks: Block[], offset: number): Block | undefined {
  return blocks.find((b) => offset >= b.start && offset <= b.end);
}

// What React acts on: the trimmed selection; with a caret and no
// selection, the whole block under it (D20). Undefined when that is empty (a caret on a blank line).
export function commandTarget(notes: string, start: number, end: number): string | undefined {
  const selection = notes.slice(start, end).trim();
  if (selection !== "") return selection;
  const isOnlyWhitespaceSelected = end > start;
  if (isOnlyWhitespaceSelected) return undefined;
  return blockAt(splitBlocks(notes), start)?.text.trim() || undefined;
}

// One row of the margin: a block and the reactions beside it.
export type Row<R> = Block & { reactions: { reaction: R; start: number; end: number }[] };

// The margin's layout (D20, D25): one row per block. A reaction sits beside the row where its
// excerpt starts, in note order; `detached` are those whose excerpt is gone ("Your note changed").
export function layoutRows<R extends { excerpt: string }>(notes: string, reactions: R[]): { rows: Row<R>[]; detached: R[] } {
  const rows: Row<R>[] = splitBlocks(notes).map((block) => ({ ...block, reactions: [] }));
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
