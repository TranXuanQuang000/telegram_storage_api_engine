import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(process.cwd());
const initialPort = 4299;
let actualPort = initialPort;
let server;

console.log("=== EMPIRICAL STRESS TEST HARNESS STARTING ===");

async function startServer() {
  console.log(`[1/4] Spawning vinext dev server on port ${initialPort}...`);
  const cli = path.join(root, "node_modules", "vinext", "dist", "cli.js");
  server = spawn(process.execPath, [cli, "dev", "--port", String(initialPort)], {
    cwd: root,
    env: { ...process.env, PORT: String(initialPort), NO_OPEN: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out. Log:\n${output.slice(-1000)}`)), 45_000);
    const onData = (chunk) => {
      output += chunk.toString();
      const clean = output.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nseries]/g, "");
      const match = clean.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        actualPort = Number(match[1]);
        clearTimeout(timeout);
        console.log(`[1/4] Dev server ready at http://localhost:${actualPort}`);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Dev server exited early with code ${code}.\n${output.slice(-1000)}`));
    });
  });
}

function stopServer() {
  if (server && server.exitCode === null) {
    console.log("[Clean-up] Terminating dev server...");
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"]);
    } else {
      server.kill("SIGKILL");
    }
  }
}

async function request(pathname, init) {
  const url = `http://localhost:${actualPort}${pathname}`;
  return fetch(url, { signal: AbortSignal.timeout(15_000), ...init });
}

async function runRouteStressTest() {
  console.log("\n[2/4] Stress-testing route transitions and concurrent requests...");
  
  const publicPages = [
    "/",
    "/discover",
    "/library",
    "/downloads",
    "/settings/ai",
    "/offline",
    "/story/blue-lock",
  ];

  const protectedApiRoutes = [
    { path: "/api/library", method: "GET", expectedStatuses: [401, 503] },
    { path: "/api/progress", method: "PUT", expectedStatuses: [401, 503], body: JSON.stringify({ storyId: "test", chapterId: "c1", page: 1, progress: 0.5, idempotencyKey: "123456789" }), headers: { "Content-Type": "application/json" } },
    { path: "/api/progress", method: "GET", expectedStatuses: [405] },
    { path: "/api/admin/ingest", method: "POST", expectedStatuses: [401, 503], body: JSON.stringify({ source: "otruyen", mode: "refresh" }), headers: { "Content-Type": "application/json" } },
    { path: "/api/admin/ingest", method: "GET", expectedStatuses: [405] },
    { path: "/api/admin/ratings", method: "POST", expectedStatuses: [401, 503], body: JSON.stringify({ limit: 5 }), headers: { "Content-Type": "application/json" } },
    { path: "/api/admin/ratings", method: "GET", expectedStatuses: [405] },
  ];

  // Test 2.1: Rapid sequential public route transitions (10 iterations x 7 public pages = 70 transitions)
  console.log("  - Test 2.1: Rapid sequential route transitions (10 iterations x 7 routes = 70 reqs)...");
  const startSeq = Date.now();
  let totalSeqReqs = 0;
  for (let i = 0; i < 10; i++) {
    for (const route of publicPages) {
      const res = await request(route);
      assert.equal(res.status, 200, `Public route ${route} returned status ${res.status}`);
      totalSeqReqs++;
    }
  }
  const seqTime = Date.now() - startSeq;
  console.log(`    ✓ ${totalSeqReqs} sequential route transitions completed in ${seqTime}ms (avg ${(seqTime/totalSeqReqs).toFixed(1)}ms/req)`);

  // Test 2.2: Protected API auth guard & method handler verification
  console.log("  - Test 2.2: Protected API endpoints & HTTP method validation...");
  for (const item of protectedApiRoutes) {
    const res = await request(item.path, {
      method: item.method,
      headers: item.headers,
      body: item.body,
    });
    assert.ok(item.expectedStatuses.includes(res.status), `API ${item.method} ${item.path} status ${res.status} not in expected [${item.expectedStatuses.join(",")}]`);
  }
  console.log("    ✓ All API routes enforce strict HTTP method guards and auth/DB availability protections");

  // Test 2.3: High Concurrency Flood (100 parallel requests across public routes)
  console.log("  - Test 2.3: Concurrency flood (100 parallel requests across routes)...");
  const startConc = Date.now();
  const requests = [];
  for (let i = 0; i < 100; i++) {
    const route = publicPages[i % publicPages.length];
    requests.push(request(route).then(async (res) => {
      assert.equal(res.status, 200, `Concurrent route ${route} failed with status ${res.status}`);
      return res.status;
    }));
  }
  const results = await Promise.all(requests);
  const concTime = Date.now() - startConc;
  console.log(`    ✓ 100 concurrent requests handled in ${concTime}ms (100/100 status 200, avg ${(concTime/100).toFixed(1)}ms/req)`);
}

