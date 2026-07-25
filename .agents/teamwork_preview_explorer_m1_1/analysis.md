# Analysis & Recommendation Report: `backend_api_engine`

**Milestone:** 1 — Multi-Source Aggregator API System  
**Explorer:** Explorer 1  
**Date:** 2026-07-26  
**Target Path:** `d:/Code/Project/App Truyen Nova/backend_api_engine`

---

## 1. Executive Summary

This report presents the environment inspection, technology stack evaluation, and architectural directory layout proposal for the `backend_api_engine` component of the **App Truyen Nova (Mực)** project. 

`backend_api_engine` is designed to be a high-performance, asynchronous Python service responsible for multi-source story ingestion, HTML/JSON metadata scraping, catalog deduplication, Bayesian rating aggregation, and fast search response (<1.5s live aggregate, <200ms cache hit).

---

## 2. Workspace Environment Inspection

### 2.1 Installed Runtimes & Version Audit
- **Python Version:** `Python 3.12.0` (Primary global executable located at `C:\Users\TrieuHa\AppData\Local\Programs\Python\Python312\python.exe`; Python 3.14.0 is also installed on host system).
- **Node.js Environment:** `v24.14.1` with `npm 11.11.0` (Root workspace is a TypeScript/Next.js/Cloudflare Worker project with D1/Drizzle bindings).
- **Package Managers & Tools:**
  - Standard `pip` (v23.2.1 installed).
  - Python standard library `venv` module available.
  - Poetry / uv / Pipenv / Conda are **not** present in global system PATH.
- **Virtual Environments:** No active `.venv` currently exists inside the workspace directory (`d:/Code/Project/App Truyen Nova`).

### 2.2 Environment Implications
- Using standard `venv` (`python -m venv .venv`) managed via `requirements.txt` (or standard `pyproject.toml` with `pip`) ensures 100% compatibility across environments without requiring external package manager installations.
- `backend_api_engine` will reside in `d:/Code/Project/App Truyen Nova/backend_api_engine` as a self-contained Python project.

---

## 3. Technology Stack Recommendations

To satisfy performance (<1.5s API response time for live multi-source aggregation, <200ms P95 for cached queries), non-blocking I/O, resilience against source failures, and high-quality HTML parsing, the following stack is recommended:

| Layer / Category | Recommended Tool | Version | Selection Rationale |
|---|---|---|---|
| **Language Runtime** | Python | 3.12+ | Modern `asyncio` engine with low execution latency, native generic types, and improved performance. |
| **Web Framework** | **FastAPI** | `^0.115.0` | High-performance ASGI framework built on `asyncio` and Pydantic v2. Extremely fast, lightweight, provides automatic OpenAPI spec generation, and async dependency injection. |
| **ASGI Server** | **Uvicorn** | `^0.30.0` | Ultra-fast ASGI server implementation using `uvloop` (where supported) or standard `asyncio` event loop. |
| **Async HTTP Client** | **httpx** | `^0.27.0` | Asynchronous, HTTP/2-capable HTTP client with connection pooling, strict timeouts, async context management (`AsyncClient`), and modern interface. |
| **HTML Scraping & Parsing** | **BeautifulSoup4** + **lxml** | `bs4 ^4.12.0`, `lxml ^5.2.0` | Robust parsing of messy/malformed HTML pages from diverse manga providers. `lxml` C-backend provides high parser speed. |
| **Data Validation & Serialization** | **Pydantic** | `^2.9.0` | Rust-backed `pydantic-core` yields 5–20x performance speedups over v1, guaranteeing strict schema enforcement, serialization, and type coercion. |
| **Testing Framework** | **Pytest** + **pytest-asyncio** + **httpx** | `pytest ^8.3.0`, `pytest-asyncio ^0.24.0` | Robust, standardized async testing framework with support for fixtures, async route testing with `httpx.AsyncClient`, and coverage reporting. |
| **Resilience & Retries** | **Tenacity** | `^9.0.0` | Declarative async retries, backoff strategies, and timeout handling for external source calls. |
| **Caching Layer** | **Cachetools** / **async-lru** | `^5.4.0` | In-memory TTL LRU caching layer for catalog queries and score calculations to guarantee <200ms API response times. |
| **Linting & Formatting** | **Ruff** | `^0.6.0` | Extremely fast Rust-based Python linter and code formatter. |
| **Static Type Checking** | **Mypy** | `^1.11.0` | Strict static typing validation across models, schemas, and connectors. |

---

## 4. Architectural Strategies for High Performance & Reliability

1. **Parallel Asynchronous Scraping (`asyncio.gather`):**
   - When aggregating results from multiple sources (e.g. OTruyen, OPDS, custom HTML providers), calls are dispatched concurrently via `httpx.AsyncClient` with `asyncio.gather(..., return_exceptions=True)`.
   - Prevents slow/unresponsive sources from blocking faster sources.

2. **Strict Timeouts & Circuit Breaking:**
   - Per-source HTTP timeout set to 5.0 seconds max (overall endpoint budget <1.5s when fetching top candidates).
   - If a source repeatedly fails or times out, a Circuit Breaker trips to `OPEN` state to immediately fail fast without waiting for timeouts.

3. **Multi-tier Response Caching:**
   - **Tier 1 (In-Memory LRU):** High-frequency catalog metadata cached with a 5-minute TTL to serve P95 responses under 50ms.
   - **Tier 2 (E-Tag & Conditional Requests):** `httpx` sends `If-None-Match` / `If-Modified-Since` headers to upstream APIs/connectors to minimize bandwidth and processing.

