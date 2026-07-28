from pathlib import Path
from typing import Type

import httpx
import pytest

from app.api.v1.novel import ALLOWED_NOVEL_SOURCES
from app.connectors.base import BaseConnector
from app.connectors.novel.hako import HakoConnector
from app.connectors.novel.metruyenchu import MetruyenchuConnector
from app.connectors.novel.public_html import SourceAccessRestrictedError
from app.connectors.novel.tangthuvien import TangThuVienConnector
from app.connectors.novel.truyenfull import TruyenFullConnector
from app.connectors.novel.wikidich import WikidichConnector
from app.models.story import ContentRating, StoryMedium
from app.services.aggregator import AggregatorService


FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "novel_sources"


def fixture(source: str, name: str) -> str:
    return (FIXTURE_ROOT / source / f"{name}.html").read_text(encoding="utf-8")


CASES = (
    {
        "source": "truyenfull",
        "connector": TruyenFullConnector,
        "story_slug": "truyen-kiem-thu",
        "chapter_id": "chuong-1",
        "title": "Truyện Kiểm Thử Full",
        "author": "Tác Giả Full",
        "content": "Đoạn kiểm thử thứ nhất của TruyenFull.",
        "catalog_paths": {"/danh-sach/truyen-moi/"},
        "story_paths": {"/truyen-kiem-thu", "/truyen-kiem-thu/"},
        "chapter_paths": {
            "/truyen-kiem-thu/chuong-1",
            "/truyen-kiem-thu/chuong-1/",
        },
    },
    {
        "source": "metruyenchu",
        "connector": MetruyenchuConnector,
        "story_slug": "me-truyen-kiem-thu",
        "chapter_id": "chuong-1-AbC",
        "title": "Mê Truyện Kiểm Thử",
        "author": "Tác Giả Mê",
        "content": "Đoạn kiểm thử thứ nhất của MeTruyenChu.",
        "catalog_paths": {"/", "/danh-sach"},
        "story_paths": {
            "/me-truyen-kiem-thu",
            "/truyen/me-truyen-kiem-thu",
        },
        "chapter_paths": {
            "/me-truyen-kiem-thu/chuong-1-AbC",
            "/truyen/me-truyen-kiem-thu/chuong-1-AbC",
        },
    },
    {
        "source": "tangthuvien",
        "connector": TangThuVienConnector,
        "story_slug": "tang-thu-kiem-thu",
        "chapter_id": "chuong-1",
        "title": "Tàng Thư Kiểm Thử",
        "author": "Tác Giả Tàng",
        "content": "Đoạn kiểm thử thứ nhất của Tàng Thư Viện.",
        "catalog_paths": {"/tong-hop"},
        "story_paths": {"/doc-truyen/tang-thu-kiem-thu"},
        "chapter_paths": {"/doc-truyen/tang-thu-kiem-thu/chuong-1"},
    },
    {
        "source": "wikidich",
        "connector": WikidichConnector,
        "story_slug": "wiki-dich-kiem-thu",
        "chapter_id": "chuong-1-Xyz",
        "title": "WikiDich Kiểm Thử",
        "author": "Tác Giả Wiki",
        "content": "Đoạn kiểm thử thứ nhất của WikiDich.",
        "catalog_paths": {"/", "/danh-sach"},
        "story_paths": {
            "/wiki-dich-kiem-thu",
            "/truyen/wiki-dich-kiem-thu",
        },
        "chapter_paths": {
            "/wiki-dich-kiem-thu/chuong-1-Xyz",
            "/truyen/wiki-dich-kiem-thu/chuong-1-Xyz",
        },
    },
)


def fixture_transport(case):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path in case["chapter_paths"]:
            page = "chapter"
        elif path.rstrip("/") in {item.rstrip("/") for item in case["story_paths"]}:
            page = "story"
        elif path in case["catalog_paths"]:
            page = "catalog"
        else:
            return httpx.Response(404, text="Not Found")
        return httpx.Response(
            200,
            text=fixture(case["source"], page),
            headers={"Content-Type": "text/html; charset=utf-8"},
        )

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES, ids=[case["source"] for case in CASES])
async def test_public_novel_source_fixture_contract(case):
    client = httpx.AsyncClient(transport=fixture_transport(case))
    connector = case["connector"](client=client)

    catalog = await connector.fetch_catalog(page=1, limit=20)
    assert len(catalog.stories) == 1
    assert catalog.stories[0].title == case["title"]
    assert catalog.stories[0].source_id == case["source"]
    assert catalog.stories[0].content_rating == ContentRating.UNKNOWN

    story = await connector.fetch_story(case["story_slug"])
    assert story.title == case["title"]
    assert story.author == case["author"]
    assert story.medium == StoryMedium.NOVEL
    assert len(story.chapters) == 2
    assert story.chapters[0].external_id == case["chapter_id"]

    chapter = await connector.fetch_chapter(
        case["story_slug"],
        case["chapter_id"],
    )
    assert case["content"] in (chapter.text_content or "")
    assert "Quảng cáo không được giữ lại." not in (chapter.text_content or "")
    assert chapter.raw_metadata["source_id"] == case["source"]
    assert await connector.health_check() is True
    await connector.close()


