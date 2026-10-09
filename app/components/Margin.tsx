"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Dispatch, type Ref, type SetStateAction } from "react";
import type { ConverseRequest } from "@/core/converse.ts";
import { labelCitations } from "@/core/passage.ts";
import { placeReactions, threadHistory, type ReactionKind } from "@/core/reactions.ts";
import type { Reaction } from "@/core/store.ts";
import { streamMessage, type MessagePatch } from "@/lib/converse-client.ts";
import { CitationWarnings, escapeTo } from "./Chat";
import { KIND_LABELS } from "./ReactButton";

// The margin column (D18, D20): one card per reaction, each a thread the reader can reply to.
// The page owns `reactions` so it can persist them. Cards stream in parallel with each other and
// with chat: every update targets its card by id, through functional setState.
type MarginProps = {
  reference: string;
  notes: string;
  reactions: Reaction[];
  setReactions: Dispatch<SetStateAction<Reaction[]>>;
  caret?: number; // the notes caret: cards whose excerpt contains it are active
  onShowExcerpt: (start: number, end: number) => void; // selects the excerpt in the notes
  ref?: Ref<MarginHandle>;
};

export type MarginHandle = { react: (excerpt: string, kind?: ReactionKind) => void };

const isPhoneWidth = () => window.matchMedia("(max-width: 48rem)").matches;

export function Margin({ reference, notes, reactions, setReactions, caret, onShowExcerpt, ref }: MarginProps) {
  const [choosing, setChoosing] = useState<ReadonlySet<string>>(new Set()); // ids waiting for the router
  const [announcement, setAnnouncement] = useState(""); // for screen readers: "Pushback ready."
  const streams = useRef(new Map<string, AbortController>()); // by reaction id: deleting stops its stream
  const column = useRef<HTMLElement>(null);
  const { placed, detached } = placeReactions(notes, reactions);
  const isActive = ({ start, end }: { start: number; end: number }) => caret !== undefined && start <= caret && caret <= end;
  const activeIds = placed.filter(isActive).map((p) => p.reaction.id).join(" ");

  // Note → card: bring the active card into view. Not on phones: the margin sits under the notes
  // there, so scrolling to it would pull the page away from what the reader is typing.
  useEffect(() => {
    if (activeIds === "" || isPhoneWidth()) return;
    column.current?.querySelector(".card.is-active")?.scrollIntoView({ block: "nearest" });
  }, [activeIds]);

  const updateThread = (id: string, change: (r: Reaction) => Reaction) =>
    setReactions((rs) => rs.map((r) => (r.id === id ? change(r) : r)));
  const updateLast = (id: string) => (patch: MessagePatch) =>
    updateThread(id, (r) => ({ ...r, messages: [...r.messages.slice(0, -1), patch(r.messages[r.messages.length - 1])] }));
  const setIsChoosing = (id: string, isChoosing: boolean) =>
    setChoosing((ids) => {
      const next = new Set(ids);
      if (isChoosing) next.add(id);
      else next.delete(id);
      return next;
    });

  // Streams into the last message of thread `id`. A routed reaction learns its kind from the first event.
  async function stream(id: string, kind: ReactionKind | undefined, body: ConverseRequest) {
    const abort = new AbortController();
    streams.current.set(id, abort);
    let finalKind = kind;
    const onKind = (picked: ReactionKind) => {
      finalKind = picked;
      updateThread(id, (r) => ({ ...r, kind: picked }));
      setIsChoosing(id, false);
    };
    await streamMessage(body, updateLast(id), { onKind, signal: abort.signal });
    streams.current.delete(id);
    setIsChoosing(id, false);
    if (!abort.signal.aborted) setAnnouncement(`${finalKind ? KIND_LABELS[finalKind].label : "Reaction"} ready.`);
  }

  // Each React makes a new card, even on an excerpt that already has one (D20). Until the router
  // answers, the card holds a placeholder kind and reads "Choosing…".
  useImperativeHandle(ref, () => ({
    react: (excerpt, kind) => {
      const id = crypto.randomUUID();
      const opening = { role: "assistant" as const, content: "", isStreaming: true };
      setReactions((rs) => [...rs, { id, excerpt, kind: kind ?? "question", messages: [opening] }]);
      if (!kind) setIsChoosing(id, true);
      void stream(id, kind, { passage: reference, notes, question: "", reaction: { excerpt, ...(kind && { kind }) } });
    },
  }));

  function reply(reaction: Reaction, question: string) {
    const history = threadHistory(reaction.messages);
    const { id, excerpt, kind } = reaction;
    updateThread(id, (r) => ({
      ...r,
      messages: [...r.messages, { role: "user", content: question }, { role: "assistant", content: "", isStreaming: true }],
    }));
    void stream(id, kind, { passage: reference, notes, question, history, reaction: { excerpt, kind } });
  }

  function remove(id: string) {
    streams.current.get(id)?.abort();
    setReactions((rs) => rs.filter((r) => r.id !== id));
  }

  const hasReference = reference.trim() !== "";
  const card = (reaction: Reaction, range?: { start: number; end: number }) => (
    <Card
      key={reaction.id}
      reaction={reaction}
      isActive={range !== undefined && isActive(range)}
      isChoosing={choosing.has(reaction.id)}
      replyTitle={hasReference ? undefined : "Add reference text first"}
      onShowExcerpt={range && (() => onShowExcerpt(range.start, range.end))}
      onReply={(question) => reply(reaction, question)}
      onDelete={() => remove(reaction.id)}
    />
  );

  return (
    <section className="margin" aria-label="Reactions" ref={column}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {reactions.length === 0 && <p className="empty">Reactions to your notes appear here, beside the note they answer.</p>}
      {placed.map(({ reaction, start, end }) => card(reaction, { start, end }))}
      {detached.length > 0 && <p className="detached-divider">Your note changed</p>}
      {detached.map((reaction) => card(reaction))}
    </section>
  );
}

