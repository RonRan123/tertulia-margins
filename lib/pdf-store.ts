// Browser-only: each book's PDF (D23, D31) in IndexedDB, keyed by book id. localStorage holds ~5 MB,
// too little for books, so PDFs live here while notes stay in core/store. The PDF never leaves the
// reader's browser (D9). Every call resolves (never rejects): a failure reads as "no PDF".

export type StoredPdf = { name: string; data: Blob };

const DB = "tertulia-margins";
const STORE = "pdfs";

function open(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined); // blocked storage (private mode)
    }
  });
}

// One request in its own transaction; resolves with its result, or undefined on any failure.
async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = act(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  }).finally(() => db.close()) as Promise<T | undefined>;
}

export async function loadPdf(bookId: string): Promise<StoredPdf | undefined> {
  const saved = await run<unknown>("readonly", (store) => store.get(bookId));
  const isPdf = typeof saved === "object" && saved !== null && "data" in saved && saved.data instanceof Blob;
  return isPdf ? (saved as StoredPdf) : undefined;
}

// False when it couldn't be stored (quota, blocked storage).
export async function savePdf(bookId: string, pdf: StoredPdf): Promise<boolean> {
  return (await run("readwrite", (store) => store.put(pdf, bookId))) !== undefined;
}

export async function deletePdf(bookId: string): Promise<void> {
  await run("readwrite", (store) => store.delete(bookId));
}