@pytest.mark.asyncio
async def test_tangthuvien_mirror_catalog_contract():
    html = """
    <html><body>
      <main>
        <a href="/doc-quyen-dich-kiem-thu" title="[Dịch] Kiếm Thử">
          <img src="/covers/kiem-thu.jpg" alt="[Dịch] Kiếm Thử">
        </a>
        <a href="/doc-quyen-dich-truyen-hai">[Dịch] Truyện Hai</a>
      </main>
    </body></html>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/truyen-moi"
        return httpx.Response(
            200,
            text=html,
            headers={"Content-Type": "text/html; charset=utf-8"},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector = TangThuVienConnector(
        base_url="https://tangthuvien.org",
        client=client,
    )

    catalog = await connector.fetch_catalog(page=1, limit=20)

    assert [item.external_id for item in catalog.stories] == [
        "doc-quyen-dich-kiem-thu",
        "doc-quyen-dich-truyen-hai",
    ]
    assert catalog.stories[0].title == "[Dịch] Kiếm Thử"
    assert catalog.stories[0].cover_url == (
        "https://tangthuvien.org/covers/kiem-thu.jpg"
    )
    await connector.close()


def test_new_sources_are_registered_in_api_and_aggregator():
    required = {
        "hako",
        "truyenfull",
        "metruyenchu",
        "tangthuvien",
        "wikidich",
        "gutendex",
    }
    assert required <= ALLOWED_NOVEL_SOURCES

    aggregator = AggregatorService()
    for source in required:
        assert aggregator._get_novel_connector(source).source_id == source
    with pytest.raises(ValueError, match="Unsupported novel source"):
        aggregator._get_novel_connector("unknown-source")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("connector_type", "story_slug"),
    [
        (TruyenFullConnector, "restricted-story"),
        (MetruyenchuConnector, "restricted-story"),
        (TangThuVienConnector, "restricted-story"),
        (WikidichConnector, "restricted-story"),
    ],
)
async def test_connectors_do_not_submit_login_or_paywall_pages(
    connector_type: Type[BaseConnector],
    story_slug: str,
):
    requests = 0

    def restricted_handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(
            200,
            text=(
                "<html><body><form action='/dang-nhap'>"
                "<div class='login-required'>Đăng nhập để đọc</div>"
                "</form></body></html>"
            ),
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(restricted_handler))
    connector = connector_type(client=client)
    with pytest.raises(SourceAccessRestrictedError):
        await connector.fetch_story(story_slug)
    assert requests == 1
    await connector.close()


@pytest.mark.asyncio
async def test_connector_does_not_retry_or_bypass_forbidden_chapter():
    requests = 0

    def forbidden_handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(403, text="Forbidden")

    client = httpx.AsyncClient(transport=httpx.MockTransport(forbidden_handler))
    connector = TangThuVienConnector(client=client)
    with pytest.raises(SourceAccessRestrictedError):
        await connector.fetch_chapter("restricted-story", "chuong-1")
    assert requests == 1
    await connector.close()


@pytest.mark.asyncio
async def test_hako_protected_reader_fails_closed_instead_of_returning_ads():
    requests = 0

    def protected_handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(
            200,
            text=(
                "<html><body><div class='title-top'>"
                "<h4 class='title-item'>Chương 1</h4></div>"
                "<div id='chapter-content'>"
                "<p>Nội dung chương</p><div id='chapter-c-protected'></div>"
                "</div></body></html>"
            ),
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(protected_handler))
    connector = HakoConnector(
        base_url="https://docln.sbs",
        client=client,
    )
    with pytest.raises(SourceAccessRestrictedError, match="protected"):
        await connector.fetch_chapter("story", "chapter-1")
    assert connector.base_url == "https://docln.sbs"
    assert requests == 1
    await connector.close()


@pytest.mark.asyncio
async def test_chapter_provenance_does_not_fallback_to_an_unverified_story(monkeypatch):
    service = AggregatorService()
    other_source_calls = 0

    async def unavailable_chapter(*_args, **_kwargs):
        raise SourceAccessRestrictedError("protected")

    async def wrong_story_chapter(*_args, **_kwargs):
        nonlocal other_source_calls
        other_source_calls += 1
        raise AssertionError("must not fetch the same slug from an unverified source")

    monkeypatch.setattr(service.hako_connector, "fetch_chapter", unavailable_chapter)
    monkeypatch.setattr(service.truyenfull_connector, "fetch_chapter", wrong_story_chapter)

    with pytest.raises(SourceAccessRestrictedError, match="protected"):
        await service.get_novel_chapter(
            slug="same-looking-slug",
            chapter_no="chapter-1",
            source="hako",
        )
    assert other_source_calls == 0
    await service.close()
