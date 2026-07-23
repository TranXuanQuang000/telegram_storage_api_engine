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
  const story = source("app/story/[slug]/page.tsx");
  assert.match(reader, /aria-label="Về trang chủ"/);
  assert.match(reader, /aria-label="Tiếp tục tìm truyện"/);
  assert.match(reader, /aria-label="Mở danh sách chương"/);
  assert.match(reader, /if \(page >= pages\.length\)[\s\S]*openChapter\(nextChapter\)/);
  assert.match(reader, /aria-label="Chương tiếp theo"/);
  assert.match(story, /story\.chapters\.at\(-1\)/);
  assert.match(story, /Đọc từ đầu/);
});

test("discovery labels rating honestly and reports approximate title matches", () => {
  const filters = source("components/DiscoverFilters.tsx");
  const page = source("app/discover/page.tsx");
  const catalog = source("lib/catalog.ts");
  assert.match(filters, /Đánh giá cao nhất/);
  assert.match(filters, /Tìm truyện theo bộ lọc/);
  assert.doesNotMatch(filters, /Điểm tin cậy/);
  assert.match(page, /getFilteredDiscoverCatalog/);
  assert.match(catalog, /filtered\.slice\(offset, offset \+ safePageSize\)/);
  assert.match(catalog, /lọc trước khi chia trang/);
  assert.match(page, /Không có truyện nào tên chính xác/);
  assert.match(page, /Tên truyện gần giống/);
});

test("library merges saved stories and reading history into full-cover progress cards", () => {
  const library = source("components/LibraryView.tsx");
  const css = source("app/globals.css");
  assert.match(library, /library-cover-grid/);
  assert.match(library, /Đã đọc đến Chương/);
  assert.match(library, /removeHistoryItem\(progress\)/);
  assert.match(library, /Xóa lịch sử/);
  assert.match(css, /\.library-story-card__cover[\s\S]*\.story-cover/);
});

test("home shelves prioritize device reading signals and offer a personal recommendation row", () => {
  const home = source("app/page.tsx");
  const shelves = source("components/PersonalizedHomeShelves.tsx");
  const reader = source("components/ReaderClient.tsx");
  assert.match(home, /<PersonalizedHomeShelves \/>/);
  assert.match(shelves, /Bộ bạn thích và đọc nhiều nhất/);
  assert.match(shelves, /Đề xuất riêng cho bạn/);
  assert.match(shelves, /sort: "rating"/);
  assert.match(reader, /muc:story-stats/);
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
  const recommendations = source("lib/ai-recommendations.ts");
  const reviews = source("lib/review-signals.ts");
  assert.match(route, /parseModelRecommendations/);
  assert.match(route, /recommendations: result\.recommendations/);
  assert.match(route, /Không dùng title thay cho id/);
  assert.match(route, /Thứ tự ưu tiên bắt buộc/);
  assert.match(route, /helpful_review_votes/);
  assert.match(recommendations, /parseRecommendationConstraints/);
  assert.match(recommendations, /excludedGenres/);
  assert.match(reviews, /reviews\(page: 1, perPage: 5, sort: \[RATING_DESC\]\)/);
  assert.match(settings, /className="ai-recommendation-card"/);
  assert.match(settings, /<StoryPreviewLink[\s\S]*story=\{story\}/);
  assert.match(settings, /review tích cực/);
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
