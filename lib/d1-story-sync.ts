export type OTruyenStorySnapshot = {
  id: string;
  slug: string;
  title?: string;
  synopsis?: string;
  status?: "ongoing" | "completed" | "hiatus" | "cancelled";
  originTitle?: string | null;
  contentRating?: "safe" | "suggestive" | "mature" | "explicit";
  coverUrl?: string | null;
  latestChapter: string | null;
  latestChapterId: string | null;
  updatedAt: string;
  chapters: Array<{
    id: string;
    number: string;
    title: string;
    apiUrl: string;
    source?: "otruyen" | "nettruyen" | "truyenqq";
  }>;
};

async function batchInChunks(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

export async function persistOTruyenStorySnapshot(db: D1Database, story: OTruyenStorySnapshot) {
  let sourceItem = await db.prepare(
    "SELECT id, story_id FROM source_items WHERE source_id = 'source_otruyen' AND (story_id = ? OR external_url LIKE ?) LIMIT 1",
  ).bind(story.id, `%/${story.slug}`).first<{ id: string; story_id: string }>();
  if (!sourceItem && story.title) {
    const sourceItemId = `otruyen_${story.id}`;
    await db.batch([
      db.prepare(`
        INSERT INTO sources (id, slug, name, base_url, kind, enabled, license_mode, last_sync_at)
        VALUES ('source_otruyen', 'otruyen', 'OTruyen API', 'https://otruyenapi.com', 'api', 1, 'Public compatibility API with per-item provenance', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET enabled = 1, last_sync_at = CURRENT_TIMESTAMP
      `),
      db.prepare(`
        INSERT INTO stories (id, slug, medium, canonical_title, synopsis, author, status, origin, content_rating, cover_url, latest_chapter, latest_chapter_label, latest_chapter_id, updated_at)
        VALUES (?, ?, 'comic', ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, canonical_title = excluded.canonical_title, synopsis = excluded.synopsis, status = excluded.status, origin = excluded.origin, content_rating = excluded.content_rating, cover_url = excluded.cover_url
      `).bind(
        story.id,
        story.slug,
        story.title,
        story.synopsis ?? "",
        story.status ?? "ongoing",
        story.originTitle,
        story.contentRating ?? "safe",
        story.coverUrl,
        story.updatedAt,
      ),
      db.prepare(`
        INSERT INTO source_items (id, source_id, story_id, external_id, external_url, etag, source_updated_at, last_checked_at)
        VALUES (?, 'source_otruyen', ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source_id, external_id) DO UPDATE SET story_id = excluded.story_id, external_url = excluded.external_url, source_updated_at = excluded.source_updated_at, last_checked_at = CURRENT_TIMESTAMP
      `).bind(sourceItemId, story.id, story.id, `https://otruyen.cc/truyen-tranh/${story.slug}`, story.updatedAt),
    ]);
    sourceItem = { id: sourceItemId, story_id: story.id };
  }
  if (!sourceItem) return false;
  const oTruyenChapters = story.chapters.filter((chapter) => !chapter.source || chapter.source === "otruyen");
  const oTruyenLatest = oTruyenChapters[0] ?? null;
  const latestLabel = oTruyenLatest?.number ?? story.latestChapter;
  const latestId = oTruyenLatest?.id ?? story.latestChapterId;
  const latestNumber = Number.parseFloat(latestLabel ?? "");
  await db.batch([
    db.prepare(`
      UPDATE stories
      SET latest_chapter = CASE WHEN latest_chapter IS NULL OR latest_chapter <= ? THEN ? ELSE latest_chapter END,
          latest_chapter_label = CASE WHEN latest_chapter IS NULL OR latest_chapter <= ? THEN ? ELSE latest_chapter_label END,
          latest_chapter_id = CASE WHEN latest_chapter IS NULL OR latest_chapter <= ? THEN ? ELSE latest_chapter_id END,
          updated_at = CASE WHEN updated_at < ? THEN ? ELSE updated_at END
      WHERE id = ?
    `).bind(
      Number.isFinite(latestNumber) ? latestNumber : null,
      Number.isFinite(latestNumber) ? latestNumber : null,
      Number.isFinite(latestNumber) ? latestNumber : null,
      latestLabel,
      Number.isFinite(latestNumber) ? latestNumber : null,
      latestId,
      story.updatedAt,
      story.updatedAt,
      sourceItem.story_id,
    ),
    db.prepare(
      "UPDATE source_items SET source_updated_at = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(story.updatedAt, sourceItem.id),
  ]);
  const statements = oTruyenChapters.flatMap((chapter, index) => {
    const chapterNumber = Number.parseFloat(chapter.number);
    return chapter.id && chapter.apiUrl ? [
      db.prepare(`
        INSERT INTO chapters (id, story_id, source_item_id, number, title, language, page_count, published_at, external_url)
        VALUES (?, ?, ?, ?, ?, 'vi', 0, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET
          story_id = excluded.story_id,
          source_item_id = excluded.source_item_id,
          number = excluded.number,
          title = excluded.title,
          external_url = excluded.external_url
      `).bind(
        chapter.id,
        sourceItem.story_id,
        sourceItem.id,
        Number.isFinite(chapterNumber) ? chapterNumber : index + 1,
        chapter.title,
        chapter.apiUrl,
      ),
    ] : [];
  });
  await batchInChunks(db, statements);
  return true;
}
