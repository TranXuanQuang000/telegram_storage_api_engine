import re
from typing import List, Optional
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.aggregator import AggregatorService, get_aggregator_service
from app.engine.opaque_id import decode_chapter_ref, encode_chapter_ref

router = APIRouter()

ALLOWED_LISTS = {"truyen-moi", "hoan-thanh", "dang-phat-hanh"}


async def _compatibility_payload(
    path: str,
    aggregator: AggregatorService,
    params: Optional[dict] = None,
):
    try:
        return await aggregator.get_otruyen_raw(path, params=params)
    except Exception as exc:
        status_code = 404 if "404" in str(exc) or "not found" in str(exc).lower() else 502
        raise HTTPException(status_code=status_code, detail=str(exc))


@router.get("/home")
async def get_home(
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    return await _compatibility_payload("/home", aggregator, params={})


@router.get("/danh-sach/{list_name}")
async def get_comic_list(
    list_name: str,
    page: int = Query(1, ge=1),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    if list_name not in ALLOWED_LISTS:
        raise HTTPException(status_code=404, detail="Unknown comic list")
    return await _compatibility_payload(
        f"/danh-sach/{list_name}",
        aggregator,
        params={"page": page},
    )


@router.get("/the-loai")
async def get_genres(
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    return await _compatibility_payload("/the-loai", aggregator, params={})


@router.get("/the-loai/{slug}")
async def get_genre_catalog(
    slug: str,
    page: int = Query(1, ge=1),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    if not slug.replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid genre slug")
    return await _compatibility_payload(
        f"/the-loai/{slug}",
        aggregator,
        params={"page": page},
    )


@router.get("/tim-kiem")
async def search_comics(
    keyword: str = Query(..., min_length=1, max_length=120),
    page: int = Query(1, ge=1),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    return await _compatibility_payload(
        "/tim-kiem",
        aggregator,
        params={"keyword": keyword, "page": page},
    )


@router.get("/danh-sach/truyen-moi")
async def get_otruyen_catalog(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    """
    Returns OTruyen JSON format catalog list.
    """
    try:
        result = await aggregator.get_otruyen_catalog(page=page, limit=limit)

        if result.raw_metadata and "data" in result.raw_metadata and "items" in result.raw_metadata.get("data", {}):
            return result.raw_metadata

        items = []
        for story in result.stories:
            items.append({
                "_id": story.external_id,
                "name": story.title,
                "slug": story.slug,
                "status": story.status.value,
                "thumb_url": story.cover_url or "",
                "category": [{"name": g} for g in story.genres],
                "updatedAt": story.updated_at or "",
            })

        return {
            "status": "success",
            "message": "",
            "data": {
                "items": items,
                "params": {
                    "pagination": {
                        "totalItems": result.total if result.total is not None else len(items),
                        "totalItemsPerPage": limit,
                        "currentPage": page,
                        "pageItems": len(items),
                    }
                },
                "APP_DOMAIN_CDN_IMAGE": "https://otruyencdn.com/uploads/comics",
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/truyen-tranh/{slug}")
async def get_otruyen_story(
    slug: str,
    source: str = Query("otruyen"),
    secondary_sources: Optional[List[str]] = Query(None),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    """
    Returns OTruyen JSON format comic detail with merged continuous chapter list.
    """
    try:
        source = source.strip().lower()
        if source not in {"otruyen", "mangadex"}:
            raise HTTPException(status_code=422, detail="Unsupported or disabled comic source")
        if secondary_sources:
            secondary_sources = [item.strip().lower() for item in secondary_sources]
            if any(item not in {"otruyen", "mangadex"} for item in secondary_sources):
                raise HTTPException(status_code=422, detail="Unsupported or disabled secondary comic source")
        story, merged_chapters = await aggregator.get_comic_story(
            slug,
            source=source,
            secondary_sources=secondary_sources,
        )

        server_data = []
        for i, ch in enumerate(merged_chapters):
            ch_num = ch.chapter_number or str(i + 1)
            chapter_source = (
                ch.raw_metadata.get("original_source", story.source_id)
                if ch.raw_metadata
                else story.source_id
            )
            if chapter_source == "otruyen" and story.source_id == "otruyen":
                public_chapter_id = ch.external_id
            else:
                public_chapter_id = encode_chapter_ref(
                    chapter_source,
                    story.external_id,
                    ch.external_id,
                )
            api_data = f"/v1/api/chapter/{quote(public_chapter_id, safe='')}"

            filename = ch.raw_metadata.get("filename") if ch.raw_metadata else None
            ch_title = ch.raw_metadata.get("chapter_title") if ch.raw_metadata else None
            if not ch_title and ch.title:
                ch_title = ch.title.replace(f"Chapter {ch_num}: ", "").replace(f"Chapter {ch_num}", "")

            item_dict = {
                "filename": filename or ch_num,
                "chapter_name": ch_num,
                "chapter_title": ch_title or "",
                "chapter_api_data": api_data,
                "source_name": chapter_source,
            }
            if ch.raw_metadata and ch.raw_metadata.get("is_filled"):
                item_dict["is_filled"] = True
                item_dict["original_source"] = ch.raw_metadata.get("original_source")

            server_data.append(item_dict)

        if story.raw_metadata and "data" in story.raw_metadata and "item" in story.raw_metadata.get("data", {}):
            res_dict = dict(story.raw_metadata)
            res_data = dict(res_dict.get("data", {}))
            res_item = dict(res_data.get("item", {}))
            res_item["chapters"] = [
                {
                    "server_name": "Server 1",
                    "server_data": server_data,
                }
            ]
            res_item["source_name"] = story.source_id
            res_item["source_url"] = story.external_url
            res_data["item"] = res_item
            res_dict["data"] = res_data
            return res_dict

        author_list = [story.author] if story.author else []
        return {
            "status": "success",
            "message": "",
            "data": {
                "item": {
                    "_id": story.external_id,
                    "name": story.title,
                    "slug": story.slug,
                    "content": story.description or "",
                    "status": story.status.value,
                    "thumb_url": story.cover_url or "",
                    "author": author_list,
                    "category": [{"name": g} for g in story.genres],
                    "updatedAt": story.updated_at or "",
                    "chapters": [
                        {
                            "server_name": "Server 1",
                            "server_data": server_data,
                        }
                    ],
                    "source_name": story.source_id,
                    "source_url": story.external_url,
                },
                "APP_DOMAIN_CDN_IMAGE": "https://otruyencdn.com/uploads/comics",
            },
        }
    except Exception as e:
        status_code = 404 if "not found" in str(e).lower() else 500
        raise HTTPException(status_code=status_code, detail=str(e))


@router.get("/chapter/{chapter_id:path}")
async def get_otruyen_chapter(
    chapter_id: str,
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    """
    Returns OTruyen JSON format chapter content (domain_cdn, chapter_path, image array).
    """
    if not re.fullmatch(r"[A-Za-z0-9._~-]{1,1024}", chapter_id):
        raise HTTPException(status_code=400, detail="Invalid chapter id")
    try:
        chapter_ref = decode_chapter_ref(chapter_id)
        if chapter_ref:
            chapter = await aggregator.get_comic_chapter(
                chapter_ref.source,
                chapter_ref.story_id,
                chapter_ref.chapter_id,
            )
        else:
            chapter = await aggregator.get_otruyen_chapter(chapter_id)

        if chapter.raw_metadata and "data" in chapter.raw_metadata and "domain_cdn" in chapter.raw_metadata.get("data", {}):
            return chapter.raw_metadata

        domain_cdn = ""
        chapter_path = ""
        chapter_images = []
        if chapter.images:
            first_img = chapter.images[0]
            if first_img.startswith("http"):
                parts = first_img.split("/")
                domain_cdn = f"{parts[0]}//{parts[2]}"
                chapter_path = "/".join(parts[3:-1])
                for img in chapter.images:
                    fname = img.split("/")[-1]
                    chapter_images.append({"image_page": len(chapter_images) + 1, "image_file": fname})
            else:
                for img in chapter.images:
                    chapter_images.append({"image_page": len(chapter_images) + 1, "image_file": img})

        return {
            "status": "success",
            "message": "",
            "data": {
                "domain_cdn": domain_cdn,
                "item": {
                    "_id": chapter.external_id,
                    "chapter_name": chapter.chapter_number or "",
                    "chapter_title": chapter.title,
                    "chapter_path": chapter_path,
                    "chapter_image": chapter_images,
                },
                "source_name": (chapter.raw_metadata or {}).get("source_id", "otruyen"),
            },
        }
    except Exception as e:
        status_code = 404 if "not found" in str(e).lower() else 500
        raise HTTPException(status_code=status_code, detail=str(e))
