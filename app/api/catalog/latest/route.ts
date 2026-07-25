import { NextRequest, NextResponse } from "next/server";
import { getLatestMultiSourceStories } from "../../../../lib/catalog";

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 10, 1), 20);
  const stories = await getLatestMultiSourceStories(limit);
  return NextResponse.json({
    items: stories,
    sourceLabel: "OTruyen API + MangaDex API · bản dịch tiếng Việt",
    generatedAt: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600",
    },
  });
}
