"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ConverseRequest } from "@/core/converse.ts";
import { labelCitations } from "@/core/passage.ts";
import { threadHistory, type ReactionKind } from "@/core/reactions.ts";
import type { Reaction } from "@/core/store.ts";
import { streamMessage, type MessagePatch } from "@/lib/converse-client.ts";
import { CitationWarnings, escapeTo } from "./Chat";
import { KIND_LABELS } from "./ReactButton";

// The margin (D18, D20, D25): one card per reaction, each a thread the reader can reply to, set
// beside the paragraph it answers (core/blocks layoutRows). The page owns `reactions` so it can
// persist them. Cards stream in parallel with each other and with chat: every update targets its
// card by id, through functional setState.
type ReactionsProps = {
  reference: string;
  notes: string;
  setReactions: Dispatch<SetStateAction<Reaction[]>>;
};

export type MarginApi = {
  react: (excerpt: string, kind?: ReactionKind) => void;
  reply: (reaction: Reaction, question: string) => void;
  remove: (id: string) => void;
  choosing: ReadonlySet<string>; // ids waiting for the router
  announcement: string; // for screen readers: "Pushback ready."
};

export function useReactions({ reference, notes, setReactions }: ReactionsProps): MarginApi {
  const [choosing, setChoosing] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const streams = useRef(new Map<string, AbortController>()); // by reaction id: deleting stops its stream

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
  function react(excerpt: string, kind?: ReactionKind) {
    const id = crypto.randomUUID();
    const opening = { role: "assistant" as const, content: "", isStreaming: true };
    setReactions((rs) => [...rs, { id, excerpt, kind: kind ?? "question", messages: [opening] }]);
    if (!kind) setIsChoosing(id, true);
    void stream(id, kind, { passage: reference, notes, question: "", reaction: { excerpt, ...(kind && { kind }) } });
  }

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

  return { react, reply, remove, choosing, announcement };
}

type MarginCellProps = {
  items: { reaction: Reaction; start?: number; end?: number }[]; // no range: detached
  isCurrent?: boolean; // the row's block is the one commands act on: its cards open
  isDetached?: boolean; // the final row: "Your note changed"
  margin: MarginApi;
  hasReference: boolean;
  onShowExcerpt: (start: number, end: number) => void; // opens the block with the excerpt selected
};

// The margin half of one row. A block with reactions gets a dot on the margin rule (with a count
// when there are several); hovering or clicking it opens that block's cards.
export function MarginCell({ items, isCurrent = false, isDetached = false, margin, hasReference, onShowExcerpt }: MarginCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const isOpen = isCurrent || isHovered || isPinned;
  const count = items.length;

  return (
    <div className="margin-stack">
      {count > 0 && !isDetached && (
        <button
          type="button"
          className="dot"
          aria-label={count === 1 ? "Show the reaction to this note" : `Show the ${count} reactions to this note`}
          aria-pressed={isPinned}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setIsPinned((pinned) => !pinned)}
        >
          {count > 1 && <span className="dot-count">{count}</span>}
        </button>
      )}
      {count > 0 && (
        <div className="cards">
          {isDetached && <p className="detached-divider">Your note changed</p>}
          {items.map(({ reaction, start, end }) => {
            const hasRange = start !== undefined && end !== undefined;
            return (
              <Card
                key={reaction.id}
                reaction={reaction}
                isActive={isOpen && !isDetached}
                isChoosing={margin.choosing.has(reaction.id)}
                replyTitle={hasReference ? undefined : "Add reference text first"}
                onShowExcerpt={hasRange ? () => onShowExcerpt(start, end) : undefined}
                onReply={(question) => margin.reply(reaction, question)}
                onDelete={() => margin.remove(reaction.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

type CardProps = {
  reaction: Reaction;
  isActive: boolean; // its block is current, or its dot is hovered or pinned: shown in full
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
  const [isExpanded, setIsExpanded] = useState(false); // opened by a click while its block isn't current
  const { messages } = reaction;
  const isStreaming = messages.at(-1)?.isStreaming === true;
  const hasReplies = messages.length > 1;
  const replyCount = messages.filter((m) => m.role === "user").length; // the reader's replies
  const isDetached = onShowExcerpt === undefined;
  const isOpeningFailed = !isStreaming && threadHistory(messages).length === 0;
  const replyDisabledTitle = replyTitle ?? (isOpeningFailed ? "Nothing to reply to: the reaction failed" : undefined);
  // Collapsed, a card keeps its row short: kind, excerpt, the opening clamped to 4 lines.
  const isOpen = isActive || isExpanded || isStreaming || isChoosing || isReplying || isConfirmingDelete;
  const failedChecks = messages.flatMap((m) => m.citations ?? []).filter((c) => c.status !== "ok").length;
  const className = ["card", isActive && "is-active", isDetached && "is-detached", !isOpen && "is-collapsed"]
    .filter(Boolean)
    .join(" ");

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
      {!isOpen && (
        <button type="button" className="expand" aria-expanded={false} onClick={() => setIsExpanded(true)}>
          <span className="clamp">
            {messages[0]?.error && !messages[0].content
              ? `Reply failed: ${messages[0].error}`
              : labelCitations(messages[0]?.content ?? "", messages[0]?.pages ?? {})}
          </span>
          <span className="more">
            {replyCount > 0 && `· ${replyCount} ${replyCount === 1 ? "reply" : "replies"} `}
            {failedChecks > 0 && `· ⚠ ${failedChecks} citation ${failedChecks === 1 ? "warning" : "warnings"} `}
            · Show all
          </span>
        </button>
      )}
      {isOpen && (
        <>
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
                  e.preventDefault(); // closes the reply box only
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
          {isExpanded && !isActive && !isReplying && (
            <button type="button" className="link less" aria-expanded={true} onClick={() => setIsExpanded(false)}>
              Show less
            </button>
          )}
        </>
      )}
    </article>
  );
}
