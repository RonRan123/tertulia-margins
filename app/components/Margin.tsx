"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import type { Row } from "@/core/blocks.ts";
import { trace } from "@/lib/trace.ts";
import { ACTIONS, afterPromote, afterRun, DAEMON_IDS, DAEMONS, dismissCard, planDaemons, type DaemonCard, type DaemonState } from "@/core/daemons.ts";
import { LIMITS } from "@/core/limits.ts";
import { runDaemons } from "@/lib/converse-client.ts";
import { CitedText } from "./CitedText";

// The margin (D37): a panel naming the daemons, with their status and a "React to notes" button,
// then their cards beside the lines they answer. The daemons look on their own once the reader
// pauses (LIMITS.daemons.idleMs) after writing enough of their own words, or when asked; core/daemons
// plans what to do, and a run asks the route for every daemon's nugget and the reviewer's pick.
type DaemonsProps = {
  bookId: string; // a run for another book is abandoned when the book changes
  edits: number; // the reader's own edits in this tab: each restarts the wait
  reference: string;
  notes: string;
  daemons: DaemonState;
  setDaemons: Dispatch<SetStateAction<DaemonState>>;
  pausedReason?: string; // no reference text, or over the D32 cap: the daemons don't look
};

// How the last look ended, until the reader's next edit: nothing worth showing, the daily cap,
// or a failed call.
type Outcome = "quiet" | "daemon_limit" | "failed";

export type MarginApi = {
  reactNow: () => void; // "React to notes"
  dismiss: (id: string) => void;
  status: string; // one line for the panel
  isReading: boolean; // a run is out
  isPaused: boolean;
  announcement: string; // for screen readers: "The Author wrote in the margin."
};

