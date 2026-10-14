// Paragraphs of the notes (D20, D25): the notes are one markdown string, edited in one CodeMirror
// editor; a block is a run of non-blank lines, separated from the next by one or more blank
// (whitespace-only) lines. Daemons read the blocks that changed (D37), and margin cards group by
// the block their excerpt starts in. Browser-safe and pure.

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

// ---- Anchoring (D20): a margin card stores the exact words it answers and finds them again ----

// Where an excerpt is in the notes now: exact match first; then one that differs only in whitespace
// (a rewrapped line). Undefined → the note changed.
export function findExcerpt(notes: string, excerpt: string): { start: number; end: number } | undefined {
  const target = excerpt.trim();
  if (target === "") return undefined;
  const exact = notes.indexOf(target);
  if (exact !== -1) return { start: exact, end: exact + target.length };

  const words = target.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const loose = new RegExp(words.join(String.raw`\s+`)).exec(notes);
  return loose ? { start: loose.index, end: loose.index + loose[0].length } : undefined;
}

// The margin's order: cards whose excerpt is still in the notes, by where it starts (ties keep
// creation order), then the detached ones, whose words are gone.
export function placeByExcerpt<C extends { excerpt: string }>(
  notes: string,
  cards: C[],
): { placed: { card: C; start: number; end: number }[]; detached: C[] } {
  const placed: { card: C; start: number; end: number }[] = [];
  const detached: C[] = [];
  for (const card of cards) {
    const range = findExcerpt(notes, card.excerpt);
    if (range) placed.push({ card, ...range });
    else detached.push(card);
  }
  placed.sort((a, b) => a.start - b.start); // stable sort: same start keeps creation order
  return { placed, detached };
}

// One row of the margin: a block and the cards beside it.
export type Row<C> = Block & { cards: { card: C; start: number; end: number }[] };

// The margin's layout (D20, D25): one row per block. A card sits beside the row where its excerpt
// starts, in note order; `detached` are those whose excerpt is gone.
export function layoutRows<C extends { excerpt: string }>(notes: string, cards: C[]): { rows: Row<C>[]; detached: C[] } {
  const rows: Row<C>[] = splitBlocks(notes).map((block) => ({ ...block, cards: [] }));
  const { placed, detached } = placeByExcerpt(notes, cards);
  for (const item of placed) {
    const row = rows.find((r) => item.start >= r.start && item.start < r.end);
    if (row) row.cards.push(item);
    else detached.push(item.card);
  }
  return { rows, detached };
}

// The margin on wide screens, like comments in Google Docs (D18): each block's stack of cards
// wants to start at its block's top (`anchor`); one that would overlap the stack before it is
// pushed down to just below it, `gap` apart; none starts above `top` (below the margin's panel).
// Stacks in note order; returns each stack's top.
export function stackCards(stacks: { anchor: number; height: number }[], gap: number, top = -Infinity): number[] {
  let nextFree = top;
  return stacks.map(({ anchor, height }) => {
    const top = Math.max(anchor, nextFree);
    nextFree = top + height + gap;
    return top;
  });
}
