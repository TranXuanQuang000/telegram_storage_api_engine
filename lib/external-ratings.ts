import { aggregateRatings, type RatingAggregate, type RatingSnapshot } from "./ratings";
import { normalizeTitle, titleSimilarity } from "./search-utils";

export { normalizeTitle, titleSimilarity } from "./search-utils";

type AniListMedia = {
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  synonyms?: string[] | null;
  averageScore?: number | null;
  popularity?: number | null;
  siteUrl?: string | null;
  stats?: { scoreDistribution?: Array<{ score?: number | null; amount?: number | null }> | null } | null;
};

type JikanManga = {
  mal_id?: number;
  url?: string | null;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  titles?: Array<{ title?: string | null }> | null;
  score?: number | null;
  scored_by?: number | null;
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

function cleanTitleAliases(titles: string[]) {
  return [...new Set(titles
    .flatMap((title) => title.split(/\s*·\s*/))
    .map((title) => title.trim())
    .filter(Boolean))]
    .slice(0, 6);
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
      query: "query ($search: String) { Page(perPage: 3) { media(search: $search, type: MANGA) { title { romaji english native } synonyms averageScore siteUrl stats { scoreDistribution { amount } } } } }",
      variables: { search: query },
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { data?: { Page?: { media?: AniListMedia[] | null } | null } };
  const media = (payload.data?.Page?.media ?? [])
    .map((candidate) => ({
      candidate,
      similarity: bestSimilarity(titles, [candidate.title?.romaji, candidate.title?.english, candidate.title?.native, ...(candidate.synonyms ?? [])]),
    }))
    .sort((left, right) => right.similarity - left.similarity)[0]?.candidate;
  const score = media?.averageScore;
  const similarity = bestSimilarity(titles, [media?.title?.romaji, media?.title?.english, media?.title?.native, ...(media?.synonyms ?? [])]);
  if (!score || !media?.siteUrl || similarity < 0.72) return null;
  const voteCount = media.stats?.scoreDistribution?.reduce((total, row) => total + (row.amount ?? 0), 0) ?? 0;
  return { sourceId: "anilist", sourceName: "AniList", score5: score / 20, voteCount, capturedAt, sourceUrl: media.siteUrl };
}

export async function getAniListRatingSignals(
  items: Array<{ id: string; titles: string[] }>,
): Promise<Map<string, RatingSignal>> {
  const unique = items
    .map((item) => ({ id: item.id, titles: cleanTitleAliases(item.titles) }))
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
  const fields = missing.map((_, index) => `m${index}: Page(perPage: 3) {
    media(search: $q${index}, type: MANGA) {
      title { romaji english native }
      synonyms
      averageScore
      popularity
      siteUrl
      stats { scoreDistribution { score amount } }
    }
  }`).join("\n");
  const variables = Object.fromEntries(missing.map((item, index) => [`q${index}`, item.titles[0]]));

  try {
    const response = await fetchWithTimeout("https://graphql.anilist.co", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query: `query (${definitions}) { ${fields} }`, variables }),
    }, 4_000);
    if (!response.ok) return result;
    const payload = await response.json() as { data?: Record<string, { media?: AniListMedia[] | null } | null> };
    for (const [index, item] of missing.entries()) {
      const matched = (payload.data?.[`m${index}`]?.media ?? [])
        .map((candidate) => ({
          candidate,
          similarity: bestSimilarity(item.titles, [candidate.title?.romaji, candidate.title?.english, candidate.title?.native, ...(candidate.synonyms ?? [])]),
        }))
        .sort((left, right) => right.similarity - left.similarity)[0];
      const media = matched?.candidate;
      const similarity = matched?.similarity ?? 0;
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
  const response = await fetchWithTimeout(`https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(titles[0])}&page[limit]=5`, {
    headers: { Accept: "application/vnd.api+json" },
  });
  if (!response.ok) return null;
  const payload = await response.json() as { data?: KitsuManga[] };
  const manga = (payload.data ?? [])
    .map((item) => ({
      manga: item.attributes,
      similarity: bestSimilarity(titles, [item.attributes?.canonicalTitle, ...Object.values(item.attributes?.titles ?? {})]),
    }))
    .sort((left, right) => right.similarity - left.similarity)[0]?.manga;
  const score = Number(manga?.averageRating);
  const similarity = bestSimilarity(titles, [manga?.canonicalTitle, ...Object.values(manga?.titles ?? {})]);
  if (!Number.isFinite(score) || !manga?.slug || similarity < 0.72) return null;
  const voteCount = Object.values(manga.ratingFrequencies ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);
  return { sourceId: "kitsu", sourceName: "Kitsu", score5: score / 20, voteCount, capturedAt, sourceUrl: `https://kitsu.app/manga/${manga.slug}` };
}

async function fetchJikan(titles: string[], capturedAt: string): Promise<RatingSnapshot | null> {
  const response = await fetchWithTimeout(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(titles[0])}&limit=5&sfw=true`, {
    headers: { Accept: "application/json" },
  }, 6_000);
  if (!response.ok) return null;
  const payload = await response.json() as { data?: JikanManga[] };
  const matched = (payload.data ?? [])
    .map((manga) => ({
      manga,
      similarity: bestSimilarity(titles, [
        manga.title,
        manga.title_english,
        manga.title_japanese,
        ...(manga.titles?.map((title) => title.title) ?? []),
      ]),
    }))
    .sort((left, right) => right.similarity - left.similarity)[0];
  const manga = matched?.manga;
  if (!manga?.score || !manga.url || (matched?.similarity ?? 0) < 0.72) return null;
  return {
    sourceId: "jikan-mal",
    sourceName: "MyAnimeList (Jikan)",
    score5: manga.score / 2,
    voteCount: Math.max(0, manga.scored_by ?? 0),
    capturedAt,
    sourceUrl: manga.url,
  };
}

export async function getExternalRating(titles: string[]): Promise<RatingAggregate> {
  const cleanTitles = cleanTitleAliases(titles);
  const key = normalizeTitle(cleanTitles[0] ?? "");
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!key) return aggregateRatings([]);

  const capturedAt = new Date().toISOString();
  const settled = await Promise.allSettled([
    fetchAniList(cleanTitles, capturedAt),
    fetchKitsu(cleanTitles, capturedAt),
    fetchJikan(cleanTitles, capturedAt),
  ]);
  const snapshots = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const aggregate = aggregateRatings(snapshots);
  memoryCache.set(key, { expiresAt: Date.now() + 6 * 60 * 60 * 1_000, value: aggregate });
  return aggregate;
}
