from typing import Any, Dict, List, Optional
from urllib.parse import urljoin
import re
from bs4 import BeautifulSoup
import httpx

from app.connectors.base import BaseConnector, clean_url_slashes
from app.connectors.novel.public_html import (
    SourceMarkupError,
    extract_public_chapter_text,
    parse_public_html,
)
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import CatalogFetchResult, ContentRating, Story, StoryMedium, StoryStatus


class MetruyenchuConnector(BaseConnector):
    source_id = "metruyenchu"
    source_name = "MeTruyenChu"
    base_url = "https://metruyenchu.org"
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

    def _clean_text(self, text: Optional[str]) -> str:
        if not text:
            return ""
        return re.sub(r"\s+", " ", text).strip()

    def _map_status(self, status_str: Optional[str]) -> StoryStatus:
        if not status_str:
            return StoryStatus.UNKNOWN
        status_str = status_str.lower()
        if "hoàn thành" in status_str or "full" in status_str or "completed" in status_str:
            return StoryStatus.COMPLETED
        if "đang ra" in status_str or "ongoing" in status_str or "đang tiến hành" in status_str:
            return StoryStatus.ONGOING
        if "tạm ngưng" in status_str or "paused" in status_str:
            return StoryStatus.PAUSED
        return StoryStatus.UNKNOWN

    async def _get_first_public(self, urls: List[str]) -> httpx.Response:
        last_response: Optional[httpx.Response] = None
        for url in urls:
            response = await self.get(url)
            last_response = response
            if response.status_code not in {404, 410}:
                return response
        assert last_response is not None
        return last_response

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        url = f"{self.base_url}/danh-sach/truyen-moi?page={page}"
        if category:
            url = f"{self.base_url}/the-loai/{category}?page={page}"

        response = await self._get_first_public([url, f"{self.base_url}/"])
        soup = parse_public_html(
            response,
            expected_selectors=(
                ".list-truyen",
                "#list-page .col-truyen-main .list-truyen",
                ".story-list",
                "article.story-item",
                ".thumb-item",
            ),
        )

        items = soup.select(
            "#list-page .col-truyen-main .list-truyen .row, "
            ".list-truyen .item, .story-list .item, "
            "article.story-item, .thumb-item"
        )
        if not items:
            items = soup.select(".item, article")

        stories = []
        for item in items[:limit]:
            title_el = item.select_one(
                ".truyen-title a, .title a, h3 a, h2 a, a.story-name, a"
            )
            if not title_el or not title_el.get("href"):
                continue

            title = self._clean_text(title_el.get_text())
            rel_url = title_el.get("href", "")
            ext_url = clean_url_slashes(urljoin(self.base_url, rel_url))
            slug = rel_url.strip("/").split("/")[-1]

            cover_el = item.select_one("img")
            cover_url = None
            if cover_el:
                src = cover_el.get("data-src") or cover_el.get("src")
                if src:
                    cover_url = clean_url_slashes(urljoin(self.base_url, src))

            author_el = item.select_one(".author, .info-author")
            author = self._clean_text(author_el.get_text()) if author_el else None

            story = Story(
                source_id=self.source_id,
                external_id=slug,
                external_url=ext_url,
                title=title,
                slug=slug,
                author=author,
                description=None,
                cover_url=cover_url,
                genres=[],
                status=StoryStatus.UNKNOWN,
                medium=self.medium,
                content_rating=ContentRating.UNKNOWN,
                updated_at=None,
                chapters=[],
                raw_metadata={"parsed_url": ext_url},
            )
            stories.append(story)

        pagination = soup.select_one(".pagination")
        has_more = bool(
            pagination
            and pagination.select_one("li.active + li a, a[rel='next'], a.next")
        )
        return CatalogFetchResult(
            stories=stories,
            total=len(stories),
            page=page,
            limit=limit,
            has_more=has_more or len(stories) >= limit,
            raw_metadata={"url": url},
        )

    async def fetch_story(self, identifier: str) -> Story:
        if identifier.startswith("http"):
            candidates = [identifier]
        else:
            slug = identifier.strip("/")
            candidates = [
                f"{self.base_url}/{slug}",
                f"{self.base_url}/truyen/{slug}",
            ]
        response = await self._get_first_public(candidates)
        soup = parse_public_html(
            response,
            expected_selectors=("h1.title", ".story-detail-title", ".book-info h1", "h1"),
        )
        url = str(response.url)

        title_el = soup.select_one("h1.title, .story-detail-title, .book-info h1, h1")
        if not title_el:
            raise SourceMarkupError(f"{self.source_name} story title markup was not found")
        title = self._clean_text(title_el.get_text())

        author_el = soup.select_one(".author, .info-author, a[href*='/tac-gia/']")
        author = self._clean_text(author_el.get_text()) if author_el else None

        desc_el = soup.select_one(".description, .detail-content, .summary, .story-intro, .desc-text")
        desc = desc_el.get_text(separator="\n", strip=True) if desc_el else None

        cover_el = soup.select_one(".cover img, .info img, .detail-thumb img, img")
        cover_url = None
        if cover_el:
            src = cover_el.get("data-src") or cover_el.get("src")
            if src:
                cover_url = clean_url_slashes(urljoin(self.base_url, src))

        genres = [
            self._clean_text(g.get_text())
            for g in soup.select(".genres a, .tags a, .category a, a[href*='/the-loai/']")
            if self._clean_text(g.get_text())
        ]

        status_el = soup.select_one(".status, .info-status")
        detail_text = soup.select_one(".book-info, .story-info, .info")
        status = self._map_status(
            status_el.get_text() if status_el else detail_text.get_text(" ", strip=True) if detail_text else None
        )

        chapters = []
        seen_ids = set()
        ch_elements = soup.select(
            ".chapter-list a, .list-chapter a, .list-chapters a, "
            ".chapters a, #list-chapter a, a[href*='/chuong-']"
        )
        for ch_el in ch_elements:
            ch_title = self._clean_text(ch_el.get_text())
            ch_href = ch_el.get("href", "")
            ch_url = clean_url_slashes(urljoin(self.base_url, ch_href))
            ch_id = ch_href.strip("/").split("/")[-1]
            if not ch_id or ch_id in seen_ids:
                continue
            seen_ids.add(ch_id)

            match = re.search(r"(?:chuong|chương)\s*(\d+(?:\.\d+)?)", ch_title, re.I)
            ch_num = match.group(1) if match else None

            chapters.append(
                ChapterHeader(
                    external_id=ch_id,
                    title=ch_title,
                    chapter_number=ch_num,
                    url=ch_url,
                )
            )

        slug = identifier.strip("/").split("/")[-1]

        return Story(
            source_id=self.source_id,
            external_id=slug,
            external_url=url,
            title=title,
            slug=slug,
            author=author,
            description=desc,
            cover_url=cover_url,
            genres=genres,
            status=status,
            medium=self.medium,
            content_rating=ContentRating.UNKNOWN,
            updated_at=None,
            chapters=chapters,
            raw_metadata={"parsed_url": url},
        )

    async def fetch_chapter(
        self, story_identifier: str, chapter_identifier: str
    ) -> ChapterContent:
        if chapter_identifier.startswith("http://") or chapter_identifier.startswith("https://"):
            candidates = [clean_url_slashes(chapter_identifier)]
        else:
            story_slug = story_identifier.strip("/")
            ch_id = chapter_identifier.strip("/")
            candidates = [
                clean_url_slashes(f"{self.base_url}/{story_slug}/{ch_id}"),
                clean_url_slashes(f"{self.base_url}/truyen/{story_slug}/{ch_id}"),
            ]
        response = await self._get_first_public([candidate for candidate in candidates if candidate])
        soup = parse_public_html(
            response,
            expected_selectors=(
                "#article-content",
                "#chapter-content",
                ".chapter-c",
                ".content-text",
                ".box-chap",
            ),
        )
        url = str(response.url)

        title_el = soup.select_one("#chapter-title, .chapter-title, h2")
        title = self._clean_text(title_el.get_text()) if title_el else f"Chapter {chapter_identifier}"

        text_content = extract_public_chapter_text(
            soup,
            (
                "#article-content",
                "#chapter-content",
                ".chapter-c",
                ".content-text",
                ".box-chap",
            ),
        )

        match = re.search(r"(\d+(?:\.\d+)?)", chapter_identifier)
        ch_num = match.group(1) if match else None

        return ChapterContent(
            story_id=story_identifier,
            external_id=chapter_identifier,
            title=title,
            chapter_number=ch_num,
            images=None,
            text_content=text_content,
            raw_metadata={"parsed_url": url, "source_id": self.source_id},
        )

    async def health_check(self) -> bool:
        try:
            response = await self._get_first_public(
                [f"{self.base_url}/danh-sach", f"{self.base_url}/"]
            )
            parse_public_html(
                response,
                expected_selectors=(
                    ".list-truyen",
                    ".story-list",
                    "article.story-item",
                    ".thumb-item",
                ),
            )
            return True
        except Exception:
            return False
