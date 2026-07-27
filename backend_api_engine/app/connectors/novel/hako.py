from typing import Any, Dict, List, Optional
from urllib.parse import urljoin
import re
from bs4 import BeautifulSoup
import httpx

from app.connectors.base import BaseConnector, clean_url_slashes
from app.connectors.novel.public_html import SourceAccessRestrictedError
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import CatalogFetchResult, ContentRating, Story, StoryMedium, StoryStatus


class HakoConnector(BaseConnector):
    source_id = "hako"
    source_name = "Hako Light Novel"
    base_url = "https://ln.hako.vn"
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

    def _extract_cover_from_style(self, style_str: str) -> Optional[str]:
        match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style_str)
        return match.group(1) if match else None

    def _map_status(self, status_text: Optional[str]) -> StoryStatus:
        if not status_text:
            return StoryStatus.UNKNOWN
        status_text = status_text.lower()
        if "đang tiến hành" in status_text or "ongoing" in status_text:
            return StoryStatus.ONGOING
        if "hoàn thành" in status_text or "completed" in status_text:
            return StoryStatus.COMPLETED
        if "tạm ngưng" in status_text or "paused" in status_text:
            return StoryStatus.PAUSED
        return StoryStatus.UNKNOWN

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        url = f"{self.base_url}/danh-sach?sapxep=capnhat&page={page}"
        if category:
            url = f"{self.base_url}/the-loai/{category}?page={page}"

        response = await self.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        items = soup.select(".thumb-item-flow, .series-item, article.thumb-item")
        stories = []

        for item in items[:limit]:
            title_el = item.select_one(".series-title a, .thumb-title a, a.title")
            if not title_el:
                continue

            title = title_el.get_text(strip=True)
            rel_url = title_el.get("href", "")
            ext_url = clean_url_slashes(urljoin(self.base_url, rel_url))
            slug = rel_url.strip("/").split("/")[-1]

            cover_el = item.select_one(".img-in-ratio, .cover-img, img")
            cover_url = None
            if cover_el:
                style = cover_el.get("style", "")
                if "background-image" in style:
                    cover_url = self._extract_cover_from_style(style)
                if not cover_url:
                    cover_url = cover_el.get("data-bg") or cover_el.get("src")
                if cover_url:
                    cover_url = clean_url_slashes(urljoin(self.base_url, cover_url))

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
            has_more=len(items) >= limit,
            raw_metadata={"url": url},
        )

    async def fetch_story(self, identifier: str) -> Story:
        url = identifier if identifier.startswith("http") else f"{self.base_url}/truyen/{identifier}"

        response = await self.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        title_el = soup.select_one(".series-name a, .series-name, h1")
        title = title_el.get_text(strip=True) if title_el else "Unknown Novel"

        author = None
        status = StoryStatus.UNKNOWN
        for info in soup.select(".info-item"):
            text = info.get_text(strip=True)
            if "Tác giả" in text or "Author" in text:
                val_el = info.select_one(".info-value")
                author = val_el.get_text(strip=True) if val_el else text.replace("Tác giả:", "").strip()
            elif "Tình trạng" in text or "Status" in text:
                val_el = info.select_one(".info-value")
                st_text = val_el.get_text(strip=True) if val_el else text
                status = self._map_status(st_text)

        desc_el = soup.select_one(".summary-content, .series-summary")
        desc = desc_el.get_text(separator="\n", strip=True) if desc_el else None

        cover_el = soup.select_one(
            ".series-cover .img-in-ratio, .feature-img .img-in-ratio, "
            ".series-cover img, .cover img, .content.img-in-ratio"
        )
        cover_url = None
        if cover_el:
            style = cover_el.get("style", "")
            if "background-image" in style:
                cover_url = self._extract_cover_from_style(style)
            if not cover_url:
                cover_url = cover_el.get("data-bg") or cover_el.get("src")
            if cover_url:
                cover_url = clean_url_slashes(urljoin(self.base_url, cover_url))

        genres = [g.get_text(strip=True) for g in soup.select(".series-genders a, .series-badge a, .genre-item")]

        chapters = []

        def append_chapter(ch_el, volume_label: Optional[str] = None):
            raw_title = ch_el.get_text(strip=True)
            ch_title = (
                f"{volume_label} · {raw_title}"
                if volume_label and raw_title
                else raw_title
            )
            ch_href = ch_el.get("href", "")
            ch_url = clean_url_slashes(urljoin(self.base_url, ch_href))
            ch_id = ch_href.strip("/").split("/")[-1]
            if not ch_id:
                return

            match = re.search(r"(?:c|chương|chuong)\s*(\d+(?:\.\d+)?)", ch_title, re.I)
            ch_num = match.group(1) if match else None

            chapters.append(
                ChapterHeader(
                    external_id=ch_id,
                    title=ch_title,
                    chapter_number=ch_num,
                    url=ch_url,
                )
            )

        volumes = soup.select(".volume-list")
        if volumes:
            for volume in volumes:
                volume_header = volume.select_one("header .sect-title, header")
                volume_label = (
                    volume_header.get_text(" ", strip=True)
                    if volume_header
                    else None
                )
                for ch_el in volume.select(".list-chapters a, .chapter-name a"):
                    append_chapter(ch_el, volume_label)
        else:
            for ch_el in soup.select(".list-chapters a, .chapter-name a"):
                append_chapter(ch_el)

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
            url = clean_url_slashes(f"{self.base_url}/truyen/{story_identifier}/{chapter_identifier}")

        response = await self.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        title_el = soup.select_one(
            ".title-top h4.title-item, .title-top h2.title-item, "
            "h2.title-item, .chapter-title"
        )
        title = title_el.get_text(strip=True) if title_el else f"Chapter {chapter_identifier}"

        content_el = soup.select_one("#chapter-content, .chapter-content, .reading-content")
        paragraphs = []
        if content_el:
            for noise in content_el.select(
                "script, style, iframe, ins, .advertisement, .quang-cao, "
                ".pt-6.mb-6, #affiliation-popup"
            ):
                noise.decompose()
            for p in content_el.select("p"):
                txt = p.get_text(strip=True)
                if txt:
                    paragraphs.append(txt)
            text_content = "\n\n".join(paragraphs) if paragraphs else content_el.get_text(separator="\n\n", strip=True)
        else:
            text_content = ""
        if content_el and content_el.select_one("#chapter-c-protected") and len(text_content.strip()) < 80:
            raise SourceAccessRestrictedError(
                "Hako chapter content is protected by the upstream reader"
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
            raw_metadata={"parsed_url": url},
        )

    async def health_check(self) -> bool:
        try:
            response = await self.get(self.base_url)
            return response.status_code == 200
        except Exception:
            return False
