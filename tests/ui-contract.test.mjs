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
  assert.match(reader, /if \(page >= activePageCount\)[\s\S]*openChapter\(nextChapter\)/);
  assert.match(reader, /loadNextIntoStream/);
  assert.match(reader, /Đang tải trước toàn bộ trang của chương tiếp theo/);
  assert.match(reader, /aria-label="Chương tiếp theo"/);
  assert.match(story, /story\.chapters\.at\(-1\)/);
  assert.match(story, /Đọc từ đầu/);
});

test("discovery labels rating honestly and reports approximate title matches", () => {
  const filters = source("components/DiscoverFilters.tsx");
  const page = source("app/discover/page.tsx");
  const catalog = source("lib/catalog.ts");
  const indexedCatalog = source("lib/d1-catalog.ts");
  const ingest = source("lib/sources/otruyen.ts");
  assert.match(filters, /Đánh giá cao nhất/);
  assert.match(filters, /Tìm truyện theo bộ lọc/);
  assert.doesNotMatch(filters, /Điểm tin cậy/);
  assert.match(page, /getD1DiscoverCatalog/);
  assert.match(page, /getFilteredDiscoverCatalog/);
  assert.match(catalog, /filtered\.slice\(offset, offset \+ safePageSize\)/);
  assert.match(catalog, /lọc trước khi chia trang/);
  assert.match(indexedCatalog, /SELECT COUNT\(\*\) AS count FROM stories/);
  assert.match(indexedCatalog, /ORDER BY \$\{orderSql\}[\s\S]*LIMIT \? OFFSET \?/);
  assert.match(ingest, /nextCursor/);
  assert.match(ingest, /pagesPerRun/);
  assert.match(page, /Không có truyện nào tên chính xác/);
  assert.match(page, /Tên truyện gần giống/);
});

test("library merges saved stories and reading history into full-cover progress cards", () => {
  const library = source("components/LibraryView.tsx");
  const css = source("app/globals.css");
  assert.match(library, /library-cover-grid/);
  assert.match(library, /Đã đọc đến Chương/);
  assert.match(library, /removeHistory\(progress\)/);
  assert.match(library, /Xóa lịch sử/);
  assert.match(css, /\.library-story-card__cover[\s\S]*\.story-cover/);
});

