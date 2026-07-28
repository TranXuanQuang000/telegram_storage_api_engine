import gzip
import json

from app.models.story import ContentRating, StoryMedium, StoryStatus
from app.services.catalog_snapshot import NovelCatalogSnapshot, SNAPSHOT_SCHEMA_VERSION


def story(source_id: str, external_id: str, title: str, author: str = "Author"):
    return {
        "source_id": source_id,
        "external_id": external_id,
        "external_url": f"https://example.test/{source_id}/{external_id}",
        "title": title,
        "slug": external_id,
        "author": author,
        "description": None,
        "cover_url": None,
        "genres": [],
        "status": StoryStatus.UNKNOWN.value,
        "medium": StoryMedium.NOVEL.value,
        "content_rating": ContentRating.SAFE.value,
        "updated_at": None,
        "chapters": [],
        "raw_metadata": {},
    }


def test_snapshot_paginates_source_catalog(tmp_path):
    path = tmp_path / "catalog.json.gz"
    payload = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "generated_at": "2026-07-27T00:00:00Z",
        "source_order": ["hako"],
        "sources": {
            "hako": {
                "completed": False,
                "next_page": 4,
                "pages_crawled": 3,
                "pending_hydration": {"b": "retry later"},
                "last_error": None,
                "items": [
                    story("hako", "a", "A"),
                    story("hako", "b", "B"),
                    story("hako", "c", "C"),
                ]
            }
        },
    }
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(payload, handle)

    snapshot = NovelCatalogSnapshot(path)
    page = snapshot.get_catalog(source="hako", page=2, limit=2)

    assert page is not None
    assert [item.external_id for item in page.stories] == ["c"]
    assert page.total == 3
    assert page.has_more is False
    assert page.raw_metadata["mode"] == "deployment_snapshot"
    status = snapshot.status()
    assert status["total_items"] == 3
    assert status["source_counts"] == {"hako": 3}
    assert status["source_progress"]["hako"] == {
        "completed": False,
        "next_page": 4,
        "pages_crawled": 3,
        "pending_hydration": 1,
        "last_error": None,
        "completion_reason": None,
    }


def test_snapshot_auto_catalog_round_robins_and_deduplicates(tmp_path):
    path = tmp_path / "catalog.json"
    payload = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "generated_at": "2026-07-27T00:00:00Z",
        "source_order": ["hako", "truyenfull"],
        "sources": {
            "hako": {
                "items": [
                    story("hako", "h1", "Shared"),
                    story("hako", "h2", "Hako only"),
                ]
            },
            "truyenfull": {
                "items": [
                    story("truyenfull", "t1", "Shared"),
                    story("truyenfull", "t2", "TruyenFull only"),
                ]
            },
        },
    }
    path.write_text(json.dumps(payload), encoding="utf-8")

    snapshot = NovelCatalogSnapshot(path)
    catalog = snapshot.get_catalog(source="auto", page=1, limit=10)

    assert catalog is not None
    assert [(item.source_id, item.external_id) for item in catalog.stories] == [
        ("hako", "h1"),
        ("hako", "h2"),
        ("truyenfull", "t2"),
    ]
    assert catalog.total == 3


def test_snapshot_filters_full_catalog_before_paginating(tmp_path):
    path = tmp_path / "catalog.json"
    first = story("truyenfull", "t1", "Kiếm Thần", "Tác giả A")
    first["genres"] = ["Tiên Hiệp"]
    second = story("truyenfull", "t2", "Đô Thị Chi Vương", "Tác giả B")
    second["genres"] = ["Đô Thị"]
    payload = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "generated_at": "2026-07-27T00:00:00Z",
        "source_order": ["truyenfull"],
        "sources": {"truyenfull": {"items": [second, first]}},
    }
    path.write_text(json.dumps(payload), encoding="utf-8")

    snapshot = NovelCatalogSnapshot(path)
    catalog = snapshot.get_catalog(
        source="auto",
        page=1,
        limit=1,
        query="kiếm",
        genre="tiên hiệp",
        sort="title",
    )

    assert catalog is not None
    assert [item.external_id for item in catalog.stories] == ["t1"]
    assert catalog.total == 1


def test_snapshot_hot_sort_prefers_chapter_depth_and_complete_metadata(tmp_path):
    path = tmp_path / "catalog.json"
    deep = story("truyenfull", "deep", "Popular serial")
    deep["cover_url"] = "https://example.test/deep.jpg"
    deep["description"] = "A complete catalog record"
    deep["genres"] = ["Fantasy", "Adventure"]
    deep["raw_metadata"] = {"chapter_count": 420}
    shallow = story("truyenfull", "shallow", "Tiny serial")
    shallow["updated_at"] = "2026-07-28T00:00:00Z"
    shallow["raw_metadata"] = {"chapter_count": 2}
    payload = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "generated_at": "2026-07-28T00:00:00Z",
        "source_order": ["truyenfull"],
        "sources": {"truyenfull": {"items": [shallow, deep]}},
    }
    path.write_text(json.dumps(payload), encoding="utf-8")

    snapshot = NovelCatalogSnapshot(path)
    catalog = snapshot.get_catalog(source="auto", page=1, limit=10, sort="hot")

    assert catalog is not None
    assert [item.external_id for item in catalog.stories] == ["deep", "shallow"]


def test_invalid_snapshot_is_ignored(tmp_path):
    path = tmp_path / "invalid.json"
    path.write_text('{"schema_version":999,"sources":{}}', encoding="utf-8")

    snapshot = NovelCatalogSnapshot(path)
    assert snapshot.get_catalog("auto", 1, 20) is None
    assert snapshot.status()["available"] is False
