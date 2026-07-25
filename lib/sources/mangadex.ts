import { deriveAutoTags } from "../auto-tags";
import type { StoryCardData, StoryDetailData } from "../catalog";
import { aggregateRatings } from "../ratings";

type LocalizedText = Record<string, string | undefined>;

type MangaDexRelationship = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    fileName?: string;
  };
};

type MangaDexTag = {
  id: string;
  attributes?: {
    name?: LocalizedText;
  };
};

type MangaDexManga = {
  id: string;
  type: "manga";
  attributes?: {
    title?: LocalizedText;
    altTitles?: LocalizedText[];
    description?: LocalizedText;
    status?: string;
    contentRating?: string;
    originalLanguage?: string;
    lastChapter?: string | null;
    updatedAt?: string;
    availableTranslatedLanguages?: string[];
    tags?: MangaDexTag[];
  };
  relationships?: MangaDexRelationship[];
};

type MangaDexChapter = {
  id: string;
  type: "chapter";
  attributes?: {
    chapter?: string | null;
    title?: string | null;
    externalUrl?: string | null;
    readableAt?: string;
    updatedAt?: string;
  };
  relationships?: Array<MangaDexRelationship & { attributes?: MangaDexManga["attributes"] }>;
};

type CollectionResponse<T> = {
  result?: string;
  data?: T[];
  total?: number;
  limit?: number;
  offset?: number;
};

type EntityResponse<T> = {
  result?: string;
  data?: T;
};

const API_BASE = "https://api.mangadex.org";
const cache = new Map<string, { expiresAt: number; value?: unknown; pending?: Promise<unknown> }>();

function preferredText(value?: LocalizedText) {
  if (!value) return "";
  return value.vi ?? value.en ?? value["ja-ro"] ?? value.ja ?? Object.values(value).find(Boolean) ?? "";
}

function titleFor(manga: MangaDexManga) {
  const attributes = manga.attributes;
  const vietnameseAlias = attributes?.altTitles?.find((title) => title.vi)?.vi;
  return attributes?.title?.vi
    ?? vietnameseAlias
    ?? attributes?.title?.en
    ?? attributes?.title?.["ja-ro"]
    ?? attributes?.title?.ja
    ?? preferredText(attributes?.title)
    ?? "Chưa rõ tên";
}

function originTitleFor(manga: MangaDexManga) {
  const attributes = manga.attributes;
  const candidates = [
    attributes?.title?.en,
    attributes?.title?.["ja-ro"],
    attributes?.title?.ja,
  ].filter((value): value is string => Boolean(value && value !== titleFor(manga)));
  return [...new Set(candidates)].slice(0, 2).join(" · ") || null;
}

function safeStatus(value?: string): StoryCardData["status"] {
  if (value === "completed" || value === "hiatus" || value === "cancelled") return value;
  return "ongoing";
}

function safeContentRating(value?: string): StoryCardData["contentRating"] {
  if (value === "suggestive") return "suggestive";
  if (value === "erotica") return "mature";
  if (value === "pornographic") return "explicit";
  return "safe";
}

function sourceGenres(manga: MangaDexManga) {
  return (manga.attributes?.tags ?? [])
    .map((tag) => preferredText(tag.attributes?.name))
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function coverUrlFor(manga: MangaDexManga) {
  const cover = manga.relationships?.find((relationship) => relationship.type === "cover_art");
  const fileName = cover?.attributes?.fileName;
  if (!fileName || !/^[a-zA-Z0-9._-]+$/.test(fileName)) return null;
  return `/api/media/mangadex/cover/${manga.id}/${encodeURIComponent(fileName)}`;
}

function provisionalScore(manga: MangaDexManga, updatedAt: string) {
  const ageDays = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  const metadata = Math.min(0.24, sourceGenres(manga).length * 0.025);
  const recency = Math.max(0, 0.28 - Math.min(0.28, ageDays * 0.01));
  const hash = [...manga.id].reduce((total, character) => (total * 33 + character.charCodeAt(0)) % 71, 19);
  return Math.round(Math.min(4.35, 3.55 + metadata + recency + (hash / 70) * 0.12) * 100) / 100;
}

function normalizeManga(manga: MangaDexManga, latest?: MangaDexChapter): StoryCardData {
  const title = titleFor(manga);
  const genres = sourceGenres(manga);
  const genreSlugs = genres.map(slugify).filter(Boolean);
  const updatedAt = latest?.attributes?.readableAt
    ?? latest?.attributes?.updatedAt
    ?? manga.attributes?.updatedAt
    ?? new Date(0).toISOString();
  return {
    id: `mangadex_${manga.id}`,
    slug: `mangadex-${manga.id}`,
    title,
    originTitle: originTitleFor(manga),
    coverUrl: coverUrlFor(manga),
    status: safeStatus(manga.attributes?.status),
    contentRating: safeContentRating(manga.attributes?.contentRating),
    genres,
    genreSlugs,
    discoveryTags: deriveAutoTags(genreSlugs, title).map((tag) => tag.slug),
    latestChapter: latest?.attributes?.chapter ?? manga.attributes?.lastChapter ?? null,
    latestChapterId: null,
    updatedAt,
    score: provisionalScore(manga, updatedAt),
    scoreSource: "Điểm Mực tạm tính · độ mới và độ đầy đủ metadata MangaDex",
    scoreKind: "provisional",
    recommendationReason: "Nguồn MangaDex · bản dịch tiếng Việt",
  };
}

async function fetchJson<T>(url: string, ttlMs = 2 * 60 * 1_000): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value as T;
    if (cached.pending) return await cached.pending as T;
  }

  const pending = (async () => {
    let failure: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "MucCatalog/1.2 (+https://muctruyen.pages.dev; source-attribution)",
          },
          signal: controller.signal,
        });
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Math.min(2_000, Math.max(300, Number(response.headers.get("Retry-After")) * 1_000 || 500));
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
          continue;
        }
        if (!response.ok) throw new Error(`MangaDex returned ${response.status}`);
        return await response.json() as T;
      } catch (error) {
        failure = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw failure instanceof Error ? failure : new Error("MangaDex request failed");
  })();

  cache.set(url, { expiresAt: Date.now() + ttlMs, pending });
  try {
    const value = await pending;
    cache.set(url, { expiresAt: Date.now() + ttlMs, value });
    return value;
  } catch (error) {
    cache.delete(url);
    throw error;
  }
}

