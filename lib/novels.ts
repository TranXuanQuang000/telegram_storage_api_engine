import bundledNovelContent from "../data/novel-content.json";
import { normalizeTitle } from "./search-utils";
import {
  getNovelApiCatalog,
  getNovelApiChapter,
  getNovelApiStory,
  isNovelApiChapterId,
  isNovelApiSlug,
} from "./sources/novel-api";

export type NovelChapter = {
  id: string;
  label: string;
  sourceTitle: string;
  sourceName?: string;
  sourceId?: string;
  isFilled?: boolean;
};

export type NovelSummary = {
  id?: string;
  slug: string;
  title: string;
  author: string;
  translator?: string;
  year?: string;
  description: string;
  genres: string[];
  accent: string;
  chapters: NovelChapter[];
  updatedAt?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceId?: string;
  provider?: "wikisource" | "novel-api";
  coverUrl?: string | null;
  status?: string;
  chapterCount?: number | null;
};

export type NovelChapterContent = {
  novel: NovelSummary;
  chapter: NovelChapter;
  paragraphs: string[];
  sourceUrl: string;
  sourceName?: string;
};

const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

function numberedChapters(slug: string, count: number, source: (index: number) => string): NovelChapter[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${slug}--${index + 1}`,
    label: `Chương ${index + 1}`,
    sourceTitle: source(index + 1),
  }));
}

export const PUBLIC_DOMAIN_NOVELS: NovelSummary[] = [
  {
    slug: "a-q-chinh-truyen",
    title: "A Q. chính truyện",
    author: "Lỗ Tấn",
    translator: "Phan Khôi",
    description: "Một chân dung châm biếm sắc lạnh về ảo tưởng chiến thắng và những nghịch lý xã hội đầu thế kỷ XX.",
    genres: ["Kinh điển", "Châm biếm", "Tâm lý"],
    accent: "#c7ff3c",
    chapters: numberedChapters("a-q-chinh-truyen", 9, (index) => `A Q. chính truyện/Chương ${index}`),
  },
  {
    slug: "nhat-ky-nguoi-dien",
    title: "Nhật ký người điên",
    author: "Lỗ Tấn",
    translator: "Phan Khôi",
    description: "Truyện ngắn mở đầu bằng những trang nhật ký bất an, dùng cảm giác bị săn đuổi để soi vào lễ giáo và đám đông.",
    genres: ["Kinh điển", "Tâm lý", "Xã hội"],
    accent: "#00e5ff",
    chapters: numberedChapters("nhat-ky-nguoi-dien", 1, () => "Nhật ký người điên"),
  },
  {
    slug: "thuoc",
    title: "Thuốc",
    author: "Lỗ Tấn",
    translator: "Phan Khôi",
    description: "Một câu chuyện ngắn, tối và day dứt về mê tín, hy vọng và cái giá của sự thức tỉnh.",
    genres: ["Kinh điển", "Bi kịch", "Xã hội"],
    accent: "#ff2bd6",
    chapters: numberedChapters("thuoc", 1, () => "Thuốc"),
  },
  {
    slug: "tro-vo-lua-ra",
    title: "Trở vỏ lửa ra",
    author: "Phan Khôi",
    description: "Tiểu thuyết xã hội Việt Nam bằng giọng văn báo chí đầu thế kỷ XX, được chia thành mười lăm phần.",
    genres: ["Việt Nam", "Xã hội", "Kinh điển"],
    accent: "#7c5cff",
    chapters: numberedChapters("tro-vo-lua-ra", 15, (index) => `Trở vỏ lửa ra/${roman[index - 1]}`),
  },
];

const contentCache = new Map<string, { expiresAt: number; value: string[] }>();
const sourceCache = new Map<string, { expiresAt: number; value?: unknown; pending?: Promise<unknown> }>();
const WIKISOURCE_API = "https://vi.wikisource.org/w/api.php";
const WIKISOURCE_CATEGORIES = ["Thể loại:Tiểu thuyết", "Thể loại:Truyện ngắn", "Thể loại:Văn học Việt Nam"];
const WIKISOURCE_HEADERS = {
  Accept: "application/json",
  "User-Agent": "MucReader/0.2 (public-domain reader; contact: https://muctruyen.pages.dev)",
  "Api-User-Agent": "MucReader/0.2 (public-domain reader; https://muctruyen.pages.dev)",
};

type WikiPage = {
  pageid: number;
  title: string;
  revisions?: Array<{
    timestamp?: string;
    slots?: { main?: { content?: string } };
  }>;
};

type WikiCategoryMember = { pageid: number; title: string };

function sourceAccent(value: string) {
  const accents = ["#c7ff3c", "#00e5ff", "#ff2bd6", "#7c5cff", "#ffb347", "#58f0c7"];
  const hash = [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % accents.length, 0);
  return accents[hash];
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function stripWikiMarkup(value?: string) {
  return (value ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerField(content: string, labels: string[]) {
  for (const label of labels) {
    const match = content.match(new RegExp(`\\|\\s*${label}\\s*=\\s*([^\\n|}]+)`, "i"));
    const value = stripWikiMarkup(match?.[1]);
    if (value) return value;
  }
  return "";
}

function directSubpageCount(content: string) {
  return [...content.matchAll(/\[\[\s*\/([^|\]#]+)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .length;
}

async function fetchWikiJson<T>(params: URLSearchParams, ttlMs = 30 * 60 * 1_000): Promise<T> {
  const url = `${WIKISOURCE_API}?${params.toString()}`;
  const cached = sourceCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== undefined) return cached.value as T;
    if (cached.pending) return await cached.pending as T;
  }
  const pending = (async () => {
    let failure: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(url, { headers: WIKISOURCE_HEADERS, signal: controller.signal });
        if (response.status === 429 && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        if (!response.ok) throw new Error(`Wikisource returned ${response.status}`);
        return await response.json() as T;
      } catch (error) {
        failure = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw failure instanceof Error ? failure : new Error("Wikisource request failed");
  })();
  sourceCache.set(url, { expiresAt: Date.now() + ttlMs, pending });
  try {
    const value = await pending;
    sourceCache.set(url, { expiresAt: Date.now() + ttlMs, value });
    return value;
  } catch (error) {
    sourceCache.delete(url);
    throw error;
  }
}

async function getCategoryMembers(category: string) {
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: category,
    cmnamespace: "0",
    cmtype: "page",
    cmlimit: "300",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const payload = await fetchWikiJson<{ query?: { categorymembers?: WikiCategoryMember[] } }>(params);
  return payload.query?.categorymembers ?? [];
}

async function getWikiPages(pageIds: number[]) {
  const unique = [...new Set(pageIds)].filter(Number.isFinite);
  const pages: WikiPage[] = [];
  const batches = Array.from({ length: Math.ceil(unique.length / 50) }, (_, index) =>
    unique.slice(index * 50, (index + 1) * 50)
  );
  for (let index = 0; index < batches.length; index += 3) {
    const wave = await Promise.all(batches.slice(index, index + 3).map(async (batch) => {
      const params = new URLSearchParams({
        action: "query",
        pageids: batch.join("|"),
        prop: "revisions",
        rvprop: "content|timestamp",
        rvslots: "main",
        format: "json",
        formatversion: "2",
        origin: "*",
      });
      const payload = await fetchWikiJson<{ query?: { pages?: WikiPage[] } }>(params);
      return payload.query?.pages ?? [];
    }));
    pages.push(...wave.flat());
  }
  return pages;
}

function summaryFromWikiPage(page: WikiPage, category = "Văn học") {
  const content = page.revisions?.[0]?.slots?.main?.content ?? "";
  const author = headerField(content, ["tác giả", "tac gia"]) || "Chưa rõ tác giả";
  const translator = headerField(content, ["dịch giả", "dich gia"]) || undefined;
  const year = headerField(content, ["năm", "nam"]) || undefined;
  const estimatedChapters = Math.max(1, directSubpageCount(content));
  const slug = `wikisource-${page.pageid}-${slugify(page.title)}`;
  return {
    id: `novel_ws_${page.pageid}`,
    slug,
    title: page.title,
    author,
    translator,
    year,
    description: `${page.title}${year ? ` (${year})` : ""} từ thư viện Wikisource tiếng Việt. Mở tác phẩm để tải mục lục đầy đủ và đọc theo từng phần.`,
    genres: [...new Set([category, "Public domain"])],
    accent: sourceAccent(page.title),
    chapters: Array.from({ length: estimatedChapters }, (_, index) => ({
      id: `ws-${page.pageid}-${index + 1}`,
      label: estimatedChapters === 1 ? "Toàn văn" : `Phần ${index + 1}`,
      sourceTitle: page.title,
    })),
    updatedAt: page.revisions?.[0]?.timestamp ?? new Date(0).toISOString(),
    sourceName: "Wikisource tiếng Việt",
    sourceUrl: `https://vi.wikisource.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  } satisfies NovelSummary;
}

