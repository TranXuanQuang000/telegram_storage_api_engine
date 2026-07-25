# Technical Analysis & Architecture Design: Multi-Source Connector System (R1)

**Author:** Explorer 2 (Milestone 1)  
**Target Subsystem:** `backend_api_engine/app/connectors/`  
**Date:** July 26, 2026  
**Status:** Complete  

---

## 1. Executive Summary

This document establishes the architectural blueprint, data models, endpoint specifications, HTML parsing schemas, and resiliency patterns for the **Multi-Source Connector Architecture (R1)** of the Multi-Source Aggregator API System.

The aggregator system must fetch metadata and content from 6 primary content providers spanning both **Comic** (Manga/Manhwa/Manhua) and **Novel** (Light Novel/Web Novel) media:
1. **Comic Providers:**
   - **OTruyen API:** Public JSON API (`https://otruyenapi.com/v1/api`).
   - **MangaDex API v5:** REST API (`https://api.mangadex.org`).
   - **Custom Comic HTML Scraper:** Generic HTML scraper engine for non-API comic websites.
2. **Novel Providers:**
   - **Hako (`ln.hako.vn` / `docln.net`):** Vietnamese Light Novel platform (HTML Scraper).
   - **TruyenFull (`truyenfull.io` / `truyenfull.vn`):** Popular Web Novel aggregator (HTML Scraper).
   - **Metruyenchu (`metruyenchu.com.vn`):** High-volume Web Novel platform (HTML Scraper).

All connectors extend a single unified asynchronous base class (`BaseConnector`), returning strict, standardized domain objects (`Story`, `ChapterHeader`, `ChapterContent`, `CatalogFetchResult`).

---

## 2. Multi-Source Connector System Architecture

### 2.1 Design Principles

1. **Medium Agnosticism with Structural Specialization:**  
   The core interface handles both `comic` (image frame arrays) and `novel` (text/HTML paragraphs) via standard polymorphic content wrappers without duplicating transport or caching code.
2. **Asynchronous Non-blocking IO:**  
   Built natively on Python `asyncio` and `httpx.AsyncClient`, supporting high concurrency with low CPU overhead.
3. **Connector Registry Pattern:**  
   Connectors are registered in a global `ConnectorRegistry`, keyed by `source_id`. Connectors self-describe their capabilities (`medium`, `kind`, `base_url`, `supported_features`).
4. **Provenance and Raw Metadata Retention:**  
   Every normalized domain object preserves its origin `source_id`, `external_id`, `external_url`, and `raw_metadata` payload to ensure 100% auditability and attribution.
5. **Fault Isolation & Resiliency:**  
   Network issues or HTML schema changes in one source must never degrade performance or crash requests targeting other sources. Each connector operates with independent circuit breakers and rate limiters.

### 2.2 System Component Diagram

```text
                                +-----------------------------+
                                |      ConnectorRegistry      |
                                +--------------+--------------+
                                               |
                     +-------------------------+-------------------------+
                     |                                                   |
         +-----------v-----------+                           +-----------v-----------+
         |    Comic Connectors   |                           |    Novel Connectors   |
         +-----------+-----------+                           +-----------+-----------+
                     |                                                   |
  +------------------+------------------+             +------------------+------------------+
  |                  |                  |             |                  |                  |
+-v----------+ +-----v------+ +---------v----+  +-----v-----+      +-----v-----+      +-----v-----+
|  OTruyen   | |  MangaDex  | | Custom HTML  |  |   Hako    |      |TruyenFull |      |Metruyenchu|
|Connector   | |Connector   | |Comic Scraper |  |Connector  |      |Connector  |      |Connector  |
+------------+ +------------+ +--------------+  +-----------+      +-----------+      +-----------+
```

---

## 3. Data Models Architecture (`models/story.py` & `models/chapter.py`)

### 3.1 Enumeration Types

```python
from enum import Enum

class StoryMedium(str, Enum):
    COMIC = "comic"
    NOVEL = "novel"

class StoryStatus(str, Enum):
    ONGOING = "ongoing"
    COMPLETED = "completed"
    HIATUS = "hiatus"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"

class ContentRating(str, Enum):
    SAFE = "safe"
    SUGGESTIVE = "suggestive"
    MATURE = "mature"
    EXPLICIT = "explicit"

class SourceKind(str, Enum):
    API = "api"
    SCRAPER = "scraper"
```

