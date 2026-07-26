import asyncio
import os
import re
import time
from collections import OrderedDict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.connectors.comic.otruyen import OTruyenConnector
from app.connectors.comic.registry import create_direct_public_comic_connectors
from app.connectors.novel.hako import HakoConnector
from app.connectors.novel.truyenfull import TruyenFullConnector
from app.connectors.novel.metruyenchu import MetruyenchuConnector
from app.connectors.novel.tangthuvien import TangThuVienConnector
from app.connectors.novel.wikidich import WikidichConnector
from app.connectors.novel.gutendex import GutendexConnector
from app.config.sources import is_source_enabled
from app.engine.merger import SmartChapterMerger
from app.engine.cleaner import NovelTextCleaner
from app.engine.matcher import normalize_identity_text, story_identity_score
from app.engine.source_selector import AdaptiveSourceSelector, SourceCandidate
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
        self.gutendex_connector = GutendexConnector(client=client)
        self.novel_connectors = {
            "hako": self.hako_connector,
            "truyenfull": self.truyenfull_connector,
            "metruyenchu": self.metruyenchu_connector,
            "tangthuvien": self.tangthuvien_connector,
            "wikidich": self.wikidich_connector,
            "gutendex": self.gutendex_connector,
        }
        
        self.merger = SmartChapterMerger()
        self.cleaner = NovelTextCleaner()
        self.selector = AdaptiveSourceSelector()
        self.source_operation_timeout = max(
            3.0,
            min(float(os.getenv("SOURCE_OPERATION_TIMEOUT_SECONDS", "5")), 30.0),
        )
        
        self.cache_max_entries = max(32, min(int(os.getenv("CACHE_MAX_ENTRIES", "512")), 4096))
        self._cache: "OrderedDict[str, CacheEntry]" = OrderedDict()
        self._lock = asyncio.Lock()

    def set_client(self, client: httpx.AsyncClient):
        self.client = client
        self.otruyen_connector._client = client
        for connector in self.comic_connectors.values():
            connector._client = client
        for connector in self.novel_connectors.values():
            connector._client = client

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

    async def _fetch_with_health(self, source_id: str, operation):
        if not self.selector.acquire_permission(source_id):
            raise RuntimeError(f"Source circuit is open: {source_id}")
        started = time.perf_counter()
        try:
            value = await asyncio.wait_for(
                operation(), timeout=self.source_operation_timeout
            )
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if 400 <= status_code < 500 and status_code != 429:
                self.selector.record_success(
                    source_id, (time.perf_counter() - started) * 1000
                )
            else:
                self.selector.record_failure(source_id)
            raise
        except Exception:
            self.selector.record_failure(source_id)
            raise
        self.selector.record_success(
            source_id, (time.perf_counter() - started) * 1000
        )
        return value

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

    @staticmethod
    def _story_quality(story: Story) -> float:
        """Prefer complete, fresh records without making source-specific promises."""
        chapter_count = len(story.chapters)
        parseable = sum(1 for chapter in story.chapters if chapter.chapter_number)
        coverage = parseable / max(1, chapter_count)
        metadata = sum(
            bool(value)
            for value in (story.title, story.author, story.description, story.cover_url)
        ) / 4
        return chapter_count * 0.65 + coverage * 18 + metadata * 6

    @staticmethod
    def _updated_at(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    def _select_primary(self, stories: List[Story]) -> Story:
        expected = max((len(story.chapters) for story in stories), default=0)
        candidates = []
        for story in stories:
            identities = [
                self.merger.parser.parse_chapter(chapter)
                for chapter in story.chapters
            ]
            parseable = [
                identity for identity in identities if identity.is_parseable
            ]
            completeness = len({item.canonical_id for item in parseable}) / max(
                1, len(identities)
            )
            candidates.append(
                SourceCandidate(
                    source_id=story.source_id,
                    value=story,
                    updated_at=self._updated_at(story.updated_at),
                    chapter_count=len(story.chapters),
                    expected_chapter_count=expected or None,
                    completeness_ratio=completeness,
                )
            )
        selected = self.selector.choose(candidates)
        if selected is None:
            return max(stories, key=self._story_quality)
        return selected.candidate.value

    @staticmethod
    def _tag_story_chapters(story: Story) -> None:
        for chapter in story.chapters:
            chapter.raw_metadata = {
                **(chapter.raw_metadata or {}),
                "original_story_id": story.external_id,
            }

    async def get_auto_comic_story(
        self,
        identifier: str,
    ) -> Tuple[Story, List[ChapterHeader]]:
        """
        Resolve a public identifier, discover a verified cross-source match, then
        choose the most complete source as primary and retain source provenance.
        """
        cache_key = f"comic:story:auto:{identifier}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        manga_dex_uuid = bool(
            re.fullmatch(
                r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
                r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}",
                identifier,
            )
        )
        if manga_dex_uuid:
            tasks = [
                asyncio.create_task(
                    self._fetch_with_health(
                        "mangadex",
                        lambda: self.comic_connectors["mangadex"].fetch_story(
                            identifier
                        ),
                    )
                )
            ]
        else:
            tasks = [
                asyncio.create_task(
                    self._fetch_with_health(
                        "otruyen",
                        lambda: self.otruyen_connector.fetch_story(identifier),
                    )
                )
            ]
        direct = await asyncio.gather(*tasks, return_exceptions=True)
        candidates = [item for item in direct if isinstance(item, Story)]
        if not candidates:
            raise ValueError(f"Comic '{identifier}' not found in enabled public sources")

        anchor = self._select_primary(candidates)
        manga_dex = self.comic_connectors.get("mangadex")
        if anchor.source_id != "mangadex" and manga_dex is not None:
            try:
                search_results = await self._fetch_with_health(
                    "mangadex",
                    lambda: manga_dex.search_stories(anchor.title, limit=8),
                )
                ranked = sorted(
                    (
                        (story_identity_score(anchor, candidate), candidate)
                        for candidate in search_results
                    ),
                    key=lambda item: item[0],
                    reverse=True,
                )
                if ranked and ranked[0][0] >= 0.90:
                    runner_up = ranked[1][0] if len(ranked) > 1 else 0
                    if ranked[0][0] - runner_up >= 0.025:
                        full_match = await self._fetch_with_health(
                            "mangadex",
                            lambda: manga_dex.fetch_story(
                                ranked[0][1].external_id
                            ),
                        )
                        candidates.append(full_match)
            except Exception:
                pass

        # Only merge candidates confidently identified as the same work.
        primary = self._select_primary(candidates)
        matched = [
            candidate
            for candidate in candidates
            if candidate is not primary
            and story_identity_score(primary, candidate) >= 0.90
        ]
        self._tag_story_chapters(primary)
        for candidate in matched:
            self._tag_story_chapters(candidate)
        merged = self.merger.merge(
            primary_chapters=primary.chapters,
            secondary_sources=[
                (candidate.source_id, candidate.chapters) for candidate in matched
            ],
            primary_source_name=primary.source_id,
        )
        primary.raw_metadata = {
            **(primary.raw_metadata or {}),
            "_aggregator": {
                "mode": "auto",
                "selected_source": primary.source_id,
                "matched_sources": [primary.source_id]
                + [candidate.source_id for candidate in matched],
                "selection_policy": "chapter_coverage+metadata+verified_title_match",
            },
        }
        self.set_cache(cache_key, (primary, merged))
        return primary, merged

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
        if source.strip().lower() == "auto":
            return await self.get_auto_novel_catalog(page=page, limit=limit)
        cache_key = f"novel:catalog:{source}:{page}:{limit}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        connector = self._get_novel_connector(source)
        result = await self._fetch_with_health(
            connector.source_id,
            lambda: connector.fetch_catalog(page=page, limit=limit),
        )
        self.set_cache(cache_key, result)
        return result

    async def get_auto_novel_catalog(
        self, page: int = 1, limit: int = 20
    ) -> CatalogFetchResult:
        cache_key = f"novel:catalog:auto:{page}:{limit}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached
        source_ids = [
            source_id
            for source_id in self.novel_connectors
            if is_source_enabled(source_id)
        ]

        async def fetch(source_id: str):
            try:
                return source_id, await self._fetch_with_health(
                    source_id,
                    lambda: self._get_novel_connector(source_id).fetch_catalog(
                        page=page, limit=limit
                    ),
                )
            except Exception:
                return source_id, None

        results = await asyncio.gather(*(fetch(source_id) for source_id in source_ids))
        stories: List[Story] = []
        seen_by_identity: Dict[str, Story] = {}
        contributing = []
        result_by_source: Dict[str, CatalogFetchResult] = {}
        for source_id, result in results:
            if result is None:
                continue
            contributing.append(source_id)
            result_by_source[source_id] = result

        # Round-robin keeps the first provider from consuming the entire page while
        # deterministic title+author buckets make catalog dedupe effectively O(N).
        max_rows = max(
            (len(result.stories) for result in result_by_source.values()),
            default=0,
        )
        for row in range(max_rows):
            for source_id in source_ids:
                source_result = result_by_source.get(source_id)
                if source_result is None or row >= len(source_result.stories):
                    continue
                candidate = source_result.stories[row]
                identity = "|".join(
                    (
                        normalize_identity_text(candidate.title),
                        normalize_identity_text(candidate.author),
                    )
                )
                equivalent = seen_by_identity.get(identity) if identity.strip("|") else None
                if equivalent is None:
                    stories.append(candidate)
                    if identity.strip("|"):
                        seen_by_identity[identity] = candidate
                elif self._story_quality(candidate) > self._story_quality(equivalent):
                    index = stories.index(equivalent)
                    stories[index] = candidate
                    seen_by_identity[identity] = candidate
                if len(stories) >= limit:
                    break
            if len(stories) >= limit:
                break
        result = CatalogFetchResult(
            stories=stories,
            total=sum(
                item.total if item.total is not None else len(item.stories)
                for item in result_by_source.values()
            ),
            page=page,
            limit=limit,
            has_more=any(item is not None and item.has_more for _, item in results),
            raw_metadata={
                "mode": "auto",
                "contributing_sources": contributing,
                "selection_policy": "deduplicate_verified_titles+metadata_completeness",
            },
        )
        self.set_cache(cache_key, result)
        return result

    async def get_novel_story(
        self,
        slug: str,
        primary_source: str = "hako",
        secondary_sources: Optional[List[str]] = None,
    ) -> Tuple[Story, List[ChapterHeader]]:
        if primary_source.strip().lower() == "auto":
            return await self.get_auto_novel_story(slug, secondary_sources)
        cache_key = f"novel:story:{primary_source}:{slug}:{','.join(secondary_sources or [])}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        p_connector = self._get_novel_connector(primary_source)
        
        primary_story: Optional[Story] = None
        try:
            primary_story = await self._fetch_with_health(
                p_connector.source_id,
                lambda: p_connector.fetch_story(slug),
            )
        except Exception:
            for s in (
                secondary_sources
                or [
                    source_id
                    for source_id in self.novel_connectors
                    if is_source_enabled(source_id)
                ]
            ):
                if s != primary_source:
                    try:
                        conn = self._get_novel_connector(s)
                        primary_story = await self._fetch_with_health(
                            conn.source_id,
                            lambda conn=conn: conn.fetch_story(slug),
                        )
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
            else [
                source_id
                for source_id in self.novel_connectors
                if is_source_enabled(source_id)
            ]
        )
        for sec_name in sources_to_try:
            if sec_name.lower() != p_connector.source_id.lower():
                try:
                    sec_conn = self._get_novel_connector(sec_name)
                    sec_story = await self._fetch_with_health(
                        sec_conn.source_id,
                        lambda sec_conn=sec_conn: sec_conn.fetch_story(slug),
                    )
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

    async def get_auto_novel_story(
        self,
        slug: str,
        source_ids: Optional[List[str]] = None,
    ) -> Tuple[Story, List[ChapterHeader]]:
        enabled = source_ids or [
            source_id
            for source_id in self.novel_connectors
            if is_source_enabled(source_id)
        ]
        cache_key = f"novel:story:auto:{slug}:{','.join(enabled)}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        async def fetch(source_id: str):
            try:
                return await self._fetch_with_health(
                    source_id,
                    lambda: self._get_novel_connector(source_id).fetch_story(slug),
                )
            except Exception:
                return None

        fetched = await asyncio.gather(*(fetch(source_id) for source_id in enabled))
        candidates = [story for story in fetched if isinstance(story, Story)]
        if not candidates:
            raise ValueError(f"Novel with slug '{slug}' not found in enabled sources.")
        primary = self._select_primary(candidates)
        matched = [
            story
            for story in candidates
            if story is not primary and story_identity_score(primary, story) >= 0.90
        ]
        self._tag_story_chapters(primary)
        for story in matched:
            self._tag_story_chapters(story)
        merged = self.merger.merge(
            primary_chapters=primary.chapters,
            secondary_sources=[(story.source_id, story.chapters) for story in matched],
            primary_source_name=primary.source_id,
        )
        primary.raw_metadata = {
            **(primary.raw_metadata or {}),
            "_aggregator": {
                "mode": "auto",
                "selected_source": primary.source_id,
                "matched_sources": [primary.source_id]
                + [story.source_id for story in matched],
                "selection_policy": "chapter_coverage+metadata+verified_title_match",
            },
        }
        self.set_cache(cache_key, (primary, merged))
        return primary, merged

    async def get_novel_chapter(
        self,
        slug: str,
        chapter_no: str,
        source: str = "hako",
        as_html: bool = True,
    ) -> ChapterContent:
        if source.strip().lower() == "auto":
            source = "hako"
        cache_key = f"novel:chapter:{source}:{slug}:{chapter_no}:{as_html}"
        cached = self.get_cache(cache_key)
        if cached is not None:
            return cached

        primary_conn = self._get_novel_connector(source)
        connectors_to_try = [primary_conn]
        for s in self.novel_connectors:
            if not is_source_enabled(s):
                continue
            if s == "gutendex" and source != "gutendex" and not slug.startswith("gutenberg-"):
                continue
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
        connector = self.novel_connectors.get(source_lower)
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
