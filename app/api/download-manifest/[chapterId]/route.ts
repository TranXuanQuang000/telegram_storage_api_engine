import { NextResponse } from "next/server";
import { getChapterPages } from "../../../../lib/catalog";

export async function GET(_request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  const chapter = await getChapterPages(chapterId);
  if (!chapter) return NextResponse.json({ error: "Chương không khả dụng", code: "CHAPTER_NOT_FOUND", details: null }, { status: 404 });
  return NextResponse.json({ chapterId, version: `otruyen-${chapter.chapterName}-${chapter.pages.length}`, estimatedBytes: chapter.pages.length * 420_000, pages: chapter.pages, sourceUrl: chapter.sourceUrl });
}

