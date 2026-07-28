from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

from app.connectors.base import BaseConnector, clean_url_slashes
from app.connectors.novel.public_html import (
    SourceMarkupError,
    clean_text,
    extract_public_chapter_text,
    parse_public_html,
)
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import (
    CatalogFetchResult,
    ContentRating,
    Story,
    StoryMedium,
    StoryStatus,
)


class TangThuVienConnector(BaseConnector):
    source_id = "tangthuvien"
    source_name = "Tàng Thư Viện"
    base_url = "https://truyen.tangthuvien.vn"
    medium = StoryMedium.NOVEL

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
    def _map_status(value: Optional[str]) -> StoryStatus:
        normalized = clean_text(value).lower()
        if "hoàn thành" in normalized or "đã hoàn thành" in normalized or "completed" in normalized:
            return StoryStatus.COMPLETED
        if "đang ra" in normalized or "đang cập nhật" in normalized or "ongoing" in normalized:
            return StoryStatus.ONGOING
        if "tạm ngưng" in normalized or "paused" in normalized:
            return StoryStatus.PAUSED
        return StoryStatus.UNKNOWN

    @staticmethod
    def _story_slug(href: str) -> str:
        parts = [part for part in urlparse(href).path.split("/") if part]
        if "doc-truyen" in parts:
            index = parts.index("doc-truyen")
            if index + 1 < len(parts):
                return parts[index + 1]
        return parts[-1] if parts else ""

    async def fetch_catalog(
        self,
        page: int = 1,
        limit: int = 20,
        category: Optional[str] = None,
    ) -> CatalogFetchResult:
        params = {"page": max(1, page)}
        if category:
            # Tàng Thư Viện may ignore unknown filters; never synthesize a
            # private/search endpoint or submit an interactive form.
            params["genre"] = category
        modern = (urlparse(self.base_url).hostname or "").lower() == "tangthuvien.org"
        catalog_path = "/truyen-moi" if modern else "/tong-hop"
        response = await self.get(f"{self.base_url}{catalog_path}", params=params)
        soup = parse_public_html(
            response,
            expected_selectors=(
                ".book-img-text",
                ".book-list",
                ".book-mid-info",
                "article.story-item",
                "a[href*='/doc-quyen-']",
            ),
        )

        items = soup.select(
            ".book-img-text li, .book-list .book-item, "
            ".book-mid-info, article.story-item"
        )
        if not items and modern:
            items = list(soup.select("a[href*='/doc-quyen-']"))
        stories = []
        seen_slugs = set()
        for item in items:
            title_el = item.select_one(
                ".book-mid-info h4 a, h4 a[href*='/doc-truyen/'], "
                "h3 a[href*='/doc-truyen/'], a.story-name, "
                "a[href*='/doc-quyen-']"
            )
            if item.name == "a" and item.get("href"):
                title_el = item
            if not title_el or not title_el.get("href"):
                continue
            href = str(title_el.get("href"))
            slug = self._story_slug(href)
            if not slug or slug in seen_slugs:
                continue
            seen_slugs.add(slug)

            title = clean_text(
                title_el.get("title")
                or title_el.get_text()
                or (
                    title_el.select_one("img").get("alt")
                    if title_el.select_one("img")
                    else ""
                )
            )
            if not title:
                continue
            external_url = clean_url_slashes(urljoin(str(response.url), href))
            cover_el = item.select_one(".book-img-box img, .book-img img, img")
            if not cover_el and item.parent:
                cover_el = item.parent.select_one("img")
            cover = None
            if cover_el:
                cover = cover_el.get("data-original") or cover_el.get("data-src") or cover_el.get("src")
                if cover:
                    cover = clean_url_slashes(urljoin(str(response.url), str(cover)))

            author_el = item.select_one(
                ".book-mid-info .author .name, .book-mid-info .author a, "
                ".author a[href*='/tac-gia/'], .author"
            )
            description_el = item.select_one(".book-mid-info .intro, .intro, .description")
            status_el = item.select_one(".book-mid-info .status, .status")
            genres = [
                clean_text(genre.get_text())
                for genre in item.select("a[href*='/the-loai/'], a.genre")
                if clean_text(genre.get_text())
            ]

            stories.append(
                Story(
                    source_id=self.source_id,
                    external_id=slug,
                    external_url=external_url,
                    title=title,
                    slug=slug,
                    author=clean_text(author_el.get_text()) if author_el else None,
                    description=description_el.get_text("\n", strip=True) if description_el else None,
                    cover_url=cover,
                    genres=list(dict.fromkeys(genres)),
                    status=self._map_status(status_el.get_text() if status_el else None),
                    medium=self.medium,
                    content_rating=ContentRating.UNKNOWN,
                    updated_at=None,
                    chapters=[],
                    raw_metadata={"parsed_url": external_url},
                )
            )
            if len(stories) >= limit:
                break

        has_more = bool(
            soup.select_one(
                ".pagination a[rel='next'], .pagination .next a, "
                "a.next, a[aria-label='Next']"
            )
        )
        if modern and len(stories) >= limit:
            has_more = True
        return CatalogFetchResult(
            stories=stories,
            total=None,
            page=max(1, page),
            limit=limit,
            has_more=has_more,
            raw_metadata={"url": str(response.url)},
        )

    async def fetch_story(self, identifier: str) -> Story:
        modern = (urlparse(self.base_url).hostname or "").lower() == "tangthuvien.org"
        url = (
            identifier
            if identifier.startswith(("http://", "https://"))
            else (
                f"{self.base_url}/{identifier.strip('/')}"
                if modern
                else f"{self.base_url}/doc-truyen/{identifier.strip('/')}"
            )
        )
        response = await self.get(url)
        soup = parse_public_html(
            response,
            expected_selectors=(".book-info h1", ".book-info h2", "h1"),
        )

        title_el = soup.select_one(".book-info h1, .book-info h2, h1")
        if not title_el:
            raise SourceMarkupError("Tàng Thư Viện story title markup was not found")

        info = soup.select_one(".book-info")
        author_el = soup.select_one(
            ".book-info a[href*='/tac-gia/'], .book-info .writer, "
            ".book-info .author, a.author"
        )
        description_el = soup.select_one(".book-intro, .intro, .story-intro")
        cover_el = soup.select_one(
            ".book-img img, .book-information img, .book-detail img, "
            "article img, main img"
        )
        cover = None
        if cover_el:
            cover = cover_el.get("data-original") or cover_el.get("data-src") or cover_el.get("src")
            if cover:
                cover = clean_url_slashes(urljoin(str(response.url), str(cover)))

        genres = [
            clean_text(genre.get_text())
            for genre in soup.select(".book-info a[href*='/the-loai/'], .book-info a.genre")
            if clean_text(genre.get_text())
        ]
        info_text = info.get_text(" ", strip=True) if info else ""

        chapters = []
        seen_ids = set()
        chapter_selectors = (
            ".volume li a, #j-catalogWrap a, .chapter-list a, "
            ".list-chapter a, a[href*='/doc-truyen/'], a[href*='/chuong-']"
        )
        slug = self._story_slug(identifier)
        for chapter_el in soup.select(chapter_selectors):
            href = str(chapter_el.get("href") or "")
            parts = [part for part in urlparse(href).path.split("/") if part]
            if (
                not modern
                and (
                    "doc-truyen" not in parts
                    or len(parts) < parts.index("doc-truyen") + 3
                )
            ):
                continue
            chapter_id = parts[-1]
            if not chapter_id or chapter_id in seen_ids:
                continue
            chapter_title = clean_text(
                chapter_el.get("title") or chapter_el.get_text()
            )
            if not chapter_title:
                continue
            seen_ids.add(chapter_id)
            number_match = re.search(
                r"(?:chương|chuong|chapter)\s*0*(\d+(?:\.\d+)?)",
                chapter_title,
                re.IGNORECASE,
            )
            chapters.append(
                ChapterHeader(
                    external_id=chapter_id,
                    title=chapter_title,
                    chapter_number=number_match.group(1) if number_match else None,
                    url=clean_url_slashes(urljoin(str(response.url), href)),
                )
            )

        return Story(
            source_id=self.source_id,
            external_id=slug,
            external_url=str(response.url),
            title=clean_text(title_el.get_text()),
            slug=slug,
            author=clean_text(author_el.get_text()) if author_el else None,
            description=description_el.get_text("\n", strip=True) if description_el else None,
            cover_url=cover,
            genres=list(dict.fromkeys(genres)),
            status=self._map_status(info_text),
            medium=self.medium,
            content_rating=ContentRating.UNKNOWN,
            updated_at=None,
            chapters=chapters,
            raw_metadata={"parsed_url": str(response.url)},
        )

    async def fetch_chapter(
        self,
        story_identifier: str,
        chapter_identifier: str,
    ) -> ChapterContent:
        modern = (urlparse(self.base_url).hostname or "").lower() == "tangthuvien.org"
        url = (
            chapter_identifier
            if chapter_identifier.startswith(("http://", "https://"))
            else (
                (
                    f"{self.base_url}/{story_identifier.strip('/')}/"
                    f"{chapter_identifier.strip('/')}"
                )
                if modern
                else (
                    f"{self.base_url}/doc-truyen/"
                    f"{story_identifier.strip('/')}/{chapter_identifier.strip('/')}"
                )
            )
        )
        response = await self.get(url)
        soup = parse_public_html(
            response,
            expected_selectors=(
                ".read-content",
                ".j_readContent",
                "#chapter-c",
                ".chapter-content",
                "article",
            ),
        )
        title_el = soup.select_one(
            ".book-cover-wrap h1, .chapter-title, .chapter-name, h1"
        )
        text_content = extract_public_chapter_text(
            soup,
            (
                ".read-content",
                ".j_readContent",
                "#chapter-c",
                ".chapter-content",
                "article",
            ),
        )
        number_match = re.search(r"(\d+(?:\.\d+)?)", chapter_identifier)
        return ChapterContent(
            story_id=story_identifier,
            external_id=chapter_identifier,
            title=clean_text(title_el.get_text()) if title_el else f"Chapter {chapter_identifier}",
            chapter_number=number_match.group(1) if number_match else None,
            images=None,
            text_content=text_content,
            raw_metadata={"parsed_url": str(response.url), "source_id": self.source_id},
        )

    async def health_check(self) -> bool:
        try:
            modern = (urlparse(self.base_url).hostname or "").lower() == "tangthuvien.org"
            path = "/truyen-moi" if modern else "/tong-hop"
            response = await self.get(f"{self.base_url}{path}", params={"page": 1})
            parse_public_html(
                response,
                expected_selectors=(
                    ".book-img-text",
                    ".book-list",
                    ".book-mid-info",
                    "article.story-item",
                    "a[href*='/doc-quyen-']",
                ),
            )
            return True
        except Exception:
            return False
