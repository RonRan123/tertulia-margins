"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { findPageRefs, linkHighlight, linkPageRefs, pdfParagraphs, type PageLink, type PageRef } from "@/core/page-links.ts";
import { estimateTokens, isReferenceTooLong, REFERENCE_TOKEN_LIMIT } from "@/core/passage.ts";
import { exportMarkdown } from "@/core/export.ts";
import { LIMITS } from "@/core/limits.ts";
import {
  addBook,
  bookKey,
  defaultUi,
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
  STORAGE_KEY,
  type AppState,
  type BookError,
  type Library,
  type ChatMessage,
  type KeyValueStorage,
  type StoreError,
  type UiState,
  type View,
} from "@/core/store.ts";
import { DAEMONS, freshDaemonState, type DaemonCard, type DaemonState } from "@/core/daemons.ts";
import { freshQuiz, type QuizState } from "@/core/quiz.ts";
import { diffLines, quizEvents } from "@/core/trace.ts";
import { EXAMPLES, EXAMPLES_KEY, examplesFirst, FIRST_EXAMPLE_ID, withExamples } from "@/core/examples.ts";
import { installExamples } from "@/lib/examples.ts";
import { flush, setTraceBook, trace } from "@/lib/trace.ts";
import { Chat } from "./components/Chat";
import { DaemonPanel, MarginCell, useDaemons } from "./components/Margin";
import { Quiz } from "./components/Quiz";
import { Notes } from "./components/Notes";
import { PaneDivider } from "./components/PaneDivider";
import {
  BookIcon,
  ChatIcon,
  FileTextIcon,
  Logo,
  MarginIcon,
  QuizIcon,
  MaximizeIcon,
  MinimizeIcon,
  PanelLeftIcon,
  UploadIcon,
} from "./components/icons";
import { SettingsMenu } from "./components/Settings";
import { OpenPageContext } from "./components/CitedText";
import { PdfPane, type PdfPaneHandle } from "./components/PdfPane";
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
const NOTES_TRACE_MS = 4000; // a notes edit is traced once the reader pauses this long (D48)
const clip = (line: string) => (line.length > 500 ? line.slice(0, 500) + "…" : line);
const STATUS_MS = 5000;
// globals.css's phone breakpoint: one pane at a time, the sidebar over the page.
const isPhone = () => window.matchMedia("(max-width: 48rem)").matches;

