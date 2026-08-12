export type FallbackSourceKey = "nettruyen" | "truyenqq";

export type ChapterPlanItem = {
  id: string;
  number: string;
  title: string;
  apiUrl: string;
  source?: "otruyen" | FallbackSourceKey;
  domain?: string;
  consent_status?: string;
};

type FallbackSourceConfig = {
  key: FallbackSourceKey;
  id: string;
  name: string;
  baseUrl: string;
  maxPages: number;
  listUrl(page: number): string;
  storyUrl(slug: string): string;
  catalogItemSelector: string;
  catalogLinkSelector: string;
  chapterLinkSelector: string;
  pageImageSelector: string;
  storySlug(url: URL): string | null;
  chapterStorySlug(url: URL): string | null;
  chapterPathPattern: RegExp;
};

export const FALLBACK_SOURCES: Record<FallbackSourceKey, FallbackSourceConfig> = {
  nettruyen: {
    key: "nettruyen",
    id: "source_nettruyen",
    name: "NetTruyen",
    baseUrl: "https://nettruyenz.com",
    maxPages: 712,
    listUrl: (page) => `https://nettruyenz.com?page=${page}`,
    storyUrl: (slug) => `https://nettruyenz.com/comic-${slug}`,
    catalogItemSelector: ".items-row > .item",
    catalogLinkSelector: "figcaption h3 a",
    chapterLinkSelector: ".chapter-table tbody tr td a",
    pageImageSelector: ".reader-pages img",
    storySlug(url) {
      const match = url.pathname.match(/^\/comic-([a-z0-9-]+)\/?$/i);
      return match?.[1]?.toLowerCase() ?? null;
    },
    chapterStorySlug(url) {
      const match = url.pathname.match(/^\/([a-z0-9-]+)\/chap-[a-z0-9.-]+\/?$/i);
      return match?.[1]?.toLowerCase() ?? null;
    },
    chapterPathPattern: /^\/[a-z0-9-]+\/chap-[a-z0-9.-]+\/?$/i,
  },
  truyenqq: {
    key: "truyenqq",
    id: "source_truyenqq",
    name: "TruyenQQ",
    baseUrl: "https://truyenqq.com.vn",
    maxPages: 500,
    listUrl: (page) => `https://truyenqq.com.vn/truyen-moi?page=${page}`,
    storyUrl: (slug) => `https://truyenqq.com.vn/${slug}`,
    catalogItemSelector: ".listing .inner > .item",
    catalogLinkSelector: ".info h3 a",
    chapterLinkSelector: "#chapter-list .reading-list .item .chapter-name",
    pageImageSelector: ".reading-content img",
    storySlug(url) {
      const match = url.pathname.match(/^\/([a-z0-9-]+)\/?$/i);
      return match?.[1]?.toLowerCase() ?? null;
    },
    chapterStorySlug(url) {
      const match = url.pathname.match(/^\/([a-z0-9-]+)\/chapter-[a-z0-9.-]+\/?$/i);
      return match?.[1]?.toLowerCase() ?? null;
    },
    chapterPathPattern: /^\/[a-z0-9-]+\/chapter-[a-z0-9.-]+\/?$/i,
  },
};

type CatalogItem = { title: string; storyUrl: string; storySlug: string };
type ExtractedChapter = { number: string; url: string };
type StoredChapterPage = { page_index: number; image_url: string };

const SOURCE_PRIORITY: Record<string, number> = { oTruyen: 0, otruyen: 0, truyenqq: 1, nettruyen: 2 };
const BLOCK_MARKERS = ["cf-chl-", "captcha", "verify you are human", "attention required", "access denied"];
const IMAGE_HOST_SUFFIXES: Record<FallbackSourceKey, readonly string[]> = {
  nettruyen: ["otruyencdn.com", "otruyenapi.com", "nettruyenz.com"],
  truyenqq: ["cc3t.net", "truyenqq.com.vn"],
};
const IMAGE_PATH_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;

