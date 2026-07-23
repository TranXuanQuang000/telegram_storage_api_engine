"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, LoaderCircle, Menu, Moon, Settings2, Sun, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { queueProgress, saveChapterOffline } from "../lib/offline-store";

export function ReaderClient({
  chapterId,
  chapterName,
  pages,
  storySlug,
  storyTitle,
  coverUrl,
}: {
  chapterId: string;
  chapterName: string;
  pages: string[];
  storySlug: string;
  storyTitle: string;
  coverUrl: string;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [settings, setSettings] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [gap, setGap] = useState<"none" | "soft" | "wide">("soft");
  const [download, setDownload] = useState<"idle" | "working" | "done" | "error">("idle");
  const pageRefs = useRef<Array<HTMLElement | null>>([]);
  const percent = useMemo(() => Math.round(((currentPage + 1) / pages.length) * 100), [currentPage, pages.length]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("muc:last-progress");
      if (raw) {
        const saved = JSON.parse(raw) as { chapterId?: string; page?: number };
        if (saved.chapterId === chapterId && typeof saved.page === "number") {
          const target = Math.min(Math.max(saved.page, 0), pages.length - 1);
          requestAnimationFrame(() => {
            setCurrentPage(target);
            setTimeout(() => pageRefs.current[target]?.scrollIntoView({ block: "start" }), 160);
          });
        }
      }
    } catch { /* local progress is best effort */ }
  }, [chapterId, pages.length]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const page = Number((visible.target as HTMLElement).dataset.page ?? 0);
      setCurrentPage(page);
      try {
        const record = { chapterId, chapterName, page, totalPages: pages.length, storySlug, storyTitle, coverUrl, updatedAt: new Date().toISOString() };
        localStorage.setItem("muc:last-progress", JSON.stringify(record));
        const history = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Array<{ storySlug?: string; chapterId?: string }>;
        const nextHistory = [record, ...history.filter((item) => storySlug ? item.storySlug !== storySlug : item.chapterId !== chapterId)].slice(0, 50);
        localStorage.setItem("muc:history", JSON.stringify(nextHistory));
      } catch { /* storage may be unavailable */ }
      if (storySlug) void queueProgress({ storyId: storySlug, chapterId, page, progress: (page + 1) / pages.length, idempotencyKey: `${chapterId}:${page}` });
    }, { threshold: [0.35, 0.6, 0.85] });
    pageRefs.current.forEach((page) => page && observer.observe(page));
    return () => observer.disconnect();
  }, [chapterId, chapterName, pages.length, storySlug, storyTitle, coverUrl]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setSettings(false); setChrome(true); }
      if (event.key === "ArrowRight" || event.key === "PageDown") goTo(currentPage + 1);
      if (event.key === "ArrowLeft" || event.key === "PageUp") goTo(currentPage - 1);
      if (event.key.toLowerCase() === "m") setChrome((value) => !value);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function goTo(page: number) {
    const target = Math.min(Math.max(page, 0), pages.length - 1);
    pageRefs.current[target]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function downloadChapter() {
    setDownload("working");
    try {
      await saveChapterOffline({ storyId: storySlug, title: storyTitle, chapterId, chapterName, pages: pages.length, pageUrls: pages, estimatedBytes: pages.length * 420_000 });
      setDownload("done");
    } catch { setDownload("error"); }
  }

  return (
    <div className={`reader reader--${theme} reader--gap-${gap}`}>
      <header className={`reader-chrome reader-chrome--top${chrome ? " is-visible" : ""}`}>
        <Link href={storySlug ? `/story/${storySlug}` : "/"} aria-label="Trở lại truyện"><ArrowLeft aria-hidden="true" /></Link>
        <div><small>{storyTitle || "Mực Reader"}</small><strong>Chương {chapterName}</strong></div>
        <button type="button" onClick={() => setSettings(true)} aria-label="Mở cài đặt reader"><Settings2 aria-hidden="true" /></button>
      </header>

      <button className="reader-menu-hit" type="button" onClick={() => setChrome((value) => !value)} aria-label={chrome ? "Ẩn thanh điều khiển" : "Hiện thanh điều khiển"}><Menu aria-hidden="true" /></button>

      <main className="reader-pages" aria-label={`Trang truyện chương ${chapterName}`}>
        {pages.map((page, index) => (
          <figure key={page} ref={(node) => { pageRefs.current[index] = node; }} data-page={index}>
            <Image src={page} alt={`Trang ${index + 1} của chương ${chapterName}`} width={1440} height={2200} sizes="(max-width: 1184px) 100vw, 1184px" priority={index < 2} unoptimized />
            <figcaption>{String(index + 1).padStart(2, "0")}</figcaption>
          </figure>
        ))}
        <section className="reader-end">
          <span>Hết chương {chapterName}</span>
          <h2>Đặt dấu mực ở đây.</h2>
          <p>Tiến độ đã được lưu trên thiết bị. Khi đăng nhập, Mực sẽ đồng bộ nó qua các máy.</p>
          <Link className="button button--paper" href={storySlug ? `/story/${storySlug}` : "/"}>Về mục lục</Link>
        </section>
      </main>

      <nav className={`reader-chrome reader-chrome--bottom${chrome ? " is-visible" : ""}`} aria-label="Điều hướng trang">
        <button type="button" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 0} aria-label="Trang trước"><ChevronLeft aria-hidden="true" /></button>
        <div><span style={{ width: `${percent}%` }} /><strong>{currentPage + 1}</strong><small>/ {pages.length}</small></div>
        <button type="button" onClick={() => goTo(currentPage + 1)} disabled={currentPage === pages.length - 1} aria-label="Trang sau"><ChevronRight aria-hidden="true" /></button>
      </nav>

      {settings ? (
        <div className="reader-settings-backdrop" role="presentation" onClick={() => setSettings(false)}>
          <aside className="reader-settings" role="dialog" aria-modal="true" aria-labelledby="reader-settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="reader-settings__title"><div><small>Chương {chapterName}</small><h2 id="reader-settings-title">Nhịp đọc</h2></div><button type="button" onClick={() => setSettings(false)} aria-label="Đóng cài đặt"><X aria-hidden="true" /></button></div>
            <div className="reader-settings__group"><span>Nền đọc</span><div className="segmented"><button type="button" data-active={theme === "dark"} onClick={() => setTheme("dark")}><Moon aria-hidden="true" />Đêm</button><button type="button" data-active={theme === "light"} onClick={() => setTheme("light")}><Sun aria-hidden="true" />Giấy</button></div></div>
            <div className="reader-settings__group"><span>Khoảng giữa trang</span><div className="segmented"><button type="button" data-active={gap === "none"} onClick={() => setGap("none")}>Liền</button><button type="button" data-active={gap === "soft"} onClick={() => setGap("soft")}>Vừa</button><button type="button" data-active={gap === "wide"} onClick={() => setGap("wide")}>Rộng</button></div></div>
            <button className="download-row" type="button" onClick={downloadChapter} disabled={download === "working"}>
              {download === "working" ? <LoaderCircle className="spin" aria-hidden="true" /> : download === "done" ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
              <span><strong>{download === "done" ? "Đã ghim offline" : download === "error" ? "Tải lại chương" : "Tải chương này"}</strong><small>{pages.length} trang · cache trên thiết bị</small></span>
            </button>
            <p className="reader-privacy">Ảnh chỉ được lưu trên thiết bị này. Mực không sao chép chương lên máy chủ riêng.</p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
