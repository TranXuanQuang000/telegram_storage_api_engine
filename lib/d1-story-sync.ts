export type OTruyenStorySnapshot = {
  id: string;
  slug: string;
  latestChapter: string | null;
  latestChapterId: string | null;
  updatedAt: string;
  chapters: Array<{
    id: string;
    number: string;
    title: string;
    apiUrl: string;
  }>;
};

async function batchInChunks(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

export async function persistOTruyenStorySnapshot(db: D1Database, story: OTruyenStorySnapshot) {
  const sourceItem = await db.prepare(
    "SELECT id, story_id FROM source_items WHERE source_id = 'source_otruyen' AND (story_id = ? OR external_url LIKE ?) LIMIT 1",
  ).bind(story.id, `%/${story.slug}`).first<{ id: string; story_id: string }>();
  if (!sourceItem) return false;
  const latestNumber = Number.parseFloat(story.latestChapter ?? "");
  await db.batch([
    db.prepare(`
      UPDATE stories
      SET latest_chapter = ?,
          latest_chapter_label = ?,
          latest_chapter_id = ?,
          updated_at = CASE WHEN updated_at < ? THEN ? ELSE updated_at END
      WHERE id = ?
    `).bind(
      Number.isFinite(latestNumber) ? latestNumber : null,
      story.latestChapter,
      story.latestChapterId,
      story.updatedAt,
      story.updatedAt,
      sourceItem.story_id,
    ),
    db.prepare(
      "UPDATE source_items SET source_updated_at = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(story.updatedAt, sourceItem.id),
  ]);
  const statements = story.chapters.flatMap((chapter, index) => {
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
