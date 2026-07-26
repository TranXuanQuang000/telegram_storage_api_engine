from fastapi import APIRouter, Depends, HTTPException, Query

from app.engine.coverage import analyze_chapter_coverage
from app.services.aggregator import AggregatorService, get_aggregator_service


router = APIRouter()
_COMIC_READER_SOURCES = {"auto", "otruyen", "mangadex", "xkcd"}


@router.get("/coverage/comic/{slug}")
async def comic_chapter_coverage(
    slug: str,
    source: str = Query("auto"),
    expected_latest: int | None = Query(None, ge=1, le=10000),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    normalized_source = source.strip().lower()
    if normalized_source not in _COMIC_READER_SOURCES:
        raise HTTPException(status_code=422, detail="Unsupported comic reader source")
    try:
        if normalized_source == "auto":
            story, chapters = await aggregator.get_auto_comic_story(slug)
        else:
            story, chapters = await aggregator.get_comic_story(
                slug,
                source=normalized_source,
            )
    except Exception as exc:
        status_code = 404 if "not found" in str(exc).lower() else 502
        raise HTTPException(status_code=status_code, detail=str(exc))

    coverage = analyze_chapter_coverage(
        chapters,
        expected_latest=expected_latest,
    )
    return {
        "status": "success",
        "data": {
            "story": {
                "title": story.title,
                "slug": story.slug,
                "selected_source": story.source_id,
                "source_url": story.external_url,
            },
            "coverage": coverage,
            "rule": "complete only when every integer chapter from 1 to expected_latest exists",
        },
    }