### 3.2 Standard Data Models (Pydantic V2)

```python
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class ChapterHeader(BaseModel):
    id: str = Field(..., description="Unique connector chapter ID (e.g. otruyen_65a123, mangadex_uuid, hako_ch_456)")
    chapter_number: str = Field(..., description="Normalized string chapter number, e.g. '1', '12.5', '100'")
    chapter_float: Optional[float] = Field(None, description="Parsed numeric float for sorting & gap calculations")
    title: str = Field("", description="Title of the chapter")
    volume: Optional[str] = Field(None, description="Volume number or volume name if applicable")
    language: str = Field("vi", description="Language ISO code (e.g. 'vi', 'en')")
    updated_at: Optional[datetime] = Field(None, description="Publication timestamp")
    external_url: Optional[str] = Field(None, description="Direct URL on source website")
    source_id: str = Field(..., description="Source identifier (e.g. 'otruyen', 'hako')")

class Story(BaseModel):
    id: str = Field(..., description="Unique global story ID, formatted as '{source_id}_{external_id}'")
    slug: str = Field(..., description="URL-friendly slug identifier")
    medium: StoryMedium = Field(..., description="Medium type: 'comic' or 'novel'")
    title: str = Field(..., description="Canonical title in Vietnamese")
    original_title: Optional[str] = Field(None, description="Original title in source language (Ja/Zh/En)")
    aliases: List[str] = Field(default_factory=list, description="Alternative title aliases")
    authors: List[str] = Field(default_factory=list, description="List of author names")
    artists: List[str] = Field(default_factory=list, description="List of artist or illustrator names")
    synopsis: str = Field("", description="Sanitized story description")
    status: StoryStatus = Field(StoryStatus.ONGOING, description="Publication status")
    content_rating: ContentRating = Field(ContentRating.SAFE, description="Content rating safety level")
    cover_url: Optional[str] = Field(None, description="Absolute URL to primary cover image")
    genres: List[str] = Field(default_factory=list, description="List of genre names")
    source_id: str = Field(..., description="Source identifier")
    source_name: str = Field(..., description="Human-readable source name e.g. 'OTruyen API'")
    source_url: str = Field(..., description="Canonical source webpage URL")
    latest_chapter: Optional[str] = Field(None, description="Latest chapter number/label")
    chapters: List[ChapterHeader] = Field(default_factory=list, description="List of chapter headers")
    updated_at: Optional[datetime] = Field(None, description="Last updated timestamp from source")
    raw_metadata: Dict[str, Any] = Field(default_factory=dict, description="Raw provider metadata for provenance")

class ChapterContent(BaseModel):
    id: str = Field(..., description="Unique chapter ID matching ChapterHeader.id")
    story_id: str = Field(..., description="Associated Story ID")
    chapter_number: str = Field(..., description="Normalized chapter number string")
    title: str = Field("", description="Chapter title")
    medium: StoryMedium = Field(..., description="Comic or Novel")
    pages: Optional[List[str]] = Field(None, description="Array of direct image URLs if medium == COMIC")
    text_content: Optional[str] = Field(None, description="Cleaned HTML/Markdown text body if medium == NOVEL")
    word_count: Optional[int] = Field(None, description="Estimated word count for novel chapters")
    source_id: str = Field(..., description="Source identifier")
    source_url: str = Field(..., description="Direct link on source site")
    fetched_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when content was fetched")

class CatalogFetchResult(BaseModel):
    stories: List[Story]
    current_page: int
    total_pages: int
    total_items: Optional[int] = None
    has_next: bool
```

---

## 4. `BaseConnector` Async Interface Design (`connectors/base.py`)

```python
from abc import ABC, abstractmethod
from typing import Optional

class BaseConnector(ABC):
    """
    Abstract Base Class for all Multi-Source Connectors.
    All methods are asynchronous and return standard Pydantic domain models.
    """
    source_id: str
    source_name: str
    medium: StoryMedium
    kind: SourceKind
    base_url: str

    def __init__(self, timeout: float = 10.0, max_retries: int = 3):
        self.timeout = timeout
        self.max_retries = max_retries

    @abstractmethod
    async def fetch_catalog(self, page: int = 1, limit: int = 24, category: Optional[str] = None) -> CatalogFetchResult:
        """
        Fetch paginated catalog list of stories.
        """
        pass

    @abstractmethod
    async def fetch_story(self, identifier: str) -> Story:
        """
        Fetch story metadata and full list of chapter headers.
        'identifier' can be a slug or external ID.
        """
        pass

    @abstractmethod
    async def fetch_chapter(self, story_identifier: str, chapter_identifier: str) -> ChapterContent:
        """
        Fetch full content for a single chapter.
        For COMIC: returns populated `pages` array.
        For NOVEL: returns sanitized `text_content` string.
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check connectivity and health of the source API or website.
        """
        pass
```

