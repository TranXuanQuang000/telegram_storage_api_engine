import type { Metadata } from "next";
import { BookOpenText, Images, Layers3, RadioTower } from "lucide-react";
import { NovelCatalog } from "../../components/NovelCatalog";
import { SiteHeader } from "../../components/SiteHeader";
import { PUBLIC_DOMAIN_NOVELS } from "../../lib/novels";

export const metadata: Metadata = {
  title: "Mực Chữ",
  description: "Kho light novel và tiểu thuyết đa nguồn với bìa lớn, mục lục rõ ràng và trình đọc chuyên dụng.",
};

export default async function NovelsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const initialQuery = typeof params.q === "string" ? params.q : "";
  return (
    <div className="app-shell novel-space">
      <SiteHeader />
      <main className="novel-home page-shell">
        <header className="novel-hero">
          <div className="novel-hero__copy">
            <p className="section-kicker"><RadioTower aria-hidden="true" /> MỰC CHỮ / LIVING ARCHIVE</p>
            <h1>Chọn bằng bìa.<br /><em>Ở lại vì câu chữ.</em></h1>
            <p>Light novel, tiên hiệp, huyền huyễn, ngôn tình và văn học kinh điển được gom vào một tủ chữ thống nhất. Mỗi tác phẩm giữ nguyên nguồn, bìa, trạng thái và mục lục chapter.</p>
            <div className="novel-hero__chips">
              <span><Layers3 aria-hidden="true" /> Catalog đa nguồn</span>
              <span><Images aria-hidden="true" /> Bìa nguyên bản</span>
              <span><BookOpenText aria-hidden="true" /> Reader nối chương</span>
            </div>
          </div>
          <div className="novel-hero__orbit" aria-hidden="true">
            <span className="novel-hero__orbit-ring" />
            <span className="novel-hero__book novel-hero__book--one">LN</span>
            <span className="novel-hero__book novel-hero__book--two">NOVEL</span>
            <div><strong>TEXT</strong><small>FREQUENCY</small></div>
          </div>
        </header>
        <NovelCatalog initialNovels={PUBLIC_DOMAIN_NOVELS} initialQuery={initialQuery} />
        <aside className="novel-roadmap">
          <RadioTower aria-hidden="true" />
          <div>
            <strong>Mục lục được cập nhật theo queue, nội dung được lấy khi bạn mở chapter.</strong>
            <span>Cơ chế này giúp kho luôn mới mà không bắt trang đầu tải hàng nghìn chapter hoặc ảnh không cần thiết.</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
