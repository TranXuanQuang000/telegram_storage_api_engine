import { deriveAutoTags, inferContentRating } from "./auto-tags";
import { getAniListRatingSignals, getExternalRating, type RatingSignal } from "./external-ratings";
import { aggregateRatings, type RatingAggregate } from "./ratings";
import { getCommunityReviewSignals } from "./review-signals";
import { normalizeTitle, titleSimilarity } from "./search-utils";
import { getMangaDexLatestStories, getMangaDexStory, searchMangaDexStories } from "./sources/mangadex";
import { comicApiCandidates, contentApiHeaders, contentApiSourceName, getContentApiConfiguration } from "./content-api";
import {
  encodeMangaApiChapterId,
  getMangaApiCatalog,
  getMangaApiChapter,
  getMangaApiDetail,
  getMangaApiGenre,
  isMangaApiCatalogProvider,
  MangaApiError,
  resolveMangaApiApiUrl,
  resolveMangaApiCoverUrl,
  searchMangaApi,
  type MangaApiCatalog,
} from "./sources/manga-api";

export type StoryCardData = {
  medium?: "comic" | "novel";
  id: string;
  slug: string;
  title: string;
  originTitle: string | null;
  coverUrl: string | null;
  status: "ongoing" | "completed" | "hiatus" | "cancelled";
  contentRating: "safe" | "suggestive" | "mature" | "explicit";
  genres: string[];
  genreSlugs: string[];
  discoveryTags: string[];
  latestChapter: string | null;
  latestChapterId: string | null;
  updatedAt: string;
  score: number | null;
  scoreSource: string | null;
  scoreKind?: "community" | "provisional";
  ratingVotes?: number;
  positiveRatio?: number | null;
  negativeRatio?: number | null;
  recommendationScore?: number;
  recommendationReason?: string | null;
};

