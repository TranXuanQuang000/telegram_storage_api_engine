import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const realRequire = createRequire(import.meta.url);

function loadAdapter(fetchImpl) {
  const source = fs.readFileSync(
    new URL("../lib/sources/manga-api.ts", import.meta.url),
    "utf8",
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const sandbox = {
    AbortController,
    atob,
    btoa,
    clearTimeout,
    console,
    fetch: fetchImpl,
    loadedModule,
    process: { env: {} },
    Response,
    setTimeout,
    TextDecoder,
    TextEncoder,
    URL,
    Uint8Array,
  };
  const localRequire = (specifier) => {
    if (specifier === "cloudflare:workers") {
      return {
        env: {
          MANGA_API_BASE_URL: "http://localhost:3100",
          CATALOG_PROVIDER: "manga-api",
        },
      };
    }
    return realRequire(specifier);
  };
  vm.runInNewContext(
    `(function(require,module,exports){${javascript}\n})(localRequire,loadedModule,loadedModule.exports)`,
    { ...sandbox, localRequire },
  );
  return loadedModule.exports;
}

test("Manga API catalog contract accepts the documented list shape", () => {
  const adapter = loadAdapter(async () => {
    throw new Error("network is not expected");
  });
  const parsed = adapter.mangaApiCatalogSchema.parse({
    status: "success",
    data: {
      items: [{
        _id: "manga-1",
        name: "Bộ truyện thử",
        slug: "bo-truyen-thu",
        thumb_url: null,
        category: [{ name: "Action", slug: "action" }],
        chaptersLatest: [{
          chapter_name: "151",
          chapter_api_data: "/api/v1/chapter-detail?source=nettruyen&path=%2Fchapter-151",
        }],
        updatedAt: "2026-07-27T00:00:00.000Z",
      }],
      params: {
        pagination: {
          totalItems: 1,
          totalItemsPerPage: 24,
          currentPage: 1,
          pageRanges: 1,
        },
      },
    },
  });
  assert.equal(parsed.data.items[0].chaptersLatest[0].chapter_name, "151");
});

test("reader preserves chapter_api_data and renders only signed proxy URLs", async () => {
  let requestedUrl = "";
  const adapter = loadAdapter(async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      status: true,
      data: {
        sourceKey: "nettruyen",
        chapterPath: "/chapter-151",
        cacheStatus: "queued",
        totalImages: 2,
        images: [
          {
            page: 2,
            originalUrl: "https://untrusted.example/original-2.jpg",
            proxyUrl: "/api/v1/image-proxy?source=nettruyen&url=two&expires=200&sig=sig-2",
          },
          {
            page: 1,
            originalUrl: "https://untrusted.example/original-1.jpg",
            proxyUrl: "/api/v1/image-proxy?source=nettruyen&url=one&expires=200&sig=sig-1",
          },
        ],
        chapter_image: [
          {
            image_page: 1,
            image_file: "/api/v1/image-proxy?source=nettruyen&url=legacy&expires=200&sig=legacy",
          },
        ],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const relative = "/api/v1/chapter-detail?source=nettruyen&path=%2Fchapter-151&nextChapterPath=%2Fchapter-152";
  const chapterId = adapter.encodeMangaApiChapterId(relative, "151");
  const chapter = await adapter.getMangaApiChapter(chapterId);

  assert.equal(
    requestedUrl,
    "http://localhost:3100/api/v1/chapter-detail?source=nettruyen&path=%2Fchapter-151&nextChapterPath=%2Fchapter-152",
  );
  assert.deepEqual(
    [...chapter.pages],
    [
      "/api/media/manga-image?path=%2Fapi%2Fv1%2Fimage-proxy%3Fsource%3Dnettruyen%26url%3Done%26expires%3D200%26sig%3Dsig-1",
      "/api/media/manga-image?path=%2Fapi%2Fv1%2Fimage-proxy%3Fsource%3Dnettruyen%26url%3Dtwo%26expires%3D200%26sig%3Dsig-2",
    ],
  );
  assert.ok(chapter.pages.every((url) => !url.includes("untrusted.example")));
  const gatewayPath = new URL(chapter.pages[0], "https://muctruyen.pages.dev").searchParams.get("path");
  const gatewayTarget = adapter.resolveMangaApiImageGatewayTarget(gatewayPath);
  assert.equal(gatewayTarget.origin, "http://localhost:3100");
  assert.equal(gatewayTarget.pathname, "/api/v1/image-proxy");
});

test("adapter rejects non-Manga-API paths instead of becoming an open proxy", () => {
  const adapter = loadAdapter(async () => {
    throw new Error("network is not expected");
  });
  assert.throws(
    () => adapter.encodeMangaApiChapterId("https://attacker.example/chapter", "1"),
    /path không được phép/,
  );
  assert.throws(
    () => adapter.encodeMangaApiChapterId("/api/v1/admin/status", "1"),
    /Chapter path không đúng endpoint|path/,
  );
  assert.throws(
    () => adapter.resolveMangaApiImageGatewayTarget("/api/v1/admin/status"),
    /image gateway|không hợp lệ|path/i,
  );
});

test("server-only provider configuration never uses public secret variable names", () => {
  const adapter = fs.readFileSync(
    new URL("../lib/sources/manga-api.ts", import.meta.url),
    "utf8",
  );
  for (const secret of [
    "ADMIN_TOKEN",
    "IMAGE_PROXY_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_API_HASH",
    "MONGO_URI",
    "REDIS_URL",
  ]) {
    assert.doesNotMatch(adapter, new RegExp(`NEXT_PUBLIC_${secret}`));
  }
});
