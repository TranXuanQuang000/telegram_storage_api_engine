import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { CommunityPicks, CommunityPicksFallback } from "../components/CommunityPicks";
import { ContinueReading } from "../components/ContinueReading";
import { SiteHeader } from "../components/SiteHeader";
import { StoryCard } from "../components/StoryCard";
import { getHomeStories } from "../lib/catalog";

export const metadata: Metadata = {
  title: "Đọc truyện theo gu",
  description: "Cập nhật truyện mới, tìm theo mood, đọc mượt và tải chương offline.",
};

export default async function Home() {
  const stories = await getHomeStories();
  const latest = stories.slice(0, 8);
  const spotlight = latest.find((story) => story.latestChapterId) ?? latest[0];

  return (
    <div className="app-shell">
      <SiteHeader />
      <main>
        <section className="home-hero page-shell">
          <div className="home-hero__copy">
            <p className="section-kicker">Đọc ít lạc đường hơn</p>
            <h1>Một chạm,<br /><em>lạc vào chương kế.</em></h1>
            <p className="home-hero__lede">Mực gom chương mới, nhớ đúng chỗ bạn dừng và tìm truyện theo nhịp, mood, gu — không chỉ theo thể loại.</p>
            <div className="home-hero__actions">
              <Link className="button button--ink" href="/discover">Tìm truyện hợp gu <ArrowRight aria-hidden="true" /></Link>
              <Link className="text-link" href="/settings/ai"><Sparkles aria-hidden="true" /> Gắn AI của bạn</Link>
            </div>
            <div className="trust-row">
              <span><RefreshCcw aria-hidden="true" /> nguồn cập nhật có provenance</span>
              <span><ShieldCheck aria-hidden="true" /> AI key không lưu máy chủ</span>
            </div>
          </div>
          {spotlight ? (
            <Link className="hero-poster" href={`/story/${spotlight.slug}`} aria-label={`Mở ${spotlight.title}`}>
              {spotlight.coverUrl ? <Image src={spotlight.coverUrl} alt={`Bìa ${spotlight.title}`} fill sizes="(max-width: 767px) 70vw, 20rem" priority unoptimized /> : <span>{spotlight.title}</span>}
              <div className="hero-poster__caption">
                <span>Mới cập nhật</span>
                <strong>{spotlight.title}</strong>
                <small>Chương {spotlight.latestChapter ?? "mới"}</small>
              </div>
            </Link>
          ) : null}
          <div className="hero-ink" aria-hidden="true">MỰC</div>
        </section>

        <div className="page-shell"><ContinueReading /></div>

        <section className="catalog-section page-shell" aria-labelledby="latest-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Vừa lên kệ</p>
              <h2 id="latest-title">Chương mới, còn thơm mùi mực.</h2>
            </div>
            <Link className="text-link" href="/discover?sort=latest">Xem tất cả <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="story-grid">
            {latest.map((story, index) => <StoryCard key={story.id} story={story} priority={index < 3} />)}
          </div>
        </section>

        <Suspense fallback={<CommunityPicksFallback />}>
          <CommunityPicks />
        </Suspense>

        <section className="ai-editorial page-shell" aria-labelledby="ai-title">
          <div className="ai-editorial__mark"><Sparkles aria-hidden="true" /><span>BYOK</span></div>
          <div>
            <p className="section-kicker">AI là người gác thư viện, không phải ông chủ</p>
            <h2 id="ai-title">Hỏi bằng lời của bạn.<br />Nhận gợi ý có lý do.</h2>
          </div>
          <div className="ai-editorial__copy">
            <p>“Tìm manhwa trả thù, nữ chính tỉnh táo, ít romance và đã hoàn thành.”</p>
            <p>Mực biến câu đó thành bộ lọc nhìn thấy được, chỉ gửi danh sách ứng viên và lịch sử bạn đồng ý sang model.</p>
            <Link className="button button--paper" href="/settings/ai">Cấu hình AI <ArrowRight aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
      <footer className="site-footer page-shell">
        <div><strong>Mực</strong><span>Đọc truyện theo gu, không theo thuật toán mù.</span></div>
        <div><Link href="/discover">Khám phá</Link><Link href="/library">Tủ truyện</Link><Link href="/settings/ai">AI & riêng tư</Link></div>
        <p>Nội dung thuộc về nguồn gốc tương ứng. Mực hiển thị provenance và tôn trọng yêu cầu gỡ bỏ.</p>
      </footer>
    </div>
  );
}