export type CatalogPageData = {
  stories: StoryCardData[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sourceLabel: string;
  searchNotice?: {
    requestedQuery: string;
    exactMatch: boolean;
    suggestions: Array<{ slug: string; title: string; similarity: number }>;
  };
};

export type DiscoverCatalogFilters = {
  query?: string;
  page?: number;
  pageSize?: number;
  include?: string[];
  exclude?: string[];
  status?: string;
  mood?: string;
  format?: string;
  pace?: string;
  minScore?: number;
  maxChapters?: number;
  sort?: string;
  scanPages?: number;
};

export type ChapterData = {
  id: string;
  number: string;
  title: string;
  apiUrl: string;
};

export type StoryDetailData = StoryCardData & {
  synopsis: string;
  authors: string[];
  chapters: ChapterData[];
  sourceUrl: string;
  sourceName: string;
  rating: RatingAggregate;
};

export type ChapterPageData = {
  chapterId: string;
  chapterName: string;
  pages: string[];
  sourceUrl: string;
};

type OTruyenCategory = { name?: string; slug?: string };
type OTruyenChapter = {
  chapter_name?: string;
  chapter_title?: string;
  chapter_api_data?: string | null;
  source_name?: string;
};
type OTruyenItem = {
  _id?: string;
  name?: string;
  slug?: string;
  origin_name?: string[];
  status?: string;
  thumb_url?: string | null;
  category?: OTruyenCategory[];
  updatedAt?: string;
  chaptersLatest?: OTruyenChapter[];
  content?: string;
  author?: string[];
  chapters?: Array<{ server_data?: OTruyenChapter[] }>;
  source_name?: string;
  source_url?: string;
};

type OTruyenListPayload = {
  data?: {
    items?: OTruyenItem[];
    APP_DOMAIN_CDN_IMAGE?: string;
    titlePage?: string;
    params?: { pagination?: { currentPage?: number; totalItems?: number; totalItemsPerPage?: number; totalPages?: number } };
  };
};

const DEFAULT_CDN = "https://img.otruyenapi.com";
const jsonCache = new Map<string, { expiresAt: number; value?: unknown; pending?: Promise<unknown> }>();

const scoreBySlug: Record<string, { value: number; source: string }> = {
  "blue-lock": { value: 4.1, source: "AniList · 121K người quan tâm" },
  "gachiakuta": { value: 4.05, source: "AniList · 64K người quan tâm" },
  "wind-breaker": { value: 4.25, source: "AniList · 41K người quan tâm" },
  "dao-hai-tac": { value: 4.47, source: "AniList" },
};

const fallbackStories: StoryCardData[] = [
  {
    id: "fallback-omniscient-reader",
    slug: "omniscient-reader",
    title: "Toàn Tri Độc Giả",
    originTitle: "Omniscient Reader",
    coverUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx119257-Pi21aq3ey9GG.jpg",
    status: "ongoing",
    contentRating: "safe",
    genres: ["Action", "Fantasy", "Webtoon"],
    genreSlugs: ["action", "fantasy", "webtoon"],
    discoveryTags: ["mood-intense", "pace-fast", "format-webtoon"],
    latestChapter: "241",
    latestChapterId: null,
    updatedAt: "2026-07-23T08:00:00Z",
    score: 4.3,
    scoreSource: "AniList · 128K người quan tâm",
    scoreKind: "community",
  },
  {
    id: "fallback-gachiakuta",
    slug: "gachiakuta",
    title: "Gachiakuta",
    originTitle: null,
    coverUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx144946-cscic3n2SwdY.jpg",
    status: "ongoing",
    contentRating: "safe",
    genres: ["Action", "Drama", "Fantasy"],
    genreSlugs: ["action", "drama", "fantasy"],
    discoveryTags: ["mood-intense", "pace-fast"],
    latestChapter: "167",
    latestChapterId: null,
    updatedAt: "2026-07-23T07:00:00Z",
    score: 4.05,
    scoreSource: "AniList · 64K người quan tâm",
    scoreKind: "community",
  },
  {
    id: "fallback-blue-lock",
    slug: "blue-lock",
    title: "Blue Lock",
    originTitle: null,
    coverUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx106130-yPNeuSu75ey1.jpg",
    status: "ongoing",
    contentRating: "safe",
    genres: ["Action", "Drama", "Sports"],
    genreSlugs: ["action", "drama", "sports"],
    discoveryTags: ["mood-intense", "pace-fast"],
    latestChapter: "348",
    latestChapterId: null,
    updatedAt: "2026-07-22T10:00:00Z",
    score: 4.1,
    scoreSource: "AniList · 121K người quan tâm",
    scoreKind: "community",
  },
];

function safeStatus(status?: string): StoryCardData["status"] {
  if (status === "completed") return "completed";
  if (status === "hiatus") return "hiatus";
  if (status === "cancelled") return "cancelled";
  return "ongoing";
}

function stripHtml(value?: string): string {
  return (value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function chapterIdFromUrl(url?: string | null): string | null {
  if (isMangaApiCatalogProvider() && url?.startsWith("/api/v1/")) {
    return encodeMangaApiChapterId(url, "?");
  }
  const match = url?.match(/\/chapter\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    const value = decodeURIComponent(match[1]);
    return /^[a-z0-9._~-]{1,240}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}
export function provisionalCatalogScore(item: OTruyenItem): number {
  const updatedAt = new Date(item.updatedAt ?? 0).getTime();
  const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86_400_000) : 365;
  const latestChapter = Number.parseFloat(item.chaptersLatest?.[0]?.chapter_name ?? "0");
  const recency = Math.max(0, 0.32 - Math.min(0.32, ageDays * 0.012));
  const chapterSignal = Number.isFinite(latestChapter) ? Math.min(0.26, Math.log10(latestChapter + 1) * 0.11) : 0;
  const metadataSignal = Math.min(0.18, (item.category?.length ?? 0) * 0.035)
    + (item.origin_name?.some(Boolean) ? 0.07 : 0)
    + (item.chaptersLatest?.length ? 0.08 : 0);
  const hash = [...(item.slug ?? item.name ?? "")].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 97, 17);
  const stableVariation = (hash / 96 - 0.5) * 0.12;
  return Math.round(Math.min(4.45, Math.max(3.25, 3.35 + recency + chapterSignal + metadataSignal + stableVariation)) * 100) / 100;
}

function ratingTitles(story: Pick<StoryCardData, "title" | "originTitle">): string[] {
  return [
    ...(story.originTitle?.split(/\s*·\s*/).filter(Boolean) ?? []),
    story.title,
  ];
}

function normalizeItem(item: OTruyenItem, cdn = DEFAULT_CDN): StoryCardData {
  const slug = item.slug ?? item._id ?? "khong-ro-ten";
  const latest = item.chaptersLatest?.[0];
  const score = scoreBySlug[slug];
  const provisionalScore = provisionalCatalogScore(item);
  const genreSlugs = item.category?.map((category) => category.slug).filter(Boolean) as string[] ?? [];
  const discoveryTags = deriveAutoTags(genreSlugs, item.name).map((tag) => tag.slug);
  const coverPath = isMangaApiCatalogProvider()
    ? resolveMangaApiCoverUrl(item.thumb_url ?? null)
    : item.thumb_url?.startsWith("http")
      ? item.thumb_url
      : item.thumb_url
        ? `${cdn}/uploads/comics/${item.thumb_url}`
        : null;
  const latestChapterId = latest?.chapter_api_data
    ? isMangaApiCatalogProvider()
      ? encodeMangaApiChapterId(latest.chapter_api_data, latest.chapter_name ?? "?")
      : chapterIdFromUrl(latest.chapter_api_data)
    : null;

  return {
    id: item._id ?? slug,
    slug,
    title: item.name ?? "Chưa rõ tên",
    originTitle: item.origin_name?.filter(Boolean).join(" · ") || null,
    coverUrl: coverPath,
    status: safeStatus(item.status),
    contentRating: inferContentRating(genreSlugs),
    genres: item.category?.map((category) => category.name).filter(Boolean) as string[] ?? [],
    genreSlugs,
    discoveryTags,
    latestChapter: latest?.chapter_name ?? null,
    latestChapterId,
    updatedAt: item.updatedAt ?? new Date(0).toISOString(),
    score: score?.value ?? provisionalScore,
    scoreSource: score?.source ?? "Điểm Mực tạm tính · độ mới và độ đầy đủ dữ liệu",
    scoreKind: score ? "community" : "provisional",
  };
}

async function fetchJson<T>(
  url: string,
  timeoutMs = 5_000,
  ttlMs = 2 * 60 * 1_000,
  headers: Record<string, string> = { Accept: "application/json" },
): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value as T;
    if (cached.pending) return await cached.pending as T;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const pending = (async () => {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    return await response.json() as T;
  })();
  jsonCache.set(url, { expiresAt: Date.now() + ttlMs, pending });
  try {
    const value = await pending;
    jsonCache.set(url, { expiresAt: Date.now() + ttlMs, value });
    return value;
  } catch (error) {
    jsonCache.delete(url);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchComicJson<T>(path: string, timeoutMs = 5_000, ttlMs = 2 * 60 * 1_000): Promise<T> {
  let failure: unknown;
  for (const url of comicApiCandidates(path)) {
    try {
      return await fetchJson<T>(url, timeoutMs, ttlMs, contentApiHeaders(url));
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error("Comic API is unavailable");
}

function mangaApiPayload(payload: MangaApiCatalog): OTruyenListPayload {
  return {
    data: {
      items: payload.data.items,
      params: {
        pagination: {
          currentPage: payload.data.params.pagination.currentPage,
          totalItems: payload.data.params.pagination.totalItems,
          totalItemsPerPage: payload.data.params.pagination.totalItemsPerPage,
          totalPages: payload.data.params.pagination.pageRanges
            ?? payload.data.params.pagination.totalPages
            ?? Math.ceil(
              payload.data.params.pagination.totalItems
              / payload.data.params.pagination.totalItemsPerPage,
            ),
        },
      },
      titlePage: "Manga API · NetTruyen + TruyenQQ",
    },
  };
}

async function fetchProviderList(
  path: string,
  timeoutMs = 5_000,
  ttlMs = 2 * 60 * 1_000,
): Promise<OTruyenListPayload> {
  if (!isMangaApiCatalogProvider()) {
    return await fetchComicJson<OTruyenListPayload>(path, timeoutMs, ttlMs);
  }
  const parsed = new URL(path, "https://manga-api.invalid");
  const page = Math.max(1, Number.parseInt(parsed.searchParams.get("page") ?? "1", 10) || 1);
  const keyword = parsed.searchParams.get("keyword") ?? "";
  const genreMatch = parsed.pathname.match(/^\/the-loai\/([a-z0-9-]+)$/);
  if (parsed.pathname === "/tim-kiem") return mangaApiPayload(await searchMangaApi(keyword, page));
  if (genreMatch) return mangaApiPayload(await getMangaApiGenre(genreMatch[1], page));
  return mangaApiPayload(await getMangaApiCatalog(page, 24));
}

export async function enrichStoriesWithRatings(stories: StoryCardData[]): Promise<StoryCardData[]> {
  if (!stories.length) return stories;
  const requests = stories.map((story) => ({ id: story.id, titles: ratingTitles(story) }));
  const chunks = Array.from({ length: Math.ceil(requests.length / 20) }, (_, index) => requests.slice(index * 20, index * 20 + 20));
  const signalEntries: Array<[string, RatingSignal]> = [];
  for (let index = 0; index < chunks.length; index += 4) {
    const wave = await Promise.all(chunks.slice(index, index + 4).map((chunk) => getAniListRatingSignals(chunk)));
    for (const map of wave) signalEntries.push(...map.entries());
  }
  const signals = new Map(signalEntries);
  return stories.map((story) => {
    const signal = signals.get(story.id);
    if (!signal) return story;
    const positive = signal.positiveRatio === null ? null : Math.round(signal.positiveRatio * 100);
    const reason = positive !== null
      ? `${positive}% đánh giá tích cực`
      : `${signal.voteCount.toLocaleString("vi-VN")} lượt chấm`;
    return {
      ...story,
      score: signal.score5,
      scoreSource: `${signal.sourceName} · ${signal.voteCount.toLocaleString("vi-VN")} lượt chấm`,
      scoreKind: "community",
      ratingVotes: signal.voteCount,
      positiveRatio: signal.positiveRatio,
      negativeRatio: signal.negativeRatio,
      recommendationScore: signal.qualityScore,
      recommendationReason: reason,
    };
  });
}

export async function getCommunityRecommendations(): Promise<StoryCardData[]> {
  const [home, pageOne, pageTwo] = await Promise.all([
    getHomeStories(),
    getDiscoverCatalog({ page: 1 }).then((page) => page.stories).catch(() => []),
    getDiscoverCatalog({ page: 2 }).then((page) => page.stories).catch(() => []),
  ]);
  const pool = [...new Map([...home, ...pageOne, ...pageTwo].map((story) => [story.id, story])).values()].slice(0, 42);
  const enriched = await enrichStoriesWithRatings(pool);
  const verified = enriched
    .filter((story) => story.scoreKind === "community" && story.score !== null && (story.ratingVotes ?? 0) >= 10)
    .sort((left, right) =>
      (right.score ?? 0) - (left.score ?? 0)
      || (right.ratingVotes ?? 0) - (left.ratingVotes ?? 0)
    )
    .slice(0, 14);
  const reviewSignals = await getCommunityReviewSignals(verified.map((story) => ({
    id: story.id,
    titles: ratingTitles(story),
  })));
  const wellRated = enriched
    .filter((story) => verified.some((candidate) => candidate.id === story.id))
    .map((story) => {
      const review = reviewSignals.get(story.id);
      const reviewPositive = review?.positiveReviewRatio ?? review?.helpfulApprovalRatio ?? null;
      const quality = (story.score ?? 0) * 18
        + Math.min(16, Math.log10((story.ratingVotes ?? 0) + 1) * 5)
        + (review?.qualityScore ?? 0) * .24;
      return {
        ...story,
        recommendationScore: quality,
        recommendationReason: reviewPositive === null
          ? `${(story.ratingVotes ?? 0).toLocaleString("vi-VN")} lượt chấm đã xác minh`
          : `${Math.round(reviewPositive * 100)}% review tích cực`,
      };
    })
    .filter((story) => (story.score ?? 0) >= 3.65)
    .sort((left, right) => (right.recommendationScore ?? 0) - (left.recommendationScore ?? 0));
  return wellRated.slice(0, 6);
}

export async function getHomeStories(): Promise<StoryCardData[]> {
  try {
    const payload = await fetchProviderList("/home", 2_500);
    const items = payload.data?.items ?? [];
    if (!items.length) return fallbackStories;
    return items.map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE));
  } catch {
    return fallbackStories;
  }
}

export async function searchStories(query: string, page = 1): Promise<StoryCardData[]> {
  if (!query.trim()) return getHomeStories();
  const [otruyen, mangadex] = await Promise.all([
    (async () => {
      try {
    const payload = await fetchProviderList(
      `/tim-kiem?keyword=${encodeURIComponent(query.trim())}&page=${Math.max(1, page)}`,
    );
    return (payload.data?.items ?? []).map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE));
      } catch {
        const lowered = query.toLocaleLowerCase("vi");
        return fallbackStories.filter((story) => story.title.toLocaleLowerCase("vi").includes(lowered));
      }
    })(),
    !isMangaApiCatalogProvider() && page === 1
      ? searchMangaDexStories(query, 20).catch(() => [])
      : Promise.resolve([]),
  ]);
  const merged = new Map<string, StoryCardData>();
  for (const story of [...otruyen, ...mangadex]) {
    const key = normalizeTitle(story.title);
    const existing = merged.get(key);
    if (!existing || (!existing.latestChapterId && story.latestChapterId)) merged.set(key, story);
  }
  return [...merged.values()];
}

export async function getLatestMultiSourceStories(limit = 10): Promise<StoryCardData[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 10, 1), 20);
  if (isMangaApiCatalogProvider()) {
    return (await getDiscoverCatalog({ page: 1 })).stories.slice(0, safeLimit);
  }
  const [otruyen, mangadex] = await Promise.all([
    getDiscoverCatalog({ page: 1 }).then((catalog) => catalog.stories).catch(() => []),
    getMangaDexLatestStories(safeLimit * 2).catch(() => []),
  ]);
  const oTruyenByTitle = new Map(otruyen.map((story) => [normalizeTitle(story.title), story]));
  const mangaDexUnique = mangadex.filter((story) => !oTruyenByTitle.has(normalizeTitle(story.title)));
  const oTruyenTarget = Math.min(otruyen.length, Math.ceil(safeLimit * 0.6));
  const mangaDexTarget = Math.min(mangaDexUnique.length, safeLimit - oTruyenTarget);
  const selected = [...otruyen.slice(0, oTruyenTarget), ...mangaDexUnique.slice(0, mangaDexTarget)];
  if (selected.length < safeLimit) {
    const selectedIds = new Set(selected.map((story) => story.id));
    selected.push(...[...otruyen, ...mangaDexUnique].filter((story) => !selectedIds.has(story.id)).slice(0, safeLimit - selected.length));
  }
  return selected
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, safeLimit);
}

