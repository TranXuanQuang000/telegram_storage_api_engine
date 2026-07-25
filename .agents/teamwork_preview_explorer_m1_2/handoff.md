# Explorer Handoff Report — Milestone 1: Multi-Source Connector Architecture (R1)

**Agent Role:** Explorer 2  
**Working Directory:** `d:/Code/Project/App Truyen Nova/.agents/teamwork_preview_explorer_m1_2`  
**Target Codebase Directory:** `d:/Code/Project/App Truyen Nova/backend_api_engine`  
**Date:** 2026-07-26T03:32:08Z  

---

## 1. Observation

1. **Existing Codebase & Project Environment:**
   - Evaluated `PRD.md`, `System_Design.md`, and `.agents/orchestrator/PROJECT.md`.
   - Inspected existing TypeScript connector implementations in `lib/sources/otruyen.ts` and `lib/sources/mangadex.ts`.
   - Verified that `backend_api_engine` is designated as a standalone Python FastAPI system (`PROJECT.md` lines 20-51).

2. **Comic Source Endpoints & Schemas:**
   - **OTruyen API (`https://otruyenapi.com/v1/api`):**
     - Catalog endpoint: `GET /danh-sach/truyen-moi?page={page}` (Returns items array, image CDN prefix `https://img.otruyenapi.com`, total pages pagination info).
     - Story detail endpoint: `GET /truyen-tranh/{slug}` (Returns metadata, author, synopsis, category array, and `chapters` list organized by server).
     - Chapter content endpoint: `GET /chapter/{chapter_id}` (Returns `domain_cdn`, `chapter_path`, and `chapter_image` array containing image filenames).
   - **MangaDex API v5 (`https://api.mangadex.org`):**
     - Manga Search & Feed: `GET /manga` and `GET /manga/{id}/feed` (Returns UUIDs, localized Vietnamese titles `attributes.title.vi`, altTitles, cover art relationships).
     - At-Home CDN Endpoint: `GET /at-home/server/{chapter_id}` (Returns `baseUrl`, `chapter.hash`, `chapter.data[]`). Pages constructed via `baseUrl/data/{hash}/{filename}`. Enforces rate limits with `HTTP 429`.
   - **Custom HTML Comic Scraper Engine:**
     - Evaluated CSS selector strategy for WordPress Madara and custom manga themes (`.list-story .item`, `#chapter-list a`, `#reader-content img`).
     - Designed regex extraction fallback for inline JavaScript image arrays (`var images = [...]`, `var page_images = [...]`).

3. **Novel Source HTML Parsing Schemas:**
   - **Hako (`ln.hako.vn` / `docln.net`):**
     - Story detail: `span.series-name a`, `.series-information`, `section.volume-list header.title-line span.title` (Volume hierarchy), `ul.list-chapters li a` (Chapters).
     - Chapter detail: Content container `#chapter-content`. Needs stripping of inline user notes (`.note-content`), scripts, and bookmarks.
   - **TruyenFull (`truyenfull.io` / `truyenfull.vn`):**
     - Story detail: `h3.title`, `a[itemprop="author"]`, `div.desc-text`, `#list-chapter ul.list-chapter li a`.
     - Chapter detail: `#chapter-c`. Requires scrubbing TruyenFull text ad insertions (`<i>TruyenFull.vn</i>`, `goc-quang-cao`, "Bạn đang đọc truyện tại TruyenFull...").
   - **Metruyenchu (`metruyenchu.com.vn`):**
     - Story detail: `h1.book-title`, `.book-info .author`, `#book-summary`, `.chapter-list a`.
     - Chapter detail: `#chapter-detail` / `.chapter-content`. Needs stripping of site domain ads and hidden watermarks.

4. **Base Interface & Domain Models:**
   - Unified async abstract base class `BaseConnector` defined with `fetch_catalog()`, `fetch_story()`, `fetch_chapter()`, and `health_check()`.
   - Standard domain models `Story`, `ChapterHeader`, `ChapterContent`, `CatalogFetchResult` defined using Pydantic V2 schemas.

---

## 2. Logic Chain

1. **Premise:** The system must aggregate both Comics (image-based) and Novels (text-based) from 6 distinct platforms (3 APIs, 3 HTML Scrapers) while exposing a uniform API to the frontend and merger engines.
2. **Step 1 (Polymorphic Medium Handling):** Standardizing `medium: StoryMedium` ("comic" vs "novel") in `Story` and `ChapterContent` allows `ChapterContent` to contain either `pages: List[str]` (for comics) or `text_content: str` (for novels), keeping transport logic uniform.
3. **Step 2 (Pydantic Schema Normalization):** Mapping raw provider payloads (OTruyen JSON, MangaDex JSON, HTML DOMs) directly into immutable Pydantic models ensures type safety, deterministic validation, and strict error boundaries.
4. **Step 3 (Resiliency & Provenance):** Requiring `source_id`, `external_id`, `external_url`, and `raw_metadata` on every domain model ensures provenance for auditing, and adding `CircuitBreaker` + rate limit retry logic prevents cascading failures across sources.
5. **Conclusion:** The architecture specified in `analysis.md` provides an extendable, production-ready specification for the implementer agent to write python connector code in `backend_api_engine/app/connectors/`.

---

## 3. Caveats

1. **Cloudflare / WAF Protections:** Some novel sites (Hako, TruyenFull) may periodically activate Cloudflare JS Challenge / Turnstile. Standard HTTP headers (`User-Agent`, `Accept`) work for standard GET requests, but a FlareSolverr / Playwright browser sidecar may be needed if Cloudflare anti-bot blocks pure HTTP clients.
2. **TruyenFull Chapter List Pagination:** TruyenFull spreads chapter lists across multiple HTML pages or AJAX requests (`/ajax.php?type=chapter_option`). The `TruyenFullConnector` must implement async multi-page/AJAX chapter fetching for long stories (>100 chapters).
3. **MangaDex Rate Limits:** MangaDex `/at-home/server` enforces 5 req/s. Concurrency for MangaDex image page fetching must be explicitly throttled.

---

## 4. Conclusion

- Explorer 2 has completed the comprehensive research and architectural design for the Multi-Source Connector System (R1).
- The detailed research findings, endpoint mappings, DOM selector tables, Async `BaseConnector` code contracts, Pydantic data models, and resiliency mechanisms have been documented in `analysis.md`.
- The design is fully prepared for the Implementer to construct `backend_api_engine/app/connectors/` (Base connector, Comic connectors, and Novel connectors).

---

## 5. Verification Method

To verify the deliverables:

1. **Inspect Analysis Report:**
   - Read `d:/Code/Project/App Truyen Nova/.agents/teamwork_preview_explorer_m1_2/analysis.md`.
   - Verify Section 3 (Data Models & BaseConnector), Section 5 (Comic APIs), Section 6 (Novel HTML Schemas), and Section 7 (Resiliency).
2. **Validate Code Contracts:**
   - Confirm `Story`, `ChapterHeader`, `ChapterContent`, and `CatalogFetchResult` schemas match the requirements of `PROJECT.md`.
   - Confirm `BaseConnector` methods (`fetch_catalog`, `fetch_story`, `fetch_chapter`) are async and non-blocking.
3. **Audit Matrix Verification:**
   - Review Section 8 of `analysis.md` for test coverage metrics against OTruyen, MangaDex, Custom Scraper, Hako, TruyenFull, and Metruyenchu.
