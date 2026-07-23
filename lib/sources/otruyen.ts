import { deriveAutoTags, inferContentRating } from "../auto-tags";

type SourceCategory = { id?: string; name?: string; slug?: string };
type SourceItem = {
  _id?: string;
  name?: string;
  slug?: string;
  status?: string;
  thumb_url?: string;
  category?: SourceCategory[];
  updatedAt?: string;
  chaptersLatest?: Array<{ chapter_name?: string; chapter_api_data?: string }>;
};

export type IngestResult = { runId: string; imported: number; updated: number; failed: number; cursor: string | null };

const SOURCE_ID = "source_otruyen";
const API_URL = "https://otruyenapi.com/v1/api/home";
const SOURCE_URL = "https://otruyenapi.com";

function normalizedStatus(status?: string): "ongoing" | "completed" | "hiatus" | "cancelled" {
  return status === "completed" || status === "hiatus" || status === "cancelled" ? status : "ongoing";
}

function latestChapter(item: SourceItem): number | null {
  const parsed = Number.parseFloat(item.chaptersLatest?.[0]?.chapter_name ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

async function batchInChunks(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
}

export async function runOTruyenIngest(db: D1Database): Promise<IngestResult> {
  const runId = `sync_${crypto.randomUUID()}`;
  const response = await fetch(API_URL, { headers: { Accept: "application/json", "User-Agent": "MucCatalog/1.0 (+source-attribution)" } });
  if (!response.ok) throw new Error(`OTruyen home returned ${response.status}`);
  const payload = await response.json() as { data?: { items?: SourceItem[]; APP_DOMAIN_CDN_IMAGE?: string } };
  const items = payload.data?.items ?? [];
  const cdn = payload.data?.APP_DOMAIN_CDN_IMAGE ?? "https://img.otruyenapi.com";

  await db.batch([
    db.prepare("INSERT INTO sources (id, slug, name, base_url, kind, enabled, license_mode, last_sync_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, license_mode = excluded.license_mode").bind(SOURCE_ID, "otruyen", "OTruyen API", SOURCE_URL, "api", 1, "Public API; metadata and source-hosted media with attribution"),
    db.prepare("INSERT INTO sync_runs (id, source_id, status, cursor, imported, updated, failed, started_at) VALUES (?, ?, 'running', NULL, 0, 0, 0, CURRENT_TIMESTAMP)").bind(runId, SOURCE_ID),
  ]);

  const statements: D1PreparedStatement[] = [];
  let imported = 0;
  let failed = 0;
  for (const item of items) {
    if (!item._id || !item.slug || !item.name || !/^[a-z0-9-]+$/.test(item.slug)) { failed += 1; continue; }
    imported += 1;
    const sourceSlugs = (item.category ?? []).flatMap((category) => category.slug ? [category.slug] : []);
    const autoTags = deriveAutoTags(sourceSlugs, item.name);
    const contentRating = inferContentRating(sourceSlugs);
    const coverUrl = item.thumb_url ? `${cdn}/uploads/comics/${item.thumb_url}` : null;
    const externalUrl = `https://otruyen.cc/truyen-tranh/${item.slug}`;
    statements.push(
      db.prepare("INSERT INTO stories (id, slug, canonical_title, synopsis, author, status, origin, content_rating, cover_url, latest_chapter, updated_at) VALUES (?, ?, ?, '', NULL, ?, NULL, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET canonical_title = excluded.canonical_title, status = excluded.status, content_rating = excluded.content_rating, cover_url = excluded.cover_url, latest_chapter = excluded.latest_chapter, updated_at = excluded.updated_at").bind(item._id, item.slug, item.name, normalizedStatus(item.status), contentRating, coverUrl, latestChapter(item), item.updatedAt ?? new Date().toISOString()),
      db.prepare("INSERT INTO source_items (id, source_id, story_id, external_id, external_url, etag, source_updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?) ON CONFLICT(source_id, external_id) DO UPDATE SET external_url = excluded.external_url, source_updated_at = excluded.source_updated_at").bind(`otruyen_${item._id}`, SOURCE_ID, item._id, item._id, externalUrl, item.updatedAt ?? null),
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

  try {
    await batchInChunks(db, statements);
    await db.batch([
      db.prepare("UPDATE sync_runs SET status = 'completed', imported = ?, updated = ?, failed = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(imported, 0, failed, runId),
      db.prepare("UPDATE sources SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?").bind(SOURCE_ID),
    ]);
    return { runId, imported, updated: 0, failed, cursor: null };
  } catch (error) {
    const rootCause = error instanceof Error ? error.message.slice(0, 240) : "Unknown D1 failure";
    await db.prepare("UPDATE sync_runs SET status = 'failed', failed = ?, finished_at = CURRENT_TIMESTAMP, error_summary = ? WHERE id = ?").bind(failed + 1, `file: lib/sources/otruyen.ts | line: batch | root_cause: ${rootCause}`, runId).run();
    throw error;
  }
}