function storySearchSimilarity(query: string, story: StoryCardData) {
  return Math.max(titleSimilarity(query, story.title), story.originTitle ? titleSimilarity(query, story.originTitle) : 0);
}

async function fuzzyTitleSuggestions(query: string, existing: StoryCardData[]): Promise<StoryCardData[]> {
  const queryTokens = normalizeTitle(query)
    .split(" ")
    .filter((token) => token.length >= 3)
    .sort((left, right) => right.length - left.length)
    .slice(0, 2);
  const paths = [
    "/home",
    "/danh-sach/truyen-moi?page=1",
    "/danh-sach/truyen-moi?page=2",
    "/danh-sach/truyen-moi?page=3",
    ...queryTokens.map((token) => `/tim-kiem?keyword=${encodeURIComponent(token)}&page=1`),
  ];
  const settled = await Promise.allSettled(paths.map((path) => fetchProviderList(path, 4_500, 5 * 60 * 1_000)));
  const candidates = [
    ...existing,
    ...settled.flatMap((result) => result.status === "fulfilled"
      ? (result.value.data?.items ?? []).map((item) => normalizeItem(item, result.value.data?.APP_DOMAIN_CDN_IMAGE))
      : []),
  ];
  const deduped = [...new Map(candidates.map((story) => [story.id, story])).values()];
  return deduped
    .map((story) => ({ story, similarity: storySearchSimilarity(query, story) }))
    .filter((item) => item.similarity >= 0.2)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 8)
    .map((item) => item.story);
}

