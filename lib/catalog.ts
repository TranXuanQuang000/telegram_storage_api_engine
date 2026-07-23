import { deriveAutoTags, inferContentRating } from "./auto-tags";
import { getAniListRatingSignals, getExternalRating } from "./external-ratings";
import { aggregateRatings, type RatingAggregate } from "./ratings";
import { normalizeTitle, titleSimilarity } from "./search-utils";

export type StoryCardData = {
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
  chapter_api_data?: string;
};
type OTruyenItem = {
  _id?: string;
  name?: string;
  slug?: string;
  origin_name?: string[];
  status?: string;
  thumb_url?: string;
  category?: OTruyenCategory[];
  updatedAt?: string;
  chaptersLatest?: OTruyenChapter[];
  content?: string;
  author?: string[];
  chapters?: Array<{ server_data?: OTruyenChapter[] }>;
};

type OTruyenListPayload = {
  data?: {
    items?: OTruyenItem[];
    APP_DOMAIN_CDN_IMAGE?: string;
    titlePage?: string;
    params?: { pagination?: { currentPage?: number; totalItems?: number; totalItemsPerPage?: number; totalPages?: number } };
  };
};

const API_BASE = "https://otruyenapi.com/v1/api";
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

function chapterIdFromUrl(url?: string): string | null {
  const match = url?.match(/\/chapter\/([a-f0-9]{24})/i);
  return match?.[1] ?? null;
}

function normalizeItem(item: OTruyenItem, cdn = DEFAULT_CDN): StoryCardData {
  const slug = item.slug ?? item._id ?? "khong-ro-ten";
  const latest = item.chaptersLatest?.[0];
  const score = scoreBySlug[slug];
  const genreSlugs = item.category?.map((category) => category.slug).filter(Boolean) as string[] ?? [];
  const discoveryTags = deriveAutoTags(genreSlugs, item.name).map((tag) => tag.slug);
  const coverPath = item.thumb_url?.startsWith("http")
    ? item.thumb_url
    : item.thumb_url
      ? `${cdn}/uploads/comics/${item.thumb_url}`
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
    latestChapterId: chapterIdFromUrl(latest?.chapter_api_data),
    updatedAt: item.updatedAt ?? new Date(0).toISOString(),
    score: score?.value ?? null,
    scoreSource: score?.source ?? null,
  };
}

async function fetchJson<T>(url: string, timeoutMs = 5_000, ttlMs = 2 * 60 * 1_000): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value as T;
    if (cached.pending) return await cached.pending as T;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const pending = (async () => {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
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

export async function enrichStoriesWithRatings(stories: StoryCardData[]): Promise<StoryCardData[]> {
  if (!stories.length) return stories;
  const signals = await getAniListRatingSignals(stories.map((story) => ({
    id: story.id,
    titles: [story.title, story.originTitle ?? ""],
  })));
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
      ratingVotes: signal.voteCount,
      positiveRatio: signal.positiveRatio,
      negativeRatio: signal.negativeRatio,
      recommendationScore: signal.qualityScore,
      recommendationReason: reason,
    };
  });
}

export async function getCommunityRecommendations(): Promise<StoryCardData[]> {
  const latest = await getHomeStories();
  const enriched = await enrichStoriesWithRatings(latest.slice(0, 18));
  const wellRated = enriched
    .filter((story) => story.score !== null && story.score >= 3.7 && (story.negativeRatio ?? 0) <= 0.18)
    .sort((left, right) =>
      (right.recommendationScore ?? right.score ?? 0) - (left.recommendationScore ?? left.score ?? 0)
      || (right.ratingVotes ?? 0) - (left.ratingVotes ?? 0)
    );
  return (wellRated.length >= 4 ? wellRated : enriched.filter((story) => story.score !== null).sort((left, right) => (right.score ?? 0) - (left.score ?? 0))).slice(0, 6);
}

export async function getHomeStories(): Promise<StoryCardData[]> {
  try {
    const payload = await fetchJson<{
      data?: { items?: OTruyenItem[]; APP_DOMAIN_CDN_IMAGE?: string };
    }>(`${API_BASE}/home`);
    const items = payload.data?.items ?? [];
    if (!items.length) return fallbackStories;
    return items.map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE));
  } catch {
    return fallbackStories;
  }
}