// The view (D22, D26) is two choices: what sits beside the notes (margin, quiz, PDF or chat), and
// whether it shows alone. The notes go full screen from their own ⤢ ("notes"), not the bar's.
type Side = "margin" | "quiz" | "pdf" | "chat";
const SIDES: { side: Side; label: string; icon: ReactNode }[] = [
  { side: "margin", label: "Margin", icon: <MarginIcon /> },
  { side: "quiz", label: "Quiz", icon: <QuizIcon /> },
  { side: "pdf", label: "PDF", icon: <FileTextIcon /> },
  { side: "chat", label: "Chat", icon: <ChatIcon /> },
];
const sideOf = (view: View): Side => (view.endsWith("pdf") ? "pdf" : view.endsWith("chat") ? "chat" : view.endsWith("quiz") ? "quiz" : "margin");
const isAlone = (view: View) => !view.startsWith("notes+");
const viewOf = (side: Side, alone: boolean): View => (alone ? (side === "margin" ? "notes" : side) : `notes+${side}`);
const showsChat = (view: View) => view === "notes+chat" || view === "chat";
const isNotesAlone = (view: View) => view === "notes";
const isSheet = (view: View) => sideOf(view) !== "margin"; // Quiz, PDF or Chat: a sheet on a phone

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
  const [daemons, setDaemons] = useState<DaemonState>(() => freshDaemonState(""));
  const [quiz, setQuiz] = useState<QuizState>(freshQuiz); // the current quiz (D42), saved with the book
  // Counts the reader's own edits in this tab: the daemons wait for a pause after one (D37). Notes
  // loaded from storage (another tab, another book) don't count, so two tabs never both run.
  const [edits, setEdits] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<StoreError>();
  const [isChangedElsewhere, setIsChangedElsewhere] = useState(false);
  const [library, setLibrary] = useState<Library>({ books: [], currentId: "" }); // D31: loaded after hydration
  const currentKey = useRef(""); // the open book's storage key, for the storage listener
  const pdfPane = useRef<PdfPaneHandle>(null);
  const [pdfText, setPdfText] = useState<string>(); // the open book's whole PDF text, for page links
  const stored = useRef<AppState>(undefined); // what storage holds, as far as this tab knows
  const pendingSave = useRef<() => void>(undefined); // set while a change waits to be saved
  const tracedNotes = useRef(""); // the notes as last traced or loaded (D48)
  const traceNotesNow = useRef(() => {}); // traces the notes' unsent edits; set by the effect below
  const isFirstVisit = useRef<boolean>(undefined); // nothing saved before this load: open an example book (D49)
  const isSeeding = useRef(false);
  const hasTracedSession = useRef(false);
  const [ui, setUi] = useState<UiState>(defaultUi);
  const [hasUnread, setHasUnread] = useState(false); // a chat reply finished; shown only while chat is hidden
  const [status, setStatus] = useState(""); // the notes toolbar's last message
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const referenceText = useRef<ReferenceTextHandle>(null);
  const hasReference = reference.trim() !== "";
  const isTooLong = isReferenceTooLong(reference);
  // Why chat can't be asked right now, or undefined. D32: over the cap, every call would send too
  // much text. The daemons pause for the same reasons, except the chat replies' daily cap (D37).
  const [repliesToday, setRepliesToday] = useState(0); // D35: read from storage after loading
  const isOverDailyLimit = repliesToday >= LIMITS.dailyReplies;
  const aiBlock = !hasReference
    ? "Add reference text first."
    : isOverDailyLimit
      ? `You've used today's ${LIMITS.dailyReplies} AI replies; they reset at midnight.`
      : isTooLong
      ? `The reference text is ~${Math.round(estimateTokens(reference) / 1000)}K tokens, over the ${REFERENCE_TOKEN_LIMIT / 1000}K limit, so the AI is paused. Choose fewer PDF pages or trim it.`
      : undefined;
  const margin = useDaemons({
    bookId: library.currentId,
    edits,
    reference,
    notes,
    daemons,
    setDaemons,
    pausedReason: !hasReference ? "add reference text first." : isTooLong ? "the reference text is over the limit." : undefined,
    isShown: ui.reactions,
    setShown: (reactions) => {
      trace({ kind: "settings", change: JSON.stringify({ reactions }) });
      if (!reactions) setActiveCard(undefined);
      setUi((u) => ({ ...u, reactions }));
    },
  });

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
    setEdits((n) => n + 1);
  };

  // A reply counts as read once chat has been on screen: entering or leaving a chat view clears it.
  // A card's words stay highlighted in the notes only while its margin is on screen.
  // On a phone the notes are home, and Quiz, PDF and Chat open as a sheet over them (CSS; their
  // alone views fill the screen). Entering a sheet from the notes is a history entry, so Back closes
  // it; leaving one goes back, and popstate below brings the notes. Swapping sheets adds none.
  const showView = (view: View) => {
    if (view !== ui.view) trace({ kind: "view", view });
    if (showsChat(view) || showsChat(ui.view)) setHasUnread(false);
    if (view !== "notes+margin") setActiveCard(undefined);
    const isEnteringSheet = isPhone() && !isSheet(ui.view) && isSheet(view);
    const isLeavingSheet = isPhone() && isSheet(ui.view) && !isSheet(view);
    if (isEnteringSheet) {
      homeView.current = ui.view;
      window.history.pushState({ sheet: true }, "");
    }
    if (isLeavingSheet && window.history.state?.sheet) {
      homeView.current = view;
      return window.history.back();
    }
    setUi((u) => ({ ...u, view }));
  };
  const homeView = useRef<View>("notes+margin"); // the notes view a phone's sheet closes to
  const closeSheet = () => showView(homeView.current);
  // Quiz, PDF or Chat alone or beside the notes (on a phone: a full-screen sheet or one that peeks).
  const toggleAlone = () => showView(viewOf(sideOf(ui.view), !isAlone(ui.view)));
  useEffect(() => {
    const onBack = () => {
      if (window.history.state?.sheet) return;
      setUi((u) => (isSheet(u.view) ? { ...u, view: homeView.current } : u));
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  // The side to bring back when the notes leave full screen (this tab only; after a reload, the margin).
  const lastSide = useRef<Side>("margin");
  const toggleNotesAlone = () => {
    if (isNotesAlone(ui.view)) return showView(viewOf(lastSide.current, false));
    lastSide.current = sideOf(ui.view);
    showView("notes");
  };
  const setSidebarOpen = (isSidebarOpen: boolean) => setUi((u) => ({ ...u, isSidebarOpen }));
  // The dialog lives in the sidebar, so a closed sidebar opens first (it renders nothing while hidden).
  const openReference = () => {
    setSidebarOpen(true);
    requestAnimationFrame(() => referenceText.current?.open());
  };
  // The page is prerendered empty, so saved state is loaded after hydration, not during render.
  // Another tab writing our key reloads its state here, unless this tab has unsaved changes:
  // then this tab's next save wins, and a notice says so.
  useEffect(() => {
    const show = (state: AppState) => {
      stored.current = state;
      tracedNotes.current = state.notes;
      setReference(state.reference);
      setNotes(state.notes);
      setMessages(state.messages);
      setDaemons(state.daemons);
      setQuiz(state.quiz);
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
    const onPageHide = () => {
      pendingSave.current?.();
      traceNotesNow.current();
      flush(true);
    };
    // The daily count may have changed in another tab, or the day may have turned (D35).
    const onFocus = () => setRepliesToday(loadRepliesToday(browserStorage, localDay(new Date())));
    // A one-time sync from storage after mount: the cascading render this rule warns about is the point.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      // Decided on the first run only: loading saves the library, and dev runs this effect twice.
      isFirstVisit.current ??= browserStorage.getItem(LIBRARY_KEY) === null && browserStorage.getItem(STORAGE_KEY) === null;
    } catch {
      // storage blocked: not a first visit we can do anything with
    }
    const loaded = loadLibrary(browserStorage);
    const opened = examplesFirst(loaded); // D49: the examples on top, in order, even if seeded before
    if (opened.books.some((b, i) => b !== loaded.books[i])) saveLibrary(browserStorage, opened);
    currentKey.current = bookKey(opened.currentId);
    setLibrary(opened);
    show(loadState(browserStorage, currentKey.current));
    const savedUi = loadUi(browserStorage);
    setUi({ ...savedUi, isSidebarOpen: savedUi.isSidebarOpen && !isPhone() }); // on a phone it would cover the page
    setTraceBook(opened.books.find((b) => b.id === opened.currentId)?.title);
    if (!hasTracedSession.current) trace({ kind: "session", view: savedUi.view, books: opened.books.map((b) => b.title) });
    hasTracedSession.current = true; // dev runs this effect twice
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
      last?.reference === reference && last.notes === notes && last.messages === messages && last.daemons === daemons && last.quiz === quiz;
    if (isUnchanged) {
      pendingSave.current = undefined;
      return;
    }
    const state = { reference, notes, messages, daemons, quiz };
    const key = currentKey.current; // the book these edits belong to, even if another opens before saving
    const save = () => {
      pendingSave.current = undefined;
      stored.current = state;
      setSaveError(saveState(browserStorage, key, state));
    };
    pendingSave.current = save;
    const timer = setTimeout(save, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoaded, reference, notes, messages, daemons, quiz]);

  useEffect(() => {
    if (isLoaded) saveUi(browserStorage, ui);
  }, [isLoaded, ui]);

  // ---- Traces (D48) ----
  // The open book's title goes on every event. A notes edit is traced as the lines it added and
  // removed, once the reader pauses (or before another book opens, or the tab closes).
  const openTitle = library.books.find((b) => b.id === library.currentId)?.title;
  useEffect(() => setTraceBook(openTitle), [openTitle]);
  useEffect(() => {
    traceNotesNow.current = () => {
      const { added, removed } = diffLines(tracedNotes.current, notes);
      tracedNotes.current = notes;
      if (added.length + removed.length === 0) return;
      trace({ kind: "notes", added: added.map(clip), removed: removed.map(clip), lines: notes.split("\n").filter((l) => l.trim() !== "").length });
    };
    if (edits === 0) return;
    const timer = setTimeout(() => traceNotesNow.current(), NOTES_TRACE_MS);
    return () => clearTimeout(timer);
  }, [notes, edits]);
  // Quiz answers and finishing, from the quiz state's changes within one book.
  const tracedQuiz = useRef<{ bookId: string; quiz: QuizState }>(undefined);
  useEffect(() => {
    const before = tracedQuiz.current;
    tracedQuiz.current = { bookId: library.currentId, quiz };
    if (before?.bookId === library.currentId) for (const event of quizEvents(before.quiz, quiz)) trace(event);
  }, [quiz, library.currentId]);

  // ---- Daily AI replies (D35) ----
  // lib/converse-client counts each reply as it starts; a streaming change is the cue to re-read it.
  const isStreaming = messages.at(-1)?.isStreaming === true;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-reading storage is the point
    if (isLoaded) setRepliesToday(loadRepliesToday(browserStorage, localDay(new Date())));
  }, [isLoaded, isStreaming, messages.length]);

  // ---- Books (D31) ----
  // Switching is blocked while a reply streams (isStreaming, above): it would land in the newly opened book.
  const currentBook = library.books.find((b) => b.id === library.currentId);

  // Saves the open book's last edits, then shows `next`'s book.
  // `reload`: show the open book's saved state even if it's the same book (examples restored).
  function openLibrary(next: Library, reload = false) {
    pendingSave.current?.();
    traceNotesNow.current();
    setLibrary(next);
    setSaveError(saveLibrary(browserStorage, next));
    if (bookKey(next.currentId) === currentKey.current && !reload) return;
    currentKey.current = bookKey(next.currentId);
    stored.current = loadState(browserStorage, currentKey.current);
    setReference(stored.current.reference);
    setNotes(stored.current.notes);
    tracedNotes.current = stored.current.notes;
    setMessages(stored.current.messages);
    setDaemons(stored.current.daemons);
    setQuiz(stored.current.quiz);
    setIsChangedElsewhere(false);
    clearStatus();
  }
  // Each returns an error message, or undefined when done.
  const books = {
    open: (id: string) => {
      trace({ kind: "book", action: "open", title: library.books.find((b) => b.id === id)?.title ?? id });
      openLibrary({ ...library, currentId: id });
    },
    create: (title: string) => {
      const next = addBook(library, crypto.randomUUID(), title);
      if (typeof next === "string") return BOOK_ERRORS[next];
      trace({ kind: "book", action: "create", title });
      openLibrary(next);
    },
    rename: (id: string, title: string) => {
      const next = renameBook(library, id, title);
      if (typeof next === "string") return BOOK_ERRORS[next];
      trace({ kind: "book", action: "rename", title });
      setLibrary(next);
      setSaveError(saveLibrary(browserStorage, next));
    },
    remove: (id: string) => {
      const next = deleteBook(library, id);
      if (typeof next === "string") return BOOK_ERRORS[next];
      trace({ kind: "book", action: "delete", title: library.books.find((b) => b.id === id)?.title ?? id });
      openLibrary(next);
      pdfPane.current?.forget(id);
      try {
        browserStorage.removeItem(bookKey(id));
      } catch {
        // Unremovable: the book is gone from the library either way.
      }
    },
  };

  // ---- Example books (D49) ----
  // Every browser gets the examples once (a first visit opens one), and can restore them as shipped.
  async function seedExamples(isRestore: boolean) {
    if (isSeeding.current) return;
    isSeeding.current = true;
    try {
      const installed = await installExamples(browserStorage);
      const latest = loadLibrary(browserStorage);
      const openId = isFirstVisit.current === true && !isRestore ? FIRST_EXAMPLE_ID : latest.currentId;
      const isOpenRestored = isRestore && EXAMPLES.some((e) => e.id === latest.currentId);
      openLibrary(withExamples(latest, installed, openId), isOpenRestored);
      browserStorage.setItem(EXAMPLES_KEY, "1");
      if (isRestore) showStatus("Example books restored.");
    } catch {
      if (isRestore) showStatus("Couldn't load the example books. Try again later.");
    } finally {
      isSeeding.current = false;
    }
  }
  const restoreExamples = () => {
    if (isStreaming) return showStatus("Wait for the current reply to finish, then restore the example books.");
    if (!window.confirm("Restore the example books as shipped? Your changes to them will be lost.")) return;
    trace({ kind: "book", action: "restore-examples", title: "examples" });
    void seedExamples(true);
  };
  useEffect(() => {
    if (!isLoaded) return;
    let hasExamples = true;
    try {
      hasExamples = browserStorage.getItem(EXAMPLES_KEY) !== null;
    } catch {
      // storage blocked: nowhere to put them
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: the library changes after the fetches
    if (!hasExamples) void seedExamples(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, after loading
  }, [isLoaded]);

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
    trace({ kind: "pdf", action: "opened-page", page });
    showPdf();
    pdfPane.current?.goTo(page);
  };

  // ---- Page links (R4, D33) ----
  // A layer over the notes, recomputed as they change (deferred, so typing stays smooth); never
  // written into them. Free methods only: exact quote, word overlap, page. With page links off in
  // settings (D47) the notes' references stay plain text; AI cites (citeOpener) stay clickable.
  const linkedNotes = useDeferredValue(notes);
  const pdfParas = useMemo(() => (pdfText ? pdfParagraphs(pdfText) : []), [pdfText]);
  const isLinking = ui.pageLinks && pdfParas.length > 0;
  const pageLinks = useMemo(
    () => ({ notes: linkedNotes, links: isLinking ? linkPageRefs(findPageRefs(linkedNotes), pdfParas) : [] }),
    [linkedNotes, pdfParas, isLinking],
  );
  const openLink = (link: PageLink) => {
    trace({ kind: "pdf", action: "opened-page", page: link.pdfPage });
    showPdf();
    pdfPane.current?.goTo(link.pdfPage, linkHighlight(link));
  };
  // The words a link selected in the PDF stay until the reader writes again.
  useEffect(() => {
    if (edits > 0) pdfPane.current?.clearHighlight();
  }, [edits]);
  // A page cite in AI text (D38, D45): linked like the notes' references, together with the other
  // cites of that text so their exact hits teach the page offset. Stable while the PDF is, so each
  // message links its cites once.
  const linkCites = useCallback((refs: PageRef[]) => linkPageRefs(refs, pdfParas), [pdfParas]);
  const citeOpener = { hasPdf: pdfParas.length > 0, linkCites, openLink, openPage };

  // The palette (D28) is set on <html>, so the page background and dialogs follow it too.
  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
  }, [ui.theme]);
  const bookTitle = currentBook?.title;
  useEffect(() => {
    document.title = bookTitle ? `Tertulia | ${bookTitle}` : "Tertulia";
  }, [bookTitle]);

  const isNotesEmpty = notes.trim() === "";
  const isUnreadShown = hasUnread && !showsChat(ui.view);
  // The card whose words are highlighted in the notes; a second click on it clears them.
  const [activeCard, setActiveCard] = useState<{ id: string; colour: string }>();
  const toggleCard = (card: DaemonCard) => {
    trace({ kind: "card", action: activeCard?.id === card.id ? "clear" : "highlight", daemon: card.daemon, text: card.text });
    setActiveCard((active) => (active?.id === card.id ? undefined : { id: card.id, colour: DAEMONS[card.daemon].colour }));
  };

  return (
    <OpenPageContext value={citeOpener}>
      <main
        data-view={ui.view}
        data-sidebar-open={ui.isSidebarOpen || undefined}
        data-pdf-dark={ui.pdfDark || undefined}        style={{ "--notes-share": `${ui.notesShare * 100}%` } as CSSProperties}
      >
        <header className="app-header">
          <span className="brand">
            <Logo />
            tertulia
          </span>
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
                  aria-pressed={!isNotesAlone(ui.view) && sideOf(ui.view) === side}
                  aria-label={hasDot ? `${label}, new reply` : label}
                  onClick={() => showView(viewOf(side, !isNotesAlone(ui.view) && isAlone(ui.view)))}
                >
                  {icon}
                  <span className="pill-label">{label}</span>
                  {hasDot && <span className="unread" aria-hidden="true" />}
                </button>
              );
            })}
            <button
              type="button"
              className="quiet icon pill show-alone"
              aria-pressed={isAlone(ui.view) && !isNotesAlone(ui.view)}
              disabled={sideOf(ui.view) === "margin"} // the margin has nothing to show alone; the notes have their own ⤢
              title={sideOf(ui.view) === "margin" ? "Pick Quiz, PDF or Chat to show it alone" : isAlone(ui.view) ? "Show beside the notes" : "Show alone"}
              aria-label="Show alone"
              onClick={toggleAlone}
            >
              {isAlone(ui.view) && !isNotesAlone(ui.view) ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
          </div>
          <SettingsMenu
            ui={ui}
            onChange={(patch) => {
              trace({ kind: "settings", change: JSON.stringify(patch) });
              setUi((u) => ({ ...u, ...patch }));
            }}
            onRestoreExamples={restoreExamples}
          />
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
                <button
                  type="button"
                  className="quiet icon notes-alone"
                  aria-pressed={isNotesAlone(ui.view)}
                  aria-label="Notes full screen"
                  title={isNotesAlone(ui.view) ? "Show beside the notes" : "Notes full screen"}
                  onClick={toggleNotesAlone}
                >
                  {isNotesAlone(ui.view) ? <MinimizeIcon /> : <MaximizeIcon />}
                </button>
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
                  notes={notes}
                  cards={ui.reactions ? daemons.cards.map((card) => ({ ...card, excerpt: card.anchor })) : []}
                  onChange={editNotes}
                  pageLinks={pageLinks}
                  onOpenLink={openLink}
                  marginHeader={<DaemonPanel margin={margin} />}
                  highlight={ui.reactions ? activeCard : undefined}
                  quoteSource={ui.autocomplete ? pdfText || reference : undefined}
                  renderMargin={(row) => <MarginCell row={row} margin={margin} activeId={activeCard?.id} onToggle={toggleCard} />}
                />
              </div>
              <PaneDivider share={ui.notesShare} onChange={(notesShare) => setUi((u) => ({ ...u, notesShare }))} />
              {/* Phone only (CSS): the dimmed notes behind a Quiz, PDF or Chat sheet; a tap closes it. */}
              <div className="sheet-backdrop" aria-hidden="true" onClick={closeSheet} />
              <section className="side-pane" aria-label="Beside the notes">
                <SheetHead isFull={isAlone(ui.view)} onClose={closeSheet} onToggleFull={toggleAlone} />
                <div className="quiz-pane">
                  <Quiz
                    bookId={library.currentId}
                    quiz={quiz}
                    setQuiz={setQuiz}
                    reference={reference}
                    notes={notes}
                    aiBlock={aiBlock}
                    onAsked={() => setRepliesToday(loadRepliesToday(browserStorage, localDay(new Date())))}
                  />
                </div>
                <div className="pdf-pane">
                  <PdfPane
                    ref={pdfPane}
                    bookId={library.currentId}
                    hasReference={hasReference}
                    onReference={setReference}
                    onAdded={() => {
                      trace({ kind: "pdf", action: "added" });
                      showPdf();
                    }}
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

const SWIPE_PX = 60; // how far the sheet's head is dragged before the sheet changes size or closes

type SheetHeadProps = { isFull: boolean; onClose: () => void; onToggleFull: () => void };

// A phone sheet's top (CSS): a grab handle, "← Notes" and, in the opposite corner, ⤢ (full screen)
// or ⤡ (back to the notes peeking above). A drag on the head moves the sheet with the finger; past
// SWIPE_PX, up expands it, down shrinks a full sheet or closes one that peeks, else it springs
// back. Only the head drags, so scrolling a quiz or chat, or zooming the PDF, never moves the sheet.
function SheetHead({ isFull, onClose, onToggleFull }: SheetHeadProps) {
  const drag = useRef<{ y: number; room: number }>(undefined); // where it started; how far up it may go
  const sheetOf = (el: HTMLElement) => el.closest<HTMLElement>(".side-pane");
  return (
    <div
      className="sheet-head"
      onTouchStart={(e) => {
        const sheet = sheetOf(e.currentTarget);
        const barBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
        drag.current = { y: e.touches[0].clientY, room: sheet ? sheet.getBoundingClientRect().top - barBottom : 0 };
      }}
      onTouchMove={(e) => {
        const sheet = sheetOf(e.currentTarget);
        if (!drag.current || !sheet) return;
        const dy = Math.max(-drag.current.room, e.touches[0].clientY - drag.current.y);
        sheet.style.transform = `translateY(${dy}px)`;
      }}
      onTouchEnd={(e) => {
        const sheet = sheetOf(e.currentTarget);
        const dragged = drag.current ? e.changedTouches[0].clientY - drag.current.y : 0;
        drag.current = undefined;
        if (sheet) sheet.style.transform = "";
        if (dragged < -SWIPE_PX && !isFull) onToggleFull();
        if (dragged > SWIPE_PX) return isFull ? onToggleFull() : onClose();
      }}
    >
      <span className="sheet-handle" aria-hidden="true" />
      <div className="sheet-bar">
        <button type="button" className="sheet-back" onClick={onClose}>
          ← Notes
        </button>
        <button type="button" className="quiet icon" aria-pressed={isFull} aria-label={isFull ? "Show the notes above" : "Full screen"} onClick={onToggleFull}>
          {isFull ? <MinimizeIcon /> : <MaximizeIcon />}
        </button>
      </div>
    </div>
  );
}
