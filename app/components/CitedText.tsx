"use client";

import { createContext, useContext, type ReactNode } from "react";
import { findPageRefs, type PageRef } from "@/core/page-links.ts";
import { citedPage } from "@/core/passage.ts";

// AI text with its page cites as small links (D38): "[p. 12]" shows as "p. 12", and a click opens
// the PDF there with the quote before it selected, matched the way the notes' page references are
// (D33). Older replies' labelled paragraph cites ("[¶2 · p. 1]") still open their page as given.
export type CiteOpener = {
  hasPdf: boolean;
  openCite: (refs: PageRef[], index: number) => void; // refs: every cite in that piece of text
  openPage: (page: number) => void;
};
export const OpenPageContext = createContext<CiteOpener | undefined>(undefined);

export function CitedText({ text }: { text: string }) {
  const opener = useContext(OpenPageContext);
  if (!opener) return text;
  // Odd parts are older paragraph cites; the rest may hold page cites.
  return text.split(/(\[¶[^\]]*\])/).map((part, i) => {
    if (i % 2 === 0) return <PageCites key={i} text={part} opener={opener} />;
    const page = citedPage(part);
    if (page === undefined) return part;
    return (
      <button key={i} type="button" className="cite-link" title={`Open the PDF at page ${page}`} onClick={() => opener.openPage(page)}>
        {part}
      </button>
    );
  });
}

function PageCites({ text, opener }: { text: string; opener: CiteOpener }) {
  const refs = findPageRefs(text);
  const parts: ReactNode[] = [];
  let from = 0;
  refs.forEach((ref, index) => {
    parts.push(text.slice(from, ref.start));
    const written = text.slice(ref.start, ref.end);
    const isBracketed = written.startsWith("[");
    const label = isBracketed ? written.slice(1, -1).replace(/^PDF\s+/i, "") : written;
    parts.push(
      opener.hasPdf ? (
        <button key={index} type="button" className={isBracketed ? "page-cite" : "cite-link"} title="Show this passage in the PDF" onClick={() => opener.openCite(refs, index)}>
          {label}
        </button>
      ) : (
        <span key={index} className={isBracketed ? "page-cite" : undefined}>{label}</span>
      ),
    );
    from = ref.end;
  });
  parts.push(text.slice(from));
  return parts;
}
