import { NextRequest, NextResponse } from "next/server";
import { isSourceHubId, querySourceCatalog } from "../../../lib/source-hub";

export async function GET(request: NextRequest) {
  const rawSource = (request.nextUrl.searchParams.get("source") ?? "all").toLowerCase();
  if (rawSource !== "all" && !isSourceHubId(rawSource)) {
    return NextResponse.json({
      error: "unknown_source",
      message: "Nguồn không được hỗ trợ. Xem danh sách tại /api/sources.",
    }, { status: 400 });
  }
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const page = Math.min(Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1), 100);
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 24, 1), 48);
  const items = await querySourceCatalog({ source: rawSource, query, page, limit });
  const pageThreshold = rawSource === "otruyen" ? Math.min(limit, 24) : limit;
  return NextResponse.json({
    items,
    source: rawSource,
    query,
    page,
    limit,
    nextPage: items.length >= pageThreshold ? page + 1 : null,
    generatedAt: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=900" },
  });
}
