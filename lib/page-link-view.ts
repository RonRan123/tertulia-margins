// The page-link layer in the notes editor (R4, D33, D45): each page reference shows as a pill,
// "↗ p. 42", coloured by how it was matched (exact quote, word overlap, page only). On a line the
// selection touches the reference shows as written, so it can be edited, like live preview's
// markup. Decorations only: the notes' text never changes. The page sends fresh links with
// `setPageLinks`; between sends, the spans follow edits. Clicking a pill opens it (see `linkAt`).
import { Prec, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { LINK_METHODS, pageLabel, pillName, type PageLink } from "@/core/page-links.ts";

export const setPageLinks = StateEffect.define<PageLink[]>();

class Pill extends WidgetType {
  constructor(
    readonly index: number,
    readonly link: PageLink,
    readonly label: string,
  ) {
    super();
  }
  toDOM() {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `cite-pill is-${this.link.method}`;
    pill.dataset.link = String(this.index);
    pill.textContent = `↗ ${this.label}`;
    pill.title = `${LINK_METHODS[this.link.method]}: PDF page ${this.link.pdfPage}. Click to open.`;
    pill.setAttribute("aria-label", pillName(this.label, this.link.method));
    return pill;
  }
  eq(other: Pill) {
    return other.index === this.index && other.label === this.label && other.link.method === this.link.method && other.link.pdfPage === this.link.pdfPage;
  }
  ignoreEvent() {
    return false; // let the editor's mousedown handler see clicks
  }
}

// Each reference's span, carrying its link; mapped through edits until fresh links arrive.
type Spans = { links: PageLink[]; spans: DecorationSet };
const span = (link: PageLink, index: number) => Decoration.mark({ link, index }).range(link.start, link.end);

// Off the lines the selection touches (all of them while the editor isn't focused), a pill
// replaces the reference; on them, the reference is underlined as written.
function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const isEdited = (from: number, to: number) =>
    view.hasFocus && state.selection.ranges.some((r) => state.doc.lineAt(r.from).from <= to && state.doc.lineAt(r.to).to >= from);
  const ranges: Range<Decoration>[] = [];
  const cursor = state.field(pageLinksField).spans.iter();
  for (; cursor.value; cursor.next()) {
    const { from, to } = cursor;
    const { link, index } = cursor.value.spec as { link: PageLink; index: number };
    const attributes = { "data-link": String(index) };
    const isOneLine = state.doc.lineAt(from).to >= to; // a plugin may not replace a line break
    ranges.push(
      isEdited(from, to) || !isOneLine
        ? Decoration.mark({ class: `md-pageref is-${link.method}`, attributes }).range(from, to)
        : Decoration.replace({ widget: new Pill(index, link, pageLabel(state.sliceDoc(from, to))) }).range(from, to),
    );
  }
  return Decoration.set(ranges);
}

// Above live preview, so a pill wins over its hiding of "[p. 3]"'s brackets.
const pills = Prec.high(
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view);
      }
      update(update: ViewUpdate) {
        const isNewLinks = update.startState.field(pageLinksField) !== update.state.field(pageLinksField);
        if (isNewLinks || update.docChanged || update.selectionSet || update.focusChanged) this.decorations = decorate(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  ),
);

export const pageLinksField = StateField.define<Spans>({
  create: () => ({ links: [], spans: Decoration.none }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setPageLinks)) continue;
      const links = effect.value.filter((l) => l.end <= tr.state.doc.length);
      return { links, spans: Decoration.set(links.map(span)) };
    }
    return tr.docChanged ? { ...value, spans: value.spans.map(tr.changes) } : value;
  },
  provide: () => pills,
});

// The link a click opens, like a link in Obsidian's live preview: a pill always; the reference as
// written (on a line being edited, where a click places the caret) only with ⌘/Ctrl-click.
export function linkAt(view: EditorView, event: MouseEvent): PageLink | undefined {
  const target = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".cite-pill[data-link], .md-pageref[data-link]");
  if (!target) return undefined;
  const link = view.state.field(pageLinksField).links[Number(target.dataset.link)];
  const isPill = target.classList.contains("cite-pill");
  return isPill || event.metaKey || event.ctrlKey ? link : undefined;
}
