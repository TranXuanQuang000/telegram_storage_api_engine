import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { sameSecret } from "../../../../lib/admin-auth";

type RuntimeEnv = {
  DB?: D1Database;
  ADMIN_DASHBOARD_TOKEN?: string;
  INGEST_TOKEN?: string;
  MUC_CONTENT_API_TOKEN?: string;
  MUC_CONTENT_API_URL?: string;
};

const REQUEST_TIMEOUT_MS = 8_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function runtimeEnv(): RuntimeEnv {
  const workerEnv = env as unknown as RuntimeEnv;
  return {
    DB: workerEnv.DB,
    ADMIN_DASHBOARD_TOKEN: workerEnv.ADMIN_DASHBOARD_TOKEN ?? process.env.ADMIN_DASHBOARD_TOKEN,
    INGEST_TOKEN: workerEnv.INGEST_TOKEN ?? process.env.INGEST_TOKEN,
    MUC_CONTENT_API_TOKEN: workerEnv.MUC_CONTENT_API_TOKEN ?? process.env.MUC_CONTENT_API_TOKEN,
    MUC_CONTENT_API_URL: workerEnv.MUC_CONTENT_API_URL ?? process.env.MUC_CONTENT_API_URL,
  };
}

function normalizeOrigin(value: string | undefined, fallback: string) {
  try {
    const url = new URL((value ?? fallback).trim());
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("Remote service must use HTTPS");
    }
    return url;
  } catch {
    return new URL(fallback);
  }
}

function novelEndpoint(base: URL, path: "health" | "sources") {
  const url = new URL(base);
  if (path === "health") {
    url.pathname = "/health";
    url.search = "";
    return url;
  }
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath.endsWith("/v1/api")
    ? `${normalizedPath}/sources/health`
    : "/v1/api/sources/health";
  url.search = "";
  return url;
}

async function fetchJson(url: URL, headers: HeadersInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const body = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      return { ok: false as const, latencyMs, statusCode: response.status, error: typeof body.message === "string" ? body.message : `HTTP ${response.status}` };
    }
    return { ok: true as const, latencyMs, statusCode: response.status, body };
  } catch (error) {
    return {
      ok: false as const,
      latencyMs: Date.now() - startedAt,
      statusCode: 0,
      error: error instanceof Error && error.name === "AbortError" ? "Hết thời gian chờ" : "Không kết nối được",
    };
  } finally {
    clearTimeout(timer);
  }
}

type SourceTelemetryRow = {
  source_key: string;
  last_sync_at: string | null;
  cursor: string | null;
  imported: number;
  updated: number;
  failed: number;
  last_run_at: string | null;
  last_error: string | null;
  item_count: number;
  chapter_count: number;
  pending_manifests: number;
};

