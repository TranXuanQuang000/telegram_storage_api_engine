import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import fs from "node:fs";
import vm from "node:vm";

function loadTypescriptModule(file) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(exports,loaded){${js}\n})(loaded.exports,loaded)`, { loaded, exports: loaded.exports, Date, Map, Math, Number, Object, Set });
  return loaded.exports;
}

const { aggregateRatings } = loadTypescriptModule("../lib/ratings.ts");
const { deriveAutoTags, inferContentRating } = loadTypescriptModule("../lib/auto-tags.ts");
const { extractReferenceTitle, normalizeTitle, titleSimilarity } = loadTypescriptModule("../lib/search-utils.ts");

test("rating aggregation deduplicates sources and produces a bounded five-star score", () => {
  const now = new Date("2026-07-23T00:00:00.000Z");
  const result = aggregateRatings([
    { sourceId: "anilist", sourceName: "AniList", score5: 4.1, voteCount: 37_419, capturedAt: "2026-07-22T00:00:00.000Z", sourceUrl: "https://anilist.co/manga/106130" },
    { sourceId: "kitsu", sourceName: "Kitsu", score5: 4.14, voteCount: 3_664, capturedAt: "2026-07-22T00:00:00.000Z", sourceUrl: "https://kitsu.app/manga/blue-lock" },
    { sourceId: "kitsu", sourceName: "Kitsu", score5: 1, voteCount: 1, capturedAt: "2025-01-01T00:00:00.000Z", sourceUrl: "https://example.test/stale" },
  ], now);
  assert.equal(result.sourceCount, 2);
  assert.equal(result.isAggregate, true);
  assert.equal(result.confidence, "high");
  assert.ok(result.score5 >= 4 && result.score5 <= 4.2);
});

test("missing rating data remains missing instead of becoming zero stars", () => {
  const result = aggregateRatings([]);
  assert.equal(result.score5, null);
  assert.equal(result.confidence, "insufficient");
});

test("deterministic tags and content guardrails come from source labels", () => {
  const tags = deriveAutoTags(["action", "psychological", "manhwa"]);
  assert.ok(tags.some((tag) => tag.slug === "mood-intense"));
  assert.ok(tags.some((tag) => tag.slug === "mood-clever"));
  assert.ok(tags.every((tag) => tag.origin === "rule"));
  assert.equal(inferContentRating(["romance", "mature"]), "mature");
});

test("Vietnamese title search tolerates accents, missing spaces and small typos", () => {
  assert.equal(normalizeTitle("Truyện tranh: Toàn Trí Độc Giả"), "toan tri doc gia");
  assert.ok(titleSimilarity("Blue Lokc", "Blue Lock") > 0.7);
  assert.ok(titleSimilarity("Toan Tri Doc Gia", "Toàn Tri Độc Giả") > 0.9);
  assert.ok(titleSimilarity("Solo Leveling", "Blue Lock") < 0.4);
});

test("AI reference extraction understands natural Vietnamese similarity requests", () => {
  assert.equal(
    extractReferenceTitle("Tìm truyện giống truyện Toàn Tri Độc Giả nhưng ít hài hơn."),
    "Toàn Tri Độc Giả",
  );
  assert.equal(
    extractReferenceTitle("Có bộ nào tương tự “Blue Lock” nhưng chơi bóng rổ không?"),
    "Blue Lock",
  );
  assert.equal(extractReferenceTitle("Tìm truyện nữ chính mạnh"), null);
});
