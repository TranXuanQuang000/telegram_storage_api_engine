import { getExternalRating } from "../external-ratings";

export type RatingIngestResult = { checked: number; enriched: number; failed: number };

type StoryRow = { id: string; title: string };

const ratingSources = [
  ["source_anilist", "anilist", "AniList", "https://anilist.co", "Public GraphQL API; aggregate score metadata with attribution and short TTL"],
  ["source_kitsu", "kitsu", "Kitsu", "https://kitsu.io", "Public JSON:API; aggregate score metadata with attribution and short TTL"],
  ["source_jikan-mal", "jikan-mal", "MyAnimeList (Jikan)", "https://api.jikan.moe", "Read-only Jikan API for public MyAnimeList score metadata; cached and rate-limited"],
] as const;

export async function runRatingEnrichment(db: D1Database, requestedLimit = 6): Promise<RatingIngestResult> {
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 12);
  const sourceStatements = ratingSources.map(([id, slug, name, url, license]) => db.prepare(
    "INSERT INTO sources (id, slug, name, base_url, kind, enabled, license_mode, last_sync_at) VALUES (?, ?, ?, ?, 'api', 1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET enabled = 1, license_mode = excluded.license_mode, last_sync_at = CURRENT_TIMESTAMP",
  ).bind(id, slug, name, url, license));
  await db.batch(sourceStatements);

  const rows = await db.prepare(
    "SELECT s.id, s.canonical_title AS title FROM stories s LEFT JOIN story_scores ss ON ss.story_id = s.id ORDER BY CASE WHEN ss.source_count IS NULL OR ss.source_count = 0 THEN 0 ELSE 1 END, ss.computed_at ASC, s.updated_at DESC LIMIT ?",
  ).bind(limit).all<StoryRow>();

  let enriched = 0;
  let failed = 0;
  for (const story of rows.results ?? []) {
    try {
      const aggregate = await getExternalRating([story.title]);
      if (!aggregate.sources.length || aggregate.score5 === null) continue;
      const statements = aggregate.sources.map((source) => db.prepare(
        "INSERT INTO rating_snapshots (id, story_id, source_id, score_5, vote_count, captured_at, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(`rating_${crypto.randomUUID()}`, story.id, `source_${source.sourceId}`, source.score5, source.voteCount, source.capturedAt, source.sourceUrl));
      statements.push(db.prepare(
        "INSERT INTO story_scores (story_id, score_5, confidence, source_count, vote_count, computed_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(story_id) DO UPDATE SET score_5 = excluded.score_5, confidence = excluded.confidence, source_count = excluded.source_count, vote_count = excluded.vote_count, computed_at = excluded.computed_at",
      ).bind(story.id, aggregate.score5, aggregate.confidence, aggregate.sourceCount, aggregate.voteCount, aggregate.computedAt));
      await db.batch(statements);
      enriched += 1;
    } catch {
      failed += 1;
    }
  }
  return { checked: rows.results?.length ?? 0, enriched, failed };
}
