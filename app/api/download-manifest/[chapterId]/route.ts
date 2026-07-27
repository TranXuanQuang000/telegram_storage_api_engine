import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChapterPages } from "../../../../lib/catalog";
import { getReaderAccess, type ReaderAccessRuntime } from "../../../../lib/reader-access";
import { MangaApiError } from "../../../../lib/sources/manga-api";

export async function GET(_request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  const access = await getReaderAccess(env as unknown as ReaderAccessRuntime);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.authenticated ? "Tài khoản chưa được phép đọc" : "Cần đăng nhập để đọc" },
      { status: access.authenticated ? 403 : 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { chapterId } = await params;
  let chapter;
  try {
    chapter = await getChapterPages(chapterId);
  } catch (error) {
    const status = error instanceof MangaApiError ? error.status : 502;
    return NextResponse.json({
      error: "Không tải được chapter",
      code: error instanceof MangaApiError ? error.code : "CHAPTER_PROVIDER_FAILED",
      details: null,
    }, { status, headers: { "Cache-Control": "no-store" } });
  }
  if (!chapter) return NextResponse.json({ error: "Chương không khả dụng", code: "CHAPTER_NOT_FOUND", details: null }, { status: 404 });
  return NextResponse.json(
    { chapterId, chapterName: chapter.chapterName, version: `manga-api-${chapter.chapterName}-${chapter.pages.length}`, estimatedBytes: chapter.pages.length * 420_000, pages: chapter.pages, sourceUrl: chapter.sourceUrl },
    { headers: {
      "Cache-Control": "private, no-store",
    } },
  );
}