async function readMangaTelemetry(db: D1Database) {
  const startedAt = Date.now();
  const [counts, sourceRows] = await Promise.all([
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM stories WHERE medium = 'comic') AS manga_count,
        (SELECT COUNT(*) FROM chapters) AS chapter_count,
        (SELECT COUNT(*) FROM chapters c JOIN source_items si ON si.id = c.source_item_id WHERE si.source_id IN ('source_nettruyen', 'source_truyenqq')) AS fallback_chapters,
        (SELECT COUNT(DISTINCT c.source_item_id) FROM chapters c JOIN source_items si ON si.id = c.source_item_id WHERE si.source_id IN ('source_nettruyen', 'source_truyenqq')) AS chapter_manifests,
        (SELECT COUNT(DISTINCT chapter_id) FROM chapter_pages) AS image_manifests,
        (SELECT COUNT(*) FROM chapter_pages) AS fallback_image_pages,
        (SELECT COUNT(*) FROM source_items WHERE source_id IN ('source_nettruyen', 'source_truyenqq') AND last_checked_at IS NULL) AS pending_manifests
    `).first<{ manga_count: number; chapter_count: number; fallback_chapters: number; chapter_manifests: number; image_manifests: number; fallback_image_pages: number; pending_manifests: number }>(),
    db.prepare(`
      SELECT
        src.slug AS source_key,
        src.last_sync_at,
        run.cursor,
        COALESCE(run.imported, 0) AS imported,
        COALESCE(run.updated, 0) AS updated,
        COALESCE(run.failed, 0) AS failed,
        run.finished_at AS last_run_at,
        run.error_summary AS last_error,
        (SELECT COUNT(*) FROM source_items si WHERE si.source_id = src.id) AS item_count,
        (SELECT COUNT(*) FROM chapters c JOIN source_items si ON si.id = c.source_item_id WHERE si.source_id = src.id) AS chapter_count,
        (SELECT COUNT(*) FROM source_items si WHERE si.source_id = src.id AND si.last_checked_at IS NULL) AS pending_manifests
      FROM sources src
      LEFT JOIN sync_runs run ON run.id = (
        SELECT id FROM sync_runs WHERE source_id = src.id ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 1
      )
      WHERE src.id IN ('source_otruyen', 'source_nettruyen', 'source_truyenqq')
      ORDER BY CASE src.id WHEN 'source_otruyen' THEN 0 WHEN 'source_truyenqq' THEN 1 ELSE 2 END
    `).all<SourceTelemetryRow>(),
  ]);
  const rows = sourceRows.results ?? [];
  return {
    latencyMs: Date.now() - startedAt,
    mangaCount: Number(counts?.manga_count ?? 0),
    chapterCount: Number(counts?.chapter_count ?? 0),
    fallbackChapters: Number(counts?.fallback_chapters ?? 0),
    chapterManifests: Number(counts?.chapter_manifests ?? 0),
    imageManifests: Number(counts?.image_manifests ?? 0),
    fallbackImagePages: Number(counts?.fallback_image_pages ?? 0),
    pendingManifests: Number(counts?.pending_manifests ?? 0),
    syncStates: rows.map((row) => {
      const cursorPage = Number(row.cursor?.match(/(?:page|catalog):(\d+)/)?.[1] ?? 0);
      return {
        _id: `source_${row.source_key}`,
        sourceKey: row.source_key,
        cursorPage,
        completedRound: cursorPage === 1,
        imported: Number(row.item_count ?? row.imported ?? 0),
        updated: Number(row.chapter_count ?? row.updated ?? 0),
        lastError: row.last_error,
        lastRunAt: row.last_run_at ?? row.last_sync_at,
        manifestCompletedRound: Number(row.pending_manifests ?? 0) === 0,
        manifestUpdated: Number(row.chapter_count ?? 0),
        manifestFailed: Number(row.failed ?? 0),
        manifestLastRunAt: row.last_run_at,
        manifestLastError: row.last_error,
      };
    }),
  };
}

export async function GET(request: NextRequest) {
  const runtime = runtimeEnv();
  const dashboardSecret = (runtime.ADMIN_DASHBOARD_TOKEN ?? runtime.INGEST_TOKEN ?? "").trim();
  if (!dashboardSecret) {
    return NextResponse.json(
      { status: "error", code: "ADMIN_DASHBOARD_NOT_CONFIGURED", message: "Trang admin chưa được cấu hình secret." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const supplied = request.headers.get("x-admin-token")?.trim() ?? "";
  if (!supplied || !(await sameSecret(supplied, dashboardSecret))) {
    return NextResponse.json(
      { status: "error", code: "UNAUTHORIZED", message: "Mã quản trị không đúng." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const novelBase = normalizeOrigin(runtime.MUC_CONTENT_API_URL, "https://telegram-storage-api-engine.onrender.com/v1/api");
  const novelToken = runtime.MUC_CONTENT_API_TOKEN?.trim() ?? "";
  const novelHealthUrl = novelEndpoint(novelBase, "health");
  const novelSourcesUrl = novelEndpoint(novelBase, "sources");
  const [mangaTelemetry, novelHealth, novelSources] = await Promise.all([
    runtime.DB ? readMangaTelemetry(runtime.DB).catch(() => null) : Promise.resolve(null),
    fetchJson(novelHealthUrl),
    fetchJson(novelSourcesUrl, novelToken ? { Authorization: `Bearer ${novelToken}` } : {}),
  ]);

  const novelCapabilities = novelHealth.ok ? asRecord(novelHealth.body.capabilities) : null;
  const novelSourceData = novelSources.ok ? asRecord(novelSources.body.data) : {};
  const sourceItems = Array.isArray(novelSourceData.items) ? novelSourceData.items : [];

  return NextResponse.json({
    status: "success",
    generatedAt: new Date().toISOString(),
    services: {
      website: { ok: true, name: "Cloudflare Pages", latencyMs: 0 },
      manga: {
        ok: Boolean(mangaTelemetry),
        name: "Cloudflare D1 Crawler",
        latencyMs: mangaTelemetry?.latencyMs ?? 0,
        statusCode: mangaTelemetry ? 200 : 503,
        database: mangaTelemetry ? "D1" : "unavailable",
        error: mangaTelemetry ? null : "D1 telemetry không khả dụng",
      },
      novel: {
        ok: novelHealth.ok,
        name: "Novel API",
        latencyMs: novelHealth.latencyMs,
        statusCode: novelHealth.statusCode,
        version: novelHealth.ok && typeof novelHealth.body.version === "string" ? novelHealth.body.version : null,
        error: novelHealth.ok ? null : novelHealth.error,
      },
    },
    manga: {
      available: Boolean(mangaTelemetry),
      error: mangaTelemetry ? null : "D1 telemetry không khả dụng",
      mangaCount: mangaTelemetry?.mangaCount ?? 0,
      chapterManifests: mangaTelemetry?.chapterManifests ?? 0,
      cachedChapters: mangaTelemetry?.chapterCount ?? 0,
      queue: {
        "chapter paths dự phòng": mangaTelemetry?.fallbackChapters ?? 0,
        "truyện chờ quét manifest": mangaTelemetry?.pendingManifests ?? 0,
      },
      syncStates: mangaTelemetry?.syncStates ?? [],
    },
    novel: {
      available: novelHealth.ok,
      snapshot: novelCapabilities?.novel_catalog_snapshot ?? null,
      sources: sourceItems,
      sourceHealthError: novelSources.ok ? null : novelSources.error,
      capabilities: novelCapabilities
        ? {
            novelApi: Boolean(novelCapabilities.novel_api),
            adaptiveSelection: Boolean(novelCapabilities.adaptive_source_selection),
            coverageAudit: Boolean(novelCapabilities.chapter_coverage_audit),
          }
        : null,
    },
  }, {
    headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
  });
}
