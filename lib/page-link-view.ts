// The page-link layer in the notes editor (R4, D33): each page reference gets a style and a small
// marker after it (● exact quote, ◐ word overlap, ○ page only). Decorations only: the notes' text
// never changes. The page sends fresh links with `setPageLinks`; between sends, the marks follow
// edits. Clicking the reference or its marker opens it (see `linkAt` and Notes).
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import type { LinkMethod, PageLink } from "@/core/page-links.ts";

export const setPageLinks = StateEffect.define<PageLink[]>();

const MARKERS: Record<LinkMethod, { symbol: string; label: string }> = {
  exact: { symbol: "●", label: "Quote found" },
  overlap: { symbol: "◐", label: "Closest paragraph by shared words" },
  page: { symbol: "○", label: "Estimated page" },
};

class LinkMarker extends WidgetType {
  constructor(
    readonly index: number,
    readonly link: PageLink,
  ) {
    super();
  }
  toDOM() {
    const { symbol, label } = MARKERS[this.link.method];
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `md-pagelink is-${this.link.method}`;
    marker.dataset.link = String(this.index);
    marker.textContent = symbol;
    marker.title = `${label}: PDF page ${this.link.pdfPage}. Click to open.`;
    marker.setAttribute("aria-label", `Open PDF page ${this.link.pdfPage} (${label.toLowerCase()})`);
    return marker;
  }
  eq(other: LinkMarker) {
    return other.index === this.index && other.link.method === this.link.method && other.link.pdfPage === this.link.pdfPage;
  }
  ignoreEvent() {
    return false; // let the editor's mousedown handler see clicks
  }
}

function decorate(links: PageLink[], docLength: number): DecorationSet {
  const ranges = links
    .filter((l) => l.end <= docLength)
    .flatMap((link, index) => [
      Decoration.mark({ class: `md-pageref is-${link.method}`, attributes: { "data-link": String(index) } }).range(link.start, link.end),
      Decoration.widget({ widget: new LinkMarker(index, link), side: 1 }).range(link.end),
    ]);
  return Decoration.set(ranges, true);
}

export const pageLinksField = StateField.define<{ links: PageLink[]; decorations: DecorationSet }>({
  create: () => ({ links: [], decorations: Decoration.none }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPageLinks)) return { links: effect.value, decorations: decorate(effect.value, tr.state.doc.length) };
    }
    return tr.docChanged ? { ...value, decorations: value.decorations.map(tr.changes) } : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

// The link a click opens, like a link in Obsidian's live preview: a marker always; the reference
// text itself unless it sits on a line being edited (there a click places the caret, so the
// reference can be changed), where ⌘/Ctrl-click still opens it.
export function linkAt(view: EditorView, event: MouseEvent): PageLink | undefined {
  const target = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".md-pagelink, .md-pageref[data-link]");
  if (!target) return undefined;
  const link = view.state.field(pageLinksField).links[Number(target.dataset.link)];
  const isMarker = target.classList.contains("md-pagelink");
  const line = view.state.doc.lineAt(view.posAtDOM(target));
  const head = view.state.selection.main.head;
  const isLineBeingEdited = view.hasFocus && head >= line.from && head <= line.to;
  const isOpen = isMarker || !isLineBeingEdited || event.metaKey || event.ctrlKey;
  return isOpen ? link : undefined;
}
