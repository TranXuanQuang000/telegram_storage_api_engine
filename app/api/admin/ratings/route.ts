import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameSecret } from "../../../../lib/admin-auth";
import { runRatingEnrichment } from "../../../../lib/sources/ratings";

const bodySchema = z.object({ limit: z.number().int().min(1).max(12).default(6) }).strict();

export async function POST(request: NextRequest) {
  const runtime = env as unknown as { DB?: D1Database; INGEST_TOKEN?: string };
  if (!runtime.DB || !runtime.INGEST_TOKEN) return NextResponse.json({ error: "Rating ingestion chưa được cấu hình", code: "INGEST_NOT_CONFIGURED", details: null }, { status: 503 });
  const supplied = request.headers.get("x-ingest-token") ?? "";
  if (!supplied || !(await sameSecret(supplied, runtime.INGEST_TOKEN))) return NextResponse.json({ error: "Không có quyền làm mới điểm", code: "UNAUTHORIZED", details: null }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON không hợp lệ", code: "INVALID_JSON", details: null }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Giới hạn làm mới không hợp lệ", code: "INVALID_REQUEST", details: null }, { status: 400 });
  const result = await runRatingEnrichment(runtime.DB, parsed.data.limit);
  return NextResponse.json({ status: "completed", result }, { headers: { "Cache-Control": "no-store" } });
}
