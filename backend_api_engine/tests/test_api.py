import time
import pytest
import httpx

from app.main import app
from app.services.aggregator import get_aggregator_service


def api_mock_handler(request: httpx.Request) -> httpx.Response:
    url_str = str(request.url)

    # MangaDex public API fixtures
    if "api.mangadex.org/manga/md-story/feed" in url_str:
        return httpx.Response(200, json={
            "result": "ok",
            "total": 1,
            "data": [{
                "id": "md-chapter-1",
                "attributes": {
                    "chapter": "1",
                    "title": "Khởi đầu",
                    "translatedLanguage": "vi",
                },
            }],
        })

    if "api.mangadex.org/manga/md-story" in url_str:
        return httpx.Response(200, json={
            "result": "ok",
            "data": {
                "id": "md-story",
                "attributes": {
                    "title": {"vi": "Manga Kiểm Thử"},
                    "description": {"vi": "Mô tả"},
                    "status": "ongoing",
                    "contentRating": "safe",
                    "tags": [],
                },
                "relationships": [],
            },
        })

    if "api.mangadex.org/at-home/server/md-chapter-1" in url_str:
        return httpx.Response(200, json={
            "result": "ok",
            "baseUrl": "https://uploads.mangadex.org",
            "chapter": {
                "hash": "safehash",
                "data": ["001.jpg", "002.jpg"],
                "dataSaver": ["001-s.jpg", "002-s.jpg"],
            },
        })

    # 1. OTruyen mock endpoints
    if any(endpoint in url_str for endpoint in [
        "otruyenapi.com/v1/api/home",
        "otruyenapi.com/v1/api/danh-sach/truyen-moi",
        "otruyenapi.com/v1/api/danh-sach/hoan-thanh",
        "otruyenapi.com/v1/api/danh-sach/dang-phat-hanh",
        "otruyenapi.com/v1/api/the-loai/action",
        "otruyenapi.com/v1/api/tim-kiem",
    ]):
        data = {
            "status": "success",
            "message": "",
            "data": {
                "items": [
                    {
                        "_id": "64fe09123",
                        "name": "One Piece",
                        "slug": "one-piece",
                        "status": "ongoing",
                        "thumb_url": "one-piece.jpg",
                        "category": [{"name": "Action"}],
                        "updatedAt": "2026-01-01T00:00:00Z",
                    }
                ],
                "params": {
                    "pagination": {
                        "totalItems": 100,
                        "totalItemsPerPage": 20,
                        "currentPage": 1,
                        "pageItems": 1,
                    }
                },
                "APP_DOMAIN_CDN_IMAGE": "https://otruyencdn.com/uploads/comics",
            },
        }
        return httpx.Response(200, json=data)

    if "otruyenapi.com/v1/api/the-loai" in url_str:
        return httpx.Response(200, json={
            "status": "success",
            "data": {"items": [{"name": "Action", "slug": "action"}]},
        })

    if "otruyenapi.com/v1/api/truyen-tranh/one-piece" in url_str:
        data = {
            "status": "success",
            "message": "",
            "data": {
                "item": {
                    "_id": "64fe09123",
                    "name": "One Piece",
                    "slug": "one-piece",
                    "content": "<p>Pirate adventure</p>",
                    "status": "ongoing",
                    "thumb_url": "one-piece.jpg",
                    "author": ["Eiichiro Oda"],
                    "category": [{"name": "Action"}],
                    "updatedAt": "2026-01-01T00:00:00Z",
                    "chapters": [
                        {
                            "server_name": "Server 1",
                            "server_data": [
                                {
                                    "filename": "1",
                                    "chapter_name": "1",
                                    "chapter_title": "Romance Dawn",
                                    "chapter_api_data": "https://otruyenapi.com/v1/api/chapter/ch1",
                                },
                                {
                                    "filename": "2",
                                    "chapter_name": "2",
                                    "chapter_title": "That Guy Luffy",
                                    "chapter_api_data": "https://otruyenapi.com/v1/api/chapter/ch2",
                                },
                            ],
                        }
                    ],
                },
                "APP_DOMAIN_CDN_IMAGE": "https://otruyencdn.com/uploads/comics",
            },
        }
        return httpx.Response(200, json=data)

    if (
        "otruyenapi.com/v1/api/chapter/ch1" in url_str
        or "sv1.otruyencdn.com/v1/api/chapter/ch1" in url_str
    ):
        data = {
            "status": "success",
            "message": "",
            "data": {
                "domain_cdn": "https://sv1.otruyencdn.com",
                "item": {
                    "_id": "ch1",
                    "chapter_name": "1",
                    "chapter_title": "Romance Dawn",
                    "chapter_path": "2026/01/one-piece",
                    "chapter_image": [
                        {"image_page": 1, "image_file": "001.jpg"},
                        {"image_page": 2, "image_file": "002.jpg"},
                    ],
                },
            },
        }
        return httpx.Response(200, json=data)

    # 2. Hako Novel mock endpoints
    if "ln.hako.vn/danh-sach" in url_str:
        html = """
        <html>
            <body>
                <div class="thumb-item-flow">
                    <div class="series-title"><a href="/truyen/overlord">Overlord Novel</a></div>
                    <div class="img-in-ratio" style="background-image: url('https://ln.hako.vn/covers/overlord.jpg');"></div>
                </div>
            </body>
        </html>
        """
        return httpx.Response(200, text=html)

    if "ln.hako.vn/truyen/overlord/c1" in url_str:
        html = """
        <html>
            <body>
                <h2 class="title-item">Chương 1: Khởi Đầu Mới</h2>
                <div id="chapter-content">
                    <script>var ad=1;</script>
                    <div class="ads-container">Quảng cáo Hako</div>
                    <p>Nguồn: ln.hako.vn</p>
                    <p>Ainz Ooal Gown ngước nhìn trần nhà đại lăng thư.</p>
                    <p>Các Vệ Thần Tầng đứng nghiêm trang xung quanh bàn cờ.</p>
                </div>
            </body>
        </html>
        """
        return httpx.Response(200, text=html)

    if "ln.hako.vn/truyen/overlord" in url_str:
        # Chapters 1..5 and 11..15 (Gap: 6..10)
        ch_items = "".join([
            f'<li><a href="/truyen/overlord/c{i}">Chương {i:02d}: Tựa chương {i}</a></li>'
            for i in list(range(1, 6)) + list(range(11, 16))
        ])
        html = f"""
        <html>
            <body>
                <div class="series-name"><a href="/truyen/overlord">Overlord Novel</a></div>
                <div class="info-item">Tác giả: <span class="info-value">Kugane Maruyama</span></div>
                <div class="info-item">Tình trạng: <span class="info-value">Đang tiến hành</span></div>
                <div class="summary-content"><p>Ainz Ooal Gown is transported to a fantasy world.</p></div>
                <div class="feature-img"><div class="img-in-ratio" style="background-image: url('https://ln.hako.vn/covers/overlord.jpg');"></div></div>
                <div class="series-genders"><a href="/g/fantasy">Fantasy</a></div>
                <div class="list-chapters">
                    {ch_items}
                </div>
            </body>
        </html>
        """
        return httpx.Response(200, text=html)

    # 3. TruyenFull Novel mock endpoints
    if "truyenfull.io/overlord" in url_str or "truyenfull.vn/overlord" in url_str:
        # Chapters 6..10 (fills gap)
        ch_items = "".join([
            f'<li><a href="https://truyenfull.vn/overlord/chuong-{i}/">Chương {i}: Tựa truyenfull {i}</a></li>'
            for i in range(6, 11)
        ])
        html = f"""
        <html>
            <body>
                <h3 class="title">Overlord Novel</h3>
                <a itemprop="author">Kugane Maruyama</a>
                <div class="desc-text">Mô tả Overlord</div>
                <div class="book"><img src="/covers/overlord.jpg" /></div>
                <a itemprop="genre">Dark Fantasy</a>
                <div class="info"><span class="text-success">Đang ra</span></div>
                <div class="list-chapter">
                    {ch_items}
                </div>
            </body>
        </html>
        """
        return httpx.Response(200, text=html)

    if "truyenfull.io/overlord/chuong-6" in url_str or "truyenfull.vn/overlord/chuong-6" in url_str:
        html = """
        <html>
            <body>
                <div class="chapter-title">Chương 6: Cuộc Đụng Độ</div>
                <div id="chapter-c">
                    <p>Nguồn: truyenfull.io</p>
                    <p>Nội dung chương 6 lấp khoảng trống từ TruyenFull.</p>
                </div>
            </body>
        </html>
        """
        return httpx.Response(200, text=html)

    return httpx.Response(404, text="Not Found")