type CardProps = {
  reaction: Reaction;
  isActive: boolean;
  isChoosing: boolean;
  replyTitle?: string; // set when replying is impossible, saying why
  onShowExcerpt?: () => void; // absent when the excerpt is no longer in the notes (detached)
  onReply: (question: string) => void;
  onDelete: () => void;
};

// The excerpt as the card shows it: one line, at most 60 characters.
function shorten(excerpt: string): string {
  const line = excerpt.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
}

function Card({ reaction, isActive, isChoosing, replyTitle, onShowExcerpt, onReply, onDelete }: CardProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { messages } = reaction;
  const isStreaming = messages.at(-1)?.isStreaming === true;
  const hasReplies = messages.length > 1;
  const isDetached = onShowExcerpt === undefined;
  const isOpeningFailed = !isStreaming && threadHistory(messages).length === 0;
  const replyDisabledTitle = replyTitle ?? (isOpeningFailed ? "Nothing to reply to: the reaction failed" : undefined);
  const className = ["card", isActive && "is-active", isDetached && "is-detached"].filter(Boolean).join(" ");

  const send = () => {
    const question = draft.trim();
    const isReady = question !== "" && !isStreaming && replyDisabledTitle === undefined;
    if (!isReady) return;
    onReply(question);
    setDraft("");
  };

  return (
    <article className={className} aria-busy={isStreaming}>
      <div className="card-head">
        <span className={isChoosing ? "kind is-choosing" : "kind"}>{isChoosing ? "Choosing…" : KIND_LABELS[reaction.kind].label}</span>
        {isConfirmingDelete ? (
          <span className="confirm" onKeyDown={(e) => escapeTo(e, () => setIsConfirmingDelete(false))}>
            Delete this thread?{" "}
            <button type="button" onClick={onDelete}>
              Delete
            </button>{" "}
            <button type="button" autoFocus onClick={() => setIsConfirmingDelete(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="delete"
            aria-label="Delete reaction"
            onClick={() => (hasReplies ? setIsConfirmingDelete(true) : onDelete())}
          >
            ×
          </button>
        )}
      </div>
      {isDetached ? (
        <span className="excerpt">“{shorten(reaction.excerpt)}”</span>
      ) : (
        <button type="button" className="excerpt" title="Show this in your notes" onClick={onShowExcerpt}>
          “{shorten(reaction.excerpt)}”
        </button>
      )}
      {messages.map((m, i) =>
        m.role === "user" ? (
          <p key={i} className="reply-user">
            {m.content}
          </p>
        ) : (
          <div key={i} className={i === 0 ? "reply-ai" : "reply-ai follow-up"}>
            <p>
              {labelCitations(m.content, m.pages ?? {})}
              {m.isStreaming && (
                <span className="caret" aria-hidden="true">
                  ▍
                </span>
              )}
            </p>
            {m.error && <p className="warning">Reply failed: {m.error}</p>}
            <CitationWarnings citations={m.citations} />
          </div>
        ),
      )}
      {isReplying ? (
        <textarea
          rows={2}
          autoFocus
          aria-label="Reply to this reaction"
          placeholder="Reply (Enter to send, Esc to close)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault(); // closes the reply box only, not the chat drawer too
              return setIsReplying(false);
            }
            // Enter while composing (IME) confirms the composition, not the reply.
            const isSubmit = e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
            if (!isSubmit) return;
            e.preventDefault();
            send();
          }}
        />
      ) : (
        <button
          type="button"
          className="link"
          disabled={isStreaming || replyDisabledTitle !== undefined}
          title={replyDisabledTitle}
          onClick={() => setIsReplying(true)}
        >
          Reply
        </button>
      )}
    </article>
  );
}
