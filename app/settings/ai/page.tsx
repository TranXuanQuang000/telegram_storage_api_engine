import type { Metadata } from "next";
import { AiSettings } from "../../../components/AiSettings";
import { SiteHeader } from "../../../components/SiteHeader";

export const metadata: Metadata = { title: "AI của bạn", description: "Kết nối API key AI theo cách riêng tư để hỏi và nhận gợi ý truyện." };

export default function AiSettingsPage() {
  return <div className="app-shell"><SiteHeader /><main className="page-shell"><header className="page-intro"><p className="section-kicker">AI của bạn, luật của Mực</p><h1>Đưa chìa khóa,<br /><em>không đưa riêng tư.</em></h1><p>Bạn chọn nhà cung cấp và model. Mực giới hạn dữ liệu gửi đi, không cho model bịa truyện và không dùng key của bạn để huấn luyện hay lưu trữ.</p></header><AiSettings /></main></div>;
}

