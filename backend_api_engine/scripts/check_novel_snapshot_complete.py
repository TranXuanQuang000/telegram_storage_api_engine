"""Validate whether every requested source finished a clean snapshot round."""

import argparse
import gzip
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument(
        "--sources",
        default="hako,truyenfull,metruyenchu,tangthuvien,wikidich,gutendex",
    )
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="Accept a valid progressive snapshot as soon as it contains catalog items",
    )
    parser.add_argument("--min-items", type=int, default=1)
    args = parser.parse_args()
    sources = [item.strip() for item in args.sources.split(",") if item.strip()]

    if not args.snapshot.is_file():
        print(json.dumps({"complete": False, "reason": "snapshot_missing"}))
        return 2

    with gzip.open(args.snapshot, "rt", encoding="utf-8") as handle:
        payload = json.load(handle)

    summary = {}
    complete = True
    for source in sources:
        data = payload.get("sources", {}).get(source, {})
        entry = {
            "items": len(data.get("items", [])),
            "pages": int(data.get("pages_crawled") or 0),
            "completed": bool(data.get("completed")),
            "pending_hydration": len(data.get("pending_hydration") or {}),
            "last_error": data.get("last_error"),
        }
        entry["ready"] = (
            entry["completed"]
            and entry["pending_hydration"] == 0
            and not entry["last_error"]
        )
        summary[source] = entry
        complete = complete and entry["ready"]

    total_items = sum(entry["items"] for entry in summary.values())
    usable = total_items >= max(1, args.min_items)
    print(
        json.dumps(
            {
                "complete": complete,
                "usable": usable,
                "total_items": total_items,
                "sources": summary,
            },
            ensure_ascii=False,
        )
    )
    return 0 if complete or (args.allow_partial and usable) else 2


if __name__ == "__main__":
    raise SystemExit(main())
