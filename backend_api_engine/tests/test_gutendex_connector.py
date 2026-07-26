import json

import httpx
import pytest

from app.connectors.novel.gutendex import GutendexConnector
from app.models.story import StoryMedium, StoryStatus
from app.services.aggregator import AggregatorService


BOOK = {
    "id": 84,
    "title": "Frankenstein; Or, The Modern Prometheus",
    "authors": [{"name": "Shelley, Mary Wollstonecraft", "birth_year": 1797}],
    "subjects": ["Science fiction", "Gothic fiction"],
    "bookshelves": ["Gothic Fiction", "Science Fiction"],
    "languages": ["en"],
    "copyright": False,
    "download_count": 12345,
    "formats": {
        "image/jpeg": "https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg",
        "text/plain; charset=utf-8": "https://www.gutenberg.org/files/84/84-0.txt",
    },
}


def transport(request: httpx.Request) -> httpx.Response:
    if request.url.host == "gutendex.test" and request.url.path == "/books/":
        return httpx.Response(
            200,
            json={"count": 1, "next": None, "previous": None, "results": [BOOK]},
        )
    if request.url.host == "gutendex.test" and request.url.path == "/books/84/":
        return httpx.Response(200, json=BOOK)
    if request.url.host == "www.gutenberg.org" and request.url.path.endswith("84-0.txt"):
        return httpx.Response(
            200,
            text=(
                "*** START OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***\n"
                "Letter 1\n\nYou will rejoice to hear that no disaster has accompanied "
                "the commencement of an enterprise.\n"
                "*** END OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***"
            ),
            headers={"Content-Type": "text/plain; charset=utf-8"},
        )
    return httpx.Response(404, text=json.dumps({"detail": "not found"}))


@pytest.mark.asyncio
async def test_gutendex_catalog_story_and_full_text_contract():
    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    connector = GutendexConnector(base_url="https://gutendex.test", client=client)

    catalog = await connector.fetch_catalog(page=1, limit=20)
    assert catalog.total == 1
    assert catalog.stories[0].slug == "gutenberg-84"
    assert catalog.stories[0].cover_url

    story = await connector.fetch_story("gutenberg-84")
    assert story.medium == StoryMedium.NOVEL
    assert story.status == StoryStatus.COMPLETED
    assert story.chapters[0].external_id == "full-text"

    chapter = await connector.fetch_chapter("gutenberg-84", "full-text")
    assert "You will rejoice" in (chapter.text_content or "")
    assert "START OF THE PROJECT GUTENBERG" not in (chapter.text_content or "")
    assert chapter.raw_metadata["source_id"] == "gutendex"
    await connector.close()


def test_gutendex_rejects_untrusted_content_host():
    connector = GutendexConnector()
    with pytest.raises(ValueError, match="No safe"):
        connector._select_content_url(
            {"text/plain; charset=utf-8": "https://example.invalid/private.txt"}
        )


def test_gutendex_rejects_non_numeric_book_identifier():
    with pytest.raises(ValueError, match="Invalid"):
        GutendexConnector._book_id("https://internal.invalid/admin")


@pytest.mark.asyncio
async def test_source_local_gutenberg_slug_never_merges_unrelated_chapters():
    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    service = AggregatorService(client=client, ttl=0)
    service.gutendex_connector.base_url = "https://gutendex.test"

    await service.get_novel_catalog(page=1, limit=20, source="gutendex")
    story, chapters = await service.get_novel_story(
        "gutenberg-84",
        primary_source="gutendex",
    )

    assert story.title.startswith("Frankenstein")
    assert [chapter.external_id for chapter in chapters] == ["full-text"]
    await client.aclose()