async function fetchMangaBatch(ids: string[]) {
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  if (!uniqueIds.length) return [];
  const params = new URLSearchParams({ limit: String(uniqueIds.length) });
  uniqueIds.forEach((id) => params.append("ids[]", id));
  params.append("includes[]", "cover_art");
  params.append("contentRating[]", "safe");
  params.append("contentRating[]", "suggestive");
  const payload = await fetchJson<CollectionResponse<MangaDexManga>>(`${API_BASE}/manga?${params.toString()}`);
  return payload.data ?? [];
}

export async function getMangaDexLatestStories(limit = 20): Promise<StoryCardData[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 20, 1), 40);
  const params = new URLSearchParams({ limit: String(Math.min(100, safeLimit * 3)) });
  params.append("translatedLanguage[]", "vi");
  params.append("order[readableAt]", "desc");
  params.append("includes[]", "manga");
  params.append("contentRating[]", "safe");
  params.append("contentRating[]", "suggestive");
  const payload = await fetchJson<CollectionResponse<MangaDexChapter>>(`${API_BASE}/chapter?${params.toString()}`);
  const latestByManga = new Map<string, MangaDexChapter>();
  for (const chapter of payload.data ?? []) {
    if (chapter.attributes?.externalUrl) continue;
    const mangaId = chapter.relationships?.find((relationship) => relationship.type === "manga")?.id;
    if (mangaId && !latestByManga.has(mangaId)) latestByManga.set(mangaId, chapter);
    if (latestByManga.size >= safeLimit) break;
  }
  const manga = await fetchMangaBatch([...latestByManga.keys()]);
  return manga
    .map((item) => normalizeManga(item, latestByManga.get(item.id)))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, safeLimit);
}

export async function searchMangaDexStories(query: string, limit = 20): Promise<StoryCardData[]> {
  if (!query.trim()) return [];
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 20, 1), 40);
  const params = new URLSearchParams({ title: query.trim(), limit: String(safeLimit) });
  params.append("availableTranslatedLanguage[]", "vi");
  params.append("includes[]", "cover_art");
  params.append("order[relevance]", "desc");
  params.append("contentRating[]", "safe");
  params.append("contentRating[]", "suggestive");
  const payload = await fetchJson<CollectionResponse<MangaDexManga>>(`${API_BASE}/manga?${params.toString()}`);
  return (payload.data ?? []).map((manga) => normalizeManga(manga));
}

export async function getMangaDexStory(slug: string): Promise<StoryDetailData | null> {
  const id = slug.match(/^mangadex-([a-f0-9-]{36})$/i)?.[1];
  if (!id) return null;
  try {
    const params = new URLSearchParams();
    params.append("includes[]", "cover_art");
    params.append("includes[]", "author");
    params.append("includes[]", "artist");
    const payload = await fetchJson<EntityResponse<MangaDexManga>>(`${API_BASE}/manga/${id}?${params.toString()}`, 5 * 60 * 1_000);
    const manga = payload.data;
    if (!manga) return null;
    const summary = normalizeManga(manga);
    const authors = [...new Set((manga.relationships ?? [])
      .filter((relationship) => relationship.type === "author" || relationship.type === "artist")
      .map((relationship) => relationship.attributes?.name)
      .filter((name): name is string => Boolean(name)))];
    return {
      ...summary,
      synopsis: preferredText(manga.attributes?.description) || "MangaDex chưa cung cấp tóm tắt cho ngôn ngữ hiện tại.",
      authors,
      chapters: [],
      sourceUrl: `https://mangadex.org/title/${id}`,
      sourceName: "MangaDex",
      rating: aggregateRatings([]),
    };
  } catch {
    return null;
  }
}
