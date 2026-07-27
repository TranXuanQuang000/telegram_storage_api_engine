import asyncio
import random
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import httpx

from app.models.story import CatalogFetchResult, Story, StoryMedium
from app.models.chapter import ChapterContent


def clean_url_slashes(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    return re.sub(r"(?<!:)/{2,}", "/", url.strip())


class BaseConnector(ABC):
    source_id: str
    source_name: str
    base_url: str
    medium: StoryMedium

    def __init__(self, client: Optional[httpx.AsyncClient] = None, timeout: float = 15.0):
        self._client = client
        self.timeout = timeout

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {
                "Accept": "application/json, text/html;q=0.9",
                "User-Agent": "MucCatalog/1.0 (public-source connector)",
            }
            self._client = httpx.AsyncClient(timeout=self.timeout, headers=headers, follow_redirects=True)
        return self._client

    async def get(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, Any]] = None,
        max_retries: int = 3,
        backoff_factor: float = 0.1,
        **kwargs,
    ) -> httpx.Response:
        client = await self.get_client()
        retryable_statuses = {429, 500, 502, 503, 504}
        attempt = 0
        while True:
            try:
                response = await client.get(url, params=params, headers=headers, **kwargs)
                if response.status_code in retryable_statuses and attempt < max_retries:
                    retry_after = response.headers.get("Retry-After", "").strip()
                    delay = backoff_factor * (2 ** attempt)
                    if retry_after:
                        try:
                            requested_delay = float(retry_after)
                        except ValueError:
                            requested_delay = delay
                        # A long Retry-After should be propagated to the caller instead of
                        # tying up a request handler. Short values are respected.
                        if requested_delay > 5.0:
                            return response
                        delay = max(delay, requested_delay)
                    attempt += 1
                    await asyncio.sleep(min(delay, 5.0) + random.uniform(0.05, 0.35))
                    continue
                content_type = response.headers.get("content-type", "").lower()
                if "text/html" in content_type and (
                    response.encoding is None
                    or response.encoding.lower() in {"iso-8859-1", "latin-1"}
                ):
                    response.encoding = "utf-8"
                return response
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                if attempt < max_retries:
                    attempt += 1
                    delay = backoff_factor * (2 ** (attempt - 1))
                    await asyncio.sleep(delay + random.uniform(0.05, 0.35))
                    continue
                raise exc

    async def close(self):
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    @abstractmethod
    async def fetch_catalog(
        self, page: int = 1, limit: int = 20, category: Optional[str] = None
    ) -> CatalogFetchResult:
        """Fetch paginated catalog of stories."""
        pass

    @abstractmethod
    async def fetch_story(self, identifier: str) -> Story:
        """Fetch detailed information for a specific story."""
        pass

    @abstractmethod
    async def fetch_chapter(
        self, story_identifier: str, chapter_identifier: str
    ) -> ChapterContent:
        """Fetch chapter content (images for comic, text for novel)."""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check availability of the source API or website."""
        pass
