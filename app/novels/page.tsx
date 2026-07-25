import type { Metadata } from "next";
import { BookText, Sparkles } from "lucide-react";
import { NovelCatalog } from "../../components/NovelCatalog";
import { SiteHeader } from "../../components/SiteHeader";
import { PUBLIC_DOMAIN_NOVELS } from "../../lib/novels";

export const metadata: Metadata = {
  title: "Mực Chữ",
  description: "Khu đọc truyện chữ tách riêng của Mực, với reader tùy biến sâu và văn bản có nguồn rõ ràng.",
};

export default async function NovelsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const initialQuery = typeof params.q === "string" ? params.q : "";
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="novel-home page-shell">
        <header className="novel-hero">
          <div><p className="section-kicker">MỰC CHỮ / TEXT FREQUENCY</p><h1>Chậm nhịp ảnh.<br /><em>Sâu nhịp chữ.</em></h1><p>Một thư viện riêng cho tiểu thuyết và truyện ngắn: cùng tài khoản Mực, nhưng mục lục, tiến độ và bộ cài đọc được thiết kế cho văn bản dài.</p></div>
          <div className="novel-hero__signal"><BookText aria-hidden="true" /><strong>MULTI-SOURCE</strong><span>Mỗi tác phẩm và chương đều hiển thị nguồn thực tế; kho Wikisource công cộng luôn là lớp dự phòng.</span></div>
        </header>
        <NovelCatalog initialNovels={PUBLIC_DOMAIN_NOVELS} initialQuery={initialQuery} />
        <aside className="novel-roadmap"><Sparkles aria-hidden="true" /><div><strong>Catalog truyện chữ có adapter nguồn riêng.</strong><span>Khi Multi-Source API được cấu hình, Mực hợp nhất catalog đó với Wikisource; nếu backend gián đoạn, kho công cộng và 26 chương đóng gói vẫn mở được.</span></div></aside>
      </main>
    </div>
  );
}
