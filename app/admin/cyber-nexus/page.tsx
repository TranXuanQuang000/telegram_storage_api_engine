import type { Metadata } from "next";
import { SiteHeader } from "../../../components/SiteHeader";
import { CyberNexusDashboard } from "../../../components/CyberNexusDashboard";

export const metadata: Metadata = {
  title: "Trung tâm vận hành | App Truyện Nova",
  description: "Dashboard quản trị theo dõi kho truyện, tiến trình đồng bộ, cache chapter và sức khỏe các nguồn dữ liệu.",
};

export default function CyberNexusPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="page-shell py-4">
        <CyberNexusDashboard />
      </main>
    </div>
  );
}
