import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { getFilteredDiscoverCatalog } from "../../../lib/catalog";
import { getD1DiscoverCatalog } from "../../../lib/d1-catalog";
import { MangaApiError } from "../../../lib/sources/manga-api";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 120);
  const include = request.nextUrl.searchParams.getAll("include").slice(0, 20);
  const exclude = request.nextUrl.searchParams.getAll("exclude").slice(0, 20);
  const page = Math.min(Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1), 500);
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const mood = request.nextUrl.searchParams.get("mood") ?? "";
  const format = request.nextUrl.searchParams.get("format") ?? "";
  const pace = request.nextUrl.searchParams.get("pace") ?? "";
  const minScore = Math.max(0, Number(request.nextUrl.searchParams.get("minScore")) || 0);
  const maxChapters = Math.max(0, Number(request.nextUrl.searchParams.get("maxChapters")) || 0);
  const sort = request.nextUrl.searchParams.get("sort") ?? "latest";
  const pageSize = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 24, 1), 48);
  const scanPages = Math.min(Math.max(Number(request.nextUrl.searchParams.get("scanPages")) || 12, 1), 16);
  const filters = {
    query,
    page,
    pageSize,
    include,
    exclude,
    status,
    mood,
    format,
    pace,
    minScore,
    maxChapters,
    sort,
    scanPages,
  };
  const runtime = env as unknown as { DB?: D1Database };
  const indexedCatalog = runtime.DB
    ? await getD1DiscoverCatalog(runtime.DB, filters).catch(() => null)
    : null;
  try {
    const catalog = indexedCatalog ?? await getFilteredDiscoverCatalog(filters);
    return NextResponse.json({
      items: catalog.stories,
      page: catalog.page,
      totalItems: catalog.totalItems,
      totalPages: catalog.totalPages,
      sourceLabel: catalog.sourceLabel,
      nextCursor: catalog.page < catalog.totalPages ? String(catalog.page + 1) : null,
    }, { headers: { "Cache-Control": "public, max-age=45, stale-while-revalidate=120" } });
  } catch (error) {
    const status = error instanceof MangaApiError ? error.status : 502;
    return NextResponse.json({
      error: "Không tải được catalog",
      code: error instanceof MangaApiError ? error.code : "CATALOG_PROVIDER_FAILED",
      details: null,
    }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
