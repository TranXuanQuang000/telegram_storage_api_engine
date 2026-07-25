import asyncio
import time
import pytest
import httpx

from app.main import app
from app.services.aggregator import get_aggregator_service
from tests.test_api import api_mock_handler


@pytest.fixture(autouse=True)
def setup_aggregator():
    aggregator = get_aggregator_service()
    aggregator.clear_cache()
    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(api_mock_handler))
    aggregator.set_client(mock_client)
    yield
    aggregator.clear_cache()


@pytest.mark.asyncio
async def test_ep1_malformed_page_and_limit():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Invalid page
        res1 = await client.get("/v1/api/danh-sach/truyen-moi?page=0")
        assert res1.status_code == 422, "page=0 must return 422"

        res2 = await client.get("/v1/api/danh-sach/truyen-moi?page=-5")
        assert res2.status_code == 422, "page=-5 must return 422"

        res3 = await client.get("/v1/api/danh-sach/truyen-moi?page=abc")
        assert res3.status_code == 422, "page=abc must return 422"

        # Invalid limit
        res4 = await client.get("/v1/api/danh-sach/truyen-moi?limit=0")
        assert res4.status_code == 422, "limit=0 must return 422"

        res5 = await client.get("/v1/api/danh-sach/truyen-moi?limit=-10")
        assert res5.status_code == 422, "limit=-10 must return 422"

        res6 = await client.get("/v1/api/danh-sach/truyen-moi?limit=101")
        assert res6.status_code == 422, "limit=101 must return 422 (le=100)"

        res7 = await client.get("/v1/api/danh-sach/truyen-moi?limit=999999")
        assert res7.status_code == 422, "limit=999999 must return 422"


@pytest.mark.asyncio
async def test_ep1_boundary_values():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.get("/v1/api/danh-sach/truyen-moi?page=1&limit=1")
        assert res1.status_code == 200, "limit=1 should return 200"

        res2 = await client.get("/v1/api/danh-sach/truyen-moi?page=1&limit=100")
        assert res2.status_code == 200, "limit=100 should return 200"


@pytest.mark.asyncio
async def test_ep2_non_existent_comic_slug():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/v1/api/truyen-tranh/non-existent-slug-xyz")
        assert res.status_code == 404, "non-existent comic slug must return 404"


@pytest.mark.asyncio
async def test_ep2_adversarial_comic_slugs():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.get("/v1/api/truyen-tranh/<script>alert(1)</script>")
        assert res1.status_code in [404, 400], "script tag in slug must be handled cleanly"

        long_slug = "a" * 1000
        res2 = await client.get(f"/v1/api/truyen-tranh/{long_slug}")
        assert res2.status_code == 404, "1000-char slug must return 404"


@pytest.mark.asyncio
async def test_ep3_non_existent_chapter_id():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/v1/api/chapter/non-existent-ch-id-999")
        assert res.status_code == 404, "non-existent comic chapter ID must return 404"


@pytest.mark.asyncio
async def test_ep4_novel_catalog_edge_cases():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.get("/v1/api/truyen-chu/danh-sach?page=0")
        assert res1.status_code == 422, "novel catalog page=0 must return 422"

        res2 = await client.get("/v1/api/truyen-chu/danh-sach?limit=200")
        assert res2.status_code == 422, "novel catalog limit=200 must return 422"

        res3 = await client.get("/v1/api/truyen-chu/danh-sach?source=unknown_source_xyz")
        assert res3.status_code == 200, "unknown source should default gracefully"
        assert res3.json()["status"] == "success"

        res4 = await client.get("/v1/api/truyen-chu/danh-sach?page=1&limit=100")
        assert res4.status_code == 200, "novel catalog limit=100 must return 200"


@pytest.mark.asyncio
async def test_ep5_non_existent_novel_slug():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/v1/api/truyen-chu/non-existent-novel-slug")
        assert res.status_code == 404, "non-existent novel slug must return 404"


@pytest.mark.asyncio
async def test_ep6_novel_chapter_valid_and_non_existent_novel():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res2 = await client.get("/v1/api/truyen-chu/non-existent-novel/chapter/c1")
        assert res2.status_code == 404, "non-existent novel and chapter must return 404"

        res3 = await client.get("/v1/api/truyen-chu/overlord/chapter/c1?as_html=invalid_bool")
        assert res3.status_code == 422, "as_html=invalid_bool must return 422"

        res4 = await client.get("/v1/api/truyen-chu/overlord/chapter/../../etc/passwd")
        assert res4.status_code == 404, "path traversal in chapter_no must return 404"


@pytest.mark.asyncio
@pytest.mark.xfail(reason="BUG: AggregatorService.get_novel_chapter assigns empty ChapterContent object when connector returns empty text, preventing 404 exception on missing chapter")
async def test_ep6_novel_chapter_non_existent_chapter_bug():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.get("/v1/api/truyen-chu/overlord/chapter/c9999")
        assert res1.status_code == 404, "non-existent novel chapter must return 404"


@pytest.mark.asyncio
async def test_high_concurrency_stress():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        endpoints_pool = [
            "/v1/api/danh-sach/truyen-moi?page=1&limit=20",
            "/v1/api/truyen-tranh/one-piece",
            "/v1/api/chapter/ch1",
            "/v1/api/truyen-chu/danh-sach?page=1&limit=20&source=hako",
            "/v1/api/truyen-chu/overlord?source=hako",
            "/v1/api/truyen-chu/overlord/chapter/c1?source=hako",
            "/v1/api/truyen-tranh/non-existent-slug",
            "/v1/api/truyen-chu/non-existent-novel",
        ]

        tasks = [client.get(endpoints_pool[i % len(endpoints_pool)]) for i in range(100)]
        t0 = time.perf_counter()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = time.perf_counter() - t0

        assert elapsed < 3.0, f"100 concurrent requests took too long: {elapsed:.2f}s"
        assert len(results) == 100

        for idx, res in enumerate(results):
            assert not isinstance(res, Exception), f"Request {idx} raised an exception: {res}"
            url = endpoints_pool[idx % len(endpoints_pool)]
            if "non-existent" in url:
                assert res.status_code == 404, f"Expected 404 for {url}, got {res.status_code}"
            else:
                assert res.status_code == 200, f"Expected 200 for {url}, got {res.status_code}"
                assert "X-Response-Time-Ms" in res.headers
