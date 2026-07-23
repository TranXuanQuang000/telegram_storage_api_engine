import {
  getDiscoverCatalog,
  getHomeStories,
  getStory,
  searchStories,
  type StoryCardData,
  type StoryDetailData,
} from "./catalog";
import { extractReferenceTitle, titleSimilarity } from "./search-utils";

export { extractReferenceTitle } from "./search-utils";

export type ReadingHistoryHint = {
  title: string;
  storySlug?: string;
};

export type AiCandidate = StoryCardData & {
  synopsis: string | null;
};

export type AiRecommendationContext = {
  reference: StoryDetailData | null;
  requestedReference: string | null;
  candidates: AiCandidate[];
  history: ReadingHistoryHint[];
};

const genreHints: Array<[RegExp, string]> = [
  [/\b(hành động|action|đánh nhau)\b/i, "action"],
  [/\b(kỳ ảo|fantasy|phép thuật)\b/i, "fantasy"],
  [/\b(tình cảm|romance|lãng mạn)\b/i, "romance"],
  [/\b(kinh dị|horror|ma quỷ)\b/i, "horror"],
  [/\b(thể thao|sports|bóng đá)\b/i, "sports"],
  [/\b(học đường|school)\b/i, "school-life"],
  [/\b(bí ẩn|mystery|trinh thám)\b/i, "mystery"],
];

function dedupeStories(stories: StoryCardData[]) {
  return [...new Map(stories.map((story) => [story.id, story])).values()];
}

function overlap(left: string[], right: string[]) {
  const set = new Set(left);
  return right.filter((item) => set.has(item)).length;
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
  const history = rawHistory
    .filter((item) => item.title.trim())
    .slice(0, 8)
    .map((item) => ({ title: item.title.trim().slice(0, 120), storySlug: item.storySlug?.slice(0, 160) }));
  const [home, resolved] = await Promise.all([getHomeStories(), resolveReference(query)]);
  const genreSlugs = resolved.reference?.genreSlugs.slice(0, 2)
    ?? genreHints.filter(([pattern]) => pattern.test(query)).map(([, slug]) => slug).slice(0, 2);
  const categoryPages = await Promise.all(genreSlugs.map((primaryGenre) =>
    getDiscoverCatalog({ primaryGenre, page: 1 }).catch(() => null)
  ));
  const pool = dedupeStories([
    ...home,
    ...categoryPages.flatMap((page) => page?.stories ?? []),
  ]).filter((story) => story.slug !== resolved.reference?.slug);
  const historySlugs = new Set(history.map((item) => item.storySlug).filter(Boolean));
  const ranked = pool
    .map((story) => {
      const genreOverlap = resolved.reference ? overlap(resolved.reference.genreSlugs, story.genreSlugs) : 0;
      const tagOverlap = resolved.reference ? overlap(resolved.reference.discoveryTags, story.discoveryTags) : 0;
      const queryGenreBoost = genreHints.reduce((score, [pattern, slug]) => score + (pattern.test(query) && story.genreSlugs.includes(slug) ? 1 : 0), 0);
      const score = genreOverlap * 3 + tagOverlap * 1.5 + queryGenreBoost * 2 + (story.score ?? 0) * .35 - (historySlugs.has(story.slug) ? 2 : 0);
      return { story, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
  const details = await Promise.all(ranked.slice(0, 8).map(async ({ story }) => {
    const detail = await getStory(story.slug, { includeExternalRating: false }).catch(() => null);
    return {
      ...story,
      synopsis: detail?.synopsis ? detail.synopsis.slice(0, 520) : null,
    } satisfies AiCandidate;
  }));

  return {
    reference: resolved.reference,
    requestedReference: resolved.requestedReference,
    candidates: details.length ? details : ranked.map(({ story }) => ({ ...story, synopsis: null })),
    history,
  };
}