@pytest.fixture(autouse=True)
def setup_aggregator_client():
    aggregator = get_aggregator_service()
    aggregator.clear_cache()
    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(api_mock_handler))
    aggregator.set_client(mock_client)
    yield
    aggregator.clear_cache()


@pytest.mark.asyncio
async def test_otruyen_catalog_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        t0 = time.perf_counter()
        resp = await client.get("/v1/api/danh-sach/truyen-moi?page=1&limit=20")
        latency = time.perf_counter() - t0

        assert resp.status_code == 200
        assert latency < 1.5
        assert "X-Response-Time-Ms" in resp.headers

        data = resp.json()
        assert data.get("status") == "success"
        assert "data" in data
        assert "items" in data["data"]
        items = data["data"]["items"]
        assert len(items) >= 1
        assert items[0]["slug"] == "one-piece"


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", [
    "/v1/api/home",
    "/v1/api/danh-sach/hoan-thanh?page=1",
    "/v1/api/danh-sach/dang-phat-hanh?page=1",
    "/v1/api/the-loai/action?page=1",
    "/v1/api/tim-kiem?keyword=one%20piece&page=1",
])
async def test_otruyen_drop_in_list_endpoints(endpoint):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(endpoint)
        assert resp.status_code == 200
        assert resp.json()["data"]["items"][0]["slug"] == "one-piece"


