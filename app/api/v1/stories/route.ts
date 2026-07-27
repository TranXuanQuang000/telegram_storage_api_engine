import { NextResponse } from "next/server";
import { getHomeStories } from "../../../../lib/catalog";

export async function GET() {
  const stories = await getHomeStories();
  const formattedStories = stories.map((s) => ({
    id: s.id,
    title: s.title,
    author: s.author || "Tác giả",
    consent_status: s.consentStatus || "VERIFIED",
  }));

  return NextResponse.json(formattedStories);
}
