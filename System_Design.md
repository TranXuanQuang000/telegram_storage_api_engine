# System Design — Mực

## Architecture decision

### Branches considered

| Branch | Shape | Scale | Latency | Cost/complexity | Verdict |
|---|---|---:|---:|---:|---|
| A | Vinext modular monolith + D1 + device cache | 7/10 | 9/10 | 9/10 | **Chosen for v1** |
| B | Separate API, crawler workers, search service | 9/10 | 8/10 | 5/10 | Migration target when sync volume grows |
| C | Event-driven microservices + vector DB | 10/10 | 8/10 | 2/10 | Pruned: premature and expensive |

Chọn A: một Cloudflare Worker chạy app/API, D1 giữ catalog/progress, browser Cache/IndexedDB giữ offline. Connector/scheduler là module cô lập để tách ra Queue/Cron Worker về sau mà không đổi API public.

## Stack

- Vinext / React 19 / TypeScript strict / Tailwind 4 + CSS tokens.
- Cloudflare Worker ESM; D1 binding `DB`; Drizzle schema + SQL migration.
- Browser Service Worker + Cache Storage + IndexedDB wrapper viết nhỏ, không thêm framework PWA nặng.
- SIWC optional cho thư viện/progress đồng bộ; public catalog/reader vẫn xem được.
- External: OTruyen public API connector; OPDS v1/v2 user-owned connector; AniList enrichment on-demand theo điều khoản; AI BYOK proxy có allowlist.

## Modules

```text
app/
  (public)/ home, discover, story/[slug], read/[chapterId]
  library, downloads, settings/ai
  api/catalog, api/stories/[slug], api/progress, api/library
  api/download-manifest, api/ai/recommend, api/admin/ingest
components/ shell, catalog, reader, filters, provenance, offline
lib/
  domain/ rating, recommendation, tagging, dedupe
  sources/ registry, otruyen, opds, anilist
  storage/ d1, repositories
  security/ validation, rate-limit, ssrf
public/ manifest.webmanifest, sw.js, icons
db/ schema.ts
drizzle/ migrations
```

## Data model

- `profiles(id, email_hash, display_name, created_at)`
- `stories(id, slug, canonical_title, synopsis, author, status, origin, content_rating, cover_url, latest_chapter, updated_at)`
- `story_aliases(story_id, alias_normalized, locale)`
- `genres(id, slug, name)` and `story_genres(story_id, genre_id, origin, confidence)`
- `sources(id, slug, name, base_url, kind, enabled, license_mode, last_sync_at)`
- `source_items(id, source_id, story_id, external_id, external_url, etag, source_updated_at)`
- `chapters(id, story_id, source_item_id, number, title, language, page_count, published_at, external_url)`
- `rating_snapshots(id, story_id, source_id, score_5, vote_count, captured_at, source_url)`
- `story_scores(story_id, score_5, confidence, source_count, vote_count, computed_at)`
- `library_entries(profile_id, story_id, status, followed, updated_at)`
- `reading_progress(profile_id, story_id, chapter_id, page, progress, updated_at, idempotency_key)`
- `sync_runs(id, source_id, status, cursor, imported, updated, failed, started_at, finished_at, error_summary)`

Anonymous progress/download manifests are local-only until sign-in. API keys are never modeled.

## Rating formula

For each source `s`, normalize score to `[0,5]`, then Bayesian-adjust:

`adjusted_s = (v_s / (v_s + m)) * R_s + (m / (v_s + m)) * C`

Aggregate with `weight_s = quality_s * freshness_s * log10(v_s + 10)`. Confidence combines source count, total votes, freshness and disagreement penalty. UI always shows components and “dữ liệu chưa đủ” below threshold.

## Recommendation

Baseline works without AI:

- 45% weighted tag/mood/pace overlap.
- 20% recent reading/rating signal.
- 15% collaborative co-read when enough data.
- 10% source score confidence.
- 10% novelty/diversity; penalize repeated franchise/author/tag monoculture.

BYOK AI receives a compact, consented profile and top candidates only; it reranks/explains but cannot invent unavailable titles.

## Ingestion

1. Scheduler or protected admin trigger calls connector incrementally.
2. Validate source policy and timeout; fetch metadata only.
3. Normalize title/author/status/tags; dedupe exact external id, then deterministic candidate match.
4. Upsert in D1 batch; record provenance and sync run.
5. Compute tags/score in pure functions; AI enrichment queued only if enabled.
6. Fail with backoff; never keep retrying after circuit threshold.

## Offline architecture

- `sw.js` network-first HTML/API with cached fallback; cache-first versioned static assets.
- Download action gets a signed/validated manifest of chapter image URLs, then service worker caches them under `muc-chapter-v1` and posts progress.
- IndexedDB stores manifest, byte estimate, checksum/version, pinned flag and last access.
- App warns on quota; eviction only unpinned LRU with explicit policy.

## Security

- Zod-equivalent strict manual validation at API boundaries until a schema library is added; reject unknown/oversized fields.
- D1 prepared statements only; ownership from server-side SIWC header, never client email.
- AI proxy provider allowlist, HTTPS only, disallow IP/private host, 20s timeout, response size cap, rate limit and redacted errors.
- Admin ingestion requires secret header supplied by hosting runtime; no secret committed.
- Content Security Policy, `nosniff`, strict referrer, safe image proxy policy.

## Deployment constraints

- `.openai/hosting.json` declares D1 `DB`; no R2 for v1 because offline bytes belong on device and external content is not mirrored.
- Stable automated ingestion may need a separate scheduled Worker if Sites does not expose cron; the protected incremental endpoint is the boundary.

