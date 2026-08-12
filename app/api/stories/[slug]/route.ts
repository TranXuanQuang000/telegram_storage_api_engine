import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getStory } from "../../../../lib/catalog";
import { persistOTruyenStorySnapshot } from "../../../../lib/d1-story-sync";
import { MangaApiError } from "../../../../lib/sources/manga-api";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const runtime = env as unknown as { DB?: D1Database };
  let story;
  try {
    story = await getStory(slug, { db: runtime.DB });
  } catch (error) {
    const status = error instanceof MangaApiError ? error.status : 502;
    return NextResponse.json({
      error: "Không tải được truyện",
      code: error instanceof MangaApiError ? error.code : "STORY_PROVIDER_FAILED",
      details: null,
    }, { status, headers: { "Cache-Control": "no-store" } });
  }
  if (!story) return NextResponse.json({ error: "Không tìm thấy truyện", code: "STORY_NOT_FOUND", details: null }, { status: 404 });
  if (runtime.DB && !slug.startsWith("mangadex-")) {
    await persistOTruyenStorySnapshot(runtime.DB, story).catch(() => false);
  }
  return NextResponse.json(story, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      ETag: `"${story.latestChapterId ?? "none"}:${story.updatedAt}"`,
    },
  });
}

