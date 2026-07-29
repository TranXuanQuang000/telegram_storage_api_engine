"use client";

import Link from "next/link";
import { BookOpen, Bookmark, Check, Download, LoaderCircle, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  preloadChapterPages,
  recommendedChapterPreloadConcurrency,
  saveChapterOffline,
} from "../lib/offline-store";
import type { StoryCardData } from "../lib/catalog";

export type StoryChapterItem = {
  id: string;
  number: string;
  title?: string;
};

export function StoryActions({
  story,
  chapterId,
  chapters = [],
}: {
  story: StoryCardData;
  chapterId: string | null;
  chapters?: StoryChapterItem[];
}) {
  const storyId = story.id || story.slug;
  const [saved, setSaved] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [continueHref, setContinueHref] = useState<string | null>(null);
  const [continueLabel, setContinueLabel] = useState("Đọc tiếp");
  const [batchState, setBatchState] = useState<{
    status: "idle" | "working" | "done" | "error" | "cancelled";
    current: number;
    total: number;
    chapterName: string;
  }>({ status: "idle", current: 0, total: 0, chapterName: "" });

  const cancelBatchRef = useRef(false);
  const warmedChaptersRef = useRef(new Set<string>());

  const warmChapter = useCallback(async (targetChapterId: string) => {
    if (!targetChapterId || warmedChaptersRef.current.has(targetChapterId)) return;
    warmedChaptersRef.current.add(targetChapterId);
    try {
      const response = await fetch(
        `/api/download-manifest/${encodeURIComponent(targetChapterId)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`WARM_CHAPTER_${response.status}`);
      const manifest = await response.json() as { pages?: string[] };
      const pages = manifest.pages?.filter(Boolean) ?? [];
      if (!pages.length) throw new Error("WARM_CHAPTER_EMPTY");
      await preloadChapterPages(pages, {
        concurrency: Math.min(6, recommendedChapterPreloadConcurrency()),
      });
    } catch {
      warmedChaptersRef.current.delete(targetChapterId);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const history = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Array<{
          storySlug?: string;
          chapterId?: string;
          chapterName?: string;
          page?: number;
        }>;
        const latest = history.find((item) => item.storySlug === story.slug && item.chapterId);
        if (latest?.chapterId) {
          const page = Math.max(0, Number(latest.page) || 0);
          setContinueHref(`/read/${latest.chapterId}?story=${encodeURIComponent(story.slug)}&page=${page}`);
          setContinueLabel(`Đọc tiếp Ch. ${latest.chapterName ?? "mới"} · trang ${page + 1}`);
        } else if (chapterId) {
          setContinueHref(`/read/${chapterId}?story=${encodeURIComponent(story.slug)}`);
          setContinueLabel(`Đọc chương ${story.latestChapter ?? "mới"}`);
        }
      } catch {
        if (chapterId) setContinueHref(`/read/${chapterId}?story=${encodeURIComponent(story.slug)}`);
      }
    });
  }, [chapterId, story.latestChapter, story.slug]);

  useEffect(() => {
    if (!continueHref) return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (
      connection?.saveData
      || connection?.effectiveType === "slow-2g"
      || connection?.effectiveType === "2g"
    ) return;
    const match = continueHref.match(/^\/read\/([^?]+)/);
    if (!match?.[1]) return;
    const targetChapterId = decodeURIComponent(match[1]);
    const handle = window.setTimeout(() => {
      void warmChapter(targetChapterId);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [continueHref, warmChapter]);

  // Lấy trực tiếp trạng thái Tủ truyện từ Tài khoản Server D1
  useEffect(() => {
    let active = true;
    fetch("/api/library")
      .then(async (res) => (res.ok
        ? await res.json() as { items?: Array<{ story: { id: string; slug: string } }> }
        : null))
      .then((data) => {
        if (!active || !data?.items) {
          setLoadingSaved(false);
          return;
        }
        const isSavedOnServer = data.items.some(
          (item: { story: { id: string; slug: string } }) =>
            item.story.id === storyId || item.story.slug === story.slug || item.story.id === story.slug
        );
        setSaved(isSavedOnServer);
        setLoadingSaved(false);
      })
      .catch(() => {
        if (active) setLoadingSaved(false);
      });
    return () => {
      active = false;
    };
  }, [storyId, story.slug]);

  // Lưu hoặc xóa trực tiếp trên Tài khoản Server D1
  async function toggleSaved() {
    const nextSaved = !saved;
    setSaved(nextSaved);

    try {
      const res = await fetch(nextSaved ? "/api/library" : `/api/library?storyId=${encodeURIComponent(storyId)}`, {
        method: nextSaved ? "PUT" : "DELETE",
        headers: nextSaved ? { "Content-Type": "application/json" } : undefined,
        body: nextSaved
          ? JSON.stringify({
              storyId,
              slug: story.slug,
              title: story.title,
              coverUrl: story.coverUrl,
              status: "reading",
              followed: true,
            })
          : undefined,
      });

      if (!res.ok) {
        setSaved(!nextSaved);
        if (res.status === 401) {
          if (confirm("Bạn cần đăng nhập tài khoản để lưu truyện vào tủ. Chuyển đến trang Đăng nhập ngay?")) {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
          }
        } else {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          alert(`Không thể ${nextSaved ? "thêm" : "xóa"} tủ truyện: ${errData.error || "Lỗi server"}`);
        }
      }
    } catch {
      setSaved(!nextSaved);
      alert("Lỗi kết nối mạng khi cập nhật tủ truyện.");
    }
  }

  async function downloadAllChapters() {
    if (!chapters.length || !("caches" in window)) return;
    cancelBatchRef.current = false;
    setBatchState({ status: "working", current: 0, total: chapters.length, chapterName: "Chuẩn bị..." });

    let successCount = 0;

    for (let i = 0; i < chapters.length; i++) {
      if (cancelBatchRef.current) {
        setBatchState((prev) => ({ ...prev, status: "cancelled" }));
        return;
      }

      const ch = chapters[i];
      setBatchState({
        status: "working",
        current: i + 1,
        total: chapters.length,
        chapterName: ch.number ? `Chương ${ch.number}` : ch.title || `Tập ${i + 1}`,
      });

      try {
        const response = await fetch(`/api/download-manifest/${ch.id}`);
        if (response.ok) {
          const manifest = (await response.json()) as { pages: string[]; estimatedBytes: number; version?: string };
          await saveChapterOffline({
            storyId: story.slug,
            title: story.title,
            coverUrl: story.coverUrl,
            chapterId: ch.id,
            chapterName: ch.number || `${i + 1}`,
            pages: manifest.pages.length,
            pageUrls: manifest.pages,
            estimatedBytes: manifest.estimatedBytes,
            manifestVersion: manifest.version ?? `manga-api-${ch.id}-${manifest.pages.length}`,
          });
          successCount++;
        }
      } catch {
        /* Bỏ qua lỗi từng chương, tiếp tục chương tiếp theo */
      }
    }

    if (cancelBatchRef.current) {
      setBatchState((prev) => ({ ...prev, status: "cancelled" }));
    } else {
      setBatchState({
        status: successCount > 0 ? "done" : "error",
        current: successCount,
        total: chapters.length,
        chapterName: successCount > 0 ? `Đã tải ${successCount}/${chapters.length} chương` : "Lỗi khi tải",
      });
    }
  }

  function cancelBatchDownload() {
    cancelBatchRef.current = true;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={`button ${saved ? "button--cyan" : "button--paper"}`}
          type="button"
          onClick={toggleSaved}
          disabled={loadingSaved}
        >
          {loadingSaved ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : saved ? (
            <Check aria-hidden="true" />
          ) : (
            <Bookmark aria-hidden="true" />
          )}
          {saved ? "Đã lưu vào tủ" : "Thêm vào tủ"}
        </button>

        {continueHref ? (
          <Link
            className="button button--paper"
            href={continueHref}
            onMouseEnter={() => {
              const match = continueHref.match(/^\/read\/([^?]+)/);
              if (match?.[1]) void warmChapter(decodeURIComponent(match[1]));
            }}
            onFocus={() => {
              const match = continueHref.match(/^\/read\/([^?]+)/);
              if (match?.[1]) void warmChapter(decodeURIComponent(match[1]));
            }}
            onTouchStart={() => {
              const match = continueHref.match(/^\/read\/([^?]+)/);
              if (match?.[1]) void warmChapter(decodeURIComponent(match[1]));
            }}
          >
            <BookOpen aria-hidden="true" />{continueLabel}
          </Link>
        ) : null}

        {chapters.length > 0 ? (
          <button
            className="button button--paper"
            type="button"
            onClick={downloadAllChapters}
            disabled={batchState.status === "working"}
          >
            {batchState.status === "working" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Tải toàn bộ ({chapters.length} chương)
          </button>
        ) : null}
      </div>

      {/* Thanh tiến trình tải toàn bộ */}
      {batchState.status !== "idle" ? (
        <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-700/80 text-xs flex flex-col gap-1.5 mt-1">
          <div className="flex justify-between items-center text-slate-300">
            <span className="font-medium text-cyan-400">
              {batchState.status === "working"
                ? `Đang tải ${batchState.current}/${batchState.total} (${batchState.chapterName})...`
                : batchState.status === "done"
                ? `✅ ${batchState.chapterName}`
                : batchState.status === "cancelled"
                ? "⏹️ Đã hủy tải xuống"
                : "❌ Có lỗi xảy ra khi tải"}
            </span>
            {batchState.status === "working" ? (
              <button
                type="button"
                onClick={cancelBatchDownload}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 font-medium px-2 py-0.5 rounded bg-red-950/40 border border-red-800/40"
              >
                <XCircle size={14} /> Hủy tải
              </button>
            ) : null}
          </div>
          {batchState.status === "working" ? (
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-cyan-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.round((batchState.current / batchState.total) * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
