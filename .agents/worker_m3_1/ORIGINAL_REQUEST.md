## 2026-07-25T20:38:37Z
You are Worker 4 for Milestone 3 of the Multi-Source Aggregator API System project.
Working directory: d:/Code/Project/App Truyen Nova/.agents/worker_m3_1
Project Code Directory: d:/Code/Project/App Truyen Nova/backend_api_engine

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task — Implement Milestone 3 (REST API Compatibility Server R3):
1. Implement FastAPI app in `app/main.py`:
   - Setup CORS, global error handlers, response compression / timing middleware (`X-Response-Time-Ms`), and router inclusions.
2. Implement OTruyen Standard Endpoints in `app/api/v1/otruyen.py`:
   - `GET /v1/api/danh-sach/truyen-moi` (query params `page`, `limit`): returns OTruyen JSON format catalog list.
   - `GET /v1/api/truyen-tranh/{slug}`: returns OTruyen JSON format comic detail with merged continuous chapter list (`SmartChapterMerger`).
   - `GET /v1/api/chapter/{id}`: returns OTruyen JSON format chapter content (domain_cdn, chapter_path, image array).
3. Implement Novel API Extension Endpoints in `app/api/v1/novel.py`:
   - `GET /v1/api/truyen-chu/danh-sach` (query params `page`, `limit`): returns list of novel metadata items.
   - `GET /v1/api/truyen-chu/{slug}`: returns novel detail with continuous merged chapter list from Hako / TruyenFull / Metruyenchu (`SmartChapterMerger`).
   - `GET /v1/api/truyen-chu/{slug}/chapter/{chapterNo}`: returns cleaned novel chapter text content (`NovelTextCleaner`).
4. Implement Cache / Service Manager in `app/services/aggregator.py`:
   - Coordinates multi-source connector fetches, chapter gap merging, and caching to ensure response latency is under 1.5 seconds (<1.5s).
5. Create unit and API endpoint test suite in `tests/test_api.py`:
   - Uses `httpx.AsyncClient` + FastAPI `TestClient` or `app` instance to test all 6 API endpoints.
   - Tests OTruyen comic endpoints JSON output structure.
   - Tests Novel API endpoints JSON output structure and cleaned text payload.
   - Tests gap-filling integration through the API (`/v1/api/truyen-chu/{slug}`).
   - Measures response latency (<1.5s).
6. Run `python -m pytest -v` in `backend_api_engine` and verify all tests pass (including existing connector/merger/cleaner tests).
7. Document test results and commands in `handoff.md` and report completion to the orchestrator.
