"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

type SavedProgress = {
  chapterId: string;
  chapterName: string;
  page: number;
  totalPages: number;
  storySlug?: string;
  storyTitle?: string;
  coverUrl?: string | null;
  updatedAt: string;
};

export function ContinueReading() {
  const [progress, setProgress] = useState<SavedProgress | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("muc:last-progress");
      if (raw) queueMicrotask(() => setProgress(JSON.parse(raw) as SavedProgress));
    } catch {
      queueMicrotask(() => setProgress(null));
    }
  }, []);

  if (!progress) {
    return (
      <section className="onboarding-callout" aria-labelledby="onboarding-title">
        <div>
          <p className="section-kicker">Chưa có tín hiệu đọc</p>
          <h2 id="onboarding-title">Chọn tần số cho tối nay.</h2>
          <p>Chạm một mood để khởi động feed cá nhân. Không cần AI — bộ lọc vẫn đọc chính xác tổ hợp thể loại và nhịp bạn chọn.</p>
        </div>
        <div className="mood-cluster" aria-label="Gợi ý mood">
          {[
            ["Căng như dây đàn", "revenge"],
            ["Ấm và chậm", "slice-of-life"],
            ["Bẻ não", "mystery"],
            ["Cày một mạch", "webtoon"],
          ].map(([label, value]) => (
            <Link key={value} href={`/discover?include=${value}`}>{label}<ArrowRight aria-hidden="true" /></Link>
          ))}
        </div>
      </section>
    );
  }

  const percent = Math.max(1, Math.round(((progress.page + 1) / Math.max(progress.totalPages, 1)) * 100));
  return (
    <section className="continue-card" aria-labelledby="continue-title">
      <div className="continue-card__visual" style={progress.coverUrl ? { backgroundImage: `url(${progress.coverUrl})` } : undefined} aria-hidden="true" />
      <div className="continue-card__body">
        <p className="section-kicker">RESUME SIGNAL / {percent}%</p>
        <h2 id="continue-title">{progress.storyTitle ?? "Chương đang đọc"}</h2>
        <p className="continue-card__chapter"><BookOpen aria-hidden="true" /> Chương {progress.chapterName} · Trang {progress.page + 1}/{progress.totalPages}</p>
        <div className="progress-track" aria-label={`Đã đọc ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
        <div className="continue-card__actions">
          <Link className="button button--ink" href={`/read/${progress.chapterId}?story=${encodeURIComponent(progress.storySlug ?? "")}&title=${encodeURIComponent(progress.storyTitle ?? "")}&cover=${encodeURIComponent(progress.coverUrl ?? "")}`}>
            Đọc tiếp <ArrowRight aria-hidden="true" />
          </Link>
          <span><Clock3 aria-hidden="true" /> khoảng {Math.max(2, Math.ceil((progress.totalPages - progress.page) * 0.35))} phút còn lại</span>
        </div>
      </div>
    </section>
  );
}
