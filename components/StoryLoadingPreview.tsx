"use client";

import { BookOpen, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { StoryCover } from "./StoryCover";
import { STORY_PREVIEW_KEY, type StoryPreviewData } from "./StoryPreviewLink";

function readPreview(): StoryPreviewData | null {
  try {
    const preview = JSON.parse(sessionStorage.getItem(STORY_PREVIEW_KEY) ?? "null") as StoryPreviewData | null;
    if (!preview || Date.now() - preview.savedAt > 10 * 60_000) return null;
    const slug = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return preview.slug === slug ? preview : null;
  } catch {
    return null;
  }
}

export function StoryLoadingPreview() {
  const [preview, setPreview] = useState<StoryPreviewData | null>(null);

  useEffect(() => {
    setPreview(readPreview());
  }, []);

  if (!preview) {
    return (
      <main className="route-loading route-loading--story page-shell" aria-label="Đang mở truyện">
        <div className="route-loading__cover" />
        <div><span /><span /><span /><span /></div>
      </main>
    );
  }

  return (
    <main className="story-preview-loading page-shell" aria-label={`Đang tải thông tin đầy đủ của ${preview.title}`}>
      <div className="story-preview-loading__cover">
        <StoryCover src={preview.coverUrl} title={preview.title} priority />
      </div>
      <section>
        <p className="section-kicker">{preview.genres.slice(0, 3).join(" · ") || "Truyện tranh"}</p>
        <h1>{preview.title}</h1>
        {preview.originTitle ? <p className="origin-title">{preview.originTitle}</p> : null}
        <div className="story-preview-loading__facts">
          {preview.score ? <span><Star aria-hidden="true" /> {preview.score.toFixed(1)}/5</span> : null}
          {preview.latestChapter ? <span><BookOpen aria-hidden="true" /> Chương {preview.latestChapter}</span> : null}
          <span>{preview.status === "completed" ? "Đã hoàn thành" : "Đang cập nhật"}</span>
        </div>
        <div className="story-preview-loading__progress">
          <span />
          <p>Đang tải tóm tắt, mục lục và đối chiếu điểm cộng đồng…</p>
        </div>
      </section>
    </main>
  );
}
