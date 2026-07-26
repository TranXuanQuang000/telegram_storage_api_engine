import httpx
import pytest

from app.config.sources import SOURCE_SPECS, enabled_source_ids
from app.models.story import StoryMedium
from app.main import app


def test_registry_declares_ten_ranked_sources_per_medium():
    comics = [
        spec for spec in SOURCE_SPECS.values() if spec.medium == StoryMedium.COMIC
    ]
    novels = [
        spec for spec in SOURCE_SPECS.values() if spec.medium == StoryMedium.NOVEL
    ]
    assert len(comics) == 10
    assert len(novels) == 10
    assert all(1 <= spec.stability_score <= 5 for spec in SOURCE_SPECS.values())
    assert all(spec.capabilities for spec in SOURCE_SPECS.values())


def test_enabled_sources_are_explicitly_configurable(monkeypatch):
    monkeypatch.setenv("ENABLED_SOURCES", "otruyen,mangadex,wikidich,unknown")
    assert enabled_source_ids() == frozenset({"otruyen", "mangadex", "wikidich"})


@pytest.mark.asyncio
async def test_sources_endpoint_exposes_capabilities_without_secrets():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/v1/api/sources")
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 20
    assert {item["medium"] for item in items} == {"comic", "novel"}
    assert all("base_url" in item and "enabled" in item for item in items)
    assert all("capabilities" in item and "access" in item for item in items)
    assert {item["selection_mode"] for item in items} >= {
        "adaptive",
        "metadata",
        "fail_closed",
        "frontend",
    }


def test_wildcard_never_enables_metadata_or_fail_closed_sources(monkeypatch):
    monkeypatch.setenv("ENABLED_SOURCES", "*")
    enabled = enabled_source_ids()
    assert "anilist" not in enabled
    assert "nettruyen" not in enabled
    assert "wikisourcevi" not in enabled
    assert {"otruyen", "mangadex", "gutendex"} <= enabled
