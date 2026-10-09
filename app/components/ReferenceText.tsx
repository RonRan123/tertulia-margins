"use client";

import { useMemo, useRef } from "react";
import { parsePassage } from "@/core/passage.ts";
import { PdfImportButton } from "./PdfImportButton";

// The reference text the AI grounds on. D14: it lives in the background, not in a reading pane:
// a header button shows whether it is set and opens a dialog to edit it.
export function ReferenceText({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const summary = useMemo(() => summarize(value), [value]);
  // showModal() focuses the first focusable element (the PDF input); the text box is the point.
  const open = () => {
    dialog.current?.showModal();
    textarea.current?.focus();
  };

  return (
    <>
      <button type="button" className="reference-button" onClick={open}>
        Reference text ({summary})
      </button>
      <dialog ref={dialog} className="reference" aria-labelledby="reference-title">
        <div className="reference-header">
          <label id="reference-title" htmlFor="reference-text">
            Reference text <span className="reference-summary">({summary})</span>
          </label>
          {/* Secondary input (D13): fills this box with [PDF p. N] markers for the user to trim. */}
          <PdfImportButton hasText={value.trim() !== ""} onImport={onChange} />
        </div>
        <textarea
          ref={textarea}
          id="reference-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Paste the chapter. Separate paragraphs with a blank line.\nType [p. 101] where page 101 of your book begins."}
          rows={18}
        />
        <form method="dialog">
          <button type="submit">Done</button>
        </form>
      </dialog>
    </>
  );
}

// "12 paragraphs, p. 101 to p. 108", or "not set".
function summarize(reference: string): string {
  const paragraphs = parsePassage(reference);
  if (paragraphs.length === 0) return "not set";
  const count = `${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}`;
  const pages = paragraphs.map((p) => p.page).filter((p) => p !== undefined);
  if (pages.length === 0) return count;
  const [first, last] = [pages[0], pages[pages.length - 1]];
  return first === last ? `${count}, ${first}` : `${count}, ${first} to ${last}`;
}
