import type { Metadata } from "next";
import { LibraryView } from "../../components/LibraryView";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = { title: "Tủ truyện", description: "Truyện đang đọc, theo dõi và lịch sử gần đây." };

export default function LibraryPage() {
  return <div className="app-shell"><SiteHeader /><main className="page-shell"><header className="page-intro"><p className="section-kicker">Tủ truyện của bạn</p><h1>Những câu chuyện<br /><em>chưa muốn rời.</em></h1><p>Lịch sử và tủ truyện trên thiết bị vẫn hoạt động khi chưa đăng nhập. Đồng bộ đa thiết bị sẽ dùng tài khoản ChatGPT của bạn.</p></header><LibraryView /></main></div>;
}

