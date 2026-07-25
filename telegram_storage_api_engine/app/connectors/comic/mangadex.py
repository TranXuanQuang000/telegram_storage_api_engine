import ipaddress
import re
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

import httpx

from app.connectors.base import BaseConnector, clean_url_slashes
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import CatalogFetchResult, ContentRating, Story, StoryMedium, StoryStatus


class MangaDexConnector(BaseConnector):
    source_id = "mangadex"
    source_name = "MangaDex"
    base_url = "https://api.mangadex.org"
    medium = StoryMedium.COMIC
    _identifier_pattern = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
    _asset_segment_pattern = re.compile(r"^[A-Za-z0-9._-]{1,255}$")

    def __init__(
        self,
        client: Optional[httpx.AsyncClient] = None,
        timeout: float = 12.0,
        preferred_languages: Sequence[str] = ("vi",),
        use_data_saver: bool = False,
        max_feed_pages: int = 20,
    ):
        super().__init__(client=client, timeout=timeout)
        self.preferred_languages = tuple(dict.fromkeys(preferred_languages)) or ("vi",)
        self.use_data_saver = use_data_saver
        self.max_feed_pages = min(max(int(max_feed_pages), 1), 20)

    @classmethod
    def _require_identifier(cls, value: str, label: str) -> str:
        normalized = str(value).strip()
        if not cls._identifier_pattern.fullmatch(normalized):
            raise ValueError(f"Invalid MangaDex {label}")
        return normalized

    @classmethod
    def _safe_asset_segment(cls, value: Any) -> Optional[str]:
        normalized = str(value or "").strip()
        return normalized if cls._asset_segment_pattern.fullmatch(normalized) else None

    @staticmethod
    def _safe_https_base(value: Any) -> Optional[str]:
        normalized = str(value or "").strip().rstrip("/")
        parsed = urlparse(normalized)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not host or parsed.username or parsed.password:
            return None
        if host == "localhost" or host.endswith(".local"):
            return None
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if not re.fullmatch(r"[a-z0-9.-]{1,253}", host):
                return None
        else:
            if not address.is_global:
                return None
        return normalized

    def _get_localized_string(self, dict_or_str: Any, default: str = "") -> str:
        if isinstance(dict_or_str, str):
            return dict_or_str
        if isinstance(dict_or_str, dict):
            for language in self.preferred_languages:
                value = dict_or_str.get(language)
                if isinstance(value, str) and value.strip():
                    return value
            return next(
                (value for value in dict_or_str.values() if isinstance(value, str) and value.strip()),
                default,
            )
        return default

    def _map_status(self, status: Optional[str]) -> StoryStatus:
        if not status:
            return StoryStatus.UNKNOWN
        status = status.lower()
        if status == "completed":
            return StoryStatus.COMPLETED
        if status in ("ongoing", "publishing"):
            return StoryStatus.ONGOING
        if status in ("hiatus", "cancelled"):
            return StoryStatus.PAUSED
        return StoryStatus.UNKNOWN

    def _map_content_rating(self, rating: Optional[str]) -> ContentRating:
        if not rating:
            return ContentRating.SAFE
        rating = rating.lower()
        if rating == "safe":
            return ContentRating.SAFE
        if rating == "suggestive":
            return ContentRating.SUGGESTIVE
        if rating == "erotica":
            return ContentRating.EROTICA
        if rating == "pornographic":
            return ContentRating.PORNOGRAPHIC
        return ContentRating.UNKNOWN

    def _extract_cover_url(self, manga_id: str, relationships: List[Dict[str, Any]]) -> Optional[str]:
        safe_manga_id = self._safe_asset_segment(manga_id)
        if not safe_manga_id:
            return None
        for rel in relationships:
            if rel.get("type") == "cover_art":
                attributes = rel.get("attributes", {})
                file_name = self._safe_asset_segment(attributes.get("fileName"))
                if file_name:
                    return clean_url_slashes(f"https://uploads.mangadex.org/covers/{safe_manga_id}/{file_name}")
        return None

    def _extract_author(self, relationships: List[Dict[str, Any]]) -> Optional[str]:
        authors = []
        for rel in relationships:
            if rel.get("type") in ("author", "artist"):
                attributes = rel.get("attributes", {})
                name = attributes.get("name")
                if name and name not in authors:
                    authors.append(name)
        return ", ".join(authors) if authors else None

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        page = max(int(page), 1)
        limit = min(max(int(limit), 1), 100)
        offset = (page - 1) * limit
        params: Dict[str, Any] = {
            "limit": limit,
            "offset": offset,
            "includes[]": ["cover_art", "author"],
            "availableTranslatedLanguage[]": list(self.preferred_languages),
            "order[updatedAt]": "desc",
        }
        if category:
            params["includedTags[]"] = [self._require_identifier(category, "tag id")]

        response = await self.get(f"{self.base_url}/manga", params=params)
        response.raise_for_status()
        res_data = response.json()

        items = res_data.get("data", [])
        if not isinstance(items, list):
            items = []
        total_raw = res_data.get("total", len(items))
        total = total_raw if isinstance(total_raw, int) and total_raw >= 0 else len(items)

        stories = []
        for item in items:
            if not isinstance(item, dict):
                continue
            manga_id = str(item.get("id", "")).strip()
            if not self._identifier_pattern.fullmatch(manga_id):
                continue
            attributes = item.get("attributes", {})
            relationships = item.get("relationships", [])
            if not isinstance(attributes, dict):
                attributes = {}
            if not isinstance(relationships, list):
                relationships = []

            title = self._get_localized_string(attributes.get("title", {}), "Untitled")
            description = self._get_localized_string(attributes.get("description", {}), "")
            cover_url = self._extract_cover_url(manga_id, relationships)
            author = self._extract_author(relationships)

            tags = attributes.get("tags", [])
            genres = []
            for tag in tags:
                tag_attr = tag.get("attributes", {})
                tag_name = self._get_localized_string(tag_attr.get("name", {}))
                if tag_name:
                    genres.append(tag_name)

            story = Story(
                source_id=self.source_id,
                external_id=manga_id,
                external_url=f"https://mangadex.org/title/{manga_id}",
                title=title,
                slug=manga_id,
                author=author,
                description=description or None,
                cover_url=cover_url,
                genres=genres,
                status=self._map_status(attributes.get("status")),
                medium=self.medium,
                content_rating=self._map_content_rating(attributes.get("contentRating")),
                updated_at=attributes.get("updatedAt"),
                chapters=[],
                raw_metadata=item,
            )
            stories.append(story)

        has_more = (offset + limit) < total

        return CatalogFetchResult(
            stories=stories,
            total=total,
            page=page,
            limit=limit,
            has_more=has_more,
            raw_metadata=res_data,
        )

    async def search_stories(self, query: str, limit: int = 10) -> List[Story]:
        """Search the official API and prefer works that have Vietnamese chapters."""
        query = str(query or "").strip()
        if not query:
            return []
        limit = min(max(int(limit), 1), 20)
        response = await self.get(
            f"{self.base_url}/manga",
            params={
                "title": query,
                "limit": limit,
                "includes[]": ["cover_art", "author"],
                "availableTranslatedLanguage[]": list(self.preferred_languages),
                "order[relevance]": "desc",
            },
        )
        response.raise_for_status()
        payload = response.json()
        items = payload.get("data", [])
        if not isinstance(items, list):
            return []

        stories: List[Story] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            manga_id = str(item.get("id", "")).strip()
            if not self._identifier_pattern.fullmatch(manga_id):
                continue
            attributes = item.get("attributes", {})
            relationships = item.get("relationships", [])
            if not isinstance(attributes, dict) or not isinstance(relationships, list):
                continue
            genres = []
            for tag in attributes.get("tags", []):
                if not isinstance(tag, dict):
                    continue
                name = self._get_localized_string(
                    tag.get("attributes", {}).get("name", {})
                )
                if name:
                    genres.append(name)
            stories.append(
                Story(
                    source_id=self.source_id,
                    external_id=manga_id,
                    external_url=f"https://mangadex.org/title/{manga_id}",
                    title=self._get_localized_string(attributes.get("title", {}), "Untitled"),
                    slug=manga_id,
                    author=self._extract_author(relationships),
                    description=self._get_localized_string(attributes.get("description", {})) or None,
                    cover_url=self._extract_cover_url(manga_id, relationships),
                    genres=genres,
                    status=self._map_status(attributes.get("status")),
                    medium=self.medium,
                    content_rating=self._map_content_rating(attributes.get("contentRating")),
                    updated_at=attributes.get("updatedAt"),
                    chapters=[],
                    raw_metadata=item,
                )
            )
        return stories

    async def fetch_story(self, identifier: str) -> Story:
        identifier = self._require_identifier(identifier, "manga id")
        # 1. Fetch Manga details
        manga_resp = await self.get(
            f"{self.base_url}/manga/{identifier}",
            params={"includes[]": ["cover_art", "author", "artist"]},
        )
        manga_resp.raise_for_status()
        manga_json = manga_resp.json()
        item = manga_json.get("data", {})
        if not isinstance(item, dict):
            raise ValueError("MangaDex returned an invalid manga payload")
        returned_id = str(item.get("id", "")).strip()
        manga_id = returned_id if self._identifier_pattern.fullmatch(returned_id) else identifier
        attributes = item.get("attributes", {})
        relationships = item.get("relationships", [])
        if not isinstance(attributes, dict):
            attributes = {}
        if not isinstance(relationships, list):
            relationships = []

        title = self._get_localized_string(attributes.get("title", {}), "Untitled")
        description = self._get_localized_string(attributes.get("description", {}), "")
        cover_url = self._extract_cover_url(manga_id, relationships)
        author = self._extract_author(relationships)

        genres = [
            self._get_localized_string(tag.get("attributes", {}).get("name", {}))
            for tag in attributes.get("tags", [])
            if self._get_localized_string(tag.get("attributes", {}).get("name", {}))
        ]

        # 2. Fetch Chapter Feed with offset pagination loop
        chapters = []
        offset = 0
        limit = 100
        feed_page = 0
        feed_truncated = False

        while feed_page < self.max_feed_pages:
            feed_page += 1
            feed_resp = await self.get(
                f"{self.base_url}/manga/{manga_id}/feed",
                params={
                    "limit": limit,
                    "offset": offset,
                    "order[chapter]": "asc",
                    "translatedLanguage[]": list(self.preferred_languages),
                },
            )
            feed_resp.raise_for_status()

            feed_json = feed_resp.json()
            feed_items = feed_json.get("data", [])
            if not isinstance(feed_items, list):
                feed_items = []
            for ch in feed_items:
                if not isinstance(ch, dict):
                    continue
                ch_id = str(ch.get("id", "")).strip()
                if not self._identifier_pattern.fullmatch(ch_id):
                    continue
                ch_attr = ch.get("attributes", {})
                ch_num = ch_attr.get("chapter", "")
                ch_title_val = ch_attr.get("title", "")
                display_title = f"Chapter {ch_num}" + (f": {ch_title_val}" if ch_title_val else "")

                chapters.append(
                    ChapterHeader(
                        external_id=ch_id,
                        title=display_title if ch_num or ch_title_val else "Chapter",
                        chapter_number=str(ch_num) if ch_num else None,
                        url=clean_url_slashes(f"https://mangadex.org/chapter/{ch_id}"),
                        updated_at=ch_attr.get("updatedAt") or ch_attr.get("publishAt"),
                        raw_metadata=ch,
                    )
                )

            total_raw = feed_json.get("total", len(chapters))
            total = total_raw if isinstance(total_raw, int) and total_raw >= 0 else len(chapters)
            offset += limit
            if offset >= total or not feed_items:
                break
        else:
            feed_truncated = True

        story_metadata = dict(manga_json)
        story_metadata["_connector"] = {
            "feed_pages": feed_page,
            "feed_truncated": feed_truncated,
            "preferred_languages": list(self.preferred_languages),
        }

        return Story(
            source_id=self.source_id,
            external_id=manga_id,
            external_url=f"https://mangadex.org/title/{manga_id}",
            title=title,
            slug=manga_id,
            author=author,
            description=description or None,
            cover_url=cover_url,
            genres=genres,
            status=self._map_status(attributes.get("status")),
            medium=self.medium,
            content_rating=self._map_content_rating(attributes.get("contentRating")),
            updated_at=attributes.get("updatedAt"),
            chapters=chapters,
            raw_metadata=story_metadata,
        )

    async def fetch_chapter(
        self, story_identifier: str, chapter_identifier: str
    ) -> ChapterContent:
        chapter_identifier = self._require_identifier(chapter_identifier, "chapter id")
        response = await self.get(f"{self.base_url}/at-home/server/{chapter_identifier}")
        response.raise_for_status()
        res_data = response.json()

        base_url = self._safe_https_base(res_data.get("baseUrl"))
        if not base_url:
            raise ValueError("MangaDex returned an unsafe at-home base URL")
        chapter_data = res_data.get("chapter", {})
        hash_val = self._safe_asset_segment(chapter_data.get("hash"))
        if not hash_val:
            raise ValueError("MangaDex returned an invalid chapter hash")
        data_key = "dataSaver" if self.use_data_saver else "data"
        data_files = chapter_data.get(data_key, [])

        image_mode = "data-saver" if self.use_data_saver else "data"
        images = [
            clean_url_slashes(f"{base_url}/{image_mode}/{hash_val}/{file_name}")
            for raw_file_name in data_files
            if (file_name := self._safe_asset_segment(raw_file_name))
        ]
        if not images:
            raise ValueError("MangaDex chapter did not contain safe image assets")

        return ChapterContent(
            story_id=story_identifier,
            external_id=chapter_identifier,
            title=f"Chapter {chapter_identifier}",
            chapter_number=None,
            images=images,
            text_content=None,
            raw_metadata={
                **res_data,
                "_connector": {
                    "image_mode": image_mode,
                    "at_home_urls_are_ephemeral": True,
                },
            },
        )

    async def health_check(self) -> bool:
        try:
            response = await self.get(f"{self.base_url}/ping")
            return response.status_code == 200 and response.text.strip() == "pong"
        except Exception:
            return False
