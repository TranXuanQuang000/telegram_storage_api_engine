import httpx
import pytest

from app.config.sources import SOURCE_SPECS, enabled_source_ids
from app.main import app


def test_registry_declares_exactly_the_ten_supported_sources():
    assert set(SOURCE_SPECS) == {
        "otruyen",
        "mangadex",
        "cuutruyen",
        "nettruyen",
        "blogtruyen",
        "hako",
        "truyenfull",
        "tangthuvien",
        "metruyenchu",
        "wikidich",
    }


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
    assert len(items) == 10
    assert {item["medium"] for item in items} == {"comic", "novel"}
    assert all("base_url" in item and "enabled" in item for item in items)
