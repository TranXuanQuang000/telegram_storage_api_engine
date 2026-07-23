import type { Metadata } from "next";
import { DownloadsView } from "../../components/DownloadsView";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = { title: "Đã tải", description: "Quản lý chương đã tải để đọc offline." };

export default function DownloadsPage() {
  return <div className="app-shell"><SiteHeader /><main className="page-shell"><header className="page-intro" data-code="CACHE"><p className="section-kicker">OFFLINE CACHE / LOCAL ONLY</p><h1>Mất sóng.<br /><em>Không mất nhịp.</em></h1><p>Chương được cache trực tiếp trên thiết bị, không mirror lên máy chủ Mực. Dung lượng, trạng thái và quyền xóa luôn nằm trong tay bạn.</p></header><DownloadsView /></main></div>;
}

