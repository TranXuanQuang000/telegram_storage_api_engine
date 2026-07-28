export type NovelRankable = {
  title: string;
  coverUrl?: string | null;
  description?: string | null;
  author?: string | null;
  genres?: string[];
  status?: string;
  updatedAt?: string | null;
  chapterCount?: number | null;
  chapters?: unknown[];
};

export function calculateNovelHotScore(novel: NovelRankable) {
  const chapterCount = Math.max(novel.chapterCount ?? 0, novel.chapters?.length ?? 0);
  const metadataScore = (novel.coverUrl ? 9 : 0)
    + (novel.description?.trim() ? 5 : 0)
    + (novel.author?.trim() ? 3 : 0)
    + Math.min(6, (novel.genres?.length ?? 0) * 1.5);
  const statusScore = novel.status === "ongoing" ? 3 : 1;
  const updated = novel.updatedAt ? new Date(novel.updatedAt).getTime() : Number.NaN;
  const freshness = Number.isFinite(updated) ? updated / 100_000_000_000 : 0;
  return Math.log1p(chapterCount) * 18 + metadataScore + statusScore + freshness;
}

export function compareHotNovels(left: NovelRankable, right: NovelRankable) {
  return calculateNovelHotScore(right) - calculateNovelHotScore(left)
    || left.title.localeCompare(right.title, "vi");
}
