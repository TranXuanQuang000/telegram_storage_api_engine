import { aggregateRatings, type RatingAggregate, type RatingSnapshot } from "./ratings";

type AniListMedia = {
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  averageScore?: number | null;
  siteUrl?: string | null;
  stats?: { scoreDistribution?: Array<{ amount?: number | null }> | null } | null;
};

type KitsuManga = {
  attributes?: {
    canonicalTitle?: string | null;
    titles?: Record<string, string | null>;
    averageRating?: string | null;
    ratingFrequencies?: Record<string, string> | null;
    slug?: string | null;
  };
};

const memoryCache = new Map<string, { expiresAt: number; value: RatingAggregate }>();

export function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/\b(truyen tranh|manga|manhwa|manhua|full hd|full)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleSimilarity(left: string, right: string) {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a))) return 0.92;
  const first = new Set(a.split(" "));
  const second = new Set(b.split(" "));
  const intersection = [...first].filter((token) => second.has(token)).length;
  return (2 * intersection) / (first.size + second.size);
}

function bestSimilarity(queryTitles: string[], candidateTitles: Array<string | null | undefined>) {
  return Math.max(0, ...queryTitles.flatMap((query) => candidateTitles.map((candidate) => candidate ? titleSimilarity(query, candidate) : 0)));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAniList(titles: string[], capturedAt: string): Promise<RatingSnapshot | null> {
  const query = titles[0];
  const response = await fetchWithTimeout("https://graphql.anilist.co", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "query ($search: String) { Media(search: $search, type: MANGA) { title { romaji english native } averageScore siteUrl stats { scoreDistribution { amount } } } }",
      variables: { search: query },
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { data?: { Media?: AniListMedia | null } };
  const media = payload.data?.Media;
  const score = media?.averageScore;
  const similarity = bestSimilarity(titles, [media?.title?.romaji, media?.title?.english, media?.title?.native]);
  if (!score || !media?.siteUrl || similarity < 0.72) return null;
  const voteCount = media.stats?.scoreDistribution?.reduce((total, row) => total + (row.amount ?? 0), 0) ?? 0;
  return { sourceId: "anilist", sourceName: "AniList", score5: score / 20, voteCount, capturedAt, sourceUrl: media.siteUrl };
}

async function fetchKitsu(titles: string[], capturedAt: string): Promise<RatingSnapshot | null> {
  const response = await fetchWithTimeout(`https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(titles[0])}&page[limit]=1`, {
    headers: { Accept: "application/vnd.api+json" },
  });
  if (!response.ok) return null;
  const payload = await response.json() as { data?: KitsuManga[] };
  const manga = payload.data?.[0]?.attributes;
  const score = Number(manga?.averageRating);
  const similarity = bestSimilarity(titles, [manga?.canonicalTitle, ...Object.values(manga?.titles ?? {})]);
  if (!Number.isFinite(score) || !manga?.slug || similarity < 0.72) return null;
  const voteCount = Object.values(manga.ratingFrequencies ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);
  return { sourceId: "kitsu", sourceName: "Kitsu", score5: score / 20, voteCount, capturedAt, sourceUrl: `https://kitsu.app/manga/${manga.slug}` };
}

export async function getExternalRating(titles: string[]): Promise<RatingAggregate> {
  const cleanTitles = [...new Set(titles.map((title) => title.trim()).filter(Boolean))].slice(0, 4);
  const key = normalizeTitle(cleanTitles[0] ?? "");
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!key) return aggregateRatings([]);

  const capturedAt = new Date().toISOString();
  const settled = await Promise.allSettled([fetchAniList(cleanTitles, capturedAt), fetchKitsu(cleanTitles, capturedAt)]);
  const snapshots = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const aggregate = aggregateRatings(snapshots);
  memoryCache.set(key, { expiresAt: Date.now() + 6 * 60 * 60 * 1_000, value: aggregate });
  return aggregate;
}
