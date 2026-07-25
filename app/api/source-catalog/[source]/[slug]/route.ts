import { NextRequest, NextResponse } from "next/server";
import { getSourceDetail, isSourceHubId } from "../../../../../lib/source-hub";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ source: string; slug: string }> },
) {
  const { source, slug } = await context.params;
  if (!isSourceHubId(source)) {
    return NextResponse.json({ error: "unknown_source" }, { status: 400 });
  }
  const result = await getSourceDetail(source, slug);
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900" },
  });
}
