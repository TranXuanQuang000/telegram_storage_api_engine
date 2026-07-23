import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, ChevronsLeft, Eye } from "lucide-react";
import { RatingPanel, RatingPanelFallback } from "../../../components/RatingPanel";
import { SiteHeader } from "../../../components/SiteHeader";
import { StoryActions } from "../../../components/StoryActions";
import { StoryCover } from "../../../components/StoryCover";
import { getStory } from "../../../lib/catalog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const story = await getStory(slug, { includeExternalRating: false });
  return { title: story?.title ?? "Không tìm thấy truyện", description: story?.synopsis.slice(0, 150) };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStory(slug, { includeExternalRating: false });
  if (!story) notFound();
  const firstReadable = story.latestChapterId;
  const firstChapter = story.chapters.at(-1) ?? null;

  return (
    <div className="app-shell">
      <SiteHeader />
      <main>
        <section className="story-detail page-shell">
          <Link className="back-link" href="/discover"><ArrowLeft aria-hidden="true" /> Trở lại bàn tra cứu</Link>
          <div className="story-detail__grid">
            <div className="story-detail__cover"><StoryCover src={story.coverUrl} title={story.title} priority /></div>
            <div className="story-detail__main">
              <p className="section-kicker">{story.genres.slice(0, 3).join(" · ") || "Truyện tranh"}</p>
              <h1>{story.title}</h1>
              {story.originTitle ? <p className="origin-title">{story.originTitle}</p> : null}
              {story.contentRating !== "safe" ? <p className={`content-rating content-rating--${story.contentRating}`}>Nội dung {story.contentRating === "suggestive" ? "gợi cảm" : story.contentRating === "mature" ? "trưởng thành" : "18+"} · cân nhắc trước khi đọc</p> : null}
              <p className="story-synopsis">{story.synopsis}</p>
              <div className="story-detail__cta">
                {firstReadable ? (
                  <Link className="button button--ink" href={`/read/${firstReadable}?story=${encodeURIComponent(story.slug)}&title=${encodeURIComponent(story.title)}&cover=${encodeURIComponent(story.coverUrl ?? "")}`}>
                    Đọc chương {story.latestChapter ?? "mới"} <ArrowRight aria-hidden="true" />
                  </Link>
                ) : <span className="source-warning">Nguồn hiện chưa có chapter API đọc trực tiếp.</span>}
                {firstChapter ? (
                  <Link className="button button--paper" href={`/read/${firstChapter.id}?story=${encodeURIComponent(story.slug)}&title=${encodeURIComponent(story.title)}&cover=${encodeURIComponent(story.coverUrl ?? "")}`}>
                    <ChevronsLeft aria-hidden="true" /> Đọc từ đầu · Chương {firstChapter.number}
                  </Link>
                ) : null}
                <StoryActions story={story} chapterId={firstReadable} />
              </div>
            </div>
            <Suspense fallback={<RatingPanelFallback />}>
              <RatingPanel
                titles={[story.originTitle ?? "", story.title]}
                sourceUrl={story.sourceUrl}
                fallbackScore={story.score}
                fallbackSource={story.scoreSource}
              />
            </Suspense>
          </div>
        </section>

        <section className="chapter-section page-shell" aria-labelledby="chapter-title">
          <div className="section-heading"><div><p className="section-kicker">Mục lục</p><h2 id="chapter-title">{story.chapters.length.toLocaleString("vi-VN")} chương từ nguồn hiện tại</h2></div><span className="chapter-source"><Eye aria-hidden="true" /> Provenance: OTruyen API</span></div>
          <ol className="chapter-list">
            {story.chapters.slice(0, 60).map((chapter, index) => (
              <li key={chapter.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Link href={`/read/${chapter.id}?story=${encodeURIComponent(story.slug)}&title=${encodeURIComponent(story.title)}&cover=${encodeURIComponent(story.coverUrl ?? "")}`}>
                  <strong>Chương {chapter.number}</strong><small>{chapter.title || "Đọc ngay"}</small><ArrowRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
          {story.chapters.length > 60 ? <p className="chapter-note">Đang hiển thị 60 chương gần nhất. Bộ lọc mục lục đầy đủ sẽ dùng phân trang cursor.</p> : null}
        </section>
      </main>
    </div>
  );
}
