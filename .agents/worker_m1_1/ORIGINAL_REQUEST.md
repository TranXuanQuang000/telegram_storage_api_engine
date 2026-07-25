## 2026-07-26T03:32:23Z
You are Worker 1 for Milestone 1 of the Multi-Source Aggregator API System project.
Working directory: d:/Code/Project/App Truyen Nova/.agents/worker_m1_1
Project Code Directory: d:/Code/Project/App Truyen Nova/backend_api_engine

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task — Implement Milestone 1 (Multi-Source Connector Architecture R1):
1. Initialize the project in `d:/Code/Project/App Truyen Nova/backend_api_engine`.
2. Create `requirements.txt` with `fastapi`, `uvicorn`, `httpx`, `beautifulsoup4`, `pydantic`, `pytest`, `pytest-asyncio`, `lxml`.
3. Create `app/models/story.py` and `app/models/chapter.py`:
   - Pydantic V2 schemas: `Story`, `ChapterHeader`, `ChapterContent`, `CatalogFetchResult`, `StoryMedium` ("comic", "novel"), `StoryStatus`, `ContentRating`.
   - Ensure fields: `source_id`, `external_id`, `external_url`, `title`, `slug`, `author`, `description`, `cover_url`, `genres`, `status`, `medium`, `updated_at`, `chapters`, `raw_metadata`.
4. Create `app/connectors/base.py`:
   - Abstract base class `BaseConnector` with async methods: `fetch_catalog(page=1, limit=20, category=None)`, `fetch_story(identifier: str)`, `fetch_chapter(story_identifier: str, chapter_identifier: str)`, `health_check()`.
5. Create Comic Connectors in `app/connectors/comic/`:
   - `otruyen.py`: OTruyen API connector (`https://otruyenapi.com/v1/api`). Formats CDN image URLs properly (`domain_cdn/chapter_path/filename`).
   - `mangadex.py`: MangaDex API connector (`https://api.mangadex.org`). Handles MangaDex v5 JSON, feed pagination, and At-Home CDN image path building (`baseUrl/data/hash/file`).
   - `html_scraper.py`: Custom HTML Scraper connector using BeautifulSoup4 / CSS selectors & regex extraction for generic comic sites.
6. Create Novel Connectors in `app/connectors/novel/`:
   - `hako.py`: Hako (`ln.hako.vn`) HTML scraper.
   - `truyenfull.py`: TruyenFull (`truyenfull.io` / `truyenfull.vn`) scraper supporting pagination/AJAX list parsing.
   - `metruyenchu.py`: Metruyenchu (`metruyenchu.com.vn`) scraper.
7. Create `tests/test_connectors.py` testing all 6 connectors with unit tests (using `pytest` and `httpx` mock/live responses).
8. Execute the test suite using `pytest` inside `backend_api_engine` (or via python -m pytest), document test results and commands in your `handoff.md`, and report completion to the orchestrator.
