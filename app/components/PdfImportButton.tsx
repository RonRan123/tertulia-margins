"use client";

import { useState } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  pdf_unreadable: "Couldn't read that PDF.",
  pdf_no_text: "No text found in that PDF (scanned images aren't supported).",
};

// Reads a PDF in the browser and passes up reference text with [PDF p. N] markers (D13).
// pdfjs is loaded only when a file is picked, so it stays out of the first page load.
// `hasText`: the box already holds reference text, so ask before replacing it.
export function PdfImportButton({ hasText, onImport }: { hasText: boolean; onImport: (text: string) => void }) {
  const [status, setStatus] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const isReplaceDeclined = hasText && !window.confirm("Replace the current reference text with the imported PDF?");
    if (isReplaceDeclined) return;
    setIsImporting(true);
    setStatus("Importing…");
    try {
      const { importPdf } = await import("@/lib/pdf-import.ts");
      const text = await importPdf(file);
      onImport(text);
      // A whole book is far more than a session needs: show the size so the user knows to trim.
      const tokens = Math.round(text.length / 4); // rough: ~4 characters per token
      setStatus(`Imported ${text.length.toLocaleString()} characters (~${tokens.toLocaleString()} tokens).`);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (!(code in ERROR_MESSAGES)) console.error("PDF import failed:", err);
      setStatus(ERROR_MESSAGES[code] ?? "PDF import failed.");
    }
    setIsImporting(false);
  }

  return (
    <span className="pdf-import">
      <label>
        Import PDF{" "}
        <input
          type="file"
          accept=".pdf,application/pdf"
          disabled={isImporting}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {status && <span className="pdf-import-status">{status}</span>}
    </span>
  );
}
