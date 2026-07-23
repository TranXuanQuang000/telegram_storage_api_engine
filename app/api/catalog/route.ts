import { NextRequest, NextResponse } from "next/server";
import { getFilteredDiscoverCatalog } from "../../../lib/catalog";

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
  const catalog = await getFilteredDiscoverCatalog({
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
  });
  return NextResponse.json({
    items: catalog.stories,
    page: catalog.page,
    totalItems: catalog.totalItems,
    totalPages: catalog.totalPages,
    sourceLabel: catalog.sourceLabel,
    nextCursor: catalog.page < catalog.totalPages ? String(catalog.page + 1) : null,
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
