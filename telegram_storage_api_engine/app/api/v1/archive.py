import hmac
import os
import re
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.services.aggregator import AggregatorService, get_aggregator_service
from app.services.telegram_storage import (
    ArchivePolicyError,
    TelegramStorageError,
    TelegramStorageNotConfigured,
    TelegramStorageService,
    get_telegram_storage_service,
)


router = APIRouter()
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z0-9._:-]{1,240}$")


class ArchiveChapterRequest(BaseModel):
    source: str = Field(min_length=1, max_length=40)
    story_identifier: str = Field(min_length=1, max_length=240)
    chapter_identifier: str = Field(min_length=1, max_length=240)
    rights_basis: Literal["cc", "public_domain", "owned", "licensed"]
    rights_attested: Literal[True]
    attribution: str = Field(default="", max_length=500)
    destination: Literal["source_manifest", "telegram"] = "source_manifest"


def _provided_token(authorization: str, archive_key: str, muc_key: str) -> str:
    if archive_key:
        return archive_key.strip()
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return muc_key.strip()


async def require_archive_admin(
    authorization: str = Header(default=""),
    x_archive_api_key: str = Header(default="", alias="X-Archive-Api-Key"),
    x_muc_api_key: str = Header(default="", alias="X-Muc-Api-Key"),
) -> None:
    expected = (
        os.getenv("ARCHIVE_API_TOKEN", "").strip()
        or os.getenv("MUC_API_TOKEN", "").strip()
    )
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Archive API is disabled until ARCHIVE_API_TOKEN is configured",
        )
    provided = _provided_token(authorization, x_archive_api_key, x_muc_api_key)
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized archive client",
            headers={"Cache-Control": "private, no-store"},
        )


def _validate_identifier(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not _SAFE_IDENTIFIER.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field_name}",
        )
    return normalized


@router.post("/v1/api/archive/chapter", dependencies=[Depends(require_archive_admin)])
async def archive_chapter(
    request: ArchiveChapterRequest,
    aggregator: AggregatorService = Depends(get_aggregator_service),
    storage: TelegramStorageService = Depends(get_telegram_storage_service),
):
    source = request.source.strip().lower()
    story_identifier = _validate_identifier(
        request.story_identifier, "story_identifier"
    )
    chapter_identifier = _validate_identifier(
        request.chapter_identifier, "chapter_identifier"
    )
    try:
        storage.validate_archive_policy(source, request.rights_basis)
        chapter = await aggregator.get_comic_chapter(
            source, story_identifier, chapter_identifier
        )
        attribution = request.attribution.strip()
        if source == "xkcd":
            attribution = attribution or (
                "xkcd by Randall Munroe — CC BY-NC 2.5 — "
                "https://xkcd.com/license.html"
            )
        return {
            "status": "success",
            "data": await storage.archive_chapter(
                source=source,
                story_identifier=story_identifier,
                chapter_identifier=chapter_identifier,
                chapter=chapter,
                rights_basis=request.rights_basis,
                attribution=attribution,
                destination=request.destination,
            ),
        }
    except TelegramStorageNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ArchivePolicyError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except TelegramStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/v1/api/archive/{archive_id}",
    dependencies=[Depends(require_archive_admin)],
)
async def get_archive_manifest(
    archive_id: str,
    storage: TelegramStorageService = Depends(get_telegram_storage_service),
):
    if not re.fullmatch(r"[a-f0-9]{32}", archive_id):
        raise HTTPException(status_code=422, detail="Invalid archive_id")
    manifest = storage.get_manifest(archive_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Archive manifest not found")
    return {"status": "success", "data": manifest}


@router.get(
    "/v1/storage/tg/{file_id}",
    dependencies=[Depends(require_archive_admin)],
)
async def proxy_telegram_file(
    file_id: str,
    storage: TelegramStorageService = Depends(get_telegram_storage_service),
):
    try:
        content, content_type = await storage.download_telegram_file(file_id)
    except TelegramStorageNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ArchivePolicyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TelegramStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )
