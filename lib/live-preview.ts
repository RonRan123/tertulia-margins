// Obsidian-style live preview for the notes editor (D25): markdown renders in place (headings,
// bold, italics, code, links, quotes, lists, [¶n] cites), and its symbols (#, **, >, [](url))
// show only on the lines the selection touches, so the line you edit is plain markdown.
// The text is never changed: decorations only style or hide characters. Raw HTML stays text.
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

// lang-markdown's GFM language (D36): its list commands only run where it is the active language.
// It also parses ~sub~, ^sup^ and :emoji:, which live preview leaves as plain text.
export { markdownLanguage } from "@codemirror/lang-markdown";

// [¶4], [¶3-4], [¶4, p. 12], [¶12 · p. 101], [¶2, PDF p. 3]
const CITE = /\[¶\s*\d[^[\]\n]*\]/g;

// Inline styles by syntax node; the class names are styled in globals.css.
const MARKS: Record<string, string> = {
  StrongEmphasis: "md-strong",
  Emphasis: "md-em",
  InlineCode: "md-code",
  Strikethrough: "md-strike",
  Link: "md-link",
};
// Syntax symbols hidden off the active lines. HeaderMark and QuoteMark also take the space after them.
const HIDDEN = new Set(["HeaderMark", "QuoteMark", "EmphasisMark", "CodeMark", "StrikethroughMark", "LinkMark", "URL"]);
const hide = Decoration.replace({});

class Bullet extends WidgetType {
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "md-bullet";
    dot.textContent = "•";
    return dot;
  }
  eq() {
    return true;
  }
}
const bullet = Decoration.replace({ widget: new Bullet() });

// Lines the selection touches; none while the editor isn't focused, so everything renders.
function activeLines(state: EditorState, hasFocus: boolean): Set<number> {
  const lines = new Set<number>();
  if (!hasFocus) return lines;
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const active = activeLines(state, view.hasFocus);
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const ranges: Range<Decoration>[] = [];
  const lineClass = (pos: number, className: string) => ranges.push(Decoration.line({ class: className }).range(state.doc.lineAt(pos).from));

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) lineClass(node.from, `md-h${heading[1]}`);
        if (name === "Blockquote" || name === "FencedCode") {
          const className = name === "Blockquote" ? "md-quote" : "md-codeblock";
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            lineClass(line.from, className);
            pos = line.to + 1;
          }
          if (name === "FencedCode") return false; // its marks and text stay as written
        }
        if (MARKS[name]) ranges.push(Decoration.mark({ class: MARKS[name] }).range(node.from, node.to));
        if (isActive(node.from)) return;
        if (name === "ListMark" && /^[-*+]$/.test(state.sliceDoc(node.from, node.to))) {
          ranges.push(bullet.range(node.from, node.to));
          return;
        }
        if (!HIDDEN.has(name)) return;
        // A bare URL (<https://…> or autolinked) stays visible; only a link's (url) part hides.
        if (name === "URL" && node.node.parent?.name !== "Link") return;
        const takesSpace = (name === "HeaderMark" || name === "QuoteMark") && state.sliceDoc(node.to, node.to + 1) === " ";
        if (node.to > node.from || takesSpace) ranges.push(hide.range(node.from, node.to + (takesSpace ? 1 : 0)));
      },
    });
    const text = state.sliceDoc(from, to);
    for (const match of text.matchAll(CITE)) {
      const start = from + match.index;
      ranges.push(Decoration.mark({ class: "md-cite" }).range(start, start + match[0].length));
    }
  }
  return Decoration.set(ranges, true); // true: sorts them
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(update: ViewUpdate) {
      const isStale = update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged;
      const isTreeNew = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (isStale || isTreeNew) this.decorations = decorate(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
