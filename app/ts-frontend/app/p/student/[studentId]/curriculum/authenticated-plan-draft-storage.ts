"use client";

const DB_NAME = "treeschool-authenticated-plan-drafts";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

export type StoredAuthenticatedPlanFile = {
  subjectId: number;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  file: File;
};

export type StoredAuthenticatedPlanFiles = {
  key: string;
  updatedAt: string;
  files: StoredAuthenticatedPlanFile[];
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser draft storage."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
) {
  const database = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = callback(store);

      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Browser draft storage failed."));
      } else {
        transaction.oncomplete = () => resolve(undefined);
      }
      transaction.onerror = () => reject(transaction.error ?? new Error("Browser draft storage failed."));
    });
  } finally {
    database.close();
  }
}

export async function getStoredAuthenticatedPlanFiles(key: string) {
  return (await withStore("readonly", (store) => store.get(key))) as StoredAuthenticatedPlanFiles | undefined;
}

export async function saveStoredAuthenticatedPlanFiles(draft: StoredAuthenticatedPlanFiles) {
  await withStore("readwrite", (store) => {
    store.put(draft);
  });
}

export async function deleteStoredAuthenticatedPlanFiles(key: string) {
  await withStore("readwrite", (store) => {
    store.delete(key);
  });
}
