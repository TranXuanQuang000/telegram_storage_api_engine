import re
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx

from app.connectors.base import BaseConnector
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import (
    CatalogFetchResult,
    ContentRating,
    Story,
    StoryMedium,
    StoryStatus,
)


class GutendexConnector(BaseConnector):
    """Project Gutenberg catalog/full-text connector through the Gutendex API."""

    source_id = "gutendex"
    source_name = "Project Gutenberg"
    base_url = "https://gutendex.com"
    medium = StoryMedium.NOVEL

    _allowed_content_hosts = frozenset(
        {"gutenberg.org", "www.gutenberg.org", "aleph.gutenberg.org"}
    )
    _max_ebook_bytes = 8 * 1024 * 1024

    def __init__(
        self,
        base_url: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
        timeout: float = 15.0,
    ):
        super().__init__(client=client, timeout=timeout)
        if base_url:
            self.base_url = base_url.rstrip("/")

    @staticmethod
    def _book_id(identifier: str) -> int:
        match = re.fullmatch(r"(?:gutenberg-)?(\d{1,9})", identifier.strip())
        if not match:
            raise ValueError("Invalid Project Gutenberg book identifier")
        return int(match.group(1))

    @staticmethod
    def _author(book: Dict[str, Any]) -> Optional[str]:
        names = [
            str(author.get("name", "")).strip()
            for author in book.get("authors", [])
            if isinstance(author, dict) and author.get("name")
        ]
        return ", ".join(names) or None

    @staticmethod
    def _cover(book: Dict[str, Any]) -> Optional[str]:
        formats = book.get("formats") if isinstance(book.get("formats"), dict) else {}
        cover = formats.get("image/jpeg")
        return cover if isinstance(cover, str) and cover.startswith("https://") else None

    def _map_book(self, book: Dict[str, Any]) -> Story:
        book_id = int(book["id"])
        title = str(book.get("title") or f"Project Gutenberg #{book_id}").strip()
        subjects = [str(item).strip() for item in book.get("subjects", []) if item]
        shelves = [str(item).strip() for item in book.get("bookshelves", []) if item]
        genres = list(dict.fromkeys([*shelves, *subjects]))[:20]
        languages = [str(item) for item in book.get("languages", []) if item]
        slug = f"gutenberg-{book_id}"
        external_url = f"https://www.gutenberg.org/ebooks/{book_id}"
        downloads = int(book.get("download_count") or 0)
        return Story(
            source_id=self.source_id,
            external_id=slug,
            external_url=external_url,
            title=title,
            slug=slug,
            author=self._author(book),
            description=(
                f"Public-domain ebook from Project Gutenberg. "
                f"{downloads:,} recorded downloads."
            ),
            cover_url=self._cover(book),
            genres=genres,
            status=StoryStatus.COMPLETED,
            medium=self.medium,
            content_rating=ContentRating.UNKNOWN,
            updated_at=None,
            chapters=[
                ChapterHeader(
                    external_id="full-text",
                    title="Full text",
                    chapter_number="1",
                    url=external_url,
                )
            ],
            raw_metadata={
                "book_id": book_id,
                "languages": languages,
                "download_count": downloads,
                "copyright": book.get("copyright"),
                "formats": book.get("formats", {}),
                "attribution": "Project Gutenberg",
            },
        )

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        params: Dict[str, Any] = {"page": page}
        if category:
            params["topic"] = category
        response = await self.get(f"{self.base_url}/books/", params=params)
        response.raise_for_status()
        payload = response.json()
        books = payload.get("results", []) if isinstance(payload, dict) else []
        stories = [
            self._map_book(book)
            for book in books[:limit]
            if isinstance(book, dict) and isinstance(book.get("id"), int)
        ]
        return CatalogFetchResult(
            stories=stories,
            total=int(payload.get("count") or len(stories)),
            page=page,
            limit=limit,
            has_more=bool(payload.get("next")),
            raw_metadata={
                "url": str(response.url),
                "license_scope": "Project Gutenberg public-domain catalog",
            },
        )

    async def fetch_story(self, identifier: str) -> Story:
        book_id = self._book_id(identifier)
        response = await self.get(f"{self.base_url}/books/{book_id}/")
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not payload.get("id"):
            raise ValueError(f"Project Gutenberg book '{book_id}' not found")
        return self._map_book(payload)

    def _select_content_url(self, formats: Dict[str, Any]) -> str:
        preferred_types = (
            "text/html; charset=utf-8",
            "text/plain; charset=utf-8",
            "text/html",
            "text/plain; charset=us-ascii",
            "text/plain",
        )
        for content_type in preferred_types:
            candidate = formats.get(content_type)
            if not isinstance(candidate, str):
                continue
            parsed = urlparse(candidate)
            if (
                parsed.scheme == "https"
                and (parsed.hostname or "").lower() in self._allowed_content_hosts
                and not parsed.path.lower().endswith(".zip")
            ):
                return candidate
        raise ValueError("No safe Project Gutenberg full-text format is available")

    @staticmethod
    def _strip_plaintext_boilerplate(content: str) -> str:
        start = re.search(
            r"\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*{3}",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        end = re.search(
            r"\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*{3}",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )
        begin_at = start.end() if start else 0
        end_at = end.start() if end and end.start() > begin_at else len(content)
        return content[begin_at:end_at].strip()

    async def fetch_chapter(
        self, story_identifier: str, chapter_identifier: str
    ) -> ChapterContent:
        if chapter_identifier not in {"1", "full-text"}:
            raise ValueError("Project Gutenberg exposes the ebook as one full-text unit")
        story = await self.fetch_story(story_identifier)
        formats = (story.raw_metadata or {}).get("formats", {})
        content_url = self._select_content_url(formats if isinstance(formats, dict) else {})
        response = await self.get(content_url, max_retries=1)
        response.raise_for_status()
        if len(response.content) > self._max_ebook_bytes:
            raise ValueError("Project Gutenberg ebook exceeds the safe reader size limit")
        content_type = response.headers.get("content-type", "").lower()
        content = response.text
        if "text/plain" in content_type or not content.lstrip().startswith("<"):
            content = self._strip_plaintext_boilerplate(content)
        return ChapterContent(
            story_id=story.external_id,
            external_id="full-text",
            title=f"{story.title} — Full text",
            chapter_number="1",
            images=None,
            text_content=content,
            raw_metadata={
                "parsed_url": content_url,
                "source_id": self.source_id,
                "attribution": "Project Gutenberg",
            },
        )

    async def health_check(self) -> bool:
        try:
            response = await self.get(f"{self.base_url}/books/", params={"page": 1})
            return response.status_code == 200
        except Exception:
            return False
