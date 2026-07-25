from typing import Any, Dict, List, Optional
from urllib.parse import urljoin
import re
from bs4 import BeautifulSoup
import httpx

from app.connectors.base import BaseConnector, clean_url_slashes
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import CatalogFetchResult, ContentRating, Story, StoryMedium, StoryStatus


class HtmlComicScraper(BaseConnector):
    source_id = "html_comic"
    source_name = "Generic HTML Comic Scraper"
    base_url = "https://generic-comic-site.com"
    medium = StoryMedium.COMIC

    def __init__(
        self,
        base_url: Optional[str] = None,
        selectors: Optional[Dict[str, str]] = None,
        client: Optional[httpx.AsyncClient] = None,
        timeout: float = 15.0,
    ):
        super().__init__(client=client, timeout=timeout)
        if base_url:
            self.base_url = base_url.rstrip("/")

        default_selectors = {
            "catalog_item": ".item, .story-item, .comic-item, article, .thumb-item",
            "catalog_title": "a.title, .title a, h3 a, h2 a, .name a, a",
            "catalog_cover": "img",
            "story_title": "h1.title, h1, .title, .comic-title",
            "story_author": ".author, .info-author, .meta-author",
            "story_desc": ".description, .summary, .detail-content, .entry-content",
            "story_cover": ".cover img, .info img, .thumb img, img",
            "story_genres": ".genre a, .categories a, .tags a, .genre-item",
            "chapter_list": ".list-chapter li a, .chapter-list a, .chapters a, a.chapter",
            "chapter_images": ".reader img, .chapter-content img, .reading-detail img, #chapter-content img, .page-chapter img",
        }
        self.selectors = {**default_selectors, **(selectors or {})}

    def _extract_image_url(self, img_tag: Optional[Any], base: str) -> Optional[str]:
        if not img_tag:
            return None
        src = (
            img_tag.get("data-src")
            or img_tag.get("data-original")
            or img_tag.get("data-lazy-src")
            or img_tag.get("src")
        )
        if not src:
            return None
        return clean_url_slashes(urljoin(base, src.strip()))

    def _extract_chapter_number(self, text: str) -> Optional[str]:
        match = re.search(r"(?:chương|chuong|chapter|c)\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
        if match:
            return match.group(1)
        match_digit = re.search(r"(\d+(?:\.\d+)?)", text)
        return match_digit.group(1) if match_digit else None

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        url = f"{self.base_url}/page/{page}" if page > 1 else self.base_url
        if category:
            url = f"{self.base_url}/category/{category}/page/{page}"

        response = await self.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        items = soup.select(self.selectors["catalog_item"])
        stories = []

        for item in items[:limit]:
            title_el = item.select_one(self.selectors["catalog_title"])
            if not title_el:
                continue

            title = title_el.get_text(strip=True)
            rel_url = title_el.get("href", "")
            ext_url = clean_url_slashes(urljoin(self.base_url, rel_url))
            slug = rel_url.strip("/").split("/")[-1] or title.lower().replace(" ", "-")

            img_el = item.select_one(self.selectors["catalog_cover"])
            cover_url = self._extract_image_url(img_el, self.base_url)

            story = Story(
                source_id=self.source_id,
                external_id=slug,
                external_url=ext_url,
                title=title,
                slug=slug,
                author=None,
                description=None,
                cover_url=cover_url,
                genres=[],
                status=StoryStatus.UNKNOWN,
                medium=self.medium,
                content_rating=ContentRating.SAFE,
                updated_at=None,
                chapters=[],
                raw_metadata={"parsed_url": ext_url},
            )
            stories.append(story)

        return CatalogFetchResult(
            stories=stories,
            total=len(stories),
            page=page,
            limit=limit,
            has_more=len(items) > limit,
            raw_metadata={"url": url},
        )

    async def fetch_story(self, identifier: str) -> Story:
        url = identifier if identifier.startswith("http") else f"{self.base_url}/comic/{identifier}"

        response = await self.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        title_el = soup.select_one(self.selectors["story_title"])
        title = title_el.get_text(strip=True) if title_el else "Unknown Comic"

        author_el = soup.select_one(self.selectors["story_author"])
        author = author_el.get_text(strip=True) if author_el else None

        desc_el = soup.select_one(self.selectors["story_desc"])
        desc = desc_el.get_text(strip=True) if desc_el else None

        cover_el = soup.select_one(self.selectors["story_cover"])
        cover_url = self._extract_image_url(cover_el, url)

        genres = [g.get_text(strip=True) for g in soup.select(self.selectors["story_genres"])]

        chapter_elements = soup.select(self.selectors["chapter_list"])
        chapters = []
        for ch_el in chapter_elements:
            ch_title = ch_el.get_text(strip=True)
            ch_href = ch_el.get("href", "")
            ch_url = clean_url_slashes(urljoin(url, ch_href))
            ch_id = ch_href.strip("/").split("/")[-1] or ch_title
            ch_num = self._extract_chapter_number(ch_title)

            chapters.append(
                ChapterHeader(
                    external_id=ch_id,
                    title=ch_title,
                    chapter_number=ch_num,
                    url=ch_url,
                )
            )

        slug = identifier.split("/")[-1] if "/" in identifier else identifier

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
            status=StoryStatus.UNKNOWN,
            medium=self.medium,
            content_rating=ContentRating.SAFE,
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
            url = clean_url_slashes(f"{self.base_url}/comic/{story_identifier}/{chapter_identifier}")

        response = await self.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        img_elements = soup.select(self.selectors["chapter_images"])
        images = []
        for img in img_elements:
            img_url = self._extract_image_url(img, url)
            if img_url:
                images.append(img_url)

        ch_num = self._extract_chapter_number(chapter_identifier)

        return ChapterContent(
            story_id=story_identifier,
            external_id=chapter_identifier,
            title=f"Chapter {chapter_identifier}",
            chapter_number=ch_num,
            images=images,
            text_content=None,
            raw_metadata={"parsed_url": url},
        )

    async def health_check(self) -> bool:
        try:
            response = await self.get(self.base_url)
            return response.status_code == 200
        except Exception:
            return False