export function useDaemons({ bookId, edits, reference, notes, daemons, setDaemons, pausedReason }: DaemonsProps): MarginApi {
  const isPaused = pausedReason !== undefined;
  const [isReading, setIsReading] = useState(false);
  // The last look's outcome, kept with the edit count it followed: a newer edit hides it.
  const [last, setLast] = useState<{ outcome?: Outcome; edits: number }>({ edits: 0 });
  const outcome = last.edits === edits ? last.outcome : undefined;
  const [announcement, setAnnouncement] = useState("");
  const running = useRef<AbortController>(undefined);
  // The timer fires later: it reads the latest notes, not the ones it was set with.
  const latest = useRef({ reference, notes, daemons, edits });
  useEffect(() => {
    latest.current = { reference, notes, daemons, edits };
  });

  // A new book: abandon a run made for the last one.
  useEffect(() => () => running.current?.abort(), [bookId]);

  async function look(isAsked = false) {
    if (running.current) return;
    const { reference, notes, daemons, edits } = latest.current;
    const setOutcome = (outcome?: Outcome) => setLast({ outcome, edits });
    const plan = planDaemons(notes, daemons, isAsked);
    if (plan.kind === "wait") return;
    if (plan.kind === "promote") {
      trace({ kind: "promote", daemon: plan.card.daemon, text: plan.card.text });
      setDaemons((d) => afterPromote(d, plan.card));
      return setAnnouncement(`${DAEMONS[plan.card.daemon].name} wrote in the margin.`);
    }
    const abort = new AbortController();
    running.current = abort;
    setIsReading(true);
    const result = await runDaemons({ passage: reference, notes, question: "", daemons: { excerpt: plan.excerpt, mustPick: plan.mustPick } }, abort.signal, isAsked ? "asked" : "pause");
    running.current = undefined;
    setIsReading(false);
    if (abort.signal.aborted) return;
    if ("error" in result) return setOutcome(result.error === "daemon_limit" ? "daemon_limit" : "failed");
    setDaemons((d) => afterRun(d, plan, result.pick, result.nuggets, () => crypto.randomUUID()));
    setOutcome(result.pick ? undefined : "quiet");
    if (result.pick) setAnnouncement(`${DAEMONS[result.pick].name} wrote in the margin.`);
  }

  // Every edit of the reader's restarts the wait; a pause long enough lets the daemons look. A failed
  // run leaves its lines unread, so the next pause after an edit tries again (never a retry loop).
  useEffect(() => {
    if (isPaused || edits === 0) return;
    const timer = setTimeout(() => void look(), LIMITS.daemons.idleMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- look reads `latest`; only these restart the wait
  }, [edits, isPaused]);

  // How many new lines the daemons have to read so far (deferred, so typing stays smooth).
  const deferredNotes = useDeferredValue(notes);
  const waiting = useMemo(() => planDaemons(deferredNotes, daemons), [deferredNotes, daemons]);
  const newLines = waiting.kind === "wait" ? waiting.lines : LIMITS.daemons.minLines;
  const status = isPaused
    ? `Paused: ${pausedReason}`
    : isReading
      ? "Reading your notes…"
      : outcome === "quiet"
        ? "Nothing to add this time."
        : outcome === "daemon_limit"
          ? `Today's ${LIMITS.daemons.dailyRuns} daemon runs are used up; they reset at midnight.`
          : outcome === "failed"
            ? "Couldn't reach the daemons; they'll try again after your next edit."
            : newLines >= LIMITS.daemons.minLines
              ? "They'll read when you pause."
              : `Listening: ${newLines} of ${LIMITS.daemons.minLines} new lines.`;

  const dismiss = (id: string) => {
    const card = latest.current.daemons.cards.find((c) => c.id === id);
    if (card) trace({ kind: "card", action: "dismiss", daemon: card.daemon, text: card.text });
    setDaemons((d) => dismissCard(d, id));
  };
  return { reactNow: () => void look(true), dismiss, status, isReading, isPaused, announcement };
}

// The top of the margin: who the daemons are, what they're doing, and a way to ask them now.
export function DaemonPanel({ margin }: { margin: MarginApi }) {
  return (
    <div className="daemon-panel">
      <ul className="daemon-list" aria-label="Daemons">
        {DAEMON_IDS.map((id) => (
          <li key={id} style={{ "--daemon": DAEMONS[id].colour } as CSSProperties}>
            {DAEMONS[id].name}
          </li>
        ))}
      </ul>
      <p className="daemon-status">{margin.status}</p>
      <button type="button" className="react-notes" disabled={margin.isPaused || margin.isReading} onClick={margin.reactNow}>
        React to notes
      </button>
    </div>
  );
}

type MarginCellProps = {
  row: Row<DaemonCard & { excerpt: string }>;
  margin: MarginApi;
  activeId?: string; // the clicked card: its words are highlighted in the notes
  onToggle: (card: DaemonCard) => void; // a click on a card highlights its words, or clears them
};

// One paragraph's cards, written like notes pencilled in a book's margin: the daemon's name in its
// colour, then its remark. A click on the card (or its name, from the keyboard) highlights the
// words it answers in the notes; × dismisses it. Links and buttons inside keep their own clicks.
export function MarginCell({ row, margin, activeId, onToggle }: MarginCellProps) {
  return (
    <div className="cards">
      {row.cards.map(({ card }) => {
        const daemon = DAEMONS[card.daemon];
        const isActive = card.id === activeId;
        return (
          <article
            key={card.id}
            className={isActive ? "card daemon-card active" : "card daemon-card"}
            style={{ "--daemon": daemon.colour } as CSSProperties}
            onClick={(e) => {
              const isOwnControl = (e.target as HTMLElement).closest("button, a");
              if (!isOwnControl) onToggle(card);
            }}
          >
            <div className="card-head">
              <button type="button" className="daemon-name" aria-pressed={isActive} title="Highlight the words this answers" onClick={() => onToggle(card)}>
                {daemon.name}
              </button>
              {ACTIONS[daemon.action].isBeyondBook && <span className="beyond-book">beyond the book</span>}
              <button type="button" className="delete" aria-label={`Dismiss ${daemon.name}'s note`} onClick={() => margin.dismiss(card.id)}>
                ×
              </button>
            </div>
            <p className="reply-ai">
              <CitedText text={card.text} />
            </p>
          </article>
        );
      })}
    </div>
  );
}
