"use client";

import Link from "next/link";
import { BookOpen, Bookmark, Check, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { NovelSummary } from "../lib/novels";

export function NovelActions({ novel }: { novel: NovelSummary }) {
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [continueChapter, setContinueChapter] = useState<{ id: string; label: string; paragraph: number } | null>(null);
  const storyId = novel.id ?? `novel_${novel.slug}`;

  useEffect(() => {
    try {
      const progress = Object.values(JSON.parse(localStorage.getItem("muc:novel-progress") ?? "{}") as Record<string, {
        slug?: string;
        chapterId?: string;
        chapterLabel?: string;
        paragraph?: number;
        updatedAt?: string;
      }>)
        .filter((item) => item.slug === novel.slug && item.chapterId)
        .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime())[0];
      if (progress?.chapterId) {
        queueMicrotask(() => setContinueChapter({ id: progress.chapterId!, label: progress.chapterLabel ?? "đang đọc", paragraph: progress.paragraph ?? 0 }));
      }
    } catch {
      // Continue reading remains optional on restricted storage.
    }
    fetch("/api/library")
      .then(async (response) => response.ok ? await response.json() as { items?: Array<{ story: { id: string; slug: string } }> } : null)
      .then((payload) => setSaved(Boolean(payload?.items?.some((item) => item.story.id === storyId || item.story.slug === novel.slug))))
      .finally(() => setChecking(false));
  }, [novel.slug, storyId]);

  async function toggleSaved() {
    setWorking(true);
    const next = !saved;
    try {
      const response = await fetch(next ? "/api/library" : `/api/library?storyId=${encodeURIComponent(storyId)}`, {
        method: next ? "PUT" : "DELETE",
        headers: next ? { "Content-Type": "application/json" } : undefined,
        body: next ? JSON.stringify({
          storyId,
          slug: novel.slug,
          title: novel.title,
          coverUrl: null,
          medium: "novel",
          status: "reading",
          followed: true,
        }) : undefined,
      });
      if (response.ok) setSaved(next);
      else if (response.status === 401 && confirm("Đăng nhập để đồng bộ tủ truyện chữ giữa các thiết bị?")) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="novel-detail__actions">
      {continueChapter ? (
        <Link className="button button--paper" href={`/novels/read/${continueChapter.id}`}>
          <BookOpen aria-hidden="true" /> Đọc tiếp {continueChapter.label} · đoạn {continueChapter.paragraph + 1}
        </Link>
      ) : null}
      <button className="button button--paper" type="button" onClick={toggleSaved} disabled={checking || working}>
        {checking || working ? <LoaderCircle className="spin" aria-hidden="true" /> : saved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        {saved ? "Đã lưu vào tủ" : "Thêm vào tủ"}
      </button>
    </div>
  );
}

export function NovelChapterList({ novel }: { novel: NovelSummary }) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(80);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const records = Object.values(JSON.parse(localStorage.getItem("muc:novel-progress") ?? "{}") as Record<string, { slug?: string; chapterId?: string }>);
      const nextReadIds = new Set(records.filter((item) => item.slug === novel.slug).flatMap((item) => item.chapterId ? [item.chapterId] : []));
      queueMicrotask(() => setReadIds(nextReadIds));
    } catch {
      // Read markers are device-local hints.
    }
  }, [novel.slug]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return novel.chapters;
    return novel.chapters.filter((chapter) => `${chapter.label} ${chapter.sourceTitle}`.toLocaleLowerCase("vi").includes(normalized));
  }, [novel.chapters, query]);

  return (
    <div className="novel-chapter-browser">
      <label className="novel-chapter-search">
        <span>Tìm trong {novel.chapters.length} phần</span>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setVisible(80); }} placeholder="Tên chương, hồi hoặc phần…" />
      </label>
      <ol>
        {filtered.slice(0, visible).map((chapter, index) => (
          <li key={chapter.id} className={readIds.has(chapter.id) ? "is-read" : ""}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <Link href={`/novels/read/${chapter.id}`}>
              <strong>{chapter.label}</strong>
              <small>{readIds.has(chapter.id) ? "Đã đọc trên thiết bị" : "Mở reader chữ"}</small>
              <BookOpen aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
      {visible < filtered.length ? <button className="button button--paper" type="button" onClick={() => setVisible((value) => value + 80)}>Xem thêm {Math.min(80, filtered.length - visible)} phần</button> : null}
    </div>
  );
}
