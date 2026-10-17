"use client";

import { useState, type Ref } from "react";
import type { BookMeta } from "@/core/store.ts";
import { escapeTo } from "./Chat";
import { ReferenceText, type ReferenceTextHandle } from "./ReferenceText";

// The left 1/6 (D22): books as folders (D31). Each book is a title; the open one also shows its
// actions: reference text (with the PDF import inside that dialog) and export (D26: a book's
// actions live with the book). `id` lets the header's toggle point at it (aria-controls).
export type BookActions = {
  open: (id: string) => void;
  // These return an error message to show, or undefined when done.
  create: (title: string) => string | undefined;
  rename: (id: string, title: string) => string | undefined;
  remove: (id: string) => string | undefined;
};

type SidebarProps = {
  id: string;
  books: BookMeta[];
  currentId: string;
  isBusy: boolean; // a reply is streaming: switching or deleting would send it to the wrong book
  actions: BookActions;
  reference: string;
  onReferenceChange: (value: string) => void;
  referenceRef: Ref<ReferenceTextHandle>;
  onAddPdf: () => void;
  onChoosePages: () => void;
  canExport: boolean;
  onExport: () => void;
};

const BUSY_TITLE = "Wait for the current reply to finish";

export function Sidebar({ id, books, currentId, isBusy, actions, reference, onReferenceChange, referenceRef, onAddPdf, onChoosePages, canExport, onExport }: SidebarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [renaming, setRenaming] = useState<string>(); // id of the book whose title is being edited
  const [confirmingDelete, setConfirmingDelete] = useState<string>();
  const [error, setError] = useState("");

  // Runs a book action; keeps the editor open with the message if it was refused.
  const attempt = (run: () => string | undefined, close: () => void) => {
    const refused = run();
    setError(refused ?? "");
    if (!refused) close();
  };

  return (
    <nav id={id} className="sidebar" aria-label="Books">
      {isAdding ? (
        <TitleInput
          label="New book title"
          placeholder="Book title"
          onSubmit={(title) => attempt(() => actions.create(title), () => setIsAdding(false))}
          onCancel={() => {
            setIsAdding(false);
            setError("");
          }}
        />
      ) : (
        <button
          type="button"
          className="new-book"
          disabled={isBusy}
          title={isBusy ? BUSY_TITLE : undefined}
          onClick={() => {
            setIsAdding(true);
            setError("");
          }}
        >
          + New book
        </button>
      )}
      {error && <p className="warning sidebar-error">{error}</p>}
      <ul className="books">
        {books.map((book) => {
          const isCurrent = book.id === currentId;
          return (
            <li key={book.id} className={isCurrent ? "book is-current" : "book"} aria-current={isCurrent || undefined}>
              {renaming === book.id ? (
                <TitleInput
                  label={`Rename ${book.title}`}
                  initial={book.title}
                  onSubmit={(title) => attempt(() => actions.rename(book.id, title), () => setRenaming(undefined))}
                  onCancel={() => {
                    setRenaming(undefined);
                    setError("");
                  }}
                />
              ) : (
                <div className="book-row">
                  <button
                    type="button"
                    className="book-title"
                    disabled={isBusy && !isCurrent}
                    title={isBusy && !isCurrent ? BUSY_TITLE : isCurrent ? "Double-click to rename" : undefined}
                    onClick={() => !isCurrent && actions.open(book.id)}
                    onDoubleClick={() => isCurrent && setRenaming(book.id)}
                  >
                    {book.title}
                  </button>
                  <span className="book-tools">
                    <button type="button" className="quiet icon" aria-label={`Rename ${book.title}`} title="Rename" onClick={() => setRenaming(book.id)}>
                      ✎
                    </button>
                    <button
                      type="button"
                      className="quiet icon"
                      aria-label={`Delete ${book.title}`}
                      title={isBusy ? BUSY_TITLE : books.length <= 1 ? "The last book can't be deleted" : "Delete"}
                      disabled={isBusy || books.length <= 1}
                      onClick={() => setConfirmingDelete(book.id)}
                    >
                      ×
                    </button>
                  </span>
                </div>
              )}
              {confirmingDelete === book.id && (
                <span className="confirm" onKeyDown={(e) => escapeTo(e, () => setConfirmingDelete(undefined))}>
                  Delete its notes, chat and margin?{" "}
                  <button
                    type="button"
                    onClick={() => attempt(() => actions.remove(book.id), () => setConfirmingDelete(undefined))}
                  >
                    Delete
                  </button>{" "}
                  <button type="button" autoFocus onClick={() => setConfirmingDelete(undefined)}>
                    Keep
                  </button>
                </span>
              )}
              {isCurrent && (
                <div className="book-actions">
                  <button type="button" className="book-action" onClick={onAddPdf}>
                    Add or replace PDF
                  </button>
                  <button type="button" className="book-action" onClick={onChoosePages}>
                    Choose PDF pages
                  </button>
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
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// A one-line title editor: Enter saves, Esc cancels.
function TitleInput({ label, placeholder, initial = "", onSubmit, onCancel }: {
  label: string;
  placeholder?: string;
  initial?: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="title-input"
      aria-label={label}
      placeholder={placeholder}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") onSubmit(value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onCancel}
    />
  );
}
