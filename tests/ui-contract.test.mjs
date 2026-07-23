import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Vietnamese typography and full-cover rules are wired into the product", () => {
  const layout = source("app/layout.tsx");
  const css = source("app/globals.css");
  const card = source("components/StoryCard.tsx");
  assert.match(layout, /Be_Vietnam_Pro/);
  assert.match(layout, /subsets: \["latin", "vietnamese"\]/);
  assert.match(css, /\.story-cover > img[\s\S]*height: 100% !important[\s\S]*object-fit: cover !important/);
  assert.match(card, /cover-rating/);
});

test("reader exposes exit routes, chapter list and chapter-boundary navigation", () => {
  const reader = source("components/ReaderClient.tsx");
  assert.match(reader, /aria-label="Về trang chủ"/);
  assert.match(reader, /aria-label="Tiếp tục tìm truyện"/);
  assert.match(reader, /aria-label="Mở danh sách chương"/);
  assert.match(reader, /if \(page >= pages\.length\)[\s\S]*openChapter\(nextChapter\)/);
  assert.match(reader, /aria-label="Chương tiếp theo"/);
});

test("discovery labels rating honestly and reports approximate title matches", () => {
  const filters = source("components/DiscoverFilters.tsx");
  const page = source("app/discover/page.tsx");
  assert.match(filters, /Đánh giá cao nhất/);
  assert.doesNotMatch(filters, /Điểm tin cậy/);
  assert.match(page, /Không có truyện nào tên chính xác/);
  assert.match(page, /Tên truyện gần giống/);
});

test("story navigation preserves a basic preview while the full detail streams", () => {
  const previewLink = source("components/StoryPreviewLink.tsx");
  const preview = source("components/StoryLoadingPreview.tsx");
  const loadingRoute = source("app/story/[slug]/loading.tsx");
  const card = source("components/StoryCard.tsx");
  assert.match(previewLink, /sessionStorage\.setItem\(STORY_PREVIEW_KEY/);
  assert.match(preview, /Đang tải tóm tắt, mục lục và đối chiếu điểm cộng đồng/);
  assert.match(loadingRoute, /<StoryLoadingPreview \/>/);
  assert.match(card, /<StoryPreviewLink[\s\S]*story=\{story\}/);
});

test("AI output is converted into real clickable catalog stories", () => {
  const route = source("app/api/ai/recommend/route.ts");
  const settings = source("components/AiSettings.tsx");
  assert.match(route, /parseModelRecommendations/);
  assert.match(route, /recommendations: result\.recommendations/);
  assert.match(route, /Không dùng title thay cho id/);
  assert.match(settings, /className="ai-recommendation-card"/);
  assert.match(settings, /<StoryPreviewLink[\s\S]*story=\{story\}/);
  assert.match(settings, /Đọc ngay/);
});

test("ratings try three public sources and label provisional coverage", () => {
  const external = source("lib/external-ratings.ts");
  const catalog = source("lib/catalog.ts");
  const panel = source("components/RatingPanel.tsx");
  assert.match(external, /fetchAniList/);
  assert.match(external, /fetchKitsu/);
  assert.match(external, /fetchJikan/);
  assert.match(catalog, /scoreKind: score \? "community" : "provisional"/);
  assert.match(panel, /Điểm Mực tạm tính/);
  assert.match(panel, /AniList, Kitsu và MyAnimeList/);
});
