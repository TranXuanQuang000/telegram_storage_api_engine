import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentProfile } from "../../../lib/auth-profile";

const schema = z.object({
  storyId: z.string().min(1).max(120),
  chapterId: z.string().min(1).max(120),
  page: z.number().int().min(0).max(100_000),
  progress: z.number().min(0).max(1),
  idempotencyKey: z.string().min(8).max(128),
}).strict();

export async function PUT(request: NextRequest) {
  const runtime = env as unknown as { DB?: D1Database };
  if (!runtime.DB) return NextResponse.json({ error: "Database unavailable", code: "DB_UNAVAILABLE", details: null }, { status: 503 });
  const profile = await currentProfile(runtime.DB);
  if (!profile) return NextResponse.json({ error: "Đăng nhập để đồng bộ tiến độ", code: "AUTH_REQUIRED", details: null }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON không hợp lệ", code: "INVALID_JSON", details: null }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Tiến độ không hợp lệ", code: "INVALID_PROGRESS", details: null }, { status: 400 });
  const story = await runtime.DB.prepare("SELECT id FROM stories WHERE id = ? OR slug = ? LIMIT 1").bind(parsed.data.storyId, parsed.data.storyId).first<{ id: string }>();
  if (!story) return NextResponse.json({ error: "Truyện chưa có trong catalog đồng bộ", code: "STORY_NOT_FOUND", details: null }, { status: 404 });
  const updatedAt = new Date().toISOString();
  const scopedIdempotencyKey = `${profile.id}:${parsed.data.idempotencyKey}`;
  await runtime.DB.prepare("INSERT INTO reading_progress (profile_id, story_id, chapter_id, page, progress, idempotency_key, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(profile_id, story_id) DO UPDATE SET chapter_id = excluded.chapter_id, page = excluded.page, progress = excluded.progress, idempotency_key = excluded.idempotency_key, updated_at = excluded.updated_at").bind(profile.id, story.id, parsed.data.chapterId, parsed.data.page, parsed.data.progress, scopedIdempotencyKey, updatedAt).run();
  return NextResponse.json({ ...parsed.data, updatedAt }, { headers: { "Cache-Control": "no-store" } });
}
