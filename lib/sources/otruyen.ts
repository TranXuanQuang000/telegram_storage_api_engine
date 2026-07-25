import { deriveAutoTags, inferContentRating } from "../auto-tags";
import { provisionalCatalogScore } from "../catalog";
import { comicApiCandidates, contentApiHeaders, contentApiSourceName, getContentApiConfiguration } from "../content-api";
import { persistOTruyenStorySnapshot } from "../d1-story-sync";

type SourceCategory = { id?: string; name?: string; slug?: string };
type SourceItem = {
  _id?: string;
  name?: string;
  slug?: string;
  origin_name?: string[];
  status?: string;
  thumb_url?: string;
  category?: SourceCategory[];
  updatedAt?: string;
  chaptersLatest?: Array<{ chapter_name?: string; chapter_api_data?: string }>;
  chapters?: Array<{ server_data?: Array<{ chapter_name?: string; chapter_title?: string; chapter_api_data?: string }> }>;
};

type SourcePayload = {
  data?: {
    items?: SourceItem[];
    APP_DOMAIN_CDN_IMAGE?: string;
    params?: { pagination?: { totalItems?: number; totalItemsPerPage?: number; currentPage?: number; totalPages?: number } };
  };
};

export type IngestResult = {
  runId: string;
  imported: number;
  updated: number;
  failed: number;
  cursor: string | null;
  pagesProcessed: number;
  totalSourcePages: number;
};

export type IngestOptions = {
  mode?: "incremental" | "refresh";
  cursor?: string | null;
  pagesPerRun?: number;
};

const SOURCE_ID = "source_otruyen";
const SOURCE_URL = "https://otruyenapi.com";

function normalizedStatus(status?: string): "ongoing" | "completed" | "hiatus" | "cancelled" {
  return status === "completed" || status === "hiatus" || status === "cancelled" ? status : "ongoing";
}

