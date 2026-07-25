"use client";

import Link from "next/link";
import { ArrowRight, BookMarked, Clock3, History, LogIn, Trash2, UserPlus } from "lucide-react";
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
  medium?: "comic" | "novel";
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
    medium: progress.medium ?? "comic",
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
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadFromAccount() {
      setReady(false);
      try {
        const localHistory = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Progress[];
        if (active) setHistory(localHistory);
        const [libRes, progRes] = await Promise.all([
          fetch("/api/library"),
          fetch("/api/progress"),
        ]);
        if (libRes.status === 401) {
          if (active) {
            setUnauthenticated(true);
          }
        } else if (libRes.ok) {
          const libData = (await libRes.json()) as {
            items: Array<{
              story: { id: string; slug: string; title: string; coverUrl: string | null; status?: string; latestChapter?: string; latestChapterId?: string; medium?: "comic" | "novel" };
              status: string;
              followed: boolean;
            }>;
          };

          if (libData.items && active) {
            const serverStoryIds = libData.items.map((item) => item.story.id);
            const serverStories: StoryCardData[] = libData.items.map((item) => ({
              id: item.story.id,
              medium: item.story.medium ?? "comic",
              slug: item.story.slug,
              title: item.story.title,
              originTitle: null,
              coverUrl: item.story.coverUrl ?? null,
              status: item.story.status === "completed" || item.story.status === "hiatus" || item.story.status === "cancelled"
                ? item.story.status
                : "ongoing",
              contentRating: "safe",
              genres: [],
              genreSlugs: [],
              discoveryTags: [],
              latestChapter: item.story.latestChapter ?? "1",
              latestChapterId: item.story.latestChapterId ?? "",
              updatedAt: new Date().toISOString(),
              score: null,
              scoreSource: null,
            }));

            setSavedIds(serverStoryIds);
            setStories(serverStories);
          }
        }

        if (progRes.ok) {
          const progData = (await progRes.json()) as { items: Progress[] };
          if (progData.items && active) {
            const merged = [...progData.items, ...localHistory]
              .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
              .filter((item, index, all) => index === all.findIndex((candidate) =>
                (candidate.storySlug || candidate.chapterId) === (item.storySlug || item.chapterId)
              ));
            setHistory(merged);
          }
        }
      } catch {
        /* Bỏ qua lỗi kết nối */
      } finally {
        if (active) setReady(true);
      }
    }

    loadFromAccount();
    return () => {
      active = false;
    };
  }, []);

  function removeHistory(progress: Progress) {
    const key = progress.storySlug || progress.chapterId;
    const next = history.filter((item) => (item.storySlug || item.chapterId) !== key);
    setHistory(next);
    try {
      const local = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Progress[];
      localStorage.setItem("muc:history", JSON.stringify(local.filter((item) => (item.storySlug || item.chapterId) !== key)));
    } catch {
      // Device history removal remains best effort.
    }
  }

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

  return (
    <div className="library-content">
      {unauthenticated ? (
        <aside className="library-sync-notice">
          <BookMarked aria-hidden="true" />
          <div><strong>Lịch sử trên máy vẫn dùng được.</strong><span>Đăng nhập để đồng bộ tủ và tiến độ giữa nhiều thiết bị.</span></div>
          <Link href="/login"><LogIn aria-hidden="true" /> Đăng nhập</Link>
          <Link href="/register"><UserPlus aria-hidden="true" /> Đăng ký</Link>
        </aside>
      ) : null}
      <section className="library-stats" aria-label="Tổng quan tủ truyện">
        <div><BookMarked aria-hidden="true" /><strong>{savedIds.length}</strong><span>truyện trong tủ</span></div>
        <div><History aria-hidden="true" /><strong>{history.length}</strong><span>truyện đã đọc</span></div>
        <div><Clock3 aria-hidden="true" /><strong>{history[0] ? Math.max(2, Math.ceil((history[0].totalPages - history[0].page) * 0.35)) : 0}</strong><span>phút còn lại</span></div>
      </section>

      <section className="library-shelf" aria-labelledby="library-title">
        <div className="library-shelf__heading">
          <div>
            <p className="section-kicker">USER ACCOUNT VAULT / LIVE SYNC</p>
            <h2 id="library-title">Tủ truyện tài khoản.</h2>
            <p>Dữ liệu được lưu trực tiếp trên Tài khoản Server Cloudflare D1 và đồng bộ tự động 100% giữa mọi thiết bị.</p>
          </div>
        </div>

        <div className="library-tabs" role="tablist" aria-label="Lọc tủ truyện">
          <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")}>Tất cả <span>{new Set([...stories.map((story) => story.slug), ...history.map((item) => item.storySlug || item.chapterId)]).size}</span></button>
          <button type="button" role="tab" aria-selected={view === "reading"} onClick={() => setView("reading")}>Đang đọc <span>{history.length}</span></button>
          <button type="button" role="tab" aria-selected={view === "saved"} onClick={() => setView("saved")}>Đã lưu <span>{savedIds.length}</span></button>
        </div>

        {!ready ? <p className="loading-copy">Đang kết nối tủ truyện tài khoản…</p> : entries.length ? (
          <div className="library-cover-grid">
            {entries.map(({ key, story, progress, saved }) => {
              const percent = progress ? Math.round(((progress.page + 1) / Math.max(progress.totalPages, 1)) * 100) : 0;
              const medium = progress?.medium ?? story.medium ?? "comic";
              const readHref = progress
                ? medium === "novel"
                  ? `/novels/read/${progress.chapterId}`
                  : `/read/${progress.chapterId}?story=${encodeURIComponent(progress.storySlug ?? story.slug)}&title=${encodeURIComponent(progress.storyTitle ?? story.title)}&cover=${encodeURIComponent(progress.coverUrl ?? story.coverUrl ?? "")}`
                : null;
              const detailHref = medium === "novel" ? `/novels/${story.slug}` : `/story/${story.slug}`;
              return (
                <article className="library-story-card" key={key}>
                  <StoryPreviewLink className="library-story-card__cover" story={story} href={detailHref}>
                    <StoryCover src={story.coverUrl} title={story.title} />
                    <span className="library-story-card__badges">
                      {saved ? <small>Trong tủ</small> : null}
                      {progress ? <small>Đang đọc</small> : null}
                    </span>
                  </StoryPreviewLink>
                  <div className="library-story-card__body">
                    <h3><StoryPreviewLink story={story} href={detailHref}>{story.title}</StoryPreviewLink></h3>
                    {progress ? (
                      <>
                        <div className="library-progress" aria-label={`Đã đọc ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
                        <p>{medium === "novel"
                          ? `Đã đọc đến ${progress.chapterName} · đoạn ${progress.page + 1}/${progress.totalPages}`
                          : `Đã đọc đến Chương ${progress.chapterName} · trang ${progress.page + 1}/${progress.totalPages}`}</p>
                      </>
                    ) : <p>Đã lưu vào tủ · chưa có tiến độ đọc</p>}
                    <div className="library-story-card__actions">
                      {readHref ? <Link className="button button--ink" href={readHref}>Đọc tiếp <ArrowRight aria-hidden="true" /></Link> : <StoryPreviewLink className="button button--paper" story={story} href={detailHref}>Mở truyện <ArrowRight aria-hidden="true" /></StoryPreviewLink>}
                      {progress ? <button type="button" onClick={() => removeHistory(progress)} aria-label={`Xóa ${story.title} khỏi lịch sử`}><Trash2 aria-hidden="true" /> Xóa lịch sử</button> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span>0</span>
            <h2>Tủ truyện tài khoản hiện đang trống.</h2>
            <p>Mở một bộ truyện bất kỳ và nhấn “Thêm vào tủ”; bộ truyện sẽ được lưu vào tài khoản của bạn và xuất hiện trên mọi thiết bị.</p>
            <Link className="button button--ink" href="/discover">Đi tìm truyện đầu tiên <ArrowRight aria-hidden="true" /></Link>
          </div>
        )}
      </section>
    </div>
  );
}
