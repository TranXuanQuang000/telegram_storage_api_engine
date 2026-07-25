import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChapterPages } from "../../../../lib/catalog";
import { getReaderAccess, type ReaderAccessRuntime } from "../../../../lib/reader-access";

export async function GET(_request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  const access = await getReaderAccess(env as unknown as ReaderAccessRuntime);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.authenticated ? "Tài khoản chưa được phép đọc" : "Cần đăng nhập để đọc" },
      { status: access.authenticated ? 403 : 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { chapterId } = await params;
  const chapter = await getChapterPages(chapterId);
  if (!chapter) return NextResponse.json({ error: "Chương không khả dụng", code: "CHAPTER_NOT_FOUND", details: null }, { status: 404 });
  return NextResponse.json(
    { chapterId, chapterName: chapter.chapterName, version: `otruyen-${chapter.chapterName}-${chapter.pages.length}`, estimatedBytes: chapter.pages.length * 420_000, pages: chapter.pages, sourceUrl: chapter.sourceUrl },
    { headers: {
      "Cache-Control": access.mode === "public"
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "private, no-store",
    } },
  );
}

