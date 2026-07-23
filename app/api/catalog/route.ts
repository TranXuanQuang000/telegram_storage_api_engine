import { NextRequest, NextResponse } from "next/server";
import { getDiscoverCatalog } from "../../../lib/catalog";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 120);
  const include = request.nextUrl.searchParams.getAll("include").slice(0, 20);
  const exclude = request.nextUrl.searchParams.getAll("exclude").slice(0, 20);
  const page = Math.min(Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1), 500);
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const catalog = await getDiscoverCatalog({ query, page, primaryGenre: include[0], status });
  const items = catalog.stories.filter((story) => {
    const tags = new Set([...story.genreSlugs, ...story.discoveryTags]);
    return include.every((tag) => tags.has(tag)) && exclude.every((tag) => !tags.has(tag));
  });
  return NextResponse.json({ items, page: catalog.page, totalItems: catalog.totalItems, totalPages: catalog.totalPages, nextCursor: catalog.page < catalog.totalPages ? String(catalog.page + 1) : null }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
