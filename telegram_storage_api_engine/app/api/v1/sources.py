from fastapi import APIRouter, Depends

from app.config.sources import SOURCE_SPECS, enabled_source_ids
from app.services.aggregator import AggregatorService, get_aggregator_service


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
                    "selection_mode": "adaptive" if spec.id in enabled else "disabled",
                }
                for spec in SOURCE_SPECS.values()
            ]
        },
    }


@router.get("/sources/health")
async def source_health(
    aggregator: AggregatorService = Depends(get_aggregator_service),
):
    enabled = enabled_source_ids()
    items = []
    for source_id in sorted(enabled):
        snapshot = aggregator.selector.health.get_snapshot(source_id)
        items.append(
            {
                "id": source_id,
                "circuit": snapshot.circuit_state.value,
                "success_ewma": round(snapshot.ewma_success, 4),
                "latency_ewma_ms": (
                    round(snapshot.ewma_latency_ms, 2)
                    if snapshot.ewma_latency_ms is not None
                    else None
                ),
                "successes": snapshot.total_successes,
                "failures": snapshot.total_failures,
            }
        )
    return {
        "status": "success",
        "data": {
            "policy": "health+latency+freshness+coverage+completeness",
            "items": items,
        },
    }
