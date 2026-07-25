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


class TruyenFullConnector(BaseConnector):
    source_id = "truyenfull"
    source_name = "TruyenFull"
    base_url = "https://truyenfull.vn"
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
        if "full" in status_str or "hoàn thành" in status_str or "completed" in status_str:
            return StoryStatus.COMPLETED
        if "đang ra" in status_str or "ongoing" in status_str:
            return StoryStatus.ONGOING
        if "tạm ngưng" in status_str or "paused" in status_str:
            return StoryStatus.PAUSED
        return StoryStatus.UNKNOWN

    def _normalize_chapter_id(self, ch_id: str) -> str:
        ch_id = ch_id.strip("/")
        # Fix duplicate chuong- prepended (e.g. chuong-phan-1-chuong-1 or chuong-chuong-1)
        if ch_id.startswith("chuong-"):
            rest = ch_id[7:]
            if "chuong-" in rest or rest.startswith("chuong"):
                ch_id = rest

        # Only prepend "chuong-" if ch_id is purely digits/numeric (e.g. "1", "10.5")
        if re.match(r"^\d+(?:\.\d+)?$", ch_id):
            ch_id = f"chuong-{ch_id}"

        return ch_id

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        if category:
            url = f"{self.base_url}/the-loai/{category}/trang-{page}/" if page > 1 else f"{self.base_url}/the-loai/{category}/"
        else:
            url = f"{self.base_url}/danh-sach/truyen-moi/trang-{page}/" if page > 1 else f"{self.base_url}/danh-sach/truyen-moi/"

        response = await self.get(url)
        soup = parse_public_html(
            response,
            expected_selectors=(".list-truyen", ".list-story", "article.story-item"),
        )

        items = soup.select(".list-truyen .row, .list-truyen div[itemscope], .list-truyen .item")
        if not items:
            items = soup.select(".list-truyen h3.truyen-title, .list-truyen div")

        stories = []
        for item in items[:limit]:
            title_el = item.select_one(".truyen-title a, h3 a, a[itemprop='url'], a")
            if not title_el or not title_el.get("href"):
                continue

            title = self._clean_text(title_el.get_text())
            rel_url = title_el.get("href", "")
            ext_url = clean_url_slashes(urljoin(self.base_url, rel_url))
            slug = rel_url.strip("/").split("/")[-1]

            cover_el = item.select_one("img, [data-image]")
            cover_url = None
            if cover_el:
                src = cover_el.get("data-image") or cover_el.get("data-src") or cover_el.get("src")
                if src:
                    cover_url = clean_url_slashes(urljoin(self.base_url, src))

            author_el = item.select_one(".author, a[itemprop='author'], .info-author")
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
        has_more = False
        if pagination:
            has_more = bool(pagination.select_one("li.active + li, a.next"))

        return CatalogFetchResult(
            stories=stories,
            total=len(stories),
            page=page,
            limit=limit,
            has_more=has_more,
            raw_metadata={"url": url},
        )

    async def fetch_story(self, identifier: str) -> Story:
        url = identifier if identifier.startswith("http") else f"{self.base_url}/{identifier.strip('/')}/"

        response = await self.get(url)
        soup = parse_public_html(
            response,
            expected_selectors=("h3.title", "h1.title", ".title", "h1"),
        )

        title_el = soup.select_one("h3.title, h1.title, .title, h1")
        if not title_el:
            raise SourceMarkupError("TruyenFull story title markup was not found")
        title = self._clean_text(title_el.get_text())

        author_el = soup.select_one("a[itemprop='author'], .info a[href*='/tac-gia/']")
        author = self._clean_text(author_el.get_text()) if author_el else None

        desc_el = soup.select_one(".desc-text, div.desc, .desc")
        desc = desc_el.get_text(separator="\n", strip=True) if desc_el else None

        cover_el = soup.select_one(".book img, .info-holder .book img, .info img")
        cover_url = None
        if cover_el:
            src = cover_el.get("data-src") or cover_el.get("src")
            if src:
                cover_url = clean_url_slashes(urljoin(self.base_url, src))

        genres = [
            self._clean_text(g.get_text())
            for g in soup.select("a[itemprop='genre'], .info a[href*='/the-loai/']")
            if self._clean_text(g.get_text())
        ]

        status_el = soup.select_one(".info span.text-success, .info span.text-primary, .info .status")
        status = self._map_status(status_el.get_text()) if status_el else StoryStatus.UNKNOWN

        # Extract chapters (support multi-page pagination & AJAX list)
        chapters = []
        seen_ids = set()

        def parse_chapters_from_soup(s: BeautifulSoup):
            for ch_el in s.select(".list-chapter li a, #list-chapter a"):
                ch_title = self._clean_text(ch_el.get_text())
                ch_href = ch_el.get("href", "")
                ch_url = clean_url_slashes(urljoin(self.base_url, ch_href))
                ch_id = self._normalize_chapter_id(ch_href.strip("/").split("/")[-1])

                if ch_id in seen_ids:
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

        # 1. Parse current page chapter list
        parse_chapters_from_soup(soup)

        # 2. Check total pages from hidden input or pagination navigation
        total_pages = 1
        total_page_input = soup.select_one("input#total-page, input[name='total-page'], input.total-page")
        if total_page_input and total_page_input.get("value"):
            try:
                total_pages = int(total_page_input.get("value"))
            except ValueError:
                pass

        for p_link in soup.select(".pagination a, ul.pagination li a, #pagination a"):
            href = p_link.get("href", "")
            match_trang = re.search(r"trang-(\d+)", href)
            if match_trang:
                total_pages = max(total_pages, int(match_trang.group(1)))
            else:
                text = p_link.get_text(strip=True)
                if text.isdigit():
                    total_pages = max(total_pages, int(text))

        # 3. Fetch remaining pages (trang-2, trang-3, ... trang-N)
        if total_pages > 1:
            base_story_url = url.rstrip("/")
            for p in range(2, total_pages + 1):
                page_url = f"{base_story_url}/trang-{p}/"
                try:
                    res_p = await self.get(page_url)
                    if res_p.status_code == 200:
                        soup_p = BeautifulSoup(res_p.text, "lxml")
                        parse_chapters_from_soup(soup_p)
                except Exception:
                    break

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
            url = clean_url_slashes(chapter_identifier)
        else:
            story_slug = story_identifier.strip("/")
            ch_id = self._normalize_chapter_id(chapter_identifier)
            url = clean_url_slashes(f"{self.base_url}/{story_slug}/{ch_id}/")

        response = await self.get(url)
        soup = parse_public_html(
            response,
            expected_selectors=("#chapter-c", ".chapter-c", ".chapter-content"),
        )

        title_el = soup.select_one(".chapter-title, a.chapter-title, h2.chapter-title")
        title = self._clean_text(title_el.get_text()) if title_el else f"Chapter {chapter_identifier}"

        text_content = extract_public_chapter_text(
            soup,
            ("#chapter-c", ".chapter-c", ".chapter-content"),
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
            response = await self.get(f"{self.base_url}/danh-sach/truyen-moi/")
            parse_public_html(
                response,
                expected_selectors=(".list-truyen", ".list-story", "article.story-item"),
            )
            return True
        except Exception:
            return False
