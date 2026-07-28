from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse
import json
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
        self._chapter_action_id: Optional[str] = None

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
                "article.book-item",
                ".thumb-item",
                "a[href^='/truyen/'] img",
            ),
        )

        items = soup.select(
            "#list-page .col-truyen-main .list-truyen .row, "
            ".list-truyen .item, .story-list .item, "
            "article.story-item, article.book-item, .thumb-item"
        )
        if not items:
            items = soup.select(".item, article.book-item")
        if not items:
            # Current Mê Truyện Chữ is a Next.js site whose list cards do not
            # expose a stable semantic class. The cover anchor is stable and
            # gives us one deterministic node per story.
            items = [
                anchor
                for anchor in soup.select("a[href^='/truyen/']")
                if anchor.select_one("img")
            ]

        stories = []
        seen_slugs = set()
        for item in items:
            title_el = item.select_one(
                ".truyen-title a, .title a, h3 a, h2 a, a.story-name, "
                "a[title], a[href^='/truyen/'], a"
            )
            if item.name == "a" and item.get("href"):
                title_el = item
            if not title_el or not title_el.get("href"):
                continue

            title_node = item.select_one(".book-title, h5, h3, p.font-semibold")
            title = self._clean_text(
                title_el.get("title")
                or (title_node.get_text() if title_node else None)
                or title_el.get_text()
            )
            image_node = item.select_one("img")
            if not title and image_node:
                title = self._clean_text(image_node.get("alt"))
            rel_url = title_el.get("href", "")
            ext_url = clean_url_slashes(urljoin(self.base_url, rel_url))
            slug = rel_url.strip("/").split("/")[-1]
            if not title or not slug or slug in seen_slugs:
                continue
            seen_slugs.add(slug)

            cover_el = image_node
            cover_url = None
            if cover_el:
                src = cover_el.get("data-src") or cover_el.get("src")
                if src:
                    cover_url = clean_url_slashes(urljoin(self.base_url, src))

            author_el = item.select_one(
                ".author, .info-author, .book-author, a[href*='/tac-gia/']"
            )
            author = self._clean_text(author_el.get_text()) if author_el else None
            genres = [
                self._clean_text(node.get_text())
                for node in item.select(
                    ".book-meta-genres, a[href*='/the-loai/'], "
                    "a[href*='/danh-sach/']"
                )
                if self._clean_text(node.get_text())
            ]

            story = Story(
                source_id=self.source_id,
                external_id=slug,
                external_url=ext_url,
                title=title,
                slug=slug,
                author=author,
                description=None,
                cover_url=cover_url,
                genres=list(dict.fromkeys(genres)),
                status=StoryStatus.UNKNOWN,
                medium=self.medium,
                content_rating=ContentRating.UNKNOWN,
                updated_at=None,
                chapters=[],
                raw_metadata={"parsed_url": ext_url},
            )
            stories.append(story)
            if len(stories) >= limit:
                break

        pagination = soup.select_one(".pagination")
        has_more = bool(
            pagination
            and pagination.select_one("li.active + li a, a[rel='next'], a.next")
        )
        if not has_more:
            has_more = bool(
                soup.select_one(
                    "a[rel='next'], a[href*='?page='][aria-label*='next' i], "
                    ".pagination a[href*='trang-']"
                )
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
                f"{self.base_url}/truyen/{slug}",
                f"{self.base_url}/{slug}",
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

        desc_el = soup.select_one(
            ".description, .detail-content, .summary, .story-intro, "
            ".desc-text, article .intro"
        )
        desc_meta = soup.select_one("meta[name='description']")
        desc = (
            desc_el.get_text(separator="\n", strip=True)
            if desc_el
            else desc_meta.get("content")
            if desc_meta
            else None
        )

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

            match = re.search(
                r"(?:chuong|chương)[^\d]*(\d+(?:\.\d+)?)",
                ch_title,
                re.I,
            )
            if not match:
                match = re.search(
                    r"(?:chuong|chapter)-?(\d+(?:\.\d+)?)",
                    ch_id,
                    re.I,
                )
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
        host = (urlparse(self.base_url).hostname or "").lower()
        if host.endswith("metruyenchu.co"):
            chapters = await self._fetch_next_chapter_manifest(
                response=response,
                soup=soup,
                slug=slug,
                fallback=chapters,
            )
        elif "wikidich" in host and chapters:
            chapters = self._expand_numeric_chapter_links(slug, chapters)

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

    async def _discover_chapter_action(self, soup: BeautifulSoup) -> Optional[str]:
        if self._chapter_action_id:
            return self._chapter_action_id
        for script in soup.select("script[src]"):
            source = script.get("src")
            if not source:
                continue
            try:
                response = await self.get(urljoin(self.base_url, source), max_retries=1)
            except Exception:
                continue
            match = re.search(
                r'createServerReference\)\("([a-f0-9]{32,})",[^)]*'
                r'"actionGetChapters"\)',
                response.text,
                re.S,
            )
            if match:
                self._chapter_action_id = match.group(1)
                return self._chapter_action_id
        return None

    async def _fetch_next_chapter_manifest(
        self,
        *,
        response: httpx.Response,
        soup: BeautifulSoup,
        slug: str,
        fallback: List[ChapterHeader],
    ) -> List[ChapterHeader]:
        escaped_slug = re.escape(slug)
        book_match = re.search(
            rf'\\"_id\\":\\"([^\\"]+)\\",\\"slugId\\":\\"{escaped_slug}\\"',
            response.text,
        )
        action_id = await self._discover_chapter_action(soup)
        if not book_match or not action_id:
            return fallback
        client = await self.get_client()
        action_response = await client.post(
            str(response.url),
            headers={
                "Next-Action": action_id,
                "Content-Type": "text/plain;charset=UTF-8",
                "Accept": "text/x-component",
            },
            content=json.dumps(
                [
                    {
                        "bookId": book_match.group(1),
                        "page": 1,
                        "limit": 1_000_000_000,
                        "isNewest": False,
                    }
                ],
                separators=(",", ":"),
            ),
        )
        if action_response.status_code != 200:
            return fallback
        payload = None
        for line in action_response.text.splitlines():
            if not re.match(r"^\d+:", line):
                continue
            try:
                candidate = json.loads(line.split(":", 1)[1])
            except json.JSONDecodeError:
                continue
            if isinstance(candidate, dict) and isinstance(candidate.get("data"), list):
                payload = candidate["data"]
                break
        if payload is None:
            return fallback
        manifest = []
        for chapter in payload:
            number = chapter.get("number")
            if number is None:
                continue
            number_text = str(number)
            manifest.append(
                ChapterHeader(
                    external_id=f"chuong-{number_text}",
                    title=self._clean_text(chapter.get("name"))
                    or f"Chương {number_text}",
                    chapter_number=number_text,
                    url=clean_url_slashes(
                        f"{self.base_url}/truyen/{slug}/chuong-{number_text}"
                    ),
                )
            )
        return manifest or fallback

    def _expand_numeric_chapter_links(
        self,
        slug: str,
        chapters: List[ChapterHeader],
    ) -> List[ChapterHeader]:
        by_number = {
            int(float(chapter.chapter_number)): chapter
            for chapter in chapters
            if chapter.chapter_number
            and re.fullmatch(r"\d+(?:\.0+)?", chapter.chapter_number)
        }
        if not by_number:
            return chapters
        maximum = max(by_number)
        if maximum > 20_000:
            return chapters
        return [
            by_number.get(number)
            or ChapterHeader(
                external_id=f"chuong-{number}",
                title=f"Chương {number}",
                chapter_number=str(number),
                url=clean_url_slashes(f"{self.base_url}/{slug}/chuong-{number}"),
            )
            for number in range(1, maximum + 1)
        ]

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
                "article",
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
                "article",
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
