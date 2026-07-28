import gzip
import json
import math
import os
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.story import CatalogFetchResult, Story


SNAPSHOT_SCHEMA_VERSION = 1
MAX_SNAPSHOT_BYTES = 128 * 1024 * 1024


def _identity_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().casefold())


def _novel_hot_score(story: Story) -> float:
    raw_metadata = story.raw_metadata if isinstance(story.raw_metadata, dict) else {}
    chapter_count = max(
        len(story.chapters),
        int(raw_metadata.get("chapter_count") or 0),
    )
    metadata_score = sum(
        (
            9 if story.cover_url else 0,
            5 if story.description else 0,
            3 if story.author else 0,
            min(6, len(story.genres) * 1.5),
        )
    )
    status_score = 3 if story.status.value == "ongoing" else 1
    try:
        freshness = datetime.fromisoformat(
            (story.updated_at or "").replace("Z", "+00:00")
        ).timestamp() / 100_000_000
    except (TypeError, ValueError):
        freshness = 0
    return (
        math.log1p(chapter_count) * 18
        + metadata_score
        + status_score
        + freshness
    )


def _configured_snapshot_path() -> Path:
    raw_path = os.getenv(
        "NOVEL_CATALOG_SNAPSHOT_PATH",
        "data/novel_catalog.snapshot.json.gz",
    ).strip()
    return Path(raw_path).expanduser().resolve()


