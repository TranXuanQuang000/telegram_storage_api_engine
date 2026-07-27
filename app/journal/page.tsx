import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { VerifiedJournal } from "../../components/VerifiedJournal";

export const metadata: Metadata = {
  title: "The Verified Journal | App Truyen Nova",
  description: "Ấn phẩm báo chí & minh bạch dữ liệu, nơi độc giả xem Chứng thư Nguồn gốc Dữ liệu (Provenance) và báo cáo tuân thủ.",
};

export default function JournalPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="page-shell py-6">
        <VerifiedJournal />
      </main>
    </div>
  );
}
