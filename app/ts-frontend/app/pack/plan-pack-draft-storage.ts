"use client";

const DB_NAME = "treeschool-plan-pack-drafts";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

export type StoredPlanPackFile = {
  subjectId?: number;
  subjectIndex: number;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  file: File;
};

export type StoredPlanPackDraft = {
  key: string;
  createdAt: string;
  files: StoredPlanPackFile[];
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
) {
  const db = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = callback(store);

      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Browser storage request failed."));
      } else {
        tx.oncomplete = () => resolve(undefined);
      }

      tx.onerror = () => reject(tx.error ?? new Error("Browser storage transaction failed."));
    });
  } finally {
    db.close();
  }
}

export async function saveStoredPlanPackDraft(draft: StoredPlanPackDraft) {
  await withStore("readwrite", (store) => {
    store.put(draft);
  });
}

export async function getStoredPlanPackDraft(key: string) {
  return (await withStore("readonly", (store) => store.get(key))) as StoredPlanPackDraft | undefined;
}

export async function deleteStoredPlanPackDraft(key: string) {
  await withStore("readwrite", (store) => {
    store.delete(key);
  });
}
