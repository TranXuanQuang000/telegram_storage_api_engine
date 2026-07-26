import json
import re
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.connectors.base import BaseConnector
from app.connectors.novel.public_html import (
    SourceAccessRestrictedError,
    SourceMarkupError,
    clean_text,
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


class WattpadMetadataConnector(BaseConnector):
    """
    Bounded Wattpad public-page metadata connector.

    It reads JSON-LD/Open Graph metadata and public part links only. It does not
    call private APIs, submit login forms, solve challenges, or copy chapter text.
    """

    source_id = "wattpad"
    source_name = "Wattpad"
    base_url = "https://www.wattpad.com"
    medium = StoryMedium.NOVEL
    _max_html_bytes = 2 * 1024 * 1024
    _story_id_pattern = re.compile(r"\d{4,20}")

    @classmethod
    def _story_id(cls, identifier: str) -> str:
        value = identifier.strip()
        if cls._story_id_pattern.fullmatch(value):
            return value
        parsed = urlparse(value)
        if parsed.scheme == "https" and (parsed.hostname or "").lower() in {
            "wattpad.com",
            "www.wattpad.com",
        }:
            match = re.fullmatch(r"/story/(\d{4,20})(?:-[^/?#]+)?/?", parsed.path)
            if match:
                return match.group(1)
        raise ValueError("Invalid Wattpad story identifier")

    @staticmethod
    def _meta(soup: BeautifulSoup, *keys: str) -> str:
        for key in keys:
            element = soup.select_one(
                f'meta[property="{key}"], meta[name="{key}"], meta[itemprop="{key}"]'
            )
            value = clean_text(element.get("content") if element else "")
            if value:
                return value
        return ""

    @staticmethod
    def _json_ld_nodes(soup: BeautifulSoup) -> Iterable[Dict[str, Any]]:
        def walk(value: Any):
            if isinstance(value, dict):
                yield value
                for nested in value.values():
                    yield from walk(nested)
            elif isinstance(value, list):
                for nested in value:
                    yield from walk(nested)

        for script in soup.select('script[type="application/ld+json"]'):
            try:
                payload = json.loads(script.string or script.get_text())
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            yield from walk(payload)

    @staticmethod
    def _person_name(value: Any) -> Optional[str]:
        if isinstance(value, str):
            return clean_text(value) or None
        if isinstance(value, dict):
            return clean_text(str(value.get("name") or "")) or None
        if isinstance(value, list):
            names = [WattpadMetadataConnector._person_name(item) for item in value]
            return ", ".join(name for name in names if name) or None
        return None

    @staticmethod
    def _safe_asset_url(value: Any) -> Optional[str]:
        if isinstance(value, list):
            value = value[0] if value else None
        if isinstance(value, dict):
            value = value.get("url") or value.get("contentUrl")
        if not isinstance(value, str):
            return None
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not (
            host == "wattpad.com" or host.endswith(".wattpad.com")
        ):
            return None
        return value

    @classmethod
    def _public_part(cls, value: Any, index: int) -> Optional[ChapterHeader]:
        if not isinstance(value, dict):
            return None
        raw_url = value.get("url") or value.get("@id")
        if not isinstance(raw_url, str):
            return None
        url = urljoin(cls.base_url, raw_url)
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or (parsed.hostname or "").lower() not in {"wattpad.com", "www.wattpad.com"}
            or not re.fullmatch(r"/\d{4,20}(?:-[^/?#]+)?/?", parsed.path)
        ):
            return None
        part_id = parsed.path.strip("/").split("-", 1)[0]
        title = clean_text(str(value.get("name") or value.get("headline") or ""))
        position = value.get("position")
        number = str(position) if isinstance(position, int) else None
        return ChapterHeader(
            external_id=part_id,
            title=title or f"Part {number or index + 1}",
            chapter_number=number,
            url=url,
            raw_metadata={"source_link_only": True},
        )

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        raise SourceMarkupError(
            "Wattpad does not expose a verified public catalog API; import by story id"
        )

    async def fetch_story(self, identifier: str) -> Story:
        story_id = self._story_id(identifier)
        requested_url = f"{self.base_url}/story/{story_id}"
        response = await self.get(requested_url, max_retries=0)
        if len(response.content) > self._max_html_bytes:
            raise SourceMarkupError("Wattpad public metadata page is too large")
        final_host = (response.url.host or "").lower()
        if final_host not in {"wattpad.com", "www.wattpad.com"}:
            raise SourceAccessRestrictedError("Wattpad redirected outside the allowed origin")
        soup = parse_public_html(
            response,
            expected_selectors=(
                'meta[property="og:title"]',
                'script[type="application/ld+json"]',
            ),
        )

        ld_nodes = list(self._json_ld_nodes(soup))
        creative = next(
            (
                node
                for node in ld_nodes
                if str(node.get("@type") or "").lower()
                in {"book", "creativework", "article", "novel"}
            ),
            {},
        )
        title = clean_text(
            str(creative.get("name") or creative.get("headline") or "")
        ) or self._meta(soup, "og:title", "twitter:title")
        title = re.sub(r"\s*[-|]\s*Wattpad\s*$", "", title, flags=re.IGNORECASE)
        if not title:
            raise SourceMarkupError("Wattpad page did not expose a public story title")

        description = clean_text(str(creative.get("description") or "")) or self._meta(
            soup, "og:description", "description", "twitter:description"
        )
        author = self._person_name(creative.get("author") or creative.get("creator"))
        if not author:
            author = self._meta(soup, "author", "article:author") or None
        cover_url = self._safe_asset_url(
            creative.get("image")
            or self._meta(soup, "og:image", "twitter:image")
        )
        keywords = creative.get("keywords") or self._meta(soup, "keywords")
        if isinstance(keywords, str):
            genres = [clean_text(item) for item in keywords.split(",")]
        elif isinstance(keywords, list):
            genres = [clean_text(str(item)) for item in keywords]
        else:
            genres = []
        genres = list(dict.fromkeys(item for item in genres if item))[:30]

        part_values: List[Any] = []
        for node in ld_nodes:
            value = node.get("hasPart")
            if isinstance(value, list):
                part_values.extend(value)
            elif value is not None:
                part_values.append(value)
        chapters: List[ChapterHeader] = []
        seen = set()
        for index, value in enumerate(part_values):
            part = self._public_part(value, index)
            if part and part.external_id not in seen:
                seen.add(part.external_id)
                chapters.append(part)

        canonical = self._meta(soup, "og:url") or str(response.url)
        return Story(
            source_id=self.source_id,
            external_id=story_id,
            external_url=canonical,
            title=title,
            slug=f"wattpad-{story_id}",
            author=author,
            description=description or None,
            cover_url=cover_url,
            genres=genres,
            status=StoryStatus.UNKNOWN,
            medium=self.medium,
            content_rating=ContentRating.UNKNOWN,
            updated_at=self._meta(
                soup, "article:modified_time", "og:updated_time"
            )
            or None,
            chapters=chapters,
            raw_metadata={
                "source_link_only": True,
                "metadata_methods": ["json-ld", "open-graph"],
                "chapter_content_available": False,
            },
        )

    async def fetch_chapter(
        self, story_identifier: str, chapter_identifier: str
    ) -> ChapterContent:
        raise SourceAccessRestrictedError(
            "Wattpad chapter copying is disabled; use the attributed public source link"
        )

    async def health_check(self) -> bool:
        try:
            response = await self.get(self.base_url, max_retries=0)
            return response.status_code == 200
        except Exception:
            return False
