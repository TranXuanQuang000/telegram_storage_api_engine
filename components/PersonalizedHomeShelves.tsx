"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { StoryCardData } from "../lib/catalog";
import { StoryCard } from "./StoryCard";

type HistoryRecord = {
  chapterId: string;
  chapterName: string;
  storySlug?: string;
  storyTitle?: string;
  coverUrl?: string | null;
  updatedAt: string;
};

type StoryStat = { slug: string; opens: number; lastOpenedAt: string };

function storyFromHistory(record: HistoryRecord): StoryCardData {
  const slug = record.storySlug || record.chapterId;
  return {
    id: `history:${slug}`,
    slug,
    title: record.storyTitle || "Truyện đang đọc",
    originTitle: null,
    coverUrl: record.coverUrl ?? null,
    status: "ongoing",
    contentRating: "safe",
    genres: [],
    genreSlugs: [],
    discoveryTags: [],
    latestChapter: record.chapterName,
    latestChapterId: record.chapterId,
    updatedAt: record.updatedAt,
    score: null,
    scoreSource: null,
  };
}

async function fetchStories(params: URLSearchParams) {
  const response = await fetch(`/api/catalog?${params.toString()}`);
  if (!response.ok) return [];
  const data = await response.json() as { items?: StoryCardData[] };
  return data.items ?? [];
}

export function PersonalizedHomeShelves() {
  const [favorites, setFavorites] = useState<StoryCardData[]>([]);
  const [recommendations, setRecommendations] = useState<StoryCardData[]>([]);
  const [personal, setPersonal] = useState(false);
  const [ready, setReady] = useState(false);
  const [recommendationsReady, setRecommendationsReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const savedIds = new Set(JSON.parse(localStorage.getItem("muc:library") ?? "[]") as string[]);
        const records = JSON.parse(localStorage.getItem("muc:libraryRecords") ?? "[]") as StoryCardData[];
        const history = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as HistoryRecord[];
        const stats = JSON.parse(localStorage.getItem("muc:story-stats") ?? "[]") as StoryStat[];
        const statBySlug = new Map(stats.map((item) => [item.slug, item]));
        const merged = new Map<string, StoryCardData>();
        for (const story of records) if (savedIds.has(story.id)) merged.set(story.slug, story);
        for (const item of history) {
          const story = storyFromHistory(item);
          if (!merged.has(story.slug)) merged.set(story.slug, story);
        }
        const ranked = [...merged.values()].sort((left, right) => {
          const leftStat = statBySlug.get(left.slug);
          const rightStat = statBySlug.get(right.slug);
          const leftSaved = savedIds.has(left.id) ? 1 : 0;
          const rightSaved = savedIds.has(right.id) ? 1 : 0;
          const leftTime = new Date(leftStat?.lastOpenedAt ?? left.updatedAt).getTime();
          const rightTime = new Date(rightStat?.lastOpenedAt ?? right.updatedAt).getTime();
          return ((rightStat?.opens ?? 0) * 12 + rightSaved * 5) - ((leftStat?.opens ?? 0) * 12 + leftSaved * 5)
            || rightTime - leftTime;
        }).slice(0, 8);

        const hasPersonalData = ranked.length > 0;
        let favoriteRows = ranked;
        let starterRows: StoryCardData[] = [];
        if (hasPersonalData && active) {
          setFavorites(ranked);
          setPersonal(true);
          setReady(true);
        }
        if (!favoriteRows.length) {
          starterRows = await fetchStories(new URLSearchParams({ sort: "rating", limit: "16" }));
          favoriteRows = starterRows.slice(0, 8);
        }

        const genreCounts = records
          .filter((story) => savedIds.has(story.id))
          .flatMap((story) => story.genreSlugs)
          .reduce((counts, genre) => counts.set(genre, (counts.get(genre) ?? 0) + 1), new Map<string, number>());
        const favoriteGenres = [...genreCounts.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 2)
          .map(([genre]) => genre);
        let suggested = starterRows.slice(8, 16);
        if (hasPersonalData) {
          const recommendationParams = new URLSearchParams({ sort: "rating", limit: "16" });
          favoriteGenres.forEach((genre) => recommendationParams.append("include", genre));
          suggested = await fetchStories(recommendationParams);
          if (!suggested.length && favoriteGenres.length > 1) {
            const relaxed = new URLSearchParams({ sort: "rating", limit: "16" });
            relaxed.append("include", favoriteGenres[0]);
            suggested = await fetchStories(relaxed);
          }
        }
        const seen = new Set(merged.keys());
        suggested = suggested.filter((story) => !seen.has(story.slug)).slice(0, 8);

        if (active) {
          setFavorites(favoriteRows);
          setRecommendations(suggested);
          setPersonal(hasPersonalData);
          setRecommendationsReady(true);
        }
      } catch {
        // The home page remains usable even when storage or a source is unavailable.
        if (active) setRecommendationsReady(true);
      } finally {
        if (active) setReady(true);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  if (!ready) {
    return (
      <section className="catalog-section page-shell" aria-label="Đang cá nhân hóa trang chủ">
        <div className="section-heading"><div><p className="section-kicker">Đang đọc gu của bạn</p><h2>Đang xếp lại tủ đầu trang…</h2></div></div>
        <p className="loading-copy">Chỉ dùng dữ liệu đọc trên thiết bị này.</p>
      </section>
    );
  }

  return (
    <>
      <section className="catalog-section page-shell" aria-labelledby="favorite-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">{personal ? "Dựa trên số lần mở & tủ truyện" : "Gợi ý mở đầu"}</p>
            <h2 id="favorite-title">{personal ? "Bộ bạn thích và đọc nhiều nhất." : "Truyện được cộng đồng yêu thích."}</h2>
          </div>
          <Link className="text-link" href="/library">Mở tủ truyện <ArrowRight aria-hidden="true" /></Link>
        </div>
        {favorites.length ? <div className="story-grid">{favorites.map((story) => <StoryCard key={story.id} story={story} />)}</div> : <p className="loading-copy">Đọc hoặc lưu một truyện để tạo kệ riêng.</p>}
      </section>

      <section className="catalog-section catalog-section--personal page-shell" aria-labelledby="personal-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Có thể hợp gu tiếp theo</p>
            <h2 id="personal-title">Đề xuất riêng cho bạn.</h2>
            <p className="personal-shelf-note">Xếp từ thể loại bạn đã lưu, lịch sử đọc và điểm cộng đồng; dữ liệu cá nhân không rời thiết bị.</p>
          </div>
          <Link className="text-link" href="/settings/ai"><Sparkles aria-hidden="true" /> Nhờ AI tìm kỹ hơn</Link>
        </div>
        {!recommendationsReady ? <p className="loading-copy">Đang đối chiếu gu với điểm cộng đồng…</p> : recommendations.length ? <div className="story-grid">{recommendations.map((story) => <StoryCard key={story.id} story={story} />)}</div> : (
          <div className="personal-shelf-empty">
            <p>Chưa đủ tín hiệu để đoán gu. Hãy lưu vài bộ hoặc mô tả trực tiếp cho AI.</p>
            <Link className="button button--ink" href="/discover">Khám phá truyện <ArrowRight aria-hidden="true" /></Link>
          </div>
        )}
      </section>
    </>
  );
}
