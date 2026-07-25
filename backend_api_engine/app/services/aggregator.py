import asyncio
import os
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.connectors.comic.otruyen import OTruyenConnector
from app.connectors.comic.registry import create_direct_public_comic_connectors
from app.connectors.novel.hako import HakoConnector
from app.connectors.novel.truyenfull import TruyenFullConnector
from app.connectors.novel.metruyenchu import MetruyenchuConnector
from app.connectors.novel.tangthuvien import TangThuVienConnector
from app.connectors.novel.wikidich import WikidichConnector
from app.config.sources import is_source_enabled
from app.engine.merger import SmartChapterMerger
from app.engine.cleaner import NovelTextCleaner
from app.models.chapter import ChapterContent, ChapterHeader
from app.models.story import CatalogFetchResult, Story


class CacheEntry:
    def __init__(self, value: Any, ttl: float = 300.0):
        self.value = value
        self.expires_at = time.time() + ttl

    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class AggregatorService:
    def __init__(self, client: Optional[httpx.AsyncClient] = None, ttl: float = 300.0):
        self.client = client
        self.ttl = ttl
        self.otruyen_connector = OTruyenConnector(client=client)
        self.comic_connectors = create_direct_public_comic_connectors(client=client)
        self.comic_connectors["otruyen"] = self.otruyen_connector
        self.hako_connector = HakoConnector(client=client)
        self.truyenfull_connector = TruyenFullConnector(client=client)
        self.metruyenchu_connector = MetruyenchuConnector(client=client)
        self.tangthuvien_connector = TangThuVienConnector(client=client)
        self.wikidich_connector = WikidichConnector(client=client)
        
        self.merger = SmartChapterMerger()
        self.cleaner = NovelTextCleaner()
        
        self.cache_max_entries = max(32, min(int(os.getenv("CACHE_MAX_ENTRIES", "512")), 4096))
        self._cache: "OrderedDict[str, CacheEntry]" = OrderedDict()
        self._lock = asyncio.Lock()

    def set_client(self, client: httpx.AsyncClient):
        self.client = client
        self.otruyen_connector._client = client
        for connector in self.comic_connectors.values():
            connector._client = client
        self.hako_connector._client = client
        self.truyenfull_connector._client = client
        self.metruyenchu_connector._client = client
        self.tangthuvien_connector._client = client
        self.wikidich_connector._client = client

    def get_cache(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry:
            if not entry.is_expired():
                self._cache.move_to_end(key)
                return entry.value
            else:
                del self._cache[key]
        return None

    def set_cache(self, key: str, value: Any, ttl: Optional[float] = None):
        cache_ttl = ttl if ttl is not None else self.ttl
        self._cache[key] = CacheEntry(value, cache_ttl)
        self._cache.move_to_end(key)
        while len(self._cache) > self.cache_max_entries:
            self._cache.popitem(last=False)

    def clear_cache(self):
        self._cache.clear()

    # --- OTruyen Comic Methods ---
    async def get_otruyen_raw(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        ttl: Optional[float] = None,
    ) -> Dict[str, Any]:
        normalized_params = tuple(sorted((params or {}).items()))
        cache_key = f"otruyen:raw:{path}:{normalized_params}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached
        payload = await self.otruyen_connector.fetch_raw(path, params=params)
        self.set_cache(cache_key, payload, ttl=ttl)
        return payload

    async def get_otruyen_catalog(self, page: int = 1, limit: int = 20) -> CatalogFetchResult:
        cache_key = f"otruyen:catalog:{page}:{limit}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        result = await self.otruyen_connector.fetch_catalog(page=page, limit=limit)
        self.set_cache(cache_key, result)
        return result

    async def get_otruyen_story(self, slug: str) -> Tuple[Story, List[ChapterHeader]]:
        cache_key = f"otruyen:story:{slug}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        story = await self.otruyen_connector.fetch_story(slug)
        merged_chapters = self.merger.merge(
            primary_chapters=story.chapters,
            primary_source_name=self.otruyen_connector.source_id,
        )
        self.set_cache(cache_key, (story, merged_chapters))
        return story, merged_chapters

    async def get_otruyen_chapter(self, chapter_id: str, story_slug: Optional[str] = None) -> ChapterContent:
        cache_key = f"otruyen:chapter:{chapter_id}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        chapter = await self.otruyen_connector.fetch_chapter(story_slug or "", chapter_id)
        self.set_cache(cache_key, chapter)
        return chapter

    async def get_comic_catalog(
        self,
        source: str,
        page: int = 1,
        limit: int = 20,
        category: Optional[str] = None,
    ) -> CatalogFetchResult:
        connector = self._get_comic_connector(source)
        cache_key = f"comic:catalog:{connector.source_id}:{page}:{limit}:{category or ''}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached
        result = await connector.fetch_catalog(page=page, limit=limit, category=category)
        self.set_cache(cache_key, result)
        return result

    async def get_comic_story(
        self,
        identifier: str,
        source: str = "otruyen",
        secondary_sources: Optional[List[str]] = None,
    ) -> Tuple[Story, List[ChapterHeader]]:
        connector = self._get_comic_connector(source)
        secondary_ids = [
            item.strip().lower()
            for item in (secondary_sources or [])
            if item.strip().lower() != connector.source_id
        ]
        cache_key = f"comic:story:{connector.source_id}:{identifier}:{','.join(secondary_ids)}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        story = await connector.fetch_story(identifier)
        secondary_chapters: List[Tuple[str, List[ChapterHeader]]] = []
        # A slug/UUID is source-specific. We only try the same identifier here;
        # callers should persist canonical cross-source mappings after a title
        # match instead of guessing and merging an unrelated work.
        for source_id in secondary_ids:
            try:
                secondary = self._get_comic_connector(source_id)
                secondary_story = await secondary.fetch_story(identifier)
                secondary_chapters.append((source_id, secondary_story.chapters))
            except Exception:
                continue
        merged = self.merger.merge(
            primary_chapters=story.chapters,
            secondary_sources=secondary_chapters,
            primary_source_name=connector.source_id,
        )
        self.set_cache(cache_key, (story, merged))
        return story, merged

    async def get_comic_chapter(
        self,
        source: str,
        story_identifier: str,
        chapter_identifier: str,
    ) -> ChapterContent:
        connector = self._get_comic_connector(source)
        cache_key = f"comic:chapter:{connector.source_id}:{story_identifier}:{chapter_identifier}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached
        chapter = await connector.fetch_chapter(story_identifier, chapter_identifier)
        chapter.raw_metadata = {
            **(chapter.raw_metadata or {}),
            "source_id": connector.source_id,
        }
        self.set_cache(cache_key, chapter)
        return chapter

    # --- Novel Methods ---
    async def get_novel_catalog(self, page: int = 1, limit: int = 20, source: str = "hako") -> CatalogFetchResult:
        cache_key = f"novel:catalog:{source}:{page}:{limit}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        connector = self._get_novel_connector(source)
        result = await connector.fetch_catalog(page=page, limit=limit)
        self.set_cache(cache_key, result)
        return result

    async def get_novel_story(
        self,
        slug: str,
        primary_source: str = "hako",
        secondary_sources: Optional[List[str]] = None,
    ) -> Tuple[Story, List[ChapterHeader]]:
        cache_key = f"novel:story:{primary_source}:{slug}:{','.join(secondary_sources or [])}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        p_connector = self._get_novel_connector(primary_source)
        
        primary_story: Optional[Story] = None
        try:
            primary_story = await p_connector.fetch_story(slug)
        except Exception:
            for s in (
                secondary_sources
                or ["truyenfull", "metruyenchu", "tangthuvien", "wikidich"]
            ):
                if s != primary_source:
                    try:
                        conn = self._get_novel_connector(s)
                        primary_story = await conn.fetch_story(slug)
                        p_connector = conn
                        break
                    except Exception:
                        pass
        
        if primary_story is None:
            raise ValueError(f"Novel with slug '{slug}' not found in specified sources.")

        sec_tuples: List[Tuple[str, List[ChapterHeader]]] = []
        sources_to_try = (
            secondary_sources
            if secondary_sources is not None
            else ["truyenfull", "metruyenchu", "tangthuvien", "wikidich", "hako"]
        )
        for sec_name in sources_to_try:
            if sec_name.lower() != p_connector.source_id.lower():
                try:
                    sec_conn = self._get_novel_connector(sec_name)
                    sec_story = await sec_conn.fetch_story(slug)
                    sec_tuples.append((sec_name, sec_story.chapters))
                except Exception:
                    pass

        merged_chapters = self.merger.merge(
            primary_chapters=primary_story.chapters,
            secondary_sources=sec_tuples,
            primary_source_name=p_connector.source_id,
        )

        self.set_cache(cache_key, (primary_story, merged_chapters))
        return primary_story, merged_chapters

    async def get_novel_chapter(
        self,
        slug: str,
        chapter_no: str,
        source: str = "hako",
        as_html: bool = True,
    ) -> ChapterContent:
        cache_key = f"novel:chapter:{source}:{slug}:{chapter_no}:{as_html}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        primary_conn = self._get_novel_connector(source)
        connectors_to_try = [primary_conn]
        for s in ["hako", "truyenfull", "metruyenchu", "tangthuvien", "wikidich"]:
            conn = self._get_novel_connector(s)
            if conn not in connectors_to_try:
                connectors_to_try.append(conn)

        chapter_content: Optional[ChapterContent] = None
        last_exc = None
        for conn in connectors_to_try:
            try:
                res = await conn.fetch_chapter(slug, chapter_no)
                if res and res.text_content and res.text_content.strip():
                    res.raw_metadata = {
                        **(res.raw_metadata or {}),
                        "source_id": conn.source_id,
                    }
                    chapter_content = res
                    break
            except Exception as e:
                last_exc = e

        if chapter_content is None or not chapter_content.text_content or not chapter_content.text_content.strip():
            if last_exc:
                raise last_exc
            raise ValueError(f"Chapter '{chapter_no}' for novel '{slug}' not found.")

        if chapter_content.text_content:
            cleaned_text = self.cleaner.clean(chapter_content.text_content, as_html=as_html)
            chapter_content.text_content = cleaned_text

        self.set_cache(cache_key, chapter_content)
        return chapter_content

    def _get_novel_connector(self, source: str):
        source_lower = source.strip().lower()
        connectors = {
            "hako": self.hako_connector,
            "truyenfull": self.truyenfull_connector,
            "metruyenchu": self.metruyenchu_connector,
            "tangthuvien": self.tangthuvien_connector,
            "wikidich": self.wikidich_connector,
        }
        connector = connectors.get(source_lower)
        if connector is None:
            raise ValueError(f"Unsupported novel source '{source}'")
        if not is_source_enabled(source_lower):
            raise ValueError(f"Disabled novel source '{source}'")
        return connector

    def _get_comic_connector(self, source: str):
        normalized = source.strip().lower()
        connector = self.comic_connectors.get(normalized)
        if connector is None:
            raise ValueError(f"Unsupported or disabled comic source '{source}'")
        if not is_source_enabled(normalized):
            raise ValueError(f"Disabled comic source '{source}'")
        return connector


_aggregator_instance = AggregatorService()


def get_aggregator_service() -> AggregatorService:
    return _aggregator_instance
