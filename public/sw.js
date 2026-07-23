const STATIC_CACHE = "muc-static-v1";
const PAGE_CACHE = "muc-pages-v1";
const CHAPTER_CACHE = "muc-chapters-v1";
const APP_SHELL = ["/", "/discover", "/library", "/downloads", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("muc-") && ![STATIC_CACHE, PAGE_CACHE, CHAPTER_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname.endsWith("otruyencdn.com")) {
    event.respondWith(caches.open(CHAPTER_CACHE).then(async (cache) => (await cache.match(request)) || fetch(request)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(networkFirst(request));
  else if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".css") || url.pathname.endsWith(".js") || url.pathname.endsWith(".woff2")) event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function openProgressDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("muc-reader", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("downloads")) db.createObjectStore("downloads", { keyPath: "chapterId" });
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
