import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderClient } from "../../../components/ReaderClient";
import { getChapterPages } from "../../../lib/catalog";

export const metadata: Metadata = { title: "Đang đọc", robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReadPage({ params, searchParams }: { params: Promise<{ chapterId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ chapterId }, query] = await Promise.all([params, searchParams]);
  const chapter = await getChapterPages(chapterId);
  if (!chapter) notFound();
  const getString = (key: string) => typeof query[key] === "string" ? query[key] as string : "";

  return <ReaderClient chapterId={chapter.chapterId} chapterName={chapter.chapterName} pages={chapter.pages} storySlug={getString("story")} storyTitle={getString("title")} coverUrl={getString("cover")} />;
}