class NovelCatalogSnapshot:
    """Read-only, deployment-friendly catalog snapshot.

    The snapshot stores public metadata and chapter manifests only. Chapter
    bodies and comic images remain on-demand and are never bundled here.
    """

    def __init__(self, path: Optional[Path] = None):
        self.path = path or _configured_snapshot_path()
        self._lock = threading.Lock()
        self._mtime_ns: Optional[int] = None
        self._sources: Dict[str, List[Story]] = {}
        self._auto_items: List[Story] = []
        self._metadata: Dict[str, Any] = {}

    def _read_payload(self) -> Dict[str, Any]:
        if self.path.stat().st_size > MAX_SNAPSHOT_BYTES:
            raise ValueError("Novel catalog snapshot exceeds the safe size limit")
        opener = gzip.open if self.path.suffix.lower() == ".gz" else open
        with opener(self.path, "rt", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise ValueError("Novel catalog snapshot root must be an object")
        if payload.get("schema_version") != SNAPSHOT_SCHEMA_VERSION:
            raise ValueError("Unsupported novel catalog snapshot schema")
        return payload

    @staticmethod
    def _build_auto_items(
        source_ids: List[str],
        sources: Dict[str, List[Story]],
    ) -> List[Story]:
        result: List[Story] = []
        seen = set()
        max_rows = max((len(sources.get(source_id, [])) for source_id in source_ids), default=0)
        for row in range(max_rows):
            for source_id in source_ids:
                items = sources.get(source_id, [])
                if row >= len(items):
                    continue
                story = items[row]
                identity = (
                    _identity_text(story.title),
                    _identity_text(story.author),
                )
                if identity != ("", "") and identity in seen:
                    continue
                seen.add(identity)
                result.append(story)
        return result

    def _reload_if_needed(self) -> bool:
        if not self.path.is_file():
            return False
        stat = self.path.stat()
        if self._mtime_ns == stat.st_mtime_ns:
            return bool(self._sources)
        with self._lock:
            stat = self.path.stat()
            if self._mtime_ns == stat.st_mtime_ns:
                return bool(self._sources)
            payload = self._read_payload()
            source_payload = payload.get("sources")
            if not isinstance(source_payload, dict):
                raise ValueError("Novel catalog snapshot sources must be an object")

            parsed_sources: Dict[str, List[Story]] = {}
            for source_id, source_data in source_payload.items():
                if not isinstance(source_id, str) or not isinstance(source_data, dict):
                    continue
                raw_items = source_data.get("items")
                if not isinstance(raw_items, list):
                    continue
                stories: List[Story] = []
                for raw_item in raw_items:
                    try:
                        story = Story.model_validate(raw_item)
                    except Exception:
                        continue
                    if story.source_id != source_id:
                        continue
                    stories.append(story)
                parsed_sources[source_id] = stories

            source_order = payload.get("source_order")
            ordered_sources = (
                [item for item in source_order if isinstance(item, str)]
                if isinstance(source_order, list)
                else list(parsed_sources)
            )
            self._sources = parsed_sources
            self._auto_items = self._build_auto_items(ordered_sources, parsed_sources)
            self._metadata = {
                "generated_at": payload.get("generated_at"),
                "source_order": ordered_sources,
                "total_items": len(self._auto_items),
                "source_counts": {
                    source_id: len(items)
                    for source_id, items in parsed_sources.items()
                },
                "source_progress": {
                    source_id: {
                        "completed": bool(source_data.get("completed")),
                        "next_page": int(source_data.get("next_page") or 1),
                        "pages_crawled": int(source_data.get("pages_crawled") or 0),
                        "pending_hydration": len(source_data.get("pending_hydration") or {}),
                        "last_error": source_data.get("last_error"),
                        "completion_reason": source_data.get("completion_reason"),
                    }
                    for source_id, source_data in source_payload.items()
                    if isinstance(source_id, str) and isinstance(source_data, dict)
                },
            }
            self._mtime_ns = stat.st_mtime_ns
            return bool(self._sources)

    def get_catalog(
        self,
        source: str,
        page: int,
        limit: int,
        query: str = "",
        genre: str = "",
        sort: str = "updated",
    ) -> Optional[CatalogFetchResult]:
        enabled = os.getenv("NOVEL_CATALOG_SNAPSHOT_ENABLED", "true")
        if enabled.strip().lower() not in {"1", "true", "yes", "on"}:
            return None
        try:
            if not self._reload_if_needed():
                return None
        except (OSError, ValueError, json.JSONDecodeError):
            return None

        normalized_source = source.strip().lower()
        if normalized_source == "auto":
            items = self._auto_items
        else:
            items = self._sources.get(normalized_source)
            if items is None:
                return None

        normalized_query = _identity_text(query)
        normalized_genre = _identity_text(genre)
        if normalized_query or normalized_genre:
            items = [
                story
                for story in items
                if (
                    not normalized_query
                    or normalized_query
                    in _identity_text(
                        " ".join(
                            filter(
                                None,
                                [story.title, story.author, story.description],
                            )
                        )
                    )
                )
                and (
                    not normalized_genre
                    or any(_identity_text(item) == normalized_genre for item in story.genres)
                )
            ]
        if sort == "title":
            items = sorted(items, key=lambda story: _identity_text(story.title))
        elif sort == "hot":
            items = sorted(
                items,
                key=lambda story: (
                    -_novel_hot_score(story),
                    _identity_text(story.title),
                    story.external_id,
                ),
            )
        elif sort == "updated":
            def updated_key(story: Story):
                try:
                    return datetime.fromisoformat((story.updated_at or "").replace("Z", "+00:00")).timestamp()
                except (TypeError, ValueError):
                    return 0

            items = sorted(items, key=updated_key, reverse=True)

        safe_page = max(1, page)
        safe_limit = max(1, limit)
        start = (safe_page - 1) * safe_limit
        end = start + safe_limit
        return CatalogFetchResult(
            stories=items[start:end],
            total=len(items),
            page=safe_page,
            limit=safe_limit,
            has_more=end < len(items),
            raw_metadata={
                "mode": "deployment_snapshot",
                **self._metadata,
            },
        )

    def status(self) -> Dict[str, Any]:
        enabled = os.getenv("NOVEL_CATALOG_SNAPSHOT_ENABLED", "true")
        is_enabled = enabled.strip().lower() in {"1", "true", "yes", "on"}
        available = False
        if is_enabled:
            try:
                available = self._reload_if_needed()
            except (OSError, ValueError, json.JSONDecodeError):
                available = False
        return {
            "enabled": is_enabled,
            "available": available,
            **self._metadata,
        }


_snapshot = NovelCatalogSnapshot()


def get_catalog_snapshot(
    source: str,
    page: int,
    limit: int,
    query: str = "",
    genre: str = "",
    sort: str = "updated",
) -> Optional[CatalogFetchResult]:
    return _snapshot.get_catalog(
        source=source,
        page=page,
        limit=limit,
        query=query,
        genre=genre,
        sort=sort,
    )


def get_catalog_snapshot_status() -> Dict[str, Any]:
    return _snapshot.status()
