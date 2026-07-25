import os
from typing import Any, Dict, Optional
import re
from bs4 import BeautifulSoup
import httpx

from app.connectors.base import BaseConnector, clean_url_slashes
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import CatalogFetchResult, ContentRating, Story, StoryMedium, StoryStatus


class OTruyenConnector(BaseConnector):
    source_id = "otruyen"
    source_name = "OTruyen"
    base_url = os.getenv("OTRUYEN_UPSTREAM_URL", "https://otruyenapi.com/v1/api").rstrip("/")
    chapter_base_url = os.getenv(
        "OTRUYEN_CHAPTER_URL",
        "https://sv1.otruyencdn.com/v1/api/chapter",
    ).rstrip("/")
    medium = StoryMedium.COMIC

    def _clean_html(self, text: Optional[str]) -> Optional[str]:
        if not text:
            return None
        soup = BeautifulSoup(text, "html.parser")
        return soup.get_text(strip=True)

    def _map_status(self, status_str: Optional[str]) -> StoryStatus:
        if not status_str:
            return StoryStatus.UNKNOWN
        status_str = status_str.lower()
        if "hoàn thành" in status_str or "completed" in status_str:
            return StoryStatus.COMPLETED
        if "đang tiến hành" in status_str or "ongoing" in status_str:
            return StoryStatus.ONGOING
        if "tạm ngưng" in status_str or "paused" in status_str:
            return StoryStatus.PAUSED
        return StoryStatus.UNKNOWN

    def _build_cover_url(self, thumb_url: Optional[str], cdn_domain: Optional[str] = None) -> Optional[str]:
        if not thumb_url:
            return None
        thumb_url = thumb_url.strip()
        if thumb_url.startswith("http://") or thumb_url.startswith("https://"):
            return clean_url_slashes(thumb_url)

        base_cdn = (cdn_domain or "https://otruyencdn.com/uploads/comics").strip().rstrip("/")
        thumb_clean = thumb_url.lstrip("/")

        if base_cdn.endswith("uploads/comics"):
            if thumb_clean.startswith("uploads/comics/"):
                thumb_clean = thumb_clean[len("uploads/comics/"):]
            full_url = f"{base_cdn}/{thumb_clean}"
        else:
            if not thumb_clean.startswith("uploads/comics/"):
                full_url = f"{base_cdn}/uploads/comics/{thumb_clean}"
            else:
                full_url = f"{base_cdn}/{thumb_clean}"

        return clean_url_slashes(full_url)

    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        if category:
            url = f"{self.base_url}/the-loai/{category}?page={page}"
        else:
            url = f"{self.base_url}/danh-sach/truyen-moi?page={page}"

        response = await self.get(url)
        response.raise_for_status()
        res_data = response.json()

        data = res_data.get("data", {})
        items = data.get("items", [])
        cdn_domain = data.get("APP_DOMAIN_CDN_IMAGE") or "https://otruyencdn.com/uploads/comics"

        stories = []
        for item in items:
            slug = item.get("slug", "")
            ext_id = item.get("_id") or slug
            cover = self._build_cover_url(item.get("thumb_url"), cdn_domain)
            genres = [cat.get("name") for cat in item.get("category", []) if isinstance(cat, dict) and cat.get("name")]

            story = Story(
                source_id=self.source_id,
                external_id=ext_id,
                external_url=f"https://otruyenapi.com/v1/api/truyen-tranh/{slug}",
                title=item.get("name", "Unknown Title"),
                slug=slug,
                author=None,
                description=None,
                cover_url=cover,
                genres=genres,
                status=self._map_status(item.get("status")),
                medium=self.medium,
                content_rating=ContentRating.SAFE,
                updated_at=item.get("updatedAt"),
                chapters=[],
                raw_metadata=item,
            )
            stories.append(story)

        pagination = data.get("params", {}).get("pagination", {})
        total = pagination.get("totalItems")
        current_page = pagination.get("currentPage", page)
        total_pages = (total + limit - 1) // limit if total and limit else None
        has_more = (current_page < total_pages) if total_pages else (len(stories) >= limit)

        return CatalogFetchResult(
            stories=stories,
            total=total,
            page=current_page,
            limit=limit,
            has_more=has_more,
            raw_metadata=res_data,
        )

    async def fetch_raw(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Fetch one explicitly routed compatibility endpoint from the upstream."""
        clean_path = "/" + path.strip("/")
        response = await self.get(f"{self.base_url}{clean_path}", params=params)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Comic upstream returned a non-object JSON payload")
        return payload

    async def fetch_story(self, identifier: str) -> Story:
        url = f"{self.base_url}/truyen-tranh/{identifier}"
        response = await self.get(url)
        response.raise_for_status()
        res_data = response.json()

        data = res_data.get("data", {})
        item = data.get("item", {})
        cdn_domain = data.get("APP_DOMAIN_CDN_IMAGE") or "https://otruyencdn.com/uploads/comics"

        slug = item.get("slug", identifier)
        ext_id = item.get("_id") or slug
        cover = self._build_cover_url(item.get("thumb_url"), cdn_domain)

        authors = item.get("author", [])
        author_str = ", ".join(authors) if isinstance(authors, list) else str(authors) if authors else None

        genres = [cat.get("name") for cat in item.get("category", []) if isinstance(cat, dict) and cat.get("name")]

        chapters_list = []
        raw_chapters = item.get("chapters", [])
        for server in raw_chapters:
            server_data = server.get("server_data", [])
            for ch in server_data:
                ch_api = ch.get("chapter_api_data", "")
                ch_id = ch_api.split("/")[-1] if "/" in ch_api else ch.get("filename", "")
                ch_name = ch.get("chapter_name", "")
                ch_title = ch.get("chapter_title", "")
                display_title = f"Chapter {ch_name}" + (f": {ch_title}" if ch_title else "")
                
                chapters_list.append(
                    ChapterHeader(
                        external_id=ch_id or ch_api,
                        title=display_title,
                        chapter_number=str(ch_name),
                        url=ch_api,
                        raw_metadata=ch,
                    )
                )

        return Story(
            source_id=self.source_id,
            external_id=ext_id,
            external_url=f"https://otruyenapi.com/v1/api/truyen-tranh/{slug}",
            title=item.get("name", "Unknown Title"),
            slug=slug,
            author=author_str,
            description=self._clean_html(item.get("content")),
            cover_url=cover,
            genres=genres,
            status=self._map_status(item.get("status")),
            medium=self.medium,
            content_rating=ContentRating.SAFE,
            updated_at=item.get("updatedAt"),
            chapters=chapters_list,
            raw_metadata=res_data,
        )

    async def fetch_chapter(
        self, story_identifier: str, chapter_identifier: str
    ) -> ChapterContent:
        if chapter_identifier.startswith("http://") or chapter_identifier.startswith("https://"):
            url = chapter_identifier
        else:
            url = f"{self.chapter_base_url}/{chapter_identifier}"

        response = await self.get(url)
        response.raise_for_status()
        res_data = response.json()

        data = res_data.get("data", {})
        domain_cdn = data.get("domain_cdn", "")
        item = data.get("item", {})

        chapter_path = item.get("chapter_path", "")
        chapter_images = item.get("chapter_image", [])

        image_urls = []
        for img in chapter_images:
            if isinstance(img, dict) and "image_file" in img:
                filename = img["image_file"]
                image_urls.append(clean_url_slashes(f"{domain_cdn}/{chapter_path}/{filename}"))
            elif isinstance(img, str):
                image_urls.append(clean_url_slashes(f"{domain_cdn}/{chapter_path}/{img}"))

        ch_name = item.get("chapter_name", "")
        ch_title = item.get("chapter_title", "")
        display_title = f"Chapter {ch_name}" + (f": {ch_title}" if ch_title else "")

        return ChapterContent(
            story_id=story_identifier,
            external_id=item.get("_id") or chapter_identifier,
            title=display_title,
            chapter_number=str(ch_name),
            images=image_urls,
            text_content=None,
            raw_metadata=res_data,
        )

    async def health_check(self) -> bool:
        try:
            response = await self.get(f"{self.base_url}/danh-sach/truyen-moi?page=1")
            return response.status_code == 200
        except Exception:
            return False
