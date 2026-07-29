"use client";

export type DownloadRecord = {
  storyId: string;
  title: string;
  coverUrl?: string | null;
  chapterId: string;
  chapterName?: string;
  pages: number;
  pageUrls: string[];
  estimatedBytes: number;
  manifestVersion: string;
  savedAt: string;
  status: "ready" | "partial";
  pinned: boolean;
};

export type NovelDownloadRecord = {
  medium: "novel";
  storyId: string;
  slug: string;
  title: string;
  author?: string;
  chapterId: string;
  chapterLabel: string;
  paragraphs: string[];
  sourceUrl: string;
  savedAt: string;
  estimatedBytes: number;
};

const DB_NAME = "muc-reader";
const DB_VERSION = 4;
const DOWNLOAD_STORE = "downloads";
const NOVEL_DOWNLOAD_STORE = "novelDownloads";
const PROGRESS_STORE = "progressQueue";
export const CHAPTER_CACHE = "muc-chapters-v3";
export const READING_CACHE = "muc-reading-v1";

export type ChapterPreloadProgress = {
  loaded: number;
  total: number;
  failed: number;
};

type ChapterPreloadOptions = {
  signal?: AbortSignal;
  concurrency?: number;
  onProgress?: (progress: ChapterPreloadProgress) => void;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOWNLOAD_STORE)) db.createObjectStore(DOWNLOAD_STORE, { keyPath: "chapterId" });
      if (!db.objectStoreNames.contains(NOVEL_DOWNLOAD_STORE)) db.createObjectStore(NOVEL_DOWNLOAD_STORE, { keyPath: "chapterId" });
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
  if (!("caches" in globalThis)) return records;
  const cache = await caches.open(CHAPTER_CACHE);
  const legacyCache = await caches.open("muc-chapters-v1");
  const validated = await Promise.all(records.map(async (record) => {
    const pageUrls = Array.isArray(record.pageUrls) ? record.pageUrls : [];
    for (const url of pageUrls) {
      if (await cache.match(url)) continue;
      const legacy = await legacyCache.match(url);
      if (legacy) await cache.put(url, legacy);
    }
    const cached = await Promise.all(pageUrls.map((url) => cache.match(url)));
    const ready = pageUrls.length > 0 && cached.every(Boolean);
    const next = {
      ...record,
      manifestVersion: record.manifestVersion ?? `legacy-${record.chapterId}`,
      status: ready ? "ready" : "partial",
    } satisfies DownloadRecord;
    if (next.status === record.status && next.manifestVersion === record.manifestVersion) return record;
    await withStore("readwrite", (store) => store.put(next));
    return next;
  }));
  return validated.sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
}

export async function getDownload(chapterId: string) {
  return await withStore<DownloadRecord | undefined>("readonly", (store) => store.get(chapterId));
}

export async function storageEstimate() {
  const estimate = await navigator.storage?.estimate?.();
  return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 };
}

async function fetchCacheablePage(url: string, signal?: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { mode: "cors", cache: "force-cache", signal });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
  }
  try {
    return await fetch(url, { mode: "no-cors", cache: "force-cache", signal });
  } catch (error) {
    throw lastError ?? error;
  }
}

export function recommendedChapterPreloadConcurrency() {
  if (typeof navigator === "undefined") return 4;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
    deviceMemory?: number;
  }).connection;
  if (
    connection?.saveData
    || connection?.effectiveType === "slow-2g"
    || connection?.effectiveType === "2g"
  ) return 2;
  if (connection?.effectiveType === "3g") return 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const processors = navigator.hardwareConcurrency || 4;
  return memory >= 6 && processors >= 6 && (connection?.downlink ?? 10) >= 8 ? 8 : 6;
}

export async function preloadChapterPages(
  pageUrls: string[],
  { signal, concurrency = 3, onProgress }: ChapterPreloadOptions = {},
) {
  const urls = [...new Set(pageUrls.filter(Boolean))];
  const progress: ChapterPreloadProgress = { loaded: 0, total: urls.length, failed: 0 };
  onProgress?.({ ...progress });
  if (!urls.length || !("caches" in globalThis)) return progress;

  const [readingCache, pinnedCache] = await Promise.all([
    caches.open(READING_CACHE),
    caches.open(CHAPTER_CACHE),
  ]);
  let cursor = 0;
  const workerCount = Math.min(Math.max(Math.floor(concurrency) || 1, 1), 8, urls.length);

  async function loadNext() {
    while (!signal?.aborted) {
      const index = cursor;
      cursor += 1;
      if (index >= urls.length) return;
      const url = urls[index];
      try {
        const cached = (await pinnedCache.match(url)) ?? (await readingCache.match(url));
        if (!cached) {
          const response = await fetchCacheablePage(url, signal);
          if (!response.ok && response.type !== "opaque") throw new Error(`PAGE_${response.status}`);
          if (!navigator.serviceWorker?.controller) {
            await readingCache.put(url, response.clone());
          }
        }
        progress.loaded += 1;
      } catch {
        if (signal?.aborted) return;
        progress.failed += 1;
      }
      onProgress?.({ ...progress });
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => loadNext()));
  if (!signal?.aborted) {
    const cachedRequests = await readingCache.keys();
    const overflow = Math.max(0, cachedRequests.length - 240);
    if (overflow) await Promise.all(cachedRequests.slice(0, overflow).map((request) => readingCache.delete(request)));
  }
  return progress;
}

