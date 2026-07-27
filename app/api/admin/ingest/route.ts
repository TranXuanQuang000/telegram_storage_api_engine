import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameSecret } from "../../../../lib/admin-auth";
import { runOTruyenIngest } from "../../../../lib/sources/otruyen";
import { isMangaApiCatalogProvider } from "../../../../lib/sources/manga-api";

const bodySchema = z.object({ source: z.literal("otruyen"), mode: z.enum(["incremental", "refresh"]), cursor: z.string().max(240).nullable().optional() }).strict();

export async function POST(request: NextRequest) {
  if (isMangaApiCatalogProvider()) {
    return NextResponse.json({
      error: "Catalog do manga-api quản lý; ingestion OTruyen trong web đã tắt",
      code: "INGEST_MANAGED_BY_MANGA_API",
      details: null,
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const runtime = env as unknown as { DB?: D1Database; INGEST_TOKEN?: string };
  if (!runtime.DB || !runtime.INGEST_TOKEN) return NextResponse.json({ error: "Ingestion chưa được cấu hình trên hosting", code: "INGEST_NOT_CONFIGURED", details: null }, { status: 503 });
  const supplied = request.headers.get("x-ingest-token") ?? "";
  if (!supplied || !(await sameSecret(supplied, runtime.INGEST_TOKEN))) return NextResponse.json({ error: "Không có quyền chạy ingestion", code: "UNAUTHORIZED", details: null }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON không hợp lệ", code: "INVALID_JSON", details: null }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Cấu hình ingestion không hợp lệ", code: "INVALID_REQUEST", details: null }, { status: 400 });

  try {
    const result = await runOTruyenIngest(runtime.DB, {
      mode: parsed.data.mode,
      cursor: parsed.data.cursor,
      pagesPerRun: parsed.data.mode === "refresh" ? 4 : 8,
    });
    return NextResponse.json({ runId: result.runId, status: "accepted", result }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Đồng bộ nguồn thất bại", code: "SOURCE_SYNC_FAILED", details: { file: "lib/sources/otruyen.ts", line: "batch", rootCause: "Source or D1 operation failed; inspect sync_runs" } }, { status: 502 });
  }
}
