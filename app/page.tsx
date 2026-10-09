"use client";

import { useEffect, useRef, useState } from "react";
import { defineQuote, insertAfterLine, isDefinable, trimPhrase } from "@/core/commands.ts";
import { loadState, saveState, STORAGE_KEY, type AppState, type ChatMessage, type KeyValueStorage, type StoreError } from "@/core/store.ts";
import { Chat, type ChatHandle } from "./components/Chat";
import { ReferenceText } from "./components/ReferenceText";

// Reading localStorage can itself throw (blocked storage); core/store catches that inside each call.
const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
const SAVE_DELAY_MS = 300;
const STATUS_MS = 5000;

// Two panes, notes | chat (D14); the reference text lives behind a header button.
export default function Home() {
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<StoreError>();
  const [isChangedElsewhere, setIsChangedElsewhere] = useState(false);
  const stored = useRef<AppState>(undefined); // what storage holds, as far as this tab knows
  const pendingSave = useRef<() => void>(undefined); // set while a change waits to be saved
  const [isBusy, setIsBusy] = useState(false); // a reply is streaming
  const [status, setStatus] = useState(""); // the notes toolbar's last message
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notesBox = useRef<HTMLTextAreaElement>(null);
  const chat = useRef<ChatHandle>(null);
  const hasReference = reference.trim() !== "";
  const commandTitle = !hasReference ? "Add reference text first" : isBusy ? "Waiting for the current reply" : undefined;

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

  // Commands act on the notes selection, read at click time (D17). Define first pastes the
  // passage sentence under the selection (app code, not the AI: D6), then asks chat to define.
  function runCommand(name: "define" | "quiz") {
    const box = notesBox.current;
    if (!box) return;
    clearStatus(); // a previous command's message would describe the wrong run
    if (notes.trim() === "") return showStatus("Write a note first.");
    const { selectionStart: start, selectionEnd: end } = box;
    if (name === "quiz") return chat.current?.run({ name, selection: notes.slice(start, end).trim() });

    const selection = trimPhrase(notes.slice(start, end)); // "**Netherfield**" → "Netherfield"
    if (selection === "") return showStatus("Select a word or phrase in your notes, then Define.");
    if (!isDefinable(selection)) return showStatus("Define works on a word or short phrase: one line, up to 4 words.");
    const quote = defineQuote(reference, notes, start, end);
    if (quote) {
      const inserted = insertAfterLine(notes, end, quote);
      setNotes(inserted.notes);
      // The textarea is controlled: move the caret once React has rendered the new value.
      // Blur then focus scrolls the caret into view.
      requestAnimationFrame(() => {
        box.setSelectionRange(inserted.caret, inserted.caret);
        box.blur();
        box.focus();
      });
      showStatus(`Quote from ${quote.slice(quote.lastIndexOf("[") + 1, -1)} added below your note.`);
    } else {
      showStatus(`“${selection}” isn't in the reference text, so no quote was added.`);
    }
    chat.current?.run({ name, selection });
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
    const isUnchanged = last?.reference === reference && last.notes === notes && last.messages === messages;
    if (isUnchanged) {
      pendingSave.current = undefined;
      return;
    }
    const state = { reference, notes, messages };
    const save = () => {
      pendingSave.current = undefined;
      stored.current = state;
      setSaveError(saveState(browserStorage, state));
    };
    pendingSave.current = save;
    const timer = setTimeout(save, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoaded, reference, notes, messages]);

  return (
    <main>
      <header className="app-header">
        <h1>tertulia-margins</h1>
        <ReferenceText value={reference} onChange={setReference} />
        {saveError && <span className="warning">Not saved: browser storage is full or blocked.</span>}
        {isChangedElsewhere && (
          <span className="warning">Changed in another tab: this tab&apos;s edits overwrite it. Reload to see the other version.</span>
        )}
      </header>
      <div className="panes">
        <section className="notes">
          <div className="pane-header">
            <h2>
              <label htmlFor="notes-text">Notes</label>
            </h2>
            <span className="notes-status" aria-live="polite">
              {status}
            </span>
            {/* mousedown is cancelled so focus and the highlighted selection stay in the notes. */}
            <div className="notes-toolbar">
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
            </div>
          </div>
          {/* The user's own words and app-pasted passage quotes only (D6): the AI never writes here. */}
          <textarea
            ref={notesBox}
            id="notes-text"
            value={notes}
            onChange={(e) => editNotes(e.target.value)}
            placeholder="Your margin notes, in markdown. The AI reads them with every question but never edits them."
          />
        </section>
        <Chat
          ref={chat}
          reference={reference}
          notes={notes}
          messages={messages}
          setMessages={setMessages}
          isBusy={isBusy}
          setIsBusy={setIsBusy}
        />
      </div>
    </main>
  );
}