@pytest.mark.asyncio
async def test_otruyen_genres_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/v1/api/the-loai")
        assert resp.status_code == 200
        assert resp.json()["data"]["items"][0]["slug"] == "action"


@pytest.mark.asyncio
async def test_otruyen_comic_detail_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        t0 = time.perf_counter()
        resp = await client.get("/v1/api/truyen-tranh/one-piece")
        latency = time.perf_counter() - t0

        assert resp.status_code == 200
        assert latency < 1.5
        assert "X-Response-Time-Ms" in resp.headers

        data = resp.json()
        assert data.get("status") == "success"
        assert "item" in data["data"]
        item = data["data"]["item"]
        assert item["slug"] == "one-piece"
        assert len(item["chapters"][0]["server_data"]) == 2
        assert item["chapters"][0]["server_data"][0]["chapter_api_data"] == "/v1/api/chapter/ch1"
        assert item["source_name"] == "otruyen"


@pytest.mark.asyncio
async def test_otruyen_chapter_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        t0 = time.perf_counter()
        resp = await client.get("/v1/api/chapter/ch1")
        latency = time.perf_counter() - t0

        assert resp.status_code == 200
        assert latency < 1.5
        assert "X-Response-Time-Ms" in resp.headers

        data = resp.json()
        assert data.get("status") == "success"
        assert "domain_cdn" in data["data"]
        assert "chapter_image" in data["data"]["item"]
        assert len(data["data"]["item"]["chapter_image"]) == 2


@pytest.mark.asyncio
async def test_novel_catalog_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        t0 = time.perf_counter()
        resp = await client.get("/v1/api/truyen-chu/danh-sach?page=1&limit=20&source=hako")
        latency = time.perf_counter() - t0

        assert resp.status_code == 200
        assert latency < 1.5
        assert "X-Response-Time-Ms" in resp.headers

        data = resp.json()
        assert data.get("status") == "success"
        assert "items" in data["data"]
        assert len(data["data"]["items"]) >= 1
        assert data["data"]["items"][0]["title"] == "Overlord Novel"
        assert data["data"]["items"][0]["source"] == "hako"
        assert data["data"]["items"][0]["source_url"].endswith("/truyen/overlord")


@pytest.mark.asyncio
async def test_novel_detail_gap_filling_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        t0 = time.perf_counter()
        resp = await client.get("/v1/api/truyen-chu/overlord?source=hako")
        latency = time.perf_counter() - t0

        assert resp.status_code == 200
        assert latency < 1.5
        assert "X-Response-Time-Ms" in resp.headers

        data = resp.json()
        assert data.get("status") == "success"
        item = data["data"]["item"]
        assert item["slug"] == "overlord"
        assert item["source"] == "hako"
        assert item["source_url"].endswith("/truyen/overlord")

        chapters = item["chapters"]
        assert len(chapters) == 15

        # Check filled chapters (6..10)
        filled_chapters = [ch for ch in chapters if ch["is_filled"]]
        assert len(filled_chapters) == 5
        for ch in filled_chapters:
            assert ch["original_source"] == "truyenfull"

        # Check non-filled primary chapters (1..5 and 11..15)
        primary_chapters = [ch for ch in chapters if not ch["is_filled"]]
        assert len(primary_chapters) == 10
        for ch in primary_chapters:
            assert ch["original_source"] == "hako"


