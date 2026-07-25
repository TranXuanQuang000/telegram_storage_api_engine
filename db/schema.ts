import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  emailHash: text("email_hash").notNull().unique(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  medium: text("medium", { enum: ["comic", "novel"] }).notNull().default("comic"),
  canonicalTitle: text("canonical_title").notNull(),
  synopsis: text("synopsis").notNull().default(""),
  author: text("author"),
  status: text("status", { enum: ["ongoing", "completed", "hiatus", "cancelled"] }).notNull().default("ongoing"),
  origin: text("origin"),
  contentRating: text("content_rating", { enum: ["safe", "suggestive", "mature", "explicit"] }).notNull().default("safe"),
  coverUrl: text("cover_url"),
  latestChapter: real("latest_chapter"),
  latestChapterLabel: text("latest_chapter_label"),
  latestChapterId: text("latest_chapter_id"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("stories_updated_idx").on(table.updatedAt), index("stories_status_idx").on(table.status)]);

export const genres = sqliteTable("genres", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const storyGenres = sqliteTable("story_genres", {
  storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  genreId: text("genre_id").notNull().references(() => genres.id, { onDelete: "cascade" }),
  origin: text("origin", { enum: ["source", "rule", "machine"] }).notNull(),
  confidence: real("confidence").notNull().default(1),
}, (table) => [primaryKey({ columns: [table.storyId, table.genreId] })]);

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  kind: text("kind", { enum: ["api", "opds", "feed", "link-only"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  licenseMode: text("license_mode").notNull(),
  lastSyncAt: text("last_sync_at"),
});

export const sourceItems = sqliteTable("source_items", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  storyId: text("story_id").notNull().references(() => stories.id),
  externalId: text("external_id").notNull(),
  externalUrl: text("external_url").notNull(),
  etag: text("etag"),
  sourceUpdatedAt: text("source_updated_at"),
  lastCheckedAt: text("last_checked_at"),
}, (table) => [uniqueIndex("source_items_external_idx").on(table.sourceId, table.externalId)]);

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(),
  storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  sourceItemId: text("source_item_id").references(() => sourceItems.id),
  number: real("number").notNull(),
  title: text("title").notNull().default(""),
  language: text("language").notNull().default("vi"),
  pageCount: integer("page_count").notNull().default(0),
  publishedAt: text("published_at"),
  externalUrl: text("external_url").notNull(),
}, (table) => [index("chapters_story_number_idx").on(table.storyId, table.number)]);

export const ratingSnapshots = sqliteTable("rating_snapshots", {
  id: text("id").primaryKey(),
  storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull().references(() => sources.id),
  score5: real("score_5").notNull(),
  voteCount: integer("vote_count").notNull().default(0),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sourceUrl: text("source_url").notNull(),
});

export const storyScores = sqliteTable("story_scores", {
  storyId: text("story_id").primaryKey().references(() => stories.id, { onDelete: "cascade" }),
  score5: real("score_5"),
  confidence: text("confidence", { enum: ["insufficient", "low", "medium", "high"] }).notNull().default("insufficient"),
  sourceCount: integer("source_count").notNull().default(0),
  voteCount: integer("vote_count").notNull().default(0),
  computedAt: text("computed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const libraryEntries = sqliteTable("library_entries", {
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["reading", "planned", "completed", "paused", "dropped"] }).notNull(),
  followed: integer("followed", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.profileId, table.storyId] }), index("library_profile_status_idx").on(table.profileId, table.status)]);

export const readingProgress = sqliteTable("reading_progress", {
  profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  storyId: text("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").notNull(),
  chapterName: text("chapter_name").notNull().default(""),
  page: integer("page").notNull().default(0),
  totalPages: integer("total_pages").notNull().default(0),
  progress: real("progress").notNull().default(0),
  storyTitle: text("story_title"),
  coverUrl: text("cover_url"),
  medium: text("medium", { enum: ["comic", "novel"] }).notNull().default("comic"),
  locator: text("locator"),
  idempotencyKey: text("idempotency_key").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.profileId, table.storyId] }), uniqueIndex("progress_idempotency_idx").on(table.idempotencyKey)]);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
  cursor: text("cursor"),
  imported: integer("imported").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
  errorSummary: text("error_summary"),
});

