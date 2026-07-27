import time
import asyncio
import pytest
import httpx

from app.main import app
from app.services.aggregator import get_aggregator_service
from app.engine.cleaner import NovelTextCleaner
from app.engine.merger import SmartChapterMerger, GapDetector
from app.models.chapter import ChapterHeader
from tests.test_api import api_mock_handler


@pytest.fixture(autouse=True)
def setup_aggregator_client(monkeypatch):
    monkeypatch.setenv("NOVEL_CATALOG_SNAPSHOT_ENABLED", "false")
    aggregator = get_aggregator_service()
    aggregator.clear_cache()
    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(api_mock_handler))
    aggregator.set_client(mock_client)
    yield
    aggregator.clear_cache()


# ---------------------------------------------------------------------------
# 1. API JSON Response Time & Latency Verification (< 1.5s)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_empirical_api_latency_under_1_5s():
    """Verify all API JSON response times are under 1.5 seconds."""
    endpoints = [
        "/v1/api/danh-sach/truyen-moi?page=1&limit=20",
        "/v1/api/truyen-tranh/one-piece",
        "/v1/api/chapter/ch1",
        "/v1/api/truyen-chu/danh-sach?page=1&limit=20&source=hako",
        "/v1/api/truyen-chu/overlord?source=hako",
        "/v1/api/truyen-chu/overlord/chapter/c1?source=hako",
    ]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for ep in endpoints:
            start = time.perf_counter()
            resp = await client.get(ep)
            duration = time.perf_counter() - start

            assert resp.status_code == 200, f"Endpoint {ep} returned HTTP {resp.status_code}"
            assert duration < 1.5, f"Endpoint {ep} exceeded 1.5s threshold: {duration:.4f}s"
            assert "X-Response-Time-Ms" in resp.headers


@pytest.mark.asyncio
async def test_empirical_concurrent_stress_latency():
    """Verify latency stays under 1.5s under 60 concurrent requests."""
    endpoints = [
        "/v1/api/danh-sach/truyen-moi?page=1&limit=20",
        "/v1/api/truyen-tranh/one-piece",
        "/v1/api/chapter/ch1",
        "/v1/api/truyen-chu/danh-sach?page=1&limit=20&source=hako",
        "/v1/api/truyen-chu/overlord?source=hako",
        "/v1/api/truyen-chu/overlord/chapter/c1?source=hako",
    ] * 10  # 60 requests

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        async def fetch(ep):
            t0 = time.perf_counter()
            r = await client.get(ep)
            dt = time.perf_counter() - t0
            return r.status_code, dt

        tasks = [fetch(ep) for ep in endpoints]
        results = await asyncio.gather(*tasks)

        for status_code, dt in results:
            assert status_code == 200
            assert dt < 1.5, f"Concurrent request exceeded 1.5s: {dt:.4f}s"


# ---------------------------------------------------------------------------
# 2. Smart Chapter Merge & Gap Filling Verification (Standard Case)
# ---------------------------------------------------------------------------

def test_empirical_smart_chapter_merge_standard():
    """
    Verify Smart Chapter Merge & Gap Filling:
    Source A missing ch 10-20 is automatically filled by Source B ch 10-20
    with proper `is_filled=True` provenance tags.
    """
    source_a = [
        ChapterHeader(external_id=f"a_{i}", title=f"Chương {i}", chapter_number=str(i))
        for i in list(range(1, 10)) + list(range(21, 51))
    ]

    source_b = [
        ChapterHeader(external_id=f"b_{i}", title=f"Chương {i} từ Nguồn B", chapter_number=str(i))
        for i in range(1, 51)
    ]

    merger = SmartChapterMerger()
    merged = merger.merge(
        primary_chapters=source_a,
        secondary_sources=[("Source B", source_b)],
        primary_source_name="Source A",
    )

    assert len(merged) == 50

    for ch in merged:
        c_num = int(ch.chapter_number)
        meta = ch.raw_metadata or {}
        if 10 <= c_num <= 20:
            assert meta.get("is_filled") is True
            assert meta.get("original_source") == "Source B"
            assert "merged_at" in meta
        else:
            assert meta.get("is_filled") is False
            assert meta.get("original_source") == "Source A"


# ---------------------------------------------------------------------------
# 3. Bug Harnesses - Empirical Demonstrations of System Vulnerabilities
# ---------------------------------------------------------------------------

def test_bug_watermark_cleaner_fragment_leak():
    """
    VERIFY FIX 1: Watermark cleaner regex ordering flaw fixed.
    Longer regex 'Chúc bạn có những giây phút vui vẻ khi đọc truyện tại...' matches before
    shorter regex 'Đọc truyện tại...', leaving no orphan phrase.
    """
    cleaner = NovelTextCleaner()
    html = "<p>Chúc bạn có những giây phút vui vẻ khi đọc truyện tại truyenfull.vn</p>"
    cleaned = cleaner.clean(html, as_html=True)

    # Verify fix: no orphan prefix fragment remains in output
    has_leak = "Chúc bạn có những giây phút vui vẻ" in cleaned
    assert not has_leak, "Watermark cleaner should remove entire watermark sentence without fragment leak"


def test_bug_merger_ch0_gap_detection():
    """
    VERIFY FIX 2: GapDetector includes Chapter 0 / Prologue.
    'key.chapter_float >= 0' includes Chapter 0, correctly detecting gap (1, 4) between Ch 0 and Ch 5.
    """
    ch0 = ChapterHeader(external_id="0", title="Chương 0", chapter_number="0")
    ch5 = ChapterHeader(external_id="5", title="Chương 5", chapter_number="5")

    gaps = GapDetector.detect_gaps([ch0, ch5])
    assert gaps == [(1, 4)], "GapDetector should detect gap between Ch 0 and Ch 5"


def test_bug_merger_fractional_subchapter_drop():
    """
    VERIFY FIX 3: SmartChapterMerger includes fractional sub-chapters (e.g., 10.5).
    'gap_start <= key.chapter_float < gap_end + 1.0' includes 10.5 when gap range is [10, 10].
    """
    primary = [
        ChapterHeader(external_id="1", title="Chương 1", chapter_number="1"),
        ChapterHeader(external_id="9", title="Chương 9", chapter_number="9"),
        ChapterHeader(external_id="11", title="Chương 11", chapter_number="11"),
    ]
    secondary = [
        ChapterHeader(external_id="10", title="Chương 10", chapter_number="10"),
        ChapterHeader(external_id="10.5", title="Chương 10.5", chapter_number="10.5"),
    ]

    merger = SmartChapterMerger()
    res = merger.merge(primary, [("SrcB", secondary)], "SrcA")
    ch_nums = [ch.chapter_number for ch in res]

    assert "10.5" in ch_nums, "Chapter 10.5 should be included in merged output"
