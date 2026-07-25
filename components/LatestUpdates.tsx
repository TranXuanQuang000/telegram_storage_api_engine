"use client";

import Link from "next/link";
import { ArrowRight, Radio, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { StoryCardData } from "../lib/catalog";
import { StoryCard } from "./StoryCard";

export function LatestUpdates() {
  const [stories, setStories] = useState<StoryCardData[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog/latest?limit=15", { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { items?: StoryCardData[] } : null)
      .then((payload) => {
        if (!controller.signal.aborted) setStories(payload?.items ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStories([]);
      });
    return () => controller.abort();
  }, []);

  if (stories === null) return <LatestUpdatesFallback />;
  if (!stories.length) return null;

  return (
    <section className="catalog-section latest-updates page-shell" aria-labelledby="latest-updates-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker"><Radio aria-hidden="true" /> OTruyen + MangaDex / VI</p>
          <h2 id="latest-updates-title">Vừa có<br />chương mới.</h2>
        </div>
        <Link className="text-link" href="/discover?sort=latest">
          Xem toàn bộ cập nhật <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <p className="latest-updates__lede">
        Tín hiệu được hợp nhất từ nhiều nguồn API công khai, khử trùng lặp theo tên trước khi hiển thị.
        Truyện từ nguồn ngoài luôn ghi rõ provenance và dẫn về trang nguồn khi chưa có quyền đọc trực tiếp.
      </p>
      <div className="latest-updates__signal">
        <RefreshCcw aria-hidden="true" /> Làm mới ngắn hạn · ưu tiên bản dịch tiếng Việt mới nhất
      </div>
      <div className="story-grid">
        {stories.map((story) => <StoryCard key={story.id} story={story} />)}
      </div>
    </section>
  );
}

export function LatestUpdatesFallback() {
  return (
    <section className="catalog-section latest-updates page-shell" aria-label="Đang lấy cập nhật truyện mới">
      <div className="community-picks__loading">
        <span />
        <div><strong>Đang hợp nhất các chương vừa cập nhật…</strong><small>OTruyen · MangaDex tiếng Việt</small></div>
      </div>
    </section>
  );
}