function latestChapter(item: SourceItem): number | null {
  const parsed = Number.parseFloat(item.chaptersLatest?.[0]?.chapter_name ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function chapterIdFromApiUrl(url?: string) {
  const raw = url?.match(/\/chapter\/([^/?#]+)/i)?.[1];
  if (!raw) return null;
  try {
    const value = decodeURIComponent(raw);
    return /^[a-z0-9._~-]{1,240}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

function latestChapterId(item: SourceItem) {
  return chapterIdFromApiUrl(item.chaptersLatest?.[0]?.chapter_api_data);
}

function pageFromCursor(cursor?: string | null) {
  const match = cursor?.match(/^page:(\d{1,7})$/);
  return Math.max(1, Number(match?.[1]) || 1);
}

async function batchInChunks(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
}

async function fetchComicPath(path: string, signal: AbortSignal) {
  let failure: unknown;
  for (const url of comicApiCandidates(path)) {
    try {
      const response = await fetch(url, {
        headers: {
          ...contentApiHeaders(url),
          "User-Agent": "MucCatalog/2.0 (+source-attribution)",
        },
        signal,
      });
      if (response.ok) return response;
      failure = new Error(`Comic source returned ${response.status}`);
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error("Comic source unavailable");
}

async function fetchPage(page: number) {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetchComicPath(`/danh-sach/truyen-moi?page=${page}`, controller.signal);
      if (!response.ok) throw new Error(`OTruyen page ${page} returned ${response.status}`);
      return await response.json() as SourcePayload;
    } catch (error) {
      failure = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw failure instanceof Error ? failure : new Error(`OTruyen page ${page} failed`);
}

async function fetchStory(slug: string) {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetchComicPath(`/truyen-tranh/${slug}`, controller.signal);
      if (!response.ok) throw new Error(`OTruyen story ${slug} returned ${response.status}`);
      return await response.json() as { data?: { item?: SourceItem } };
    } catch (error) {
      failure = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw failure instanceof Error ? failure : new Error(`OTruyen story ${slug} failed`);
}

export async function refreshOTruyenStory(db: D1Database, slug: string) {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return false;
  const payload = await fetchStory(slug);
  const item = payload.data?.item;
  if (!item?._id || !item.slug) return false;
  const chapterRows = item.chapters?.flatMap((server) => server.server_data ?? []) ?? [];
  const seen = new Set<string>();
  const chapters = chapterRows
    .map((chapter) => ({
      id: chapterIdFromApiUrl(chapter.chapter_api_data) ?? "",
      number: chapter.chapter_name ?? "?",
      title: chapter.chapter_title ?? "",
      apiUrl: chapter.chapter_api_data ?? "",
    }))
    .filter((chapter) => {
      if (!chapter.id || seen.has(chapter.number)) return false;
      seen.add(chapter.number);
      return true;
    })
    .sort((left, right) =>
      (Number.parseFloat(right.number) || 0) - (Number.parseFloat(left.number) || 0)
      || right.number.localeCompare(left.number, "vi", { numeric: true })
    );
  const explicitLatest = item.chaptersLatest?.[0];
  const fallbackLatest = chapters[0];
  return await persistOTruyenStorySnapshot(db, {
    id: item._id,
    slug: item.slug,
    latestChapter: explicitLatest?.chapter_name ?? fallbackLatest?.number ?? null,
    latestChapterId: latestChapterId(item) ?? fallbackLatest?.id ?? null,
    updatedAt: item.updatedAt ?? new Date().toISOString(),
    chapters,
  });
}

export async function refreshTrackedOTruyenStories(db: D1Database, limit = 18) {
  const rows = await db.prepare(`
    SELECT DISTINCT s.slug
    FROM stories s
    JOIN source_items si ON si.story_id = s.id AND si.source_id = 'source_otruyen'
    LEFT JOIN library_entries le ON le.story_id = s.id AND le.followed = 1
    LEFT JOIN reading_progress rp ON rp.story_id = s.id AND rp.updated_at > datetime('now', '-30 days')
    WHERE le.story_id IS NOT NULL OR rp.story_id IS NOT NULL
    ORDER BY COALESCE(si.last_checked_at, '1970-01-01') ASC
    LIMIT ?
  `).bind(Math.min(Math.max(limit, 1), 30)).all<{ slug: string }>();
  const slugs = (rows.results ?? []).map((row) => row.slug);
  let refreshed = 0;
  for (let index = 0; index < slugs.length; index += 3) {
    const wave = await Promise.allSettled(slugs.slice(index, index + 3).map((slug) => refreshOTruyenStory(db, slug)));
    refreshed += wave.filter((result) => result.status === "fulfilled" && result.value).length;
  }
  return refreshed;
}

export async function runOTruyenIngest(db: D1Database, options: IngestOptions = {}): Promise<IngestResult> {
  const runId = `sync_${crypto.randomUUID()}`;
  const latestRun = options.mode === "refresh" || options.cursor
    ? null
    : await db.prepare(
      "SELECT cursor FROM sync_runs WHERE source_id = ? AND status = 'completed' AND cursor LIKE 'page:%' ORDER BY finished_at DESC LIMIT 1",
    ).bind(SOURCE_ID).first<{ cursor?: string | null }>();
  const startPage = options.mode === "refresh" ? 1 : pageFromCursor(options.cursor ?? latestRun?.cursor);
  const pagesPerRun = Math.min(Math.max(Math.floor(options.pagesPerRun ?? 8), 1), 12);
  const firstPayload = await fetchPage(startPage);
  const pagination = firstPayload.data?.params?.pagination;
  const totalSourcePages = (
    pagination?.totalPages
    ?? Math.ceil((pagination?.totalItems ?? 0) / Math.max(1, pagination?.totalItemsPerPage ?? 24))
  ) || startPage;
  const pageNumbers = Array.from(
    { length: Math.min(pagesPerRun, Math.max(1, totalSourcePages - startPage + 1)) },
    (_, index) => startPage + index,
  );
  const remainingPayloads = await Promise.all(pageNumbers.slice(1).map((page) => fetchPage(page)));
  const payloads = [firstPayload, ...remainingPayloads];
  const lastProcessedPage = pageNumbers.at(-1) ?? startPage;
  const nextCursor = options.mode === "refresh"
    ? `head:${lastProcessedPage}`
    : `page:${lastProcessedPage >= totalSourcePages ? 1 : lastProcessedPage + 1}`;

  await db.batch([
    db.prepare("INSERT INTO sources (id, slug, name, base_url, kind, enabled, license_mode, last_sync_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name = excluded.name, base_url = excluded.base_url, enabled = excluded.enabled, license_mode = excluded.license_mode").bind(
      SOURCE_ID,
      "otruyen",
      contentApiSourceName(),
      getContentApiConfiguration().baseUrl ?? SOURCE_URL,
      "api",
      1,
      "Configured compatibility API; retain per-item provenance and source-hosted media",
    ),
    db.prepare("INSERT INTO sync_runs (id, source_id, status, cursor, imported, updated, failed, started_at) VALUES (?, ?, 'running', ?, 0, 0, 0, CURRENT_TIMESTAMP)").bind(runId, SOURCE_ID, nextCursor),
  ]);

  const statements: D1PreparedStatement[] = [];
  let imported = 0;
  let failed = 0;
  for (const [payloadIndex, payload] of payloads.entries()) {
    const cdn = payload.data?.APP_DOMAIN_CDN_IMAGE ?? "https://img.otruyenapi.com";
    for (const item of payload.data?.items ?? []) {
      if (!item._id || !item.slug || !item.name || !/^[a-z0-9-]+$/.test(item.slug)) {
        failed += 1;
        continue;
      }
      imported += 1;
      const sourceSlugs = (item.category ?? []).flatMap((category) => category.slug ? [category.slug] : []);
      const autoTags = deriveAutoTags(sourceSlugs, item.name);
      const contentRating = inferContentRating(sourceSlugs);
      const coverUrl = item.thumb_url?.startsWith("http")
        ? item.thumb_url
        : item.thumb_url
          ? `${cdn}/uploads/comics/${item.thumb_url}`
          : null;
      const externalUrl = `https://otruyen.cc/truyen-tranh/${item.slug}`;
      const provisionalScore = provisionalCatalogScore(item);
      statements.push(
        db.prepare("INSERT INTO stories (id, slug, medium, canonical_title, synopsis, author, status, origin, content_rating, cover_url, latest_chapter, latest_chapter_label, latest_chapter_id, updated_at) VALUES (?, ?, 'comic', ?, '', NULL, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, canonical_title = excluded.canonical_title, origin = excluded.origin, status = excluded.status, content_rating = excluded.content_rating, cover_url = excluded.cover_url, latest_chapter = excluded.latest_chapter, latest_chapter_label = excluded.latest_chapter_label, latest_chapter_id = excluded.latest_chapter_id, updated_at = excluded.updated_at").bind(item._id, item.slug, item.name, normalizedStatus(item.status), item.origin_name?.filter(Boolean).join(" · ") || null, contentRating, coverUrl, latestChapter(item), item.chaptersLatest?.[0]?.chapter_name ?? null, latestChapterId(item), item.updatedAt ?? new Date().toISOString()),
        db.prepare("INSERT INTO source_items (id, source_id, story_id, external_id, external_url, etag, source_updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?) ON CONFLICT(source_id, external_id) DO UPDATE SET external_url = excluded.external_url, source_updated_at = excluded.source_updated_at").bind(`otruyen_${item._id}`, SOURCE_ID, item._id, item._id, externalUrl, item.updatedAt ?? null),
        db.prepare("INSERT INTO story_scores (story_id, score_5, confidence, source_count, vote_count, computed_at) VALUES (?, ?, 'insufficient', 0, 0, ?) ON CONFLICT(story_id) DO UPDATE SET score_5 = excluded.score_5, computed_at = excluded.computed_at WHERE story_scores.source_count = 0").bind(item._id, provisionalScore, item.updatedAt ?? new Date().toISOString()),
      );
      for (const category of item.category ?? []) {
        if (!category.slug || !category.name || !/^[a-z0-9-]+$/.test(category.slug)) continue;
        const genreId = `genre_${category.slug}`;
        statements.push(
          db.prepare("INSERT INTO genres (id, slug, name) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name").bind(genreId, category.slug, category.name),
          db.prepare("INSERT INTO story_genres (story_id, genre_id, origin, confidence) VALUES (?, ?, 'source', 1) ON CONFLICT(story_id, genre_id) DO UPDATE SET origin = 'source', confidence = 1").bind(item._id, genreId),
        );
      }
      for (const tag of autoTags) {
        const genreId = `genre_${tag.slug}`;
        statements.push(
          db.prepare("INSERT INTO genres (id, slug, name) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name").bind(genreId, tag.slug, tag.name),
          db.prepare("INSERT INTO story_genres (story_id, genre_id, origin, confidence) VALUES (?, ?, 'rule', ?) ON CONFLICT(story_id, genre_id) DO UPDATE SET origin = 'rule', confidence = excluded.confidence").bind(item._id, genreId, tag.confidence),
        );
      }
    }
    if (!(payload.data?.items?.length)) {
      failed += 1;
      console.warn(`OTruyen page ${pageNumbers[payloadIndex]} returned no items`);
    }
  }

  try {
    await batchInChunks(db, statements);
    await db.batch([
      db.prepare("UPDATE sync_runs SET status = 'completed', cursor = ?, imported = ?, updated = ?, failed = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(nextCursor, imported, 0, failed, runId),
      db.prepare("UPDATE sources SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?").bind(SOURCE_ID),
    ]);
    return {
      runId,
      imported,
      updated: 0,
      failed,
      cursor: nextCursor,
      pagesProcessed: pageNumbers.length,
      totalSourcePages,
    };
  } catch (error) {
    const rootCause = error instanceof Error ? error.message.slice(0, 240) : "Unknown D1 failure";
    await db.prepare("UPDATE sync_runs SET status = 'failed', cursor = ?, failed = ?, finished_at = CURRENT_TIMESTAMP, error_summary = ? WHERE id = ?").bind(nextCursor, failed + 1, `file: lib/sources/otruyen.ts | line: batch | root_cause: ${rootCause}`, runId).run();
    throw error;
  }
}
