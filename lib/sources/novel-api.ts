import { contentApiHeaders, contentApiUrl, getContentApiConfiguration } from "../content-api";
import type { NovelChapterContent, NovelSummary } from "../novels";

type RemoteNovelItem = {
  id?: string;
  title?: string;
  slug?: string;
  author?: string | null;
  description?: string | null;
  cover_url?: string | null;
  genres?: string[];
  status?: string;
  updated_at?: string | null;
  source?: string;
  source_url?: string | null;
  chapters?: RemoteNovelChapter[];
};

type RemoteNovelChapter = {
  id?: string;
  title?: string;
  chapter_number?: string | null;
  is_filled?: boolean;
  original_source?: string;
};

const sourceLabels: Record<string, string> = {
  hako: "Hako",
  truyenfull: "TruyenFull",
  metruyenchu: "MeTruyenChu",
  tangthuvien: "Tàng Thư Viện",
  wikidich: "Wikidich",
  gutendex: "Project Gutenberg",
};

const responseCache = new Map<string, { expiresAt: number; value?: unknown; pending?: Promise<unknown> }>();

function sourceAccent(value: string) {
  const accents = ["#c7ff3c", "#00e5ff", "#ff2bd6", "#7c5cff", "#ffb347", "#58f0c7"];
  const hash = [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % accents.length, 0);
  return accents[hash];
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function novelApiRouteSlug(source: string, slug: string) {
  return `napi.${source}.${base64UrlEncode(slug)}`;
}

function decodeNovelRouteSlug(routeSlug: string) {
  const match = routeSlug.match(/^napi\.([a-z0-9]+)\.([A-Za-z0-9_-]+)$/);
  if (!match || !sourceLabels[match[1]]) return null;
  try {
    const slug = base64UrlDecode(match[2]);
    return /^[^\s/?#]{1,240}$/.test(slug) ? { source: match[1], slug } : null;
  } catch {
    return null;
  }
}

function novelApiChapterId(primarySource: string, source: string, slug: string, chapterId: string) {
  return `nch.${primarySource}.${source}.${base64UrlEncode(slug)}.${base64UrlEncode(chapterId)}`;
}

function decodeNovelChapterId(value: string) {
  const match = value.match(/^nch\.([a-z0-9]+)\.([a-z0-9]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match || !sourceLabels[match[1]] || !sourceLabels[match[2]]) return null;
  try {
    const slug = base64UrlDecode(match[3]);
    const chapterId = base64UrlDecode(match[4]);
    return slug && chapterId ? { primarySource: match[1], source: match[2], slug, chapterId } : null;
  } catch {
    return null;
  }
}

async function fetchRemoteJson<T>(path: string, ttlMs = 5 * 60 * 1_000): Promise<T> {
  const url = contentApiUrl(path);
  if (!url) throw new Error("NOVEL_API_NOT_CONFIGURED");
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value as T;
    if (cached.pending) return await cached.pending as T;
  }
  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { headers: contentApiHeaders(), signal: controller.signal });
      if (response.status === 404) throw new Error("NOVEL_API_NOT_FOUND");
      if (!response.ok) throw new Error(`NOVEL_API_${response.status}`);
      const payload = await response.json() as T;
      if (!payload || typeof payload !== "object") throw new Error("NOVEL_API_INVALID_PAYLOAD");
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  })();
  responseCache.set(url, { expiresAt: Date.now() + ttlMs, pending });
  try {
    const value = await pending;
    responseCache.set(url, { expiresAt: Date.now() + ttlMs, value });
    return value;
  } catch (error) {
    responseCache.delete(url);
    throw error;
  }
}

function mapRemoteSummary(item: RemoteNovelItem, fallbackSource: string): NovelSummary | null {
  const source = item.source && sourceLabels[item.source] ? item.source : fallbackSource;
  if (!sourceLabels[source] || !item.slug || !item.title) return null;
  return {
    id: `novel_api_${source}_${item.id ?? item.slug}`,
    slug: novelApiRouteSlug(source, item.slug),
    title: item.title,
    author: item.author?.trim() || "Chưa rõ tác giả",
    description: item.description?.trim() || "Nguồn chưa cung cấp phần giới thiệu.",
    genres: item.genres?.filter(Boolean) ?? [],
    accent: sourceAccent(`${source}:${item.slug}`),
    chapters: [],
    chapterCount: null,
    updatedAt: item.updated_at ?? new Date(0).toISOString(),
    sourceName: sourceLabels[source],
    sourceUrl: item.source_url ?? undefined,
    sourceId: source,
    provider: "novel-api",
    coverUrl: item.cover_url ?? null,
    status: item.status,
  };
}

