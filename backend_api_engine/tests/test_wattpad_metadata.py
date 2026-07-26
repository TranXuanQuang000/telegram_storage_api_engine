import httpx
import pytest

from app.connectors.novel.public_html import SourceAccessRestrictedError
from app.connectors.novel.wattpad import WattpadMetadataConnector


PUBLIC_STORY_HTML = """
<html>
  <head>
    <meta property="og:title" content="Truyện kiểm thử - Wattpad">
    <meta property="og:description" content="Mô tả công khai">
    <meta property="og:image" content="https://img.wattpad.com/cover/123456.jpg">
    <meta property="og:url" content="https://www.wattpad.com/story/123456-truyen-kiem-thu">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Book",
        "name": "Truyện kiểm thử",
        "author": {"@type": "Person", "name": "Tác giả thử"},
        "keywords": ["Fantasy", "Light Novel"],
        "hasPart": [
          {"@type": "Chapter", "position": 1, "name": "Phần 1", "url": "/654321-phan-1"},
          {"@type": "Chapter", "position": 2, "name": "Phần 2", "url": "/654322-phan-2"}
        ]
      }
    </script>
  </head>
  <body></body>
</html>
"""


@pytest.mark.asyncio
async def test_wattpad_imports_public_metadata_cover_and_part_links_only():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "www.wattpad.com"
        assert request.url.path == "/story/123456"
        return httpx.Response(
            200,
            text=PUBLIC_STORY_HTML,
            headers={"Content-Type": "text/html; charset=utf-8"},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    connector = WattpadMetadataConnector(client=client)
    story = await connector.fetch_story("123456")
    assert story.title == "Truyện kiểm thử"
    assert story.author == "Tác giả thử"
    assert story.cover_url == "https://img.wattpad.com/cover/123456.jpg"
    assert story.genres == ["Fantasy", "Light Novel"]
    assert [chapter.external_id for chapter in story.chapters] == ["654321", "654322"]
    assert story.raw_metadata["chapter_content_available"] is False
    with pytest.raises(SourceAccessRestrictedError):
        await connector.fetch_chapter("123456", "654321")
    await connector.close()


def test_wattpad_rejects_arbitrary_urls_and_non_wattpad_assets():
    connector = WattpadMetadataConnector()
    with pytest.raises(ValueError, match="Invalid Wattpad"):
        connector._story_id("https://127.0.0.1/admin")
    assert connector._safe_asset_url("https://example.invalid/cover.jpg") is None
