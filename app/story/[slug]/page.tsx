import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, ChevronsLeft, ExternalLink, Eye } from "lucide-react";
import { ChapterList } from "../../../components/ChapterList";
import { RatingPanel, RatingPanelFallback } from "../../../components/RatingPanel";
import { SiteHeader } from "../../../components/SiteHeader";
import { StoryActions } from "../../../components/StoryActions";
import { StoryCover } from "../../../components/StoryCover";
import { getStory } from "../../../lib/catalog";
import { persistOTruyenStorySnapshot } from "../../../lib/d1-story-sync";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const story = await getStory(slug, { includeExternalRating: false });
  return { title: story?.title ?? "Không tìm thấy truyện", description: story?.synopsis.slice(0, 150) };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStory(slug, { includeExternalRating: false });
  if (!story) notFound();
  const runtime = env as unknown as { DB?: D1Database };
  if (runtime.DB && story.sourceName === "OTruyen API") {
    await persistOTruyenStorySnapshot(runtime.DB, story).catch(() => false);
  }
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
                ) : (
                  <Link className="button button--ink" href={story.sourceUrl} target="_blank" rel="noreferrer">
                    Xem tại {story.sourceName} <ExternalLink aria-hidden="true" />
                  </Link>
                )}
                {firstChapter ? (
                  <Link className="button button--paper" href={`/read/${firstChapter.id}?story=${encodeURIComponent(story.slug)}&title=${encodeURIComponent(story.title)}&cover=${encodeURIComponent(story.coverUrl ?? "")}`}>
                    <ChevronsLeft aria-hidden="true" /> Đọc từ đầu · Chương {firstChapter.number}
                  </Link>
                ) : null}
                <StoryActions story={story} chapterId={firstReadable} chapters={story.chapters} />
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
          <div className="section-heading">
            <div>
              <p className="section-kicker">Mục lục</p>
              <h2 id="chapter-title">
                {story.chapters.length
                  ? `${story.chapters.length.toLocaleString("vi-VN")} chương từ nguồn hiện tại`
                  : "Đọc đúng nơi có quyền phân phối."}
              </h2>
            </div>
            <span className="chapter-source"><Eye aria-hidden="true" /> Provenance: {story.sourceName}</span>
          </div>
          {story.chapters.length ? (
            <ChapterList
              storySlug={story.slug}
              storyTitle={story.title}
              coverUrl={story.coverUrl}
              chapters={story.chapters}
            />
          ) : (
            <div className="empty-state">
              <p>Mực chỉ lập chỉ mục metadata cho nguồn này và không hotlink ảnh chương. Bạn có thể mở trang gốc để xem bản dịch, nhóm dịch và điều kiện sử dụng đầy đủ.</p>
              <Link className="button button--paper" href={story.sourceUrl} target="_blank" rel="noreferrer">
                Mở {story.sourceName} <ExternalLink aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
