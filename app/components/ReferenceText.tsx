"use client";

import { useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { pageRange, parsePassage } from "@/core/passage.ts";
import { PdfImportButton } from "./PdfImportButton";

// The reference text the AI grounds on. D14: it lives in the background, not in a reading pane:
// a header button shows whether it is set and opens a dialog to edit it. `ref.open()` lets the
// page's "Add reference text" prompt open the same dialog.
export type ReferenceTextHandle = { open: () => void };
type ReferenceTextProps = { value: string; onChange: (value: string) => void; ref?: Ref<ReferenceTextHandle> };

export function ReferenceText({ value, onChange, ref }: ReferenceTextProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const summary = useMemo(() => summarize(value), [value]);
  // showModal() focuses the first focusable element (the PDF input); the text box is the point.
  const open = () => {
    dialog.current?.showModal();
    textarea.current?.focus();
  };
  useImperativeHandle(ref, () => ({ open }));

  return (
    <>
      <button type="button" className="reference-button" onClick={open}>
        Reference text <span className="reference-summary">· {summary}</span>
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
  const pages = pageRange(paragraphs);
  return pages ? `${count}, ${pages}` : count;
}
