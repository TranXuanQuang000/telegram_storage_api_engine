import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TextReaderClient } from "../../../../components/TextReaderClient";
import { getNovelChapter } from "../../../../lib/novels";
import { getReaderAccess, type ReaderAccessRuntime } from "../../../../lib/reader-access";

export const metadata: Metadata = { title: "Đang đọc truyện chữ", robots: { index: false, follow: false } };

export default async function NovelReadPage({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  const access = await getReaderAccess(env as unknown as ReaderAccessRuntime);
  if (!access.allowed) redirect(`/login?from=${encodeURIComponent(`/novels/read/${chapterId}`)}`);
  const content = await getNovelChapter(chapterId);
  if (!content) notFound();
  return <TextReaderClient key={chapterId} slug={content.novel.slug} title={content.novel.title} author={content.novel.author} chapterId={chapterId} chapterLabel={content.chapter.label} paragraphs={content.paragraphs} chapters={content.novel.chapters} sourceUrl={content.sourceUrl} sourceName={content.sourceName ?? content.novel.sourceName ?? "Nguồn truyện chữ"} />;
}