test("home shelves prioritize device reading signals and hot personal recommendations", () => {
  const home = source("app/page.tsx");
  const shelves = source("components/PersonalizedHomeShelves.tsx");
  const reader = source("components/ReaderClient.tsx");
  assert.match(home, /<PersonalizedHomeShelves \/>/);
  assert.match(shelves, /Bộ bạn thích và đọc nhiều nhất/);
  assert.match(shelves, /Đề xuất riêng cho bạn/);
  assert.match(shelves, /sort: "hot"/);
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

test("MucPet component and CSS sprite configuration match sprite sheet layout", () => {
  const css = source("app/globals.css");
  const component = source("components/MucPet.tsx");
  assert.match(css, /\.muc-pet__sprite-anim[\s\S]*width: 104px;[\s\S]*height: 87px;/);
  assert.match(css, /background-size: 624px 87px/);
  assert.match(css, /background-image: url\('\/muc-pet-idle\.png'\)/);
  assert.match(css, /background-image: url\('\/muc-pet-moving\.png'\)/);
  assert.match(css, /background-image: url\('\/muc-pet-petting\.png'\)/);
  assert.match(css, /background-image: url\('\/muc-pet-dragging\.png'\)/);
  assert.match(css, /@keyframes playSprite[\s\S]*100% \{ background-position-x: -624px; \}/);
  assert.doesNotMatch(component, /import Image from "next\/image";/);
  assert.match(component, /moving \? "is-moving" : ""/);
  assert.match(component, /dragging \? "is-dragging" : ""/);
  assert.match(component, /is-\$\{mood\}/);
});

test("offline downloads use one manifest contract and a cold-start reader shell", () => {
  const store = source("lib/offline-store.ts");
  const actions = source("components/StoryActions.tsx");
  const reader = source("components/ReaderClient.tsx");
  const serviceWorker = source("public/sw.js");
  const offlineReader = source("public/offline-reader.html");
  assert.match(store, /manifestVersion: string/);
  assert.match(store, /const inserted: string\[\] = \[\]/);
  assert.match(store, /CACHE_VERIFY_FAILED/);
  assert.match(actions, /Đọc tiếp Ch\./);
  assert.doesNotMatch(actions, /Tải offline chap này/);
  assert.match(reader, /priority=\{chapterPosition === 0 && index < 2\}/);
  assert.doesNotMatch(reader, /new window\.Image/);
  assert.match(serviceWorker, /offline-reader\.html/);
  assert.doesNotMatch(serviceWorker, /hostname === "localhost"/);
  assert.match(offlineReader, /muc-chapters-v3/);
});

test("complete genre taxonomy and the separate Mực Chữ reader are wired", () => {
  const genres = source("lib/genre-options.ts");
  const header = source("components/SiteHeader.tsx");
  const novels = source("lib/novels.ts");
  const novelContent = JSON.parse(source("data/novel-content.json"));
  const textReader = source("components/TextReaderClient.tsx");
  assert.match(genres, /\["xuyen-khong", "Xuyên Không"\]/);
  assert.match(genres, /\["16", "16\+"\]/);
  assert.match(header, /href="\/novels"/);
  assert.match(novels, /bundledNovelContent/);
  assert.match(novels, /vi\.wikisource\.org\/w\/api\.php/);
  assert.equal(Object.keys(novelContent).length, 26);
  assert.ok(Object.values(novelContent).every((paragraphs) => paragraphs.length > 10));
  assert.match(textReader, /Cài đặt trang chữ/);
  assert.match(textReader, /"oled" \| "dark" \| "sepia" \| "light"/);
  assert.match(textReader, /"scroll" \| "paged"/);
});

test("source hub whitelists providers and blocks content for metadata-only sources", () => {
  const hub = source("lib/source-hub.ts");
  const manifestRoute = source("app/api/sources/route.ts");
  const contentRoute = source("app/api/source-content/[source]/[chapterId]/route.ts");
  assert.match(hub, /"otruyen" \| "mangadex" \| "wikisource" \| "anilist"/);
  assert.match(hub, /access: "metadata-only"/);
  assert.match(hub, /SOURCE_MANIFESTS\[source\]\.access === "metadata-only"/);
  assert.doesNotMatch(hub, /fetch\(\s*(?:url|request|sourceUrl)/);
  assert.match(manifestRoute, /arbitraryUrlFetch: false/);
  assert.match(manifestRoute, /paywallBypass: false/);
  assert.match(contentRoute, /status: 403/);
});

test("continuous comic and novel readers preload and append the next chapter", () => {
  const comic = source("components/ReaderClient.tsx");
  const novel = source("components/TextReaderClient.tsx");
  const css = source("app/globals.css");
  assert.match(comic, /preloadChapterPages\(nextPages/);
  assert.match(comic, /window\.setTimeout\(start, 0\)/);
  assert.match(comic, /stream\.map\(\(loadedChapter, chapterPosition\)/);
  assert.match(comic, /Math\.floor\(totalPages \* \.45\)/);
  assert.match(novel, /source-content\/wikisource/);
  assert.match(novel, /stream\.map\(\(loadedChapter, chapterPosition\)/);
  assert.match(novel, /Math\.floor\(total \* \.45\)/);
  assert.match(css, /\.reader-chapter-boundary/);
  assert.match(css, /\.novel-reader__boundary/);
});

test("reader access can be switched between public, account, invite and allowlist", () => {
  const access = source("lib/reader-access.ts");
  const register = source("app/api/auth/register/route.ts");
  const comicPage = source("app/read/[chapterId]/page.tsx");
  const novelPage = source("app/novels/read/[chapterId]/page.tsx");
  const manifest = source("app/api/download-manifest/[chapterId]/route.ts");
  assert.match(access, /"public" \| "account" \| "invite" \| "allowlist"/);
  assert.match(access, /MUC_INVITE_CODE/);
  assert.match(access, /MUC_READER_ALLOWLIST/);
  assert.match(register, /validateReaderRegistration/);
  assert.match(comicPage, /getReaderAccess/);
  assert.match(novelPage, /getReaderAccess/);
  assert.match(manifest, /status: access\.authenticated \? 403 : 401/);
  assert.match(source("app/login/page.tsx"), /!value\.startsWith\("\/\/"\)/);
});

test("replacement content API is server-configured with a safe migration fallback", () => {
  const config = source("lib/content-api.ts");
  const catalog = source("lib/catalog.ts");
  const comicSource = source("lib/sources/otruyen.ts");
  assert.match(config, /MUC_CONTENT_API_URL/);
  assert.match(config, /MUC_CONTENT_API_STRICT/);
  assert.match(config, /MUC_CONTENT_API_TOKEN/);
  assert.match(config, /target\.origin === configured\.origin/);
  assert.match(catalog, /fetchComicJson/);
  assert.match(comicSource, /comicApiCandidates/);
});

test("novel API uses opaque route IDs and preserves per-chapter provenance", () => {
  const adapter = source("lib/sources/novel-api.ts");
  const contentConfig = source("lib/content-api.ts");
  const novels = source("lib/novels.ts");
  const reader = source("components/TextReaderClient.tsx");
  const catalog = source("components/NovelCatalog.tsx");
  const catalogRoute = source("app/api/novels/route.ts");
  assert.match(adapter, /napi\.\$\{source\}/);
  assert.match(adapter, /nch\.\$\{primarySource\}\.\$\{source\}/);
  assert.match(adapter, /as_html=false/);
  assert.match(adapter, /original_source/);
  assert.match(contentConfig, /wikidich\|gutendex/);
  assert.match(novels, /getNovelApiCatalog/);
  assert.match(novels, /getNovelApiChapter/);
  assert.match(reader, /sourceName/);
  assert.match(catalog, /catalogVersion: "2"/);
  assert.match(catalog, /cache: "no-store"/);
  assert.match(catalogRoute, /private, no-store/);
  assert.doesNotMatch(reader, /WIKISOURCE PUBLIC DOMAIN/);
});
