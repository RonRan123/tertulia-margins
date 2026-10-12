"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { deletePdf, loadPdf, savePdf, type StoredPdf } from "@/lib/pdf-store.ts";
import { PdfViewer, type PdfViewerHandle } from "./PdfViewer";
import { UploadIcon } from "./icons";

// The PDF view (D29) for the open book: an upload drop zone until the book has a PDF, then the
// viewer. Adding a PDF stores it in the browser (lib/pdf-store) and offers its text as the book's
// reference text, the text the AI grounds in (D13): filled straight in when there is none, asked
// first when there is.
export type PdfPaneHandle = {
  pick: () => void; // opens the file picker (top bar, sidebar)
  goTo: (page: number) => void; // a cite's page
  forget: (bookId: string) => void; // the book was deleted
};

type PdfPaneProps = {
  bookId: string;
  hasReference: boolean;
  onReference: (text: string) => void;
  onAdded: () => void; // a PDF was added: the page shows the PDF view
  onStatus: (message: string) => void;
  ref?: Ref<PdfPaneHandle>;
};

const IMPORT_ERRORS: Record<string, string> = {
  pdf_unreadable: "Couldn't read that PDF's text.",
  pdf_no_text: "This PDF has no text layer (a scan?), so the AI can't read it. You can still view it.",
};

export function PdfPane({ bookId, hasReference, onReference, onAdded, onStatus, ref }: PdfPaneProps) {
  const [pdf, setPdf] = useState<StoredPdf>();
  const [loadedFor, setLoadedFor] = useState<string>(); // the book whose PDF `pdf` is
  const [offer, setOffer] = useState<string>(); // text waiting for "use as reference text?"
  const [isDragging, setIsDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const viewer = useRef<PdfViewerHandle>(null);
  const pendingPage = useRef<number>(undefined);

  // Each book has its own PDF; switching books loads it (or finds none).
  useEffect(() => {
    let isCurrent = true;
    void loadPdf(bookId).then((saved) => {
      if (!isCurrent) return;
      setPdf(saved);
      setLoadedFor(bookId);
      setOffer(undefined);
    });
    return () => {
      isCurrent = false;
    };
  }, [bookId]);

  async function add(file: File | undefined) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return onStatus("That isn't a PDF.");
    const stored = { name: file.name, data: file };
    const isSaved = await savePdf(bookId, stored);
    setPdf(stored);
    onAdded();
    onStatus(isSaved ? "Reading the PDF's text…" : "Showing the PDF, but the browser couldn't store it: it will be gone after a reload.");
    try {
      const { importPdf } = await import("@/lib/pdf-import.ts");
      const text = await importPdf(file);
      const tokens = Math.round(text.length / 4).toLocaleString(); // rough: ~4 characters per token
      if (hasReference) {
        setOffer(text);
        onStatus("");
        return;
      }
      onReference(text);
      onStatus(`The PDF's text (~${tokens} tokens) is now this book's reference text.`);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      onStatus(IMPORT_ERRORS[code] ?? "Couldn't read that PDF's text.");
    }
  }

  useImperativeHandle(ref, () => ({
    pick: () => input.current?.click(),
    goTo: (page) => {
      if (viewer.current) return viewer.current.goTo(page);
      pendingPage.current = page;
    },
    forget: (id) => void deletePdf(id),
  }));

  // A cite clicked before the viewer existed opens its page once it does.
  useEffect(() => {
    if (pdf && viewer.current && pendingPage.current) {
      viewer.current.goTo(pendingPage.current);
      pendingPage.current = undefined;
    }
  }, [pdf]);

  const picker = (
    <input
      ref={input}
      type="file"
      accept=".pdf,application/pdf"
      hidden
      onChange={(e) => {
        void add(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const isLoading = loadedFor !== bookId;
  if (isLoading) return picker;

  return (
    <>
      {picker}
      {offer && (
        <div className="pdf-offer" role="status">
          <span>Use this PDF&apos;s text as the book&apos;s reference text? It replaces what&apos;s there now.</span>
          <button
            type="button"
            onClick={() => {
              onReference(offer);
              setOffer(undefined);
              onStatus("The PDF's text is now this book's reference text.");
            }}
          >
            Replace
          </button>
          <button type="button" className="quiet" onClick={() => setOffer(undefined)}>
            Keep current
          </button>
        </div>
      )}
      {pdf ? (
        <PdfViewer ref={viewer} pdf={pdf} />
      ) : (
        <div
          className={isDragging ? "pdf-drop is-dragging" : "pdf-drop"}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            void add(e.dataTransfer.files[0]);
          }}
        >
          <UploadIcon />
          <p className="pdf-drop-title">Drop the book&apos;s PDF here</p>
          <p className="pdf-drop-hint">It stays in this browser. Its text becomes the reference the AI reads.</p>
          <button type="button" className="primary" onClick={() => input.current?.click()}>
            Choose a PDF
          </button>
        </div>
      )}
    </>
  );
}
