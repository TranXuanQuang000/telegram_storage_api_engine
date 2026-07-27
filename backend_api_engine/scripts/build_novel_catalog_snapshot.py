"""Build a resumable deployment snapshot of public novel metadata.

This job intentionally stores catalog metadata and chapter manifests only.
Chapter bodies are fetched on demand by the API. Project Gutenberg full text
may be cached separately because it is public domain.
"""

import argparse
import asyncio
import gzip
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

from app.models.story import Story  # noqa: E402
from app.services.aggregator import AggregatorService  # noqa: E402
from app.services.catalog_snapshot import SNAPSHOT_SCHEMA_VERSION  # noqa: E402


DEFAULT_SOURCES = (
    "hako",
    "truyenfull",
    "metruyenchu",
    "tangthuvien",
    "wikidich",
    "gutendex",
)
ALLOWED_SOURCES = frozenset(DEFAULT_SOURCES)


def parse_sources(value: str) -> List[str]:
    sources = list(dict.fromkeys(item.strip().lower() for item in value.split(",") if item.strip()))
    unknown = [source for source in sources if source not in ALLOWED_SOURCES]
    if unknown:
        raise argparse.ArgumentTypeError(f"Unsupported snapshot sources: {', '.join(unknown)}")
    if not sources:
        raise argparse.ArgumentTypeError("At least one source is required")
    return sources


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sources",
        type=parse_sources,
        default=list(DEFAULT_SOURCES),
        help="Comma-separated metadata sources",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data" / "novel_catalog.snapshot.json.gz",
    )
    parser.add_argument("--fresh", action="store_true", help="Discard the previous checkpoint")
    parser.add_argument(
        "--max-pages-per-source",
        type=int,
        default=int(os.getenv("NOVEL_SYNC_MAX_PAGES_PER_SOURCE", "10000")),
    )
    parser.add_argument(
        "--max-new-pages-per-source",
        type=int,
        default=int(os.getenv("NOVEL_SYNC_MAX_NEW_PAGES_PER_SOURCE", "0")),
        help="Stop each source after this many new pages in one run; 0 means unlimited",
    )
    parser.add_argument(
        "--refresh-completed",
        action="store_true",
        help="Start a new catalog round for sources that completed an earlier round",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=20,
        choices=range(1, 21),
        metavar="[1-20]",
    )
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=int(os.getenv("NOVEL_SYNC_DELAY_MS", "750")),
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=int(os.getenv("NOVEL_SYNC_RETRIES", "3")),
    )
    parser.add_argument(
        "--checkpoint-every",
        type=int,
        default=1,
        help="Persist after this many successful pages",
    )
    parser.add_argument(
        "--catalog-only",
        action="store_true",
        help="Skip story detail hydration and chapter-manifest collection",
    )
    parser.add_argument(
        "--detail-concurrency",
        type=int,
        default=int(os.getenv("NOVEL_SYNC_DETAIL_CONCURRENCY", "3")),
        help="Maximum concurrent story-detail requests",
    )
    parser.add_argument(
        "--detail-delay-ms",
        type=int,
        default=int(os.getenv("NOVEL_SYNC_DETAIL_DELAY_MS", "250")),
        help="Per-worker delay after each story-detail request",
    )
    args = parser.parse_args()
    if args.max_pages_per_source < 1:
        parser.error("--max-pages-per-source must be positive")
    if args.max_new_pages_per_source < 0:
        parser.error("--max-new-pages-per-source cannot be negative")
    if not 0 <= args.delay_ms <= 60_000:
        parser.error("--delay-ms must be between 0 and 60000")
    if not 0 <= args.retries <= 8:
        parser.error("--retries must be between 0 and 8")
    if args.checkpoint_every < 1:
        parser.error("--checkpoint-every must be positive")
    if not 1 <= args.detail_concurrency <= 8:
        parser.error("--detail-concurrency must be between 1 and 8")
    if not 0 <= args.detail_delay_ms <= 60_000:
        parser.error("--detail-delay-ms must be between 0 and 60000")
    return args


def empty_payload(source_order: Iterable[str]) -> Dict[str, Any]:
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "generated_at": None,
        "source_order": list(source_order),
        "sources": {},
    }


def load_payload(path: Path, source_order: List[str], fresh: bool) -> Dict[str, Any]:
    if fresh or not path.is_file():
        return empty_payload(source_order)
    opener = gzip.open if path.suffix.lower() == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        payload = json.load(handle)
    if payload.get("schema_version") != SNAPSHOT_SCHEMA_VERSION:
        raise ValueError("Existing snapshot uses an unsupported schema")
    existing_order = payload.get("source_order")
    ordered_existing = (
        [item for item in existing_order if isinstance(item, str)]
        if isinstance(existing_order, list)
        else []
    )
    payload["source_order"] = list(dict.fromkeys([*ordered_existing, *source_order]))
    payload.setdefault("sources", {})
    return payload


def save_payload(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    temporary = path.with_name(f"{path.name}.tmp")
    if path.suffix.lower() == ".gz":
        with gzip.open(temporary, "wt", encoding="utf-8", compresslevel=6) as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    else:
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(temporary, path)


def page_fingerprint(items: List[Dict[str, Any]]) -> str:
    return "|".join(
        f"{item.get('source_id', '')}:{item.get('external_id', '')}"
        for item in items
    )


async def fetch_page(connector, page: int, page_size: int, retries: int):
    failure: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return await connector.fetch_catalog(page=page, limit=page_size)
        except Exception as error:
            failure = error
            if attempt < retries:
                backoff = min(30.0, 0.75 * (2**attempt))
                await asyncio.sleep(backoff + random.uniform(0.15, 0.75))
    assert failure is not None
    raise failure


async def hydrate_stories(
    connector,
    stories,
    *,
    concurrency: int,
    delay_ms: int,
) -> Tuple[List[Any], Dict[str, str]]:
    semaphore = asyncio.Semaphore(concurrency)

    async def hydrate(story):
        async with semaphore:
            try:
                detail = await connector.fetch_story(story.external_id)
                merged = detail.model_copy(
                    update={
                        "external_id": story.external_id,
                        "external_url": detail.external_url or story.external_url,
                        "title": detail.title or story.title,
                        "slug": detail.slug or story.slug,
                        "author": detail.author or story.author,
                        "description": detail.description or story.description,
                        "cover_url": detail.cover_url or story.cover_url,
                        "genres": detail.genres or story.genres,
                        "raw_metadata": {
                            **story.raw_metadata,
                            **detail.raw_metadata,
                            "snapshot_hydrated": True,
                        },
                    }
                )
                return merged, None
            except Exception as error:
                return story, str(error)[:500]
            finally:
                if delay_ms:
                    delay = delay_ms / 1000
                    await asyncio.sleep(delay + random.uniform(0, delay * 0.35))

    hydrated = await asyncio.gather(*(hydrate(story) for story in stories))
    failures = {
        story.external_id: error
        for story, (_result, error) in zip(stories, hydrated)
        if error
    }
    return [result for result, _error in hydrated], failures


async def sync_source(
    service: AggregatorService,
    payload: Dict[str, Any],
    source_id: str,
    *,
    page_size: int,
    max_pages: int,
    max_new_pages: int,
    delay_ms: int,
    retries: int,
    checkpoint_every: int,
    hydrate_details: bool,
    detail_concurrency: int,
    detail_delay_ms: int,
    output: Path,
    refresh_completed: bool,
) -> Dict[str, Any]:
    connector = service.novel_connectors[source_id]
    source_data = payload["sources"].setdefault(
        source_id,
        {
            "items": [],
            "next_page": 1,
            "completed": False,
            "last_error": None,
            "pages_crawled": 0,
            "pending_hydration": {},
        },
    )
    items_by_id = {
        str(item.get("external_id")): item
        for item in source_data.get("items", [])
        if isinstance(item, dict) and item.get("external_id")
    }
    pending_hydration = source_data.get("pending_hydration")
    if not isinstance(pending_hydration, dict):
        pending_hydration = {}
    if hydrate_details and pending_hydration:
        retry_items = []
        for external_id in list(pending_hydration):
            raw_item = items_by_id.get(external_id)
            if not raw_item:
                pending_hydration.pop(external_id, None)
                continue
            retry_items.append(Story.model_validate(raw_item))
        if retry_items:
            hydrated, failures = await hydrate_stories(
                connector,
                retry_items,
                concurrency=detail_concurrency,
                delay_ms=detail_delay_ms,
            )
            for story in hydrated:
                items_by_id[story.external_id] = story.model_dump(mode="json")
            pending_hydration = failures
            source_data["items"] = list(items_by_id.values())
            source_data["pending_hydration"] = pending_hydration
            save_payload(output, payload)
    if source_data.get("completed") and refresh_completed:
        source_data["completed"] = False
        source_data["next_page"] = 1
        source_data["last_fingerprint"] = ""
        source_data["completion_reason"] = "refresh_round_started"
        save_payload(output, payload)
    if source_data.get("completed"):
        return source_data

    next_page = max(1, int(source_data.get("next_page") or 1))
    last_fingerprint = str(source_data.get("last_fingerprint") or "")
    pages_since_checkpoint = 0
    pages_this_run = 0

    while next_page <= max_pages:
        if max_new_pages and pages_this_run >= max_new_pages:
            source_data["completion_reason"] = "scheduled_batch_limit"
            break
        try:
            result = await fetch_page(connector, next_page, page_size, retries)
        except Exception as error:
            source_data["last_error"] = str(error)[:500]
            source_data["next_page"] = next_page
            save_payload(output, payload)
            return source_data

        source_stories = [
            story
            for story in result.stories
            if story.source_id == source_id and story.external_id
        ]
        if hydrate_details and source_stories:
            source_stories, hydration_failures = await hydrate_stories(
                connector,
                source_stories,
                concurrency=detail_concurrency,
                delay_ms=detail_delay_ms,
            )
            for external_id, error in hydration_failures.items():
                pending_hydration[external_id] = error
            for story in source_stories:
                if story.raw_metadata.get("snapshot_hydrated"):
                    pending_hydration.pop(story.external_id, None)
        serialized = [story.model_dump(mode="json") for story in source_stories]
        fingerprint = page_fingerprint(serialized)
        repeated_page = bool(serialized) and fingerprint == last_fingerprint
        if repeated_page:
            source_data["completed"] = True
            source_data["completion_reason"] = "repeated_page_guard"
            break
        if not serialized:
            source_data["completed"] = True
            source_data["completion_reason"] = "empty_page"
            break

        for item in serialized:
            items_by_id[str(item["external_id"])] = item
        source_data["items"] = list(items_by_id.values())
        source_data["pages_crawled"] = int(source_data.get("pages_crawled") or 0) + 1
        pages_this_run += 1
        source_data["last_fingerprint"] = fingerprint
        source_data["last_error"] = None
        source_data["pending_hydration"] = pending_hydration
        last_fingerprint = fingerprint
        next_page += 1
        source_data["next_page"] = next_page
        pages_since_checkpoint += 1

        if not result.has_more:
            source_data["completed"] = True
            source_data["completion_reason"] = "source_has_no_more_pages"
            source_data["rounds_completed"] = int(source_data.get("rounds_completed") or 0) + 1
        if pages_since_checkpoint >= checkpoint_every or source_data["completed"]:
            save_payload(output, payload)
            pages_since_checkpoint = 0
        if source_data["completed"]:
            break
        if delay_ms:
            delay = delay_ms / 1000
            await asyncio.sleep(delay + random.uniform(0, delay * 0.35))

    if next_page > max_pages and not source_data.get("completed"):
        source_data["completion_reason"] = "max_pages_guard"
    save_payload(output, payload)
    return source_data


async def main() -> int:
    args = parse_args()
    payload = load_payload(args.output.resolve(), args.sources, args.fresh)
    service = AggregatorService()
    try:
        for source_id in args.sources:
            await sync_source(
                service,
                payload,
                source_id,
                page_size=args.page_size,
                max_pages=args.max_pages_per_source,
                max_new_pages=args.max_new_pages_per_source,
                delay_ms=args.delay_ms,
                retries=args.retries,
                checkpoint_every=args.checkpoint_every,
                hydrate_details=not args.catalog_only,
                detail_concurrency=args.detail_concurrency,
                detail_delay_ms=args.detail_delay_ms,
                output=args.output.resolve(),
                refresh_completed=args.refresh_completed,
            )
    finally:
        await service.close()

    summary = {
        source_id: {
            "items": len(payload["sources"].get(source_id, {}).get("items", [])),
            "pages_crawled": payload["sources"].get(source_id, {}).get("pages_crawled", 0),
            "completed": payload["sources"].get(source_id, {}).get("completed", False),
            "next_page": payload["sources"].get(source_id, {}).get("next_page", 1),
            "last_error": payload["sources"].get(source_id, {}).get("last_error"),
            "pending_hydration": len(
                payload["sources"].get(source_id, {}).get("pending_hydration", {})
            ),
            "completion_reason": payload["sources"].get(source_id, {}).get(
                "completion_reason"
            ),
        }
        for source_id in args.sources
    }
    print(json.dumps({"output": str(args.output.resolve()), "sources": summary}, ensure_ascii=False))
    return (
        0
        if all(
            not item["last_error"] and item["pending_hydration"] == 0
            for item in summary.values()
        )
        else 2
    )


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
