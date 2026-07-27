import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { sameSecret } from "../../../../lib/admin-auth";

type RuntimeEnv = {
  ADMIN_DASHBOARD_TOKEN?: string;
  INGEST_TOKEN?: string;
  MANGA_API_ADMIN_TOKEN?: string;
  MANGA_API_BASE_URL?: string;
  MUC_CONTENT_API_TOKEN?: string;
  MUC_CONTENT_API_URL?: string;
};

const REQUEST_TIMEOUT_MS = 12_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function runtimeEnv(): RuntimeEnv {
  const workerEnv = env as unknown as RuntimeEnv;
  return {
    ADMIN_DASHBOARD_TOKEN: workerEnv.ADMIN_DASHBOARD_TOKEN ?? process.env.ADMIN_DASHBOARD_TOKEN,
    INGEST_TOKEN: workerEnv.INGEST_TOKEN ?? process.env.INGEST_TOKEN,
    MANGA_API_ADMIN_TOKEN: workerEnv.MANGA_API_ADMIN_TOKEN ?? process.env.MANGA_API_ADMIN_TOKEN,
    MANGA_API_BASE_URL: workerEnv.MANGA_API_BASE_URL ?? process.env.MANGA_API_BASE_URL,
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
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const body = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      return {
        ok: false as const,
        latencyMs,
        statusCode: response.status,
        error: typeof body.message === "string" ? body.message : `HTTP ${response.status}`,
      };
    }
    return { ok: true as const, latencyMs, statusCode: response.status, body };
  } catch (error) {
    return {
      ok: false as const,
      latencyMs: Date.now() - startedAt,
      statusCode: 0,
      error: error instanceof Error && error.name === "AbortError"
        ? "Hết thời gian chờ"
        : "Không kết nối được",
    };
  } finally {
    clearTimeout(timer);
  }
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

  const mangaBase = normalizeOrigin(runtime.MANGA_API_BASE_URL, "https://muc-manga-api.onrender.com");
  mangaBase.pathname = "/";
  mangaBase.search = "";
  const novelBase = normalizeOrigin(
    runtime.MUC_CONTENT_API_URL,
    "https://telegram-storage-api-engine.onrender.com/v1/api",
  );
  const mangaAdminToken = runtime.MANGA_API_ADMIN_TOKEN?.trim() ?? "";
  const novelToken = runtime.MUC_CONTENT_API_TOKEN?.trim() ?? "";

  const mangaHealthUrl = new URL("/healthz", mangaBase);
  const mangaStatusUrl = new URL("/api/v1/admin/status", mangaBase);
  const novelHealthUrl = novelEndpoint(novelBase, "health");
  const novelSourcesUrl = novelEndpoint(novelBase, "sources");

  const [mangaHealth, mangaStatus, novelHealth, novelSources] = await Promise.all([
    fetchJson(mangaHealthUrl),
    mangaAdminToken
      ? fetchJson(mangaStatusUrl, { Authorization: `Bearer ${mangaAdminToken}` })
      : Promise.resolve({
          ok: false as const,
          latencyMs: 0,
          statusCode: 503,
          error: "Thiếu MANGA_API_ADMIN_TOKEN ở frontend server",
        }),
    fetchJson(novelHealthUrl),
    fetchJson(
      novelSourcesUrl,
      novelToken ? { Authorization: `Bearer ${novelToken}` } : {},
    ),
  ]);

  const mangaData = mangaStatus.ok ? asRecord(mangaStatus.body.data) : null;
  const novelCapabilities = novelHealth.ok ? asRecord(novelHealth.body.capabilities) : null;
  const novelSourceData = novelSources.ok ? asRecord(novelSources.body.data) : {};
  const sourceItems = Array.isArray(novelSourceData.items)
    ? novelSourceData.items
    : [];

  return NextResponse.json({
    status: "success",
    generatedAt: new Date().toISOString(),
    services: {
      website: { ok: true, name: "Cloudflare Pages", latencyMs: 0 },
      manga: {
        ok: mangaHealth.ok,
        name: "Manga API",
        latencyMs: mangaHealth.latencyMs,
        statusCode: mangaHealth.statusCode,
        database: mangaHealth.ok && typeof mangaHealth.body.database === "string"
          ? mangaHealth.body.database
          : "unknown",
        error: mangaHealth.ok ? null : mangaHealth.error,
      },
      novel: {
        ok: novelHealth.ok,
        name: "Novel API",
        latencyMs: novelHealth.latencyMs,
        statusCode: novelHealth.statusCode,
        version: novelHealth.ok && typeof novelHealth.body.version === "string"
          ? novelHealth.body.version
          : null,
        error: novelHealth.ok ? null : novelHealth.error,
      },
    },
    manga: mangaData
      ? {
          available: true,
          mangaCount: Number(mangaData.mangaCount ?? 0),
          chapterManifests: Number(mangaData.chapterManifests ?? 0),
          cachedChapters: Number(mangaData.cachedChapters ?? 0),
          queue: asRecord(mangaData.queue),
          syncStates: Array.isArray(mangaData.syncStates) ? mangaData.syncStates : [],
        }
      : {
          available: false,
          error: mangaStatus.error,
          statusCode: mangaStatus.statusCode,
          mangaCount: 0,
          chapterManifests: 0,
          cachedChapters: 0,
          queue: {},
          syncStates: [],
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
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
