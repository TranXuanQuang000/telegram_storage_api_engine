"""Compact a novel deployment snapshot for memory-constrained API instances.

The deployment catalog only needs story metadata. Chapter manifests are resolved
from the source connector when a reader opens a story, so keeping hundreds of
thousands of chapter headers in the process-wide snapshot wastes substantial RAM.
"""

import argparse
import gzip
import json
import os
from pathlib import Path
from typing import Any, Dict


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "snapshot",
        nargs="?",
        type=Path,
        default=PROJECT_ROOT / "data" / "novel_catalog.snapshot.json.gz",
    )
    return parser.parse_args()


def load_snapshot(path: Path) -> Dict[str, Any]:
    opener = gzip.open if path.suffix.lower() == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def compact_snapshot(payload: Dict[str, Any]) -> Dict[str, int]:
    total_items = 0
    removed_chapters = 0
    for source_data in payload.get("sources", {}).values():
        if not isinstance(source_data, dict):
            continue
        items = source_data.get("items", [])
        if not isinstance(items, list):
            continue
        source_data["pending_hydration"] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            total_items += 1
            chapters = item.get("chapters")
            raw_metadata = item.get("raw_metadata")
            known_chapter_count = (
                raw_metadata.get("chapter_count", 0)
                if isinstance(raw_metadata, dict)
                else 0
            )
            if isinstance(chapters, list):
                removed_chapters += len(chapters)
                known_chapter_count = max(known_chapter_count, len(chapters))
            item["chapters"] = []
            item["raw_metadata"] = {
                "chapter_count": max(0, int(known_chapter_count or 0)),
            }
    return {"total_items": total_items, "removed_chapters": removed_chapters}


def save_snapshot(path: Path, payload: Dict[str, Any]) -> None:
    temporary = path.with_name(f"{path.name}.tmp")
    if path.suffix.lower() == ".gz":
        with gzip.open(temporary, "wt", encoding="utf-8", compresslevel=6) as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    else:
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(temporary, path)


def main() -> None:
    args = parse_args()
    payload = load_snapshot(args.snapshot)
    stats = compact_snapshot(payload)
    save_snapshot(args.snapshot, payload)
    print(
        "Compacted novel snapshot: "
        f"{stats['total_items']} items, {stats['removed_chapters']} chapter headers removed"
    )


if __name__ == "__main__":
    main()