export async function getDiscoverCatalog({
  query = "",
  page = 1,
  primaryGenre,
  status,
  enrichRatings = false,
}: {
  query?: string;
  page?: number;
  primaryGenre?: string;
  status?: string;
  enrichRatings?: boolean;
}): Promise<CatalogPageData> {
  const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), 500);
  let path = `/danh-sach/truyen-moi?page=${safePage}`;
  if (query.trim()) path = `/tim-kiem?keyword=${encodeURIComponent(query.trim())}&page=${safePage}`;
  else if (primaryGenre && /^[a-z0-9-]{1,80}$/.test(primaryGenre)) path = `/the-loai/${primaryGenre}?page=${safePage}`;
  else if (!isMangaApiCatalogProvider() && status === "completed") path = `/danh-sach/hoan-thanh?page=${safePage}`;
  else if (!isMangaApiCatalogProvider() && status === "ongoing") path = `/danh-sach/dang-phat-hanh?page=${safePage}`;

  try {
    const payload = await fetchProviderList(path);
    const pagination = payload.data?.params?.pagination;
    let stories = (payload.data?.items ?? []).map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE));
    const pageSize = pagination?.totalItemsPerPage ?? (stories.length || 24);
    let totalItems = pagination?.totalItems ?? stories.length;
    let totalPages = pagination?.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));
    let sourceLabel = payload.data?.titlePage ?? contentApiSourceName();
    let searchNotice: CatalogPageData["searchNotice"];
    if (query.trim()) {
      if (safePage === 1) {
        const extra = isMangaApiCatalogProvider()
          ? []
          : await searchMangaDexStories(query, pageSize).catch(() => []);
        const merged = new Map<string, StoryCardData>();
        for (const story of [...stories, ...extra]) {
          const key = normalizeTitle(story.title);
          const existing = merged.get(key);
          if (!existing || (!existing.latestChapterId && story.latestChapterId)) merged.set(key, story);
        }
        const extraCount = Math.max(0, merged.size - stories.length);
        stories = [...merged.values()].slice(0, pageSize);
        totalItems += extraCount;
        totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        if (extra.length) sourceLabel = `${sourceLabel} + MangaDex`;
      }
      const exactMatch = stories.some((story) =>
        normalizeTitle(story.title) === normalizeTitle(query)
        || Boolean(story.originTitle && normalizeTitle(story.originTitle) === normalizeTitle(query))
        || storySearchSimilarity(query, story) >= 0.9
      );
      if (!exactMatch) {
        const suggestions = await fuzzyTitleSuggestions(query, stories);
        if (!stories.length) {
          stories = suggestions;
          totalItems = suggestions.length;
          totalPages = 1;
          sourceLabel = `Gợi ý tên gần đúng từ ${contentApiSourceName()}`;
        }
        searchNotice = {
          requestedQuery: query,
          exactMatch: false,
          suggestions: suggestions.slice(0, 5).map((story) => ({
            slug: story.slug,
            title: story.title,
            similarity: storySearchSimilarity(query, story),
          })),
        };
      } else {
        searchNotice = { requestedQuery: query, exactMatch: true, suggestions: [] };
      }
    }
    if (enrichRatings) stories = await enrichStoriesWithRatings(stories);
    return {
      stories,
      page: pagination?.currentPage ?? safePage,
      pageSize,
      totalItems,
      totalPages,
      sourceLabel,
      searchNotice,
    };
  } catch (error) {
    if (isMangaApiCatalogProvider()) throw error;
    const stories = await searchStories(query, safePage);
    return { stories, page: safePage, pageSize: stories.length || 24, totalItems: stories.length, totalPages: 1, sourceLabel: "Bản dự phòng" };
  }
}

