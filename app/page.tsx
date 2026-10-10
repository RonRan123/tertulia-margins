"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { blockAt, commandTarget, splitBlocks } from "@/core/blocks.ts";
import { defineQuote, insertAfterLine, isDefinable, trimPhrase } from "@/core/commands.ts";
import { exportMarkdown } from "@/core/export.ts";
import type { ReactionKind } from "@/core/reactions.ts";
import {
  loadState,
  saveState,
  STORAGE_KEY,
  type AppState,
  type ChatMessage,
  type KeyValueStorage,
  type Reaction,
  type StoreError,
} from "@/core/store.ts";
import { Chat, type ChatHandle } from "./components/Chat";
import { MarginCell, useReactions } from "./components/Margin";
import { Notes, type NotesHandle } from "./components/Notes";
import { ReactButton } from "./components/ReactButton";
import { ReferenceText, type ReferenceTextHandle } from "./components/ReferenceText";

// Reading localStorage can itself throw (blocked storage); core/store catches that inside each call.
const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
const SAVE_DELAY_MS = 300;
const STATUS_MS = 5000;
// Wide enough for notes, margin and drawer side by side (globals.css: 38 + 20 + 26rem).
const isSideBySide = () => window.matchMedia("(min-width: 84rem)").matches;

// Hands a file to the browser's downloads: DOM code, so it lives here, not in core.
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url)); // after the click's download has started (Safari)
}

