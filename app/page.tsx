"use client";

import { useEffect, useRef, useState } from "react";
import { loadState, saveState, STORAGE_KEY, type AppState, type ChatMessage, type KeyValueStorage, type StoreError } from "@/core/store.ts";
import { Chat } from "./components/Chat";
import { ReferenceText } from "./components/ReferenceText";

// Reading localStorage can itself throw (blocked storage); core/store catches that inside each call.
const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
const SAVE_DELAY_MS = 300;

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
          </div>
          {/* The user's own words only (D6): the AI never writes here. */}
          <textarea
            id="notes-text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Your margin notes, in markdown. The AI reads them with every question but never edits them."
          />
        </section>
        <Chat reference={reference} notes={notes} messages={messages} setMessages={setMessages} />
      </div>
    </main>
  );
}