async function getWikisourceNovelCatalog(): Promise<NovelSummary[]> {
  try {
    const categoryRows = await Promise.all(WIKISOURCE_CATEGORIES.map(async (category) => ({
      category: category.replace(/^Thể loại:/, ""),
      members: await getCategoryMembers(category),
    })));
    const categoryByPage = new Map<number, string>();
    for (const row of categoryRows) {
      for (const member of row.members) if (!categoryByPage.has(member.pageid)) categoryByPage.set(member.pageid, row.category);
    }
    const pages = await getWikiPages([...categoryByPage.keys()]);
    const dynamic = pages
      .filter((page) => page.pageid && page.title && !page.title.startsWith("Biên dịch:"))
      .map((page) => summaryFromWikiPage(page, categoryByPage.get(page.pageid)));
    const bundledTitles = new Set(PUBLIC_DOMAIN_NOVELS.map((novel) => normalizeTitle(novel.title)));
    return [
      ...PUBLIC_DOMAIN_NOVELS,
      ...dynamic.filter((novel) => !bundledTitles.has(normalizeTitle(novel.title))),
    ];
  } catch (error) {
    console.error("Wikisource catalog refresh failed", error);
    return PUBLIC_DOMAIN_NOVELS;
  }
}

export async function getNovelCatalog(): Promise<NovelSummary[]> {
  const [remote, wikisource] = await Promise.allSettled([
    getNovelApiCatalog(),
    getWikisourceNovelCatalog(),
  ]);
  const remoteItems = remote.status === "fulfilled" ? remote.value : [];
  const wikiItems = wikisource.status === "fulfilled" ? wikisource.value : PUBLIC_DOMAIN_NOVELS;
  return [
    ...remoteItems,
    ...wikiItems,
  ];
}

