"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type Ref,
  type SetStateAction,
} from "react";
import type { CitationCheck } from "@/core/citations.ts";
import { commandLabel, type Command } from "@/core/commands.ts";
import type { Turn } from "@/core/converse.ts";
import { labelCitations } from "@/core/passage.ts";
import type { ChatMessage as Message } from "@/core/store.ts";
import { streamMessage } from "@/lib/converse-client.ts";

// The page owns the messages so it can persist them (D7). Notes go with every question (D6:
// they steer the reply, but the AI's text stays here in the chat, never in the notes).
type ChatProps = {
  reference: string;
  notes: string;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  // The page owns isBusy too: the notes toolbar disables its commands while a reply streams.
  isBusy: boolean;
  setIsBusy: (isBusy: boolean) => void;
  onReplyEnd?: () => void; // the page shows an unread dot if the drawer is closed
  ref?: Ref<ChatHandle>; // lets the notes toolbar run a command through the same send()
};

export type ChatHandle = { run: (command: Command) => void; focus: () => void };

export function Chat({ reference, notes, messages, setMessages, isBusy, setIsBusy, onReplyEnd, ref }: ChatProps) {
  const [question, setQuestion] = useState("");
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [hasAskedToClear, setHasAskedToClear] = useState(false); // then focus returns to "Clear conversation"
  const questionBox = useRef<HTMLTextAreaElement>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const hasReference = reference.trim() !== "";

  // Bring a newly added message into view. Keyed on the count, not the content, so streamed
  // deltas don't pull the list back down while the user scrolls up to read.
  useEffect(() => {
    messageList.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const updateLast = (patch: (m: Message) => Message) =>
    setMessages((ms) => [...ms.slice(0, -1), patch(ms[ms.length - 1])]);

  // A command shows as its label ("/define melancholy") here and in history; the full selection
  // goes only in `command`.
  useImperativeHandle(ref, () => ({
    run: (command) => send(commandLabel(command), command),
    focus: () => questionBox.current?.focus(),
  }));

  async function send(question: string, command?: Command) {
    const isReady = question.trim() !== "" && hasReference && !isBusy;
    if (!isReady) return;
    // Messages come in (question, reply) pairs. A failed or empty reply is dropped with the
    // question that prompted it, so history never has two user turns in a row.
    const history: Turn[] = [];
    for (let i = 0; i + 1 < messages.length; i += 2) {
      const [asked, answer] = [messages[i], messages[i + 1]];
      const isAnswered = answer.content !== "" && !answer.error;
      if (isAnswered) history.push({ role: "user", content: asked.content }, { role: "assistant", content: answer.content });
    }
    setMessages([...messages, { role: "user", content: question }, { role: "assistant", content: "", isStreaming: true }]);
    if (!command) setQuestion("");
    setIsBusy(true);
    await streamMessage({ passage: reference, question, notes, history, command }, updateLast);
    setIsBusy(false);
    onReplyEnd?.();
  }

  return (
    <section className="chat">
      <div className="pane-header">
        <h2>Chat</h2>
        {/* Clears the conversation only; notes and reference text stay. Asks inline first. */}
        {isConfirmingClear ? (
          <span onKeyDown={(e) => escapeTo(e, () => setIsConfirmingClear(false))}>
            Clear {messages.length} messages?{" "}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setMessages([]);
                setIsConfirmingClear(false);
                questionBox.current?.focus(); // "Clear conversation" comes back disabled: nothing left to clear
              }}
            >
              Clear
            </button>{" "}
            <button type="button" autoFocus onClick={() => setIsConfirmingClear(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            autoFocus={hasAskedToClear}
            disabled={isBusy || messages.length === 0}
            onClick={() => {
              setIsConfirmingClear(true);
              setHasAskedToClear(true);
            }}
          >
            Clear conversation
          </button>
        )}
      </div>
      {messages.length === 0 && <p className="empty">Ask about the text or your notes. Define and Quiz replies land here too.</p>}
      {/* Who wrote what is carried by typeface, colour and rule (D6), not by a label. */}
      <ol className="messages" ref={messageList}>
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "message user" : "message ai"}>
            <p>
              {m.role === "assistant" ? labelCitations(m.content, m.pages ?? {}) : m.content}
              {m.isStreaming && <span className="caret" aria-hidden="true">▍</span>}
            </p>
            {m.error && <p className="warning">Reply failed: {m.error}</p>}
            <CitationWarnings citations={m.citations} />
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
      >
        <textarea
          ref={questionBox}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter while composing (IME, e.g. Japanese input) confirms the composition, not the message.
            const isSubmit = e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
            if (!isSubmit) return;
            e.preventDefault();
            send(question);
          }}
          placeholder={hasReference ? "Ask about the text or your notes (Enter to send)" : "Add reference text first (button at the top)"}
          disabled={!hasReference}
          rows={3}
        />
        <button type="submit" disabled={isBusy || !question.trim() || !hasReference}>
          {isBusy ? "Replying…" : "Send"}
        </button>
      </form>
    </section>
  );
}

// Esc in an inline confirm cancels it, and only it: preventDefault tells the page not to close the drawer too.
export function escapeTo(e: KeyboardEvent, cancel: () => void) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  cancel();
}

// Citation checks that failed, under a reply. Chat and margin cards both use it.
export function CitationWarnings({ citations }: { citations?: CitationCheck[] }) {
  const failed = (citations ?? []).filter((c) => c.status !== "ok");
  if (failed.length === 0) return null;
  return (
    <ul className="warning">
      {failed.map((c, i) => (
        <li key={i}>
          “{c.quote}”{c.cited.length > 0 && ` [¶${c.cited.join(", ")}]`}: {c.status}
        </li>
      ))}
    </ul>
  );
}