function discoverListPath({
  query,
  primaryGenre,
  status,
  page,
}: {
  query: string;
  primaryGenre?: string;
  status?: string;
  page: number;
}) {
  if (query.trim()) return `/tim-kiem?keyword=${encodeURIComponent(query.trim())}&page=${page}`;
  if (primaryGenre && /^[a-z0-9-]{1,80}$/.test(primaryGenre)) return `/the-loai/${primaryGenre}?page=${page}`;
  if (!isMangaApiCatalogProvider() && status === "completed") return `/danh-sach/hoan-thanh?page=${page}`;
  if (!isMangaApiCatalogProvider() && status === "ongoing") return `/danh-sach/dang-phat-hanh?page=${page}`;
  return `/danh-sach/truyen-moi?page=${page}`;
}

export async function getFilteredDiscoverCatalog({
  query = "",
  page = 1,
  pageSize = 24,
  include = [],
  exclude = [],
  status,
  mood = "",
  format = "",
  pace = "",
  minScore = 0,
  maxChapters = 0,
  sort = "latest",
  scanPages = 12,
}: DiscoverCatalogFilters): Promise<CatalogPageData> {
  const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 24, 1), 48);
  const safeScanPages = Math.min(Math.max(Math.floor(scanPages) || 1, 1), 16);
  const primaryGenre = include[0];
  const needsGlobalFiltering = include.length > 1
    || exclude.length > 0
    || Boolean(mood || format || pace || minScore || maxChapters)
    || sort !== "latest";
  if (!needsGlobalFiltering) {
    return await getDiscoverCatalog({
      query,
      page,
      primaryGenre,
      status,
      enrichRatings: false,
    });
  }

  try {
    const firstPayload = await fetchProviderList(
      discoverListPath({ query, primaryGenre, status, page: 1 }),
    );
    const upstreamPagination = firstPayload.data?.params?.pagination;
    const upstreamPages = (
      upstreamPagination?.totalPages
      ?? Math.ceil((upstreamPagination?.totalItems ?? 0) / Math.max(1, upstreamPagination?.totalItemsPerPage ?? 24))
    ) || 1;
    const pagesToScan = Math.min(Math.max(upstreamPages, 1), safeScanPages);
    const remaining = await Promise.allSettled(
      Array.from({ length: Math.max(0, pagesToScan - 1) }, (_, index) => index + 2)
        .map((sourcePage) => fetchProviderList(
          discoverListPath({ query, primaryGenre, status, page: sourcePage }),
          5_000,
          5 * 60 * 1_000,
        )),
    );
    const payloads = [
      firstPayload,
      ...remaining.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    ];
    let candidates = payloads.flatMap((payload) =>
      (payload.data?.items ?? []).map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE)),
    );
    if (query.trim()) {
      const mangaDexCandidates = isMangaApiCatalogProvider()
        ? []
        : await searchMangaDexStories(query, 32).catch(() => []);
      candidates.push(...mangaDexCandidates);
    }
    candidates = [...new Map(candidates.map((story) => [story.id, story])).values()];

    const needsCommunityRating = sort === "rating" || minScore > 0;
    if (needsCommunityRating) candidates = await enrichStoriesWithRatings(candidates);

    const filtered = candidates.filter((story) => {
      const tags = new Set([...story.genreSlugs, ...story.discoveryTags]);
      const includeOkay = include.length === 0 || include.every((slug) => tags.has(slug));
      const excludeOkay = exclude.every((slug) => !tags.has(slug));
      const statusOkay = !status || story.status === status;
      const moodOkay = !mood || tags.has(mood);
      const formatOkay = !format || tags.has(format);
      const paceOkay = !pace || tags.has(pace);
      const scoreOkay = !minScore || (story.score !== null && story.score >= minScore);
      const chapterCount = Number.parseFloat(story.latestChapter ?? "0");
      const lengthOkay = !maxChapters || (Number.isFinite(chapterCount) && chapterCount <= maxChapters);
      return includeOkay && excludeOkay && statusOkay && moodOkay && formatOkay && paceOkay && scoreOkay && lengthOkay;
    });

    filtered.sort((left, right) => {
      if (sort === "rating") {
        const verifiedDifference = Number(right.scoreKind === "community") - Number(left.scoreKind === "community");
        return verifiedDifference
          || (right.recommendationScore ?? right.score ?? -1) - (left.recommendationScore ?? left.score ?? -1)
          || (right.ratingVotes ?? 0) - (left.ratingVotes ?? 0);
      }
      if (sort === "relevance" && query) return storySearchSimilarity(query, right) - storySearchSimilarity(query, left);
      if (sort === "shortest") return Number.parseFloat(left.latestChapter ?? "999999") - Number.parseFloat(right.latestChapter ?? "999999");
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
    const offset = (safePage - 1) * safePageSize;
    let searchNotice: CatalogPageData["searchNotice"];
    if (query.trim()) {
      const exactMatch = candidates.some((story) =>
        normalizeTitle(story.title) === normalizeTitle(query)
        || Boolean(story.originTitle && normalizeTitle(story.originTitle) === normalizeTitle(query))
        || storySearchSimilarity(query, story) >= 0.9
      );
      if (!exactMatch) {
        const suggestions = await fuzzyTitleSuggestions(query, candidates);
        searchNotice = {
          requestedQuery: query,
          exactMatch: false,
          suggestions: suggestions.slice(0, 5).map((story) => ({
            slug: story.slug,
            title: story.title,
            similarity: storySearchSimilarity(query, story),
          })),
        };
      } else {
        searchNotice = { requestedQuery: query, exactMatch: true, suggestions: [] };
      }
    }

    return {
      stories: filtered.slice(offset, offset + safePageSize),
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
      sourceLabel: `Chỉ mục hợp nhất ${candidates.length.toLocaleString("vi-VN")} truyện · lọc trước khi chia trang`,
      searchNotice,
    };
  } catch (error) {
    if (isMangaApiCatalogProvider()) throw error;
    const fallback = await getDiscoverCatalog({
      query,
      page,
      primaryGenre,
      status,
      enrichRatings: sort === "rating" || minScore > 0,
    });
    return { ...fallback, sourceLabel: `${fallback.sourceLabel} · chế độ dự phòng` };
  }
}