export async function getNovelApiCatalog() {
  const { baseUrl, novelSources, novelScanPages } = getContentApiConfiguration();
  if (!baseUrl || !novelSources.length) return [];
  const requests = Array.from(
    { length: novelScanPages },
    (_, index) => ({ source: "auto", page: index + 1 }),
  );
  const settled = await Promise.allSettled(requests.map(async ({ source, page }) => {
    const payload = await fetchRemoteJson<{ data?: { items?: RemoteNovelItem[] } }>(
      `/truyen-chu/danh-sach?page=${page}&limit=100&source=${encodeURIComponent(source)}`,
      10 * 60 * 1_000,
    );
    return (payload.data?.items ?? [])
      .map((item) => mapRemoteSummary(item, item.source ?? source))
      .filter((item): item is NovelSummary => Boolean(item));
  }));
  const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return [...new Map(items.map((novel) => [novel.slug, novel])).values()];
}

export async function getNovelApiStory(routeSlug: string): Promise<NovelSummary | null> {
  const ref = decodeNovelRouteSlug(routeSlug);
  if (!ref) return null;
  const payload = await fetchRemoteJson<{ data?: { item?: RemoteNovelItem } }>(
    `/truyen-chu/${encodeURIComponent(ref.slug)}?source=${encodeURIComponent(ref.source)}`,
  );
  const item = payload.data?.item;
  const summary = item ? mapRemoteSummary(item, ref.source) : null;
  if (!summary || !item?.chapters?.length) return summary;
  summary.chapters = item.chapters.flatMap((chapter, index) => {
    const upstreamId = chapter.id || chapter.chapter_number;
    const source = chapter.original_source && sourceLabels[chapter.original_source]
      ? chapter.original_source
      : ref.source;
    if (!upstreamId) return [];
    return [{
      id: novelApiChapterId(ref.source, source, ref.slug, upstreamId),
      label: chapter.title?.trim() || `Chương ${chapter.chapter_number ?? index + 1}`,
      sourceTitle: chapter.title?.trim() || `Chương ${chapter.chapter_number ?? index + 1}`,
      sourceName: sourceLabels[source],
      sourceId: source,
      isFilled: Boolean(chapter.is_filled),
    }];
  });
  summary.chapterCount = summary.chapters.length;
  return summary;
}

function paragraphsFromText(value?: string) {
  const normalized = (value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .trim();
  const blocks = normalized.split(/\n\s*\n+/).map((paragraph) => paragraph.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (blocks.length > 1) return blocks.slice(0, 4_000);
  return normalized.split(/\n+/).map((paragraph) => paragraph.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4_000);
}

export async function getNovelApiChapter(chapterId: string): Promise<NovelChapterContent | null> {
  const ref = decodeNovelChapterId(chapterId);
  if (!ref) return null;
  const novel = await getNovelApiStory(novelApiRouteSlug(ref.primarySource, ref.slug));
  const chapter = novel?.chapters.find((candidate) => candidate.id === chapterId);
  if (!novel || !chapter) return null;
  const payload = await fetchRemoteJson<{
    data?: {
      text_content?: string;
      source?: string;
      source_url?: string | null;
    };
  }>(
    `/truyen-chu/${encodeURIComponent(ref.slug)}/chapter/${encodeURIComponent(ref.chapterId)}?source=${encodeURIComponent(ref.source)}&as_html=false`,
    30 * 60 * 1_000,
  );
  const paragraphs = paragraphsFromText(payload.data?.text_content);
  if (!paragraphs.length) return null;
  const actualSource = payload.data?.source && sourceLabels[payload.data.source] ? payload.data.source : ref.source;
  return {
    novel: { ...novel, sourceName: sourceLabels[actualSource], sourceId: actualSource },
    chapter: { ...chapter, sourceName: sourceLabels[actualSource], sourceId: actualSource },
    paragraphs,
    sourceUrl: payload.data?.source_url || novel.sourceUrl || "",
    sourceName: sourceLabels[actualSource],
  };
}

export function isNovelApiSlug(value: string) {
  return Boolean(decodeNovelRouteSlug(value));
}

export function isNovelApiChapterId(value: string) {
  return Boolean(decodeNovelChapterId(value));
}
