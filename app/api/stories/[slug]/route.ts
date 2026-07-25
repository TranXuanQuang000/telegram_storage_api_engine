import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getStory } from "../../../../lib/catalog";
import { persistOTruyenStorySnapshot } from "../../../../lib/d1-story-sync";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) return NextResponse.json({ error: "Không tìm thấy truyện", code: "STORY_NOT_FOUND", details: null }, { status: 404 });
  const runtime = env as unknown as { DB?: D1Database };
  if (runtime.DB && story.sourceName === "OTruyen API") {
    await persistOTruyenStorySnapshot(runtime.DB, story).catch(() => false);
  }
  return NextResponse.json(story, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      ETag: `"${story.latestChapterId ?? "none"}:${story.updatedAt}"`,
    },
  });
}

