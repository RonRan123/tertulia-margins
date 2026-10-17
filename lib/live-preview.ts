// Obsidian-style live preview for the notes editor (D25): markdown renders in place (headings,
// bold, italics, code, links, quotes, lists, task checkboxes, rules, images, tables, [¶n] cites),
// and its symbols (#, **, >, [](url), ***, |) show only on the lines the selection touches, so the
// line you edit is plain markdown. A table shows as written while the selection is anywhere in it.
// The text is never changed: decorations only style or hide characters. Raw HTML stays text.
import { syntaxTree } from "@codemirror/language";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

// lang-markdown's GFM language (D36): its list commands only run where it is the active language.
// It also parses ~sub~, ^sup^ and :emoji:, which live preview leaves as plain text.
export { markdownLanguage };

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

// A list item's wrapped lines start under its text, not under its bullet: the indent and the
// marker (with its space) sit in fixed-width boxes, and the line hangs by their total width.
// Widths are in em, so this holds in the proportional font, raw or rendered.
const TAB_EM = 1.5;
const BULLET_EM = 1; // a rendered bullet's box; matches .md-bullet's width
function hangListItem(state: EditorState, markFrom: number, markTo: number, ranges: Range<Decoration>[], isBullet: boolean) {
  const line = state.doc.lineAt(markFrom);
  const indent = state.sliceDoc(line.from, markFrom);
  const isLineStart = /^[ \t]*$/.test(indent); // not a list inside a quote ("> - …")
  const hasSpace = state.sliceDoc(markTo, markTo + 1) === " ";
  if (!isLineStart || !hasSpace) return;
  const tabs = indent.split("\t").length - 1;
  const indentEm = (tabs + (indent.length - tabs) / 4) * TAB_EM;
  const markerEm = isBullet ? BULLET_EM : 0.6 * (markTo - markFrom) + 0.4;
  const box = (em: number) => ({ class: "md-listbox", attributes: { style: `width: ${em}em` } });
  if (indent) ranges.push(Decoration.mark(box(indentEm)).range(line.from, markFrom));
  if (!isBullet) ranges.push(Decoration.mark(box(markerEm)).range(markFrom, markTo + 1));
  const hang = indentEm + markerEm;
  ranges.push(Decoration.line({ class: "md-li", attributes: { style: `padding-left: ${hang}em; text-indent: -${hang}em` } }).range(line.from));
}

class Rule extends WidgetType {
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "md-hr";
    return rule;
  }
  eq() {
    return true;
  }
}
const rule = Decoration.replace({ widget: new Rule() });

// A task's [ ] or [x]. A click flips the one character between the brackets: the reader's own edit.
class Checkbox extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "md-task";
    box.checked = this.checked;
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const pos = view.posAtDOM(box) + 1;
      view.dispatch({ changes: { from: pos, to: pos + 1, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  eq(other: Checkbox) {
    return other.checked === this.checked;
  }
}

// ![alt](https://…): the image; if it fails to load, its alt text.
class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }
  toDOM() {
    const img = document.createElement("img");
    img.className = "md-image";
    img.src = this.src;
    img.alt = this.alt;
    img.addEventListener("error", () => img.replaceWith(this.alt || this.src));
    return img;
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
}

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
        const heading = /^(ATX|Setext)Heading(\d)$/.exec(name);
        if (heading?.[1] === "ATX") lineClass(node.from, `md-h${heading[2]}`);
        // A setext heading's text lines; its last line is the === or --- underline.
        if (heading?.[1] === "Setext") {
          const underline = state.doc.lineAt(node.to).from;
          for (let pos = node.from; pos < underline; pos = state.doc.lineAt(pos).to + 1) lineClass(pos, `md-h${heading[2]}`);
        }
        if (name === "Table") return false; // drawn by tableField
        if (name === "Blockquote" || name === "FencedCode") {
          const className = name === "Blockquote" ? "md-quote" : "md-codeblock";
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            lineClass(line.from, className);
            pos = line.to + 1;
          }
          if (name === "FencedCode") return false; // its marks and text stay as written
        }
        // "[p. 2]" or "[sic]": brackets with no (url) or [label] aren't a link, so they stay as written.
        const isBareBrackets = (link: { name: string; getChild: (name: string) => unknown } | null) => link?.name === "Link" && !link.getChild("URL") && !link.getChild("LinkLabel");
        if (isBareBrackets(node.node)) return;
        if (MARKS[name]) ranges.push(Decoration.mark({ class: MARKS[name] }).range(node.from, node.to));
        const isBullet = name === "ListMark" && !isActive(node.from) && /^[-*+]$/.test(state.sliceDoc(node.from, node.to));
        if (name === "ListMark") hangListItem(state, node.from, node.to, ranges, isBullet);
        const isDone = name === "Task" && /^\[[xX]\]/.test(state.sliceDoc(node.from, node.from + 3));
        const textFrom = node.from + 3 + (state.sliceDoc(node.from + 3, node.from + 4) === " " ? 1 : 0);
        if (isDone && node.to > textFrom) ranges.push(Decoration.mark({ class: "md-task-done" }).range(textFrom, node.to));
        if (isActive(node.from)) return;
        if (name === "HorizontalRule") {
          ranges.push(rule.range(node.from, node.to));
          return;
        }
        if (name === "TaskMarker") {
          ranges.push(Decoration.replace({ widget: new Checkbox(isChecked(state, node.from)) }).range(node.from, node.to));
          return;
        }
        // A task's bullet hides, as in Obsidian: the checkbox stands in for it.
        const isTaskBullet = name === "ListMark" && node.node.nextSibling?.name === "Task";
        if (isTaskBullet) {
          const takesSpace = state.sliceDoc(node.to, node.to + 1) === " ";
          ranges.push(hide.range(node.from, node.to + (takesSpace ? 1 : 0)));
          return;
        }
        if (name === "Image") {
          const image = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)[^)]*\)$/.exec(state.sliceDoc(node.from, node.to));
          if (image) ranges.push(Decoration.replace({ widget: new ImageWidget(image[2], image[1]) }).range(node.from, node.to));
          return false;
        }
        if (isBullet) {
          // The bullet takes its space too: it is the marker's fixed-width box (.md-bullet).
          const hasSpace = state.sliceDoc(node.to, node.to + 1) === " ";
          ranges.push(bullet.range(node.from, node.to + (hasSpace ? 1 : 0)));
          return;
        }
        if (!HIDDEN.has(name) || (name === "LinkMark" && isBareBrackets(node.node.parent))) return;
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

