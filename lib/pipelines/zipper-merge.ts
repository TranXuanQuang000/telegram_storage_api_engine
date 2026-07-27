import { logger } from '../logger.js';

export interface StoryEntity {
  id: string;
  title: string;
  author?: string | null;
  synopsis?: string | null;
}

export interface ChapterEntity {
  id: string;
  story_id?: string;
  title: string;
  number?: number;
  consent_status?: 'VERIFIED' | 'FLAG' | 'UNKNOWN';
  provenances?: Record<string, unknown>[];
  externalUrl?: string;
  pageCount?: number;
}

export interface MergeResult<T> {
  mergedItem: T;
  mergedSourceIds: string[];
  confidence: number;
}

/**
 * Normalizes text for similarity comparison (lowercase, strip accents/diacritics, remove punctuation).
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ') // remove special chars
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates Jaccard Similarity between two strings based on token sets.
 */
export function jaccardSimilarity(strA: string, strB: string): number {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);

  if (!normA || !normB) return normA === normB ? 1.0 : 0.0;

  const setA = new Set(normA.split(' '));
  const setB = new Set(normB.split(' '));

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 1.0;
  return intersection.size / union.size;
}

/**
 * Calculates Levenshtein Distance ratio between two strings (0.0 to 1.0).
 */
export function levenshteinSimilarity(strA: string, strB: string): number {
  const a = normalizeText(strA);
  const b = normalizeText(strB);

  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);
  return 1.0 - distance / maxLength;
}

/**
 * Entity Resolution for Stories.
 * Computes match confidence between two story entities.
 */
export function computeStoryEntityMatchConfidence(storyA: StoryEntity, storyB: StoryEntity): number {
  const titleJaccard = jaccardSimilarity(storyA.title, storyB.title);
  const titleLevenshtein = levenshteinSimilarity(storyA.title, storyB.title);
  const titleScore = (titleJaccard + titleLevenshtein) / 2;

  let authorScore = 0.5; // Default neutral if missing
  if (storyA.author && storyB.author) {
    authorScore = jaccardSimilarity(storyA.author, storyB.author);
  }

  const combinedConfidence = titleScore * 0.7 + authorScore * 0.3;
  return Math.min(1.0, Math.max(0.0, Number(combinedConfidence.toFixed(4))));
}

/**
 * Parses chapter number from title (e.g. "Chương 105: Tập mới" -> 105, "Chap 1.5" -> 1.5).
 */
export function extractChapterNumber(title: string, fallbackNumber?: number): number {
  if (typeof fallbackNumber === 'number' && !isNaN(fallbackNumber)) {
    return fallbackNumber;
  }

  const match = title.match(/(?:chương|chap|chapter| tập|c)\s*(\d+(?:\.\d+)?)/i);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }

  const loneNum = title.match(/(\d+(?:\.\d+)?)/);
  if (loneNum && loneNum[1]) {
    return parseFloat(loneNum[1]);
  }

  return 0;
}

/**
 * Zipper Chapter Merge Algorithm.
 * Merges chapter lists from multiple sources into a single deduplicated, ordered list.
 */
export function zipperMergeChapters(chapterLists: ChapterEntity[][]): ChapterEntity[] {
  const chapterMap = new Map<number, ChapterEntity[]>();

  // Group chapters by number
  for (const list of chapterLists) {
    for (const chap of list) {
      const num = chap.number ?? extractChapterNumber(chap.title);
      if (!chapterMap.has(num)) {
        chapterMap.set(num, []);
      }
      chapterMap.get(num)!.push(chap);
    }
  }

  const sortedNumbers = Array.from(chapterMap.keys()).sort((a, b) => a - b);
  const mergedResult: ChapterEntity[] = [];

  for (const num of sortedNumbers) {
    const candidates = chapterMap.get(num)!;

    // Pick the best candidate (VERIFIED consent status preferred, highest page count, or first)
    candidates.sort((a, b) => {
      if (a.consent_status === 'VERIFIED' && b.consent_status !== 'VERIFIED') return -1;
      if (b.consent_status === 'VERIFIED' && a.consent_status !== 'VERIFIED') return 1;
      return (b.pageCount || 0) - (a.pageCount || 0);
    });

    const primary = candidates[0];
    const provenances = candidates.map((c) => ({
      id: c.id,
      title: c.title,
      consent_status: c.consent_status || 'UNKNOWN',
      externalUrl: c.externalUrl,
    }));

    mergedResult.push({
      ...primary,
      number: num,
      provenances,
    });
  }

  logger.info({
    msg: 'Zipper chapter merge completed',
    totalInputLists: chapterLists.length,
    mergedCount: mergedResult.length,
  });

  return mergedResult;
}

/**
 * Performs merging of multiple story entities into a target story.
 */
export function mergeStories(sources: StoryEntity[], target: StoryEntity): MergeResult<StoryEntity> {
  const sourceIds = sources.map((s) => s.id);
  const confidences = sources.map((s) => computeStoryEntityMatchConfidence(s, target));
  const avgConfidence = confidences.reduce((sum, val) => sum + val, 0) / (confidences.length || 1);

  const mergedStory: StoryEntity = {
    ...target,
    author: target.author || sources.find((s) => s.author)?.author || null,
    synopsis: target.synopsis || sources.find((s) => s.synopsis)?.synopsis || null,
  };

  logger.info({
    msg: 'Story merge executed',
    targetId: target.id,
    sourceIds,
    avgConfidence,
  });

  return {
    mergedItem: mergedStory,
    mergedSourceIds: sourceIds,
    confidence: Number(avgConfidence.toFixed(4)),
  };
}
