import type { Metadata } from "next";
import { SiteHeader } from "../../../components/SiteHeader";
import { CuratorCanvas } from "../../../components/CuratorCanvas";

export const metadata: Metadata = {
  title: "The Curator's Canvas | App Truyen Nova",
  description: "Giao diện Infinite Canvas quản lý và hợp nhất luồng truyện theo thuật toán Zipper & Consent Verification.",
};

export default function CuratorCanvasPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="page-shell py-4">
        <CuratorCanvas />
      </main>
    </div>
  );
}