---

## 5. Comic Sources Analysis & Specifications

### 5.1 OTruyen API Connector (`connectors/comic/otruyen.py`)

- **Base Endpoint:** `https://otruyenapi.com/v1/api`
- **Default Image CDN:** `https://img.otruyenapi.com` (fallback `https://sv1.otruyencdn.com`)
- **Endpoints & Schemas:**

| Functionality | HTTP Endpoint | Key Response Payload Path |
|---|---|---|
| Catalog List | `GET /danh-sach/truyen-moi?page={page}` | `data.items[]`, `data.params.pagination` |
| Category Filter | `GET /the-loai/{category_slug}?page={page}` | `data.items[]`, `data.params.pagination` |
| Story Detail | `GET /truyen-tranh/{slug}` | `data.item`, `data.item.chapters[].server_data[]` |
| Chapter Content | `GET /chapter/{chapter_id}` | `data.domain_cdn`, `data.item.chapter_path`, `data.item.chapter_image[]` |

- **OTruyen Chapter Image URL Assembly:**
  ```python
  domain_cdn = payload["data"]["domain_cdn"] # e.g. "https://sv1.otruyencdn.com"
  chapter_path = payload["data"]["item"]["chapter_path"] # e.g. "upload/comics/slug_ch1"
  images = [
      f"{domain_cdn}/{chapter_path}/{img['image_file']}"
      for img in payload["data"]["item"]["chapter_image"]
  ]
  ```

- **OTruyen Status Mapping:**
  - `"ongoing"` -> `StoryStatus.ONGOING`
  - `"completed"` -> `StoryStatus.COMPLETED`
  - `"hiatus"` -> `StoryStatus.HIATUS`

---

### 5.2 MangaDex API v5 Connector (`connectors/comic/mangadex.py`)

- **Base Endpoint:** `https://api.mangadex.org`
- **At-Home CDN Endpoint:** `https://api.mangadex.org/at-home/server/{chapter_id}`
- **Endpoints & Schemas:**

| Functionality | HTTP Endpoint | Key Query Parameters / Fields |
|---|---|---|
| Search / Catalog | `GET /manga` | `limit=24&offset={offset}&translatedLanguage[]=vi&includes[]=cover_art&includes[]=author` |
| Latest Updates | `GET /chapter` | `limit=24&translatedLanguage[]=vi&order[readableAt]=desc&includes[]=manga` |
| Story Detail | `GET /manga/{id}` | `includes[]=cover_art&includes[]=author&includes[]=artist` |
| Chapter List | `GET /manga/{id}/feed` | `translatedLanguage[]=vi&order[chapter]=asc&limit=500` |
| Chapter Pages | `GET /at-home/server/{chapter_id}` | Returns `baseUrl`, `chapter.hash`, `chapter.data[]` (standard) or `chapter.dataSaver[]` |

- **MangaDex Page Image URL Construction:**
  ```python
  # Standard Quality:
  page_url = f"{base_url}/data/{chapter_hash}/{file_name}"
  # Data Saver Quality:
  data_saver_url = f"{base_url}/data-saver/{chapter_hash}/{file_name}"
  ```
- **Cover Image Construction:**
  `https://uploads.mangadex.org/covers/{manga_id}/{cover_filename}`

- **Rate Limit & Retry Policy:**
  MangaDex strictly limits `/at-home/server` calls to 5 requests per second. The connector inspects `HTTP 429` responses and sleeps for `Retry-After` seconds before re-attempting.

---

### 5.3 Custom Comic HTML Scraper Engine (`connectors/comic/html_scraper.py`)

For non-API comic portals built on WordPress Madara theme, MangaReader, or custom PHP frameworks.

- **Selector Mapping Configuration:**

