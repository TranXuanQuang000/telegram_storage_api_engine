import asyncio
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


class XkcdConnector(BaseConnector):
    """Official xkcd JSON feed connector (CC BY-NC 2.5)."""

    source_id = "xkcd"
    source_name = "xkcd"
    base_url = "https://xkcd.com"
    medium = StoryMedium.COMIC
    _image_hosts = frozenset({"imgs.xkcd.com", "xkcd.com", "www.xkcd.com"})

    @staticmethod
    def _comic_number(identifier: str) -> int:
        match = re.fullmatch(r"(?:xkcd-)?(\d{1,7})", identifier.strip().lower())
        if not match:
            raise ValueError("Invalid xkcd comic identifier")
        number = int(match.group(1))
        if number < 1:
            raise ValueError("Invalid xkcd comic identifier")
        return number

    def _metadata_url(self, number: Optional[int] = None) -> str:
        return (
            f"{self.base_url}/{number}/info.0.json"
            if number is not None
            else f"{self.base_url}/info.0.json"
        )

    def _map_story(self, payload: Dict[str, Any]) -> Story:
        number = int(payload["num"])
        image_url = str(payload.get("img") or "")
        parsed = urlparse(image_url)
        if (
            parsed.scheme != "https"
            or (parsed.hostname or "").lower() not in self._image_hosts
        ):
            image_url = ""
        title = str(payload.get("safe_title") or payload.get("title") or f"xkcd #{number}")
        description_parts = [
            str(payload.get("alt") or "").strip(),
            str(payload.get("transcript") or "").strip(),
        ]
        description = "\n\n".join(item for item in description_parts if item)
        updated = "-".join(
            str(payload.get(key) or "").zfill(2 if key != "year" else 4)
            for key in ("year", "month", "day")
        )
        source_url = f"https://xkcd.com/{number}/"
        return Story(
            source_id=self.source_id,
            external_id=str(number),
            external_url=source_url,
            title=title,
            slug=f"xkcd-{number}",
            author="Randall Munroe",
            description=description or None,
            cover_url=image_url or None,
            genres=["Webcomic", "Science", "Technology", "Humor"],
            status=StoryStatus.COMPLETED,
            medium=self.medium,
            content_rating=ContentRating.SAFE,
            updated_at=updated,
            chapters=[
                ChapterHeader(
                    external_id=str(number),
                    title=f"xkcd #{number}: {title}",
                    chapter_number=str(number),
                    url=source_url,
                )
            ],
            raw_metadata={
                "license": "CC BY-NC 2.5",
                "license_url": "https://xkcd.com/license.html",
                "official_json": self._metadata_url(number),
            },
        )

    async def _fetch_payload(self, number: Optional[int] = None) -> Dict[str, Any]:
        response = await self.get(self._metadata_url(number), max_retries=1)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("num"), int):
            raise ValueError("Invalid xkcd metadata response")
        return payload

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        latest = await self._fetch_payload()
        newest = int(latest["num"])
        start = newest - (page - 1) * limit
        numbers = [number for number in range(start, max(0, start - limit), -1) if number != 404]

        async def load(number: int):
            if number == newest:
                return latest
            try:
                return await self._fetch_payload(number)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    return None
                raise

        payloads = await asyncio.gather(*(load(number) for number in numbers))
        stories = [self._map_story(item) for item in payloads if isinstance(item, dict)]
        return CatalogFetchResult(
            stories=stories,
            total=newest - 1,
            page=page,
            limit=limit,
            has_more=min(numbers, default=0) > 1,
            raw_metadata={
                "official_feed": self._metadata_url(),
                "license": "CC BY-NC 2.5",
            },
        )

    async def fetch_story(self, identifier: str) -> Story:
        number = self._comic_number(identifier)
        return self._map_story(await self._fetch_payload(number))

    async def fetch_chapter(
        self, story_identifier: str, chapter_identifier: str
    ) -> ChapterContent:
        story_number = self._comic_number(story_identifier)
        chapter_number = self._comic_number(chapter_identifier)
        if story_number != chapter_number:
            raise ValueError("xkcd story/chapter identifier mismatch")
        story = await self.fetch_story(str(story_number))
        return ChapterContent(
            story_id=str(story_number),
            external_id=str(story_number),
            title=story.chapters[0].title,
            chapter_number=str(story_number),
            images=[story.cover_url] if story.cover_url else [],
            text_content=None,
            raw_metadata={
                "source_id": self.source_id,
                "parsed_url": story.external_url,
                "license": "CC BY-NC 2.5",
            },
        )

    async def health_check(self) -> bool:
        try:
            response = await self.get(self._metadata_url(), max_retries=0)
            return response.status_code == 200
        except Exception:
            return False
