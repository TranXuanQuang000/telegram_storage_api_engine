import type { Metadata } from "next";
import { LibraryView } from "../../components/LibraryView";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = { title: "Tủ truyện", description: "Truyện đang đọc, theo dõi và lịch sử gần đây." };

export default function LibraryPage() {
  return <div className="app-shell"><SiteHeader /><main className="page-shell"><header className="page-intro" data-code="VAULT"><p className="section-kicker">PERSONAL VAULT / DEVICE MEMORY</p><h1>Gu của bạn,<br /><em>đang chuyển động.</em></h1><p>Mọi bìa truyện, chương đã đọc và dấu dừng được gom thành một dòng thời gian riêng trên thiết bị — có thể tiếp tục hoặc xóa bất cứ lúc nào.</p></header><LibraryView /></main></div>;
}

