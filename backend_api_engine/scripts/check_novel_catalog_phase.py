"""Check the catalog barrier before novel detail/chapter hydration starts."""

import argparse
import gzip
import json
from pathlib import Path


DEFAULT_SOURCES = (
    "hako,truyenfull,metruyenchu,tangthuvien,wikidich,gutendex"
)


def inspect_catalog_phase(snapshot: Path, sources: list[str]) -> dict:
    if not snapshot.is_file():
        return {
            "complete": False,
            "reason": "snapshot_missing",
            "sources": {},
        }
    opener = gzip.open if snapshot.suffix.lower() == ".gz" else open
    with opener(snapshot, "rt", encoding="utf-8") as handle:
        payload = json.load(handle)

    summary = {}
    complete = True
    for source_id in sources:
        data = payload.get("sources", {}).get(source_id, {})
        entry = {
            "items": len(data.get("items", [])),
            "pages": int(data.get("pages_crawled") or 0),
            "next_page": int(data.get("next_page") or 1),
            "completed": bool(data.get("completed")),
            "last_error": data.get("last_error"),
        }
        entry["ready"] = (
            entry["completed"]
            and entry["items"] > 0
            and not entry["last_error"]
        )
        summary[source_id] = entry
        complete = complete and entry["ready"]
    return {"complete": complete, "sources": summary}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--sources", default=DEFAULT_SOURCES)
    args = parser.parse_args()
    sources = [
        item.strip().lower()
        for item in args.sources.split(",")
        if item.strip()
    ]
    result = inspect_catalog_phase(args.snapshot, sources)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["complete"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
