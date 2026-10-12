"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { StoredPdf } from "@/lib/pdf-store.ts";
import { openPdf } from "@/lib/pdf-import.ts";
import { DownloadIcon, MinusIcon, PlusIcon, ResetZoomIcon, SearchIcon } from "./icons";

// The book's PDF (D29): pdfjs's own viewer (pages, selectable text, search highlights) under a
// floating toolbar like ChatPDF's: zoom out, fit width, zoom in, "N of M", download, search.
// The PDF is read from the reader's browser (lib/pdf-store) and never uploaded anywhere.
// goTo's `highlight`: words to find and select on that page (a page link's quote, R4).
export type PdfViewerHandle = { goTo: (page: number, highlight?: string) => void };

type Matches = { current: number; total: number };

export function PdfViewer({ pdf, ref }: { pdf: StoredPdf; ref?: Ref<PdfViewerHandle> }) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<PDFViewer>(null);
  const bus = useRef<EventBus>(null);
  const pendingPage = useRef<number>(undefined); // asked for before the pages were ready
  const pendingHighlight = useRef<string>(undefined);
  const isFitted = useRef(false); // fit to width once, when first shown
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState("1");
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Matches>();
  const [error, setError] = useState("");

  const find = (text: string, type: "" | "again", findPrevious = false, highlightAll = true) =>
    bus.current?.dispatch("find", {
      source: null,
      type,
      query: text,
      caseSensitive: false,
      entireWord: false,
      highlightAll,
      findPrevious,
      matchDiacritics: false,
    });

  // A page asked for while the PDF is loading or hidden (another view) waits: pdfjs can't scroll a
  // hidden view, and re-fitting the width when it reappears would undo the jump.
  const jumpIfPending = () => {
    const pages = viewer.current ?? undefined;
    const isReady = pages !== undefined && pages.pagesCount > 0 && container.current?.offsetParent != null;
    if (!isReady || pendingPage.current === undefined) return;
    const pageNumber = Math.min(Math.max(1, pendingPage.current), pages.pagesCount);
    pendingPage.current = undefined;
    pages.scrollPageIntoView({ pageNumber });
    // Find searches from the current page, which pdfjs updates once the scroll lands.
    const highlight = pendingHighlight.current;
    pendingHighlight.current = undefined;
    if (highlight) setTimeout(() => find(highlight, "", false, false), 100);
  };
  // The loading effect below runs once per PDF but should jump with the latest state.
  const onPagesReady = useEffectEvent(() => jumpIfPending());

  // One viewer per PDF. pdf_viewer.mjs reads pdfjs from globalThis, so it's imported after it.
  useEffect(() => {
    let isCancelled = false;
    let destroy = () => {};
    void (async () => {
      const { pdfjs, task: loading, close } = await openPdf(pdf.data);
      destroy = () => void close();
      if (isCancelled) return destroy();
      (globalThis as { pdfjsLib?: unknown }).pdfjsLib = pdfjs;
      const { EventBus, PDFFindController, PDFLinkService, PDFViewer } = await import("pdfjs-dist/web/pdf_viewer.mjs");
      if (isCancelled || !container.current) return;
      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const findController = new PDFFindController({ eventBus, linkService });
      const pages = new PDFViewer({ container: container.current, eventBus, linkService, findController });
      linkService.setViewer(pages);
      // Loaded while hidden (another view): the resize observer fits it once it's shown.
      eventBus.on("pagesinit", () => {
        if (container.current?.offsetParent == null) return;
        pages.currentScaleValue = "page-width";
        isFitted.current = true;
        onPagesReady();
      });
      eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
        setPage(pageNumber);
        setPageDraft(String(pageNumber));
      });
      const onMatches = ({ matchesCount }: { matchesCount: Matches }) => setMatches(matchesCount);
      eventBus.on("updatefindmatchescount", onMatches);
      eventBus.on("updatefindcontrolstate", onMatches);
      try {
        const doc = await loading.promise;
        if (isCancelled) return;
        pages.setDocument(doc);
        linkService.setDocument(doc);
        viewer.current = pages;
        bus.current = eventBus;
        setPageCount(doc.numPages);
      } catch {
        if (!isCancelled) setError("Couldn't open this PDF.");
      }
    })();
    return () => {
      isCancelled = true;
      isFitted.current = false;
      viewer.current = null;
      bus.current = null;
      destroy();
    };
  }, [pdf]);

  const goTo = (n: number, highlight?: string) => {
    pendingPage.current = n;
    pendingHighlight.current = highlight;
    jumpIfPending();
  };

  // Fit width follows the pane's width (switching views resizes it); then any waiting page opens.
  useEffect(() => {
    const box = container.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const pages = viewer.current;
      const isShown = box.offsetParent !== null; // hidden views have nothing to fit or scroll
      if (!pages || !isShown) return;
      const isFitWidth = pages.currentScaleValue === "page-width" || !isFitted.current; // a manual zoom stays
      if (isFitWidth && pages.pagesCount > 0) {
        pages.currentScaleValue = "page-width";
        isFitted.current = true;
      }
      jumpIfPending();
    });
    observer.observe(box);
    return () => observer.disconnect();
  });
  useImperativeHandle(ref, () => ({ goTo }));

  const closeSearch = () => {
    setIsSearching(false);
    setQuery("");
    setMatches(undefined);
    bus.current?.dispatch("findbarclose", { source: null });
  };

  const download = () => {
    const url = URL.createObjectURL(pdf.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = pdf.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url));
  };

  const commitPage = () => {
    const n = Number.parseInt(pageDraft, 10);
    if (Number.isNaN(n)) return setPageDraft(String(page));
    goTo(n);
  };

  return (
    <div className="pdf-viewer">
      {/* pdfjs needs an absolutely positioned scroll container whose first child is the viewer. */}
      <div className="pdf-scroll" ref={container} tabIndex={0} aria-label={`PDF: ${pdf.name}`}>
        <div className="pdfViewer" />
      </div>
      {error && <p className="warning pdf-error">{error}</p>}
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF controls">
        <button type="button" className="quiet icon" aria-label="Zoom out" title="Zoom out" onClick={() => viewer.current?.decreaseScale()}>
          <MinusIcon />
        </button>
        <button
          type="button"
          className="quiet icon"
          aria-label="Fit width"
          title="Fit width"
          onClick={() => viewer.current && (viewer.current.currentScaleValue = "page-width")}
        >
          <ResetZoomIcon />
        </button>
        <button type="button" className="quiet icon" aria-label="Zoom in" title="Zoom in" onClick={() => viewer.current?.increaseScale()}>
          <PlusIcon />
        </button>
        <span className="pdf-divider" aria-hidden="true" />
        <input
          className="pdf-page"
          aria-label="Page number"
          inputMode="numeric"
          value={pageDraft}
          onChange={(e) => setPageDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === "Enter" && commitPage()}
          onBlur={commitPage}
        />
        <span className="pdf-count">of {pageCount || "…"}</span>
        <span className="pdf-divider" aria-hidden="true" />
        <button type="button" className="quiet icon" aria-label="Download PDF" title="Download" onClick={download}>
          <DownloadIcon />
        </button>
        {isSearching ? (
          <span className="pdf-search">
            <input
              autoFocus
              aria-label="Search the PDF"
              placeholder="Search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                find(e.target.value, "");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") find(query, "again", e.shiftKey);
                if (e.key === "Escape") closeSearch();
              }}
            />
            <span className="pdf-matches" aria-live="polite">
              {query && matches ? (matches.total ? `${matches.current} / ${matches.total}` : "No matches") : ""}
            </span>
            <button type="button" className="quiet icon" aria-label="Close search" onClick={closeSearch}>
              ×
            </button>
          </span>
        ) : (
          <button type="button" className="quiet icon" aria-label="Search the PDF" title="Search" onClick={() => setIsSearching(true)}>
            <SearchIcon />
          </button>
        )}
      </div>
    </div>
  );
}
