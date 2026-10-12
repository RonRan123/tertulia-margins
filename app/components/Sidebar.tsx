"use client";

import type { Ref } from "react";
import { ReferenceText, type ReferenceTextHandle } from "./ReferenceText";

// The left 1/6 (D22): books as folders. Until R2 there is one book, holding its reference text
// (with the PDF import inside that dialog) and the export of its notes (D26: the book's actions
// live with the book). `id` lets the header's toggle point at it (aria-controls).
type SidebarProps = {
  id: string;
  reference: string;
  onReferenceChange: (value: string) => void;
  referenceRef: Ref<ReferenceTextHandle>;
  canExport: boolean;
  onExport: () => void;
  onClose: () => void;
};

export function Sidebar({ id, reference, onReferenceChange, referenceRef, canExport, onExport, onClose }: SidebarProps) {
  return (
    <nav id={id} className="sidebar" aria-label="Books">
      <div className="sidebar-header">
        <h1>tertulia</h1>
        <button type="button" className="quiet icon" aria-label="Close sidebar" title="Close sidebar" onClick={onClose}>
          «
        </button>
      </div>
      <ul className="books">
        <li className="book is-current" aria-current="true">
          <span className="book-title">Current book</span>
          <ReferenceText ref={referenceRef} value={reference} onChange={onReferenceChange} />
          <button
            type="button"
            className="book-action"
            disabled={!canExport}
            title={canExport ? undefined : "Nothing to export yet"}
            onClick={onExport}
          >
            Export notes (.md)
          </button>
        </li>
      </ul>
    </nav>
  );
}
