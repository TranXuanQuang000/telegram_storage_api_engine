import type { Metadata } from "next";
import { AiSettings } from "../../../components/AiSettings";
import { SiteHeader } from "../../../components/SiteHeader";

export const metadata: Metadata = { title: "AI của bạn", description: "Kết nối API key AI theo cách riêng tư để hỏi và nhận gợi ý truyện." };

export default function AiSettingsPage() {
  return <div className="app-shell"><SiteHeader /><main className="page-shell"><header className="page-intro" data-code="NEURAL"><p className="section-kicker">NEURAL FILTER / YOUR KEY</p><h1>Bật trí tuệ.<br /><em>Giữ riêng tư.</em></h1><p>Bạn chọn nhà cung cấp và model. Mực chỉ đưa các ứng viên có thật vào vùng suy luận, không cho AI bịa truyện và không lưu API key lên máy chủ.</p></header><AiSettings /></main></div>;
}

