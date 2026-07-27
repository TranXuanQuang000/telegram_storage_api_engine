import type { Metadata } from "next";
import { SiteHeader } from "../../../components/SiteHeader";
import { CyberNexusDashboard } from "../../../components/CyberNexusDashboard";

export const metadata: Metadata = {
  title: "Cyber-Nexus Dashboard | App Truyen Nova",
  description: "Bảng điều khiển giám sát pipeline cào dữ liệu, ngắt mạch tự động Circuit Breaker và xoay vòng Proxy Pool.",
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
