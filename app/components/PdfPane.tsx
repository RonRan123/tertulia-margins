"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { estimateTokens, fitPdfPages, isReferenceTooLong, pdfPageCount, REFERENCE_TOKEN_LIMIT, slicePdfPages } from "@/core/passage.ts";
import type { OcrStats } from "@/core/ocr-layout.ts";
import { deletePdf, loadPdf, savePdf, type StoredPdf } from "@/lib/pdf-store.ts";
import { PdfViewer, type PdfViewerHandle } from "./PdfViewer";
import { UploadIcon } from "./icons";

// The PDF view (D29) for the open book: an upload drop zone until the book has a PDF, then the
// viewer. Adding a PDF stores it in the browser (lib/pdf-store) and offers its text as the book's
// reference text, the text the AI grounds in (D13): filled straight in when there is none, asked
// first when there is. Text over the D32 cap asks which PDF pages to use instead. A scanned PDF is
// first turned into a text PDF by OCR (D55), which replaces the stored one.
export type PdfPaneHandle = {
  pick: () => void; // opens the file picker (top bar, sidebar)
  choosePages: () => void; // asks which PDF pages become the reference text (D32)
  goTo: (page: number, highlight?: string) => void; // a cite's or page link's page (R4: and its words)
  clearHighlight: () => void; // unselects those words (the reader edited the notes)
  forget: (bookId: string) => void; // the book was deleted
};

type PdfPaneProps = {
  bookId: string;
  hasReference: boolean;
  onReference: (text: string) => void;
  onAdded: () => void; // a PDF was added: the page shows the PDF view
  onStatus: (message: string) => void;
  onText: (text: string | undefined) => void; // the whole PDF's text, for page links (R4)
  ref?: Ref<PdfPaneHandle>;
};

const IMPORT_ERRORS: Record<string, string> = {
  pdf_unreadable: "Couldn't read that PDF's text.",
  pdf_no_text: "This PDF has no text layer (a scan?), so the AI can't read it. You can still view it.",
};