```python
class HtmlComicSelectors(BaseModel):
    catalog_item: str = ".list-story .item, .page-item-detail"
    catalog_title: str = "h3 a, .post-title a"
    catalog_cover: str = "img.lazy, img.cover, .summary_image img"
    catalog_link: str = "h3 a, .post-title a"
    
    detail_title: str = "h1.title, .post-title h1"
    detail_author: str = ".author a, .manga-author a"
    detail_synopsis: str = ".description, .summary__content"
    detail_status: str = ".status, .post-status"
    detail_genres: str = ".genres a, .manga-genres a"
    detail_chapters: str = "#chapter-list a, .ul-list-chapter a, li.wp-manga-chapter a"
    
    chapter_images: str = "#reader-content img, .reading-detail img, div.page-break img"
```

- **Obfuscated Script Parser:**
  Many comic sites dynamically encode image arrays inside inline `<script>` tags. The custom scraper falls back to regex matching for `var images = [...]`, `var page_images = [...]`, or `base64` JSON blobs when HTML `<img>` elements are absent.

---

## 6. Novel Sources Analysis & HTML Parsing Schemas

Novel platforms require HTML scraping because Vietnamese Light Novel & Web Novel platforms do not provide official JSON APIs.

---

### 6.1 Hako (`ln.hako.vn` / `docln.net`) Connector (`connectors/novel/hako.py`)

- **Domain:** `https://ln.hako.vn` / `https://docln.net`
- **URL Patterns:**
  - Catalog: `https://ln.hako.vn/danh-sach?sapxep=capnhat&page={page}`
  - Novel Detail: `https://ln.hako.vn/truyen/{id}-{slug}`
  - Chapter Page: `https://ln.hako.vn/truyen/{id}-{slug}/{chapter_id}-{chapter_slug}`

- **HTML Parsing Schema:**

| Entity | Target Component | CSS Selector / DOM Path | Extraction Logic |
|---|---|---|---|
| Catalog Item | Story Card | `.thumb-item-flow` | Container |
| Catalog Title | Story Title | `.series-title a` | `.text()` |
| Catalog Cover | Story Cover | `.img-in-ratio` | Extract `data-bg` attribute or `src` |
| Detail Title | Novel Title | `span.series-name a` | `.text().strip()` |
| Detail Author | Author Name | `.series-information .info-item:contains("Tác giả") .info-value` | `.text().strip()` |
| Detail Synopsis | Description | `.summary-content` | Clean HTML content |
| Volume List | Volume Header | `section.volume-list header.title-line span.title` | Text = Volume Name |
| Chapter List | Chapter Link | `section.volume-list ul.list-chapters li a` | `text()` = Title, `href` = Chapter URL |
| Chapter Content | Body Text | `#chapter-content` | Parse paragraphs `<p>`, remove `.note-content`, scripts, comment anchors |

- **Hako Specific Cleaning:**
  Strip inline user footnotes (`.note-content`), bookmark icons, and hidden tracking pixels.

---

### 6.2 TruyenFull (`truyenfull.io` / `truyenfull.vn`) Connector (`connectors/novel/truyenfull.py`)

- **Domain:** `https://truyenfull.io` / `https://truyenfull.vn`
- **URL Patterns:**
  - Catalog: `https://truyenfull.io/danh-sach/truyen-moi/trang-{page}/`
  - Novel Detail: `https://truyenfull.io/{slug}/`
  - Chapter Page: `https://truyenfull.io/{slug}/chuong-{chapterNo}/`

- **HTML Parsing Schema:**

| Entity | Target Component | CSS Selector / DOM Path | Extraction Logic |
|---|---|---|---|
| Catalog Item | Story Row | `.list-truyen .row` | Container |
| Catalog Title | Title | `.truyen-title a` | `.text()` |
| Detail Title | Title | `h3.title` | `.text()` |
| Detail Author | Author | `a[itemprop="author"]` | `.text()` |
| Detail Genres | Genres | `a[itemprop="genre"]` | Array of text |
| Detail Status | Status | `span.text-success`, `span.text-primary` | "Hoàn thành" -> COMPLETED, "Đang ra" -> ONGOING |
| Detail Synopsis | Synopsis | `div.desc-text` | HTML content |
| Chapter List | Pagination / Ajax | `#list-chapter ul.list-chapter li a` | Handles TruyenFull multi-page chapter lists |
| Chapter Content | Body Text | `#chapter-c` | Extract paragraphs, execute anti-ad text cleaner |

- **TruyenFull Anti-Ad Cleaning:**
  TruyenFull injects domain advertisements into text (e.g. `<i>TruyenFull.vn</i>`, `goc-quang-cao`, `Bạn đang đọc truyện tại TruyenFull...`). These MUST be scrubbed before returning `ChapterContent`.

