import type { CatalogPageData, DiscoverCatalogFilters, StoryCardData } from "./catalog";

type StoryRow = {
  id: string;
  slug: string;
  canonical_title: string;
  status: string;
  content_rating: string;
  cover_url: string | null;
  latest_chapter: number | null;
  updated_at: string;
  score_5: number | null;
  source_count: number | null;
  vote_count: number | null;
  genre_names: string | null;
  genre_slugs: string | null;
  all_tags: string | null;
};

function safeStatus(value: string): StoryCardData["status"] {
  if (value === "completed" || value === "hiatus" || value === "cancelled") return value;
  return "ongoing";
}

function safeContentRating(value: string): StoryCardData["contentRating"] {
  if (value === "suggestive" || value === "mature" || value === "explicit") return value;
  return "safe";
}

function splitAggregate(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

export async function getD1DiscoverCatalog(
  db: D1Database,
  {
    query = "",
    page = 1,
    pageSize = 24,
    include = [],
    exclude = [],
    status,
    mood = "",
    format = "",
    pace = "",
    minScore = 0,
    maxChapters = 0,
    sort = "latest",
  }: DiscoverCatalogFilters,
): Promise<CatalogPageData | null> {
  const indexed = await db.prepare("SELECT COUNT(*) AS count FROM stories").first<{ count: number }>();
  const indexedCount = Number(indexed?.count ?? 0);
  if (indexedCount < 240) return null;

  const where: string[] = [];
  const bindings: Array<string | number> = [];
  if (query.trim()) {
    where.push("LOWER(s.canonical_title) LIKE LOWER(?)");
    bindings.push(`%${query.trim()}%`);
  }
  if (status === "ongoing" || status === "completed" || status === "hiatus" || status === "cancelled") {
    where.push("s.status = ?");
    bindings.push(status);
  }
  const requiredTags = [...new Set([...include, mood, format, pace].filter(Boolean))];
  for (const tag of requiredTags) {
    where.push("EXISTS (SELECT 1 FROM story_genres required_sg JOIN genres required_g ON required_g.id = required_sg.genre_id WHERE required_sg.story_id = s.id AND required_g.slug = ?)");
    bindings.push(tag);
  }
  for (const tag of [...new Set(exclude.filter(Boolean))]) {
    where.push("NOT EXISTS (SELECT 1 FROM story_genres excluded_sg JOIN genres excluded_g ON excluded_g.id = excluded_sg.genre_id WHERE excluded_sg.story_id = s.id AND excluded_g.slug = ?)");
    bindings.push(tag);
  }
  if (minScore > 0) {
    where.push("ss.score_5 >= ?");
    bindings.push(minScore);
  }
  if (maxChapters > 0) {
    where.push("s.latest_chapter IS NOT NULL AND s.latest_chapter <= ?");
    bindings.push(maxChapters);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRow = await db.prepare(
    `SELECT COUNT(*) AS count FROM stories s LEFT JOIN story_scores ss ON ss.story_id = s.id ${whereSql}`,
  ).bind(...bindings).first<{ count: number }>();
  const totalItems = Number(countRow?.count ?? 0);
  const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 24, 1), 48);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
  const offset = (safePage - 1) * safePageSize;

  let orderSql = "s.updated_at DESC";
  const orderBindings: Array<string | number> = [];
  if (sort === "rating") {
    orderSql = "CASE WHEN COALESCE(ss.source_count, 0) > 0 THEN 1 ELSE 0 END DESC, ss.score_5 DESC, ss.vote_count DESC, s.updated_at DESC";
  } else if (sort === "shortest") {
    orderSql = "CASE WHEN s.latest_chapter IS NULL THEN 1 ELSE 0 END, s.latest_chapter ASC, s.updated_at DESC";
  } else if (sort === "relevance" && query.trim()) {
    orderSql = "CASE WHEN LOWER(s.canonical_title) = LOWER(?) THEN 0 WHEN LOWER(s.canonical_title) LIKE LOWER(?) THEN 1 ELSE 2 END, s.updated_at DESC";
    orderBindings.push(query.trim(), `${query.trim()}%`);
  }

  const rows = await db.prepare(`
    SELECT
      s.id, s.slug, s.canonical_title, s.status, s.content_rating, s.cover_url,
      s.latest_chapter, s.updated_at, ss.score_5, ss.source_count, ss.vote_count,
      GROUP_CONCAT(DISTINCT CASE WHEN sg.origin = 'source' THEN g.name END) AS genre_names,
      GROUP_CONCAT(DISTINCT CASE WHEN sg.origin = 'source' THEN g.slug END) AS genre_slugs,
      GROUP_CONCAT(DISTINCT g.slug) AS all_tags
    FROM stories s
    LEFT JOIN story_scores ss ON ss.story_id = s.id
    LEFT JOIN story_genres sg ON sg.story_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    ${whereSql}
    GROUP BY s.id
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?
  `).bind(...bindings, ...orderBindings, safePageSize, offset).all<StoryRow>();

  const stories = (rows.results ?? []).map((row): StoryCardData => {
    const sourceCount = Number(row.source_count ?? 0);
    const score = row.score_5 === null ? null : Number(row.score_5);
    return {
      id: row.id,
      slug: row.slug,
      title: row.canonical_title,
      originTitle: null,
      coverUrl: row.cover_url,
      status: safeStatus(row.status),
      contentRating: safeContentRating(row.content_rating),
      genres: splitAggregate(row.genre_names),
      genreSlugs: splitAggregate(row.genre_slugs),
      discoveryTags: splitAggregate(row.all_tags).filter((tag) => !splitAggregate(row.genre_slugs).includes(tag)),
      latestChapter: row.latest_chapter === null ? null : String(row.latest_chapter),
      latestChapterId: null,
      updatedAt: row.updated_at,
      score,
      scoreSource: sourceCount > 0
        ? `Điểm cộng đồng · ${Number(row.vote_count ?? 0).toLocaleString("vi-VN")} lượt chấm`
        : score === null ? null : "Điểm Mực tạm tính · chờ đối chiếu nguồn cộng đồng",
      scoreKind: sourceCount > 0 ? "community" : "provisional",
      ratingVotes: Number(row.vote_count ?? 0),
    };
  });

  return {
    stories,
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    sourceLabel: `D1 · ${indexedCount.toLocaleString("vi-VN")} truyện đã lập chỉ mục · lọc trước khi chia trang`,
  };
}
