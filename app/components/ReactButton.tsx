"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { ReactionKind } from "@/core/reactions.ts";

// What the margin and the kind menu call each kind. UI copy, so it lives here, not in core.
export const KIND_LABELS: Record<ReactionKind, { label: string; hint: string }> = {
  question: { label: "Question", hint: "ask me something about this" },
  pushback: { label: "Pushback", hint: "where the text disagrees" },
  connection: { label: "Connection", hint: "link it to another passage" },
};
const KINDS = Object.keys(KIND_LABELS) as ReactionKind[];

// mousedown is cancelled so focus and the highlighted selection stay in the notes.
const keepNotesFocus = (e: MouseEvent) => e.preventDefault();

// The split React button (D20): React asks the router to pick the kind; right-click on React, or
// the ▾ caret (keyboard and touch), opens a menu to pick the kind yourself.
export function ReactButton({ title, onReact }: { title?: string; onReact: (kind?: ReactionKind) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const isDisabled = title !== undefined;

  // Opening moves focus to the first kind, so the arrow keys work at once.
  useEffect(() => {
    if (isOpen) items.current[0]?.focus();
  }, [isOpen]);

  // A press anywhere outside the button closes the menu.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const openOnArrowDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    setIsOpen(true);
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") return setIsOpen(false);
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      caret.current?.focus();
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const current = items.current.indexOf(document.activeElement as HTMLButtonElement);
    items.current[(current + step + KINDS.length) % KINDS.length]?.focus();
  };

  return (
    <div className="split" ref={wrapper}>
      <button
        type="button"
        className="primary"
        disabled={isDisabled}
        title={title ?? "React to the selection, or the note at the cursor (⌘/Ctrl+Enter). Right-click to pick the kind."}
        onMouseDown={keepNotesFocus}
        onClick={() => onReact()}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen(true);
        }}
        onKeyDown={openOnArrowDown}
      >
        React
      </button>
      <button
        ref={caret}
        type="button"
        className="primary"
        disabled={isDisabled}
        title={title}
        aria-label="Choose the reaction kind"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="react-menu"
        onMouseDown={keepNotesFocus}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={openOnArrowDown}
      >
        ▾
      </button>
      {isOpen && (
        <div id="react-menu" role="menu" aria-label="Reaction kind" className="menu" onKeyDown={onMenuKeyDown}>
          {KINDS.map((kind, i) => (
            <button
              key={kind}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onMouseDown={keepNotesFocus}
              onClick={() => {
                setIsOpen(false);
                onReact(kind); // selects the excerpt in the notes, which takes focus back there
              }}
            >
              {KIND_LABELS[kind].label}
              <small>{KIND_LABELS[kind].hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
