from fastapi import APIRouter, Depends, HTTPException, Path

from app.connectors.novel.public_html import (
    SourceAccessRestrictedError,
    SourceMarkupError,
)
from app.services.aggregator import AggregatorService, get_aggregator_service


router = APIRouter()


@router.get("/wattpad/story/{story_id}")
async def inspect_wattpad_story(
    story_id: str = Path(..., pattern=r"^\d{4,20}$"),
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    """
    Import public Wattpad story metadata by numeric story id.

    The response intentionally contains metadata, cover URL, attribution and
    public part links only. It never proxies or copies Wattpad chapter text.
    """
    try:
        story = await aggregator.inspect_wattpad_story(story_id)
    except SourceAccessRestrictedError as exc:
        raise HTTPException(status_code=423, detail=str(exc))
    except SourceMarkupError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Wattpad metadata source unavailable") from exc

    return {
        "status": "success",
        "data": {
            "item": {
                "id": story.external_id,
                "slug": story.slug,
                "title": story.title,
                "author": story.author,
                "description": story.description,
                "cover_url": story.cover_url,
                "genres": story.genres,
                "status": story.status.value,
                "updated_at": story.updated_at,
                "source": story.source_id,
                "source_url": story.external_url,
                "chapters": [
                    {
                        "id": chapter.external_id,
                        "title": chapter.title,
                        "chapter_number": chapter.chapter_number,
                        "source_url": chapter.url,
                        "content_available": False,
                    }
                    for chapter in story.chapters
                ],
                "access": "metadata+source-link",
                "attribution_required": True,
            }
        },
    }
