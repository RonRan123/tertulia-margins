"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { clampNotesShare, NOTES_SHARE } from "@/core/store.ts";

// The handle between the notes and the pane beside them (S8.1). Dragging sets main's
// --notes-share directly, so the page doesn't re-render on every move; the width is handed to
// `onChange` (and saved) when the drag ends. Arrow keys move it a step at a time. CSS shows it
// only when a pane sits beside the notes, and never on phones.
export function PaneDivider({ share, onChange }: { share: number; onChange: (share: number) => void }) {
  const shareAt = (event: PointerEvent<HTMLDivElement>) => {
    const workspace = event.currentTarget.parentElement!.getBoundingClientRect();
    return clampNotesShare((event.clientX - workspace.left) / workspace.width);
  };
  const preview = (event: PointerEvent<HTMLDivElement>, value: number) =>
    event.currentTarget.closest("main")?.style.setProperty("--notes-share", `${value * 100}%`);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault(); // no text selection while dragging
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) preview(event, shareAt(event));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onChange(shareAt(event));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps = { ArrowLeft: -1, ArrowRight: 1 } as Record<string, number>;
    if (!(event.key in steps)) return;
    event.preventDefault();
    onChange(clampNotesShare(share + steps[event.key] * NOTES_SHARE.step));
  };

  return (
    <div
      className="pane-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the notes and the pane beside them"
      aria-valuemin={NOTES_SHARE.min * 100}
      aria-valuemax={NOTES_SHARE.max * 100}
      aria-valuenow={Math.round(share * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(event) => preview(event, share)}
      onKeyDown={onKeyDown}
    />
  );
}
