"""Controlled Telegram archive for content the operator is allowed to store."""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Dict, Iterable, Optional
from urllib.parse import urlparse

import httpx

from app.models.chapter import ChapterContent


class ArchivePolicyError(ValueError):
    pass


class TelegramStorageError(RuntimeError):
    pass


class TelegramStorageNotConfigured(TelegramStorageError):
    pass


_SAFE_FILE_ID = re.compile(r"^[A-Za-z0-9_-]{20,512}$")
_SAFE_SOURCE_ID = re.compile(r"^[a-z0-9_-]{1,40}$")
_IMAGE_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "image/webp": (b"RIFF",),
}
_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
_BUILTIN_ASSET_HOSTS = {
    "xkcd": frozenset({"imgs.xkcd.com", "xkcd.com", "www.xkcd.com"}),
}
_RIGHTS_BASES = frozenset({"cc", "public_domain", "owned", "licensed"})


@dataclass(frozen=True)
class DownloadedImage:
    source_url: str
    content: bytes
    content_type: str
    sha256: str
    filename: str


class TelegramStorageService:
    def __init__(
        self,
        *,
        bot_token: str = "",
        chat_id: str = "",
        allowed_sources: Iterable[str] = ("xkcd",),
        max_image_bytes: int = 19_000_000,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.bot_token = bot_token.strip()
        self.chat_id = chat_id.strip()
        self.allowed_sources = frozenset(
            source.strip().lower()
            for source in allowed_sources
            if _SAFE_SOURCE_ID.fullmatch(source.strip().lower())
        )
        self.max_image_bytes = max(1_000_000, min(int(max_image_bytes), 19_000_000))
        self._client = client
        self._manifests: Dict[str, Dict[str, Any]] = {}
        self._file_types: Dict[str, str] = {}

    @classmethod
    def from_env(cls) -> "TelegramStorageService":
        sources = os.getenv("ARCHIVE_ALLOWED_SOURCES", "xkcd").split(",")
        try:
            max_bytes = int(os.getenv("ARCHIVE_MAX_IMAGE_BYTES", "19000000"))
        except ValueError:
            max_bytes = 19_000_000
        return cls(
            bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
            chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
            allowed_sources=sources,
            max_image_bytes=max_bytes,
        )

    @property
    def configured(self) -> bool:
        return bool(self.bot_token and self.chat_id)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0),
                follow_redirects=True,
                headers={"User-Agent": "MucArchive/1.0 (authorized content archiver)"},
            )
        return self._client

    def _require_configured(self) -> None:
        if not self.configured:
            raise TelegramStorageNotConfigured(
                "Telegram archive is disabled until TELEGRAM_BOT_TOKEN and "
                "TELEGRAM_CHAT_ID are configured"
            )

    def _asset_hosts(self, source: str) -> frozenset[str]:
        normalized = source.strip().lower()
        builtins = set(_BUILTIN_ASSET_HOSTS.get(normalized, ()))
        env_key = f"ARCHIVE_ASSET_HOSTS_{normalized.upper().replace('-', '_')}"
        configured = {
            host.strip().lower().rstrip(".")
            for host in os.getenv(env_key, "").split(",")
            if host.strip()
        }
        return frozenset(builtins | configured)

    def validate_archive_policy(self, source: str, rights_basis: str) -> None:
        normalized_source = source.strip().lower()
        normalized_rights = rights_basis.strip().lower()
        if normalized_source not in self.allowed_sources:
            raise ArchivePolicyError(
                f"Source {normalized_source!r} is not enabled for archival"
            )
        if normalized_rights not in _RIGHTS_BASES:
            raise ArchivePolicyError("Unsupported rights basis")
        if normalized_source == "xkcd" and normalized_rights != "cc":
            raise ArchivePolicyError("xkcd archival must preserve its CC license")
        if normalized_source != "xkcd" and normalized_rights == "cc":
            raise ArchivePolicyError(
                "CC archival is only pre-verified for xkcd; configure another "
                "source only after verifying its license"
            )
        if not self._asset_hosts(normalized_source):
            raise ArchivePolicyError(
                f"No asset hosts are configured for source {normalized_source!r}"
            )

    def _validate_asset_url(self, source: str, url: str) -> None:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower().rstrip(".")
        try:
            port = parsed.port
        except ValueError as exc:
            raise ArchivePolicyError("Invalid asset URL port") from exc
        if (
            parsed.scheme != "https"
            or not host
            or parsed.username
            or parsed.password
            or port not in (None, 443)
            or host not in self._asset_hosts(source)
        ):
            raise ArchivePolicyError("Asset URL is outside the source allow-list")

    @staticmethod
    def _validate_image_bytes(content_type: str, content: bytes) -> None:
        signatures = _IMAGE_SIGNATURES.get(content_type)
        if not signatures:
            raise TelegramStorageError(f"Unsupported image MIME type: {content_type}")
        if content_type == "image/webp":
            valid = (
                len(content) >= 12
                and content.startswith(b"RIFF")
                and content[8:12] == b"WEBP"
            )
        else:
            valid = any(content.startswith(signature) for signature in signatures)
        if not valid:
            raise TelegramStorageError("Downloaded payload does not match its image MIME")

    async def download_image(
        self, source: str, url: str, page_number: int
    ) -> DownloadedImage:
        self._validate_asset_url(source, url)
        client = await self._get_client()
        async with client.stream(
            "GET",
            url,
            headers={"Accept": "image/avif,image/webp,image/png,image/jpeg,image/gif"},
        ) as response:
            response.raise_for_status()
            self._validate_asset_url(source, str(response.url))
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type not in _IMAGE_SIGNATURES:
                raise TelegramStorageError(
                    f"Upstream returned unsupported MIME type: {content_type or 'missing'}"
                )
            declared_length = response.headers.get("content-length", "")
            if declared_length.isdigit() and int(declared_length) > self.max_image_bytes:
                raise TelegramStorageError("Image exceeds ARCHIVE_MAX_IMAGE_BYTES")
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > self.max_image_bytes:
                    raise TelegramStorageError("Image exceeds ARCHIVE_MAX_IMAGE_BYTES")

        content = bytes(body)
        self._validate_image_bytes(content_type, content)
        digest = hashlib.sha256(content).hexdigest()
        filename = f"page-{page_number:04d}-{digest[:12]}{_EXTENSIONS[content_type]}"
        return DownloadedImage(
            source_url=url,
            content=content,
            content_type=content_type,
            sha256=digest,
            filename=filename,
        )

    async def upload_image(
        self, image: DownloadedImage, *, caption: str
    ) -> Dict[str, Any]:
        self._require_configured()
        client = await self._get_client()
        try:
            response = await client.post(
                f"https://api.telegram.org/bot{self.bot_token}/sendDocument",
                data={"chat_id": self.chat_id, "caption": caption[:1000]},
                files={
                    "document": (
                        image.filename,
                        image.content,
                        image.content_type,
                    )
                },
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise TelegramStorageError("Telegram sendDocument failed") from exc
        document = ((payload.get("result") or {}).get("document") or {})
        file_id = str(document.get("file_id") or "")
        if not payload.get("ok") or not _SAFE_FILE_ID.fullmatch(file_id):
            raise TelegramStorageError("Telegram did not return a valid document file_id")
        self._file_types[file_id] = image.content_type
        return {
            "file_id": file_id,
            "file_unique_id": document.get("file_unique_id"),
            "message_id": (payload.get("result") or {}).get("message_id"),
        }

    async def archive_chapter(
        self,
        *,
        source: str,
        story_identifier: str,
        chapter_identifier: str,
        chapter: ChapterContent,
        rights_basis: str,
        attribution: str,
        destination: str = "telegram",
    ) -> Dict[str, Any]:
        self.validate_archive_policy(source, rights_basis)
        if destination not in {"source_manifest", "telegram"}:
            raise ArchivePolicyError("Unsupported archive destination")
        if destination == "telegram":
            self._require_configured()
        images = [url for url in (chapter.images or []) if isinstance(url, str) and url]
        if not images:
            raise TelegramStorageError("Chapter does not contain archiveable images")

        pages = []
        for index, url in enumerate(images, start=1):
            downloaded = await self.download_image(source, url, index)
            page = {
                "page": index,
                "source_url": downloaded.source_url,
                "sha256": downloaded.sha256,
                "bytes": len(downloaded.content),
                "content_type": downloaded.content_type,
            }
            if destination == "telegram":
                uploaded = await self.upload_image(
                    downloaded,
                    caption=(
                        f"{source}:{story_identifier}:{chapter_identifier} "
                        f"page {index}/{len(images)} | {rights_basis} | {attribution}"
                    ),
                )
                page.update(
                    {
                        **uploaded,
                        "proxy_url": f"/v1/storage/tg/{uploaded['file_id']}",
                    }
                )
            pages.append(page)

        archive_seed = (
            f"{source}\0{story_identifier}\0{chapter_identifier}\0"
            + "\0".join(page["sha256"] for page in pages)
        )
        archive_id = hashlib.sha256(archive_seed.encode("utf-8")).hexdigest()[:32]
        manifest = {
            "archive_id": archive_id,
            "source": source,
            "story_identifier": story_identifier,
            "chapter_identifier": chapter_identifier,
            "title": chapter.title,
            "chapter_number": chapter.chapter_number,
            "rights_basis": rights_basis,
            "attribution": attribution,
            "destination": destination,
            "page_count": len(pages),
            "pages": pages,
            "persistence": (
                "Telegram messages persist, but this API's manifest index is in-memory "
                "until an external database is configured"
                if destination == "telegram"
                else "Source URLs are validated but not copied or persisted"
            ),
        }
        self._manifests[archive_id] = manifest
        return manifest

    def get_manifest(self, archive_id: str) -> Optional[Dict[str, Any]]:
        return self._manifests.get(archive_id)

    async def download_telegram_file(self, file_id: str) -> tuple[bytes, str]:
        self._require_configured()
        if not _SAFE_FILE_ID.fullmatch(file_id):
            raise ArchivePolicyError("Invalid Telegram file_id")
        client = await self._get_client()
        try:
            metadata_response = await client.get(
                f"https://api.telegram.org/bot{self.bot_token}/getFile",
                params={"file_id": file_id},
            )
            metadata_response.raise_for_status()
            payload = metadata_response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise TelegramStorageError("Telegram getFile failed") from exc
        file_path = str(((payload.get("result") or {}).get("file_path") or ""))
        pure_path = PurePosixPath(file_path)
        if (
            not payload.get("ok")
            or not file_path
            or pure_path.is_absolute()
            or ".." in pure_path.parts
        ):
            raise TelegramStorageError("Telegram returned an invalid file path")
        try:
            file_response = await client.get(
                f"https://api.telegram.org/file/bot{self.bot_token}/{file_path}"
            )
            file_response.raise_for_status()
        except httpx.HTTPError as exc:
            raise TelegramStorageError("Telegram file download failed") from exc
        if len(file_response.content) > self.max_image_bytes:
            raise TelegramStorageError("Telegram file exceeds the configured size limit")
        return file_response.content, self._file_types.get(
            file_id, "application/octet-stream"
        )


_telegram_storage_service: Optional[TelegramStorageService] = None


def get_telegram_storage_service() -> TelegramStorageService:
    global _telegram_storage_service
    if _telegram_storage_service is None:
        _telegram_storage_service = TelegramStorageService.from_env()
    return _telegram_storage_service
