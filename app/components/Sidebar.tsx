"use client";

import type { Ref } from "react";
import { ReferenceText, type ReferenceTextHandle } from "./ReferenceText";

// The left 1/6 (D22): books as folders. Until R2 there is one book, holding its reference text
// (and the PDF import inside that dialog). `id` lets the header's toggle point at it (aria-controls).
type SidebarProps = {
  id: string;
  reference: string;
  onReferenceChange: (value: string) => void;
  referenceRef: Ref<ReferenceTextHandle>;
  onClose: () => void;
};

export function Sidebar({ id, reference, onReferenceChange, referenceRef, onClose }: SidebarProps) {
  return (
    <nav id={id} className="sidebar" aria-label="Books">
      <div className="sidebar-header">
        <h1>tertulia-margins</h1>
        <button type="button" className="icon" aria-label="Close sidebar" title="Close sidebar" onClick={onClose}>
          «
        </button>
      </div>
      <h2>Books</h2>
      <ul className="books">
        <li className="book is-current" aria-current="true">
          <span className="book-title">Current book</span>
          <ReferenceText ref={referenceRef} value={reference} onChange={onReferenceChange} />
        </li>
      </ul>
    </nav>
  );
}
