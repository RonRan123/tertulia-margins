"use client";

import { useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from "react";
import {
  appendBlock,
  blockAt,
  closeBlock,
  layoutRows,
  renderMarkdown,
  replaceBlock,
  splitBlocks,
  stackCards,
  type Row,
} from "@/core/blocks.ts";
import type { Reaction } from "@/core/store.ts";

// The notes as Jupyter-style blocks (D18, D20). The notes stay one string: a block is its slice
// [start, end) of that string. Every block renders as markdown; the one being edited is a textarea
// whose edits replace exactly its slice, so store, export and the AI see the same text.
// The user's own words and app-pasted passage quotes only (D6): the AI never writes here.

// The block being edited. Its offsets are tracked from when it opened, not re-derived, so a blank
// line typed into it doesn't split it until it closes. `isNew`: opened from "Write a note…" and
// not typed in yet, so it isn't in the notes at all.
type Editing = { start: number; end: number; isNew: boolean; id: number };
type Range = { start: number; end: number };

export type NotesHandle = {
  // What commands act on, in notes offsets: the selection (or caret) in the block being edited,
  // else the whole block last edited or focused. Undefined: neither.
  target: () => (Range & { isEditing: boolean }) | undefined;
  // Shows a range: selects it in the block being edited, or opens the block where it starts.
  select: (start: number, end: number) => void;
  // New notes from a command (Define's quote), keeping the caret's block open with the caret at `caret`.
  edit: (notes: string, caret: number) => void;
};

type NotesProps = {
  notes: string;
  reactions: Reaction[];
  onChange: (notes: string) => void;
  onReactShortcut: () => void; // Cmd/Ctrl+Enter in a block
  renderMargin: (row: Row<Reaction>, isCurrent: boolean) => ReactNode;
  renderDetached: (detached: Reaction[]) => ReactNode;
  ref?: Ref<NotesHandle>;
};

const EMPTY_COPY = "Write what you notice as you read. Put the cursor in a note and press React to hear back.";
const canSizeToContent = () => typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
const CARD_GAP = 12; // px, var(--s3): between stacks pushed together, and below the last one

// Wide screens: the notes flow on their own, and each row's stack of cards (.cards, absolutely
// positioned) is moved down to its block's top or, if that would overlap the stack above, to just
// below it, like comments in Google Docs (core stackCards). The fill row grows so the last card
// isn't clipped. Phone (one column): the stacks stay in flow under their blocks.
// Runs after every render (notes, reactions, streaming) and whenever a row or stack changes size
// (expand/collapse, window resize), through one ResizeObserver.
function useMarginLayout(container: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const rows = [...root.querySelectorAll<HTMLElement>(":scope > .row")];
    const stacks = rows.flatMap((row) => row.querySelector<HTMLElement>(":scope > .margin-cell > .cards") ?? []);
    const fill = rows.at(-1)!;
    const layout = () => {
      const isOneColumn = window.matchMedia("(max-width: 48rem)").matches;
      if (isOneColumn) {
        fill.style.minHeight = "";
        return;
      }
      const origin = root.getBoundingClientRect().top;
      // offsetTop/offsetHeight ignore the transform we set, so measuring is stable.
      const measured = stacks.map((stack) => ({
        anchor: stack.parentElement!.getBoundingClientRect().top - origin + stack.offsetTop,
        height: stack.offsetHeight,
      }));
      const tops = stackCards(measured, CARD_GAP);
      stacks.forEach((stack, i) => stack.style.setProperty("--shift", `${tops[i] - measured[i].anchor}px`));
      const bottom = Math.max(0, ...tops.map((top, i) => top + measured[i].height + CARD_GAP));
      const fillTop = fill.getBoundingClientRect().top - origin;
      fill.style.minHeight = bottom > fillTop ? `${bottom - fillTop}px` : "";
    };
    layout();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout); // next frame: no resize loop from our own min-height
    });
    observer.observe(root);
    for (const row of rows) observer.observe(row.firstElementChild!); // the notes cell
    for (const stack of stacks) observer.observe(stack);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });
}

