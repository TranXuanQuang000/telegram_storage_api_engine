import { NextRequest, NextResponse } from "next/server";
import { getLatestMultiSourceStories } from "../../../../lib/catalog";

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 10, 1), 20);
  const stories = await getLatestMultiSourceStories(limit);
  return NextResponse.json({
    items: stories,
    sourceLabel: "Manga API · NetTruyen + TruyenQQ",
    generatedAt: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=45, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
