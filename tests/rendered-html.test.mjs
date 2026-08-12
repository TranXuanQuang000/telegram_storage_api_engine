import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const initialPort = 4173;
let actualPort = initialPort;
let server;

before(async () => {
  const cli = path.join(root, "node_modules", "vinext", "dist", "cli.js");
  server = spawn(process.execPath, [cli, "dev", "--port", String(initialPort)], {
    cwd: root,
    env: { ...process.env, PORT: String(initialPort), NO_OPEN: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Vinext dev did not become ready. ${output.slice(-1200)}`)), 45_000);
    const onData = (chunk) => {
      output += chunk.toString();
      const clean = output.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nseries]/g, "");
      const match = clean.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        actualPort = Number(match[1]);
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Vinext dev exited early with ${code}. ${output.slice(-1200)}`)); });
  });
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"]);
  } else {
    server.kill("SIGKILL");
  }
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
});

async function request(pathname = "/", init) {
  return fetch(`http://localhost:${actualPort}${pathname}`, { signal: AbortSignal.timeout(20_000), ...init });
}

test("server-renders the Mực home experience", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="vi">/i);
  assert.match(html, /Mực — đọc truyện theo gu/i);
  assert.match(html, /Một chạm,/i);
  assert.match(html, /Tìm truyện hợp gu/i);
  assert.match(html, /AI key không lưu máy chủ/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders public product routes without authentication", async () => {
  for (const pathname of ["/discover", "/library", "/downloads", "/settings/ai", "/offline", "/novels", "/novels/a-q-chinh-truyen"]) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /Mực/i, pathname);
  }
});

test("rejects invalid reader and unconfigured AI requests safely", async () => {
  const missingChapter = await request("/api/download-manifest/not-a-chapter");
  assert.equal(missingChapter.status, 404);
  const ai = await request("/api/ai/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "openai", model: "gpt-4.1-mini", prompt: "action", candidateIds: [] }) });
  assert.ok([400, 401].includes(ai.status));
  assert.equal(ai.headers.get("cache-control"), "no-store");
});

test("comic catalog and two production stories load without the Raspberry Pi API", async () => {
  const catalog = await request("/api/catalog?page=1&limit=3");
  assert.equal(catalog.status, 200);
  const catalogPayload = await catalog.json();
  assert.ok(Array.isArray(catalogPayload.items));
  assert.ok(catalogPayload.items.length > 0);
  for (const slug of ["quy-toc-luoi-bieng-tro-thanh-thien-tai", "de-vuong-hoi-quy"]) {
    const detail = await request(`/api/stories/${slug}`);
    assert.equal(detail.status, 200, slug);
    const payload = await detail.json();
    assert.equal(payload.slug, slug);
    assert.ok(payload.chapters.length >= 100, slug);
    assert.doesNotMatch(JSON.stringify(payload), /raspberrypi|MANGA_API_HTTP_502/i);
    const page = await request(`/story/${slug}`);
    assert.equal(page.status, 200, slug);
  }
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  for (const expected of [
    { slug: "quy-toc-luoi-bieng-tro-thanh-thien-tai", fallbackLatest: "154", oTruyenLatest: "138" },
    { slug: "de-vuong-hoi-quy", fallbackLatest: "146", oTruyenLatest: "136" },
  ]) {
    const enriched = await request(`/api/stories/${expected.slug}`);
    assert.equal(enriched.status, 200);
    const enrichedPayload = await enriched.json();
    assert.equal(enrichedPayload.chapters[0].number, expected.fallbackLatest);
    assert.match(enrichedPayload.chapters[0].id, /^fb_[a-f0-9]{40}$/);
    assert.equal(enrichedPayload.chapters.find((chapter) => chapter.number === expected.oTruyenLatest)?.source, "otruyen");
    const fallbackRead = await request(`/read/${enrichedPayload.chapters[0].id}?story=${expected.slug}`, { redirect: "manual" });
    assert.equal(fallbackRead.status, 200);
    assert.equal(fallbackRead.headers.get("location"), null);
    const manifest = await request(`/api/download-manifest/${enrichedPayload.chapters[0].id}`);
    assert.equal(manifest.status, 200);
    const manifestPayload = await manifest.json();
    assert.ok(manifestPayload.pages.length > 0);
    assert.ok(manifestPayload.pages.every((page) => page.startsWith(`/api/chapter-image/${enrichedPayload.chapters[0].id}/`)));
    const firstImage = await request(manifestPayload.pages[0]);
    assert.equal(firstImage.status, 200);
    assert.match(firstImage.headers.get("content-type") ?? "", /^image\//);
  }
});
