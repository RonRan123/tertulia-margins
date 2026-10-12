"use client";

import { useEffect, useRef, useState } from "react";
import { commandTarget } from "@/core/blocks.ts";
import { exportMarkdown } from "@/core/export.ts";
import type { ReactionKind } from "@/core/reactions.ts";
import {
  loadState,
  loadUi,
  saveState,
  saveUi,
  STORAGE_KEY,
  type AppState,
  type ChatMessage,
  type KeyValueStorage,
  type Reaction,
  type StoreError,
  type UiState,
  type View,
} from "@/core/store.ts";
import { Chat } from "./components/Chat";
import { MarginCell, useReactions } from "./components/Margin";
import { Notes, type NotesHandle } from "./components/Notes";
import { ReactButton } from "./components/ReactButton";
import type { ReferenceTextHandle } from "./components/ReferenceText";
import { Sidebar } from "./components/Sidebar";

// Reading localStorage can itself throw (blocked storage); core/store catches that inside each call.
const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
const SAVE_DELAY_MS = 300;
const STATUS_MS = 5000;
// globals.css's phone breakpoint: one pane at a time, the sidebar over the page.
const isPhone = () => window.matchMedia("(max-width: 48rem)").matches;

// The view (D22, D26) is two choices: what sits beside the notes (margin, PDF or chat), and
// whether it shows alone. Margin "alone" means the notes alone.
type Side = "margin" | "pdf" | "chat";
const SIDES: { side: Side; label: string }[] = [
  { side: "margin", label: "Margin" },
  { side: "pdf", label: "PDF" },
  { side: "chat", label: "Chat" },
];
const sideOf = (view: View): Side => (view.endsWith("pdf") ? "pdf" : view.endsWith("chat") ? "chat" : "margin");
const isAlone = (view: View) => !view.startsWith("notes+");
const viewOf = (side: Side, alone: boolean): View => (alone ? (side === "margin" ? "notes" : side) : `notes+${side}`);
const showsChat = (view: View) => view === "notes+chat" || view === "chat";

// Hands a file to the browser's downloads: DOM code, so it lives here, not in core.
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url)); // after the click's download has started (Safari)
}

