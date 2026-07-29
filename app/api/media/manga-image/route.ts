import { waitUntil } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { MangaApiError, resolveMangaApiImageGatewayTarget } from "../../../../lib/sources/manga-api";

const MAX_GATEWAY_PATH_LENGTH = 8_192;
const MAX_EDGE_TTL_SECONDS = 86_400;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

type CloudflareCacheStorage = CacheStorage & { default?: Cache };

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { status: "error", message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function validateExpiry(target: URL, now = Math.floor(Date.now() / 1_000)) {
  const expires = Number.parseInt(target.searchParams.get("expires") ?? "", 10);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + MAX_EDGE_TTL_SECONDS + 60) {
    throw new MangaApiError("URL ảnh đã hết hạn", 502, "MANGA_API_IMAGE_EXPIRED");
  }
  return expires;
}

export function stableMangaImageIdentity(target: URL) {
  if (target.pathname === "/api/v1/image-proxy") {
    const source = target.searchParams.get("source")?.trim().toLowerCase() ?? "";
    const originKey = target.searchParams.get("origin")?.trim().toLowerCase() ?? "";
    const imagePath = target.searchParams.get("path") ?? "";
    if (originKey || imagePath) {
      if (
        !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(source)
        || !/^[a-f0-9]{24}$/.test(originKey)
        || !imagePath.startsWith("/")
        || imagePath.startsWith("//")
        || imagePath.includes("\\")
        || imagePath.length > 4_096
      ) {
        throw new MangaApiError("Tham chiếu ảnh không hợp lệ", 502, "MANGA_API_IMAGE_REF_INVALID");
      }
      return `upstream-ref\n${source}\n${originKey}\n${imagePath}`;
    }
    const originalValue = target.searchParams.get("url") ?? "";
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(source)) {
      throw new MangaApiError("Nguồn ảnh không hợp lệ", 502, "MANGA_API_IMAGE_SOURCE_INVALID");
    }
    let original: URL;
    try {
      original = new URL(originalValue);
    } catch {
      throw new MangaApiError("URL ảnh nguồn không hợp lệ", 502, "MANGA_API_IMAGE_URL_INVALID");
    }
    if (original.protocol !== "https:" || original.username || original.password) {
      throw new MangaApiError("URL ảnh nguồn không an toàn", 502, "MANGA_API_IMAGE_URL_INVALID");
    }
    return `upstream\n${source}\n${original.href}`;
  }
  if (/^\/api\/v1\/cached-image\/[a-f0-9]{24}\/[1-9]\d*$/.test(target.pathname)) {
    return `cached\n${target.pathname}`;
  }
  throw new MangaApiError("Đường dẫn ảnh không hợp lệ", 502, "MANGA_API_IMAGE_PATH_INVALID");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchWithRetry(target: URL) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(target.toString(), {
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      });
      if (!TRANSIENT_STATUSES.has(response.status) || attempt === 2) return response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  return response;
}

function imageResponse(upstream: Response, ttlSeconds: number, cacheStatus: "HIT" | "MISS") {
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}, immutable`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Muc-Edge-Cache", cacheStatus);
  headers.set("Timing-Allow-Origin", "*");
  return new Response(upstream.body, { status: 200, headers });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const path = requestUrl.searchParams.get("path") ?? "";
  if (!path || path.length > MAX_GATEWAY_PATH_LENGTH) {
    return errorResponse("Thiếu hoặc sai đường dẫn ảnh", 400);
  }

  let target: URL;
  let expires: number;
  let identity: string;
  try {
    target = resolveMangaApiImageGatewayTarget(path);
    expires = validateExpiry(target);
    identity = stableMangaImageIdentity(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đường dẫn ảnh không hợp lệ";
    return errorResponse(message, 403);
  }

  const cacheStorage = globalThis.caches as CloudflareCacheStorage | undefined;
  const ttlSeconds = Math.max(1, Math.min(expires - Math.floor(Date.now() / 1_000), MAX_EDGE_TTL_SECONDS));
  let edgeCache: Cache | null = null;
  let cacheKey: Request | null = null;
  let cached: Response | undefined;
  try {
    edgeCache = cacheStorage
      ? cacheStorage.default ?? await cacheStorage.open("muc-edge-images-v1")
      : null;
    if (edgeCache) {
      const digest = await sha256Hex(identity);
      cacheKey = new Request(`${requestUrl.origin}/__muc-edge-image/${digest}`, { method: "GET" });
      cached = await edgeCache.match(cacheKey);
    }
  } catch {
    edgeCache = null;
    cacheKey = null;
  }
  if (cached) return imageResponse(cached, ttlSeconds, "HIT");

  let upstream: Response | null;
  try {
    upstream = await fetchWithRetry(target);
  } catch (error) {
    console.error("manga_edge_fetch_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      targetOrigin: target.origin,
      targetPath: target.pathname,
    });
    return errorResponse("Không kết nối được máy chủ ảnh", 503);
  }
  if (!upstream?.ok) {
    await upstream?.body?.cancel().catch(() => undefined);
    return errorResponse(`Máy chủ ảnh trả HTTP ${upstream?.status ?? 503}`, 502);
  }
  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    await upstream.body?.cancel().catch(() => undefined);
    return errorResponse("Phản hồi không phải hình ảnh", 502);
  }

  const response = imageResponse(upstream, ttlSeconds, "MISS");
  if (edgeCache && cacheKey) {
    const cacheWrite = edgeCache.put(cacheKey, response.clone()).catch(() => undefined);
    try {
      waitUntil(cacheWrite);
    } catch {
      void cacheWrite;
    }
  }
  return response;
}