---

### 6.3 Metruyenchu (`metruyenchu.com.vn`) Connector (`connectors/novel/metruyenchu.py`)

- **Domain:** `https://metruyenchu.com.vn`
- **URL Patterns:**
  - Catalog: `https://metruyenchu.com.vn/danh-sach?page={page}`
  - Novel Detail: `https://metruyenchu.com.vn/truyen/{slug}`
  - Chapter Page: `https://metruyenchu.com.vn/truyen/{slug}/chuong-{chapterNo}`

- **HTML Parsing Schema:**

| Entity | Target Component | CSS Selector / DOM Path | Extraction Logic |
|---|---|---|---|
| Detail Title | Title | `h1.book-title` or `.book-info h1` | `.text()` |
| Detail Author | Author | `.book-info .author a` | `.text()` |
| Detail Synopsis | Synopsis | `#book-summary`, `.book-desc` | Clean text |
| Chapter List | Chapter Table | `#chapters a`, `.chapter-list a` | Extract chapter links & numbers |
| Chapter Content | Body Text | `#chapter-detail`, `.chapter-content` | Extract clean text |

---

## 7. Resiliency, Rate Limiting & Anti-Scraping Strategy

### 7.1 Async HTTP Engine & Connection Management
All connectors share an asynchronous HTTP execution pool configured with:
- **Max Connections:** 50 global, 10 per individual host.
- **Connection Keep-Alive:** 30 seconds.
- **HTTP/2 Support:** Enabled for MangaDex and Hako.

### 7.2 Rate Limiting & Circuit Breaker Architecture

```python
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.state = "CLOSED" # CLOSED, OPEN, HALF-OPEN
        self.last_state_change = datetime.utcnow()

    def record_success(self):
        self.failure_count = 0
        self.state = "CLOSED"

    def record_failure(self):
        self.failure_count += 1
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
            self.last_state_change = datetime.utcnow()
```

### 7.3 Header Fraud & User-Agent Rotation
To prevent IP blocks and bot detection on scraping novel sites:
- **User-Agent Pool:** Rotate standard browser user-agents (Chrome 125+, Firefox 126+).
- **Default Headers:**
  ```json
  {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
  }
  ```

---

## 8. Verification & Independent Audit Matrix

The design will be validated against this verification matrix:

| Target Connector | Input Test Case | Expected Outcome | Verification Metric |
|---|---|---|---|
| **OTruyen API** | `fetch_catalog(page=1)` | Returns 24 stories with valid OTruyen CDN cover URLs | `len(result.stories) == 24`, `cover_url.startswith("http")` |
| **OTruyen API** | `fetch_chapter("doraemon", "65a123")` | Returns non-empty list of image URLs | `len(chapter.pages) > 0` |
| **MangaDex API** | `fetch_catalog(page=1)` | Returns 24 Vietnamese translated manga | `result.stories[0].source_id == "mangadex"` |
| **MangaDex API** | `fetch_chapter(...)` | Rate limit headers parsed, images fetched via `/at-home/server` | 0 HTTP 429 unhandled failures |
| **Custom Comic** | Scrape sample HTML | Images parsed from `#reader-content img` or inline JS script | `len(chapter.pages) > 0` |
| **Hako Novel** | Scrape `ln.hako.vn/truyen/...` | Retains volume hierarchy & clean `#chapter-content` | `chapter.medium == StoryMedium.NOVEL`, zero `<script>` tags |
| **TruyenFull** | Scrape `truyenfull.io/...` | Paginated chapters fetched, TruyenFull domain ads scrubbed | Text free of domain ads |
| **Metruyenchu** | Scrape `metruyenchu.com.vn/...` | Story metadata & clean novel text fetched | Clean text output |

---

## 9. Conclusion & Next Steps for Implementer

1. **Architecture Ready:** All data models (`Story`, `ChapterHeader`, `ChapterContent`), interface methods (`BaseConnector`), API schemas, and HTML parsing maps are specified in detail.
2. **Directory Structure:** Code will be constructed in `backend_api_engine/app/connectors/` as detailed in `PROJECT.md`.
3. **Downstream Integration:** The Smart Chapter Merge & Gap Filling Engine (Milestone 2) will consume `ChapterHeader` and `ChapterContent` produced by these connectors.
