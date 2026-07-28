import {
  enrichStoriesWithRatings,
  getFilteredDiscoverCatalog,
  getHomeStories,
  getStory,
  searchStories,
  type StoryCardData,
  type StoryDetailData,
} from "./catalog";
import { getCommunityReviewSignals, type CommunityReviewSignal } from "./review-signals";
import { calculateHotScore } from "./hot-ranking";
import { extractReferenceTitle, titleSimilarity } from "./search-utils";

export { extractReferenceTitle } from "./search-utils";

export type ReadingHistoryHint = {
  title: string;
  storySlug?: string;
};

export type AiCandidate = StoryCardData & {
  synopsis: string | null;
  reviewSignal: CommunityReviewSignal | null;
};

export type AiRecommendationContext = {
  reference: StoryDetailData | null;
  requestedReference: string | null;
  candidates: AiCandidate[];
  history: ReadingHistoryHint[];
  constraints: QueryConstraints;
};

export type QueryConstraints = {
  requiredGenres: string[];
  excludedGenres: string[];
  status: "completed" | "ongoing" | null;
  qualityRequested: boolean;
};

const genreHints: Array<[RegExp, string]> = [
  [/\b(hành động|action|đánh nhau)\b/i, "action"],
  [/\b(phiêu lưu|adventure)\b/i, "adventure"],
  [/\b(kỳ ảo|fantasy|phép thuật)\b/i, "fantasy"],
  [/\b(tình cảm|romance|lãng mạn)\b/i, "romance"],
  [/\b(kinh dị|horror|ma quỷ)\b/i, "horror"],
  [/\b(thể thao|sports|bóng đá)\b/i, "sports"],
  [/\b(học đường|school)\b/i, "school-life"],
  [/\b(bí ẩn|mystery|trinh thám)\b/i, "mystery"],
  [/\b(hài|comedy|hài hước)\b/i, "comedy"],
  [/\b(drama|chính kịch)\b/i, "drama"],
  [/\b(chuyển sinh|tái sinh|reincarnation)\b/i, "chuyen-sinh"],
  [/\b(xuyên không|isekai)\b/i, "xuyen-khong"],
  [/\b(cổ đại|historical|lịch sử)\b/i, "historical"],
  [/\b(tâm lý|psychological)\b/i, "psychological"],
  [/\b(khoa học viễn tưởng|sci[\s-]?fi)\b/i, "sci-fi"],
  [/\b(siêu nhiên|supernatural)\b/i, "supernatural"],
  [/\b(võ thuật|martial arts|tu tiên)\b/i, "martial-arts"],
  [/\b(đam mỹ|boy'?s love|bl)\b/i, "dam-my"],
  [/\b(ngôn tình)\b/i, "ngon-tinh"],
  [/\b(trinh thám|detective)\b/i, "trinh-tham"],
  [/\b(đời thường|slice of life)\b/i, "slice-of-life"],
];

const negativeGenrePatterns: Record<string, RegExp> = {
  action: /\b(ít|không|tránh|bớt)\s+(?:cảnh\s+)?(?:hành động|action|đánh nhau)\b/i,
  fantasy: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:kỳ ảo|fantasy|phép thuật)\b/i,
  romance: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:tình cảm|romance|lãng mạn)\b/i,
  horror: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:kinh dị|horror|ma quỷ)\b/i,
  sports: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:thể thao|sports|bóng đá)\b/i,
  "school-life": /\b(ít|không|tránh|bớt)\s+(?:bối cảnh\s+)?(?:học đường|school)\b/i,
  mystery: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:bí ẩn|mystery|trinh thám)\b/i,
  comedy: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:hài|comedy|hài hước)\b/i,
  drama: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:drama|chính kịch)\b/i,
  "chuyen-sinh": /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:chuyển sinh|tái sinh)\b/i,
  "xuyen-khong": /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:xuyên không|isekai)\b/i,
  psychological: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:tâm lý|psychological)\b/i,
  "sci-fi": /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:khoa học viễn tưởng|sci[\s-]?fi)\b/i,
  supernatural: /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:siêu nhiên|supernatural)\b/i,
  "martial-arts": /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:võ thuật|tu tiên)\b/i,
  "dam-my": /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:đam mỹ|boy'?s love|bl)\b/i,
  "ngon-tinh": /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:ngôn tình)\b/i,
  "slice-of-life": /\b(ít|không|tránh|bớt)\s+(?:yếu tố\s+)?(?:đời thường|slice of life)\b/i,
};

export function parseRecommendationConstraints(query: string): QueryConstraints {
  const excludedGenres = genreHints
    .filter(([, slug]) => negativeGenrePatterns[slug]?.test(query))
    .map(([, slug]) => slug);
  const requiredGenres = genreHints
    .filter(([pattern, slug]) => pattern.test(query) && !excludedGenres.includes(slug))
    .map(([, slug]) => slug);
  const completed = /\b(đã\s+hoàn\s+thành|hoàn\s+thành|đã\s+xong|full)\b/i.test(query);
  const ongoing = !completed && /\b(đang\s+ra|đang\s+phát\s+hành|ongoing)\b/i.test(query);
  return {
    requiredGenres: [...new Set(requiredGenres)],
    excludedGenres: [...new Set(excludedGenres)],
    status: completed ? "completed" : ongoing ? "ongoing" : null,
    qualityRequested: /\b(hay|đánh\s+giá\s+cao|review\s+tốt|nhiều\s+người\s+thích|được\s+yêu\s+thích|chất\s+lượng)\b/i.test(query),
  };
}