export async function getStory(
  slug: string,
  options: { includeExternalRating?: boolean } = {},
): Promise<StoryDetailData | null> {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  if (isMangaApiCatalogProvider()) {
    const { payload, sourceUrl } = await getMangaApiDetail(slug);
    const item = payload.data.item;
    const chapterRows = item.chapters.flatMap((server) => server.server_data);
    const seenChapterNumbers = new Set<string>();
    const chapters = chapterRows
      .map((chapter) => ({
        id: encodeMangaApiChapterId(chapter.chapter_api_data, chapter.chapter_name),
        number: chapter.chapter_name,
        title: "",
        apiUrl: resolveMangaApiApiUrl(chapter.chapter_api_data),
      }))
      .filter((chapter) => {
        if (seenChapterNumbers.has(chapter.number)) return false;
        seenChapterNumbers.add(chapter.number);
        return true;
      })
      .sort((left, right) =>
        (Number.parseFloat(right.number) || 0) - (Number.parseFloat(left.number) || 0)
        || right.number.localeCompare(left.number, "vi", { numeric: true })
      );
    const summary = normalizeItem({
      _id: item._id,
      name: item.name,
      slug: item.slug,
      thumb_url: item.thumb_url,
      category: item.category.map((category) => ({
        name: category.name,
        slug: category.name.toLowerCase().replace(/\s+/g, "-"),
      })),
      updatedAt: new Date(0).toISOString(),
      chaptersLatest: chapters[0]
        ? [{
          chapter_name: chapters[0].number,
          chapter_api_data: chapterRows[0]?.chapter_api_data,
        }]
        : [],
    });
    const rating = options.includeExternalRating === false
      ? aggregateRatings([])
      : await getExternalRating([item.name]);
    return {
      ...summary,
      latestChapter: chapters[0]?.number ?? null,
      latestChapterId: chapters[0]?.id ?? null,
      synopsis: "Manga API chưa cung cấp tóm tắt; mục lục và ảnh đọc được lấy từ nguồn aggregator hiện tại.",
      authors: [],
      chapters,
      sourceUrl,
      sourceName: `Manga API · ${item.current_source.toUpperCase()}${item.is_pinned ? " · PINNED" : ""}`,
      rating,
      score: rating.score5 ?? summary.score,
      scoreSource: rating.score5
        ? `${rating.isAggregate ? "Tổng hợp" : "Điểm nguồn"} · ${rating.sources.map((source) => source.sourceName).join(" + ")}`
        : summary.scoreSource,
      scoreKind: rating.score5 ? "community" : summary.scoreKind,
    };
  }
  if (slug.startsWith("mangadex-")) return await getMangaDexStory(slug);
  try {
    const payload = await fetchComicJson<{
      data?: { item?: OTruyenItem; APP_DOMAIN_CDN_IMAGE?: string };
    }>(`/truyen-tranh/${slug}`);
    const item = payload.data?.item;
    if (!item) return null;
    const summary = normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE);
    const rating = options.includeExternalRating === false
      ? aggregateRatings([])
      : await getExternalRating([...(item.origin_name ?? []), item.name ?? ""]);
    const chapterRows = item.chapters?.flatMap((server) => server.server_data ?? []) ?? [];
    const seenChapterNumbers = new Set<string>();
    const chapters = chapterRows
      .map((chapter) => ({
        id: chapterIdFromUrl(chapter.chapter_api_data) ?? "",
        number: chapter.chapter_name ?? "?",
        title: chapter.chapter_title ?? "",
        apiUrl: chapter.chapter_api_data ?? "",
      }))
      .filter((chapter) => chapter.id)
      .filter((chapter) => {
        if (seenChapterNumbers.has(chapter.number)) return false;
        seenChapterNumbers.add(chapter.number);
        return true;
      })
      .sort((left, right) =>
        (Number.parseFloat(right.number) || 0) - (Number.parseFloat(left.number) || 0)
        || right.number.localeCompare(left.number, "vi", { numeric: true })
      );

    return {
      ...summary,
      score: rating.score5 ?? summary.score,
      scoreSource: rating.score5
        ? `${rating.isAggregate ? "Tổng hợp" : "Điểm nguồn"} · ${rating.sources.map((source) => source.sourceName).join(" + ")}`
        : summary.scoreSource,
      scoreKind: rating.score5 ? "community" : summary.scoreKind,
      latestChapter: summary.latestChapter ?? chapters[0]?.number ?? null,
      latestChapterId: summary.latestChapterId ?? chapters[0]?.id ?? null,
      synopsis: stripHtml(item.content) || "Nguồn chưa cung cấp tóm tắt cho truyện này.",
      authors: item.author?.filter(Boolean) ?? [],
      chapters,
      sourceUrl: item.source_url ?? `https://otruyen.cc/truyen-tranh/${slug}`,
      sourceName: item.source_name ? `${contentApiSourceName()} · ${item.source_name}` : contentApiSourceName(),
      rating,
    };
  } catch {
    return null;
  }
}

