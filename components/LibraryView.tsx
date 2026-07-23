"use client";

import Link from "next/link";
import { ArrowRight, BookMarked, Clock3, History, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { StoryCardData } from "../lib/catalog";
import { StoryCover } from "./StoryCover";
import { StoryPreviewLink } from "./StoryPreviewLink";

type Progress = {
  chapterId: string;
  chapterName: string;
  storySlug?: string;
  storyTitle?: string;
  coverUrl?: string | null;
  page: number;
  totalPages: number;
  updatedAt: string;
};

type LibraryEntry = {
  key: string;
  story: StoryCardData;
  progress: Progress | null;
  saved: boolean;
};

function storyFromProgress(progress: Progress): StoryCardData {
  const slug = progress.storySlug || progress.chapterId;
  return {
    id: `history:${slug}`,
    slug,
    title: progress.storyTitle || "Truyện đang đọc",
    originTitle: null,
    coverUrl: progress.coverUrl ?? null,
    status: "ongoing",
    contentRating: "safe",
    genres: [],
    genreSlugs: [],
    discoveryTags: [],
    latestChapter: progress.chapterName,
    latestChapterId: progress.chapterId,
    updatedAt: progress.updatedAt,
    score: null,
    scoreSource: null,
  };
}

export function LibraryView() {
  const [stories, setStories] = useState<StoryCardData[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<Progress[]>([]);
  const [view, setView] = useState<"all" | "reading" | "saved">("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const ids = JSON.parse(localStorage.getItem("muc:library") ?? "[]") as string[];
        const records = JSON.parse(localStorage.getItem("muc:libraryRecords") ?? "[]") as StoryCardData[];
        const savedProgress = JSON.parse(localStorage.getItem("muc:last-progress") ?? "null") as Progress | null;
        const savedHistory = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Progress[];
        const deviceStories = records.filter((item) => ids.includes(item.id));
        if (active) {
          setSavedIds(ids);
          setHistory(savedHistory.length ? savedHistory : savedProgress ? [savedProgress] : []);
          setStories(deviceStories);
          setReady(true);
        }
        const response = await fetch("/api/catalog?scanPages=1");
        const data = await response.json() as { items: StoryCardData[] };
        const catalogMatches = data.items.filter((item) => ids.includes(item.id));
        const merged = [...deviceStories, ...catalogMatches]
          .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
        if (active) setStories(merged);
      } catch {
        // Device storage and the public catalog are both best-effort.
      } finally {
        if (active) setReady(true);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const entries = useMemo(() => {
    const bySlug = new Map<string, LibraryEntry>();
    for (const story of stories) {
      bySlug.set(story.slug, { key: story.slug, story, progress: null, saved: true });
    }
    for (const progress of history) {
      const key = progress.storySlug || progress.chapterId;
      const existing = bySlug.get(key);
      if (existing) existing.progress = progress;
      else bySlug.set(key, { key, story: storyFromProgress(progress), progress, saved: false });
    }
    const ordered = [...bySlug.values()].sort((left, right) => {
      const leftTime = new Date(left.progress?.updatedAt ?? left.story.updatedAt).getTime();
      const rightTime = new Date(right.progress?.updatedAt ?? right.story.updatedAt).getTime();
      return rightTime - leftTime;
    });
    if (view === "reading") return ordered.filter((entry) => entry.progress);
    if (view === "saved") return ordered.filter((entry) => entry.saved);
    return ordered;
  }, [history, stories, view]);

  function clearHistory() {
    localStorage.removeItem("muc:last-progress");
    localStorage.removeItem("muc:history");
    setHistory([]);
  }

  function removeHistoryItem(progress: Progress) {
    const next = history.filter((item) => progress.storySlug
      ? item.storySlug !== progress.storySlug
      : item.chapterId !== progress.chapterId);
    localStorage.setItem("muc:history", JSON.stringify(next));
    if (next[0]) localStorage.setItem("muc:last-progress", JSON.stringify(next[0]));
    else localStorage.removeItem("muc:last-progress");
    setHistory(next);
  }

  return (
    <div className="library-content">
      <section className="library-stats" aria-label="Tổng quan tủ truyện">
        <div><BookMarked aria-hidden="true" /><strong>{savedIds.length}</strong><span>truyện trong tủ</span></div>
        <div><History aria-hidden="true" /><strong>{history.length}</strong><span>truyện đã đọc</span></div>
        <div><Clock3 aria-hidden="true" /><strong>{history[0] ? Math.max(2, Math.ceil((history[0].totalPages - history[0].page) * .35)) : 0}</strong><span>phút còn lại</span></div>
      </section>

      <section className="library-shelf" aria-labelledby="library-title">
        <div className="library-shelf__heading">
          <div>
            <p className="section-kicker">Bìa sách của bạn</p>
            <h2 id="library-title">Tủ truyện & lịch sử đọc</h2>
            <p>Truyện đã lưu và truyện vừa đọc nằm chung một nơi; tiến độ luôn hiện ngay dưới bìa.</p>
          </div>
          {history.length ? <button type="button" onClick={clearHistory}><Trash2 aria-hidden="true" /> Xóa toàn bộ lịch sử</button> : null}
        </div>

        <div className="library-tabs" role="tablist" aria-label="Lọc tủ truyện">
          <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")}>Tất cả <span>{new Set([...stories.map((story) => story.slug), ...history.map((item) => item.storySlug || item.chapterId)]).size}</span></button>
          <button type="button" role="tab" aria-selected={view === "reading"} onClick={() => setView("reading")}>Đang đọc <span>{history.length}</span></button>
          <button type="button" role="tab" aria-selected={view === "saved"} onClick={() => setView("saved")}>Đã lưu <span>{savedIds.length}</span></button>
        </div>

        {!ready ? <p className="loading-copy">Đang mở tủ truyện…</p> : entries.length ? (
          <div className="library-cover-grid">
            {entries.map(({ key, story, progress, saved }) => {
              const percent = progress ? Math.round(((progress.page + 1) / Math.max(progress.totalPages, 1)) * 100) : 0;
              const readHref = progress
                ? `/read/${progress.chapterId}?story=${encodeURIComponent(progress.storySlug ?? story.slug)}&title=${encodeURIComponent(progress.storyTitle ?? story.title)}&cover=${encodeURIComponent(progress.coverUrl ?? story.coverUrl ?? "")}`
                : null;
              return (
                <article className="library-story-card" key={key}>
                  <StoryPreviewLink className="library-story-card__cover" story={story}>
                    <StoryCover src={story.coverUrl} title={story.title} />
                    <span className="library-story-card__badges">
                      {saved ? <small>Trong tủ</small> : null}
                      {progress ? <small>Đang đọc</small> : null}
                    </span>
                  </StoryPreviewLink>
                  <div className="library-story-card__body">
                    <h3><StoryPreviewLink story={story}>{story.title}</StoryPreviewLink></h3>
                    {progress ? (
                      <>
                        <div className="library-progress" aria-label={`Đã đọc ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
                        <p>Đã đọc đến Chương {progress.chapterName} · trang {progress.page + 1}/{progress.totalPages}</p>
                      </>
                    ) : <p>Đã lưu vào tủ · chưa có tiến độ đọc</p>}
                    <div className="library-story-card__actions">
                      {readHref ? <Link className="button button--ink" href={readHref}>Đọc tiếp <ArrowRight aria-hidden="true" /></Link> : <StoryPreviewLink className="button button--paper" story={story}>Mở truyện <ArrowRight aria-hidden="true" /></StoryPreviewLink>}
                      {progress ? <button type="button" onClick={() => removeHistoryItem(progress)} aria-label={`Xóa ${story.title} khỏi lịch sử`}><Trash2 aria-hidden="true" /> Xóa lịch sử</button> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span>0</span>
            <h2>Chưa có truyện trong mục này.</h2>
            <p>Mở một truyện để đọc hoặc nhấn “Thêm vào tủ”; bìa và tiến độ sẽ tự xuất hiện ở đây.</p>
            <Link className="button button--ink" href="/discover">Đi tìm truyện đầu tiên <ArrowRight aria-hidden="true" /></Link>
          </div>
        )}
      </section>
    </div>
  );
}
