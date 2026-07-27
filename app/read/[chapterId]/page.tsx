import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReaderClient } from "../../../components/ReaderClient";
import { getChapterPages, getStory } from "../../../lib/catalog";
import { persistOTruyenStorySnapshot } from "../../../lib/d1-story-sync";
import { getReaderAccess, type ReaderAccessRuntime } from "../../../lib/reader-access";
import { isMangaApiCatalogProvider } from "../../../lib/sources/manga-api";

export const metadata: Metadata = { title: "Đang đọc", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReadPage({ params, searchParams }: { params: Promise<{ chapterId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ chapterId }, query] = await Promise.all([params, searchParams]);
  const getString = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const storySlug = getString("story");
  const access = await getReaderAccess(env as unknown as ReaderAccessRuntime);
  if (!access.allowed) {
    const from = `/read/${encodeURIComponent(chapterId)}${storySlug ? `?story=${encodeURIComponent(storySlug)}` : ""}`;
    redirect(`/login?from=${encodeURIComponent(from)}`);
  }
  const [chapter, story] = await Promise.all([
    getChapterPages(chapterId),
    /^[a-z0-9-]{1,160}$/.test(storySlug)
      ? getStory(storySlug, { includeExternalRating: false })
      : Promise.resolve(null),
  ]);
  if (!chapter) notFound();
  const runtime = env as unknown as { DB?: D1Database };
  if (runtime.DB && !isMangaApiCatalogProvider() && story?.sourceName === "OTruyen API") {
    await persistOTruyenStorySnapshot(runtime.DB, story).catch(() => false);
  }
  let imageOrigin = "";
  try {
    imageOrigin = new URL(chapter.pages[0]).origin;
  } catch {
    // The reader still works when an upstream returns a relative or malformed page URL.
  }

  return (
    <>
      {imageOrigin ? <link rel="preconnect" href={imageOrigin} crossOrigin="anonymous" /> : null}
      {imageOrigin ? <link rel="dns-prefetch" href={imageOrigin} /> : null}
      <ReaderClient
        key={chapter.chapterId}
        chapterId={chapter.chapterId}
        chapterName={chapter.chapterName}
        pages={chapter.pages}
        storyId={story?.id ?? storySlug}
        storySlug={storySlug}
        storyTitle={story?.title ?? getString("title")}
        coverUrl={story?.coverUrl ?? getString("cover")}
        chapters={story?.chapters.map((item) => ({ id: item.id, number: item.number, title: item.title })) ?? []}
      />
    </>
  );
}
