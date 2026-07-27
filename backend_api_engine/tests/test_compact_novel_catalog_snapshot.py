import importlib.util
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "compact_novel_catalog_snapshot.py"
)
SPEC = importlib.util.spec_from_file_location("compact_novel_catalog_snapshot", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def test_compact_snapshot_removes_chapter_manifests_and_pending_hydration():
    payload = {
        "sources": {
            "truyenfull": {
                "items": [
                    {
                        "title": "Example",
                        "chapters": [{"external_id": "chapter-1"}],
                        "raw_metadata": {"snapshot_hydrated": True, "large": "value"},
                    }
                ],
                "pending_hydration": {"story-1": "retry"},
            }
        }
    }

    stats = MODULE.compact_snapshot(payload)

    assert stats == {"total_items": 1, "removed_chapters": 1}
    item = payload["sources"]["truyenfull"]["items"][0]
    assert item["chapters"] == []
    assert item["raw_metadata"] == {}
    assert payload["sources"]["truyenfull"]["pending_hydration"] == {}
