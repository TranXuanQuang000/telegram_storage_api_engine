import {
  getDiscoverCatalog,
  getStory,
  getChapterPages,
  type StoryCardData,
} from "./catalog";
import { getNovel, getNovelCatalog, getNovelChapter, type NovelSummary } from "./novels";
import {
  getMangaDexLatestStories,
  getMangaDexStory,
  searchMangaDexStories,
} from "./sources/mangadex";
import { getAniListStory, queryAniListStories } from "./sources/anilist";
import { normalizeTitle } from "./search-utils";

export type SourceHubId = "otruyen" | "mangadex" | "wikisource" | "anilist";
export type SourceAccess = "reader" | "metadata-only";

export type SourceManifest = {
  id: SourceHubId;
  name: string;
  media: "comic" | "novel";
  access: SourceAccess;
  attributionRequired: true;
  capabilities: Array<"latest" | "search" | "detail" | "chapters" | "content" | "preview">;
  sourceUrl: string;
  policyUrl: string;
  rightsNote: string;
};

export const SOURCE_MANIFESTS: Record<SourceHubId, SourceManifest> = {
  otruyen: {
    id: "otruyen",
    name: "OTruyen API",
    media: "comic",
    access: "reader",
    attributionRequired: true,
    capabilities: ["latest", "search", "detail", "chapters", "content"],
    sourceUrl: "https://otruyenapi.com",
    policyUrl: "https://otruyenapi.com",
    rightsNote: "Dữ liệu và media do API của nhà cung cấp trả về; luôn giữ dẫn nguồn và không tạo bản sao lâu dài trên server Mực.",
  },
  mangadex: {
    id: "mangadex",
    name: "MangaDex",
    media: "comic",
    access: "metadata-only",
    attributionRequired: true,
    capabilities: ["latest", "search", "detail"],
    sourceUrl: "https://mangadex.org",
    policyUrl: "https://api.mangadex.org/docs/",
    rightsNote: "Chỉ lập chỉ mục metadata và dẫn về MangaDex; API Mực không trả trang truyện hoặc chương từ nguồn này.",
  },
  wikisource: {
    id: "wikisource",
    name: "Wikisource tiếng Việt",
    media: "novel",
    access: "reader",
    attributionRequired: true,
    capabilities: ["latest", "search", "detail", "chapters", "content"],
    sourceUrl: "https://vi.wikisource.org",
    policyUrl: "https://vi.wikisource.org/wiki/Wikisource:Quy_định_về_bản_quyền",
    rightsNote: "Chỉ đọc các văn bản Wikisource công khai; kết quả luôn kèm liên kết và thông tin nguồn.",
  },
  anilist: {
    id: "anilist",
    name: "AniList",
    media: "comic",
    access: "metadata-only",
    attributionRequired: true,
    capabilities: ["latest", "search", "detail"],
    sourceUrl: "https://anilist.co",
    policyUrl: "https://anilist.gitbook.io/anilist-apiv2-docs/",
    rightsNote: "Chỉ dùng API GraphQL để tìm kiếm và lập chỉ mục metadata; không tải hoặc phát lại trang truyện.",
  },
};

export function isSourceHubId(value: string): value is SourceHubId {
  return value === "otruyen"
    || value === "mangadex"
    || value === "wikisource"
    || value === "anilist";
}

export type SourceHubItem = StoryCardData & {
  source: SourceManifest;
  detailApiUrl: string;
  detailUrl: string;
  readerAvailable: boolean;
};

function storyItem(story: StoryCardData, sourceId: "otruyen" | "mangadex" | "anilist"): SourceHubItem {
  const source = SOURCE_MANIFESTS[sourceId];
  const externalDetailUrl = sourceId === "anilist"
    ? `https://anilist.co/manga/${story.slug.replace("anilist-", "")}`
    : `/story/${story.slug}`;
  return {
    ...story,
    source,
    detailApiUrl: `/api/source-catalog/${sourceId}/${encodeURIComponent(story.slug)}`,
    detailUrl: externalDetailUrl,
    readerAvailable: source.access === "reader" && Boolean(story.latestChapterId),
  };
}

function novelItem(novel: NovelSummary): SourceHubItem {
  const latest = novel.chapters.at(-1) ?? null;
  return {
    id: novel.id ?? `novel_${novel.slug}`,
    medium: "novel",
    slug: novel.slug,
    title: novel.title,
    originTitle: null,
    coverUrl: null,
    status: "completed",
    contentRating: "safe",
    genres: novel.genres,
    genreSlugs: novel.genres.map(normalizeTitle).map((genre) => genre.replace(/\s+/g, "-")),
    discoveryTags: [],
    latestChapter: latest?.label ?? null,
    latestChapterId: latest?.id ?? null,
    updatedAt: novel.updatedAt ?? new Date(0).toISOString(),
    score: null,
    scoreSource: null,
    source: SOURCE_MANIFESTS.wikisource,
    detailApiUrl: `/api/source-catalog/wikisource/${encodeURIComponent(novel.slug)}`,
    detailUrl: `/novels/${novel.slug}`,
    readerAvailable: Boolean(latest),
  };
}