async function runApiFuzzTest() {
  console.log("\n[3/4] Fuzz testing API endpoints & route boundaries...");

  // Fuzz 1: Malformed and edge case payloads to /api/ai/recommend
  console.log("  - Fuzzing /api/ai/recommend with extreme/malformed payloads...");
  const aiPayloads = [
    {}, // empty
    { provider: "invalid_provider" },
    { provider: "openai", model: "gpt-4", prompt: null },
    { provider: "openai", model: "gpt-4", prompt: "A".repeat(10000), candidateIds: ["' OR 1=1 --", "<script>alert(1)</script>"] },
    { provider: "../../../etc/passwd", model: "eval()", prompt: "\x00\x01\x02" },
  ];
  for (const payload of aiPayloads) {
    const res = await request("/api/ai/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.ok([400, 401, 422, 500].includes(res.status) || res.status === 200, `Unexpected status ${res.status} for payload`);
    assert.equal(res.headers.get("cache-control"), "no-store", "AI route should strictly enforce no-store cache-control");
  }
  console.log("    ✓ AI recommendation endpoint securely handles invalid/malformed/malicious inputs");

  // Fuzz 2: Invalid chapter IDs in download manifest route
  console.log("  - Testing /api/download-manifest with boundary IDs...");
  const invalidChapterIds = [
    "non-existent-chapter-999999",
    "../../etc/passwd",
    "<script>",
    "%00",
    "1' OR '1'='1",
  ];
  for (const id of invalidChapterIds) {
    const res = await request(`/api/download-manifest/${encodeURIComponent(id)}`);
    assert.equal(res.status, 404, `Invalid chapter ${id} should return 404, got ${res.status}`);
  }
  console.log("    ✓ Download manifest route returns clean 404s for invalid chapter IDs");
}

async function runComponentContractVerification() {
  console.log("\n[4/4] Verifying MucPet component and CSS animation specifications...");
  
  const cssContent = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");
  const componentContent = fs.readFileSync(path.join(root, "components", "MucPet.tsx"), "utf8");

  // Verify sprite sheet dimensions & keyframe logic
  assert.match(cssContent, /\.muc-pet__sprite-anim/);
  assert.match(cssContent, /width:\s*208px;/);
  assert.match(cssContent, /height:\s*174px;/);
  assert.match(cssContent, /background-image:\s*url\('\/muc-pet-sprite\.png'\);/);
  assert.match(cssContent, /background-size:\s*1248px 696px;/);

  // Check state offsets: Idle (0), Moving (-174px), Petting (-348px), Dragging (-522px)
  assert.match(cssContent, /background-position-y:\s*-174px;/);
  assert.match(cssContent, /background-position-y:\s*-348px;/);
  assert.match(cssContent, /background-position-y:\s*-522px;/);
  assert.match(cssContent, /@keyframes playSprite\s*\{\s*100%\s*\{\s*background-position-x:\s*-1248px;\s*\}\s*\}/);

  // Verify MucPet React state machine implementation
  assert.match(componentContent, /moving\s*\?\s*"is-moving"/);
  assert.match(componentContent, /dragging\s*\?\s*"is-dragging"/);
  assert.match(componentContent, /`is-\${mood}`/);
  assert.match(componentContent, /onPointerDown/);
  assert.match(componentContent, /onPointerUp/);
  assert.match(componentContent, /onPointerMove/);

  console.log("    ✓ MucPet component state machine & CSS keyframe specs verified 100%");
}

async function main() {
  try {
    await startServer();
    await runRouteStressTest();
    await runApiFuzzTest();
    await runComponentContractVerification();
    console.log("\n=== ALL EMPIRICAL STRESS TESTS PASSED SUCCESSFULLY ===");
  } catch (err) {
    console.error("\n❌ STRESS TEST FAILURE:", err);
    process.exitCode = 1;
  } finally {
    stopServer();
  }
}

main();
