import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 4173;
let server;

before(async () => {
  const cli = path.join(root, "node_modules", "vinext", "dist", "cli.js");
  server = spawn(process.execPath, [cli, "dev", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Vinext dev did not become ready. ${output.slice(-1200)}`)), 45_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(`http://localhost:${port}`)) {
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
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

async function request(pathname = "/", init) {
  return fetch(`http://localhost:${port}${pathname}`, { signal: AbortSignal.timeout(20_000), ...init });
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
  for (const pathname of ["/discover", "/library", "/downloads", "/settings/ai", "/offline"]) {
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
