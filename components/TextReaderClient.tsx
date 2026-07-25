"use client";

import Link from "next/link";
import { AlignJustify, ArrowLeft, Check, ChevronLeft, ChevronRight, Columns3, Download, LoaderCircle, Moon, Settings2, Sun, Type, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NovelChapter } from "../lib/novels";
import { queueProgress, saveNovelChapterOffline } from "../lib/offline-store";

type ReaderSettings = {
  theme: "oled" | "dark" | "sepia" | "light";
  font: "serif" | "sans";
  size: number;
  lineHeight: number;
  width: number;
  spacing: number;
  align: "left" | "justify";
  mode: "scroll" | "paged";
};

const defaults: ReaderSettings = {
  theme: "dark",
  font: "serif",
  size: 20,
  lineHeight: 1.85,
  width: 760,
  spacing: 1.15,
  align: "justify",
  mode: "scroll",
};

type StreamTextChapter = {
  id: string;
  label: string;
  paragraphs: string[];
  sourceUrl: string;
  sourceName: string;
};

export function TextReaderClient({
  slug,
  title,
  author,
  chapterId,
  chapterLabel,
  paragraphs,
  chapters,
  sourceUrl,
  sourceName,
}: {
  slug: string;
  title: string;
  author: string;
  chapterId: string;
  chapterLabel: string;
  paragraphs: string[];
  chapters: NovelChapter[];
  sourceUrl: string;
  sourceName: string;
}) {
  const [settings, setSettings] = useState(defaults);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [download, setDownload] = useState<"idle" | "working" | "done" | "error">("idle");
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [stream, setStream] = useState<StreamTextChapter[]>([{
    id: chapterId,
    label: chapterLabel,
    paragraphs,
    sourceUrl,
    sourceName,
  }]);
  const [activeChapterId, setActiveChapterId] = useState(chapterId);
  const [streamLoad, setStreamLoad] = useState<"idle" | "loading" | "ready" | "end" | "error">("idle");
  const paragraphRefs = useRef(new Map<string, HTMLParagraphElement>());
  const streamRef = useRef(stream);
  const loadingChapterRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const settingsHydrated = useRef(false);
  const activeChapter = stream.find((chapter) => chapter.id === activeChapterId) ?? stream[0];
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId);
  const previous = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const next = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;
  const activeParagraphCount = activeChapter?.paragraphs.length ?? paragraphs.length;
  const percent = useMemo(
    () => Math.round(((currentParagraph + 1) / Math.max(1, activeParagraphCount)) * 100),
    [activeParagraphCount, currentParagraph],
  );

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = JSON.parse(localStorage.getItem("muc:text-reader-settings") ?? "{}") as Partial<ReaderSettings>;
        setSettings({ ...defaults, ...stored });
        const progress = JSON.parse(localStorage.getItem("muc:novel-progress") ?? "{}") as Record<string, { paragraph: number }>;
        const target = Math.min(paragraphs.length - 1, Math.max(0, progress[chapterId]?.paragraph ?? 0));
        setCurrentParagraph(target);
        settingsHydrated.current = true;
        window.setTimeout(() => paragraphRefs.current.get(`${chapterId}:${target}`)?.scrollIntoView({ block: "start" }), 120);
      } catch {
        settingsHydrated.current = true;
        // Defaults remain usable when storage is unavailable.
      }
    });
  }, [chapterId, paragraphs.length]);

  useEffect(() => {
    if (!settingsHydrated.current) return;
    try {
      localStorage.setItem("muc:text-reader-settings", JSON.stringify(settings));
    } catch {
      // Settings persistence is optional.
    }
  }, [settings]);

  const loadNextIntoStream = useCallback(async (afterChapterId: string) => {
    const tail = streamRef.current.at(-1);
    if (!tail || tail.id !== afterChapterId) return;
    const index = chapters.findIndex((chapter) => chapter.id === afterChapterId);
    const candidate = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null;
    if (!candidate) {
      setStreamLoad("end");
      return;
    }
    if (streamRef.current.some((chapter) => chapter.id === candidate.id) || loadingChapterRef.current === candidate.id) return;
    loadingChapterRef.current = candidate.id;
    setStreamLoad("loading");
    try {
      const response = await fetch(`/api/source-content/wikisource/${encodeURIComponent(candidate.id)}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`NOVEL_NEXT_${response.status}`);
      const payload = await response.json() as {
        chapterId?: string;
        chapterName?: string;
        paragraphs?: string[];
        sourceUrl?: string;
        attribution?: string;
      };
      const nextParagraphs = payload.paragraphs?.filter(Boolean) ?? [];
      if (!nextParagraphs.length) throw new Error("NOVEL_NEXT_EMPTY");
      const loaded = {
        id: candidate.id,
        label: payload.chapterName || candidate.label,
        paragraphs: nextParagraphs,
        sourceUrl: payload.sourceUrl || "",
        sourceName: payload.attribution || sourceName,
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
  }, [chapters, sourceName]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNextIntoStream(chapterId), 80);
    return () => window.clearTimeout(timer);
  }, [chapterId, loadNextIntoStream]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = Number((visible.target as HTMLElement).dataset.paragraph ?? 0);
      const visibleChapterId = (visible.target as HTMLElement).dataset.chapterId || chapterId;
      const visibleChapter = stream.find((chapter) => chapter.id === visibleChapterId) ?? stream[0];
      if (!visibleChapter) return;
      const visibleLabel = visibleChapter.label;
      const total = visibleChapter.paragraphs.length;
      setActiveChapterId((current) => current === visibleChapterId ? current : visibleChapterId);
      setCurrentParagraph(index);
      try {
        const updatedAt = new Date().toISOString();
        const record = { medium: "novel", storySlug: slug, slug, title, storyTitle: title, chapterId: visibleChapterId, chapterName: visibleLabel, chapterLabel: visibleLabel, page: index, paragraph: index, totalPages: total, total, coverUrl: null, updatedAt };
        const all = JSON.parse(localStorage.getItem("muc:novel-progress") ?? "{}") as Record<string, unknown>;
        all[visibleChapterId] = record;
        localStorage.setItem("muc:novel-progress", JSON.stringify(all));
        localStorage.setItem("muc:last-progress", JSON.stringify(record));
        const history = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Array<{ storySlug?: string }>;
        localStorage.setItem("muc:history", JSON.stringify([record, ...history.filter((item) => item.storySlug !== slug)].slice(0, 50)));
      } catch {
        // Device progress remains best effort.
      }
      void queueProgress({
        storyId: slug,
        chapterId: visibleChapterId,
        chapterName: visibleLabel,
        page: index,
        totalPages: total,
        progress: (index + 1) / Math.max(1, total),
        storyTitle: title,
        coverUrl: null,
        medium: "novel",
        locator: JSON.stringify({ paragraphIndex: index }),
        idempotencyKey: `novel:${visibleChapterId}:${index}`,
      });
      if (visibleChapterId !== chapterId) {
        const nextUrl = `/novels/read/${visibleChapterId}`;
        if (`${location.pathname}${location.search}` !== nextUrl) history.replaceState(history.state, "", nextUrl);
      }
      if (streamRef.current.at(-1)?.id === visibleChapterId && index >= Math.max(1, Math.floor(total * .45))) {
        void loadNextIntoStream(visibleChapterId);
      }
    }, { rootMargin: "-20% 0px -60% 0px", threshold: [0, .5] });
    paragraphRefs.current.forEach((paragraph) => observer.observe(paragraph));
    return () => observer.disconnect();
  }, [chapterId, loadNextIntoStream, slug, stream, title]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
      if (settingsOpen || settings.mode !== "paged") return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        bodyRef.current?.scrollBy({ left: window.innerWidth * .88, behavior: "smooth" });
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        bodyRef.current?.scrollBy({ left: -window.innerWidth * .88, behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.mode, settingsOpen]);

  async function downloadChapter() {
    setDownload("working");
    try {
      const target = activeChapter ?? stream[0];
      await saveNovelChapterOffline({
        storyId: slug,
        slug,
        title,
        author,
        chapterId: target.id,
        chapterLabel: target.label,
        paragraphs: target.paragraphs,
        sourceUrl: target.sourceUrl,
      });
      setDownload("done");
    } catch {
      setDownload("error");
    }
  }

  function update<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  const style = {
    "--novel-font-size": `${settings.size}px`,
    "--novel-line-height": String(settings.lineHeight),
    "--novel-width": `${settings.width}px`,
    "--novel-spacing": `${settings.spacing}em`,
  } as React.CSSProperties;

  return (
    <div className={`novel-reader novel-reader--${settings.theme} novel-reader--${settings.mode} novel-reader--${settings.font}`} style={style}>
      <header className="novel-reader__chrome">
        <Link href={`/novels/${slug}`} aria-label="Về trang truyện"><ArrowLeft aria-hidden="true" /></Link>
        <div><small>{title}</small><strong>{activeChapter?.label ?? chapterLabel}</strong></div>
        <span>{percent}%</span>
        <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt đọc chữ"><Settings2 aria-hidden="true" /></button>
      </header>
      <main ref={bodyRef} className={`novel-reader__body novel-reader__body--${settings.align}`}>
        <div className="novel-reader__source">MỰC CHỮ · {(activeChapter?.sourceName || sourceName).toUpperCase()}</div>
        {stream.map((loadedChapter, chapterPosition) => (
          <section className="novel-reader__chapter" key={loadedChapter.id} data-novel-stream-chapter={loadedChapter.id}>
            {chapterPosition > 0 ? <div className="novel-reader__boundary">PHẦN TIẾP THEO · ĐÃ TẢI SẴN</div> : null}
            <h1>{loadedChapter.label}</h1>
            {loadedChapter.paragraphs.map((paragraph, index) => (
              <p
                key={`${loadedChapter.id}:${index}:${paragraph.slice(0, 24)}`}
                data-paragraph={index}
                data-chapter-id={loadedChapter.id}
                ref={(node) => {
                  const key = `${loadedChapter.id}:${index}`;
                  if (node) paragraphRefs.current.set(key, node);
                  else paragraphRefs.current.delete(key);
                }}
              >
                {paragraph}
              </p>
            ))}
            <footer>
              {loadedChapter.sourceUrl ? <a href={loadedChapter.sourceUrl} target="_blank" rel="noreferrer">Xem bản nguồn tại {loadedChapter.sourceName}</a> : <span>Nguồn: {loadedChapter.sourceName}</span>}
            </footer>
          </section>
        ))}
        {streamLoad === "loading" ? <div className="novel-reader__loading"><LoaderCircle className="spin" aria-hidden="true" />Đang tải trước toàn bộ phần tiếp theo…</div> : null}
        {streamLoad === "error" ? (
          <div className="novel-reader__loading novel-reader__loading--error">
            <span>Chưa tải được phần kế tiếp.</span>
            <button type="button" onClick={() => void loadNextIntoStream(streamRef.current.at(-1)?.id ?? chapterId)}>Thử lại</button>
          </div>
        ) : null}
      </main>
      <nav className="novel-reader__nav">
        {previous ? <Link href={`/novels/read/${previous.id}`}><ChevronLeft aria-hidden="true" />{previous.label}</Link> : <span />}
        <strong>{currentParagraph + 1} / {activeParagraphCount}</strong>
        {next ? <Link href={`/novels/read/${next.id}`}>{next.label}<ChevronRight aria-hidden="true" /></Link> : <span />}
      </nav>
      {settingsOpen ? (
        <div className="reader-settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <aside className="reader-settings novel-settings" role="dialog" aria-modal="true" aria-labelledby="novel-settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="reader-settings__title"><div><small>MỰC CHỮ</small><h2 id="novel-settings-title">Cài đặt trang chữ</h2></div><button type="button" onClick={() => setSettingsOpen(false)}><X aria-hidden="true" /></button></div>
            <div className="reader-settings__group"><span>Nền đọc</span><div className="segmented">
              {(["oled", "dark", "sepia", "light"] as const).map((theme) => <button key={theme} type="button" data-active={settings.theme === theme} onClick={() => update("theme", theme)}>{theme === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}{theme.toUpperCase()}</button>)}
            </div></div>
            <div className="reader-settings__group"><span>Kiểu chữ</span><div className="segmented"><button type="button" data-active={settings.font === "serif"} onClick={() => update("font", "serif")}><Type aria-hidden="true" />Serif</button><button type="button" data-active={settings.font === "sans"} onClick={() => update("font", "sans")}><Type aria-hidden="true" />Sans</button></div></div>
            <label className="novel-range"><span>Cỡ chữ <strong>{settings.size}px</strong></span><input type="range" min="15" max="30" value={settings.size} onChange={(event) => update("size", Number(event.target.value))} /></label>
            <label className="novel-range"><span>Giãn dòng <strong>{settings.lineHeight.toFixed(2)}</strong></span><input type="range" min="1.35" max="2.3" step=".05" value={settings.lineHeight} onChange={(event) => update("lineHeight", Number(event.target.value))} /></label>
            <label className="novel-range"><span>Độ rộng dòng <strong>{settings.width}px</strong></span><input type="range" min="520" max="980" step="20" value={settings.width} onChange={(event) => update("width", Number(event.target.value))} /></label>
            <label className="novel-range"><span>Khoảng đoạn <strong>{settings.spacing.toFixed(1)}em</strong></span><input type="range" min=".5" max="2.2" step=".1" value={settings.spacing} onChange={(event) => update("spacing", Number(event.target.value))} /></label>
            <div className="reader-settings__group"><span>Căn chữ</span><div className="segmented"><button type="button" data-active={settings.align === "left"} onClick={() => update("align", "left")}><AlignJustify aria-hidden="true" />Trái</button><button type="button" data-active={settings.align === "justify"} onClick={() => update("align", "justify")}><AlignJustify aria-hidden="true" />Đều</button></div></div>
            <div className="reader-settings__group"><span>Chế độ</span><div className="segmented"><button type="button" data-active={settings.mode === "scroll"} onClick={() => update("mode", "scroll")}><AlignJustify aria-hidden="true" />Cuộn</button><button type="button" data-active={settings.mode === "paged"} onClick={() => update("mode", "paged")}><Columns3 aria-hidden="true" />Theo trang</button></div></div>
            <button className="download-row" type="button" onClick={downloadChapter} disabled={download === "working"}>
              {download === "done" ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
              <span><strong>{download === "done" ? "Đã ghim phần này" : download === "error" ? "Tải lại phần này" : download === "working" ? "Đang lưu văn bản…" : "Tải phần này offline"}</strong><small>{activeParagraphCount} đoạn · chỉ lưu trên thiết bị</small></span>
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
