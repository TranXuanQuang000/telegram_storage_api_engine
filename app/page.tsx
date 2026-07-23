import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, ArrowRight, Radio, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { CommunityPicks, CommunityPicksFallback } from "../components/CommunityPicks";
import { ContinueReading } from "../components/ContinueReading";
import { PersonalizedHomeShelves } from "../components/PersonalizedHomeShelves";
import { SiteHeader } from "../components/SiteHeader";
import { StoryPreviewLink } from "../components/StoryPreviewLink";
import { getHomeStories } from "../lib/catalog";

export const metadata: Metadata = {
  title: "Đọc theo xung",
  description: "Một trải nghiệm đọc kinetic: tìm đúng gu, tiếp tục tức thì và để cả giao diện chuyển động theo nhịp cuộn.",
};

export default async function Home() {
  const stories = await getHomeStories();
  const spotlight = stories.find((story) => story.latestChapterId) ?? stories[0];

  return (
    <div className="app-shell">
      <SiteHeader />
      <main>
        <section className="home-hero page-shell">
          <div className="home-hero__copy">
            <div className="hero-signal"><Radio aria-hidden="true" /><span>ĐANG ĐỒNG BỘ GU ĐỌC</span><strong>01—26K</strong></div>
            <p className="section-kicker">MỰC / KINETIC READER</p>
            <h1>Đọc theo<br /><em>xung.</em></h1>
            <p className="home-hero__lede">Một chạm, cả giao diện sống theo nhịp cuộn. Mực nhớ chỗ bạn dừng, cảm được gu bạn chọn và đưa chương kế tiếp vào đúng quỹ đạo.</p>
            <div className="home-hero__actions">
              <Link className="button button--ink" href="/discover">Tìm truyện hợp gu <ArrowRight aria-hidden="true" /></Link>
              <Link className="text-link" href="/settings/ai"><Sparkles aria-hidden="true" /> Kích hoạt AI mode</Link>
            </div>
            <div className="trust-row">
              <span><RefreshCcw aria-hidden="true" /> catalog tự làm mới</span>
              <span><ShieldCheck aria-hidden="true" /> AI key không lưu máy chủ</span>
            </div>
          </div>
          {spotlight ? (
            <div className="hero-stage">
              <div className="hero-orbit" aria-hidden="true"><span /><span /><span /></div>
              <StoryPreviewLink className="hero-poster" story={spotlight} aria-label={`Mở ${spotlight.title}`}>
                {spotlight.coverUrl ? <Image src={spotlight.coverUrl} alt={`Bìa ${spotlight.title}`} fill sizes="(max-width: 767px) 70vw, 24rem" priority unoptimized /> : <span>{spotlight.title}</span>}
                <div className="hero-poster__caption">
                  <span>NOW PULSING</span>
                  <strong>{spotlight.title}</strong>
                  <small>CH. {spotlight.latestChapter ?? "NEW"} · OPEN SIGNAL</small>
                </div>
              </StoryPreviewLink>
              <span className="hero-coordinate">10.823°N<br />106.629°E</span>
            </div>
          ) : null}
          <a className="hero-scroll" href="#personal-feed"><ArrowDown aria-hidden="true" /> CUỘN ĐỂ ĐỔI NHỊP</a>
          <div className="hero-ink" aria-hidden="true">PULSE</div>
        </section>

        <div className="kinetic-ticker" aria-hidden="true">
          <div><span>ACTION</span><i /> <span>MANHWA</span><i /> <span>ROMANCE</span><i /> <span>FANTASY</span><i /> <span>WEBTOON</span><i /> <span>MYSTERY</span><i /></div>
          <div><span>ACTION</span><i /> <span>MANHWA</span><i /> <span>ROMANCE</span><i /> <span>FANTASY</span><i /> <span>WEBTOON</span><i /> <span>MYSTERY</span><i /></div>
        </div>

        <div className="page-shell"><ContinueReading /></div>

        <div id="personal-feed"><PersonalizedHomeShelves /></div>

        <Suspense fallback={<CommunityPicksFallback />}>
          <CommunityPicks />
        </Suspense>

        <section className="ai-editorial page-shell" aria-labelledby="ai-title">
          <div className="ai-editorial__mark"><Sparkles aria-hidden="true" /><span>NEURAL FILTER / BYOK</span></div>
          <div>
            <p className="section-kicker">Tín hiệu vào: lời bạn nói</p>
            <h2 id="ai-title">Nói gu.<br />Nhận truyện thật.</h2>
          </div>
          <div className="ai-editorial__copy">
            <p>“Tìm manhwa trả thù, nữ chính tỉnh táo, ít romance và đã hoàn thành.”</p>
            <p>AI không bịa tên. Nó lọc catalog thật, đối chiếu rating và review, rồi trả về bìa truyện có thể mở ngay.</p>
            <Link className="button button--paper" href="/settings/ai">Mở neural filter <ArrowRight aria-hidden="true" /></Link>
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
