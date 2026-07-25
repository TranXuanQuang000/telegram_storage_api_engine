"""Adaptive, in-memory source health tracking and candidate ranking.

The selector is intentionally transport-agnostic. Connectors report request
outcomes to :class:`SourceHealthRegistry`, then provide successfully parsed
results as :class:`SourceCandidate` objects. This keeps HTTP concurrency and
payload merging outside the policy layer while making the ranking deterministic
and independently testable.
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Generic, Iterable, Optional, TypeVar


PayloadT = TypeVar("PayloadT")


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(float(value), upper))


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass(frozen=True)
class SourceHealthSnapshot:
    source_id: str
    ewma_success: float
    ewma_latency_ms: Optional[float]
    total_successes: int
    total_failures: int
    consecutive_failures: int
    circuit_state: CircuitState
    circuit_open_until: Optional[float]


@dataclass
class _MutableSourceHealth:
    ewma_success: float
    ewma_latency_ms: Optional[float] = None
    total_successes: int = 0
    total_failures: int = 0
    consecutive_failures: int = 0
    circuit_open_until: Optional[float] = None
    half_open_probe_in_flight: bool = False


class SourceHealthRegistry:
    """Thread-safe EWMA health registry with a small circuit breaker.

    ``clock`` is monotonic by default and injectable for deterministic tests.
    Once the failure threshold is reached, requests are denied for the cooldown
    period. Afterwards one half-open probe is permitted; a success closes the
    circuit and a failure opens it for another cooldown.
    """

    def __init__(
        self,
        *,
        ewma_alpha: float = 0.25,
        failure_threshold: int = 3,
        cooldown_seconds: float = 30.0,
        initial_success_score: float = 0.75,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not 0.0 < ewma_alpha <= 1.0:
            raise ValueError("ewma_alpha must be in (0, 1]")
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be at least 1")
        if cooldown_seconds < 0:
            raise ValueError("cooldown_seconds must not be negative")
        self.ewma_alpha = ewma_alpha
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.initial_success_score = _clamp(initial_success_score)
        self._clock = clock
        self._entries: dict[str, _MutableSourceHealth] = {}
        self._lock = threading.RLock()

    def _entry(self, source_id: str) -> _MutableSourceHealth:
        if not source_id:
            raise ValueError("source_id must not be empty")
        return self._entries.setdefault(
            source_id,
            _MutableSourceHealth(ewma_success=self.initial_success_score),
        )

    @staticmethod
    def _state(entry: _MutableSourceHealth, now: float) -> CircuitState:
        if entry.circuit_open_until is None:
            return CircuitState.CLOSED
        if now < entry.circuit_open_until:
            return CircuitState.OPEN
        return CircuitState.HALF_OPEN

    def get_snapshot(self, source_id: str) -> SourceHealthSnapshot:
        with self._lock:
            entry = self._entry(source_id)
            now = self._clock()
            return SourceHealthSnapshot(
                source_id=source_id,
                ewma_success=entry.ewma_success,
                ewma_latency_ms=entry.ewma_latency_ms,
                total_successes=entry.total_successes,
                total_failures=entry.total_failures,
                consecutive_failures=entry.consecutive_failures,
                circuit_state=self._state(entry, now),
                circuit_open_until=entry.circuit_open_until,
            )

    def allow_request(self, source_id: str) -> bool:
        """Return whether a request may be attempted without reserving a probe."""
        with self._lock:
            entry = self._entry(source_id)
            state = self._state(entry, self._clock())
            return state == CircuitState.CLOSED or (
                state == CircuitState.HALF_OPEN
                and not entry.half_open_probe_in_flight
            )

    def acquire_permission(self, source_id: str) -> bool:
        """Reserve permission for a request, including the sole half-open probe."""
        with self._lock:
            entry = self._entry(source_id)
            state = self._state(entry, self._clock())
            if state == CircuitState.OPEN:
                return False
            if state == CircuitState.HALF_OPEN:
                if entry.half_open_probe_in_flight:
                    return False
                entry.half_open_probe_in_flight = True
            return True

    def record_success(self, source_id: str, latency_ms: float) -> None:
        if not math.isfinite(latency_ms) or latency_ms < 0:
            raise ValueError("latency_ms must be a finite non-negative number")
        with self._lock:
            entry = self._entry(source_id)
            alpha = self.ewma_alpha
            entry.ewma_success = alpha + (1.0 - alpha) * entry.ewma_success
            entry.ewma_latency_ms = (
                latency_ms
                if entry.ewma_latency_ms is None
                else alpha * latency_ms + (1.0 - alpha) * entry.ewma_latency_ms
            )
            entry.total_successes += 1
            entry.consecutive_failures = 0
            entry.circuit_open_until = None
            entry.half_open_probe_in_flight = False

    def record_failure(self, source_id: str) -> None:
        with self._lock:
            entry = self._entry(source_id)
            state_before_failure = self._state(entry, self._clock())
            entry.ewma_success = (1.0 - self.ewma_alpha) * entry.ewma_success
            entry.total_failures += 1
            entry.consecutive_failures += 1
            if (
                state_before_failure != CircuitState.CLOSED
                or entry.consecutive_failures >= self.failure_threshold
            ):
                entry.circuit_open_until = self._clock() + self.cooldown_seconds
            entry.half_open_probe_in_flight = False

    def record_result(
        self,
        source_id: str,
        *,
        succeeded: bool,
        latency_ms: Optional[float] = None,
    ) -> None:
        if succeeded:
            if latency_ms is None:
                raise ValueError("a successful result requires latency_ms")
            self.record_success(source_id, latency_ms)
        else:
            self.record_failure(source_id)


@dataclass(frozen=True)
class SourceCandidate(Generic[PayloadT]):
    """A parsed source result and the quality signals known by its caller.

    ``coverage_ratio`` describes how much of the expected chapter range exists.
    ``completeness_ratio`` describes its internal gap-free quality. When either
    is unknown it receives a neutral score instead of being treated as perfect.
    """

    source_id: str
    value: PayloadT
    request_succeeded: bool = True
    latency_ms: Optional[float] = None
    updated_at: Optional[datetime] = None
    chapter_count: int = 0
    expected_chapter_count: Optional[int] = None
    coverage_ratio: Optional[float] = None
    completeness_ratio: Optional[float] = None


@dataclass(frozen=True)
class SelectorWeights:
    success: float = 0.24
    latency: float = 0.14
    freshness: float = 0.20
    coverage: float = 0.22
    completeness: float = 0.20

    def normalized(self) -> "SelectorWeights":
        values = (
            self.success,
            self.latency,
            self.freshness,
            self.coverage,
            self.completeness,
        )
        if any(value < 0 for value in values):
            raise ValueError("selector weights must not be negative")
        total = sum(values)
        if total <= 0:
            raise ValueError("at least one selector weight must be positive")
        return SelectorWeights(*(value / total for value in values))


@dataclass(frozen=True)
class ScoreComponents:
    availability: float
    success: float
    latency: float
    freshness: float
    coverage: float
    completeness: float
    total: float


@dataclass(frozen=True)
class RankedCandidate(Generic[PayloadT]):
    candidate: SourceCandidate[PayloadT]
    components: ScoreComponents

    @property
    def score(self) -> float:
        return self.components.total


class AdaptiveSourceSelector:
    """Rank usable source results using health and content quality."""

    def __init__(
        self,
        health: Optional[SourceHealthRegistry] = None,
        *,
        weights: SelectorWeights = SelectorWeights(),
        target_latency_ms: float = 750.0,
        freshness_half_life_seconds: float = 7 * 24 * 60 * 60,
        unknown_quality_score: float = 0.5,
    ) -> None:
        if target_latency_ms <= 0:
            raise ValueError("target_latency_ms must be positive")
        if freshness_half_life_seconds <= 0:
            raise ValueError("freshness_half_life_seconds must be positive")
        self.health = health or SourceHealthRegistry()
        self.weights = weights.normalized()
        self.target_latency_ms = target_latency_ms
        self.freshness_half_life_seconds = freshness_half_life_seconds
        self.unknown_quality_score = _clamp(unknown_quality_score)

    def record_success(self, source_id: str, latency_ms: float) -> None:
        self.health.record_success(source_id, latency_ms)

    def record_failure(self, source_id: str) -> None:
        self.health.record_failure(source_id)

    def allow_request(self, source_id: str) -> bool:
        return self.health.allow_request(source_id)

    def acquire_permission(self, source_id: str) -> bool:
        return self.health.acquire_permission(source_id)

    def _latency_score(
        self,
        candidate: SourceCandidate[PayloadT],
        health: SourceHealthSnapshot,
    ) -> float:
        latency = candidate.latency_ms
        if latency is None:
            latency = health.ewma_latency_ms
        if latency is None:
            return self.unknown_quality_score
        if not math.isfinite(latency) or latency < 0:
            return 0.0
        return 1.0 / (1.0 + latency / self.target_latency_ms)

    def _freshness_score(
        self,
        updated_at: Optional[datetime],
        now: datetime,
    ) -> float:
        if updated_at is None:
            return self.unknown_quality_score
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        age = max(0.0, (now - updated_at.astimezone(timezone.utc)).total_seconds())
        return 0.5 ** (age / self.freshness_half_life_seconds)

    def _coverage_score(self, candidate: SourceCandidate[PayloadT]) -> float:
        if candidate.coverage_ratio is not None:
            return _clamp(candidate.coverage_ratio)
        if (
            candidate.expected_chapter_count is not None
            and candidate.expected_chapter_count > 0
        ):
            return _clamp(
                candidate.chapter_count / candidate.expected_chapter_count
            )
        return self.unknown_quality_score

    def _completeness_score(self, candidate: SourceCandidate[PayloadT]) -> float:
        if candidate.completeness_ratio is not None:
            return _clamp(candidate.completeness_ratio)
        return self.unknown_quality_score

    def score_candidate(
        self,
        candidate: SourceCandidate[PayloadT],
        *,
        now: Optional[datetime] = None,
    ) -> RankedCandidate[PayloadT]:
        if not candidate.source_id:
            raise ValueError("candidate source_id must not be empty")
        health = self.health.get_snapshot(candidate.source_id)
        availability = (
            0.0
            if health.circuit_state == CircuitState.OPEN
            or not candidate.request_succeeded
            else 1.0
        )
        now_utc = now or datetime.now(timezone.utc)
        if now_utc.tzinfo is None:
            now_utc = now_utc.replace(tzinfo=timezone.utc)
        else:
            now_utc = now_utc.astimezone(timezone.utc)

        success = health.ewma_success if candidate.request_succeeded else 0.0
        latency = self._latency_score(candidate, health)
        freshness = self._freshness_score(candidate.updated_at, now_utc)
        coverage = self._coverage_score(candidate)
        completeness = self._completeness_score(candidate)
        weighted = (
            self.weights.success * success
            + self.weights.latency * latency
            + self.weights.freshness * freshness
            + self.weights.coverage * coverage
            + self.weights.completeness * completeness
        )
        components = ScoreComponents(
            availability=availability,
            success=success,
            latency=latency,
            freshness=freshness,
            coverage=coverage,
            completeness=completeness,
            total=availability * weighted,
        )
        return RankedCandidate(candidate=candidate, components=components)

    def rank_candidates(
        self,
        candidates: Iterable[SourceCandidate[PayloadT]],
        *,
        now: Optional[datetime] = None,
        include_unavailable: bool = False,
    ) -> list[RankedCandidate[PayloadT]]:
        ranked = [
            self.score_candidate(candidate, now=now)
            for candidate in candidates
        ]
        if not include_unavailable:
            ranked = [item for item in ranked if item.components.availability > 0]
        return sorted(
            ranked,
            key=lambda item: (-item.score, item.candidate.source_id),
        )

    def choose(
        self,
        candidates: Iterable[SourceCandidate[PayloadT]],
        *,
        now: Optional[datetime] = None,
    ) -> Optional[RankedCandidate[PayloadT]]:
        ranked = self.rank_candidates(candidates, now=now)
        return ranked[0] if ranked else None
