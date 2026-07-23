import type { Metadata } from "next";
import { DownloadsView } from "../../components/DownloadsView";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = { title: "Đã tải", description: "Quản lý chương đã tải để đọc offline." };

export default function DownloadsPage() {
  return <div className="app-shell"><SiteHeader /><main className="page-shell"><header className="page-intro"><p className="section-kicker">Gói đọc đường dài</p><h1>Mạng chập chờn,<br /><em>truyện thì không.</em></h1><p>Chương được cache trực tiếp trên thiết bị, không mirror lên máy chủ Mực. Bạn luôn thấy dung lượng, trạng thái và quyền xóa.</p></header><DownloadsView /></main></div>;
}

