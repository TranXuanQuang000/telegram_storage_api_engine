from datetime import datetime, timedelta, timezone

import pytest

from app.engine.source_selector import (
    AdaptiveSourceSelector,
    CircuitState,
    SourceCandidate,
    SourceHealthRegistry,
)


def test_health_registry_updates_success_and_latency_ewmas():
    registry = SourceHealthRegistry(
        ewma_alpha=0.5,
        initial_success_score=0.5,
    )

    registry.record_success("fast", 100)
    registry.record_success("fast", 300)
    registry.record_failure("fast")

    snapshot = registry.get_snapshot("fast")
    assert snapshot.ewma_success == pytest.approx(0.4375)
    assert snapshot.ewma_latency_ms == pytest.approx(200)
    assert snapshot.total_successes == 2
    assert snapshot.total_failures == 1
    assert snapshot.consecutive_failures == 1


def test_circuit_breaker_allows_only_one_half_open_probe_then_recovers():
    current_time = [100.0]
    registry = SourceHealthRegistry(
        failure_threshold=2,
        cooldown_seconds=10,
        clock=lambda: current_time[0],
    )

    registry.record_failure("unstable")
    registry.record_failure("unstable")
    assert registry.get_snapshot("unstable").circuit_state == CircuitState.OPEN
    assert not registry.allow_request("unstable")
    assert not registry.acquire_permission("unstable")

    current_time[0] += 10
    assert registry.get_snapshot("unstable").circuit_state == CircuitState.HALF_OPEN
    assert registry.acquire_permission("unstable")
    assert not registry.acquire_permission("unstable")

    registry.record_success("unstable", 80)
    assert registry.get_snapshot("unstable").circuit_state == CircuitState.CLOSED
    assert registry.allow_request("unstable")


def test_failed_half_open_probe_reopens_circuit_for_full_cooldown():
    current_time = [0.0]
    registry = SourceHealthRegistry(
        failure_threshold=1,
        cooldown_seconds=5,
        clock=lambda: current_time[0],
    )
    registry.record_failure("source")
    current_time[0] = 5
    assert registry.acquire_permission("source")

    registry.record_failure("source")
    assert registry.get_snapshot("source").circuit_state == CircuitState.OPEN
    current_time[0] = 9.9
    assert not registry.allow_request("source")
    current_time[0] = 10
    assert registry.allow_request("source")


def test_complete_fresh_candidate_beats_faster_but_sparse_candidate():
    now = datetime(2026, 7, 26, tzinfo=timezone.utc)
    selector = AdaptiveSourceSelector(
        target_latency_ms=500,
        freshness_half_life_seconds=24 * 60 * 60,
    )
    candidates = [
        SourceCandidate(
            source_id="sparse",
            value="sparse payload",
            latency_ms=50,
            updated_at=now - timedelta(days=7),
            chapter_count=20,
            expected_chapter_count=100,
            completeness_ratio=0.4,
        ),
        SourceCandidate(
            source_id="complete",
            value="complete payload",
            latency_ms=350,
            updated_at=now - timedelta(hours=2),
            chapter_count=98,
            expected_chapter_count=100,
            completeness_ratio=0.99,
        ),
    ]

    ranked = selector.rank_candidates(candidates, now=now)

    assert [item.candidate.source_id for item in ranked] == ["complete", "sparse"]
    assert ranked[0].components.coverage == pytest.approx(0.98)
    assert ranked[0].components.completeness == pytest.approx(0.99)
    assert ranked[0].score > ranked[1].score


def test_open_and_failed_sources_are_excluded_by_default():
    registry = SourceHealthRegistry(failure_threshold=1, cooldown_seconds=60)
    selector = AdaptiveSourceSelector(registry)
    registry.record_failure("open")
    candidates = [
        SourceCandidate(source_id="open", value=1, latency_ms=10),
        SourceCandidate(
            source_id="failed",
            value=2,
            request_succeeded=False,
            latency_ms=10,
        ),
        SourceCandidate(source_id="healthy", value=3, latency_ms=100),
    ]

    assert selector.choose(candidates).candidate.value == 3
    assert len(selector.rank_candidates(candidates)) == 1
    with_unavailable = selector.rank_candidates(
        candidates,
        include_unavailable=True,
    )
    assert {item.candidate.source_id for item in with_unavailable} == {
        "open",
        "failed",
        "healthy",
    }
    assert with_unavailable[-1].score == 0


def test_unknown_quality_is_neutral_and_ranking_ties_are_deterministic():
    selector = AdaptiveSourceSelector(unknown_quality_score=0.5)
    ranked = selector.rank_candidates(
        [
            SourceCandidate(source_id="zeta", value=1),
            SourceCandidate(source_id="alpha", value=2),
        ]
    )

    assert [item.candidate.source_id for item in ranked] == ["alpha", "zeta"]
    assert ranked[0].components.freshness == 0.5
    assert ranked[0].components.coverage == 0.5
    assert ranked[0].components.completeness == 0.5


def test_explicit_quality_values_and_future_timestamps_are_clamped():
    now = datetime(2026, 7, 26, tzinfo=timezone.utc)
    selector = AdaptiveSourceSelector()
    ranked = selector.score_candidate(
        SourceCandidate(
            source_id="source",
            value=None,
            updated_at=now + timedelta(days=1),
            coverage_ratio=1.5,
            completeness_ratio=-0.5,
        ),
        now=now,
    )

    assert ranked.components.freshness == 1
    assert ranked.components.coverage == 1
    assert ranked.components.completeness == 0


def test_record_result_requires_latency_only_for_success():
    registry = SourceHealthRegistry()
    with pytest.raises(ValueError, match="requires latency"):
        registry.record_result("source", succeeded=True)

    registry.record_result("source", succeeded=False)
    assert registry.get_snapshot("source").total_failures == 1
