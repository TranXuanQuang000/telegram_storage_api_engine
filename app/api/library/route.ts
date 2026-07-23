import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentProfile } from "../../../lib/auth-profile";

const writeSchema = z.object({ storyId: z.string().min(1).max(120), status: z.enum(["reading", "planned", "completed", "paused", "dropped"]), followed: z.boolean() }).strict();

function runtimeDb() { return (env as unknown as { DB?: D1Database }).DB; }

export async function GET() {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE", details: null }, { status: 503 });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để mở tủ đồng bộ", code: "AUTH_REQUIRED", details: null }, { status: 401 });
  const result = await db.prepare(`SELECT le.status, le.followed, le.updated_at, s.id, s.slug, s.canonical_title, s.cover_url, s.status AS story_status, s.latest_chapter, ss.score_5, ss.confidence, ss.source_count, ss.vote_count, ss.computed_at FROM library_entries le JOIN stories s ON s.id = le.story_id LEFT JOIN story_scores ss ON ss.story_id = s.id WHERE le.profile_id = ? ORDER BY le.updated_at DESC LIMIT 200`).bind(profile.id).all<Record<string, string | number | null>>();
  const items = result.results.map((row) => ({
    story: { id: row.id, slug: row.slug, title: row.canonical_title, coverUrl: row.cover_url, status: row.story_status, genres: [], latestChapter: row.latest_chapter, score: { value: row.score_5, confidence: row.confidence ?? "insufficient", sourceCount: row.source_count ?? 0, voteCount: row.vote_count ?? 0, computedAt: row.computed_at ?? row.updated_at } },
    status: row.status,
    followed: Boolean(row.followed),
    updatedAt: row.updated_at,
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: NextRequest) {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE", details: null }, { status: 503 });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để đồng bộ tủ truyện", code: "AUTH_REQUIRED", details: null }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON không hợp lệ", code: "INVALID_JSON", details: null }, { status: 400 }); }
  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Mục tủ truyện không hợp lệ", code: "INVALID_LIBRARY_ENTRY", details: null }, { status: 400 });
  const story = await db.prepare("SELECT id, slug, canonical_title, cover_url, status, latest_chapter FROM stories WHERE id = ?").bind(parsed.data.storyId).first<Record<string, string | number | null>>();
  if (!story) return NextResponse.json({ error: "Truyện chưa có trong catalog đồng bộ", code: "STORY_NOT_FOUND", details: null }, { status: 404 });
  const updatedAt = new Date().toISOString();
  await db.prepare("INSERT INTO library_entries (profile_id, story_id, status, followed, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(profile_id, story_id) DO UPDATE SET status = excluded.status, followed = excluded.followed, updated_at = excluded.updated_at").bind(profile.id, parsed.data.storyId, parsed.data.status, parsed.data.followed ? 1 : 0, updatedAt).run();
  return NextResponse.json({ story: { id: story.id, slug: story.slug, title: story.canonical_title, coverUrl: story.cover_url, status: story.status, genres: [], latestChapter: story.latest_chapter, score: { value: null, confidence: "insufficient", sourceCount: 0, voteCount: 0, computedAt: updatedAt } }, status: parsed.data.status, followed: parsed.data.followed, updatedAt }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const db = runtimeDb();
  if (!db) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE", details: null }, { status: 503 });
  const profile = await currentProfile(db);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để đồng bộ tủ truyện", code: "AUTH_REQUIRED", details: null }, { status: 401 });
  const storyId = request.nextUrl.searchParams.get("storyId") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(storyId)) return NextResponse.json({ error: "Mã truyện không hợp lệ", code: "INVALID_STORY_ID", details: null }, { status: 400 });
  await db.prepare("DELETE FROM library_entries WHERE profile_id = ? AND story_id = ?").bind(profile.id, storyId).run();
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
