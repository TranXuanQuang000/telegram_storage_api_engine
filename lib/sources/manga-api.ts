import { env } from "cloudflare:workers";
import { z } from "zod";

type MangaApiRuntime = {
  MANGA_API_BASE_URL?: string;
  CATALOG_PROVIDER?: string;
};

const categorySchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
});

const listChapterSchema = z.object({
  chapter_name: z.string(),
  chapter_api_data: z.string().nullable(),
});

export const mangaApiListItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  thumb_url: z.string().nullable(),
  category: z.array(categorySchema),
  chaptersLatest: z.array(listChapterSchema),
  updatedAt: z.string(),
});

const paginationSchema = z.object({
  totalItems: z.number().int().nonnegative(),
  totalItemsPerPage: z.number().int().positive(),
  currentPage: z.number().int().positive(),
  pageRanges: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().nonnegative().optional(),
});

export const mangaApiCatalogSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z.object({
    items: z.array(mangaApiListItemSchema),
    params: z.object({ pagination: paginationSchema }),
  }),
});

const detailChapterSchema = z.object({
  chapter_name: z.string(),
  chapter_api_data: z.string(),
});

export const mangaApiDetailSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z.object({
    item: z.object({
      _id: z.string(),
      name: z.string(),
      slug: z.string(),
      thumb_url: z.string().nullable(),
      category: z.array(z.object({ name: z.string() })),
      current_source: z.enum(["nettruyen", "truyenqq"]),
      is_pinned: z.boolean(),
      chapters: z.array(z.object({
        server_name: z.string(),
        server_data: z.array(detailChapterSchema),
      })),
    }),
  }),
});

const chapterImageSchema = z.object({
  page: z.number().int().positive(),
  originalUrl: z.string().nullable(),
  proxyUrl: z.string(),
});

const legacyChapterImageSchema = z.object({
  image_page: z.number().int().positive(),
  image_file: z.string(),
});

export const mangaApiChapterSchema = z.object({
  status: z.literal(true),
  data: z.object({
    sourceKey: z.string(),
    chapterPath: z.string(),
    cacheStatus: z.enum(["ready", "queued", "disabled"]),
    totalImages: z.number().int().nonnegative(),
    images: z.array(chapterImageSchema),
    chapter_image: z.array(legacyChapterImageSchema),
  }),
});

export type MangaApiListItem = z.infer<typeof mangaApiListItemSchema>;
export type MangaApiCatalog = z.infer<typeof mangaApiCatalogSchema>;
export type MangaApiDetail = z.infer<typeof mangaApiDetailSchema>;
export type MangaApiChapter = z.infer<typeof mangaApiChapterSchema>;

type CacheEntry = {
  expiresAt: number;
  value?: unknown;
  pending?: Promise<unknown>;
};

const responseCache = new Map<string, CacheEntry>();
const chapterReferenceSchema = z.object({
  apiPath: z.string().min(1).max(4_096),
  chapterName: z.string().min(1).max(240),
});

export class MangaApiError extends Error {
  readonly status: 404 | 502 | 503;
  readonly code: string;

  constructor(message: string, status: 404 | 502 | 503, code: string) {
    super(message);
    this.name = "MangaApiError";
    this.status = status;
    this.code = code;
  }
}

function runtimeConfiguration() {
  return env as unknown as MangaApiRuntime;
}

function normalizeBaseUrl(value?: string) {
  const raw = value?.trim() || "http://localhost:3100";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MangaApiError("MANGA_API_BASE_URL không hợp lệ", 503, "MANGA_API_CONFIG_INVALID");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new MangaApiError("Manga API phải dùng HTTPS, trừ localhost", 503, "MANGA_API_CONFIG_INVALID");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new MangaApiError("MANGA_API_BASE_URL không được chứa credentials hoặc query", 503, "MANGA_API_CONFIG_INVALID");
  }
  url.pathname = "/";
  return url;
}

export function getCatalogProvider() {
  const runtime = runtimeConfiguration();
  return (runtime.CATALOG_PROVIDER ?? process.env.CATALOG_PROVIDER ?? "legacy").trim().toLowerCase();
}

export function isMangaApiCatalogProvider() {
  return getCatalogProvider() === "manga-api";
}

export function getMangaApiBaseUrl() {
  const runtime = runtimeConfiguration();
  return normalizeBaseUrl(runtime.MANGA_API_BASE_URL ?? process.env.MANGA_API_BASE_URL);
}

function resolveKnownApiPath(relative: string) {
  if (!relative.startsWith("/api/v1/") || relative.startsWith("//")) {
    throw new MangaApiError("Manga API trả về path không được phép", 502, "MANGA_API_PATH_INVALID");
  }
  const base = getMangaApiBaseUrl();
  const resolved = new URL(relative, base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith("/api/v1/")) {
    throw new MangaApiError("Manga API path vượt khỏi origin cấu hình", 502, "MANGA_API_PATH_INVALID");
  }
  return resolved;
}

export function resolveMangaApiApiUrl(relative: string) {
  return resolveKnownApiPath(relative).toString();
}

function resolveSignedImagePath(relative: string) {
  const url = resolveKnownApiPath(relative);
  const allowed = url.pathname === "/api/v1/image-proxy"
    || url.pathname.startsWith("/api/v1/cached-image/");
  if (!allowed) {
    throw new MangaApiError("Ảnh không dùng image gateway của Manga API", 502, "MANGA_API_IMAGE_PATH_INVALID");
  }
  return url.toString();
}