function deduplicate(items: SourceHubItem[]) {
  const byTitle = new Map<string, SourceHubItem>();
  for (const item of items) {
    const key = normalizeTitle(item.title);
    const existing = byTitle.get(key);
    if (!existing || (!existing.readerAvailable && item.readerAvailable)) byTitle.set(key, item);
  }
  return [...byTitle.values()];
}

export async function querySourceCatalog({
  source,
  query = "",
  page = 1,
  limit = 24,
}: {
  source: SourceHubId | "all";
  query?: string;
  page?: number;
  limit?: number;
}) {
  const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), 100);
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 24, 1), 48);
  const normalizedQuery = normalizeTitle(query);

  const loadOTruyen = async () => {
    const catalog = await getDiscoverCatalog({ query, page: safePage });
    return catalog.stories.slice(0, safeLimit).map((story) => storyItem(story, "otruyen"));
  };
  const loadMangaDex = async () => {
    if (safePage > 1) return [];
    const stories = query
      ? await searchMangaDexStories(query, safeLimit)
      : await getMangaDexLatestStories(safeLimit);
    return stories.map((story) => storyItem(story, "mangadex"));
  };
  const loadWikisource = async () => {
    const catalog = await getNovelCatalog();
    const filtered = normalizedQuery
      ? catalog.filter((novel) => normalizeTitle(`${novel.title} ${novel.author}`).includes(normalizedQuery))
      : catalog;
    const offset = (safePage - 1) * safeLimit;
    return filtered.slice(offset, offset + safeLimit).map(novelItem);
  };
  const loadAniList = async () =>
    (await queryAniListStories(query, safePage, safeLimit)).map((story) => storyItem(story, "anilist"));

  if (source === "otruyen") return await loadOTruyen();
  if (source === "mangadex") return await loadMangaDex();
  if (source === "wikisource") return await loadWikisource();
  if (source === "anilist") return await loadAniList();
  const groups = await Promise.allSettled([
    loadOTruyen(),
    loadMangaDex(),
    loadWikisource(),
    loadAniList(),
  ]);
  return deduplicate(groups.flatMap((result) => result.status === "fulfilled" ? result.value : []))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, safeLimit);
}

export async function getSourceDetail(source: SourceHubId, slug: string) {
  if (!/^[a-z0-9-]{1,180}$/i.test(slug)) return null;
  if (source === "otruyen") {
    const story = await getStory(slug, { includeExternalRating: false });
    if (!story) return null;
    return {
      source: SOURCE_MANIFESTS.otruyen,
      item: {
        ...story,
        chapters: story.chapters.map((chapter) => ({
          ...chapter,
          contentApiUrl: `/api/source-content/otruyen/${chapter.id}`,
        })),
      },
    };
  }
  if (source === "mangadex") {
    const story = await getMangaDexStory(slug);
    return story ? { source: SOURCE_MANIFESTS.mangadex, item: story } : null;
  }
  if (source === "anilist") {
    const story = await getAniListStory(slug);
    return story ? { source: SOURCE_MANIFESTS.anilist, item: story } : null;
  }
  const novel = await getNovel(slug);
  if (!novel) return null;
  return {
    source: SOURCE_MANIFESTS.wikisource,
    item: {
      ...novel,
      chapters: novel.chapters.map((chapter) => ({
        ...chapter,
        contentApiUrl: `/api/source-content/wikisource/${chapter.id}`,
      })),
    },
  };
}

export async function getSourceContent(source: SourceHubId, chapterId: string) {
  if (SOURCE_MANIFESTS[source].access === "metadata-only") return "metadata-only" as const;
  if (source === "otruyen") {
    const chapter = await getChapterPages(chapterId);
    return chapter ? {
      type: "comic-pages" as const,
      chapterId: chapter.chapterId,
      chapterName: chapter.chapterName,
      pages: chapter.pages,
      sourceUrl: chapter.sourceUrl,
      attribution: SOURCE_MANIFESTS.otruyen.name,
    } : null;
  }
  const chapter = await getNovelChapter(chapterId);
  return chapter ? {
    type: "text-paragraphs" as const,
    chapterId: chapter.chapter.id,
    chapterName: chapter.chapter.label,
    title: chapter.novel.title,
    paragraphs: chapter.paragraphs,
    sourceUrl: chapter.sourceUrl,
    attribution: chapter.sourceName ?? chapter.novel.sourceName ?? SOURCE_MANIFESTS.wikisource.name,
  } : null;
}
