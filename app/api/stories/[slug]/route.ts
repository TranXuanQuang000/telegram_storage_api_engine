import { NextResponse } from "next/server";
import { getStory } from "../../../../lib/catalog";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) return NextResponse.json({ error: "Không tìm thấy truyện", code: "STORY_NOT_FOUND", details: null }, { status: 404 });
  return NextResponse.json(story, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}

