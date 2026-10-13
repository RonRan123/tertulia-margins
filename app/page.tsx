"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { commandTarget } from "@/core/blocks.ts";
import { findPageRefs, linkHighlight, linkPageRefs, pdfParagraphs, type PageLink } from "@/core/page-links.ts";
import { estimateTokens, isReferenceTooLong, REFERENCE_TOKEN_LIMIT } from "@/core/passage.ts";
import { exportMarkdown } from "@/core/export.ts";
import { LIMITS } from "@/core/limits.ts";
import type { ReactionKind } from "@/core/reactions.ts";
import {
  addBook,
  bookKey,
  deleteBook,
  LIBRARY_KEY,
  loadLibrary,
  loadState,
  loadRepliesToday,
  loadUi,
  localDay,
  renameBook,
  saveLibrary,
  saveState,
  saveUi,
  type AppState,
  type BookError,
  type Library,
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
import {
  BookIcon,
  ChatIcon,
  FileTextIcon,
  MarginIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoonIcon,
  PanelLeftIcon,
  SunIcon,
  UploadIcon,
} from "./components/icons";
import { OpenPageContext } from "./components/CitedText";
import { PdfPane, type PdfPaneHandle } from "./components/PdfPane";
import { ReactButton } from "./components/ReactButton";
import type { ReferenceTextHandle } from "./components/ReferenceText";
import { Sidebar } from "./components/Sidebar";

// Reading localStorage can itself throw (blocked storage); core/store catches that inside each call.
const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
const BOOK_ERRORS: Record<BookError, string> = {
  title_empty: "A book needs a title.",
  last_book: "The last book can't be deleted.",
};
const SAVE_DELAY_MS = 300;
const STATUS_MS = 5000;
// globals.css's phone breakpoint: one pane at a time, the sidebar over the page.
const isPhone = () => window.matchMedia("(max-width: 48rem)").matches;

// The view (D22, D26) is two choices: what sits beside the notes (margin, PDF or chat), and
// whether it shows alone. Margin "alone" means the notes alone.
type Side = "margin" | "pdf" | "chat";
const SIDES: { side: Side; label: string; icon: ReactNode }[] = [
  { side: "margin", label: "Margin", icon: <MarginIcon /> },
  { side: "pdf", label: "PDF", icon: <FileTextIcon /> },
  { side: "chat", label: "Chat", icon: <ChatIcon /> },
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
  const [library, setLibrary] = useState<Library>({ books: [], currentId: "" }); // D31: loaded after hydration
  const currentKey = useRef(""); // the open book's storage key, for the storage listener
  const pdfPane = useRef<PdfPaneHandle>(null);
  const [pdfText, setPdfText] = useState<string>(); // the open book's whole PDF text, for page links
  const stored = useRef<AppState>(undefined); // what storage holds, as far as this tab knows
  const pendingSave = useRef<() => void>(undefined); // set while a change waits to be saved
  const [ui, setUi] = useState<UiState>({ view: "notes+margin", isSidebarOpen: true, theme: "light" });
  const [hasUnread, setHasUnread] = useState(false); // a chat reply finished; shown only while chat is hidden
  const [status, setStatus] = useState(""); // the notes toolbar's last message
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notesView = useRef<NotesHandle>(null);
  const margin = useReactions({ reference, notes, setReactions });
  const referenceText = useRef<ReferenceTextHandle>(null);
  const hasReference = reference.trim() !== "";
  const isTooLong = isReferenceTooLong(reference);
  // Why the AI can't be asked right now (React, chat, thread replies), or undefined. D32: over the
  // cap, every call would send too much text.
  const [repliesToday, setRepliesToday] = useState(0); // D35: read from storage after loading
  const isOverDailyLimit = repliesToday >= LIMITS.dailyReplies;
  const aiBlock = !hasReference
    ? "Add reference text first."
    : isOverDailyLimit
      ? `You've used today's ${LIMITS.dailyReplies} AI replies; they reset at midnight.`
      : isTooLong
      ? `The reference text is ~${Math.round(estimateTokens(reference) / 1000)}K tokens, over the ${REFERENCE_TOKEN_LIMIT / 1000}K limit, so the AI is paused. Choose fewer PDF pages or trim it.`
      : undefined;
  const reactTitle = aiBlock;

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
    if (aiBlock) return showStatus(aiBlock); // Cmd/Ctrl+Enter skips the disabled button
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
    // Another tab's library change updates the list; this tab keeps its open book while it exists.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIBRARY_KEY) {
        const latest = loadLibrary(browserStorage);
        return setLibrary((mine) => (latest.books.some((b) => b.id === mine.currentId) ? { ...latest, currentId: mine.currentId } : latest));
      }
      if (e.key !== currentKey.current) return;
      if (pendingSave.current) return setIsChangedElsewhere(true);
      show(loadState(browserStorage, currentKey.current));
    };
    // A closed or reloaded tab saves only what it changed and hasn't saved yet: never its stale copy.
    const onPageHide = () => pendingSave.current?.();
    // The daily count may have changed in another tab, or the day may have turned (D35).
    const onFocus = () => setRepliesToday(loadRepliesToday(browserStorage, localDay(new Date())));
    // A one-time sync from storage after mount: the cascading render this rule warns about is the point.
    /* eslint-disable react-hooks/set-state-in-effect */
    const opened = loadLibrary(browserStorage);
    currentKey.current = bookKey(opened.currentId);
    setLibrary(opened);
    show(loadState(browserStorage, currentKey.current));
    const savedUi = loadUi(browserStorage);
    setUi({ ...savedUi, isSidebarOpen: savedUi.isSidebarOpen && !isPhone() }); // on a phone it would cover the page
    onFocus();
    setIsLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onFocus);
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
    const key = currentKey.current; // the book these edits belong to, even if another opens before saving
    const save = () => {
      pendingSave.current = undefined;
      stored.current = state;
      setSaveError(saveState(browserStorage, key, state));
    };
    pendingSave.current = save;
    const timer = setTimeout(save, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoaded, reference, notes, messages, reactions]);

  useEffect(() => {
    if (isLoaded) saveUi(browserStorage, ui);
  }, [isLoaded, ui]);

  // ---- Daily AI replies (D35) ----
  // lib/converse-client counts each reply as it starts; a streaming change is the cue to re-read it.
  const isStreaming = messages.at(-1)?.isStreaming === true || reactions.some((r) => r.messages.at(-1)?.isStreaming === true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-reading storage is the point
    if (isLoaded) setRepliesToday(loadRepliesToday(browserStorage, localDay(new Date())));
  }, [isLoaded, isStreaming, messages.length, reactions.length]);

  // ---- Books (D31) ----
  // Switching is blocked while a reply streams (isStreaming, above): it would land in the newly opened book.
  const currentBook = library.books.find((b) => b.id === library.currentId);

  // Saves the open book's last edits, then shows `next`'s book.
  function openLibrary(next: Library) {
    pendingSave.current?.();
    setLibrary(next);
    setSaveError(saveLibrary(browserStorage, next));
    if (bookKey(next.currentId) === currentKey.current) return;
    currentKey.current = bookKey(next.currentId);
    stored.current = loadState(browserStorage, currentKey.current);
    setReference(stored.current.reference);
    setNotes(stored.current.notes);
    setMessages(stored.current.messages);
    setReactions(stored.current.reactions);
    setIsChangedElsewhere(false);
    clearStatus();
  }
  // Each returns an error message, or undefined when done.
  const books = {
    open: (id: string) => openLibrary({ ...library, currentId: id }),
    create: (title: string) => {
      const next = addBook(library, crypto.randomUUID(), title);
      if (typeof next === "string") return BOOK_ERRORS[next];
      openLibrary(next);
    },
    rename: (id: string, title: string) => {
      const next = renameBook(library, id, title);
      if (typeof next === "string") return BOOK_ERRORS[next];
      setLibrary(next);
      setSaveError(saveLibrary(browserStorage, next));
    },
    remove: (id: string) => {
      const next = deleteBook(library, id);
      if (typeof next === "string") return BOOK_ERRORS[next];
      openLibrary(next);
      pdfPane.current?.forget(id);
      try {
        browserStorage.removeItem(bookKey(id));
      } catch {
        // Unremovable: the book is gone from the library either way.
      }
    },
  };

  // ---- The PDF (D29) ----
  // Shows the PDF beside the notes, or alone if the reader is viewing something alone.
  const showPdf = () => showView(isAlone(ui.view) ? "pdf" : "notes+pdf");
  const addPdf = () => {
    showPdf();
    pdfPane.current?.pick();
  };
  const choosePages = () => {
    showPdf();
    pdfPane.current?.choosePages();
  };
  // A cite's page: the page as given (D23); R4 matches the cited text instead. If the PDF view is
  // hidden, the viewer holds the page until it is shown and fitted (PdfViewer).
  const openPage = (page: number) => {
    showPdf();
    pdfPane.current?.goTo(page);
  };

  // ---- Page links (R4, D33) ----
  // A layer over the notes, recomputed as they change (deferred, so typing stays smooth); never
  // written into them. Free methods only: exact quote, word overlap, page.
  const linkedNotes = useDeferredValue(notes);
  const pdfParas = useMemo(() => (pdfText ? pdfParagraphs(pdfText) : []), [pdfText]);
  const pageLinks = useMemo(
    () => ({ notes: linkedNotes, links: pdfParas.length > 0 ? linkPageRefs(findPageRefs(linkedNotes), pdfParas) : [] }),
    [linkedNotes, pdfParas],
  );
  const openLink = (link: PageLink) => {
    showPdf();
    pdfPane.current?.goTo(link.pdfPage, linkHighlight(link));
  };

  // The palette (D28) is set on <html>, so the page background and dialogs follow it too.
  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
  }, [ui.theme]);

  const isNotesEmpty = notes.trim() === "";
  const isUnreadShown = hasUnread && !showsChat(ui.view);
  const showExcerpt = (start: number, end: number) => notesView.current?.select(start, end);

  return (
    <OpenPageContext value={openPage}>
      <main data-view={ui.view} data-sidebar-open={ui.isSidebarOpen || undefined}>
        <header className="app-header">
          <span className="brand">tertulia</span>
          <button
            type="button"
            className="quiet icon"
            aria-expanded={ui.isSidebarOpen}
            aria-controls="sidebar"
            aria-label="Books sidebar"
            title={ui.isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            onClick={() => setSidebarOpen(!ui.isSidebarOpen)}
          >
            <PanelLeftIcon />
          </button>
          <button type="button" className="quiet pill" title="Upload the book's PDF" onClick={addPdf}>
            <UploadIcon />
            <span className="pill-label">Upload</span>
          </button>
          <span className="book-name">
            <BookIcon />
            {currentBook?.title}
          </span>
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
            {SIDES.map(({ side, label, icon }) => {
              const hasDot = side === "chat" && isUnreadShown;
              return (
                <button
                  key={side}
                  type="button"
                  className="quiet pill"
                  aria-pressed={sideOf(ui.view) === side}
                  aria-label={hasDot ? `${label}, new reply` : label}
                  onClick={() => showView(viewOf(side, isAlone(ui.view)))}
                >
                  {icon}
                  <span className="pill-label">{label}</span>
                  {hasDot && <span className="unread" aria-hidden="true" />}
                </button>
              );
            })}
            <button
              type="button"
              className="quiet icon pill"
              aria-pressed={isAlone(ui.view)}
              title={isAlone(ui.view) ? "Show beside the notes" : sideOf(ui.view) === "margin" ? "Notes alone" : "Show alone"}
              aria-label="Show alone"
              onClick={() => showView(viewOf(sideOf(ui.view), !isAlone(ui.view)))}
            >
              {isAlone(ui.view) ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
          </div>
          <button
            type="button"
            className="quiet icon"
            aria-label={ui.theme === "dark" ? "Light theme" : "Dark theme"}
            title={ui.theme === "dark" ? "Light theme" : "Dark theme"}
            onClick={() => setUi((u) => ({ ...u, theme: u.theme === "dark" ? "light" : "dark" }))}
          >
            {ui.theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          {/* mousedown is cancelled inside, so the selection in the notes stays put. */}
          <div className="react-slot">
            <ReactButton title={reactTitle} onReact={react} />
          </div>
        </header>
        {/* Below the full-width bar (D30, like ChatPDF): toggling the sidebar never moves the bar. */}
        <div className="app-body">
          <Sidebar
            id="sidebar"
            books={library.books}
            currentId={library.currentId}
            isBusy={isStreaming}
            actions={books}
            reference={reference}
            onReferenceChange={setReference}
            referenceRef={referenceText}
            canExport={!isNotesEmpty}
            onAddPdf={addPdf}
        onChoosePages={choosePages}
            onExport={() => {
              const file = exportMarkdown(notes, reference, new Date());
              download(file.filename, file.content);
            }}
          />
          {/* Phone only (CSS): the open sidebar covers the page; tapping beside it closes it. */}
          <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
          <div className="main-col">
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
                {isTooLong && (
                  <p className="empty-reference warning">
                    {aiBlock}{" "}
                    <button type="button" className="link" onClick={choosePages}>
                      Choose PDF pages
                    </button>
                  </p>
                )}
                <Notes
                  ref={notesView}
                  notes={notes}
                  reactions={reactions}
                  onChange={editNotes}
                  onReactShortcut={() => react()}
                  pageLinks={pageLinks}
                  onOpenLink={openLink}
                  renderMargin={(row, isCurrent) => (
                    <MarginCell
                      items={row.reactions}
                      isCurrent={isCurrent}
                      margin={margin}
                      blockReason={aiBlock}
                      onShowExcerpt={showExcerpt}
                    />
                  )}
                  renderDetached={(detached) => (
                    <MarginCell
                      items={detached.map((reaction) => ({ reaction }))}
                      isDetached
                      margin={margin}
                      blockReason={aiBlock}
                      onShowExcerpt={showExcerpt}
                    />
                  )}
                />
              </div>
              <section className="side-pane" aria-label="Beside the notes">
                <div className="pdf-pane">
                  <PdfPane
                    ref={pdfPane}
                    bookId={library.currentId}
                    hasReference={hasReference}
                    onReference={setReference}
                    onAdded={showPdf}
                    onStatus={showStatus}
                    onText={setPdfText}
                  />
                </div>
                <div className="chat-pane">
                  <Chat
                    blockReason={aiBlock}
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
        </div>
      </main>
    </OpenPageContext>
  );
}