export async function getChapterPages(chapterId: string): Promise<ChapterPageData | null> {
  if (isMangaApiCatalogProvider()) {
    try {
      const chapter = await getMangaApiChapter(chapterId);
      return {
        chapterId,
        chapterName: chapter.chapterName,
        pages: chapter.pages,
        sourceUrl: chapter.sourceUrl,
      };
    } catch (error) {
      if (error instanceof MangaApiError && error.status === 404) return null;
      throw error;
    }
  }
  if (!/^[a-z0-9._~-]{1,240}$/i.test(chapterId)) return null;
  try {
    type ChapterPayload = {
      data?: {
        domain_cdn?: string;
        item?: {
          chapter_name?: string;
          chapter_path?: string;
          chapter_image?: Array<{ image_file?: string }>;
        };
      };
    };
    let payload: ChapterPayload | null = null;
    let apiUrl = getContentApiConfiguration().baseUrl
      ? `${getContentApiConfiguration().baseUrl}/chapter/${encodeURIComponent(chapterId)}`
      : "";
    try {
      payload = await fetchComicJson<ChapterPayload>(
        `/chapter/${encodeURIComponent(chapterId)}`,
        8_000,
        5 * 60 * 1_000,
      );
    } catch {
      payload = null;
    }
    if (!payload?.data?.item && /^[a-f0-9]{24}$/i.test(chapterId)) {
      for (const server of ["sv1", "sv2", "sv3"]) {
        apiUrl = `https://${server}.otruyencdn.com/v1/api/chapter/${chapterId}`;
        try {
          payload = await fetchJson<ChapterPayload>(apiUrl, 6_000, 5 * 60 * 1_000);
          if (payload.data?.item) break;
        } catch {
          payload = null;
        }
      }
    }
    if (!payload) return null;
    const rawDomain = payload.data?.domain_cdn?.replace(/\/+$/, "");
    const item = payload.data?.item;
    if (!rawDomain || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(rawDomain)) return null;
    if (!item?.chapter_path || item.chapter_path.includes("..")) return null;
    const cleanPath = item.chapter_path.replace(/^\/+|\/+$/g, "");
    const pages = (item.chapter_image ?? [])
      .map((image) => image.image_file)
      .filter((file): file is string => Boolean(file && /^[a-z0-9_.-]+$/i.test(file)))
      .map((file) => `${rawDomain}/${cleanPath}/${file}`);
    if (!pages.length) return null;
    return {
      chapterId,
      chapterName: item.chapter_name ?? "?",
      pages,
      sourceUrl: apiUrl || `${rawDomain}/${cleanPath}`,
    };
  } catch {
    return null;
  }
}

