"use client";

import { createContext, useContext } from "react";
import { citedPage } from "@/core/passage.ts";

// AI text with its labelled cites ("[¶2 · p. 1]") as links that open the PDF at that page (D23,
// D29: the page as given). The page provides the opener; cites without a page stay plain text.
export const OpenPageContext = createContext<((page: number) => void) | undefined>(undefined);

export function CitedText({ text }: { text: string }) {
  const openPage = useContext(OpenPageContext);
  if (!openPage) return text;
  return text.split(/(\[¶[^\]]*\])/).map((part, i) => {
    const page = i % 2 === 1 ? citedPage(part) : undefined;
    if (page === undefined) return part;
    return (
      <button key={i} type="button" className="cite-link" title={`Open the PDF at page ${page}`} onClick={() => openPage(page)}>
        {part}
      </button>
    );
  });
}
