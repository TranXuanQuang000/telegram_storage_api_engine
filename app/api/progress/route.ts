import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentProfile } from "../../../lib/auth-profile";
import { getStory } from "../../../lib/catalog";
import { getNovel } from "../../../lib/novels";

const schema = z.object({
  storyId: z.string().min(1).max(160),
  chapterId: z.string().min(1).max(160),
  chapterName: z.string().max(80).optional(),
  page: z.number().int().min(0).max(100_000),
  totalPages: z.number().int().min(0).max(100_000).optional(),
  progress: z.number().min(0).max(1),
  storyTitle: z.string().max(240).optional(),
  coverUrl: z.string().url().nullable().optional(),
  medium: z.enum(["comic", "novel"]).default("comic"),
  locator: z.string().max(1_000).optional(),
  idempotencyKey: z.string().min(1).max(256),
}).strict();

function runtimeDb() {
  return (env as unknown as { DB?: D1Database }).DB;
}

async function resolveStoryId(
  db: D1Database,
  requested: string,
  medium: "comic" | "novel",
  fallbackTitle?: string,
) {
  const existing = await db.prepare(
    "SELECT id FROM stories WHERE id = ? OR slug = ? LIMIT 1",
  ).bind(requested, requested).first<{ id: string }>();
  if (existing) return existing.id;

  const detail = medium === "comic"
    ? await getStory(requested, { includeExternalRating: false }).catch(() => null)
    : null;
  const novel = medium === "novel"
    ? await getNovel(requested).catch(() => null)
    : null;
  if (!detail && !novel) return null;
  const id = detail?.id ?? novel?.id ?? `novel_${requested}`;
  const slug = detail?.slug ?? novel?.slug ?? requested;
  const latest = detail ? Number.parseFloat(detail.latestChapter ?? "") : novel?.chapters.length ?? Number.NaN;
  const latestLabel = detail?.latestChapter ?? novel?.chapters.at(-1)?.label ?? null;
  const latestId = detail?.latestChapterId ?? novel?.chapters.at(-1)?.id ?? null;
  await db.prepare(`
    INSERT INTO stories
      (id, slug, medium, canonical_title, synopsis, author, status, origin, content_rating, cover_url, latest_chapter, latest_chapter_label, latest_chapter_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      canonical_title = excluded.canonical_title,
      synopsis = excluded.synopsis,
      cover_url = excluded.cover_url,
      latest_chapter = excluded.latest_chapter,
      latest_chapter_label = excluded.latest_chapter_label,
      latest_chapter_id = excluded.latest_chapter_id,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id,
    slug,
    medium,
    detail?.title ?? novel?.title ?? fallbackTitle ?? requested,
    detail?.synopsis ?? novel?.description ?? "",
    detail?.authors.join(", ") || novel?.author || null,
    detail?.status ?? "completed",
    detail?.originTitle ?? novel?.sourceName ?? null,
    detail?.contentRating ?? "safe",
    detail?.coverUrl ?? null,
    Number.isFinite(latest) ? latest : null,
    latestLabel,
    latestId,
  ).run();
  return id;
}

export async function GET() {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ items: [] });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ items: [] });

  const result = await db.prepare(`
    SELECT
      rp.story_id, rp.chapter_id, rp.chapter_name, rp.page, rp.total_pages,
      rp.progress, rp.story_title, rp.cover_url AS progress_cover_url,
      rp.medium, rp.locator, rp.updated_at,
      s.slug AS story_slug, s.canonical_title, s.cover_url
    FROM reading_progress rp
    LEFT JOIN stories s ON s.id = rp.story_id
    WHERE rp.profile_id = ?
    ORDER BY rp.updated_at DESC
    LIMIT 100
  `).bind(profile.id).all<Record<string, string | number | null>>();

  const items = (result.results ?? []).map((row) => ({
    chapterId: String(row.chapter_id),
    chapterName: String(row.chapter_name || "mới"),
    page: Number(row.page ?? 0),
    totalPages: Number(row.total_pages ?? 0),
    progress: Number(row.progress ?? 0),
    storySlug: String(row.story_slug || row.story_id),
    storyTitle: String(row.story_title || row.canonical_title || "Truyện đang đọc"),
    coverUrl: row.progress_cover_url || row.cover_url,
    medium: row.medium || "comic",
    locator: row.locator,
    updatedAt: row.updated_at,
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: NextRequest) {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE" }, { status: 503 });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để đồng bộ tiến độ", code: "AUTH_REQUIRED" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON không hợp lệ", code: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Tiến độ không hợp lệ", code: "INVALID_PROGRESS" }, { status: 400 });

  const storyId = await resolveStoryId(db, parsed.data.storyId, parsed.data.medium, parsed.data.storyTitle);
  if (!storyId) return NextResponse.json({ error: "Truyện chưa có trong catalog", code: "STORY_NOT_FOUND" }, { status: 404 });
  const updatedAt = new Date().toISOString();
  const scopedIdempotencyKey = `${profile.id}:${parsed.data.idempotencyKey}`;
  await db.prepare(`
    INSERT INTO reading_progress
      (profile_id, story_id, chapter_id, chapter_name, page, total_pages, progress, story_title, cover_url, medium, locator, idempotency_key, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, story_id) DO UPDATE SET
      chapter_id = excluded.chapter_id,
      chapter_name = excluded.chapter_name,
      page = excluded.page,
      total_pages = excluded.total_pages,
      progress = excluded.progress,
      story_title = excluded.story_title,
      cover_url = excluded.cover_url,
      medium = excluded.medium,
      locator = excluded.locator,
      idempotency_key = excluded.idempotency_key,
      updated_at = excluded.updated_at
  `).bind(
    profile.id,
    storyId,
    parsed.data.chapterId,
    parsed.data.chapterName ?? "",
    parsed.data.page,
    parsed.data.totalPages ?? 0,
    parsed.data.progress,
    parsed.data.storyTitle ?? null,
    parsed.data.coverUrl ?? null,
    parsed.data.medium,
    parsed.data.locator ?? null,
    scopedIdempotencyKey,
    updatedAt,
  ).run();

  return NextResponse.json({ ...parsed.data, storyId, updatedAt }, { headers: { "Cache-Control": "no-store" } });
}
