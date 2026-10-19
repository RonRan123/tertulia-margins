"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder, type DecorationSet } from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { layoutRows, stackCards, type Row } from "@/core/blocks.ts";
import type { PageLink } from "@/core/page-links.ts";
import { listKeys } from "@/lib/list-keys.ts";
import { livePreview, markdownLanguage } from "@/lib/live-preview.ts";
import { linkAt, pageLinksField, setPageLinks } from "@/lib/page-link-view.ts";
import { quoteComplete, setQuoteSource } from "@/lib/quote-complete-view.ts";

// The notes (D25): one markdown file in one CodeMirror editor, rendered in place like Obsidian's
// live preview. The notes stay one string, so store, export and the AI see exactly what is typed.
// The user's own words only (D6): the AI never writes here; daemons' cards sit in the margin
// column beside the paragraph they answer (D37).

// A margin card: anything anchored to the exact words it answers.
type Card = { id: string; excerpt: string };

type NotesProps<C extends Card> = {
  notes: string;
  cards: C[]; // shown beside the paragraph their excerpt starts in; those whose words are gone aren't shown
  onChange: (notes: string) => void;
  marginHeader: ReactNode; // the top of the margin column; cards start below it
  renderMargin: (row: Row<C>) => ReactNode;
  // R4: page links computed for `notes` (they may lag a keystroke behind); a marker click opens one.
  pageLinks: { notes: string; links: PageLink[] };
  onOpenLink: (link: PageLink) => void;
  // The card the reader clicked: its words in the notes are marked in its colour (D37).
  highlight?: { id: string; colour: string };
  // D46: the book text quotes autocomplete from (the PDF's text, else the reference text);
  // undefined or empty turns it off.
  quoteSource?: string;
};

// The marked words of the clicked card. A decoration, not a selection: it shows while the editor
// isn't focused, and follows edits around it.
type Highlight = { from: number; to: number; colour: string };
const setHighlight = StateEffect.define<Highlight | null>();
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setHighlight)) continue;
      const h = effect.value;
      marks = h
        ? Decoration.set([Decoration.mark({ class: "cm-card-highlight", attributes: { style: `--daemon: ${h.colour}` } }).range(h.from, h.to)])
        : Decoration.none;
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const EMPTY_COPY = "Write what you notice as you read. When you pause, the daemons in the margin may answer.";
const CARD_GAP = 12; // px, var(--s3): between groups pushed together, and below the last one

export function Notes<C extends Card>({ notes, cards, onChange, marginHeader, renderMargin, pageLinks, onOpenLink, highlight, quoteSource }: NotesProps<C>) {
  const host = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  // The editor is made once; this keeps its listeners pointing at the latest props.
  const latest = useRef({ onChange, onOpenLink });
  useEffect(() => {
    latest.current = { onChange, onOpenLink };
  });

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: "",
        extensions: [
          history(),
          keymap.of([
            ...listKeys,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdownLanguage.extension,
          indentUnit.of("\t"),
          EditorState.tabSize.of(4),
          livePreview,
          pageLinksField,
          highlightField,
          quoteComplete,
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
          // The browser's own spell check (CodeMirror turns it off by default): squiggles and
          // right-click suggestions from the reader's OS dictionary.
          EditorView.contentAttributes.of({ "aria-label": "Notes", spellcheck: "true", autocorrect: "on" }),
          placeholder(EMPTY_COPY),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const isFromProps = update.transactions.every((t) => t.annotation(Transaction.remote));
              if (!isFromProps) latest.current.onChange(update.state.doc.toString());
            }
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

  useEffect(() => {
    view.current?.dispatch({ effects: setQuoteSource.of(quoteSource ?? "") });
  }, [quoteSource]);

  const { rows } = layoutRows(notes, cards);
  const withCards = rows.filter((row) => row.cards.length > 0);

  // Mark the clicked card's words; scroll to them only when a card is first clicked, not as the
  // reader types around them. A dismissed card, or one whose words are gone, clears the mark.
  const marked = highlight && withCards.flatMap((row) => row.cards).find(({ card }) => card.id === highlight.id);
  const markKey = marked ? `${highlight.id}:${marked.start}:${marked.end}` : "";
  const scrolledFor = useRef<string>(undefined);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() !== notes) return;
    if (!marked) {
      scrolledFor.current = undefined; // clicking the same card again later scrolls to it again
      return void editor.dispatch({ effects: setHighlight.of(null) });
    }
    const isNewlyClicked = scrolledFor.current !== highlight.id;
    scrolledFor.current = highlight.id;
    const effects = [setHighlight.of({ from: marked.start, to: marked.end, colour: highlight.colour })];
    editor.dispatch({ effects: isNewlyClicked ? [...effects, EditorView.scrollIntoView(marked.start, { y: "center" })] : effects });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markKey stands for the card and its range
  }, [markKey]);
  // Wide screens: each paragraph's group of cards (.margin-group, absolutely placed) starts level
  // with the line its first card answers or, if that would overlap the group above, just below it, like
  // comments in Google Docs (core stackCards). Phone (one
  // column): the groups stay in flow under the notes. Runs after every render and whenever the
  // editor or a group changes size.
  useLayoutEffect(() => {
    const editor = view.current;
    const root = column.current;
    if (!editor || !root) return;
    const starts = withCards.map((row) => row.cards[0].start); // the line the paragraph's first card answers
    const groups = [...root.querySelectorAll<HTMLElement>(":scope > .margin-group")];
    const layout = () => {
      const isOneColumn = window.matchMedia("(max-width: 48rem)").matches;
      if (isOneColumn) {
        root.style.minHeight = "";
        for (const group of groups) group.style.top = "";
        return;
      }
      const origin = root.getBoundingClientRect().top;
      const measured = groups.map((group, i) => ({
        anchor: editor.documentTop + editor.lineBlockAt(starts[i]).top - origin,
        height: group.offsetHeight,
      }));
      const header = root.querySelector<HTMLElement>(":scope > .margin-header");
      const tops = stackCards(measured, CARD_GAP, header ? header.offsetHeight + CARD_GAP : -Infinity);
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
        <div className="margin-header">{marginHeader}</div>
        {withCards.map((row) => (
          // Keyed by its first card, not its offset, so typing above it doesn't reset its cards.
          <div className="margin-group" key={row.cards[0].card.id}>
            {renderMargin(row)}
          </div>
        ))}
      </div>
    </div>
  );
}
