import Link from "next/link";
import { ArrowRight, BadgeCheck, TrendingUp } from "lucide-react";
import { getCommunityRecommendations } from "../lib/catalog";
import { StoryCard } from "./StoryCard";

export async function CommunityPicks() {
  const stories = await getCommunityRecommendations();
  if (!stories.length) return null;

  return (
    <section className="catalog-section community-picks page-shell" aria-labelledby="community-picks-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker"><BadgeCheck aria-hidden="true" /> cộng đồng kiểm chứng</p>
          <h2 id="community-picks-title">Được khen nhiều,<br />bị chê ít.</h2>
        </div>
        <Link className="text-link" href="/discover?sort=rating">Xếp theo đánh giá <ArrowRight aria-hidden="true" /></Link>
      </div>
      <p className="community-picks__lede">
        Mực đối chiếu điểm và phân bố lượt chấm từ các nền tảng truyện như AniList, ưu tiên truyện có điểm cao,
        tỷ lệ đánh giá xấu thấp và đủ số người chấm — không lấy độ nổi tiếng làm điểm chất lượng.
      </p>
      <div className="community-picks__signal"><TrendingUp aria-hidden="true" /> Tín hiệu được làm mới định kỳ; mở từng truyện để xem AniList, Kitsu và MyAnimeList.</div>
      <div className="story-grid">
        {stories.map((story) => <StoryCard key={story.id} story={story} />)}
      </div>
    </section>
  );
}

export function CommunityPicksFallback() {
  return (
    <section className="catalog-section community-picks page-shell" aria-label="Đang tổng hợp đề xuất cộng đồng">
      <div className="community-picks__loading">
        <span />
        <div><strong>Đang đối chiếu đánh giá cộng đồng…</strong><small>AniList · Kitsu · MyAnimeList</small></div>
      </div>
    </section>
  );
}
