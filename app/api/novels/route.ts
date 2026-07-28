import { NextRequest, NextResponse } from "next/server";
import { getNovelCatalog } from "../../../lib/novels";
import { normalizeTitle } from "../../../lib/search-utils";
import { getNovelApiCatalogPage } from "../../../lib/sources/novel-api";
import { compareHotNovels } from "../../../lib/novel-ranking";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const genre = (request.nextUrl.searchParams.get("genre") ?? "").trim().slice(0, 80);
  const sort = request.nextUrl.searchParams.get("sort") ?? "updated";
  const page = Math.max(1, Math.min(1_000, Number(request.nextUrl.searchParams.get("page")) || 1));
  const pageSize = Math.max(12, Math.min(48, Number(request.nextUrl.searchParams.get("limit")) || 24));
  try {
    const remote = await getNovelApiCatalogPage({
      page,
      limit: pageSize,
      query,
      genre,
      sort,
    });
    if (remote) {
      return NextResponse.json(remote, {
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    }
  } catch (error) {
    console.error("Novel snapshot pagination failed", error);
  }
  const catalog = await getNovelCatalog();
  const normalizedQuery = normalizeTitle(query);
  const filtered = catalog.filter((novel) => {
    const queryOkay = !normalizedQuery || normalizeTitle(`${novel.title} ${novel.author} ${novel.translator ?? ""}`).includes(normalizedQuery);
    const genreOkay = !genre || novel.genres.some((item) => normalizeTitle(item) === normalizeTitle(genre));
    return queryOkay && genreOkay;
  });
  const sourceOrder = new Map(filtered.map((novel, index) => [novel.slug, index]));
  filtered.sort((left, right) => {
    if (sort === "hot") return compareHotNovels(left, right);
    if (sort === "title") return left.title.localeCompare(right.title, "vi");
    if (sort === "chapters") return right.chapters.length - left.chapters.length || left.title.localeCompare(right.title, "vi");
    const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : Number.NaN;
    const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : Number.NaN;
    const leftIsLiveSource = left.provider === "novel-api" && !Number.isFinite(leftUpdated);
    const rightIsLiveSource = right.provider === "novel-api" && !Number.isFinite(rightUpdated);
    if (leftIsLiveSource !== rightIsLiveSource) return leftIsLiveSource ? -1 : 1;
    if (Number.isFinite(leftUpdated) && Number.isFinite(rightUpdated) && leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }
    return (sourceOrder.get(left.slug) ?? 0) - (sourceOrder.get(right.slug) ?? 0);
  });
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  return NextResponse.json({
    items: filtered.slice(offset, offset + pageSize),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    sourceLabel: `Mực Chữ Multi-Source + Wikisource · ${catalog.length.toLocaleString("vi-VN")} tác phẩm đã lập chỉ mục`,
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
