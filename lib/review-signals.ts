import { normalizeTitle, titleSimilarity } from "./search-utils";

export type CommunityReviewSignal = {
  reviewCount: number;
  positiveReviewRatio: number | null;
  helpfulApprovalRatio: number | null;
  helpfulVotes: number;
  qualityScore: number;
  sourceName: "AniList Reviews";
};

type ReviewNode = {
  rating?: number | null;
  ratingAmount?: number | null;
  score?: number | null;
};

type AniListReviewMedia = {
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  synonyms?: string[] | null;
  reviews?: { nodes?: ReviewNode[] | null } | null;
};

const reviewCache = new Map<string, { expiresAt: number; value: CommunityReviewSignal | null }>();

function bestSimilarity(queryTitles: string[], media?: AniListReviewMedia | null) {
  if (!media) return 0;
  const candidates = [media.title?.romaji, media.title?.english, media.title?.native, ...(media.synonyms ?? [])];
  return Math.max(0, ...queryTitles.flatMap((query) => candidates.map((candidate) => candidate ? titleSimilarity(query, candidate) : 0)));
}

export function summarizeReviewNodes(nodes: ReviewNode[]): CommunityReviewSignal | null {
  const scored = nodes.filter((node) => typeof node.score === "number" && (node.score ?? 0) > 0);
  const rated = nodes.filter((node) => (node.ratingAmount ?? 0) > 0);
  if (!scored.length && !rated.length) return null;
  const positiveReviewRatio = scored.length
    ? scored.filter((node) => (node.score ?? 0) >= 70).length / scored.length
    : null;
  const helpfulPositiveVotes = rated.reduce((total, node) => total + Math.max(0, node.rating ?? 0), 0);
  const helpfulVotes = rated.reduce((total, node) => total + Math.max(0, node.ratingAmount ?? 0), 0);
  const helpfulApprovalRatio = helpfulVotes ? Math.min(1, helpfulPositiveVotes / helpfulVotes) : null;
  const approval = helpfulApprovalRatio ?? positiveReviewRatio ?? 0;
  const positivity = positiveReviewRatio ?? helpfulApprovalRatio ?? 0;
  const confidence = Math.min(1, Math.log10(helpfulVotes + scored.length * 8 + 1) / 3);
  return {
    reviewCount: scored.length,
    positiveReviewRatio,
    helpfulApprovalRatio,
    helpfulVotes,
    qualityScore: Math.round((positivity * .55 + approval * .3 + confidence * .15) * 10_000) / 100,
    sourceName: "AniList Reviews",
  };
}

export async function getCommunityReviewSignals(items: Array<{ id: string; titles: string[] }>) {
  const unique = items
    .map((item) => ({
      id: item.id,
      titles: [...new Set(item.titles.flatMap((title) => title.split(/\s*·\s*/)).map((title) => title.trim()).filter(Boolean))].slice(0, 5),
    }))
    .filter((item) => item.titles.length)
    .slice(0, 16);
  const result = new Map<string, CommunityReviewSignal>();
  const missing: typeof unique = [];

  for (const item of unique) {
    const cached = reviewCache.get(normalizeTitle(item.titles[0]));
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
      reviews(page: 1, perPage: 5, sort: [RATING_DESC]) {
        nodes { rating ratingAmount score }
      }
    }
  }`).join("\n");
  const variables = Object.fromEntries(missing.map((item, index) => [`q${index}`, item.titles[0]]));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query: `query (${definitions}) { ${fields} }`, variables }),
      signal: controller.signal,
    });
    if (!response.ok) return result;
    const payload = await response.json() as { data?: Record<string, { media?: AniListReviewMedia[] | null } | null> };
    for (const [index, item] of missing.entries()) {
      const matched = (payload.data?.[`m${index}`]?.media ?? [])
        .map((media) => ({ media, similarity: bestSimilarity(item.titles, media) }))
        .sort((left, right) => right.similarity - left.similarity)[0];
      const signal = (matched?.similarity ?? 0) >= .72
        ? summarizeReviewNodes(matched?.media.reviews?.nodes ?? [])
        : null;
      reviewCache.set(normalizeTitle(item.titles[0]), { expiresAt: Date.now() + 6 * 60 * 60 * 1_000, value: signal });
      if (signal) result.set(item.id, signal);
    }
    return result;
  } catch {
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
