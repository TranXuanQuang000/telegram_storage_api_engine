import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentProfile } from "../../../lib/auth-profile";
import { getStory } from "../../../lib/catalog";
import { getNovel } from "../../../lib/novels";

const writeSchema = z.object({
  storyId: z.string().min(1).max(160),
  slug: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(240).optional(),
  coverUrl: z.string().url().nullable().optional(),
  medium: z.enum(["comic", "novel"]).default("comic"),
  status: z.enum(["reading", "planned", "completed", "paused", "dropped"]).default("reading"),
  followed: z.boolean().default(true),
}).strict();

type StoryRow = {
  id: string;
  slug: string;
  canonical_title: string;
  cover_url: string | null;
  status: string;
  latest_chapter: number | null;
  latest_chapter_label: string | null;
  latest_chapter_id: string | null;
  medium: "comic" | "novel";
};

function runtimeDb() {
  return (env as unknown as { DB?: D1Database }).DB;
}

async function resolveStory(
  db: D1Database,
  input: z.infer<typeof writeSchema>,
): Promise<StoryRow | null> {
  const existing = await db.prepare(
    "SELECT id, slug, canonical_title, cover_url, status, latest_chapter, latest_chapter_label, latest_chapter_id, medium FROM stories WHERE id = ? OR slug = ? LIMIT 1",
  ).bind(input.storyId, input.slug ?? input.storyId).first<StoryRow>();
  if (existing) return existing;

  const detail = input.medium === "comic" && input.slug
    ? await getStory(input.slug, { includeExternalRating: false }).catch(() => null)
    : null;
  const novel = input.medium === "novel" && input.slug
    ? await getNovel(input.slug).catch(() => null)
    : null;
  const id = detail?.id ?? novel?.id ?? input.storyId;
  const slug = detail?.slug ?? novel?.slug ?? input.slug ?? input.storyId;
  const title = detail?.title ?? novel?.title ?? input.title ?? slug;
  const coverUrl = detail?.coverUrl ?? input.coverUrl ?? null;
  const status = detail?.status ?? "ongoing";
  const latest = detail ? Number.parseFloat(detail.latestChapter ?? "") : novel?.chapters.length ?? Number.NaN;
  const latestLabel = detail?.latestChapter ?? (novel?.chapters.length ? novel.chapters.at(-1)?.label ?? null : null);
  const latestId = detail?.latestChapterId ?? novel?.chapters.at(-1)?.id ?? null;

  await db.prepare(
    `INSERT INTO stories
      (id, slug, medium, canonical_title, synopsis, author, status, origin, content_rating, cover_url, latest_chapter, latest_chapter_label, latest_chapter_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       slug = excluded.slug,
       canonical_title = excluded.canonical_title,
       cover_url = COALESCE(excluded.cover_url, stories.cover_url),
       latest_chapter = COALESCE(excluded.latest_chapter, stories.latest_chapter),
       latest_chapter_label = COALESCE(excluded.latest_chapter_label, stories.latest_chapter_label),
       latest_chapter_id = COALESCE(excluded.latest_chapter_id, stories.latest_chapter_id),
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    id,
    slug,
    input.medium,
    title,
    detail?.synopsis ?? novel?.description ?? "",
    detail?.authors.join(", ") || novel?.author || null,
    status,
    detail?.originTitle ?? novel?.sourceName ?? null,
    detail?.contentRating ?? "safe",
    coverUrl,
    Number.isFinite(latest) ? latest : null,
    latestLabel,
    latestId,
  ).run();

  return await db.prepare(
    "SELECT id, slug, canonical_title, cover_url, status, latest_chapter, latest_chapter_label, latest_chapter_id, medium FROM stories WHERE id = ? LIMIT 1",
  ).bind(id).first<StoryRow>();
}

export async function GET() {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE" }, { status: 503 });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để mở tủ đồng bộ", code: "AUTH_REQUIRED" }, { status: 401 });

  const result = await db.prepare(`
    SELECT
      le.status AS library_status, le.followed, le.updated_at,
      s.id, s.slug, s.medium, s.canonical_title, s.cover_url, s.status, s.latest_chapter, s.latest_chapter_label, s.latest_chapter_id,
      ss.score_5, ss.confidence, ss.source_count, ss.vote_count, ss.computed_at
    FROM library_entries le
    JOIN stories s ON s.id = le.story_id
    LEFT JOIN story_scores ss ON ss.story_id = s.id
    WHERE le.profile_id = ?
    ORDER BY le.updated_at DESC
    LIMIT 200
  `).bind(profile.id).all<Record<string, string | number | null>>();

  const items = (result.results ?? []).map((row) => ({
    story: {
      id: row.id,
      slug: row.slug,
      medium: row.medium,
      title: row.canonical_title,
      coverUrl: row.cover_url,
      status: row.status,
      latestChapter: row.latest_chapter_label ?? (row.latest_chapter === null ? null : String(row.latest_chapter)),
      latestChapterId: row.latest_chapter_id,
      score: row.score_5,
    },
    status: row.library_status,
    followed: Boolean(row.followed),
    updatedAt: row.updated_at,
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: NextRequest) {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE" }, { status: 503 });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để đồng bộ tủ truyện", code: "AUTH_REQUIRED" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON không hợp lệ", code: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Mục tủ truyện không hợp lệ", code: "INVALID_LIBRARY_ENTRY" }, { status: 400 });

  const story = await resolveStory(db, parsed.data);
  if (!story) return NextResponse.json({ error: "Không thể đồng bộ truyện với catalog", code: "STORY_NOT_FOUND" }, { status: 404 });
  const updatedAt = new Date().toISOString();
  await db.prepare(`
    INSERT INTO library_entries (profile_id, story_id, status, followed, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, story_id) DO UPDATE SET
      status = excluded.status,
      followed = excluded.followed,
      updated_at = excluded.updated_at
  `).bind(profile.id, story.id, parsed.data.status, parsed.data.followed ? 1 : 0, updatedAt).run();

  return NextResponse.json({
    story: {
      id: story.id,
      slug: story.slug,
      title: story.canonical_title,
      coverUrl: story.cover_url,
      status: story.status,
      latestChapter: story.latest_chapter === null ? null : String(story.latest_chapter),
      latestChapterId: story.latest_chapter_id,
      medium: story.medium,
    },
    status: parsed.data.status,
    followed: parsed.data.followed,
    updatedAt,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE" }, { status: 503 });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để đồng bộ tủ truyện", code: "AUTH_REQUIRED" }, { status: 401 });
  const storyId = request.nextUrl.searchParams.get("storyId") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(storyId)) return NextResponse.json({ error: "Mã truyện không hợp lệ", code: "INVALID_STORY_ID" }, { status: 400 });

  await db.prepare(`
    DELETE FROM library_entries
    WHERE profile_id = ?
      AND story_id IN (SELECT id FROM stories WHERE id = ? OR slug = ?)
  `).bind(profile.id, storyId, storyId).run();
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
