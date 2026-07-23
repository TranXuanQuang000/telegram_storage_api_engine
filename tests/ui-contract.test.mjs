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
  assert.match(card, /className="cover-rating"/);
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
