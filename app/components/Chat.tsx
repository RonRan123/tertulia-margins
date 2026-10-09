"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CitationCheck } from "@/core/citations.ts";
import type { ConverseEvent, Turn } from "@/core/converse.ts";
import { citedPages, labelCitations, parsePassage } from "@/core/passage.ts";
import type { ChatMessage as Message } from "@/core/store.ts";

// The page owns the messages so it can persist them (D7). Notes go with every question (D6:
// they steer the reply, but the AI's text stays here in the chat, never in the notes).
type ChatProps = {
  reference: string;
  notes: string;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

export function Chat({ reference, notes, messages, setMessages }: ChatProps) {
  const [question, setQuestion] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [hasAskedToClear, setHasAskedToClear] = useState(false); // then focus returns to "Clear conversation"
  const questionBox = useRef<HTMLTextAreaElement>(null);
  const hasReference = reference.trim() !== "";

  const updateLast = (patch: (m: Message) => Message) =>
    setMessages((ms) => [...ms.slice(0, -1), patch(ms[ms.length - 1])]);

  async function send() {
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
    const paragraphs = parsePassage(reference); // as sent, for the finished reply's page labels
    setMessages([...messages, { role: "user", content: question }, { role: "assistant", content: "", isStreaming: true }]);
    setQuestion("");
    setIsBusy(true);
    try {
      const requestError = await streamReply({ passage: reference, question, notes, history }, (event) => {
        if (event.type === "text") updateLast((m) => ({ ...m, content: m.content + event.text }));
        // An empty reply (e.g. a refusal) is an error, not a blank bubble.
        if (event.type === "done")
          updateLast((m) =>
            m.content === ""
              ? { ...m, error: `empty_reply (stop_reason: ${event.stats.stopReason})` }
              : { ...m, citations: event.stats.citations },
          );
        if (event.type === "error") updateLast((m) => ({ ...m, error: event.code }));
      });
      if (requestError) updateLast((m) => ({ ...m, error: requestError }));
    } catch {
      updateLast((m) => ({ ...m, error: "network_error" }));
    }
    updateLast((m) => ({ ...m, pages: citedPages(m.content, paragraphs), isStreaming: false }));
    setIsBusy(false);
  }

  return (
    <section className="chat">
      <div className="pane-header">
        <h2>Chat</h2>
        {/* Clears the conversation only; notes and reference text stay. Asks inline first. */}
        {isConfirmingClear ? (
          <span>
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
      <ol className="messages">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "message user" : "message ai"}>
            <span className="who">{m.role === "user" ? "You" : "AI"}</span>
            <p>{m.role === "assistant" ? labelCitations(m.content, m.pages ?? {}) : m.content}</p>
            {m.error && <p className="warning">Reply failed: {m.error}</p>}
            <CitationWarnings citations={m.citations} />
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
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
            send();
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

function CitationWarnings({ citations }: { citations?: CitationCheck[] }) {
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

// POST to the route and call onEvent for each NDJSON line as it arrives.
// Returns an error code if the request was rejected (e.g. "passage_missing"), a line was not JSON
// ("bad_response"), or the stream ended without a "done" or "error" line ("stream_incomplete").
async function streamReply(
  body: { passage: string; question: string; notes: string; history: Turn[] },
  onEvent: (event: ConverseEvent) => void,
): Promise<string | undefined> {
  const response = await fetch("/api/converse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const { error } = await response.json().catch(() => ({ error: "api_error" }));
    return String(error);
  }
  let isFinished = false;
  const handleLine = (line: string): boolean => {
    if (!line.trim()) return true;
    let event: ConverseEvent;
    try {
      event = JSON.parse(line);
    } catch {
      return false;
    }
    if (event.type === "done" || event.type === "error") isFinished = true;
    onEvent(event);
    return true;
  };

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep a partial last line for the next chunk
    if (!lines.every(handleLine)) {
      void reader.cancel();
      return "bad_response";
    }
  }
  if (!handleLine(buffer)) return "bad_response"; // a last line with no trailing newline
  return isFinished ? undefined : "stream_incomplete";
}
