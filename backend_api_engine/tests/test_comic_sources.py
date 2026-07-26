import json
from pathlib import Path

import httpx
import pytest

from app.connectors.comic.mangadex import MangaDexConnector
from app.connectors.comic.xkcd import XkcdConnector
from app.connectors.comic.registry import (
    COMIC_SOURCE_POLICIES,
    SourceUnavailableError,
    create_comic_connector,
    create_direct_public_comic_connectors,
)
from app.models.story import ContentRating, StoryMedium, StoryStatus


FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def mangadex_payloads():
    catalog = load_fixture("mangadex_catalog.json")
    return {
        "catalog": catalog,
        "story": {"result": "ok", "data": catalog["data"][0]},
        "feed": load_fixture("mangadex_feed.json"),
        "at_home": load_fixture("mangadex_at_home.json"),
    }


@pytest.mark.asyncio
async def test_mangadex_public_api_connector_uses_safe_fixture_contract(mangadex_payloads):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.mangadex.org"
        path = request.url.path
        if path == "/ping":
            return httpx.Response(200, text="pong")
        if path == "/manga":
            return httpx.Response(200, json=mangadex_payloads["catalog"])
        if path == "/manga/manga-safe-1":
            return httpx.Response(200, json=mangadex_payloads["story"])
        if path == "/manga/manga-safe-1/feed":
            assert request.url.params.get_list("translatedLanguage[]") == ["vi"]
            return httpx.Response(200, json=mangadex_payloads["feed"])
        if path == "/at-home/server/chapter-safe-1":
            return httpx.Response(200, json=mangadex_payloads["at_home"])
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector = MangaDexConnector(client=client)

    assert await connector.health_check() is True
    catalog = await connector.fetch_catalog(page=1, limit=20)
    assert catalog.total == 1
    assert catalog.stories[0].title == "Thợ Săn An Toàn"
    assert catalog.stories[0].medium == StoryMedium.COMIC
    assert catalog.stories[0].status == StoryStatus.ONGOING
    assert catalog.stories[0].content_rating == ContentRating.SAFE
    assert catalog.stories[0].cover_url.endswith("/manga-safe-1/cover-safe.jpg")

    story = await connector.fetch_story("manga-safe-1")
    assert story.author == "Tác Giả"
    assert [chapter.external_id for chapter in story.chapters] == ["chapter-safe-1"]
    assert story.raw_metadata["_connector"]["feed_truncated"] is False

    chapter = await connector.fetch_chapter("manga-safe-1", "chapter-safe-1")
    assert chapter.images == [
        "https://uploads.mangadex.org/data/hash-safe-1/001.jpg",
    ]
    assert chapter.raw_metadata["_connector"]["at_home_urls_are_ephemeral"] is True
    await connector.close()


@pytest.mark.asyncio
async def test_mangadex_rejects_path_injection_before_network_call():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector = MangaDexConnector(client=client)

    with pytest.raises(ValueError, match="manga id"):
        await connector.fetch_story("../admin")
    with pytest.raises(ValueError, match="chapter id"):
        await connector.fetch_chapter("story", "https://example.invalid/chapter")
    assert calls == 0
    await connector.close()


@pytest.mark.asyncio
async def test_mangadex_rejects_unsafe_at_home_base_url(mangadex_payloads):
    unsafe = {
        **mangadex_payloads["at_home"],
        "baseUrl": "http://127.0.0.1/internal",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=unsafe)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector = MangaDexConnector(client=client)
    with pytest.raises(ValueError, match="unsafe at-home"):
        await connector.fetch_chapter("manga-safe-1", "chapter-safe-1")
    await connector.close()


def test_comic_source_registry_fails_closed_without_bypass():
    assert COMIC_SOURCE_POLICIES["otruyen"].mode == "direct_api"
    assert COMIC_SOURCE_POLICIES["mangadex"].mode == "direct_api"
    assert COMIC_SOURCE_POLICIES["xkcd"].mode == "direct_api"
    assert COMIC_SOURCE_POLICIES["nettruyen"].enabled is False
    assert COMIC_SOURCE_POLICIES["cuutruyen"].enabled is False
    assert COMIC_SOURCE_POLICIES["blogtruyen"].enabled is False

    direct = create_direct_public_comic_connectors()
    assert set(direct) == {"otruyen", "mangadex", "xkcd"}

    for source_id in ("nettruyen", "cuutruyen", "blogtruyen"):
        with pytest.raises(SourceUnavailableError, match="disabled"):
            create_comic_connector(source_id)


@pytest.mark.asyncio
async def test_xkcd_official_feed_connector():
    latest = {
        "num": 3100,
        "safe_title": "Safe Feed",
        "title": "Safe Feed",
        "img": "https://imgs.xkcd.com/comics/safe_feed.png",
        "alt": "An attributed comic.",
        "transcript": "",
        "year": "2026",
        "month": "7",
        "day": "26",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path in {"/info.0.json", "/3100/info.0.json"}:
            return httpx.Response(200, json=latest)
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector = XkcdConnector(client=client)
    catalog = await connector.fetch_catalog(page=1, limit=1)
    assert catalog.stories[0].slug == "xkcd-3100"
    assert catalog.stories[0].raw_metadata["license"] == "CC BY-NC 2.5"
    chapter = await connector.fetch_chapter("3100", "3100")
    assert chapter.images == ["https://imgs.xkcd.com/comics/safe_feed.png"]
    with pytest.raises(ValueError, match="mismatch"):
        await connector.fetch_chapter("3100", "3099")
    await connector.close()
