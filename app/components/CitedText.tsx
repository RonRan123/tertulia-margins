"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { findPageRefs, LINK_METHODS, pageLabel, pillName, type PageLink, type PageRef } from "@/core/page-links.ts";
import { citedPage } from "@/core/passage.ts";

// AI text with its page cites as pills (D38, D45): "[p. 12]" shows as "↗ p. 12", coloured by how
// it matched the PDF, the way the notes' page references are (D33). The cites are matched once per
// text, together, so their exact hits teach the page offset; a click opens the PDF there with the
// passage selected. Without a PDF they are gray and don't open. Older replies' labelled paragraph
// cites ("[¶2 · p. 1]") still open their page as given.
export type CiteOpener = {
  hasPdf: boolean;
  linkCites: (refs: PageRef[]) => PageLink[]; // refs: every cite in that piece of text
  openLink: (link: PageLink) => void;
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
  const { hasPdf, linkCites } = opener;
  const links = useMemo(() => {
    const refs = findPageRefs(text);
    return hasPdf ? linkCites(refs) : refs.map((ref): PageLink => ({ ...ref, pdfPage: ref.page, method: "page" }));
  }, [text, hasPdf, linkCites]);
  const parts: ReactNode[] = [];
  let from = 0;
  links.forEach((link, index) => {
    parts.push(text.slice(from, link.start));
    const page = pageLabel(text.slice(link.start, link.end));
    const label = `↗ ${page}`;
    parts.push(
      hasPdf ? (
        <button
          key={index}
          type="button"
          className={`cite-pill is-${link.method}`}
          title={`${LINK_METHODS[link.method]}: PDF page ${link.pdfPage}. Click to open.`}
          aria-label={pillName(page, link.method)}
          onClick={() => opener.openLink(link)}
        >
          {label}
        </button>
      ) : (
        <span key={index} className="cite-pill is-page">{label}</span>
      ),
    );
    from = link.end;
  });
  parts.push(text.slice(from));
  return parts;
}