// Sidebar | notes | margin, PDF or chat (D22). Every pane stays mounted and the view only hides
// some, so switching never drops a streaming reply, a thread or an open block.
export default function Home() {
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<StoreError>();
  const [isChangedElsewhere, setIsChangedElsewhere] = useState(false);
  const stored = useRef<AppState>(undefined); // what storage holds, as far as this tab knows
  const pendingSave = useRef<() => void>(undefined); // set while a change waits to be saved
  const [ui, setUi] = useState<UiState>({ view: "notes+margin", isSidebarOpen: true });
  const [hasUnread, setHasUnread] = useState(false); // a chat reply finished; shown only while chat is hidden
  const [status, setStatus] = useState(""); // the notes toolbar's last message
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notesView = useRef<NotesHandle>(null);
  const margin = useReactions({ reference, notes, setReactions });
  const referenceText = useRef<ReferenceTextHandle>(null);
  const hasReference = reference.trim() !== "";
  const reactTitle = !hasReference ? "Add reference text first" : undefined;

  // A status message clears itself after a few seconds, or on the next notes edit.
  const showStatus = (message: string) => {
    clearTimeout(statusTimer.current);
    setStatus(message);
    statusTimer.current = setTimeout(() => setStatus(""), STATUS_MS);
  };
  const clearStatus = () => {
    clearTimeout(statusTimer.current);
    setStatus("");
  };
  const editNotes = (value: string) => {
    clearStatus();
    setNotes(value);
  };

  // A reply counts as read once chat has been on screen: entering or leaving a chat view clears it.
  const showView = (view: View) => {
    if (showsChat(view) || showsChat(ui.view)) setHasUnread(false);
    setUi((u) => ({ ...u, view }));
  };
  const setSidebarOpen = (isSidebarOpen: boolean) => setUi((u) => ({ ...u, isSidebarOpen }));
  // The dialog lives in the sidebar, so a closed sidebar opens first (it renders nothing while hidden).
  const openReference = () => {
    setSidebarOpen(true);
    requestAnimationFrame(() => referenceText.current?.open());
  };
  // React (D18, D20) acts on the selection in the block being edited, or on the whole block last
  // edited or focused. `kind` absent: the router picks.
  function react(kind?: ReactionKind) {
    clearStatus();
    if (!hasReference) return showStatus("Add reference text first."); // Cmd/Ctrl+Enter skips the disabled button
    const target = notesView.current?.target();
    const excerpt = target && commandTarget(notes, target.start, target.end);
    if (!target || !excerpt) return showStatus("Click a note, or select some text in one, then React.");
    // Select exactly what is sent, so the reader sees it.
    if (target.isEditing) {
      const { start, end } = target;
      const from = end > start ? notes.indexOf(excerpt, start) : notes.lastIndexOf(excerpt, start);
      const isAroundCaret = from !== -1 && from + excerpt.length >= start;
      if (isAroundCaret) notesView.current?.select(from, from + excerpt.length);
    }
    margin.react(excerpt, kind);
  }

  // The page is prerendered empty, so saved state is loaded after hydration, not during render.
  // Another tab writing our key reloads its state here, unless this tab has unsaved changes:
  // then this tab's next save wins, and a notice says so.
  useEffect(() => {
    const show = (state: AppState) => {
      stored.current = state;
      setReference(state.reference);
      setNotes(state.notes);
      setMessages(state.messages);
      setReactions(state.reactions);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (pendingSave.current) return setIsChangedElsewhere(true);
      show(loadState(browserStorage));
    };
    // A closed or reloaded tab saves only what it changed and hasn't saved yet: never its stale copy.
    const onPageHide = () => pendingSave.current?.();
    // A one-time sync from storage after mount: the cascading render this rule warns about is the point.
    /* eslint-disable react-hooks/set-state-in-effect */
    show(loadState(browserStorage));
    const savedUi = loadUi(browserStorage);
    setUi({ ...savedUi, isSidebarOpen: savedUi.isSidebarOpen && !isPhone() }); // on a phone it would cover the page
    setIsLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // Save shortly after each change. Never before loading (that would overwrite the saved state
  // with the empty first render), and not when the state is what storage already holds.
  useEffect(() => {
    if (!isLoaded) return;
    const last = stored.current;
    const isUnchanged =
      last?.reference === reference && last.notes === notes && last.messages === messages && last.reactions === reactions;
    if (isUnchanged) {
      pendingSave.current = undefined;
      return;
    }
    const state = { reference, notes, messages, reactions };
    const save = () => {
      pendingSave.current = undefined;
      stored.current = state;
      setSaveError(saveState(browserStorage, state));
    };
    pendingSave.current = save;
    const timer = setTimeout(save, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoaded, reference, notes, messages, reactions]);

  useEffect(() => {
    if (isLoaded) saveUi(browserStorage, ui);
  }, [isLoaded, ui]);

  const isNotesEmpty = notes.trim() === "";
  const isUnreadShown = hasUnread && !showsChat(ui.view);
  const showExcerpt = (start: number, end: number) => notesView.current?.select(start, end);

  return (
    <main data-view={ui.view} data-sidebar-open={ui.isSidebarOpen || undefined}>
      <Sidebar
        id="sidebar"
        reference={reference}
        onReferenceChange={setReference}
        referenceRef={referenceText}
        canExport={!isNotesEmpty}
        onExport={() => {
          const file = exportMarkdown(notes, reference, new Date());
          download(file.filename, file.content);
        }}
        onClose={() => setSidebarOpen(false)}
      />
      {/* Phone only (CSS): the open sidebar covers the page; tapping beside it closes it. */}
      <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
      <div className="main-col">
        <header className="app-header">
          <button
            type="button"
            className="quiet icon"
            aria-expanded={ui.isSidebarOpen}
            aria-controls="sidebar"
            aria-label="Books sidebar"
            title={ui.isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            onClick={() => setSidebarOpen(!ui.isSidebarOpen)}
          >
            ☰
          </button>
          <span className="book-name">Current book</span>
          <span className="notes-status" aria-live="polite">
            {saveError ? "Not saved: browser storage is full or blocked." : status}
          </span>
          <span className="sr-only" aria-live="polite">
            {margin.announcement}
          </span>
          {isChangedElsewhere && (
            <span className="warning">Changed in another tab: this tab&apos;s edits overwrite it. Reload to see the other version.</span>
          )}
          <div className="view-switcher" role="group" aria-label="Beside the notes">
            {SIDES.map(({ side, label }) => {
              const hasDot = side === "chat" && isUnreadShown;
              return (
                <button
                  key={side}
                  type="button"
                  className="quiet"
                  aria-pressed={sideOf(ui.view) === side}
                  aria-label={hasDot ? `${label}, new reply` : label}
                  onClick={() => showView(viewOf(side, isAlone(ui.view)))}
                >
                  {label}
                  {hasDot && <span className="unread" aria-hidden="true" />}
                </button>
              );
            })}
            <button
              type="button"
              className="quiet icon"
              aria-pressed={isAlone(ui.view)}
              title={isAlone(ui.view) ? "Show beside the notes" : sideOf(ui.view) === "margin" ? "Notes alone" : "Show alone"}
              aria-label="Show alone"
              onClick={() => showView(viewOf(sideOf(ui.view), !isAlone(ui.view)))}
            >
              ⤢
            </button>
          </div>
          {/* mousedown is cancelled inside, so the selection in the notes stays put. */}
          <div className="react-slot">
            <ReactButton title={reactTitle} onReact={react} />
          </div>
        </header>
        {/* The view decides (CSS, from main's data-view) which of the panes and the side pane show. */}
        <div className="workspace">
          <div className="panes">
            {!hasReference && (
              <p className="empty-reference">
                Add the chapter you&apos;re reading so the AI can check what it says.{" "}
                <button type="button" className="link" onClick={openReference}>
                  Add reference text
                </button>
              </p>
            )}
            <Notes
              ref={notesView}
              notes={notes}
              reactions={reactions}
              onChange={editNotes}
              onReactShortcut={() => react()}
              renderMargin={(row, isCurrent) => (
                <MarginCell
                  items={row.reactions}
                  isCurrent={isCurrent}
                  margin={margin}
                  hasReference={hasReference}
                  onShowExcerpt={showExcerpt}
                />
              )}
              renderDetached={(detached) => (
                <MarginCell
                  items={detached.map((reaction) => ({ reaction }))}
                  isDetached
                  margin={margin}
                  hasReference={hasReference}
                  onShowExcerpt={showExcerpt}
                />
              )}
            />
          </div>
          <section className="side-pane" aria-label="Beside the notes">
            <div className="pdf-pane">
              <p className="empty">The book&apos;s PDF will show here, opening at the page a note cites.</p>
            </div>
            <div className="chat-pane">
              <Chat
                reference={reference}
                notes={notes}
                messages={messages}
                setMessages={setMessages}
                onReplyEnd={() => setHasUnread(true)}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
