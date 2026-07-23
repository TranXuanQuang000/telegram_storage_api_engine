import { ArrowUpRight, Star } from "lucide-react";
import type { StoryCardData } from "../lib/catalog";
import { formatRelativeDate } from "../lib/catalog";
import { StoryCover } from "./StoryCover";
import { StoryPreviewLink } from "./StoryPreviewLink";

export function StoryCard({ story, priority = false }: { story: StoryCardData; priority?: boolean }) {
  return (
    <article className="story-card">
      <StoryPreviewLink className="story-card__cover-link" story={story} aria-label={`Mở ${story.title}`}>
        <StoryCover src={story.coverUrl} title={story.title} priority={priority} />
        {story.score ? (
          <span className={`cover-rating${story.scoreKind === "provisional" ? " cover-rating--provisional" : ""}`} title={story.scoreSource ?? "Điểm đánh giá từ cộng đồng"}>
            <Star aria-hidden="true" />
            <strong>{story.scoreKind === "provisional" ? "~" : ""}{story.score.toFixed(1)}</strong>
            <small>/5</small>
          </span>
        ) : null}
        {story.latestChapter ? <span className="chapter-stamp">CH. {story.latestChapter}</span> : null}
      </StoryPreviewLink>
      <div className="story-card__meta">
        <div className="story-card__eyebrow">
          <span>{story.genres[0] ?? "Truyện tranh"}</span>
          <span>{formatRelativeDate(story.updatedAt)}</span>
        </div>
        <h3><StoryPreviewLink story={story}>{story.title}</StoryPreviewLink></h3>
        <div className="story-card__footer">
          <span className={story.recommendationReason ? "recommendation-reason" : "score-pending"}>
            {story.recommendationReason ?? (story.scoreSource ? story.scoreSource.split(" · ")[0] : "chưa đủ điểm")}
          </span>
          <StoryPreviewLink story={story} aria-label={`Xem chi tiết ${story.title}`}><ArrowUpRight aria-hidden="true" /></StoryPreviewLink>
        </div>
      </div>
    </article>
  );
}