function dedupeStories(stories: StoryCardData[]) {
  return [...new Map(stories.map((story) => [story.id, story])).values()];
}

function overlap(left: string[], right: string[]) {
  const set = new Set(left);
  return right.filter((item) => set.has(item)).length;
}

function allTags(story: StoryCardData) {
  return new Set([...story.genreSlugs, ...story.discoveryTags]);
}

async function resolveReference(query: string) {
  const requestedReference = extractReferenceTitle(query);
  if (!requestedReference) return { requestedReference: null, reference: null };
  const matches = await searchStories(requestedReference);
  const best = matches
    .map((story) => ({
      story,
      similarity: Math.max(
        titleSimilarity(requestedReference, story.title),
        story.originTitle ? titleSimilarity(requestedReference, story.originTitle) : 0,
      ),
    }))
    .sort((left, right) => right.similarity - left.similarity)[0];
  if (!best || best.similarity < 0.42) return { requestedReference, reference: null };
  const reference = await getStory(best.story.slug, { includeExternalRating: false });
  return { requestedReference, reference };
}

export async function buildAiRecommendationContext(
  query: string,
  rawHistory: ReadingHistoryHint[],
): Promise<AiRecommendationContext> {
  const constraints = parseRecommendationConstraints(query);
  const history = rawHistory
    .filter((item) => item.title.trim())
    .slice(0, 8)
    .map((item) => ({ title: item.title.trim().slice(0, 120), storySlug: item.storySlug?.slice(0, 160) }));
  const [home, resolved] = await Promise.all([getHomeStories(), resolveReference(query)]);

  const categorySeeds = constraints.requiredGenres.length
    ? constraints.requiredGenres.slice(0, 2)
    : resolved.reference?.genreSlugs.slice(0, 2) ?? [];
  const categoryPages = await Promise.all(categorySeeds.map((primaryGenre) =>
    getFilteredDiscoverCatalog({
      include: [primaryGenre],
      status: constraints.status ?? undefined,
      sort: "rating",
      pageSize: 48,
      scanPages: 10,
    }).catch(() => null)
  ));
  const broadPage = await getFilteredDiscoverCatalog({
    include: constraints.requiredGenres,
    exclude: constraints.excludedGenres,
    status: constraints.status ?? undefined,
    sort: "rating",
    pageSize: 48,
    scanPages: 10,
  }).catch(() => null);

  let pool = dedupeStories([
    ...(broadPage?.stories ?? []),
    ...categoryPages.flatMap((catalog) => catalog?.stories ?? []),
    ...home,
  ]).filter((story) => story.slug !== resolved.reference?.slug);
  pool = pool.filter((story) => {
    const tags = allTags(story);
    return constraints.requiredGenres.every((genre) => tags.has(genre))
      && constraints.excludedGenres.every((genre) => !tags.has(genre))
      && (!constraints.status || story.status === constraints.status);
  });
  pool = await enrichStoriesWithRatings(pool);
  if (constraints.qualityRequested) {
    pool = pool.filter((story) =>
      story.scoreKind === "community"
      && (story.score ?? 0) >= 3.7
      && (story.ratingVotes ?? 0) >= 20
      && (story.negativeRatio ?? 0) <= 0.22
    );
  }

  const historySlugs = new Set(history.map((item) => item.storySlug).filter(Boolean));
  const initiallyRanked = pool
    .map((story) => {
      const genreOverlap = resolved.reference ? overlap(resolved.reference.genreSlugs, story.genreSlugs) : 0;
      const tagOverlap = resolved.reference ? overlap(resolved.reference.discoveryTags, story.discoveryTags) : 0;
      const verifiedRating = story.scoreKind === "community" ? story.score ?? 0 : 0;
      const ratingConfidence = Math.min(3, Math.log10((story.ratingVotes ?? 0) + 1));
      const hotBoost = calculateHotScore(story) * 0.08;
      const score = genreOverlap * 3.2
        + tagOverlap * 1.5
        + constraints.requiredGenres.length * 2.2
        + verifiedRating * 1.15
        + ratingConfidence
        + hotBoost
        - (historySlugs.has(story.slug) ? 4 : 0);
      return { story, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 16);

  const reviewSignals = await getCommunityReviewSignals(initiallyRanked.map(({ story }) => ({
    id: story.id,
    titles: [story.title, ...(story.originTitle?.split(/\s*·\s*/) ?? [])],
  })));
  const ranked = initiallyRanked
    .map(({ story, score }) => {
      const review = reviewSignals.get(story.id);
      const reviewBoost = review
        ? review.qualityScore * (constraints.qualityRequested ? .07 : .045) + Math.min(2.5, Math.log10(review.helpfulVotes + 1))
        : 0;
      return { story, review: review ?? null, score: score + reviewBoost };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  const details = await Promise.all(ranked.map(async ({ story, review }) => {
    const detail = await getStory(story.slug, { includeExternalRating: false }).catch(() => null);
    return {
      ...story,
      synopsis: detail?.synopsis ? detail.synopsis.slice(0, 620) : null,
      reviewSignal: review,
    } satisfies AiCandidate;
  }));

  return {
    reference: resolved.reference,
    requestedReference: resolved.requestedReference,
    candidates: details.length ? details : ranked.map(({ story, review }) => ({ ...story, synopsis: null, reviewSignal: review })),
    history,
    constraints,
  };
}