4. **Robust HTML Scraping Pipeline:**
   - `BeautifulSoup4` configured with `lxml` parser engine.
   - Resilient DOM fallbacks: selector cascades (e.g. trying `.chapter-list a`, `#chapters a`, `.list-chapters a`) to handle target DOM mutations gracefully.

---

## 5. Proposed Directory & File Layout for `backend_api_engine`

```text
backend_api_engine/
├── .gitignore
├── .env.example
├── README.md
├── pyproject.toml
├── requirements.txt
├── requirements-dev.txt
├── app/
│   ├── __init__.py
│   ├── main.py                     # FastAPI app instance, lifecycle hooks, CORS & global middleware
│   ├── config.py                   # Pydantic BaseSettings (env vars, timeouts, source configs)
│   ├── dependencies.py             # FastAPI dependency injection (shared httpx.AsyncClient, cache)
│   │
│   ├── api/                        # API Routing Layer
│   │   ├── __init__.py
│   │   ├── router.py               # Main API Router aggregating v1 endpoints
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── health.py           # GET /api/v1/health (system & connector status)
│   │       ├── catalog.py          # GET /api/v1/catalog (search & aggregated multi-source catalog)
│   │       ├── stories.py          # GET /api/v1/stories/{slug} (story detail & chapter list)
│   │       ├── chapters.py         # GET /api/v1/chapters/{id} (chapter page manifests)
│   │       └── sources.py          # GET /api/v1/sources (active connector registry status)
│   │
│   ├── core/                       # Core Utilities & Middlewares
│   │   ├── __init__.py
│   │   ├── exceptions.py           # Custom exception hierarchy & standard error models
│   │   ├── middleware.py           # Latency/Timing header middleware, error catchers
│   │   ├── logging.py              # Structured JSON logging configuration
│   │   └── security.py             # SSRF prevention, URL safety validation, rate-limiting
│   │
│   ├── schemas/                    # Pydantic Schemas & DTOs
│   │   ├── __init__.py
│   │   ├── common.py               # Standardized BaseResponse, Pagination, Error schemas
│   │   ├── story.py                # StoryModel, StoryAlias, StoryDetail DTOs
│   │   ├── chapter.py              # ChapterModel, PageManifest DTOs
│   │   ├── source.py               # SourceInfo, SourceStatus DTOs
│   │   └── rating.py               # RatingSnapshot, AggregatedScore DTOs
│   │
│   ├── services/                   # Business Logic & Aggregation Engine
│   │   ├── __init__.py
│   │   ├── aggregator.py           # Async Multi-Source Aggregator & Parallel Executor
│   │   ├── deduplicator.py         # Title/Author string normalization & entity deduplication
│   │   ├── rating_calculator.py    # Bayesian rating score normalization & aggregation
│   │   └── cache_service.py        # Async in-memory LRU cache service
│   │
│   └── sources/                    # Extensible Source Connectors (Plugin Architecture)
│       ├── __init__.py
│       ├── base.py                 # Abstract BaseSourceConnector interface definition
│       ├── registry.py             # Source Registry for dynamic connector lookup
│       ├── parsers/                # Shared HTML/JSON Parsing Helpers
│       │   ├── __init__.py
│       │   └── html_parser.py      # BS4 + lxml wrapper with fallback selector support
│       ├── otruyen/                # OTruyen Source Connector Implementation
│       │   ├── __init__.py
│       │   ├── client.py
│       │   └── parser.py
│       └── opds/                   # OPDS / Komga / Kavita Source Connector Implementation
│           ├── __init__.py
│           ├── client.py
│           └── parser.py
│
└── tests/                          # Automated Test Suite
    ├── __init__.py
    ├── conftest.py                 # Pytest setup, async loop fixture, mock client, HTML fixtures
    ├── unit/                       # Fast isolated unit tests
    │   ├── test_deduplicator.py
    │   ├── test_rating_calculator.py
    │   ├── test_html_parser.py
    │   └── test_otruyen_parser.py
    ├── integration/                # Service & Aggregator integration tests
    │   ├── test_aggregator_service.py
    │   └── test_connectors.py
    └── api/                        # FastAPI route end-to-end tests
        ├── test_health_api.py
        ├── test_catalog_api.py
        └── test_stories_api.py
```

---

## 6. Implementation Guidance for Developer Teams

1. **Virtual Environment Setup:**
   ```bash
   python -m venv .venv
   # Windows PowerShell:
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **Core Dependencies (`requirements.txt`):**
   ```text
   fastapi>=0.115.0,<0.116.0
   uvicorn[standard]>=0.30.0,<0.31.0
   httpx>=0.27.0,<0.28.0
   beautifulsoup4>=4.12.0,<5.0.0
   lxml>=5.2.0,<6.0.0
   pydantic>=2.9.0,<3.0.0
   pydantic-settings>=2.4.0,<3.0.0
   tenacity>=9.0.0,<10.0.0
   cachetools>=5.4.0,<6.0.0
   ```

3. **Development & Testing Dependencies (`requirements-dev.txt`):**
   ```text
   pytest>=8.3.0,<9.0.0
   pytest-asyncio>=0.24.0,<1.0.0
   pytest-cov>=5.0.0,<6.0.0
   ruff>=0.6.0,<1.0.0
   mypy>=1.11.0,<2.0.0
   types-beautifulsoup4
   types-cachetools
   ```

4. **Testing Command:**
   ```bash
   pytest --cov=app tests/
   ```
