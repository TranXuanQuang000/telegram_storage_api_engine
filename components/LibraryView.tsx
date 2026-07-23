"use client";

import Link from "next/link";
import { ArrowRight, BookMarked, Clock3, History, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { StoryCardData } from "../lib/catalog";
import { StoryCard } from "./StoryCard";

type Progress = { chapterId: string; chapterName: string; storySlug?: string; storyTitle?: string; coverUrl?: string; page: number; totalPages: number; updatedAt: string };

export function LibraryView() {
  const [stories, setStories] = useState<StoryCardData[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<Progress[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const ids = JSON.parse(localStorage.getItem("muc:library") ?? "[]") as string[];
        const records = JSON.parse(localStorage.getItem("muc:libraryRecords") ?? "[]") as StoryCardData[];
        const savedProgress = JSON.parse(localStorage.getItem("muc:last-progress") ?? "null") as Progress | null;
        const savedHistory = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Progress[];
        const response = await fetch("/api/catalog");
        const data = await response.json() as { items: StoryCardData[] };
        const catalogMatches = data.items.filter((item) => ids.includes(item.id));
        const merged = [...records.filter((item) => ids.includes(item.id)), ...catalogMatches].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
        if (active) { setSavedIds(ids); setHistory(savedHistory.length ? savedHistory : savedProgress ? [savedProgress] : []); setStories(merged); }
      } catch { /* show empty state */ }
      finally { if (active) setReady(true); }
    }
    load();
    return () => { active = false; };
  }, []);

  function clearHistory() {
    localStorage.removeItem("muc:last-progress");
    localStorage.removeItem("muc:history");
    setHistory([]);
  }

  function removeHistoryItem(chapterId: string) {
    const next = history.filter((item) => item.chapterId !== chapterId);
    localStorage.setItem("muc:history", JSON.stringify(next));
    if (history[0]?.chapterId === chapterId) {
      if (next[0]) localStorage.setItem("muc:last-progress", JSON.stringify(next[0])); else localStorage.removeItem("muc:last-progress");
    }
    setHistory(next);
  }

  return (
    <div className="library-content">
      <section className="library-stats">
        <div><BookMarked aria-hidden="true" /><strong>{savedIds.length}</strong><span>truyện trong tủ</span></div>
        <div><History aria-hidden="true" /><strong>{history.length}</strong><span>truyện gần đây</span></div>
        <div><Clock3 aria-hidden="true" /><strong>{history[0] ? Math.max(2, Math.ceil((history[0].totalPages - history[0].page) * .35)) : 0}</strong><span>phút còn lại</span></div>
      </section>

      {history.length ? (
        <section className="history-stack" aria-labelledby="history-title">
          <div className="history-stack__heading"><div><p className="section-kicker">Dấu mực gần đây</p><h2 id="history-title">Lịch sử đọc</h2></div><button type="button" onClick={clearHistory}><Trash2 aria-hidden="true" /> Xóa tất cả</button></div>
          {history.slice(0, 10).map((progress, index) => (
            <article className="history-row" key={`${progress.storySlug ?? progress.chapterId}-${index}`}>
              <div><h3>{progress.storyTitle || "Chương đang đọc"}</h3><p>Chương {progress.chapterName} · trang {progress.page + 1}/{progress.totalPages}</p></div>
              <div><Link className="button button--ink" href={`/read/${progress.chapterId}?story=${encodeURIComponent(progress.storySlug ?? "")}&title=${encodeURIComponent(progress.storyTitle ?? "")}&cover=${encodeURIComponent(progress.coverUrl ?? "")}`}>Đọc tiếp <ArrowRight aria-hidden="true" /></Link><button type="button" onClick={() => removeHistoryItem(progress.chapterId)}><Trash2 aria-hidden="true" /> Xóa</button></div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="library-shelf" aria-labelledby="library-title">
        <div className="section-heading"><div><p className="section-kicker">Tủ truyện</p><h2 id="library-title">Đang theo dõi</h2></div></div>
        {!ready ? <p className="loading-copy">Đang mở tủ truyện…</p> : stories.length ? <div className="story-grid">{stories.map((story) => <StoryCard key={story.id} story={story} />)}</div> : (
          <div className="empty-state"><span>0</span><h2>Tủ truyện còn trống.</h2><p>Mở một truyện rồi nhấn “Thêm vào tủ”. Truyện lưu trên thiết bị này; đăng nhập sẽ mở khóa đồng bộ.</p><Link className="button button--ink" href="/discover">Đi tìm mẻ đầu tiên <ArrowRight aria-hidden="true" /></Link></div>
        )}
      </section>
    </div>
  );
}