function isChecked(state: EditorState, markerFrom: number): boolean {
  return /[xX]/.test(state.sliceDoc(markerFrom + 1, markerFrom + 2));
}

// Tables replace whole lines, which only a state field may do, so they get their own field. Like
// the plugin's lines, a table shows as written while the focused selection touches it.
const setFocus = StateEffect.define<boolean>();
const focusField = StateField.define<boolean>({
  create: () => false,
  update: (focused, tr) => tr.effects.reduce((value, effect) => (effect.is(setFocus) ? effect.value : value), focused),
});

type Align = "left" | "center" | "right" | "";

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
}

// A cell's inline markdown (bold, italics, code, links…) styled as in the notes, symbols hidden.
function renderInline(text: string, parent: HTMLElement) {
  const classes: string[] = Array(text.length).fill("");
  const hidden: boolean[] = Array(text.length).fill(false);
  markdownLanguage.parser.parse(text).iterate({
    enter: (node) => {
      const isHidden = HIDDEN.has(node.name) && !(node.name === "URL" && node.node.parent?.name !== "Link");
      for (let i = node.from; i < node.to; i++) {
        if (MARKS[node.name]) classes[i] += ` ${MARKS[node.name]}`;
        if (isHidden) hidden[i] = true;
      }
    },
  });
  let run = "";
  for (let i = 0; i <= text.length; i++) {
    const isRunEnd = i === text.length || hidden[i] || (i > 0 && classes[i] !== classes[i - 1]);
    if (isRunEnd && run) {
      const span = document.createElement("span");
      span.className = classes[i - 1].trim();
      span.textContent = run;
      parent.append(span);
      run = "";
    }
    if (i < text.length && !hidden[i]) run += text[i];
  }
}

class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  toDOM(view: EditorView) {
    const [header, delimiter, ...rows] = this.source.split("\n");
    const aligns: Align[] = cells(delimiter).map((cell) =>
      /^:-+:$/.test(cell) ? "center" : /-:$/.test(cell) ? "right" : /^:/.test(cell) ? "left" : "",
    );
    const table = document.createElement("table");
    table.className = "md-table";
    for (const [index, line] of [header, ...rows].entries()) {
      const row = table.insertRow();
      for (const [column, text] of cells(line).entries()) {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (aligns[column]) cell.style.textAlign = aligns[column];
        renderInline(text, cell);
        row.append(cell);
      }
    }
    // A click puts the caret in the table, which shows it as written to edit.
    table.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: view.posAtDOM(table) } });
      view.focus();
    });
    return table;
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
}

function decorateTables(state: EditorState): DecorationSet {
  const focused = state.field(focusField);
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return;
      const isEdited = focused && state.selection.ranges.some((range) => range.from <= node.to && range.to >= node.from);
      if (!isEdited) {
        const widget = new TableWidget(state.sliceDoc(node.from, node.to));
        ranges.push(Decoration.replace({ widget, block: true }).range(node.from, node.to));
      }
      return false;
    },
  });
  return Decoration.set(ranges);
}

const tableField = StateField.define<DecorationSet>({
  create: decorateTables,
  update: (tables, tr) => {
    const isStale = tr.docChanged || tr.selection || tr.effects.some((effect) => effect.is(setFocus));
    const isTreeNew = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    return isStale || isTreeNew ? decorateTables(tr.state) : tables;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const inlinePreview = ViewPlugin.fromClass(
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

export const livePreview = [
  inlinePreview,
  focusField,
  tableField,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocus.of(focusing)),
];
