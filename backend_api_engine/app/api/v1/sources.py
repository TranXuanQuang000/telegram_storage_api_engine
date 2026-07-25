from fastapi import APIRouter

from app.config.sources import SOURCE_SPECS, enabled_source_ids


router = APIRouter()


@router.get("/sources")
async def list_sources():
    enabled = enabled_source_ids()
    return {
        "status": "success",
        "data": {
            "items": [
                {
                    "id": spec.id,
                    "name": spec.name,
                    "medium": spec.medium.value,
                    "base_url": spec.base_url,
                    "transport": spec.transport,
                    "enabled": spec.id in enabled,
                    "attribution_required": spec.attribution_required,
                }
                for spec in SOURCE_SPECS.values()
            ]
        },
    }
