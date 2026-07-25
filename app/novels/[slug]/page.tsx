import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText } from "lucide-react";
import { SiteHeader } from "../../../components/SiteHeader";
import { NovelActions, NovelChapterList } from "../../../components/NovelActions";
import { getNovel } from "../../../lib/novels";

export default async function NovelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const novel = await getNovel(slug);
  if (!novel) notFound();
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="novel-detail page-shell" style={{ "--novel-accent": novel.accent } as React.CSSProperties}>
        <Link className="back-link" href="/novels"><ArrowLeft aria-hidden="true" /> Mực Chữ</Link>
        <section className="novel-detail__hero">
          <div className="novel-detail__monogram"><BookOpenText aria-hidden="true" /><span>{novel.title.split(/\s+/).map((word) => word[0]).join("").slice(0, 3)}</span></div>
          <div><p className="section-kicker">TRUYỆN CHỮ · {novel.sourceName?.toUpperCase() ?? "CÓ NGUỒN RÕ RÀNG"}</p><h1>{novel.title}</h1><p className="origin-title">{novel.author}{novel.translator ? ` · ${novel.translator} dịch` : ""}{novel.year ? ` · ${novel.year}` : ""}</p><p>{novel.description}</p><div className="novel-detail__genres">{novel.genres.map((genre) => <span key={genre}>{genre}</span>)}</div><div className="novel-detail__cta">{novel.chapters[0] ? <Link className="button button--ink" href={`/novels/read/${novel.chapters[0].id}`}>Đọc từ đầu <ArrowRight aria-hidden="true" /></Link> : null}<NovelActions novel={novel} /></div></div>
        </section>
        <section className="novel-chapters"><div className="section-heading"><div><p className="section-kicker">MỤC LỤC CHỮ</p><h2>{novel.chapters.length} phần.</h2></div>{novel.sourceUrl ? <a className="chapter-source" href={novel.sourceUrl} target="_blank" rel="noreferrer">Nguồn: {novel.sourceName ?? "Wikisource"}</a> : null}</div><NovelChapterList novel={novel} /></section>
      </main>
    </div>
  );
}
