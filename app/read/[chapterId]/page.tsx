import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderClient } from "../../../components/ReaderClient";
import { getChapterPages, getStory } from "../../../lib/catalog";

export const metadata: Metadata = { title: "Đang đọc", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReadPage({ params, searchParams }: { params: Promise<{ chapterId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ chapterId }, query] = await Promise.all([params, searchParams]);
  const getString = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const storySlug = getString("story");
  const [chapter, story] = await Promise.all([
    getChapterPages(chapterId),
    /^[a-z0-9-]{1,160}$/.test(storySlug)
      ? getStory(storySlug, { includeExternalRating: false })
      : Promise.resolve(null),
  ]);
  if (!chapter) notFound();

  return (
    <ReaderClient
      chapterId={chapter.chapterId}
      chapterName={chapter.chapterName}
      pages={chapter.pages}
      storySlug={storySlug}
      storyTitle={story?.title ?? getString("title")}
      coverUrl={story?.coverUrl ?? getString("cover")}
      chapters={story?.chapters.map((item) => ({ id: item.id, number: item.number, title: item.title })) ?? []}
    />
  );
}
