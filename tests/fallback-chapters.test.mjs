import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

function loadModule() {
  const source = fs.readFileSync(new URL("../lib/sources/fallback-chapters.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  const sandbox = {
    AbortController,
    clearTimeout,
    console,
    crypto,
    fetch,
    loadedModule,
    process: { env: {} },
    Response,
    setTimeout,
    TextEncoder,
    URL,
  };
  vm.runInNewContext(`(function(module,exports){${javascript}\n})(loadedModule,loadedModule.exports)`, sandbox);
  return loadedModule.exports;
}

test("chapter key keeps decimals stable", () => {
  const module = loadModule();
  assert.equal(module.canonicalChapterKey("Chapter 96.10"), "96.1");
  assert.equal(module.canonicalChapterKey("Chương 52,2"), "52.2");
  assert.equal(module.canonicalChapterKey("không rõ"), null);
});

test("OTruyen wins overlap and fallback fills only missing chapters", () => {
  const module = loadModule();
  const merged = module.mergeChapterPlans(
    [
      { id: "ot-136", number: "136", title: "", apiUrl: "https://sv1.otruyencdn.com/v1/api/chapter/abc" },
      { id: "ot-135", number: "135", title: "", apiUrl: "https://sv1.otruyencdn.com/v1/api/chapter/def" },
    ],
    [
      { id: "fb-truyenqq-136", number: "136", title: "", apiUrl: "https://truyenqq.com.vn/story/chapter-136", source: "truyenqq" },
      { id: "fb-net-137", number: "137", title: "", apiUrl: "https://nettruyenz.com/story/chap-137", source: "nettruyen" },
      { id: "fb-qq-137", number: "137", title: "", apiUrl: "https://truyenqq.com.vn/story/chapter-137", source: "truyenqq" },
    ],
  );
  assert.deepEqual([...merged.map((item) => item.id)], ["fb-qq-137", "ot-136", "ot-135"]);
  assert.equal(merged[1].source, "otruyen");
});

test("fallback URL validation rejects open-proxy and cross-story targets", () => {
  const module = loadModule();
  assert.equal(
    module.validateFallbackChapterUrl("truyenqq", "/de-vuong-hoi-quy/chapter-146", "de-vuong-hoi-quy"),
    "https://truyenqq.com.vn/de-vuong-hoi-quy/chapter-146",
  );
  assert.equal(module.validateFallbackChapterUrl("truyenqq", "https://attacker.example/de-vuong-hoi-quy/chapter-146"), null);
  assert.equal(module.validateFallbackChapterUrl("truyenqq", "/other-story/chapter-146", "de-vuong-hoi-quy"), null);
  assert.equal(module.validateFallbackChapterUrl("nettruyen", "https://nettruyenz.com/de-vuong-hoi-quy/chap-136"), "https://nettruyenz.com/de-vuong-hoi-quy/chap-136");
});

test("fallback image manifests allow only source CDNs and use chapter-bound proxy paths", () => {
  const module = loadModule();
  const qqChapter = "https://truyenqq.com.vn/de-vuong-hoi-quy/chapter-146";
  const netChapter = "https://nettruyenz.com/de-vuong-hoi-quy/chap-136";
  assert.equal(
    module.validateFallbackImageUrl("truyenqq", "https://s35.cc3t.net/chapters/story/page-0.jpg", qqChapter),
    "https://s35.cc3t.net/chapters/story/page-0.jpg",
  );
  assert.equal(
    module.validateFallbackImageUrl("nettruyen", "https://sv1.otruyencdn.com/uploads/story/page_0.webp", netChapter),
    "https://sv1.otruyencdn.com/uploads/story/page_0.webp",
  );
  assert.equal(module.validateFallbackImageUrl("truyenqq", "https://attacker.example/page.jpg", qqChapter), null);
  assert.equal(module.validateFallbackImageUrl("truyenqq", "/images/loading.svg", qqChapter), null);
  assert.equal(module.validateFallbackImageUrl("truyenqq", "https://s35.cc3t.net/page.jpg", netChapter), null);
  const chapterId = `fb_${"a".repeat(40)}`;
  assert.equal(module.fallbackImageProxyUrl(chapterId, 7), `/api/chapter-image/${chapterId}/7`);
  assert.equal(module.fallbackImageProxyUrl(chapterId, -1), null);
});

test("production runtime no longer contains Raspberry Pi serving variables", () => {
  const wrangler = fs.readFileSync(new URL("../wrangler.json", import.meta.url), "utf8");
  assert.doesNotMatch(wrangler, /raspberrypi|MANGA_API_BASE_URL|CATALOG_PROVIDER/i);
  const contentApi = fs.readFileSync(new URL("../lib/content-api.ts", import.meta.url), "utf8");
  assert.match(contentApi, /LEGACY_COMIC_API.*otruyenapi\.com/);
});