async function getWikiNovel(pageId: number): Promise<NovelSummary | null> {
  const [page] = await getWikiPages([pageId]);
  if (!page?.title) return null;
  const params = new URLSearchParams({
    action: "query",
    list: "allpages",
    apprefix: `${page.title}/`,
    apnamespace: "0",
    aplimit: "500",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const payload = await fetchWikiJson<{ query?: { allpages?: Array<{ title: string }> } }>(params, 15 * 60 * 1_000);
  const allTitles = (payload.query?.allpages ?? []).map((item) => item.title);
  const leaves = allTitles
    .filter((title) => !allTitles.some((candidate) => candidate !== title && candidate.startsWith(`${title}/`)))
    .filter((title) => !/\/(?:mục lục|bìa|giấy phép)$/i.test(title))
    .sort(new Intl.Collator("vi", { numeric: true, sensitivity: "base" }).compare);
  const sourceTitles = leaves.length ? leaves : [page.title];
  const summary = summaryFromWikiPage(page);
  return {
    ...summary,
    chapters: sourceTitles.map((sourceTitle, index) => ({
      id: `ws-${pageId}-${index + 1}`,
      label: sourceTitle === page.title
        ? "Toàn văn"
        : sourceTitle.slice(page.title.length + 1).replace(/\//g, " · "),
      sourceTitle,
    })),
  };
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? "";
  });
}

function extractParagraphs(rawHtml: string) {
  const proseIndex = rawHtml.search(/<div[^>]+class="[^"]*\bprose\b/i);
  let html = proseIndex >= 0 ? rawHtml.slice(proseIndex) : rawHtml;
  const footerIndex = html.search(/<div[^>]+class="[^"]*(?:printfooter|catlinks|licenseContainer)/i);
  if (footerIndex >= 0) html = html.slice(0, footerIndex);
  html = html
    .replace(/<(script|style|table|figure|sup)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(html)
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim())
    .filter((paragraph) =>
      paragraph.length >= 2
      && !/^(Chú thích|Tham khảo|Mục lục|Trang Chính)$/i.test(paragraph)
    )
    .slice(0, 2_000);
}

