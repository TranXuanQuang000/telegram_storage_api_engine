"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
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
import { preloadChapterPages, queueProgress, saveChapterOffline } from "../lib/offline-store";

type ReaderChapter = {
  id: string;
  number: string;
  title: string;
};

type StreamComicChapter = ReaderChapter & {
  pages: string[];
};

export function ReaderClient({
  chapterId,
  chapterName,
  pages,
  storyId,
  storySlug,
  storyTitle,
  coverUrl,
  chapters,
}: {
  chapterId: string;
  chapterName: string;
  pages: string[];
  storyId: string;
  storySlug: string;
  storyTitle: string;
  coverUrl: string | null;
  chapters: ReaderChapter[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPage, setCurrentPage] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [settings, setSettings] = useState(false);
  const [chapterList, setChapterList] = useState(false);
  const [chapterFilter, setChapterFilter] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [gap, setGap] = useState<"none" | "soft" | "wide">("none");
  const [download, setDownload] = useState<"idle" | "working" | "done" | "error">("idle");
  const [chapterLoad, setChapterLoad] = useState({ loaded: 0, total: pages.length, failed: 0, done: false });
  const [stream, setStream] = useState<StreamComicChapter[]>([{
    id: chapterId,
    number: chapterName,
    title: "",
    pages,
  }]);
  const [activeChapterId, setActiveChapterId] = useState(chapterId);
  const [streamLoad, setStreamLoad] = useState<"idle" | "manifest" | "pages" | "ready" | "end" | "error">("idle");
  const pageRefs = useRef(new Map<string, HTMLElement>());
  const streamRef = useRef(stream);
  const loadingChapterRef = useRef<string | null>(null);
  const lastSavedPosition = useRef("");
  const activeStreamChapter = stream.find((chapter) => chapter.id === activeChapterId) ?? stream[0];
  const activePageCount = activeStreamChapter?.pages.length ?? pages.length;
  const percent = useMemo(
    () => Math.round(((currentPage + 1) / Math.max(1, activePageCount)) * 100),
    [activePageCount, currentPage],
  );
  const currentChapterIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId);
  const previousChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;
  const nextChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const tailChapter = stream.at(-1);
  const tailChapterIndex = chapters.findIndex((chapter) => chapter.id === tailChapter?.id);
  const tailNextChapter = tailChapterIndex > 0 ? chapters[tailChapterIndex - 1] : null;

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    const controller = new AbortController();
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const constrained = connection?.saveData
      || connection?.effectiveType === "slow-2g"
      || connection?.effectiveType === "2g";
    const start = () => {
      void preloadChapterPages(pages, {
        signal: controller.signal,
        concurrency: constrained ? 2 : 4,
        onProgress: (progress) => {
          if (!controller.signal.aborted) {
            setChapterLoad({ ...progress, done: progress.loaded + progress.failed >= progress.total });
          }
        },
      });
    };
    // Start on the next task instead of waiting for browser idle time: the reader
    // must have the complete chapter in its bounded cache before the user reaches it.
    const timeoutHandle = window.setTimeout(start, 0);
    return () => {
      controller.abort();
      window.clearTimeout(timeoutHandle);
    };
  }, [chapterId, pages]);

  // Đánh dấu chương này là đã đọc
  useEffect(() => {
    if (!chapterId) return;
    try {
      const raw = localStorage.getItem("muc:read-chapters");
      const readSet = new Set(raw ? (JSON.parse(raw) as string[]) : []);
      if (!readSet.has(chapterId)) {
        readSet.add(chapterId);
        localStorage.setItem("muc:read-chapters", JSON.stringify(Array.from(readSet)));
      }
    } catch {
      /* storage best effort */
    }
  }, [chapterId]);

  // Fix bug tìm kiếm chapter thông minh hơn (15, chap 15, c15...)
  const visibleChapters = useMemo(() => {
    const raw = chapterFilter.trim().toLowerCase();
    if (!raw) return chapters;
    const clean = raw.replace(/^chương\s*|^chap\s*|^c\s*/i, "").trim();
    return chapters.filter((chapter) => {
      const num = String(chapter.number).toLowerCase();
      const title = (chapter.title || "").toLowerCase();
      const full = `chương ${num} ${title}`.toLowerCase();
      return (
        full.includes(raw) ||
        num === clean ||
        num.startsWith(clean) ||
        title.includes(clean)
      );
    });
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

  const loadNextIntoStream = useCallback(async (afterChapterId: string) => {
    const lastChapter = streamRef.current.at(-1);
    if (!lastChapter || lastChapter.id !== afterChapterId) return;
    const index = chapters.findIndex((chapter) => chapter.id === afterChapterId);
    const candidate = index > 0 ? chapters[index - 1] : null;
    if (!candidate) {
      setStreamLoad("end");
      return;
    }
    if (streamRef.current.some((chapter) => chapter.id === candidate.id) || loadingChapterRef.current === candidate.id) return;
    loadingChapterRef.current = candidate.id;
    setStreamLoad("manifest");
    try {
      const response = await fetch(`/api/download-manifest/${encodeURIComponent(candidate.id)}`, {
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        setStreamLoad("error");
        return;
      }
      if (!response.ok) throw new Error(`NEXT_CHAPTER_${response.status}`);
      const manifest = await response.json() as { pages?: string[]; chapterName?: string };
      const nextPages = manifest.pages?.filter(Boolean) ?? [];
      if (!nextPages.length) throw new Error("NEXT_CHAPTER_EMPTY");
      setStreamLoad("pages");
      const connection = (navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }).connection;
      const constrained = connection?.saveData
        || connection?.effectiveType === "slow-2g"
        || connection?.effectiveType === "2g";
      await preloadChapterPages(nextPages, { concurrency: constrained ? 2 : 4 });
      const loaded = {
        ...candidate,
        number: manifest.chapterName || candidate.number,
        pages: nextPages,
      };
      setStream((current) => current.some((chapter) => chapter.id === candidate.id)
        ? current
        : [...current, loaded]);
      setStreamLoad("ready");
    } catch {
      setStreamLoad("error");
    } finally {
      loadingChapterRef.current = null;
    }
  }, [chapters]);

  const goTo = useCallback((page: number) => {
    if (page >= activePageCount) {
      const nextLoaded = nextChapter && streamRef.current.find((chapter) => chapter.id === nextChapter.id);
      if (nextLoaded) {
        pageRefs.current.get(`${nextLoaded.id}:0`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (nextChapter) {
        openChapter(nextChapter);
      }
      return;
    }
    if (page < 0) {
      const previousLoaded = previousChapter && streamRef.current.find((chapter) => chapter.id === previousChapter.id);
      if (previousLoaded) {
        const target = Math.max(0, previousLoaded.pages.length - 1);
        pageRefs.current.get(`${previousLoaded.id}:${target}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (previousChapter) {
        openChapter(previousChapter);
      }
      return;
    }
    pageRefs.current.get(`${activeChapterId}:${page}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeChapterId, activePageCount, nextChapter, openChapter, previousChapter]);

  // Fix bug Đọc tiếp: Khôi phục chính xác trang đọc mới nhất từ URL param hoặc localStorage
  useEffect(() => {
    let targetPage = -1;
    const pageParam = searchParams?.get("page");
    if (pageParam !== null && pageParam !== undefined) {
      const parsed = parseInt(pageParam, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        targetPage = parsed;
      }
    }

    if (targetPage < 0) {
      try {
        const raw = localStorage.getItem("muc:last-progress");
        if (raw) {
          const saved = JSON.parse(raw) as { chapterId?: string; page?: number };
          if (saved.chapterId === chapterId && typeof saved.page === "number") {
            targetPage = saved.page;
          }
        }
      } catch { /* storage best effort */ }
    }

    if (targetPage >= 0) {
      const clamped = Math.min(Math.max(targetPage, 0), pages.length - 1);
      const scrollTimer = setTimeout(() => {
        setCurrentPage(clamped);
        pageRefs.current.get(`${chapterId}:${clamped}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 200);
      return () => clearTimeout(scrollTimer);
    }
  }, [chapterId, pages.length, searchParams]);

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
      const visibleChapterId = (visible.target as HTMLElement).dataset.chapterId || chapterId;
      const visibleChapter = stream.find((chapter) => chapter.id === visibleChapterId) ?? stream[0];
      if (!visibleChapter) return;
      const visibleChapterName = visibleChapter.number;
      const totalPages = visibleChapter.pages.length;
      setActiveChapterId((value) => value === visibleChapterId ? value : visibleChapterId);
      setCurrentPage((value) => value === page ? value : page);
      const positionKey = `${visibleChapterId}:${page}`;
      if (lastSavedPosition.current === positionKey) return;
      lastSavedPosition.current = positionKey;
      try {
        const record = {
          chapterId: visibleChapterId,
          chapterName: visibleChapterName,
          page,
          totalPages,
          storySlug,
          storyTitle,
          coverUrl,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem("muc:last-progress", JSON.stringify(record));
        const history = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Array<{ storySlug?: string; chapterId?: string }>;
        const nextHistory = [record, ...history.filter((item) => storySlug ? item.storySlug !== storySlug : item.chapterId !== visibleChapterId)].slice(0, 50);
        localStorage.setItem("muc:history", JSON.stringify(nextHistory));
        const read = new Set(JSON.parse(localStorage.getItem("muc:read-chapters") ?? "[]") as string[]);
        read.add(visibleChapterId);
        localStorage.setItem("muc:read-chapters", JSON.stringify([...read]));
      } catch { /* storage may be unavailable */ }
      if (storyId || storySlug) void queueProgress({
        storyId: storyId || storySlug,
        chapterId: visibleChapterId,
        chapterName: visibleChapterName,
        page,
        totalPages,
        progress: (page + 1) / totalPages,
        storyTitle,
        coverUrl,
        medium: "comic",
        locator: JSON.stringify({ pageIndex: page }),
        idempotencyKey: `${visibleChapterId}:${page}`,
      });
      if (visibleChapterId !== chapterId) {
        const nextUrl = chapterHref(visibleChapterId);
        if (`${location.pathname}${location.search}` !== nextUrl) history.replaceState(history.state, "", nextUrl);
      }
      const isTailChapter = streamRef.current.at(-1)?.id === visibleChapterId;
      if (isTailChapter && page >= Math.max(1, Math.floor(totalPages * .45))) {
        void loadNextIntoStream(visibleChapterId);
      }
    }, { threshold: [0.35, 0.6, 0.85] });
    pageRefs.current.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [chapterHref, chapterId, coverUrl, loadNextIntoStream, storyId, storySlug, storyTitle, stream]);

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

  useEffect(() => {
    if (!chapterLoad.done || streamRef.current.length > 1) return;
    const timer = window.setTimeout(() => void loadNextIntoStream(chapterId), 120);
    return () => window.clearTimeout(timer);
  }, [chapterId, chapterLoad.done, loadNextIntoStream]);

  async function downloadChapter() {
    setDownload("working");
    try {
      const targetChapter = activeStreamChapter ?? stream[0];
      await saveChapterOffline({
        storyId: storySlug,
        title: storyTitle,
        coverUrl,
        chapterId: targetChapter.id,
        chapterName: targetChapter.number,
        pages: targetChapter.pages.length,
        pageUrls: targetChapter.pages,
        estimatedBytes: targetChapter.pages.length * 420_000,
        manifestVersion: `otruyen-${targetChapter.id}-${targetChapter.pages.length}`,
      });
      setDownload("done");
    } catch { setDownload("error"); }
  }

  return (
    <div className={`reader reader--${theme} reader--gap-${gap}`}>
      <header className={`reader-chrome reader-chrome--top${chrome ? " is-visible" : ""}`}>
        {/* Nút Home với hiệu ứng chuyển cảnh mượt mà */}
        <Link
          href="/"
          aria-label="Về trang chủ"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.4rem",
            borderRadius: "0.5rem",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          className="hover:scale-110 active:scale-95 hover:text-cyan-400 hover:drop-shadow-[0_0_8px_rgba(59,220,255,0.6)]"
        >
          <Home aria-hidden="true" />
        </Link>

        {/* Nút Về trang truyện đang đọc */}
        {storySlug ? (
          <Link
            href={`/story/${storySlug}`}
            aria-label="Về trang thông tin truyện"
            title="Về trang chi tiết truyện này"
            className="reader-story-btn"
          >
            <BookOpen style={{ width: "0.95rem", height: "0.95rem" }} aria-hidden="true" />
            <span className="reader-story-btn-text">Trang truyện</span>
          </Link>
        ) : (
          <Link href="/discover" aria-label="Trở lại mục lục truyện"><ArrowLeft aria-hidden="true" /></Link>
        )}

        <div>
          <small>
            {storyTitle || "Mực Reader"} · {activeChapterId === chapterId
              ? chapterLoad.done
                ? chapterLoad.failed
                  ? `${chapterLoad.loaded}/${chapterLoad.total} trang sẵn sàng`
                  : "đã nạp đủ chương"
                : `đang chuẩn bị ${chapterLoad.loaded}/${chapterLoad.total}`
              : "chương nối tiếp đã tải sẵn"}
          </small>
          <strong>Chương {activeStreamChapter?.number ?? chapterName}</strong>
        </div>
        <Link href="/discover" aria-label="Tiếp tục tìm truyện"><Search aria-hidden="true" /></Link>
        <button type="button" onClick={() => setSettings(true)} aria-label="Mở cài đặt reader"><Settings2 aria-hidden="true" /></button>
      </header>

      <button className="reader-menu-hit" type="button" onClick={() => setChrome((value) => !value)} aria-label={chrome ? "Ẩn thanh điều khiển" : "Hiện thanh điều khiển"}><Menu aria-hidden="true" /></button>

      <main className="reader-pages" aria-label={`Luồng đọc liên tục từ chương ${chapterName}`}>
        {stream.map((loadedChapter, chapterPosition) => (
          <section className="reader-stream-chapter" key={loadedChapter.id} data-stream-chapter={loadedChapter.id}>
            {chapterPosition > 0 ? (
              <div className="reader-chapter-boundary">
                <span>CHƯƠNG NỐI TIẾP · ĐÃ TẢI SẴN</span>
                <strong>Chương {loadedChapter.number}</strong>
              </div>
            ) : null}
            {loadedChapter.pages.map((page, index) => (
              <figure
                key={`${loadedChapter.id}:${page}`}
                ref={(node) => {
                  const key = `${loadedChapter.id}:${index}`;
                  if (node) pageRefs.current.set(key, node);
                  else pageRefs.current.delete(key);
                }}
                data-page={index}
                data-chapter-id={loadedChapter.id}
              >
                <Image
                  src={page}
                  alt={`Trang ${index + 1} của chương ${loadedChapter.number}`}
                  width={1440}
                  height={2200}
                  sizes="(max-width: 1184px) 100vw, 1184px"
                  priority={chapterPosition === 0 && index < 2}
                  loading={chapterPosition === 0 && index < 2 ? "eager" : "lazy"}
                  fetchPriority={chapterPosition === 0 && index < 2 ? "high" : "auto"}
                  decoding="async"
                  unoptimized
                />
                <figcaption>{String(index + 1).padStart(2, "0")}</figcaption>
              </figure>
            ))}
          </section>
        ))}
        {streamLoad === "manifest" || streamLoad === "pages" ? (
          <div className="reader-stream-loader" role="status">
            <LoaderCircle className="spin" aria-hidden="true" />
            <span>{streamLoad === "manifest" ? "Đang lấy chương tiếp theo…" : "Đang tải trước toàn bộ trang của chương tiếp theo…"}</span>
          </div>
        ) : null}
        {streamLoad === "error" ? (
          <div className="reader-stream-loader reader-stream-loader--error" role="status">
            <span>Chưa tải được chương kế tiếp. Bạn có thể thử lại mà không mất vị trí đang đọc.</span>
            {tailNextChapter ? (
              <button className="text-link" type="button" onClick={() => void loadNextIntoStream(tailChapter?.id ?? chapterId)}>
                Thử tải lại
              </button>
            ) : null}
          </div>
        ) : null}
        <section className="reader-end">
          <span>Đã tải đến chương {tailChapter?.number ?? chapterName}</span>
          <h2>{tailNextChapter ? `Cuộn tiếp để nạp chương ${tailNextChapter.number}.` : "Bạn đã đến chương mới nhất."}</h2>
          <p>Reader tự tải trọn chương hiện tại và chuẩn bị chương kế tiếp trong nền. Tiến độ được cập nhật khi bạn đi qua ranh giới chương.</p>
          <div className="reader-end__actions" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
            {tailNextChapter ? <button className="button button--paper" type="button" onClick={() => void loadNextIntoStream(tailChapter?.id ?? chapterId)}>Nạp chương {tailNextChapter.number} <ChevronRight aria-hidden="true" /></button> : null}
            {storySlug ? (
              <Link className="button button--ink" href={`/story/${storySlug}`}>
                <BookOpen aria-hidden="true" /> Về trang truyện này
              </Link>
            ) : null}
            <Link className="text-link" href="/">Về trang chủ</Link>
          </div>
        </section>
      </main>

      <nav className={`reader-chrome reader-chrome--bottom${chrome ? " is-visible" : ""}`} aria-label="Điều hướng trang và chương">
        <button type="button" onClick={() => openChapter(previousChapter)} disabled={!previousChapter} aria-label="Chương trước"><ChevronsLeft aria-hidden="true" /></button>
        <button className="reader-chapter-picker" type="button" onClick={() => setChapterList(true)} disabled={!chapters.length} aria-label="Mở danh sách chương"><List aria-hidden="true" /><span>Ch. {activeStreamChapter?.number ?? chapterName}</span></button>
        <button type="button" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 0 && !previousChapter} aria-label={currentPage === 0 ? "Sang chương trước" : "Trang trước"}><ChevronLeft aria-hidden="true" /></button>
        <div className="reader-progress"><span style={{ width: `${percent}%` }} /><strong>{currentPage + 1}</strong><small>/ {activePageCount}</small></div>
        <button type="button" onClick={() => goTo(currentPage + 1)} disabled={currentPage === activePageCount - 1 && !nextChapter} aria-label={currentPage === activePageCount - 1 ? "Sang chương tiếp theo" : "Trang sau"}><ChevronRight aria-hidden="true" /></button>
        <button type="button" onClick={() => openChapter(nextChapter)} disabled={!nextChapter} aria-label="Chương tiếp theo"><ChevronsRight aria-hidden="true" /></button>
      </nav>

      {chapterList ? (
        <div className="reader-settings-backdrop" role="presentation" onClick={() => setChapterList(false)}>
          <aside className="reader-settings reader-chapter-sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-list-title" onClick={(event) => event.stopPropagation()}>
            <div className="reader-settings__title"><div><small>{chapters.length} chương</small><h2 id="chapter-list-title">Mục lục nhanh</h2></div><button type="button" onClick={() => setChapterList(false)} aria-label="Đóng danh sách chương"><X aria-hidden="true" /></button></div>
            <label className="reader-chapter-search"><Search aria-hidden="true" /><input value={chapterFilter} onChange={(event) => setChapterFilter(event.target.value)} placeholder="Tìm số chương (ví dụ: 15, 100)…" autoFocus /></label>
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
            <div className="reader-settings__title"><div><small>Chương {activeStreamChapter?.number ?? chapterName}</small><h2 id="reader-settings-title">Nhịp đọc</h2></div><button type="button" onClick={() => setSettings(false)} aria-label="Đóng cài đặt"><X aria-hidden="true" /></button></div>
            <div className="reader-settings__group"><span>Nền đọc</span><div className="segmented"><button type="button" data-active={theme === "dark"} onClick={() => setTheme("dark")}><Moon aria-hidden="true" />Đêm</button><button type="button" data-active={theme === "light"} onClick={() => setTheme("light")}><Sun aria-hidden="true" />Giấy</button></div></div>
            <div className="reader-settings__group"><span>Khoảng giữa trang</span><div className="segmented"><button type="button" data-active={gap === "none"} onClick={() => setGap("none")}>Liền</button><button type="button" data-active={gap === "soft"} onClick={() => setGap("soft")}>Vừa</button><button type="button" data-active={gap === "wide"} onClick={() => setGap("wide")}>Rộng</button></div></div>
            <button className="download-row" type="button" onClick={downloadChapter} disabled={download === "working"}>
              {download === "working" ? <LoaderCircle className="spin" aria-hidden="true" /> : download === "done" ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
              <span><strong>{download === "done" ? "Đã ghim offline" : download === "error" ? "Tải lại chương" : "Tải chương này"}</strong><small>{activePageCount} trang · cache trên thiết bị</small></span>
            </button>
            <p className="reader-privacy">Ảnh chỉ được lưu trên thiết bị này. Mực không sao chép chương lên máy chủ riêng.</p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
