import hashlib

import httpx
import pytest

from app.models.chapter import ChapterContent
from app.services.telegram_storage import (
    ArchivePolicyError,
    TelegramStorageError,
    TelegramStorageService,
)


PNG = b"\x89PNG\r\n\x1a\n" + b"authorized-image"
FILE_ID = "AbCdEfGhIjKlMnOpQrStUvWxYz_123456789"


def telegram_mock(request: httpx.Request) -> httpx.Response:
    url = str(request.url)
    if url == "https://imgs.xkcd.com/comics/licensed.png":
        return httpx.Response(
            200,
            headers={"content-type": "image/png", "content-length": str(len(PNG))},
            content=PNG,
            request=request,
        )
    if "/sendDocument" in url:
        assert request.method == "POST"
        return httpx.Response(
            200,
            json={
                "ok": True,
                "result": {
                    "message_id": 42,
                    "document": {
                        "file_id": FILE_ID,
                        "file_unique_id": "unique-42",
                    },
                },
            },
            request=request,
        )
    if "/getFile" in url:
        return httpx.Response(
            200,
            json={"ok": True, "result": {"file_path": "documents/file_42.png"}},
            request=request,
        )
    if "/file/botTEST_TOKEN/documents/file_42.png" in url:
        return httpx.Response(200, content=PNG, request=request)
    raise AssertionError(f"Unexpected request: {request.method} {url}")


@pytest.mark.asyncio
async def test_archive_cc_chapter_to_telegram_and_proxy():
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(telegram_mock),
        follow_redirects=True,
    )
    service = TelegramStorageService(
        bot_token="TEST_TOKEN",
        chat_id="-100123",
        allowed_sources=("xkcd",),
        client=client,
    )
    chapter = ChapterContent(
        story_id="1",
        external_id="1",
        title="Licensed test",
        chapter_number="1",
        images=["https://imgs.xkcd.com/comics/licensed.png"],
    )

    manifest = await service.archive_chapter(
        source="xkcd",
        story_identifier="1",
        chapter_identifier="1",
        chapter=chapter,
        rights_basis="cc",
        attribution="xkcd CC BY-NC 2.5",
    )

    assert manifest["page_count"] == 1
    assert manifest["pages"][0]["file_id"] == FILE_ID
    assert manifest["pages"][0]["sha256"] == hashlib.sha256(PNG).hexdigest()
    assert service.get_manifest(manifest["archive_id"]) == manifest
    proxied, content_type = await service.download_telegram_file(FILE_ID)
    assert proxied == PNG
    assert content_type == "image/png"
    await client.aclose()


@pytest.mark.asyncio
async def test_archive_rejects_untrusted_asset_host_before_network():
    def no_network(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"Network must not be called: {request.url}")

    client = httpx.AsyncClient(transport=httpx.MockTransport(no_network))
    service = TelegramStorageService(
        bot_token="TEST_TOKEN",
        chat_id="-100123",
        allowed_sources=("xkcd",),
        client=client,
    )
    with pytest.raises(ArchivePolicyError, match="allow-list"):
        await service.download_image(
            "xkcd", "https://attacker.example/private.png", page_number=1
        )
    await client.aclose()


@pytest.mark.asyncio
async def test_archive_rejects_mime_spoofing():
    def spoofed_image(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/png"},
            content=b"<script>alert(1)</script>",
            request=request,
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(spoofed_image))
    service = TelegramStorageService(
        bot_token="TEST_TOKEN",
        chat_id="-100123",
        allowed_sources=("xkcd",),
        client=client,
    )
    with pytest.raises(TelegramStorageError, match="does not match"):
        await service.download_image(
            "xkcd", "https://imgs.xkcd.com/comics/fake.png", page_number=1
        )
    await client.aclose()


def test_non_preverified_sources_fail_closed(monkeypatch):
    monkeypatch.delenv("ARCHIVE_ASSET_HOSTS_OTRUYEN", raising=False)
    service = TelegramStorageService(
        bot_token="TEST_TOKEN",
        chat_id="-100123",
        allowed_sources=("otruyen",),
    )
    with pytest.raises(ArchivePolicyError, match="asset hosts"):
        service.validate_archive_policy("otruyen", "licensed")


@pytest.mark.asyncio
async def test_source_manifest_mode_does_not_require_telegram_credentials():
    def image_only(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/png"},
            content=PNG,
            request=request,
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(image_only))
    service = TelegramStorageService(
        allowed_sources=("xkcd",),
        client=client,
    )
    chapter = ChapterContent(
        external_id="1",
        title="Manifest only",
        images=["https://imgs.xkcd.com/comics/licensed.png"],
    )
    manifest = await service.archive_chapter(
        source="xkcd",
        story_identifier="1",
        chapter_identifier="1",
        chapter=chapter,
        rights_basis="cc",
        attribution="xkcd CC BY-NC 2.5",
        destination="source_manifest",
    )
    assert manifest["destination"] == "source_manifest"
    assert "file_id" not in manifest["pages"][0]
    assert manifest["pages"][0]["source_url"].startswith("https://imgs.xkcd.com/")
    await client.aclose()