export async function saveChapterOffline(record: Omit<DownloadRecord, "savedAt" | "status" | "pinned">) {
  if (!("caches" in window) || !("indexedDB" in window)) throw new Error("OFFLINE_UNAVAILABLE");
  const estimate = await storageEstimate();
  if (estimate.quota && estimate.usage + record.estimatedBytes > estimate.quota * 0.9) throw new Error("STORAGE_QUOTA_LOW");
  await navigator.storage?.persist?.().catch(() => false);
  const [cache, readingCache] = await Promise.all([
    caches.open(CHAPTER_CACHE),
    caches.open(READING_CACHE),
  ]);
  const inserted: string[] = [];
  try {
    let cursor = 0;
    async function pinNext() {
      while (cursor < record.pageUrls.length) {
        const index = cursor;
        cursor += 1;
        const url = record.pageUrls[index];
        if (await cache.match(url)) continue;
        const warmed = await readingCache.match(url);
        const response = warmed ?? await fetchCacheablePage(url);
        if (!response.ok && response.type !== "opaque") throw new Error(`PAGE_${response.status}`);
        await cache.put(url, response.clone());
        inserted.push(url);
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, record.pageUrls.length) }, () => pinNext()));
    const verification = await Promise.all(record.pageUrls.map((url) => cache.match(url)));
    if (!verification.every(Boolean)) throw new Error("CACHE_VERIFY_FAILED");
    const complete: DownloadRecord = { ...record, savedAt: new Date().toISOString(), status: "ready", pinned: true };
    await withStore("readwrite", (store) => store.put(complete));
    return complete;
  } catch (error) {
    await Promise.all(inserted.map((url) => cache.delete(url)));
    throw error;
  }
}

export async function removeChapterOffline(record: DownloadRecord) {
  const cache = await caches.open(CHAPTER_CACHE);
  await Promise.all(record.pageUrls.map((url) => cache.delete(url)));
  await withStore("readwrite", (store) => store.delete(record.chapterId));
}

export async function listNovelDownloads() {
  const records = await withNamedStore<NovelDownloadRecord[]>(NOVEL_DOWNLOAD_STORE, "readonly", (store) => store.getAll());
  return records.sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
}

export async function saveNovelChapterOffline(record: Omit<NovelDownloadRecord, "medium" | "savedAt" | "estimatedBytes">) {
  if (!("indexedDB" in globalThis)) throw new Error("OFFLINE_UNAVAILABLE");
  const estimatedBytes = new Blob(record.paragraphs).size;
  const complete: NovelDownloadRecord = {
    ...record,
    medium: "novel",
    savedAt: new Date().toISOString(),
    estimatedBytes,
  };
  await withNamedStore(NOVEL_DOWNLOAD_STORE, "readwrite", (store) => store.put(complete));
  return complete;
}

export async function removeNovelOffline(record: NovelDownloadRecord) {
  await withNamedStore(NOVEL_DOWNLOAD_STORE, "readwrite", (store) => store.delete(record.chapterId));
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
      const manifest = await response.json() as { pages: string[]; estimatedBytes: number; version?: string };
      await saveChapterOffline({
        storyId,
        title,
        coverUrl: null,
        chapterId,
        chapterName: item.chapterName,
        pages: manifest.pages.length,
        pageUrls: manifest.pages,
        estimatedBytes: manifest.estimatedBytes,
        manifestVersion: manifest.version ?? `legacy-${chapterId}`,
      });
    }
    localStorage.removeItem("muc:downloads");
  } catch { /* legacy metadata is best effort */ }
}

export type QueuedProgress = {
  storyId: string;
  chapterId: string;
  chapterName?: string;
  page: number;
  totalPages?: number;
  progress: number;
  storyTitle?: string;
  coverUrl?: string | null;
  medium?: "comic" | "novel";
  locator?: string;
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
