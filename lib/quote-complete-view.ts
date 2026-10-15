// Quote autocomplete in the notes editor (D46): faded ghost text after the caret with the book's
// next words (core/quote-complete). Tab inserts them, so the words are the reader's keypress (D6);
// Esc hides them until the reader types again. Tab indents a list item (D36) only when no ghost
// shows: this keymap runs first and passes Tab on when there is none.
import { Prec, StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, keymap, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { quoteIndex, suggestQuote, type QuoteIndex } from "@/core/quote-complete.ts";

// The book to complete from: the PDF's text, else the reference text; "" turns the feature off.
export const setQuoteSource = StateEffect.define<string>();
const dismissGhost = StateEffect.define<null>();

const sourceField = StateField.define<string>({
  create: () => "",
  update(source, tr) {
    for (const effect of tr.effects) if (effect.is(setQuoteSource)) source = effect.value;
    return source;
  },
});

// Indexed when a suggestion is first asked for, not as the source changes: the reference text
// changes on every keystroke while the reader edits it.
let cached: { source: string; index: QuoteIndex } | undefined;
function indexOf(source: string): QuoteIndex | undefined {
  if (source.trim() === "") return undefined;
  if (cached?.source !== source) cached = { source, index: quoteIndex(source) };
  return cached.index;
}

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-ghost";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
}

type Ghost = { pos: number; text: string };

// A ghost shows only for a focused editor with a bare caret at the end of a line or before a space.
function ghostFor(state: EditorState, hasFocus: boolean): Ghost | undefined {
  const caret = state.selection.main;
  if (!hasFocus || state.selection.ranges.length > 1 || !caret.empty) return undefined;
  const line = state.doc.lineAt(caret.head);
  const after = line.text.slice(caret.head - line.from);
  const isAtWordEnd = after === "" || /^\s/.test(after);
  const index = isAtWordEnd ? indexOf(state.field(sourceField)) : undefined;
  if (!index) return undefined;
  const text = suggestQuote(index, line.text.slice(0, caret.head - line.from));
  return text ? { pos: caret.head, text } : undefined;
}

const ghostPlugin = ViewPlugin.fromClass(
  class {
    ghost: Ghost | undefined;
    isDismissed = false;
    decorations: DecorationSet = Decoration.none;

    update(update: ViewUpdate) {
      if (update.docChanged) this.isDismissed = false;
      const effects = update.transactions.flatMap((tr) => tr.effects);
      if (effects.some((e) => e.is(dismissGhost))) this.isDismissed = true;
      const isStale = update.docChanged || update.selectionSet || update.focusChanged || effects.some((e) => e.is(setQuoteSource) || e.is(dismissGhost));
      if (!isStale) return;
      this.ghost = this.isDismissed ? undefined : ghostFor(update.state, update.view.hasFocus);
      this.decorations = this.ghost
        ? Decoration.set([Decoration.widget({ widget: new GhostWidget(this.ghost.text), side: 1 }).range(this.ghost.pos)])
        : Decoration.none;
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const shownGhost = (view: EditorView) => view.plugin(ghostPlugin)?.ghost;

function acceptGhost(view: EditorView): boolean {
  const ghost = shownGhost(view);
  if (!ghost) return false;
  const end = ghost.pos + ghost.text.length;
  view.dispatch({ changes: { from: ghost.pos, insert: ghost.text }, selection: { anchor: end }, userEvent: "input.complete", scrollIntoView: true });
  return true;
}

function hideGhost(view: EditorView): boolean {
  if (!shownGhost(view)) return false;
  view.dispatch({ effects: dismissGhost.of(null) });
  return true;
}

export const quoteComplete = [
  sourceField,
  ghostPlugin,
  Prec.highest(keymap.of([
    { key: "Tab", run: acceptGhost },
    { key: "Escape", run: hideGhost },
  ])),
];
