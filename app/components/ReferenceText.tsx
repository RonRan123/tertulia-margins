"use client";

import { PdfImportButton } from "./PdfImportButton";

// The reference text the AI grounds on (D14: it lives in the background; Sprint 3 moves this into a drawer).
export function ReferenceText({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <section className="reference">
      <div className="reference-header">
        <label htmlFor="reference-text">Reference text</label>
        {/* Secondary input (D13): fills this box with [PDF p. N] markers for the user to trim. */}
        <PdfImportButton hasText={value.trim() !== ""} onImport={onChange} />
      </div>
      <textarea
        id="reference-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Paste the chapter. Separate paragraphs with a blank line.\nType [p. 101] where page 101 of your book begins."}
        rows={14}
      />
    </section>
  );
}