export function Notes({ notes, reactions, onChange, onReactShortcut, renderMargin, renderDetached, ref }: NotesProps) {
  const [editing, setEditing] = useState<Editing>();
  const [current, setCurrent] = useState<number>(); // start of the block last edited or focused
  const editor = useRef<HTMLTextAreaElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const openId = useRef(0); // bumped on every open and close, so a stale blur is ignored
  const pendingSelection = useRef<Range>(undefined); // applied in the editor once it has rendered
  const pendingFocus = useRef<number>(undefined); // a rendered block to focus, by start offset
  const isRefocusing = useRef(false); // our own blur-then-focus (to scroll a selection into view) isn't leaving
  const { rows, detached } = layoutRows(notes, reactions, editing && !editing.isNew ? editing : undefined);
  if (editing?.isNew) rows.push({ text: "", start: notes.length, end: notes.length, isEditing: true, reactions: [] });
  const currentBlock = editing ? undefined : current !== undefined ? blockAt(splitBlocks(notes), current) : undefined;

  // After a render: size the editor to its text, put its selection where it was asked for, or
  // focus a rendered block (after Esc).
  useLayoutEffect(() => {
    const box = editor.current;
    if (box && !canSizeToContent()) {
      box.style.height = "auto";
      box.style.height = `${box.scrollHeight}px`;
    }
    const selection = pendingSelection.current;
    if (box && selection) {
      pendingSelection.current = undefined;
      box.focus();
      box.setSelectionRange(selection.start, selection.end);
      scrollToSelection(box);
    }
    if (pendingFocus.current !== undefined) {
      document.querySelector<HTMLElement>(`.block[data-start="${pendingFocus.current}"]`)?.focus();
      pendingFocus.current = undefined;
    }
  }, [editing, notes]);

  // Blur then focus scrolls a textarea's selection into view.
  function scrollToSelection(box: HTMLTextAreaElement) {
    isRefocusing.current = true;
    box.blur();
    box.focus();
    isRefocusing.current = false;
  }

  // `at`: the selection inside the block (default: caret at its end).
  function open(block: Range, at?: Range) {
    openId.current += 1;
    setEditing({ start: block.start, end: block.end, isNew: false, id: openId.current });
    setCurrent(block.start);
    const length = block.end - block.start;
    pendingSelection.current = at ?? { start: length, end: length };
  }

  function openNew() {
    openId.current += 1;
    setEditing({ start: notes.length, end: notes.length, isNew: true, id: openId.current });
    setCurrent(undefined);
    pendingSelection.current = { start: 0, end: 0 };
  }

  // Leaves the block being edited; one left empty is removed. Returns the notes after that.
  function close(block: Editing): string {
    openId.current += 1;
    setEditing(undefined);
    if (block.isNew) return notes;
    const closed = closeBlock(notes, block);
    if (closed !== notes) onChange(closed);
    return closed;
  }

  function change(block: Editing, text: string) {
    if (block.isNew) {
      const next = appendBlock(notes, text);
      onChange(next);
      setEditing({ ...block, isNew: false, start: next.length - text.length, end: next.length });
      setCurrent(next.length - text.length);
      return;
    }
    onChange(replaceBlock(notes, block, text));
    setEditing({ ...block, end: block.start + text.length });
  }

  function onEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, block: Editing) {
    const box = e.currentTarget;
    const isReactShortcut = e.key === "Enter" && (e.metaKey || e.ctrlKey);
    const isNext = e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey;
    const isMergeBack = e.key === "Backspace" && box.value === "" && box.selectionStart === 0 && box.selectionEnd === 0;
    if (e.nativeEvent.isComposing) return;
    if (isReactShortcut) {
      e.preventDefault();
      return onReactShortcut();
    }
    if (e.key === "Escape") {
      e.preventDefault(); // renders the block only
      const closed = close(block);
      if (!block.isNew && closed === notes) pendingFocus.current = block.start;
      return;
    }
    if (isNext) {
      // Jupyter: render this block and open the next one, or a new one after the last.
      e.preventDefault();
      const closed = close(block);
      const wasRemoved = closed !== notes;
      const from = block.isNew ? closed.length : wasRemoved ? block.start : block.end;
      const next = splitBlocks(closed).find((b) => b.start >= from);
      return next ? open(next) : openNew();
    }
    if (isMergeBack) {
      e.preventDefault();
      const closed = close(block);
      const previous = splitBlocks(closed).findLast((b) => b.end <= block.start);
      if (previous) open(previous);
    }
  }

  useImperativeHandle(ref, () => ({
    target: () => {
      const box = editor.current;
      if (editing && box) {
        if (editing.isNew) return undefined;
        return { start: editing.start + box.selectionStart, end: editing.start + box.selectionEnd, isEditing: true };
      }
      return currentBlock && { start: currentBlock.start, end: currentBlock.end, isEditing: false };
    },
    select: (start, end) => {
      const box = editor.current;
      const isInEditor = editing && !editing.isNew && box && start >= editing.start && start <= editing.end;
      if (isInEditor) {
        box.focus();
        box.setSelectionRange(start - editing.start, Math.min(end, editing.end) - editing.start);
        scrollToSelection(box);
        return;
      }
      const block = blockAt(splitBlocks(notes), start);
      if (!block) return;
      open(block, { start: start - block.start, end: Math.min(end, block.end) - block.start });
    },
    edit: (next, caret) => {
      onChange(next);
      const grown = next.length - notes.length;
      const isInEditor = editing && !editing.isNew && caret >= editing.start && caret <= editing.end + grown;
      if (isInEditor) {
        setEditing({ ...editing, end: editing.end + grown });
        pendingSelection.current = { start: caret - editing.start, end: caret - editing.start };
        return;
      }
      const block = blockAt(splitBlocks(next), caret);
      if (block) open(block, { start: caret - block.start, end: caret - block.start });
    },
  }));

  useMarginLayout(container);

  const isEmpty = rows.length === 0;
  const isGhostShown = !editing?.isNew;

  return (
    <div className="notes-rows" ref={container}>
      {rows.map((row, i) => {
        const isCurrent = row.isEditing || row.start === currentBlock?.start;
        return (
          <div className="row" key={i}>
            <div className="notes-cell">
              {row.isEditing && editing ? (
                <textarea
                  ref={editor}
                  className="block editor"
                  aria-label="Note (Esc to finish, Shift+Enter for the next note)"
                  rows={1}
                  value={row.text}
                  onChange={(e) => change(editing, e.target.value)}
                  onKeyDown={(e) => onEditorKeyDown(e, editing)}
                  onBlur={() => {
                    // Ignore a blur from an editor already closed, from our own refocus, or from leaving the window.
                    const isStale = editing.id !== openId.current || isRefocusing.current || !document.hasFocus();
                    if (!isStale) close(editing);
                  }}
                />
              ) : (
                <div
                  className={isCurrent ? "block is-current" : "block"}
                  tabIndex={0}
                  data-start={row.start}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(row.text) }}
                  onFocus={() => setCurrent(row.start)}
                  onClick={(e) => {
                    // A link opens normally (in a new tab); a drag that selected text stays a selection.
                    const isLink = (e.target as Element).closest("a") !== null;
                    const hasSelection = window.getSelection()?.isCollapsed === false;
                    if (isLink || hasSelection) return;
                    open(row);
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || e.key !== "Enter") return; // Enter on a link follows it
                    e.preventDefault();
                    if (e.metaKey || e.ctrlKey) return onReactShortcut();
                    open(row);
                  }}
                />
              )}
            </div>
            {renderMargin(row, isCurrent)}
          </div>
        );
      })}
      <div className="row">
        <div className="notes-cell">
          {isGhostShown && (
            <button type="button" className={isEmpty ? "ghost is-empty" : "ghost"} onClick={openNew}>
              {isEmpty ? EMPTY_COPY : "Write a note…"}
            </button>
          )}
        </div>
        <div className="margin-cell" />
      </div>
      {detached.length > 0 && (
        <div className="row">
          <div className="notes-cell" />
          {renderDetached(detached)}
        </div>
      )}
      {/* Takes the rest of the height, so the notes sheet and the margin rule reach the bottom. */}
      <div className="row fill" aria-hidden="true">
        <div className="notes-cell" />
        <div className="margin-cell" />
      </div>
    </div>
  );
}
