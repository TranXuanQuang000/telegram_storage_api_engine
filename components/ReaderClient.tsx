"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Home,
  List,
  LoaderCircle,
  Menu,
  Moon,
  Search,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queueProgress, saveChapterOffline } from "../lib/offline-store";

type ReaderChapter = {
  id: string;
  number: string;
  title: string;
};

export function ReaderClient({
  chapterId,
  chapterName,
  pages,
  storySlug,
  storyTitle,
  coverUrl,
  chapters,
}: {
  chapterId: string;
  chapterName: string;
  pages: string[];
  storySlug: string;
  storyTitle: string;
  coverUrl: string | null;
  chapters: ReaderChapter[];
}) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [settings, setSettings] = useState(false);
  const [chapterList, setChapterList] = useState(false);
  const [chapterFilter, setChapterFilter] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [gap, setGap] = useState<"none" | "soft" | "wide">("none");
  const [download, setDownload] = useState<"idle" | "working" | "done" | "error">("idle");
  const pageRefs = useRef<Array<HTMLElement | null>>([]);
  const lastSavedPage = useRef(-1);
  const percent = useMemo(() => Math.round(((currentPage + 1) / pages.length) * 100), [currentPage, pages.length]);
  const currentChapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  const previousChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;
  const nextChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const visibleChapters = useMemo(() => {
    const query = chapterFilter.trim().toLocaleLowerCase("vi");
    if (!query) return chapters;
    return chapters.filter((chapter) => `chương ${chapter.number} ${chapter.title}`.toLocaleLowerCase("vi").includes(query));
  }, [chapterFilter, chapters]);

  const chapterHref = useCallback((id: string) => {
    const query = new URLSearchParams();
    if (storySlug) query.set("story", storySlug);
    return `/read/${id}${query.size ? `?${query.toString()}` : ""}`;
  }, [storySlug]);

  const openChapter = useCallback((chapter: ReaderChapter | null) => {
    if (!chapter) return;
    setChapterList(false);
    router.push(chapterHref(chapter.id));
  }, [chapterHref, router]);

  const goTo = useCallback((page: number) => {
    if (page >= pages.length) {
      if (nextChapter) openChapter(nextChapter);
      return;
    }
    if (page < 0) {
      if (previousChapter) openChapter(previousChapter);
      return;
    }
    pageRefs.current[page]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [nextChapter, openChapter, pages.length, previousChapter]);

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
    if (!storySlug) return;
    try {
      const stats = JSON.parse(localStorage.getItem("muc:story-stats") ?? "[]") as Array<{
        slug: string;
        opens: number;
        lastOpenedAt: string;
      }>;
      const previous = stats.find((item) => item.slug === storySlug);
      const next = [
        { slug: storySlug, opens: (previous?.opens ?? 0) + 1, lastOpenedAt: new Date().toISOString() },
        ...stats.filter((item) => item.slug !== storySlug),
      ].slice(0, 200);
      localStorage.setItem("muc:story-stats", JSON.stringify(next));
    } catch {
      // Personal ranking remains optional when storage is unavailable.
    }
  }, [chapterId, storySlug]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const page = Number((visible.target as HTMLElement).dataset.page ?? 0);
      setCurrentPage((value) => value === page ? value : page);
      if (lastSavedPage.current === page) return;
      lastSavedPage.current = page;
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
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button")) return;
      if (event.key === "Escape") {
        setSettings(false);
        setChapterList(false);
        setChrome(true);
      }
      if (settings || chapterList) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goTo(currentPage + 1);
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goTo(currentPage - 1);
      }
      if (event.key.toLowerCase() === "m") setChrome((value) => !value);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapterList, currentPage, goTo, settings]);

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
        <Link href="/" aria-label="Về trang chủ"><Home aria-hidden="true" /></Link>
        <Link href={storySlug ? `/story/${storySlug}` : "/"} aria-label="Trở lại mục lục truyện"><ArrowLeft aria-hidden="true" /></Link>
        <div><small>{storyTitle || "Mực Reader"}</small><strong>Chương {chapterName}</strong></div>
        <Link href="/discover" aria-label="Tiếp tục tìm truyện"><Search aria-hidden="true" /></Link>
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
          <h2>{nextChapter ? `Chương ${nextChapter.number} đang chờ.` : "Đặt dấu mực ở đây."}</h2>
          <p>Tiến độ đã được lưu trên thiết bị. Bạn có thể chuyển chương ngay hoặc quay lại mục lục.</p>
          <div className="reader-end__actions">
            {nextChapter ? <Link className="button button--paper" href={chapterHref(nextChapter.id)}>Đọc chương {nextChapter.number} <ChevronRight aria-hidden="true" /></Link> : null}
            <Link className="text-link" href={storySlug ? `/story/${storySlug}` : "/"}>Về mục lục</Link>
          </div>
        </section>
      </main>

      <nav className={`reader-chrome reader-chrome--bottom${chrome ? " is-visible" : ""}`} aria-label="Điều hướng trang và chương">
        <button type="button" onClick={() => openChapter(previousChapter)} disabled={!previousChapter} aria-label="Chương trước"><ChevronsLeft aria-hidden="true" /></button>
        <button className="reader-chapter-picker" type="button" onClick={() => setChapterList(true)} disabled={!chapters.length} aria-label="Mở danh sách chương"><List aria-hidden="true" /><span>Ch. {chapterName}</span></button>
        <button type="button" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 0 && !previousChapter} aria-label={currentPage === 0 ? "Sang chương trước" : "Trang trước"}><ChevronLeft aria-hidden="true" /></button>
        <div className="reader-progress"><span style={{ width: `${percent}%` }} /><strong>{currentPage + 1}</strong><small>/ {pages.length}</small></div>
        <button type="button" onClick={() => goTo(currentPage + 1)} disabled={currentPage === pages.length - 1 && !nextChapter} aria-label={currentPage === pages.length - 1 ? "Sang chương tiếp theo" : "Trang sau"}><ChevronRight aria-hidden="true" /></button>
        <button type="button" onClick={() => openChapter(nextChapter)} disabled={!nextChapter} aria-label="Chương tiếp theo"><ChevronsRight aria-hidden="true" /></button>
      </nav>

      {chapterList ? (
        <div className="reader-settings-backdrop" role="presentation" onClick={() => setChapterList(false)}>
          <aside className="reader-settings reader-chapter-sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-list-title" onClick={(event) => event.stopPropagation()}>
            <div className="reader-settings__title"><div><small>{chapters.length} chương</small><h2 id="chapter-list-title">Mục lục nhanh</h2></div><button type="button" onClick={() => setChapterList(false)} aria-label="Đóng danh sách chương"><X aria-hidden="true" /></button></div>
            <label className="reader-chapter-search"><Search aria-hidden="true" /><input value={chapterFilter} onChange={(event) => setChapterFilter(event.target.value)} placeholder="Tìm số chương…" autoFocus /></label>
            <nav className="reader-chapter-list" aria-label="Danh sách chương">
              {visibleChapters.map((chapter) => (
                <Link key={chapter.id} href={chapterHref(chapter.id)} aria-current={chapter.id === chapterId ? "page" : undefined} onClick={() => setChapterList(false)}>
                  <strong>Chương {chapter.number}</strong>
                  <small>{chapter.id === chapterId ? "đang đọc" : chapter.title || "mở chương"}</small>
                  <ChevronRight aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

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
