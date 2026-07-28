import gzip
import importlib.util
import json
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def load_script(name: str):
    path = SCRIPTS / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


BUILD = load_script("build_novel_catalog_snapshot")
CHECK = load_script("check_novel_catalog_phase")


def test_catalog_phase_requires_every_requested_source():
    payload = {
        "sources": {
            "hako": {
                "completed": True,
                "last_error": None,
                "items": [{"external_id": "one"}],
            },
            "truyenfull": {"completed": False, "last_error": None},
        }
    }

    assert BUILD.catalog_phase_complete(payload, ["hako"]) is True
    assert BUILD.catalog_phase_complete(payload, ["hako", "truyenfull"]) is False


def test_catalog_phase_rejects_completed_source_with_error():
    payload = {
        "sources": {
            "hako": {
                "completed": True,
                "last_error": "blocked",
                "items": [{"external_id": "one"}],
            },
        }
    }

    assert BUILD.catalog_phase_complete(payload, ["hako"]) is False


def test_catalog_phase_checker_ignores_pending_hydration(tmp_path):
    snapshot = tmp_path / "catalog.json.gz"
    payload = {
        "sources": {
            "hako": {
                "items": [{"external_id": "one"}],
                "pages_crawled": 3,
                "next_page": 4,
                "completed": True,
                "last_error": None,
                "pending_hydration": {"one": "retry"},
            }
        }
    }
    with gzip.open(snapshot, "wt", encoding="utf-8") as handle:
        json.dump(payload, handle)

    result = CHECK.inspect_catalog_phase(snapshot, ["hako"])

    assert result["complete"] is True
    assert result["sources"]["hako"]["ready"] is True
