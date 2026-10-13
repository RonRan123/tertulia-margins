// Obsidian's list keys for the notes editor (D36): Enter continues a list item or quote (and ends
// the list on an empty item), Backspace on a bare marker removes it, Tab and Shift-Tab indent and
// outdent list items. Indent is a tab, Obsidian's default, which nests under "- " and "1. " alike.
// Off list items Tab moves focus as usual, so the editor never traps the keyboard.
import { indentLess, indentMore } from "@codemirror/commands";
import { deleteMarkupBackward, insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import type { EditorState, StateCommand, Transaction } from "@codemirror/state";

const LIST_ITEM = /^(\s*)([-*+]|(\d+)([.)]))(\s)/; // indent, marker (number, delimiter), space
const BARE_MARKER = /^(\s*)([-*+]|\d+[.)])( \[[ xX]\])? $/; // an item with nothing after its marker

const lineOf = (state: EditorState) => state.doc.lineAt(state.selection.main.head);
const isOnListItems = (state: EditorState) => state.selection.ranges.some((r) => LIST_ITEM.test(state.doc.lineAt(r.from).text));

// An ordered item moved to a new depth is renumbered as Obsidian does: indented, it starts a
// sublist at 1; outdented, it follows the item above it at its new depth (or starts at 1).
function renumber(state: EditorState, dispatch: (tr: Transaction) => void) {
  const line = lineOf(state);
  const match = LIST_ITEM.exec(line.text);
  if (!match?.[3]) return;
  const [, indent, , number] = match;
  let next = 1;
  for (let n = line.number - 1; n >= 1; n--) {
    const above = LIST_ITEM.exec(state.doc.line(n).text);
    if (!above) break;
    if (above[1].length < indent.length) break; // reached the parent: this item starts the sublist
    if (above[1] === indent && above[3]) {
      next = Number(above[3]) + 1;
      break;
    }
  }
  const from = line.from + indent.length;
  if (Number(number) !== next) dispatch(state.update({ changes: { from, to: from + number.length, insert: String(next) } }));
}

const indentItem = (command: StateCommand): StateCommand => ({ state, dispatch }) => {
  if (!isOnListItems(state)) return false;
  let moved = state;
  command({ state, dispatch: (tr) => ((moved = tr.state), dispatch(tr)) });
  renumber(moved, dispatch);
  return true;
};

const removeBareMarker: StateCommand = ({ state, dispatch }) => {
  const line = lineOf(state);
  const isAtEnd = state.selection.main.empty && state.selection.main.head === line.to;
  const match = BARE_MARKER.exec(line.text);
  if (!isAtEnd || !match) return false;
  dispatch(state.update({ changes: { from: line.from + match[1].length, to: line.to } }));
  return true;
};

export const listKeys = [
  { key: "Enter", run: insertNewlineContinueMarkup },
  { key: "Backspace", run: (t: Parameters<StateCommand>[0]) => removeBareMarker(t) || deleteMarkupBackward(t) },
  { key: "Tab", run: indentItem(indentMore) },
  { key: "Shift-Tab", run: indentItem(indentLess) },
];
