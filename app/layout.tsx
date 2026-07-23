import type { Metadata } from "next";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import { headers } from "next/headers";
import { PwaRegister } from "../components/PwaRegister";
import "./globals.css";

const vietnameseSans = Be_Vietnam_Pro({
  variable: "--font-ui",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const vietnameseSerif = Lora({
  variable: "--font-literary",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? requestHeaders.get("host");
  const safeHost = host && /^(localhost(?::\d+)?|[a-z0-9.-]+(?::\d+)?)$/i.test(host) ? host : null;
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : safeHost?.startsWith("localhost") ? "http" : "https";
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const metadataBase = new URL(safeHost ? `${protocol}://${safeHost}` : fallback);
  const description = "Đọc manga, manhwa và manhua mượt mà; tìm đúng gu, lưu lịch sử, tải chương offline và dùng AI bằng API key của bạn.";
  return {
    metadataBase,
    title: { default: "Mực — đọc truyện theo gu", template: "%s · Mực" },
    description,
    manifest: "/manifest.webmanifest",
    applicationName: "Mực",
    keywords: ["đọc truyện", "manga", "manhwa", "manhua", "offline", "AI recommendation"],
    icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/icon-192.png" },
    openGraph: { type: "website", locale: "vi_VN", siteName: "Mực", title: "Mực — đọc truyện theo gu", description, images: [{ url: "/og.png", width: 1200, height: 630, alt: "Mực — phòng đọc manga, manhwa và manhua" }] },
    twitter: { card: "summary_large_image", title: "Mực — đọc truyện theo gu", description, images: ["/og.png"] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${vietnameseSans.variable} ${vietnameseSerif.variable} antialiased`}
      >
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
