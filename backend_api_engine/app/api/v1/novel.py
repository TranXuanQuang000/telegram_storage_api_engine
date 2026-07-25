from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.aggregator import AggregatorService, get_aggregator_service

router = APIRouter()
ALLOWED_NOVEL_SOURCES = {
    "hako",
    "truyenfull",
    "metruyenchu",
    "tangthuvien",
    "wikidich",
}


def _validate_source(source: str):
    normalized = source.strip().lower()
    if normalized not in ALLOWED_NOVEL_SOURCES:
        raise HTTPException(status_code=422, detail="Unknown novel source")
    return normalized


@router.get("/truyen-chu/danh-sach")
async def get_novel_catalog(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    source: str = Query("hako"),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    """
    Returns list of novel metadata items.
    """
    source = _validate_source(source)
    try:
        result = await aggregator.get_novel_catalog(page=page, limit=limit, source=source)

        items = []
        for story in result.stories:
            items.append({
                "id": story.external_id,
                "title": story.title,
                "slug": story.slug,
                "author": story.author,
                "description": story.description,
                "cover_url": story.cover_url,
                "genres": story.genres,
                "status": story.status.value,
                "medium": story.medium.value,
                "updated_at": story.updated_at,
                "source": story.source_id,
                "source_url": story.external_url,
            })

        return {
            "status": "success",
            "data": {
                "items": items,
                "pagination": {
                    "total": result.total if result.total is not None else len(items),
                    "page": result.page,
                    "limit": result.limit,
                    "has_more": result.has_more,
                },
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/truyen-chu/{slug}")
async def get_novel_story(
    slug: str,
    source: str = Query("hako"),
    secondary_sources: Optional[List[str]] = Query(None),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    """
    Returns novel detail with a merged chapter list from configured public sources.
    """
    source = _validate_source(source)
    if secondary_sources:
        secondary_sources = [_validate_source(item) for item in secondary_sources]
    try:
        story, merged_chapters = await aggregator.get_novel_story(
            slug=slug,
            primary_source=source,
            secondary_sources=secondary_sources,
        )

        chapters_list = []
        for ch in merged_chapters:
            raw_meta = ch.raw_metadata or {}
            chapters_list.append({
                "id": ch.external_id,
                "title": ch.title,
                "chapter_number": ch.chapter_number,
                "url": ch.url,
                "is_filled": raw_meta.get("is_filled", False),
                "original_source": raw_meta.get("original_source", source),
            })

        return {
            "status": "success",
            "data": {
                "item": {
                    "id": story.external_id,
                    "title": story.title,
                    "slug": story.slug,
                    "author": story.author,
                    "description": story.description,
                    "cover_url": story.cover_url,
                    "genres": story.genres,
                    "status": story.status.value,
                    "medium": story.medium.value,
                    "updated_at": story.updated_at,
                    "chapters": chapters_list,
                    "source": story.source_id,
                    "source_url": story.external_url,
                }
            },
        }
    except Exception as e:
        status_code = 404 if "not found" in str(e).lower() else 500
        raise HTTPException(status_code=status_code, detail=str(e))


@router.get("/truyen-chu/{slug}/chapter/{chapter_no:path}")
async def get_novel_chapter(
    slug: str,
    chapter_no: str,
    source: str = Query("hako"),
    as_html: bool = Query(True),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    """
    Returns cleaned novel chapter text content.
    """
    source = _validate_source(source)
    try:
        chapter = await aggregator.get_novel_chapter(
            slug=slug,
            chapter_no=chapter_no,
            source=source,
            as_html=as_html,
        )

        return {
            "status": "success",
            "data": {
                "story_id": slug,
                "chapter_id": chapter.external_id,
                "chapter_number": chapter.chapter_number or chapter_no,
                "title": chapter.title,
                "text_content": chapter.text_content,
                "source": (chapter.raw_metadata or {}).get("source_id", source),
                "source_url": (chapter.raw_metadata or {}).get("parsed_url"),
            },
        }
    except Exception as e:
        status_code = 404 if "not found" in str(e).lower() else 500
        raise HTTPException(status_code=status_code, detail=str(e))