export function PdfPane({ bookId, hasReference, onReference, onAdded, onStatus, onText, ref }: PdfPaneProps) {
  const [pdf, setPdf] = useState<StoredPdf>();
  const [loadedFor, setLoadedFor] = useState<string>(); // the book whose PDF `pdf` is
  const [offer, setOffer] = useState<string>(); // text waiting for "use as reference text?"
  const [range, setRange] = useState<Range>(); // D32 page picker
  const [isDragging, setIsDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const viewer = useRef<PdfViewerHandle>(null);
  const pendingPage = useRef<{ page: number; highlight?: string }>(undefined);
  const [ocr, setOcr] = useState<{ done: number; total: number }>(); // OCR progress, while it runs
  const wantsReference = useRef(false); // offer the PDF's text as reference text once it's read
  const ocrReport = useRef<string>(undefined); // D56: the last conversion's summary, shown once its text is in

  // Each book has its own PDF; switching books loads it (or finds none).
  useEffect(() => {
    let isCurrent = true;
    void loadPdf(bookId).then((saved) => {
      if (!isCurrent) return;
      setPdf(saved);
      setLoadedFor(bookId);
      setOffer(undefined);
      setRange(undefined);
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
    wantsReference.current = true; // the effect below reads its text, by OCR if it's a scan
    setPdf(stored);
    onAdded();
    onStatus(isSaved ? "Reading the PDF's text…" : "Showing the PDF, but the browser couldn't store it: it will be gone after a reload.");
  }

  // The PDF's text as the book's reference text: filled in, asked first, or a page picker (D32).
  // After a conversion, the message starts with how sure the reading was (D56).
  function offerReference(text: string) {
    const lead = ocrReport.current ? `${ocrReport.current} ` : "";
    ocrReport.current = undefined;
    if (text.length === 0) return onStatus(lead + IMPORT_ERRORS.pdf_no_text);
    if (isReferenceTooLong(text)) return askForPages(text, lead);
    if (hasReference) {
      setOffer(text);
      onStatus(lead.trim());
      return;
    }
    onReference(text);
    onStatus(`${lead}The PDF's text (~${estimateTokens(text).toLocaleString()} tokens) is now this book's reference text.`);
  }

  // D32: the PDF's text is over the cap; the reader picks the pages, prefilled with as many from
  // the start as fit.
  function askForPages(text: string, lead = "") {
    setOffer(undefined);
    setRange({ text, from: "1", to: String(fitPdfPages(text, 1)) });
    const tokens = Math.round(estimateTokens(text) / 1000);
    onStatus(`${lead}This PDF's text is ~${tokens}K tokens, over the ${REFERENCE_TOKEN_LIMIT / 1000}K limit: choose the pages the AI should read.`);
  }

  async function choosePages() {
    if (!pdf) return onStatus("Add the book's PDF first.");
    try {
      const { importPdf } = await import("@/lib/pdf-import.ts");
      askForPages(await importPdf(pdf.data));
    } catch {
      onStatus("Couldn't read that PDF's text.");
    }
  }

  useImperativeHandle(ref, () => ({
    pick: () => input.current?.click(),
    choosePages: () => void choosePages(),
    goTo: (page, highlight) => {
      if (viewer.current) return viewer.current.goTo(page, highlight);
      pendingPage.current = { page, highlight };
    },
    clearHighlight: () => {
      if (pendingPage.current) pendingPage.current = { page: pendingPage.current.page };
      viewer.current?.clearHighlight();
    },
    forget: (id) => void deletePdf(id),
  }));

  // A cite clicked before the viewer existed opens its page once it does.
  useEffect(() => {
    if (pdf && viewer.current && pendingPage.current) {
      viewer.current.goTo(pendingPage.current.page, pendingPage.current.highlight);
      pendingPage.current = undefined;
    }
  }, [pdf]);

  // Reading the PDF: its whole text (not just the pages chosen as reference text) is what page
  // links search. A PDF with scanned pages is read by OCR first (D55): the text PDF it makes
  // replaces the stored one, and this runs again on it. A PDF stored before D55 is converted the
  // first time it's opened. The latest callbacks are kept in a ref so new ones don't re-read the PDF.
  const latest = useRef({ onText, offerReference, onStatus });
  useEffect(() => {
    latest.current = { onText, offerReference, onStatus };
  });
  useEffect(() => {
    let isCurrent = true;
    const abort = new AbortController();
    latest.current.onText(undefined);
    if (!pdf || !loadedFor) return;
    const book = loadedFor; // the book this PDF belongs to, even if the reader switches mid-OCR
    void (async () => {
      const { readPdf } = await import("@/lib/pdf-import.ts");
      const { text, scanned } = await readPdf(pdf.data);
      if (!isCurrent) return;
      if (scanned.length > 0 && !pdf.isOcred) {
        latest.current.onStatus("");
        setOcr({ done: 0, total: scanned.length });
        const { ocrPdf } = await import("@/lib/pdf-ocr.ts");
        const { data, stats } = await ocrPdf(pdf.data, scanned, (done, total) => isCurrent && setOcr({ done, total }), abort.signal);
        if (!isCurrent) return;
        const searchable = { name: pdf.name, data, isOcred: true };
        await savePdf(book, searchable);
        if (!isCurrent) return;
        setOcr(undefined);
        ocrReport.current = ocrSummary(scanned.length, stats);
        wantsReference.current = true;
        setPdf(searchable);
        return;
      }
      latest.current.onText(text || undefined); // no text: references link by page only
      if (!wantsReference.current) return;
      wantsReference.current = false;
      latest.current.offerReference(text);
    })().catch((err: unknown) => {
      if (!isCurrent) return;
      setOcr(undefined);
      const code = err instanceof Error ? err.message : "";
      if (code === "pdf_unreadable" || wantsReference.current) latest.current.onStatus(IMPORT_ERRORS[code] ?? "Couldn't turn this scan into text.");
      wantsReference.current = false;
    });
    return () => {
      isCurrent = false;
      abort.abort();
      setOcr(undefined);
    };
  }, [pdf, loadedFor]);

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
      {range && (
        <PageRange
          range={range}
          onChange={setRange}
          onUse={(text) => {
            onReference(text);
            setRange(undefined);
            onStatus("Those pages are now this book's reference text.");
          }}
          onCancel={() => setRange(undefined)}
        />
      )}
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
      {ocr && (
        <div className="pdf-ocr" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p className="pdf-ocr-title">
            Reading the scanned pages… {Math.min(ocr.done + 1, ocr.total)} of {ocr.total}
          </p>
          <p className="pdf-ocr-hint">This PDF is pictures of pages. We&apos;re turning them into text so you can search and quote it.</p>
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

// D56: what a conversion tells the reader, e.g. "Read 4,113 words from 13 scanned pages: fixed 3
// likely misreads; 12 words are uncertain, so check quotes against the page."
function ocrSummary(pageCount: number, { words, fixed, uncertain }: OcrStats): string {
  const pages = `${pageCount} scanned page${pageCount === 1 ? "" : "s"}`;
  const fixes = fixed > 0 ? `fixed ${fixed} likely misread${fixed === 1 ? "" : "s"}; ` : "";
  const doubt = uncertain > 0 ? `${uncertain} word${uncertain === 1 ? " is" : "s are"} uncertain, so check quotes against the page.` : "every word was read clearly.";
  return `Read ${words.toLocaleString()} words from ${pages}: ${fixes}${doubt}`;
}

// "Use PDF pages [from] to [to] of N": the estimate updates as the numbers change, and Use waits
// until the pages fit the cap.
type Range = { text: string; from: string; to: string };
type PageRangeProps = { range: Range; onChange: (range: Range) => void; onUse: (text: string) => void; onCancel: () => void };

function PageRange({ range, onChange, onUse, onCancel }: PageRangeProps) {
  const last = pdfPageCount(range.text);
  const from = Number.parseInt(range.from, 10);
  const to = Number.parseInt(range.to, 10);
  const isValid = from >= 1 && to >= from && to <= last;
  const slice = isValid ? slicePdfPages(range.text, from, to) : "";
  const tokens = estimateTokens(slice);
  const fits = isValid && slice !== "" && tokens <= REFERENCE_TOKEN_LIMIT;
  const note = !isValid ? `Pages 1 to ${last}.` : `~${Math.round(tokens / 1000)}K of ${REFERENCE_TOKEN_LIMIT / 1000}K tokens${fits ? "" : ": too many pages"}`;
  return (
    <div className="pdf-offer pdf-range" role="group" aria-label="Choose PDF pages">
      <span>Use PDF pages</span>
      <input aria-label="First page" inputMode="numeric" value={range.from} onChange={(e) => onChange({ ...range, from: e.target.value })} />
      <span>to</span>
      <input aria-label="Last page" inputMode="numeric" value={range.to} onChange={(e) => onChange({ ...range, to: e.target.value })} />
      <span>of {last} as the reference text</span>
      <span className={fits ? "range-note" : "range-note warning"}>{note}</span>
      <button type="button" disabled={!fits} onClick={() => onUse(slice)}>
        Use these pages
      </button>
      <button type="button" className="quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
