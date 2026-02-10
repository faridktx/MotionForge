const DB_NAME = "motionforge-project-payloads";
const DB_VERSION = 1;
const STORE_NAME = "payloads";

export const AUTOSAVE_SLOT_ID = "__autosave__";

export interface StoredPayloadRecord {
  id: string;
  json: string;
  updatedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: unknown) => void) => void,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        run(store, resolve, reject);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      }),
  );
}

export async function savePayloadToIndexedDb(id: string, json: string): Promise<void> {
  const record: StoredPayloadRecord = {
    id,
    json,
    updatedAt: new Date().toISOString(),
  };
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to save payload"));
  });
}

export async function loadPayloadFromIndexedDb(id: string): Promise<string | null> {
  return withStore<string | null>("readonly", (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as StoredPayloadRecord | undefined;
      resolve(record?.json ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to load payload"));
  });
}

export async function deletePayloadFromIndexedDb(id: string): Promise<void> {
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete payload"));
  });
}