export async function getNovel(slug: string) {
  if (isNovelApiSlug(slug)) return await getNovelApiStory(slug);
  const bundled = PUBLIC_DOMAIN_NOVELS.find((novel) => novel.slug === slug);
  if (bundled) return bundled;
  const pageId = Number(slug.match(/^wikisource-(\d+)-[a-z0-9-]+$/)?.[1]);
  if (!Number.isFinite(pageId) || pageId < 1) return null;
  return await getWikiNovel(pageId);
}

export async function getNovelChapter(chapterId: string): Promise<NovelChapterContent | null> {
  if (isNovelApiChapterId(chapterId)) return await getNovelApiChapter(chapterId);
  const wikiMatch = chapterId.match(/^ws-(\d+)-(\d{1,4})$/);
  if (wikiMatch) {
    const novel = await getWikiNovel(Number(wikiMatch[1]));
    const chapter = novel?.chapters[Number(wikiMatch[2]) - 1];
    if (!novel || !chapter || chapter.id !== chapterId) return null;
    return await loadNovelChapterContent(novel, chapter);
  }
  const match = chapterId.match(/^([a-z0-9-]{1,120})--(\d{1,4})$/);
  if (!match) return null;
  const novel = await getNovel(match[1]);
  const chapter = novel?.chapters[Number(match[2]) - 1];
  if (!novel || !chapter || chapter.id !== chapterId) return null;
  return await loadNovelChapterContent(novel, chapter);
}

async function loadNovelChapterContent(novel: NovelSummary, chapter: NovelChapter): Promise<NovelChapterContent | null> {
  const chapterId = chapter.id;
  const sourceUrl = `https://vi.wikisource.org/wiki/${encodeURIComponent(chapter.sourceTitle.replace(/ /g, "_"))}`;
  const bundled = (bundledNovelContent as Record<string, string[]>)[chapterId];
  if (bundled?.length) {
    return { novel, chapter, paragraphs: bundled, sourceUrl };
  }
  const cached = contentCache.get(chapter.sourceTitle);
  if (cached && cached.expiresAt > Date.now()) {
    return { novel, chapter, paragraphs: cached.value, sourceUrl };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const query = new URLSearchParams({
      action: "parse",
      page: chapter.sourceTitle,
      prop: "text",
      redirects: "1",
      format: "json",
      origin: "*",
    });
    const response = await fetch(`https://vi.wikisource.org/w/api.php?${query}`, {
      headers: WIKISOURCE_HEADERS,
      signal: controller.signal,
    });
    let rawHtml = "";
    if (response.ok) {
      const payload = await response.json() as { parse?: { text?: { "*": string } } };
      rawHtml = payload.parse?.text?.["*"] ?? "";
    } else {
      // The MediaWiki action endpoint rejects some Workers egress IPs. The
      // official Wikimedia core endpoint serves the same public-domain page
      // and keeps the reader usable in local Cloudflare emulation.
      const fallback = await fetch(
        `https://api.wikimedia.org/core/v1/wikisource/vi/page/${encodeURIComponent(chapter.sourceTitle)}/html`,
        {
          headers: { ...WIKISOURCE_HEADERS, Accept: "text/html" },
          signal: controller.signal,
        },
      );
      if (!fallback.ok) {
        console.warn(`[novels] Wikimedia returned ${response.status}/${fallback.status} for ${chapter.sourceTitle}`);
        return null;
      }
      rawHtml = await fallback.text();
    }
    const paragraphs = extractParagraphs(rawHtml);
    if (!paragraphs.length) return null;
    contentCache.set(chapter.sourceTitle, { expiresAt: Date.now() + 30 * 60 * 1_000, value: paragraphs });
    return {
      novel,
      chapter,
      paragraphs,
      sourceUrl,
    };
  } catch (error) {
    console.warn(`[novels] Could not load ${chapter.sourceTitle}`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