// Notes | margin (D18); chat lives in a drawer; the reference text behind a header button (D14).
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
  const [isBusy, setIsBusy] = useState(false); // a chat reply is streaming (reactions stream on their own)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false); // a chat reply finished; shown only while the drawer is closed
  const [status, setStatus] = useState(""); // the notes toolbar's last message
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notesView = useRef<NotesHandle>(null);
  const chat = useRef<ChatHandle>(null);
  const margin = useReactions({ reference, notes, setReactions });
  const referenceText = useRef<ReferenceTextHandle>(null);
  const chatToggle = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const hasReference = reference.trim() !== "";
  const reactTitle = !hasReference ? "Add reference text first" : undefined;
  const commandTitle = reactTitle ?? (isBusy ? "Waiting for the current reply" : undefined);

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

  const toggleChat = (isOpen: boolean) => {
    // Opening focuses the question box once the drawer is no longer inert. Closing moves focus to
    // the toggle only if it was in the drawer (about to go inert); otherwise it stays where it is.
    if (!isOpen && drawer.current?.contains(document.activeElement)) chatToggle.current?.focus();
    setIsChatOpen(isOpen);
    setHasUnread(false);
    if (isOpen) requestAnimationFrame(() => chat.current?.focus());
  };
  // Define and Quiz reply in the drawer: open it only where it sits beside the notes and margin,
  // focus staying in the notes. Narrower, it would cover the margin or the notes, so the unread
  // dot is the signal there.
  const runInChat = (command: Parameters<ChatHandle["run"]>[0]) => {
    chat.current?.run(command);
    if (isSideBySide()) setIsChatOpen(true);
  };

  // Esc closes the drawer from anywhere on the page, unless something nearer used it first:
  // the React kind menu, a confirm or reply box (they call preventDefault), or the reference dialog.
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    const isForSomethingElse = e.key !== "Escape" || e.defaultPrevented || (e.target as Element).closest?.("dialog");
    if (isForSomethingElse) return;
    toggleChat(false);
  });
  useEffect(() => {
    if (!isChatOpen) return;
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isChatOpen]);

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

  // Commands act on the same target as React, read at click time (D17). Define first pastes the
  // passage sentence under the selection (app code, not the AI: D6), then asks chat to define.
  function runCommand(name: "define" | "quiz") {
    clearStatus(); // a previous command's message would describe the wrong run
    if (notes.trim() === "") return showStatus("Write a note first.");
    const target = notesView.current?.target();
    // Quiz with nothing targeted covers all the notes (D17).
    if (name === "quiz") return runInChat({ name, selection: (target && commandTarget(notes, target.start, target.end)) ?? "" });

    // A caret alone stands for its whole block.
    const isCaret = target !== undefined && target.start === target.end;
    const range = isCaret ? blockAt(splitBlocks(notes), target.start) : target;
    const selection = range ? trimPhrase(notes.slice(range.start, range.end)) : ""; // "**Netherfield**" → "Netherfield"
    if (!range || selection === "") return showStatus("Select a word or phrase in a note, then Define.");
    if (!isDefinable(selection)) return showStatus("Define works on a word or short phrase: one line, up to 4 words.");
    const quote = defineQuote(reference, notes, range.start, range.end);
    if (quote) {
      const inserted = insertAfterLine(notes, range.end, quote);
      notesView.current?.edit(inserted.notes, inserted.caret); // the block stays open, caret after the quote
      showStatus(`Quote from ${quote.slice(quote.lastIndexOf("[") + 1, -1)} added below your note.`);
    } else {
      showStatus(`“${selection}” isn't in the reference text, so no quote was added.`);
    }
    runInChat({ name, selection });
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

  const isNotesEmpty = notes.trim() === "";
  const isUnreadShown = hasUnread && !isChatOpen;
  const showExcerpt = (start: number, end: number) => notesView.current?.select(start, end);

  return (
    <main>
      <header className="app-header">
        <h1>tertulia-margins</h1>
        <ReferenceText ref={referenceText} value={reference} onChange={setReference} />
        {saveError && <span className="warning">Not saved: browser storage is full or blocked.</span>}
        {isChangedElsewhere && (
          <span className="warning">Changed in another tab: this tab&apos;s edits overwrite it. Reload to see the other version.</span>
        )}
        <button
          ref={chatToggle}
          type="button"
          className="chat-toggle"
          aria-expanded={isChatOpen}
          aria-controls="chat-drawer"
          aria-label={isUnreadShown ? "Chat, new reply" : undefined}
          onClick={() => toggleChat(!isChatOpen)}
        >
          Chat
          {isUnreadShown && <span className="unread" aria-hidden="true" />}
        </button>
      </header>
      {/* Below the header, so the drawer never covers the Chat toggle. */}
      <div className="workspace" data-chat-open={isChatOpen || undefined}>
        {/* One scroll: each row is a block and the reactions beside it, so card tops line up
            with block tops (D18). */}
        <div className="panes">
          <div className="row toolbar-row">
            <div className="notes-cell">
              {/* Every control here acts on the notes. mousedown is cancelled so focus and the
                  highlighted selection stay in the block being edited. */}
              <div className="toolbar">
                <ReactButton title={reactTitle} onReact={react} />
                {(["define", "quiz"] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={commandTitle !== undefined}
                    title={commandTitle}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => runCommand(name)}
                  >
                    {name === "define" ? "Define" : "Quiz"}
                  </button>
                ))}
                <span className="divider" aria-hidden="true" />
                <button
                  type="button"
                  disabled={isNotesEmpty}
                  title={isNotesEmpty ? "Nothing to export yet" : undefined}
                  onClick={() => {
                    const file = exportMarkdown(notes, reference, new Date());
                    download(file.filename, file.content);
                  }}
                >
                  Export .md
                </button>
                <span className="notes-status" aria-live="polite">
                  {status}
                </span>
                <span className="sr-only" aria-live="polite">
                  {margin.announcement}
                </span>
              </div>
              {!hasReference && (
                <p className="empty-reference">
                  Add the chapter you&apos;re reading so the AI can check what it says.{" "}
                  <button type="button" className="link" onClick={() => referenceText.current?.open()}>
                    Add reference text
                  </button>
                </p>
              )}
            </div>
            <div className="margin-cell">
              {reactions.length === 0 && <p className="empty">Reactions to your notes appear here, beside the note they answer.</p>}
            </div>
          </div>
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
        {/* Not modal: the notes stay usable underneath. Inert while closed, so it is out of the tab order. */}
        <aside
          ref={drawer}
          id="chat-drawer"
          className="drawer"
          aria-label="Chat"
          data-open={isChatOpen || undefined}
          inert={!isChatOpen}
        >
          <button type="button" className="drawer-close" onClick={() => toggleChat(false)}>
            Close
          </button>
          <Chat
            ref={chat}
            reference={reference}
            notes={notes}
            messages={messages}
            setMessages={setMessages}
            isBusy={isBusy}
            setIsBusy={setIsBusy}
            onReplyEnd={() => setHasUnread(true)}
          />
        </aside>
      </div>
    </main>
  );
}