export async function searchStories(query: string, page = 1): Promise<StoryCardData[]> {
  if (!query.trim()) return getHomeStories();
  try {
    const payload = await fetchJson<{
      data?: { items?: OTruyenItem[]; APP_DOMAIN_CDN_IMAGE?: string };
    }>(`${API_BASE}/tim-kiem?keyword=${encodeURIComponent(query.trim())}&page=${Math.max(1, page)}`);
    return (payload.data?.items ?? []).map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE));
  } catch {
    const lowered = query.toLocaleLowerCase("vi");
    return fallbackStories.filter((story) => story.title.toLocaleLowerCase("vi").includes(lowered));
  }
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
  const urls = [
    `${API_BASE}/home`,
    `${API_BASE}/danh-sach/truyen-moi?page=1`,
    `${API_BASE}/danh-sach/truyen-moi?page=2`,
    `${API_BASE}/danh-sach/truyen-moi?page=3`,
    ...queryTokens.map((token) => `${API_BASE}/tim-kiem?keyword=${encodeURIComponent(token)}&page=1`),
  ];
  const settled = await Promise.allSettled(urls.map((url) => fetchJson<OTruyenListPayload>(url, 4_500, 5 * 60 * 1_000)));
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
  else if (status === "completed") path = `/danh-sach/hoan-thanh?page=${safePage}`;
  else if (status === "ongoing") path = `/danh-sach/dang-phat-hanh?page=${safePage}`;

  try {
    const payload = await fetchJson<OTruyenListPayload>(`${API_BASE}${path}`);
    const pagination = payload.data?.params?.pagination;
    let stories = (payload.data?.items ?? []).map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE));
    const pageSize = pagination?.totalItemsPerPage ?? (stories.length || 24);
    let totalItems = pagination?.totalItems ?? stories.length;
    let totalPages = pagination?.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));
    let sourceLabel = payload.data?.titlePage ?? "OTruyen API";
    let searchNotice: CatalogPageData["searchNotice"];
    if (query.trim()) {
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
          sourceLabel = "Gợi ý tên gần đúng từ OTruyen";
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
  } catch {
    const stories = await searchStories(query, safePage);
    return { stories, page: safePage, pageSize: stories.length || 24, totalItems: stories.length, totalPages: 1, sourceLabel: "Bản dự phòng" };
  }
}

export async function getStory(
  slug: string,
  options: { includeExternalRating?: boolean } = {},
): Promise<StoryDetailData | null> {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  try {
    const payload = await fetchJson<{
      data?: { item?: OTruyenItem; APP_DOMAIN_CDN_IMAGE?: string };
    }>(`${API_BASE}/truyen-tranh/${slug}`);
    const item = payload.data?.item;
    if (!item) return null;
    const summary = normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE);
    const rating = options.includeExternalRating === false
      ? aggregateRatings([])
      : await getExternalRating([item.name ?? "", ...(item.origin_name ?? [])]);
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
      .reverse()
      .filter((chapter) => {
        if (seenChapterNumbers.has(chapter.number)) return false;
        seenChapterNumbers.add(chapter.number);
        return true;
      });

    return {
      ...summary,
      score: rating.score5 ?? summary.score,
      scoreSource: rating.score5
        ? `${rating.isAggregate ? "Tổng hợp" : "Điểm nguồn"} · ${rating.sources.map((source) => source.sourceName).join(" + ")}`
        : summary.scoreSource,
      latestChapter: chapters[0]?.number ?? summary.latestChapter,
      latestChapterId: chapters[0]?.id ?? summary.latestChapterId,
      synopsis: stripHtml(item.content) || "Nguồn chưa cung cấp tóm tắt cho truyện này.",
      authors: item.author?.filter(Boolean) ?? [],
      chapters,
      sourceUrl: `https://otruyen.cc/truyen-tranh/${slug}`,
      rating,
    };
  } catch {
    return null;
  }
}

export async function getChapterPages(chapterId: string): Promise<ChapterPageData | null> {
  if (!/^[a-f0-9]{24}$/i.test(chapterId)) return null;
  try {
    const apiUrl = `https://sv1.otruyencdn.com/v1/api/chapter/${chapterId}`;
    const payload = await fetchJson<{
      data?: {
        domain_cdn?: string;
        item?: {
          chapter_name?: string;
          chapter_path?: string;
          chapter_image?: Array<{ image_file?: string }>;
        };
      };
    }>(apiUrl);
    const domain = payload.data?.domain_cdn;
    const item = payload.data?.item;
    if (!domain || !/^https:\/\/sv\d+\.otruyencdn\.com$/i.test(domain)) return null;
    if (!item?.chapter_path || item.chapter_path.includes("..")) return null;
    const pages = (item.chapter_image ?? [])
      .map((image) => image.image_file)
      .filter((file): file is string => Boolean(file && /^[a-z0-9_.-]+$/i.test(file)))
      .map((file) => `${domain}/${item.chapter_path}/${file}`);
    if (!pages.length) return null;
    return {
      chapterId,
      chapterName: item.chapter_name ?? "?",
      pages,
      sourceUrl: apiUrl,
    };
  } catch {
    return null;
  }
}

export function formatRelativeDate(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "chưa rõ";
  const diff = Date.now() - time;
  const days = Math.max(0, Math.round(diff / 86_400_000));
  if (days === 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  if (days < 30) return `${days} ngày trước`;
  const months = Math.round(days / 30);
  return `${months} tháng trước`;
}
