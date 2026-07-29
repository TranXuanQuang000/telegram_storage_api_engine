const STATIC_CACHE = "muc-static-v6";
const PAGE_CACHE = "muc-pages-v6";
const CHAPTER_CACHE = "muc-chapters-v3";
const READING_CACHE = "muc-reading-v1";
const APP_SHELL = ["/", "/discover", "/library", "/downloads", "/offline", "/offline-reader.html", "/offline-text-reader.html", "/manifest.webmanifest"];
const readerAssetFlights = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("muc-") && ![STATIC_CACHE, PAGE_CACHE, CHAPTER_CACHE, READING_CACHE, "muc-chapters-v1"].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/novels/read/")) {
      return (await caches.match("/offline-text-reader.html")) || new Response("Offline text reader unavailable", { status: 503 });
    }
    if (url.pathname.startsWith("/read/")) {
      return (await caches.match("/offline-reader.html")) || new Response("Offline reader unavailable", { status: 503 });
    }
    return (await cache.match(request)) || (await caches.match("/offline")) || new Response("Bạn đang offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fresh;
}

async function networkFirstAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || new Response("Asset unavailable", { status: 503 });
  }
}

function stableReaderCacheKey(request) {
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname === "/api/media/manga-image") {
    try {
      const target = new URL(
        url.searchParams.get("path") || "",
        "https://manga-api.invalid",
      );
      if (
        target.pathname === "/api/v1/image-proxy"
        || target.pathname.startsWith("/api/v1/cached-image/")
      ) {
        target.searchParams.delete("expires");
        target.searchParams.delete("sig");
        target.searchParams.delete("retry");
        url.searchParams.set("path", `${target.pathname}${target.search}`);
        return new Request(url.href, { method: "GET" });
      }
    } catch {
      return request;
    }
  }
  const signedProxy = url.pathname === "/api/v1/image-proxy";
  const cachedImage = url.pathname.startsWith("/api/v1/cached-image/");
  if (signedProxy || cachedImage) {
    url.searchParams.delete("expires");
    url.searchParams.delete("sig");
    url.searchParams.delete("retry");
    return new Request(url.href, { method: "GET" });
  }
  return request;
}

async function fetchReaderAsset(request, event) {
  const [pinnedCache, readingCache] = await Promise.all([
    caches.open(CHAPTER_CACHE),
    caches.open(READING_CACHE),
  ]);
  const cacheKey = stableReaderCacheKey(request);
  const cached = (await pinnedCache.match(cacheKey)) || (await readingCache.match(cacheKey));
  if (cached) return cached;

  const flightKey = cacheKey.url;
  let pending = readerAssetFlights.get(flightKey);
  if (!pending) {
    pending = (async () => {
      let response;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await fetch(request);
          if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
        } catch (error) {
          if (attempt === 2) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
      return response;
    })().finally(() => readerAssetFlights.delete(flightKey));
    readerAssetFlights.set(flightKey, pending);
  }
  const response = await pending;
  if (response && (response.ok || response.type === "opaque")) {
    event.waitUntil(readingCache.put(cacheKey, response.clone()).catch(() => undefined));
  }
  return response ? response.clone() : new Response("Image unavailable", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (
    url.origin !== self.location.origin
    || url.pathname === "/api/media/manga-image"
  ) {
    event.respondWith(fetchReaderAsset(request, event));
    return;
  }
  if (url.pathname.includes("/assets/CyberNexusDashboard-")) event.respondWith(networkFirstAsset(request));
  else if (request.mode === "navigate") event.respondWith(networkFirst(request));
  else if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".css") || url.pathname.endsWith(".js") || url.pathname.endsWith(".woff2")) event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function openProgressDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("muc-reader", 4);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("downloads")) db.createObjectStore("downloads", { keyPath: "chapterId" });
      if (!db.objectStoreNames.contains("novelDownloads")) db.createObjectStore("novelDownloads", { keyPath: "chapterId" });
      if (!db.objectStoreNames.contains("progressQueue")) db.createObjectStore("progressQueue", { keyPath: "storyId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function flushQueuedProgress() {
  const db = await openProgressDatabase();
  const queued = await new Promise((resolve, reject) => {
    const request = db.transaction("progressQueue", "readonly").objectStore("progressQueue").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const item of queued) {
    const response = await fetch("/api/progress", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(item) });
    if (response.ok || response.status === 400 || response.status === 401 || response.status === 403) {
      await new Promise((resolve, reject) => {
        const request = db.transaction("progressQueue", "readwrite").objectStore("progressQueue").delete(item.storyId);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
    if (response.status === 401 || response.status === 403 || response.status === 503) break;
  }
  db.close();
}

self.addEventListener("sync", (event) => {
  if (event.tag === "muc-progress") event.waitUntil(flushQueuedProgress());
});
