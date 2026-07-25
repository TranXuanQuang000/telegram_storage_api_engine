# Context & Architectural Guidelines — Multi-Source Aggregator API System

## Project Context
The Multi-Source Aggregator API system is a backend engine designed to aggregate comic and novel content from multiple sources, perform smart chapter list merging and gap filling, clean novel text content, and expose standard REST API endpoints compatible with OTruyen standard + Novel extensions.

## Key Requirements & Scope
- **Backend Directory**: `d:/Code/Project/App Truyen Nova/backend_api_engine`
- **Orchestration Metadata Directory**: `d:/Code/Project/App Truyen Nova/.agents/orchestrator`

### 1. Multi-Source Connectors (R1)
- Comic Sources:
  - OTruyen API (`https://otruyenapi.com` or standard OTruyen schema)
  - MangaDex API (`https://api.mangadex.org`)
  - Custom HTML Scraper (Flexible scraper engine for HTML story sites)
- Novel Sources:
  - Hako (`ln.hako.vn`)
  - TruyenFull (`truyenfull.io` / `truyenfull.vn`)
  - Metruyenchu (`metruyenchu.com.vn`)

### 2. Smart Chapter Merge & Gap Filling Engine (R2)
- Automatically merges chapter lists from primary and secondary sources.
- Detects missing chapter gaps (e.g. Source A has ch 1-9, missing ch 10-20, ch 21-50).
- Automatically queries alternate sources (e.g. Source B) to fill missing gaps.
- Preserves source provenance and orders chapters accurately.

### 3. REST API Compatibility (R3)
- Comic OTruyen Standard Endpoints:
  - `GET /v1/api/danh-sach/truyen-moi`: Returns list of latest stories with metadata.
  - `GET /v1/api/truyen-tranh/{slug}`: Returns story details and merged continuous chapter list.
  - `GET /v1/api/chapter/{id}`: Returns chapter detail and image list array.
- Novel API Extension Endpoints:
  - `GET /v1/api/truyen-chu/danh-sach`: Returns list of novels.
  - `GET /v1/api/truyen-chu/{slug}`: Returns novel detail and merged chapter list.
  - `GET /v1/api/truyen-chu/{slug}/chapter/{chapterNo}`: Returns cleaned novel chapter text content.
- Novel Text Cleaning:
  - Removes 100% of ads, sponsored links, promotional scripts, garbage lines, hidden HTML tags, watermarks.

### 4. Verification & Testing (R4)
- Independent test suite in `tests/`.
- Latency requirement: API JSON response time < 1.5s.
- 100% test pass rate.
- Forensic Auditor integrity check (no mock bypasses or hardcoded static responses).