export function resolveMangaApiCoverUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/")) return new URL(value, getMangaApiBaseUrl()).toString();
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeMangaApiChapterId(apiPath: string, chapterName: string) {
  const resolved = resolveKnownApiPath(apiPath);
  if (resolved.pathname !== "/api/v1/chapter-detail") {
    throw new MangaApiError("Chapter path không đúng endpoint", 404, "MANGA_API_CHAPTER_PATH_INVALID");
  }
  return `mapi.${encodeBase64Url(JSON.stringify({ apiPath, chapterName }))}`;
}

export function decodeMangaApiChapterId(chapterId: string) {
  if (!chapterId.startsWith("mapi.") || chapterId.length > 8_192) {
    throw new MangaApiError("Chapter ID không hợp lệ", 404, "MANGA_API_CHAPTER_ID_INVALID");
  }
  try {
    const parsed = chapterReferenceSchema.parse(JSON.parse(decodeBase64Url(chapterId.slice(5))));
    resolveKnownApiPath(parsed.apiPath);
    return parsed;
  } catch (error) {
    if (error instanceof MangaApiError) throw error;
    throw new MangaApiError("Chapter ID không hợp lệ", 404, "MANGA_API_CHAPTER_ID_INVALID");
  }
}

async function fetchValidated<T>(
  url: URL,
  schema: z.ZodType<T>,
  { timeoutMs, ttlMs }: { timeoutMs: number; ttlMs: number },
): Promise<T> {
  const cacheKey = url.toString();
  const cached = responseCache.get(cacheKey);
  if (ttlMs > 0 && cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value as T;
    if (cached.pending) return await cached.pending as T;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const pending = (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new MangaApiError(
        timedOut ? "Manga API phản hồi quá thời gian" : "Không kết nối được Manga API",
        503,
        timedOut ? "MANGA_API_TIMEOUT" : "MANGA_API_UNAVAILABLE",
      );
    }
    if (!response.ok) {
      const status = response.status === 404 ? 404 : response.status === 503 ? 503 : 502;
      throw new MangaApiError(
        `Manga API trả về HTTP ${response.status}`,
        status,
        `MANGA_API_HTTP_${response.status}`,
      );
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new MangaApiError("Manga API trả JSON không hợp lệ", 502, "MANGA_API_INVALID_JSON");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new MangaApiError("Response Manga API sai contract", 502, "MANGA_API_CONTRACT_INVALID");
    }
    return parsed.data;
  })();

  if (ttlMs > 0) {
    responseCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, pending });
  }
  try {
    const value = await pending;
    if (ttlMs > 0) responseCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, value });
    return value;
  } catch (error) {
    responseCache.delete(cacheKey);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function listUrl(pathname: string, params: Record<string, string>) {
  const url = resolveKnownApiPath(pathname);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export async function getMangaApiCatalog(page = 1, limit = 24) {
  return await fetchValidated(
    listUrl("/api/v1/danh-sach/truyen-moi", {
      page: String(Math.max(1, Math.floor(page))),
      limit: String(Math.min(Math.max(1, Math.floor(limit)), 100)),
    }),
    mangaApiCatalogSchema,
    { timeoutMs: 6_000, ttlMs: 45_000 },
  );
}

export async function searchMangaApi(keyword: string, page = 1) {
  const normalized = keyword.trim().slice(0, 120);
  if (!normalized) return await getMangaApiCatalog(page);
  return await fetchValidated(
    listUrl("/api/v1/tim-kiem", {
      keyword: normalized,
      page: String(Math.max(1, Math.floor(page))),
    }),
    mangaApiCatalogSchema,
    { timeoutMs: 6_000, ttlMs: 45_000 },
  );
}

export async function getMangaApiGenre(genre: string, page = 1) {
  if (!/^[a-z0-9-]{1,80}$/.test(genre)) {
    throw new MangaApiError("Genre không hợp lệ", 404, "MANGA_API_GENRE_INVALID");
  }
  return await fetchValidated(
    listUrl(`/api/v1/the-loai/${genre}`, {
      page: String(Math.max(1, Math.floor(page))),
    }),
    mangaApiCatalogSchema,
    { timeoutMs: 6_000, ttlMs: 45_000 },
  );
}

export async function getMangaApiDetail(slug: string) {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) {
    throw new MangaApiError("Slug không hợp lệ", 404, "MANGA_API_SLUG_INVALID");
  }
  const url = resolveKnownApiPath(`/api/v1/truyen-tranh/${slug}`);
  const payload = await fetchValidated(
    url,
    mangaApiDetailSchema,
    { timeoutMs: 7_000, ttlMs: 20_000 },
  );
  return { payload, sourceUrl: url.toString() };
}

export async function getMangaApiChapter(chapterId: string) {
  const reference = decodeMangaApiChapterId(chapterId);
  const url = resolveKnownApiPath(reference.apiPath);
  if (url.pathname !== "/api/v1/chapter-detail") {
    throw new MangaApiError("Chapter path không đúng endpoint", 404, "MANGA_API_CHAPTER_PATH_INVALID");
  }
  const payload = await fetchValidated(
    url,
    mangaApiChapterSchema,
    { timeoutMs: 12_000, ttlMs: 0 },
  );
  const primary = payload.data.images
    .slice()
    .sort((left, right) => left.page - right.page)
    .map((image) => ({ page: image.page, url: resolveSignedImagePath(image.proxyUrl) }));
  const fallback = payload.data.chapter_image
    .slice()
    .sort((left, right) => left.image_page - right.image_page)
    .map((image) => ({ page: image.image_page, url: resolveSignedImagePath(image.image_file) }));
  const pages = (primary.length ? primary : fallback).map((image) => image.url);
  if (!pages.length || pages.length !== payload.data.totalImages) {
    throw new MangaApiError("Chapter không có đủ signed image URL", 502, "MANGA_API_CHAPTER_EMPTY");
  }
  return {
    payload,
    pages,
    sourceUrl: url.toString(),
    chapterName: reference.chapterName,
  };
}
