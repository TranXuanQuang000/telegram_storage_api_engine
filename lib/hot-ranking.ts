export type HotRankable = {
  title?: string;
  score?: number | null;
  ratingVotes?: number | null;
  positiveRatio?: number | null;
  recommendationScore?: number | null;
  updatedAt?: string | null;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function freshnessBoost(updatedAt: string | null | undefined, now: number) {
  const timestamp = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
  if (ageDays <= 7) return 18;
  if (ageDays <= 30) return 12;
  if (ageDays <= 90) return 6;
  if (ageDays <= 365) return 2;
  return 0;
}

export function calculateHotScore(story: HotRankable, now = Date.now()) {
  const communityScore = clamp(story.score ?? 0, 0, 5);
  const popularity = Math.log10(Math.max(0, story.ratingVotes ?? 0) + 1);
  const positivity = clamp(story.positiveRatio ?? 0, 0, 1);
  const verifiedBonus = (story.ratingVotes ?? 0) >= 25 ? 6 : 0;
  const editorialQuality = clamp(story.recommendationScore ?? 0, 0, 100) * 0.05;
  return popularity * 22
    + communityScore * 7
    + positivity * 8
    + verifiedBonus
    + editorialQuality
    + freshnessBoost(story.updatedAt, now);
}

export function compareHotStories(left: HotRankable, right: HotRankable, now = Date.now()) {
  return calculateHotScore(right, now) - calculateHotScore(left, now)
    || (right.ratingVotes ?? 0) - (left.ratingVotes ?? 0)
    || (right.score ?? 0) - (left.score ?? 0)
    || (right.updatedAt ? new Date(right.updatedAt).getTime() : 0)
      - (left.updatedAt ? new Date(left.updatedAt).getTime() : 0)
    || (left.title ?? "").localeCompare(right.title ?? "", "vi");
}
