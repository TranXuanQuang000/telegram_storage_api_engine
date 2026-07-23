import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import type { StoryCardData } from "../lib/catalog";
import { formatRelativeDate } from "../lib/catalog";
import { StoryCover } from "./StoryCover";

export function StoryCard({ story, priority = false }: { story: StoryCardData; priority?: boolean }) {
  return (
    <article className="story-card">
      <Link className="story-card__cover-link" href={`/story/${story.slug}`} aria-label={`Mở ${story.title}`}>
        <StoryCover src={story.coverUrl} title={story.title} priority={priority} />
        {story.latestChapter ? <span className="chapter-stamp">CH. {story.latestChapter}</span> : null}
      </Link>
      <div className="story-card__meta">
        <div className="story-card__eyebrow">
          <span>{story.genres[0] ?? "Truyện tranh"}</span>
          <span>{formatRelativeDate(story.updatedAt)}</span>
        </div>
        <h3><Link href={`/story/${story.slug}`}>{story.title}</Link></h3>
        <div className="story-card__footer">
          {story.score ? (
            <span className="score-mini" title={story.scoreSource ?? "Nguồn đánh giá"}><Star aria-hidden="true" /> {story.score.toFixed(1)}</span>
          ) : (
            <span className="score-pending">chưa đủ điểm</span>
          )}
          <Link href={`/story/${story.slug}`} aria-label={`Xem chi tiết ${story.title}`}><ArrowUpRight aria-hidden="true" /></Link>
        </div>
      </div>
    </article>
  );
}