@pytest.mark.asyncio
async def test_novel_chapter_cleaned_text_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        t0 = time.perf_counter()
        resp = await client.get("/v1/api/truyen-chu/overlord/chapter/c1?source=hako")
        latency = time.perf_counter() - t0

        assert resp.status_code == 200
        assert latency < 1.5
        assert "X-Response-Time-Ms" in resp.headers

        data = resp.json()
        assert data.get("status") == "success"
        text = data["data"]["text_content"]
        assert data["data"]["source"] == "hako"
        assert data["data"]["source_url"].endswith("/truyen/overlord/c1")

        # Cleaned text verifications
        assert "<script>" not in text
        assert "ads-container" not in text
        assert "Quảng cáo Hako" not in text
        assert "Nguồn: ln.hako.vn" not in text
        assert "<p>Ainz Ooal Gown ngước nhìn trần nhà đại lăng thư.</p>" in text
        assert "<p>Các Vệ Thần Tầng đứng nghiêm trang xung quanh bàn cờ.</p>" in text


@pytest.mark.asyncio
async def test_response_latency_threshold():
    endpoints = [
        "/v1/api/danh-sach/truyen-moi",
        "/v1/api/truyen-tranh/one-piece",
        "/v1/api/chapter/ch1",
        "/v1/api/truyen-chu/danh-sach",
        "/v1/api/truyen-chu/overlord",
        "/v1/api/truyen-chu/overlord/chapter/c1",
    ]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for ep in endpoints:
            t0 = time.perf_counter()
            resp = await client.get(ep)
            latency = time.perf_counter() - t0
            assert resp.status_code == 200
            assert latency < 1.5, f"Endpoint {ep} exceeded latency limit: {latency:.4f}s"


@pytest.mark.asyncio
async def test_novel_chapter_non_existent_returns_404():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/v1/api/truyen-chu/overlord/chapter/non-existent-999?source=hako")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unknown_novel_source_is_rejected():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/v1/api/truyen-chu/danh-sach?source=unknown")
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_comic_chapter_rejects_url_shaped_identifier():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/v1/api/chapter/https%3A%2F%2Fexample.com%2Fprivate")
        assert resp.status_code in {400, 404}


@pytest.mark.asyncio
async def test_mangadex_uses_same_otruyen_compatible_detail_and_chapter_contract():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        detail = await client.get("/v1/api/truyen-tranh/md-story?source=mangadex")
        assert detail.status_code == 200
        item = detail.json()["data"]["item"]
        assert item["source_name"] == "mangadex"
        chapter_url = item["chapters"][0]["server_data"][0]["chapter_api_data"]
        assert chapter_url.startswith("/v1/api/chapter/ms1.")

        chapter = await client.get(chapter_url)
        assert chapter.status_code == 200
        data = chapter.json()["data"]
        assert data["source_name"] == "mangadex"
        assert len(data["item"]["chapter_image"]) == 2
        assert data["item"]["chapter_path"] == "data/safehash"


@pytest.mark.asyncio
async def test_optional_api_token_protects_content_but_not_health(monkeypatch):
    monkeypatch.setenv("MUC_API_TOKEN", "test-secret")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        unauthenticated = await client.get("/v1/api/danh-sach/truyen-moi")
        authenticated = await client.get(
            "/v1/api/danh-sach/truyen-moi",
            headers={"Authorization": "Bearer test-secret"},
        )
        health = await client.get("/health")

    assert unauthenticated.status_code == 401
    assert authenticated.status_code == 200
    assert health.status_code == 200
    assert health.json()["capabilities"]["api_token"] is True


@pytest.mark.asyncio
async def test_auto_source_is_default_and_exposes_selection_provenance():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        detail = await client.get("/v1/api/truyen-tranh/one-piece")
        health = await client.get("/v1/api/sources/health")

    assert detail.status_code == 200
    selection = detail.json()["data"]["item"]["source_selection"]
    assert selection["mode"] == "auto"
    assert selection["selected_source"] == "otruyen"
    assert "chapter_coverage" in selection["selection_policy"]
    assert health.status_code == 200
    assert health.json()["data"]["policy"] == (
        "health+latency+freshness+coverage+completeness"
    )
