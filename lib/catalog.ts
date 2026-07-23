import { deriveAutoTags, inferContentRating } from "./auto-tags";
import { getExternalRating } from "./external-ratings";
import type { RatingAggregate } from "./ratings";

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
};

export type CatalogPageData = {
  stories: StoryCardData[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sourceLabel: string;
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

async function fetchJson<T>(url: string, timeoutMs = 7000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
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

export async function getDiscoverCatalog({
  query = "",
  page = 1,
  primaryGenre,
  status,
}: {
  query?: string;
  page?: number;
  primaryGenre?: string;
  status?: string;
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
    const stories = (payload.data?.items ?? []).map((item) => normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE));
    const pageSize = pagination?.totalItemsPerPage ?? (stories.length || 24);
    const totalItems = pagination?.totalItems ?? stories.length;
    return {
      stories,
      page: pagination?.currentPage ?? safePage,
      pageSize,
      totalItems,
      totalPages: pagination?.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize)),
      sourceLabel: payload.data?.titlePage ?? "OTruyen API",
    };
  } catch {
    const stories = await searchStories(query, safePage);
    return { stories, page: safePage, pageSize: stories.length || 24, totalItems: stories.length, totalPages: 1, sourceLabel: "Bản dự phòng" };
  }
}

export async function getStory(slug: string): Promise<StoryDetailData | null> {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  try {
    const payload = await fetchJson<{
      data?: { item?: OTruyenItem; APP_DOMAIN_CDN_IMAGE?: string };
    }>(`${API_BASE}/truyen-tranh/${slug}`);
    const item = payload.data?.item;
    if (!item) return null;
    const summary = normalizeItem(item, payload.data?.APP_DOMAIN_CDN_IMAGE);
    const rating = await getExternalRating([item.name ?? "", ...(item.origin_name ?? [])]);
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
