"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Check, Search } from "lucide-react";
import { ConsentBadge } from "./ConsentBadge";

export type ChapterItem = {
  id: string;
  number: string;
  title: string;
  source?: "otruyen" | "nettruyen" | "truyenqq";
  consent_status?: string;
  domain?: string;
};

export function ChapterList({
  storySlug,
  storyTitle,
  coverUrl,
  chapters,
}: {
  storySlug: string;
  storyTitle: string;
  coverUrl: string | null;
  chapters: ChapterItem[];
}) {
  const [readChapterIds, setReadChapterIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [displayCount, setDisplayCount] = useState(60);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("muc:read-chapters");
      if (raw) {
        queueMicrotask(() => setReadChapterIds(new Set(JSON.parse(raw) as string[])));
      }
    } catch {
      /* best effort */
    }
  }, []);

  const toggleReadStatus = (e: React.MouseEvent, chapterId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const next = new Set(readChapterIds);
    if (next.has(chapterId)) {
      next.delete(chapterId);
    } else {
      next.add(chapterId);
    }
    setReadChapterIds(next);
    try {
      localStorage.setItem("muc:read-chapters", JSON.stringify(Array.from(next)));
    } catch {
      /* best effort */
    }
  };

  const filteredChapters = useMemo(() => {
    const raw = filter.trim().toLowerCase();
    if (!raw) return chapters;
    const clean = raw.replace(/^chương\s*|^chap\s*|^c\s*/i, "").trim();
    return chapters.filter((ch) => {
      const num = String(ch.number).toLowerCase();
      const title = (ch.title || "").toLowerCase();
      const full = `chương ${num} ${title}`.toLowerCase();
      return (
        full.includes(raw) ||
        num === clean ||
        num.startsWith(clean) ||
        title.includes(clean)
      );
    });
  }, [filter, chapters]);

  const visibleChapters = filteredChapters.slice(0, displayCount);

  return (
    <div className="chapter-list-container">
      <div
        className="chapter-filter-bar"
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
          <Search
            style={{
              position: "absolute",
              left: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              width: "1rem",
              height: "1rem",
              color: "var(--muted)",
            }}
          />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Tìm chương (ví dụ: 15, 100)..."
            style={{
              width: "100%",
              paddingLeft: "2.25rem",
              paddingRight: "0.75rem",
              paddingTop: "0.55rem",
              paddingBottom: "0.55rem",
              background: "rgba(15, 23, 42, 0.7)",
              border: "1px solid rgba(59, 220, 255, 0.2)",
              borderRadius: "0.5rem",
              color: "white",
              fontSize: "0.875rem",
              outline: "none",
            }}
          />
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Đã đọc <strong style={{ color: "#4ade80" }}>{readChapterIds.size}</strong> / {chapters.length} chương
        </div>
      </div>

      <ol className="chapter-list">
        {visibleChapters.map((chapter, index) => {
          const isRead = readChapterIds.has(chapter.id);
          return (
            <li key={chapter.id} className={isRead ? "is-read" : ""} style={isRead ? { opacity: 0.65 } : undefined}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "0.5rem" }}>
                <Link
                  href={`/read/${chapter.id}?story=${encodeURIComponent(storySlug)}&title=${encodeURIComponent(storyTitle)}&cover=${encodeURIComponent(coverUrl ?? "")}`}
                  style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, textDecoration: "none" }}
                >
                  <strong style={{ marginRight: "0.5rem" }}>Chương {chapter.number}</strong>
                  <small style={{ flex: 1, paddingRight: "0.5rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {chapter.source && chapter.source !== "otruyen"
                      ? `${chapter.source === "truyenqq" ? "TruyenQQ" : "NetTruyen"} · đọc tại Mực`
                      : chapter.title || "Đọc ngay"}
                  </small>
                </Link>

                {/* Consent Badge Trigger */}
                <ConsentBadge
                  status={chapter.consent_status || (chapter.source && chapter.source !== "otruyen" ? "UNKNOWN" : "VERIFIED")}
                  domain={chapter.domain || "otruyenapi.com"}
                  chapterTitle={`Chương ${chapter.number}: ${chapter.title || "Nội dung"}`}
                  storyTitle={storyTitle}
                  size="sm"
                />

                {isRead ? (
                  <span
                    onClick={(e) => toggleReadStatus(e, chapter.id)}
                    title="Bấm để bỏ đánh dấu đã đọc"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.2rem",
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.45rem",
                      borderRadius: "0.35rem",
                      background: "rgba(34, 197, 94, 0.15)",
                      color: "#4ade80",
                      cursor: "pointer",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Check style={{ width: "0.75rem", height: "0.75rem" }} /> Đã đọc
                  </span>
                ) : (
                  <span
                    onClick={(e) => toggleReadStatus(e, chapter.id)}
                    title="Bấm để đánh dấu đã đọc"
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.45rem",
                      borderRadius: "0.35rem",
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "var(--muted)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Chưa đọc
                  </span>
                )}
                <Link
                  href={`/read/${chapter.id}?story=${encodeURIComponent(storySlug)}&title=${encodeURIComponent(storyTitle)}&cover=${encodeURIComponent(coverUrl ?? "")}`}
                  style={{ color: "var(--signal)", display: "grid", placeItems: "center" }}
                  aria-label={`Mở đọc Chương ${chapter.number}`}
                >
                  <ArrowRight aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
                </Link>
              </div>
            </li>
          );
        })}
      </ol>

      {displayCount < filteredChapters.length && (
        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button
            type="button"
            className="button button--paper"
            onClick={() => setDisplayCount((prev) => prev + 60)}
          >
            Xem thêm {Math.min(60, filteredChapters.length - displayCount)} chương nữa
          </button>
        </div>
      )}
    </div>
  );
}
