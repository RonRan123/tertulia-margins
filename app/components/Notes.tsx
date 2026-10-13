"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { blockAt, layoutRows, splitBlocks, stackCards, type Row } from "@/core/blocks.ts";
import type { Reaction } from "@/core/store.ts";
import type { PageLink } from "@/core/page-links.ts";
import { listKeys } from "@/lib/list-keys.ts";
import { livePreview, markdownLanguage } from "@/lib/live-preview.ts";
import { linkAt, pageLinksField, setPageLinks } from "@/lib/page-link-view.ts";

// The notes (D25): one markdown file in one CodeMirror editor, rendered in place like Obsidian's
// live preview. The notes stay one string, so store, export and the AI see exactly what is typed.
// The user's own words only (D6): the AI never writes here; its reactions sit in the margin
// column beside the paragraph they answer.

type Range = { start: number; end: number };

export type NotesHandle = {
  // What React acts on, in notes offsets: the editor's selection (or caret), kept while it is blurred.
  target: () => (Range & { isEditing: boolean }) | undefined;
  // Shows a range: selects it and scrolls it into view.
  select: (start: number, end: number) => void;
};

type NotesProps = {
  notes: string;
  reactions: Reaction[];
  onChange: (notes: string) => void;
  onReactShortcut: () => void; // Cmd/Ctrl+Enter
  renderMargin: (row: Row<Reaction>, isCurrent: boolean) => ReactNode;
  renderDetached: (detached: Reaction[]) => ReactNode;
  // R4: page links computed for `notes` (they may lag a keystroke behind); a marker click opens one.
  pageLinks: { notes: string; links: PageLink[] };
  onOpenLink: (link: PageLink) => void;
  ref?: Ref<NotesHandle>;
};

const EMPTY_COPY = "Write what you notice as you read. Put the cursor in a paragraph and press React to hear back.";
const CARD_GAP = 12; // px, var(--s3): between groups pushed together, and below the last one

export function Notes({ notes, reactions, onChange, onReactShortcut, renderMargin, renderDetached, pageLinks, onOpenLink, ref }: NotesProps) {
  const host = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const [caret, setCaret] = useState<number>(); // where the selection's head is, for the current paragraph
  // The editor is made once; this keeps its listeners pointing at the latest props.
  const latest = useRef({ onChange, onReactShortcut, onOpenLink });
  useEffect(() => {
    latest.current = { onChange, onReactShortcut, onOpenLink };
  });

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: "",
        extensions: [
          history(),
          keymap.of([
            { key: "Mod-Enter", run: () => (latest.current.onReactShortcut(), true) },
            ...listKeys,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdownLanguage.extension,
          indentUnit.of("\t"),
          EditorState.tabSize.of(4),
          livePreview,
          pageLinksField,
          EditorView.domEventHandlers({
            mousedown: (event, view) => {
              const link = linkAt(view, event);
              if (!link) return false;
              event.preventDefault(); // the click opens the PDF; the caret stays where it was
              latest.current.onOpenLink(link);
              return true;
            },
          }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Notes" }),
          placeholder(EMPTY_COPY),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const isFromProps = update.transactions.every((t) => t.annotation(Transaction.remote));
              if (!isFromProps) latest.current.onChange(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) setCaret(update.state.selection.main.head);
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  // Notes changed from outside the editor (loaded from storage, another tab): replace the text,
  // outside undo history. Typing never lands here, since onChange already made notes match.
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === notes) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: notes },
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
  }, [notes]);

  // Fresh links go in only when they were computed for exactly the text in the editor; stale ones
  // would mark the wrong characters.
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() !== pageLinks.notes) return;
    editor.dispatch({ effects: setPageLinks.of(pageLinks.links) });
  }, [pageLinks]);

  useImperativeHandle(ref, () => ({
    target: () => {
      const editor = view.current;
      if (!editor) return undefined;
      const { from, to } = editor.state.selection.main;
      return { start: from, end: to, isEditing: true };
    },
    select: (start, end) => {
      const editor = view.current;
      if (!editor) return;
      const length = editor.state.doc.length;
      editor.dispatch({ selection: { anchor: Math.min(start, length), head: Math.min(end, length) }, scrollIntoView: true });
      editor.focus();
    },
  }));

  const { rows, detached } = layoutRows(notes, reactions);
  const withReactions = rows.filter((row) => row.reactions.length > 0);
  const current = caret !== undefined ? blockAt(splitBlocks(notes), caret) : undefined;
  // Wide screens: each paragraph's group of cards (.margin-group, absolutely placed) starts level
  // with the paragraph's first line or, if that would overlap the group above, just below it, like
  // comments in Google Docs (core stackCards). Detached cards go below the last group. Phone (one
  // column): the groups stay in flow under the notes. Runs after every render and whenever the
  // editor or a group changes size.
  useLayoutEffect(() => {
    const editor = view.current;
    const root = column.current;
    if (!editor || !root) return;
    const starts = withReactions.map((row) => row.start);
    const groups = [...root.querySelectorAll<HTMLElement>(":scope > .margin-group")];
    const layout = () => {
      const isOneColumn = window.matchMedia("(max-width: 48rem)").matches;
      if (isOneColumn) {
        root.style.minHeight = "";
        for (const group of groups) group.style.top = "";
        return;
      }
      const origin = root.getBoundingClientRect().top;
      const docBottom = editor.documentTop + editor.contentHeight - origin;
      // A group with no start (detached) wants the end of the notes.
      const measured = groups.map((group, i) => ({
        anchor: i < starts.length ? editor.documentTop + editor.lineBlockAt(starts[i]).top - origin : docBottom,
        height: group.offsetHeight,
      }));
      const tops = stackCards(measured, CARD_GAP);
      groups.forEach((group, i) => (group.style.top = `${tops[i]}px`));
      const bottom = Math.max(0, ...tops.map((top, i) => top + measured[i].height + CARD_GAP));
      root.style.minHeight = `${bottom}px`;
    };
    layout();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout); // next frame: no resize loop from our own min-height
    });
    observer.observe(editor.contentDOM);
    for (const group of groups) observer.observe(group);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  return (
    <div className="row notes-row">
      <div className="notes-cell">
        <div className="notes-editor" ref={host} />
      </div>
      <div className="margin-cell margin-column" ref={column}>
        {withReactions.map((row) => (
          // Keyed by its first card, not its offset, so typing above it doesn't reset its cards.
          <div className="margin-group" key={row.reactions[0].reaction.id}>
            {renderMargin(row, row.start === current?.start)}
          </div>
        ))}
        {detached.length > 0 && <div className="margin-group">{renderDetached(detached)}</div>}
      </div>
    </div>
  );
}
