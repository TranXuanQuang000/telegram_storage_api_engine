import { aggregateRatings, type RatingAggregate, type RatingSnapshot } from "./ratings";
import { normalizeTitle, titleSimilarity } from "./search-utils";

export { normalizeTitle, titleSimilarity } from "./search-utils";

type AniListMedia = {
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  averageScore?: number | null;
  popularity?: number | null;
  siteUrl?: string | null;
  stats?: { scoreDistribution?: Array<{ score?: number | null; amount?: number | null }> | null } | null;
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
const signalCache = new Map<string, { expiresAt: number; value: RatingSignal | null }>();

export type RatingSignal = {
  score5: number;
  voteCount: number;
  positiveRatio: number | null;
  negativeRatio: number | null;
  qualityScore: number;
  sourceName: "AniList";
  sourceUrl: string;
};

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

export async function getAniListRatingSignals(
  items: Array<{ id: string; titles: string[] }>,
): Promise<Map<string, RatingSignal>> {
  const unique = items
    .map((item) => ({ id: item.id, titles: [...new Set(item.titles.map((title) => title.trim()).filter(Boolean))].slice(0, 4) }))
    .filter((item) => item.titles.length)
    .slice(0, 24);
  const result = new Map<string, RatingSignal>();
  const missing: typeof unique = [];

  for (const item of unique) {
    const cached = signalCache.get(normalizeTitle(item.titles[0]));
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.value) result.set(item.id, cached.value);
    } else {
      missing.push(item);
    }
  }
  if (!missing.length) return result;

  const definitions = missing.map((_, index) => `$q${index}: String!`).join(", ");
  const fields = missing.map((_, index) => `m${index}: Media(search: $q${index}, type: MANGA) {
    title { romaji english native }
    averageScore
    popularity
    siteUrl
    stats { scoreDistribution { score amount } }
  }`).join("\n");
  const variables = Object.fromEntries(missing.map((item, index) => [`q${index}`, item.titles[0]]));

  try {
    const response = await fetchWithTimeout("https://graphql.anilist.co", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query: `query (${definitions}) { ${fields} }`, variables }),
    }, 4_000);
    if (!response.ok) return result;
    const payload = await response.json() as { data?: Record<string, AniListMedia | null> };
    for (const [index, item] of missing.entries()) {
      const media = payload.data?.[`m${index}`];
      const similarity = bestSimilarity(item.titles, [media?.title?.romaji, media?.title?.english, media?.title?.native]);
      const score5 = (media?.averageScore ?? 0) / 20;
      let signal: RatingSignal | null = null;
      if (media?.siteUrl && score5 > 0 && similarity >= 0.72) {
        const rows = media.stats?.scoreDistribution ?? [];
        const voteCount = rows.reduce((total, row) => total + (row.amount ?? 0), 0);
        const positiveVotes = rows.filter((row) => (row.score ?? 0) >= 70).reduce((total, row) => total + (row.amount ?? 0), 0);
        const negativeVotes = rows.filter((row) => (row.score ?? 100) <= 40).reduce((total, row) => total + (row.amount ?? 0), 0);
        const positiveRatio = voteCount ? positiveVotes / voteCount : null;
        const negativeRatio = voteCount ? negativeVotes / voteCount : null;
        const volumeBonus = Math.min(0.12, Math.log10(Math.max(1, voteCount)) * 0.025);
        const qualityScore = Math.max(0, Math.min(5, score5 + (positiveRatio ?? 0) * 0.18 - (negativeRatio ?? 0) * 0.75 + volumeBonus));
        signal = { score5, voteCount, positiveRatio, negativeRatio, qualityScore, sourceName: "AniList", sourceUrl: media.siteUrl };
        result.set(item.id, signal);
      }
      signalCache.set(normalizeTitle(item.titles[0]), { expiresAt: Date.now() + 6 * 60 * 60 * 1_000, value: signal });
    }
  } catch {
    // External recommendation signals are an enhancement; the catalog remains usable without them.
  }

  return result;
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
