"use client";

export type DownloadRecord = {
  storyId: string;
  title: string;
  chapterId: string;
  chapterName?: string;
  pages: number;
  pageUrls: string[];
  estimatedBytes: number;
  savedAt: string;
  status: "ready" | "partial";
  pinned: boolean;
};

const DB_NAME = "muc-reader";
const DB_VERSION = 2;
const DOWNLOAD_STORE = "downloads";
const PROGRESS_STORE = "progressQueue";
const CHAPTER_CACHE = "muc-chapters-v1";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOWNLOAD_STORE)) db.createObjectStore(DOWNLOAD_STORE, { keyPath: "chapterId" });
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) db.createObjectStore(PROGRESS_STORE, { keyPath: "storyId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withNamedStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return withNamedStore(DOWNLOAD_STORE, mode, action);
}

export async function listDownloads() {
  const records = await withStore<DownloadRecord[]>("readonly", (store) => store.getAll());
  return records.sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
}

export async function storageEstimate() {
  const estimate = await navigator.storage?.estimate?.();
  return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 };
}

export async function saveChapterOffline(record: Omit<DownloadRecord, "savedAt" | "status" | "pinned">) {
  if (!("caches" in window) || !("indexedDB" in window)) throw new Error("OFFLINE_UNAVAILABLE");
  const estimate = await storageEstimate();
  if (estimate.quota && estimate.usage + record.estimatedBytes > estimate.quota * 0.9) throw new Error("STORAGE_QUOTA_LOW");
  const cache = await caches.open(CHAPTER_CACHE);
  const cached: string[] = [];
  try {
    for (const url of record.pageUrls) {
      if (!(await cache.match(url))) {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok) throw new Error(`PAGE_${response.status}`);
        await cache.put(url, response);
      }
      cached.push(url);
    }
    const complete: DownloadRecord = { ...record, savedAt: new Date().toISOString(), status: "ready", pinned: true };
    await withStore("readwrite", (store) => store.put(complete));
    return complete;
  } catch (error) {
    await Promise.all(cached.map((url) => cache.delete(url)));
    throw error;
  }
}

export async function removeChapterOffline(record: DownloadRecord) {
  const cache = await caches.open(CHAPTER_CACHE);
  await Promise.all(record.pageUrls.map((url) => cache.delete(url)));
  await withStore("readwrite", (store) => store.delete(record.chapterId));
}

export async function migrateLegacyDownloads() {
  const raw = localStorage.getItem("muc:downloads");
  if (!raw) return;
  try {
    const legacy = JSON.parse(raw) as Array<Partial<DownloadRecord>>;
    for (const item of legacy) {
      if (!item.chapterId || !item.storyId || !item.title) continue;
      const { chapterId, storyId, title } = item;
      const existing = await withStore<DownloadRecord | undefined>("readonly", (store) => store.get(chapterId));
      if (existing) continue;
      const response = await fetch(`/api/download-manifest/${chapterId}`);
      if (!response.ok) continue;
      const manifest = await response.json() as { pages: string[]; estimatedBytes: number };
      await withStore("readwrite", (store) => store.put({
        storyId,
        title,
        chapterId,
        chapterName: item.chapterName,
        pages: manifest.pages.length,
        pageUrls: manifest.pages,
        estimatedBytes: manifest.estimatedBytes,
        savedAt: item.savedAt ?? new Date().toISOString(),
        status: "ready",
        pinned: true,
      } satisfies DownloadRecord));
    }
    localStorage.removeItem("muc:downloads");
  } catch { /* legacy metadata is best effort */ }
}

export type QueuedProgress = {
  storyId: string;
  chapterId: string;
  page: number;
  progress: number;
  idempotencyKey: string;
  updatedAt: string;
};

let progressSyncDisabled = false;
let nextProgressFlushAt = 0;
let progressFlushInFlight: Promise<void> | null = null;
let pendingProgress: Omit<QueuedProgress, "updatedAt"> | null = null;
let progressDebounce: ReturnType<typeof setTimeout> | null = null;

export async function flushProgressQueue() {
  if (progressSyncDisabled || Date.now() < nextProgressFlushAt) return;
  if (progressFlushInFlight) return progressFlushInFlight;
  progressFlushInFlight = (async () => {
    const queued = await withNamedStore<QueuedProgress[]>(PROGRESS_STORE, "readonly", (store) => store.getAll());
    for (const item of queued) {
      try {
        const response = await fetch("/api/progress", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(item) });
        if (response.ok || response.status === 400) {
          await withNamedStore(PROGRESS_STORE, "readwrite", (store) => store.delete(item.storyId));
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          progressSyncDisabled = true;
          await withNamedStore(PROGRESS_STORE, "readwrite", (store) => store.delete(item.storyId));
          break;
        }
        nextProgressFlushAt = Date.now() + 60_000;
        break;
      } catch {
        nextProgressFlushAt = Date.now() + 60_000;
        break;
      }
    }
  })().finally(() => { progressFlushInFlight = null; });
  return progressFlushInFlight;
}

export async function queueProgress(item: Omit<QueuedProgress, "updatedAt">) {
  if (progressSyncDisabled) return;
  pendingProgress = item;
  if (progressDebounce) clearTimeout(progressDebounce);
  progressDebounce = setTimeout(() => {
    const pending = pendingProgress;
    pendingProgress = null;
    progressDebounce = null;
    if (!pending || progressSyncDisabled) return;
    void (async () => {
      await withNamedStore(PROGRESS_STORE, "readwrite", (store) => store.put({ ...pending, updatedAt: new Date().toISOString() } satisfies QueuedProgress));
      if (navigator.onLine) void flushProgressQueue();
      if (progressSyncDisabled) return;
      const registration = await navigator.serviceWorker?.ready.catch(() => null);
      const sync = (registration as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | null)?.sync;
      if (sync) await sync.register("muc-progress").catch(() => undefined);
    })();
  }, 700);
}
