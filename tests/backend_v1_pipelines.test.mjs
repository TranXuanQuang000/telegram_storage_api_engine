import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import vm from 'node:vm';

const realRequire = createRequire(import.meta.url);

function loadTypescriptModule(path) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (specifier) => specifier.endsWith('/logger.js')
    ? { logger: { info() {}, warn() {}, error() {} } }
    : realRequire(specifier);
  vm.runInNewContext(
    `(function(require,module,exports){${javascript}\n})(localRequire,loadedModule,loadedModule.exports)`,
    {
      clearTimeout,
      console,
      Date,
      loadedModule,
      localRequire,
      Map,
      Math,
      Number,
      Object,
      Promise,
      Set,
      setTimeout,
      URL,
    },
  );
  return loadedModule.exports;
}

const { ConsentVerifier } = loadTypescriptModule('../lib/pipelines/consent-verification.ts');
const {
  jaccardSimilarity,
  levenshteinSimilarity,
  computeStoryEntityMatchConfidence,
  zipperMergeChapters,
} = loadTypescriptModule('../lib/pipelines/zipper-merge.ts');
const { CircuitBreaker, AdaptiveRateLimiter } = loadTypescriptModule('../lib/services/resiliency.ts');
const {
  StorySchema,
  ChapterSchema,
  CanvasGraphSchema,
  MergeRequestSchema,
  HealthMetricsSchema,
} = loadTypescriptModule('../lib/validations/api-schemas.ts');

test('ConsentVerifier - Whitelist and Robots.txt evaluation', () => {
  const verifier = new ConsentVerifier();

  // Test domain whitelist
  assert.equal(verifier.isDomainWhitelisted('https://otruyenapi.com/v1/api/truyen'), true);
  assert.equal(verifier.isDomainWhitelisted('https://unknown-domain-xyz.com'), false);

  // Test robots.txt parsing
  const robotsTxt = `
User-agent: *
Disallow: /private/
Allow: /public/
`;
  assert.equal(verifier.isPathAllowedByRobots('/public/chap1', robotsTxt), true);
  assert.equal(verifier.isPathAllowedByRobots('/private/secret', robotsTxt), false);

  // Test evaluateConsent
  const resVerified = verifier.evaluateConsent('https://otruyenapi.com/v1/chap1');
  assert.equal(resVerified.status, 'VERIFIED');

  const resFlagged = verifier.evaluateConsent('https://unknown-site.com/private/chap1', robotsTxt);
  assert.equal(resFlagged.status, 'FLAG');
});

test('Zipper & Entity Resolution - String matching & Zipper algorithm', () => {
  // Test similarity
  const jaccard = jaccardSimilarity('One Piece', 'One-Piece (Comic)');
  assert.ok(jaccard > 0.4);

  const lev = levenshteinSimilarity('One Piece', 'One Piece');
  assert.equal(lev, 1.0);

  const confidence = computeStoryEntityMatchConfidence(
    { id: '1', title: 'One Piece', author: 'Oda' },
    { id: '2', title: 'One Piece', author: 'Eiichiro Oda' }
  );
  assert.ok(confidence > 0.7);

  // Test zipper merge
  const listA = [
    { id: 'a1', title: 'Chương 1: Khởi đầu', number: 1, consent_status: 'VERIFIED', pageCount: 20 },
    { id: 'a2', title: 'Chương 2: Zoro', number: 2, consent_status: 'VERIFIED', pageCount: 18 },
  ];
  const listB = [
    { id: 'b1', title: 'Chap 1', number: 1, consent_status: 'FLAG', pageCount: 15 },
    { id: 'b3', title: 'Chap 3: Nami', number: 3, consent_status: 'VERIFIED', pageCount: 22 },
  ];

  const merged = zipperMergeChapters([listA, listB]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].number, 1);
  assert.equal(merged[0].id, 'a1'); // Preferred VERIFIED and higher page count
  assert.equal(merged[2].number, 3);
});

test('Resiliency - Circuit Breaker & Adaptive Rate Limiter', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });

  let errorCount = 0;
  const failingTask = async () => {
    errorCount++;
    throw new Error('Task Failed');
  };

  await assert.rejects(async () => cb.execute(failingTask));
  await assert.rejects(async () => cb.execute(failingTask));

  // Should transition to OPEN
  assert.equal(cb.getState(), 'OPEN');
  await assert.rejects(async () => cb.execute(async () => 'ok'), /CIRCUIT_BREAKER_OPEN/);

  // Rate limiter
  const limiter = new AdaptiveRateLimiter(2, 5000);
  assert.equal(limiter.isAllowed().allowed, true);
  assert.equal(limiter.isAllowed().allowed, true);
  assert.equal(limiter.isAllowed().allowed, false);
});

test('Zod Schemas - Strict compliance with API Contract', () => {
  const validStory = { id: 'story_1', title: 'Test Title', author: 'Test Author' };
  assert.doesNotThrow(() => StorySchema.parse(validStory));

  const validChapter = { id: 'chap_1', title: 'Chapter 1', consent_status: 'VERIFIED' };
  assert.doesNotThrow(() => ChapterSchema.parse(validChapter));

  const validCanvas = {
    nodes: [{ id: 'n1', type: 'story' }],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  };
  assert.doesNotThrow(() => CanvasGraphSchema.parse(validCanvas));

  const validMergeReq = { sourceIds: ['id1', 'id2'], targetId: 'id1' };
  assert.doesNotThrow(() => MergeRequestSchema.parse(validMergeReq));

  const validHealth = { status: 'healthy', error_rate: 0.0 };
  assert.doesNotThrow(() => HealthMetricsSchema.parse(validHealth));
});

test('scheduled novel sync advances a bounded detail and chapter-manifest queue', () => {
  const workflow = fs.readFileSync(
    new URL('../.github/workflows/sync-novel-catalog.yml', import.meta.url),
    'utf8',
  );
  const builder = fs.readFileSync(
    new URL('../backend_api_engine/scripts/build_novel_catalog_snapshot.py', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /--hydrate-only/);
  assert.match(workflow, /--hydrate-existing-limit 250/);
  assert.match(workflow, /--pending-retry-limit 25/);
  assert.match(builder, /hydration_cursor/);
  assert.match(builder, /hydrated_items_total/);
  assert.match(builder, /untouched_failures/);
  assert.match(builder, /if hydrate_only:/);
});
