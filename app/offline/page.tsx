import Link from "next/link";
import { ArrowRight, CloudOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <CloudOff aria-hidden="true" />
      <p className="section-kicker">Không có mạng</p>
      <h1>Phòng đọc vẫn mở.</h1>
      <p>Các chương đã có dấu “Đã ghim offline” vẫn đọc được. Kết nối lại để tìm truyện mới và đồng bộ tiến độ.</p>
      <div><Link className="button button--ink" href="/downloads">Mở truyện đã tải <ArrowRight aria-hidden="true" /></Link><Link className="text-link" href="/">Thử về trang chủ</Link></div>
    </main>
  );
}

