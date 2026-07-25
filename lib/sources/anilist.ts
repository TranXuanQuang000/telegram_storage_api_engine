import { aggregateRatings } from "../ratings";
import type { StoryCardData, StoryDetailData } from "../catalog";
import { normalizeTitle } from "../search-utils";
import sourceMetadata from "../../data/source-metadata.json";

type AniListMedia = {
  id: number;
  siteUrl?: string;
  title?: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string };
  status?: string;
  chapters?: number | null;
  updatedAt?: number;
  genres?: string[];
  averageScore?: number | null;
  popularity?: number;
  description?: string | null;
  countryOfOrigin?: string;
};

const snapshot = sourceMetadata as { generatedAt?: string | null; anilist: AniListMedia[] };

function title(media: AniListMedia) {
  return media.title?.english ?? media.title?.romaji ?? media.title?.native ?? "Chưa rõ tên";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function status(value?: string): StoryCardData["status"] {
  if (value === "FINISHED") return "completed";
  if (value === "HIATUS") return "hiatus";
  if (value === "CANCELLED") return "cancelled";
  return "ongoing";
}

function normalize(media: AniListMedia): StoryCardData {
  const genres = media.genres ?? [];
  const updatedAt = media.updatedAt ? new Date(media.updatedAt * 1_000).toISOString() : new Date(0).toISOString();
  return {
    id: `anilist_${media.id}`,
    slug: `anilist-${media.id}`,
    title: title(media),
    originTitle: media.title?.native && media.title.native !== title(media) ? media.title.native : null,
    coverUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    status: status(media.status),
    contentRating: "safe",
    genres,
    genreSlugs: genres.map(slugify),
    discoveryTags: [],
    latestChapter: media.chapters ? String(media.chapters) : null,
    latestChapterId: null,
    updatedAt,
    score: media.averageScore ? Math.round(media.averageScore / 20 * 100) / 100 : null,
    scoreSource: media.averageScore
      ? `AniList · ${media.popularity?.toLocaleString("vi-VN") ?? 0} người quan tâm`
      : null,
    scoreKind: media.averageScore ? "community" : undefined,
    ratingVotes: media.popularity,
    recommendationReason: "Metadata AniList · đọc tại nguồn được cấp quyền",
  };
}

export async function queryAniListStories(query = "", page = 1, limit = 20) {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 20, 1), 30);
  const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), 100);
  const needle = normalizeTitle(query);
  const filtered = needle
    ? snapshot.anilist.filter((media) =>
      normalizeTitle(`${media.title?.english ?? ""} ${media.title?.romaji ?? ""} ${media.title?.native ?? ""}`)
        .includes(needle)
    )
    : snapshot.anilist;
  const offset = (safePage - 1) * safeLimit;
  return filtered.slice(offset, offset + safeLimit).map(normalize);
}

export async function getAniListStory(slug: string): Promise<StoryDetailData | null> {
  const id = Number(slug.match(/^anilist-(\d{1,12})$/)?.[1]);
  if (!Number.isFinite(id)) return null;
  const media = snapshot.anilist.find((item) => item.id === id);
  if (!media) return null;
  const story = normalize(media);
  return {
    ...story,
    synopsis: (media.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    authors: [],
    chapters: [],
    sourceUrl: media.siteUrl ?? `https://anilist.co/manga/${id}`,
    sourceName: "AniList",
    rating: aggregateRatings([]),
  };
}
