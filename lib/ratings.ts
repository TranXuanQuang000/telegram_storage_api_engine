export type RatingConfidence = "insufficient" | "low" | "medium" | "high";

export type RatingSnapshot = {
  sourceId: string;
  sourceName: string;
  score5: number;
  voteCount: number;
  capturedAt: string;
  sourceUrl: string;
};

export type RatingAggregate = {
  score5: number | null;
  confidence: RatingConfidence;
  sourceCount: number;
  voteCount: number;
  isAggregate: boolean;
  computedAt: string;
  sources: RatingSnapshot[];
};

const PRIOR_MEAN = 3.5;
const PRIOR_VOTES = 25;
const HALF_LIFE_DAYS = 365;

const sourceReliability: Record<string, number> = {
  anilist: 1,
  kitsu: 0.92,
  "jikan-mal": 0.96,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function freshnessWeight(capturedAt: string, now: Date) {
  const age = Math.max(0, now.getTime() - new Date(capturedAt).getTime());
  if (!Number.isFinite(age)) return 0.25;
  const ageDays = age / 86_400_000;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

export function aggregateRatings(input: RatingSnapshot[], now = new Date()): RatingAggregate {
  const latestBySource = new Map<string, RatingSnapshot>();
  for (const snapshot of input) {
    if (!snapshot.sourceId || !Number.isFinite(snapshot.score5) || snapshot.score5 < 0 || snapshot.score5 > 5) continue;
    const clean = { ...snapshot, voteCount: Math.max(0, Math.floor(snapshot.voteCount)) };
    const previous = latestBySource.get(clean.sourceId);
    if (!previous || new Date(clean.capturedAt) > new Date(previous.capturedAt)) latestBySource.set(clean.sourceId, clean);
  }

  const sources = [...latestBySource.values()];
  if (!sources.length) {
    return { score5: null, confidence: "insufficient", sourceCount: 0, voteCount: 0, isAggregate: false, computedAt: now.toISOString(), sources: [] };
  }

  let weightedScore = 0;
  let totalWeight = 0;
  for (const source of sources) {
    const votes = source.voteCount;
    const bayesianScore = ((source.score5 * votes) + (PRIOR_MEAN * PRIOR_VOTES)) / (votes + PRIOR_VOTES);
    const reliability = sourceReliability[source.sourceId] ?? 0.75;
    const evidenceWeight = Math.max(1, Math.log10(votes + 10));
    const weight = reliability * evidenceWeight * freshnessWeight(source.capturedAt, now);
    weightedScore += bayesianScore * weight;
    totalWeight += weight;
  }

  const voteCount = sources.reduce((total, source) => total + source.voteCount, 0);
  const sourceCount = sources.length;
  let confidence: RatingConfidence = "low";
  if (sourceCount >= 2 && voteCount >= 1_000) confidence = "high";
  else if ((sourceCount >= 2 && voteCount >= 100) || voteCount >= 1_000) confidence = "medium";

  return {
    score5: Math.round(clamp(weightedScore / totalWeight, 0, 5) * 100) / 100,
    confidence,
    sourceCount,
    voteCount,
    isAggregate: sourceCount >= 2,
    computedAt: now.toISOString(),
    sources: sources.sort((a, b) => b.voteCount - a.voteCount),
  };
}

export function ratingConfidenceLabel(confidence: RatingConfidence) {
  return {
    insufficient: "chưa đủ dữ liệu",
    low: "độ tin cậy thấp",
    medium: "độ tin cậy vừa",
    high: "độ tin cậy cao",
  }[confidence];
}