function decodeHtml(value: string) {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };
  return value.replace(/&(?:#(\d+)|#x([a-f0-9]+)|([a-z]+));/gi, (entity, decimal, hexadecimal, name) => {
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
      try { return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity; } catch { return entity; }
    }
    return named[String(name).toLowerCase()] ?? entity;
  });
}

function cleanText(value: string) {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function safeSourceUrl(raw: string, config: FallbackSourceConfig): URL | null {
  try {
    const url = new URL(raw, config.baseUrl);
    const origin = new URL(config.baseUrl);
    if (url.protocol !== "https:" || url.hostname !== origin.hostname || url.port || url.username || url.password) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function canonicalChapterKey(value: string | number): string | null {
  const match = String(value).replace(",", ".").match(/\d+(?:\.\d+)?/);
  const parsed = Number.parseFloat(match?.[0] ?? "");
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number.isInteger(parsed) ? String(parsed) : String(parsed).replace(/0+$/, "").replace(/\.$/, "");
}

export function validateFallbackChapterUrl(source: FallbackSourceKey, rawUrl: string, expectedStorySlug?: string) {
  const config = FALLBACK_SOURCES[source];
  const url = safeSourceUrl(rawUrl, config);
  if (!url || !config.chapterPathPattern.test(url.pathname)) return null;
  const chapterStorySlug = config.chapterStorySlug(url);
  if (!chapterStorySlug || (expectedStorySlug && chapterStorySlug !== expectedStorySlug.toLowerCase())) return null;
  return url.toString();
}

function hostnameMatchesSuffix(hostname: string, suffix: string) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function validateFallbackImageUrl(source: FallbackSourceKey, rawUrl: string, chapterUrl?: string) {
  const config = FALLBACK_SOURCES[source];
  const validatedChapterUrl = chapterUrl ? validateFallbackChapterUrl(source, chapterUrl) : null;
  if (chapterUrl && !validatedChapterUrl) return null;
  try {
    const url = new URL(rawUrl, validatedChapterUrl ?? config.baseUrl);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (!IMAGE_HOST_SUFFIXES[source].some((suffix) => hostnameMatchesSuffix(hostname, suffix))) return null;
    if (!IMAGE_PATH_PATTERN.test(url.pathname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function fallbackImageProxyUrl(chapterId: string, pageIndex: number) {
  if (!/^fb_[a-f0-9]{40}$/i.test(chapterId) || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 999) return null;
  return `/api/chapter-image/${chapterId}/${pageIndex}`;
}

export function mergeChapterPlans(primary: ChapterPlanItem[], fallback: ChapterPlanItem[]) {
  const selected = new Map<string, ChapterPlanItem>();
  for (const chapter of primary) {
    const key = canonicalChapterKey(chapter.number);
    if (key && !selected.has(key)) selected.set(key, { ...chapter, source: "otruyen", domain: "otruyenapi.com" });
  }
  const orderedFallback = [...fallback].sort((left, right) =>
    (SOURCE_PRIORITY[left.source ?? ""] ?? 99) - (SOURCE_PRIORITY[right.source ?? ""] ?? 99)
  );
  for (const chapter of orderedFallback) {
    const key = canonicalChapterKey(chapter.number);
    if (key && !selected.has(key)) selected.set(key, chapter);
  }
  return [...selected.values()].sort((left, right) => {
    const numeric = (Number.parseFloat(right.number) || 0) - (Number.parseFloat(left.number) || 0);
    return numeric || right.number.localeCompare(left.number, "vi", { numeric: true });
  });
}

async function stableId(prefix: string, value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hash = [...new Uint8Array(digest)].slice(0, 20).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hash}`;
}

async function fetchHtml(rawUrl: string, config: FallbackSourceConfig, retries = 1) {
  const target = safeSourceUrl(rawUrl, config);
  if (!target) throw new Error(`FALLBACK_INVALID_URL:${config.key}`);
  let failure: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(target, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "vi,en;q=0.8",
          "User-Agent": "MucCatalog/3.0 (+source-attribution)",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`FALLBACK_HTTP_${response.status}:${config.key}`);
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error(`FALLBACK_CONTENT_TYPE:${config.key}`);
      const html = await response.text();
      const sample = html.slice(0, 80_000).toLowerCase();
      if (BLOCK_MARKERS.some((marker) => sample.includes(marker))) throw new Error(`FALLBACK_ACCESS_BLOCKED:${config.key}`);
      return html;
    } catch (error) {
      failure = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 350 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw failure instanceof Error ? failure : new Error(`FALLBACK_FETCH_FAILED:${config.key}`);
}

async function extractCatalogItems(html: string, config: FallbackSourceConfig): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  let active: { title: string; href: string } | null = null;
  const rewriter = new HTMLRewriter()
    .on(config.catalogItemSelector, {
      element(element) {
        const item = { title: "", href: "" };
        active = item;
        element.onEndTag(() => {
          const url = safeSourceUrl(item.href, config);
          const storySlug = url ? config.storySlug(url) : null;
          const title = cleanText(item.title);
          if (url && storySlug && title) items.push({ title: title.slice(0, 300), storyUrl: url.toString(), storySlug });
          if (active === item) active = null;
        });
      },
    })
    .on(`${config.catalogItemSelector} ${config.catalogLinkSelector}`, {
      element(element) {
        if (active && !active.href) active.href = element.getAttribute("href") ?? "";
      },
      text(chunk) {
        if (active) active.title += chunk.text;
      },
    });
  await rewriter.transform(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })).text();
  return [...new Map(items.map((item) => [`${item.storySlug}:${item.title}`, item])).values()];
}

async function extractChapterManifest(html: string, config: FallbackSourceConfig, expectedStorySlug: string): Promise<ExtractedChapter[]> {
  const chapters: ExtractedChapter[] = [];
  let active: { href: string; text: string } | null = null;
  const rewriter = new HTMLRewriter().on(config.chapterLinkSelector, {
    element(element) {
      const link = { href: element.getAttribute("href") ?? "", text: "" };
      active = link;
      element.onEndTag(() => {
        const url = validateFallbackChapterUrl(config.key, link.href, expectedStorySlug);
        const number = canonicalChapterKey(cleanText(link.text));
        if (url && number) chapters.push({ number, url });
        if (active === link) active = null;
      });
    },
    text(chunk) {
      if (active) active.text += chunk.text;
    },
  });
  await rewriter.transform(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })).text();
  return [...new Map(chapters.map((chapter) => [chapter.number, chapter])).values()]
    .sort((left, right) => (Number.parseFloat(right.number) || 0) - (Number.parseFloat(left.number) || 0));
}

async function extractChapterImages(html: string, config: FallbackSourceConfig, chapterUrl: string): Promise<string[]> {
  const images: string[] = [];
  const rewriter = new HTMLRewriter().on(config.pageImageSelector, {
    element(element) {
      if (images.length >= 1_000) return;
      const raw = element.getAttribute("data-src")
        ?? element.getAttribute("data-original")
        ?? element.getAttribute("data-cdn")
        ?? element.getAttribute("src")
        ?? "";
      const imageUrl = validateFallbackImageUrl(config.key, raw, chapterUrl);
      if (imageUrl) images.push(imageUrl);
    },
  });
  await rewriter.transform(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })).text();
  return [...new Set(images)];
}

async function batchInChunks(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
}

async function registerSource(db: D1Database, config: FallbackSourceConfig) {
  await db.prepare(`
    INSERT INTO sources (id, slug, name, base_url, kind, enabled, license_mode, last_sync_at)
    VALUES (?, ?, ?, ?, 'link-only', 1, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, base_url = excluded.base_url, kind = 'link-only', enabled = 1, license_mode = excluded.license_mode
  `).bind(
    config.id,
    config.key,
    config.name,
    config.baseUrl,
    "Source-attributed chapter and image URL manifests; media bytes remain upstream and are fetched only for validated chapters",
  ).run();
}

function catalogPageFromCursor(cursor?: string | null) {
  const match = cursor?.match(/^catalog:(\d{1,6})$/);
  return Math.max(1, Number(match?.[1]) || 1);
}

export async function crawlFallbackCatalog(db: D1Database, source: FallbackSourceKey, pagesPerRun = 2) {
  const config = FALLBACK_SOURCES[source];
  await registerSource(db, config);
  const latest = await db.prepare(`
    SELECT cursor FROM sync_runs
    WHERE source_id = ? AND status = 'completed' AND cursor LIKE 'catalog:%'
    ORDER BY finished_at DESC LIMIT 1
  `).bind(config.id).first<{ cursor?: string | null }>();
  const startPage = catalogPageFromCursor(latest?.cursor);
  const pages = Array.from({ length: Math.min(Math.max(Math.floor(pagesPerRun), 1), 6) }, (_, index) => startPage + index)
    .filter((page) => page <= config.maxPages);
  const runId = `sync_${crypto.randomUUID()}`;
  const nextPage = (pages.at(-1) ?? startPage) >= config.maxPages ? 1 : (pages.at(-1) ?? startPage) + 1;
  const nextCursor = `catalog:${nextPage}`;
  await db.prepare(`
    INSERT INTO sync_runs (id, source_id, status, cursor, imported, updated, failed, started_at)
    VALUES (?, ?, 'running', ?, 0, 0, 0, CURRENT_TIMESTAMP)
  `).bind(runId, config.id, nextCursor).run();

  let imported = 0;
  let updated = 0;
  let failed = 0;
  try {
    for (const page of pages) {
      const items = await extractCatalogItems(await fetchHtml(config.listUrl(page), config), config);
      for (const item of items) {
        const story = await db.prepare(`
          SELECT id, slug FROM stories
          WHERE medium = 'comic' AND (slug = ? OR lower(canonical_title) = lower(?))
          ORDER BY CASE WHEN slug = ? THEN 0 ELSE 1 END LIMIT 1
        `).bind(item.storySlug, item.title, item.storySlug).first<{ id: string; slug: string }>();
        if (!story) continue;
        const sourceItemId = await stableId("source_item", `${source}:${item.storySlug}`);
        const existing = await db.prepare("SELECT id FROM source_items WHERE id = ? LIMIT 1").bind(sourceItemId).first<{ id: string }>();
        await db.prepare(`
          INSERT INTO source_items (id, source_id, story_id, external_id, external_url, etag, source_updated_at, last_checked_at)
          VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
          ON CONFLICT(source_id, external_id) DO UPDATE SET story_id = excluded.story_id, external_url = excluded.external_url
        `).bind(sourceItemId, config.id, story.id, item.storySlug, item.storyUrl).run();
        if (existing) updated += 1; else imported += 1;
      }
    }
    await db.batch([
      db.prepare("UPDATE sync_runs SET status = 'completed', cursor = ?, imported = ?, updated = ?, failed = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(nextCursor, imported, updated, failed, runId),
      db.prepare("UPDATE sources SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?").bind(config.id),
    ]);
    return { runId, source, cursor: nextCursor, imported, updated, failed, pagesProcessed: pages.length };
  } catch (error) {
    failed += 1;
    const summary = error instanceof Error ? error.message.slice(0, 280) : "Unknown fallback catalog failure";
    await db.prepare("UPDATE sync_runs SET status = 'failed', failed = ?, finished_at = CURRENT_TIMESTAMP, error_summary = ? WHERE id = ?")
      .bind(failed, summary, runId).run();
    throw error;
  }
}

async function persistFallbackManifest(
  db: D1Database,
  config: FallbackSourceConfig,
  sourceItem: { id: string; story_id: string; external_id: string; external_url: string },
  chapters: ExtractedChapter[],
) {
  const existingRows = await db.prepare("SELECT id FROM chapters WHERE source_item_id = ?").bind(sourceItem.id).all<{ id: string }>();
  const existing = new Set((existingRows.results ?? []).map((row) => row.id));
  const statements: D1PreparedStatement[] = [];
  let inserted = 0;
  for (const chapter of chapters) {
    const id = await stableId("fb", `${config.key}:${new URL(chapter.url).pathname}`);
    if (existing.has(id)) continue;
    inserted += 1;
    statements.push(db.prepare(`
      INSERT INTO chapters (id, story_id, source_item_id, number, title, language, page_count, published_at, external_url)
      VALUES (?, ?, ?, ?, ?, 'vi', 0, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET story_id = excluded.story_id, source_item_id = excluded.source_item_id, number = excluded.number, title = excluded.title, external_url = excluded.external_url
    `).bind(id, sourceItem.story_id, sourceItem.id, Number.parseFloat(chapter.number), `Nguồn dự phòng · ${config.name}`, chapter.url));
  }
  await batchInChunks(db, statements);
  const newest = chapters[0];
  if (newest) {
    const newestId = await stableId("fb", `${config.key}:${new URL(newest.url).pathname}`);
    const newestNumber = Number.parseFloat(newest.number);
    await db.prepare(`
      UPDATE stories
      SET latest_chapter = ?, latest_chapter_label = ?, latest_chapter_id = ?
      WHERE id = ? AND (latest_chapter IS NULL OR latest_chapter < ?)
    `).bind(newestNumber, newest.number, newestId, sourceItem.story_id, newestNumber).run();
  }
  await db.prepare("UPDATE source_items SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sourceItem.id).run();
  return inserted;
}

async function refreshSourceItem(
  db: D1Database,
  config: FallbackSourceConfig,
  sourceItem: { id: string; story_id: string; external_id: string; external_url: string },
) {
  const storyUrl = safeSourceUrl(sourceItem.external_url, config);
  const storySlug = storyUrl ? config.storySlug(storyUrl) : null;
  if (!storyUrl || !storySlug || storySlug !== sourceItem.external_id) throw new Error(`FALLBACK_STORY_URL_INVALID:${config.key}`);
  const chapters = await extractChapterManifest(await fetchHtml(storyUrl.toString(), config), config, storySlug);
  if (!chapters.length) throw new Error(`FALLBACK_EMPTY_MANIFEST:${config.key}:${storySlug}`);
  const inserted = await persistFallbackManifest(db, config, sourceItem, chapters);
  const newest = chapters[0];
  let imagePages = 0;
  if (newest) {
    const newestId = await stableId("fb", `${config.key}:${new URL(newest.url).pathname}`);
    try {
      const manifest = await getFallbackChapterPages(db, newestId);
      imagePages = manifest?.pages.length ?? 0;
    } catch {
      // The chapter list remains usable and the reader retries this manifest on demand.
    }
  }
  return { chapters: chapters.length, inserted, imagePages };
}

export async function refreshFallbackManifests(db: D1Database, source: FallbackSourceKey, requestedLimit = 6) {
  const config = FALLBACK_SOURCES[source];
  await registerSource(db, config);
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 12);
  const rows = await db.prepare(`
    SELECT id, story_id, external_id, external_url
    FROM source_items
    WHERE source_id = ?
    ORDER BY CASE WHEN last_checked_at IS NULL THEN 0 ELSE 1 END, COALESCE(last_checked_at, '1970-01-01') ASC
    LIMIT ?
  `).bind(config.id, limit).all<{ id: string; story_id: string; external_id: string; external_url: string }>();
  const items = rows.results ?? [];
  let updated = 0;
  let inserted = 0;
  let failed = 0;
  for (let index = 0; index < items.length; index += 3) {
    const wave = await Promise.allSettled(items.slice(index, index + 3).map((item) => refreshSourceItem(db, config, item)));
    for (const result of wave) {
      if (result.status === "fulfilled") {
        updated += 1;
        inserted += result.value.inserted;
      } else {
        failed += 1;
      }
    }
  }
  return { source, scanned: items.length, updated, inserted, failed };
}

export async function refreshFallbackStoryPlan(db: D1Database, storySlug: string) {
  if (!/^[a-z0-9-]{1,160}$/.test(storySlug)) return [];
  const story = await db.prepare("SELECT id, slug FROM stories WHERE medium = 'comic' AND slug = ? LIMIT 1")
    .bind(storySlug).first<{ id: string; slug: string }>();
  if (!story) return [];
  const results: Array<{ source: FallbackSourceKey; chapters: number; inserted: number }> = [];
  for (const source of ["truyenqq", "nettruyen"] as const) {
    const config = FALLBACK_SOURCES[source];
    await registerSource(db, config);
    const sourceItemId = await stableId("source_item", `${source}:${story.slug}`);
    const item = { id: sourceItemId, story_id: story.id, external_id: story.slug, external_url: config.storyUrl(story.slug) };
    try {
      await db.prepare(`
        INSERT INTO source_items (id, source_id, story_id, external_id, external_url, etag, source_updated_at, last_checked_at)
        VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
        ON CONFLICT(source_id, external_id) DO UPDATE SET story_id = excluded.story_id, external_url = excluded.external_url
      `).bind(item.id, config.id, item.story_id, item.external_id, item.external_url).run();
      const result = await refreshSourceItem(db, config, item);
      results.push({ source, ...result });
    } catch {
      // A slug can differ between sources. The catalog crawler will discover the real mapping later.
    }
  }
  return results;
}

export async function runFallbackCrawlerCycle(db: D1Database) {
  const sourceResults = await Promise.allSettled((["truyenqq", "nettruyen"] as const).map(async (source) => {
    const catalog = await crawlFallbackCatalog(db, source, 2);
    const manifests = await refreshFallbackManifests(db, source, 6);
    return { source, catalog, manifests };
  }));
  return sourceResults.map((result, index) => result.status === "fulfilled"
    ? result.value
    : { source: (["truyenqq", "nettruyen"] as const)[index], error: result.reason instanceof Error ? result.reason.message : "Unknown failure" });
}

export async function getFallbackChaptersForStory(db: D1Database, storyId: string): Promise<ChapterPlanItem[]> {
  const rows = await db.prepare(`
    SELECT c.id, c.number, c.title, c.external_url, src.slug AS source_slug, src.base_url
    FROM chapters c
    JOIN source_items si ON si.id = c.source_item_id
    JOIN sources src ON src.id = si.source_id
    WHERE c.story_id = ? AND src.slug IN ('truyenqq', 'nettruyen') AND src.enabled = 1
    ORDER BY CASE src.slug WHEN 'truyenqq' THEN 1 ELSE 2 END, c.number DESC
  `).bind(storyId).all<{
    id: string;
    number: number;
    title: string;
    external_url: string;
    source_slug: FallbackSourceKey;
    base_url: string;
  }>();
  return (rows.results ?? []).flatMap((row) => {
    const valid = validateFallbackChapterUrl(row.source_slug, row.external_url);
    return valid ? [{
      id: row.id,
      number: canonicalChapterKey(row.number) ?? String(row.number),
      title: row.title,
      apiUrl: valid,
      source: row.source_slug,
      domain: new URL(valid).hostname,
      consent_status: "SOURCE_LINK",
    }] : [];
  });
}

export async function getFallbackChapterTarget(db: D1Database, chapterId: string) {
  if (!/^fb_[a-f0-9]{40}$/i.test(chapterId)) return null;
  const row = await db.prepare(`
    SELECT c.external_url, c.number, c.story_id, c.page_count, src.slug AS source_slug
    FROM chapters c
    JOIN source_items si ON si.id = c.source_item_id
    JOIN sources src ON src.id = si.source_id
    WHERE c.id = ? AND src.slug IN ('truyenqq', 'nettruyen') AND src.enabled = 1
    LIMIT 1
  `).bind(chapterId).first<{ external_url: string; number: number; story_id: string; page_count: number; source_slug: FallbackSourceKey }>();
  if (!row) return null;
  const url = validateFallbackChapterUrl(row.source_slug, row.external_url);
  return url ? {
    url,
    number: canonicalChapterKey(row.number) ?? String(row.number),
    storyId: row.story_id,
    pageCount: Number(row.page_count) || 0,
    source: row.source_slug,
  } : null;
}

async function persistFallbackChapterPages(db: D1Database, chapterId: string, images: string[]) {
  const statements = images.map((imageUrl, pageIndex) => db.prepare(`
    INSERT INTO chapter_pages (chapter_id, page_index, image_url, fetched_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chapter_id, page_index) DO UPDATE SET image_url = excluded.image_url, fetched_at = CURRENT_TIMESTAMP
  `).bind(chapterId, pageIndex, imageUrl));
  await batchInChunks(db, statements);
  await db.batch([
    db.prepare("DELETE FROM chapter_pages WHERE chapter_id = ? AND page_index >= ?").bind(chapterId, images.length),
    db.prepare("UPDATE chapters SET page_count = ? WHERE id = ?").bind(images.length, chapterId),
  ]);
}

export async function getFallbackChapterPages(db: D1Database, chapterId: string) {
  const target = await getFallbackChapterTarget(db, chapterId);
  if (!target) return null;
  const cachedRows = await db.prepare(`
    SELECT page_index, image_url
    FROM chapter_pages
    WHERE chapter_id = ?
    ORDER BY page_index ASC
  `).bind(chapterId).all<StoredChapterPage>();
  const cached = (cachedRows.results ?? []).flatMap((row, expectedIndex) => {
    if (row.page_index !== expectedIndex) return [];
    const imageUrl = validateFallbackImageUrl(target.source, row.image_url, target.url);
    return imageUrl ? [imageUrl] : [];
  });
  let images = cached.length === (cachedRows.results ?? []).length ? cached : [];
  if (!images.length || (target.pageCount > 0 && images.length !== target.pageCount)) {
    images = await extractChapterImages(
      await fetchHtml(target.url, FALLBACK_SOURCES[target.source]),
      FALLBACK_SOURCES[target.source],
      target.url,
    );
    if (!images.length) throw new Error(`FALLBACK_EMPTY_IMAGE_MANIFEST:${target.source}:${chapterId}`);
    await persistFallbackChapterPages(db, chapterId, images);
  } else if (target.pageCount !== images.length) {
    await db.prepare("UPDATE chapters SET page_count = ? WHERE id = ?").bind(images.length, chapterId).run();
  }
  const pages = images.map((_image, pageIndex) => fallbackImageProxyUrl(chapterId, pageIndex)).filter((url): url is string => Boolean(url));
  return {
    chapterId,
    chapterName: target.number,
    pages,
    sourceUrl: target.url,
    source: target.source,
  };
}

export async function getFallbackChapterImageTarget(db: D1Database, chapterId: string, pageIndex: number) {
  if (!/^fb_[a-f0-9]{40}$/i.test(chapterId) || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 999) return null;
  const row = await db.prepare(`
    SELECT cp.image_url, c.external_url, src.slug AS source_slug
    FROM chapter_pages cp
    JOIN chapters c ON c.id = cp.chapter_id
    JOIN source_items si ON si.id = c.source_item_id
    JOIN sources src ON src.id = si.source_id
    WHERE cp.chapter_id = ? AND cp.page_index = ?
      AND src.slug IN ('truyenqq', 'nettruyen') AND src.enabled = 1
    LIMIT 1
  `).bind(chapterId, pageIndex).first<{ image_url: string; external_url: string; source_slug: FallbackSourceKey }>();
  if (!row) return null;
  const referer = validateFallbackChapterUrl(row.source_slug, row.external_url);
  const imageUrl = referer ? validateFallbackImageUrl(row.source_slug, row.image_url, referer) : null;
  return imageUrl && referer ? { imageUrl, referer, source: row.source_slug } : null;
}
