import json
import pytest
import httpx

from app.models.story import StoryMedium, StoryStatus, ContentRating
from app.connectors.comic.otruyen import OTruyenConnector
from app.connectors.comic.mangadex import MangaDexConnector
from app.connectors.comic.html_scraper import HtmlComicScraper
from app.connectors.novel.hako import HakoConnector
from app.connectors.novel.truyenfull import TruyenFullConnector
from app.connectors.novel.metruyenchu import MetruyenchuConnector


def create_mock_transport(handler):
    return httpx.MockTransport(handler)


# --- OTruyen Tests ---
@pytest.mark.asyncio
async def test_otruyen_connector():
    def otruyen_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        if "danh-sach/truyen-moi" in url_str or "the-loai" in url_str:
            data = {
                "status": "success",
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
                        }
                    },
                    "APP_DOMAIN_CDN_IMAGE": "https://otruyencdn.com/uploads/comics",
                },
            }
            return httpx.Response(200, json=data)

        if "truyen-tranh/one-piece" in url_str:
            data = {
                "status": "success",
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
                                    }
                                ],
                            }
                        ],
                    },
                    "APP_DOMAIN_CDN_IMAGE": "https://otruyencdn.com/uploads/comics",
                },
            }
            return httpx.Response(200, json=data)

        if "chapter/ch1" in url_str:
            data = {
                "status": "success",
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

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(otruyen_handler))
    connector = OTruyenConnector(client=client)

    # 1. Health check
    assert await connector.health_check() is True

    # 2. Catalog
    catalog = await connector.fetch_catalog(page=1)
    assert len(catalog.stories) == 1
    assert catalog.stories[0].title == "One Piece"
    assert catalog.stories[0].medium == StoryMedium.COMIC
    assert catalog.stories[0].cover_url == "https://otruyencdn.com/uploads/comics/one-piece.jpg"

    # 3. Story detail
    story = await connector.fetch_story("one-piece")
    assert story.title == "One Piece"
    assert story.author == "Eiichiro Oda"
    assert story.description == "Pirate adventure"
    assert len(story.chapters) == 1
    assert story.chapters[0].chapter_number == "1"

    # 4. Chapter detail
    chapter = await connector.fetch_chapter("one-piece", "ch1")
    assert chapter.title == "Chapter 1: Romance Dawn"
    assert len(chapter.images) == 2
    assert chapter.images[0] == "https://sv1.otruyencdn.com/2026/01/one-piece/001.jpg"

    await connector.close()


# --- MangaDex Tests ---
@pytest.mark.asyncio
async def test_mangadex_connector():
    def mangadex_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        if "ping" in url_str:
            return httpx.Response(200, text="pong")

        if "/manga/manga-123/feed" in url_str:
            data = {
                "result": "ok",
                "data": [
                    {
                        "id": "ch-999",
                        "attributes": {
                            "chapter": "1",
                            "title": "First Level",
                            "updatedAt": "2026-01-01T00:00:00Z",
                        },
                    }
                ],
            }
            return httpx.Response(200, json=data)

        if "/manga/manga-123" in url_str:
            data = {
                "result": "ok",
                "data": {
                    "id": "manga-123",
                    "type": "manga",
                    "attributes": {
                        "title": {"en": "Solo Leveling"},
                        "description": {"en": "Shadow Monarch"},
                        "status": "completed",
                        "contentRating": "safe",
                        "tags": [{"attributes": {"name": {"en": "Action"}}}],
                        "updatedAt": "2026-01-01T00:00:00Z",
                    },
                    "relationships": [
                        {"type": "cover_art", "attributes": {"fileName": "cover.jpg"}},
                        {"type": "author", "attributes": {"name": "Chugong"}},
                    ],
                },
            }
            return httpx.Response(200, json=data)

        if "/manga" in url_str:
            data = {
                "result": "ok",
                "total": 1,
                "data": [
                    {
                        "id": "manga-123",
                        "type": "manga",
                        "attributes": {
                            "title": {"en": "Solo Leveling"},
                            "description": {"en": "Shadow Monarch"},
                            "status": "completed",
                            "contentRating": "safe",
                            "tags": [{"attributes": {"name": {"en": "Action"}}}],
                            "updatedAt": "2026-01-01T00:00:00Z",
                        },
                        "relationships": [
                            {"type": "cover_art", "attributes": {"fileName": "cover.jpg"}},
                            {"type": "author", "attributes": {"name": "Chugong"}},
                        ],
                    }
                ],
            }
            return httpx.Response(200, json=data)

        if "/at-home/server/ch-999" in url_str:
            data = {
                "baseUrl": "https://uploads.mangadex.org",
                "chapter": {
                    "hash": "hash123",
                    "data": ["page1.jpg", "page2.jpg"],
                },
            }
            return httpx.Response(200, json=data)

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(mangadex_handler))
    connector = MangaDexConnector(client=client)

    # 1. Health check
    assert await connector.health_check() is True

    # 2. Catalog
    catalog = await connector.fetch_catalog(page=1)
    assert len(catalog.stories) == 1
    assert catalog.stories[0].title == "Solo Leveling"
    assert catalog.stories[0].status == StoryStatus.COMPLETED
    assert catalog.stories[0].cover_url == "https://uploads.mangadex.org/covers/manga-123/cover.jpg"

    # 3. Story detail
    story = await connector.fetch_story("manga-123")
    assert story.title == "Solo Leveling"
    assert story.author == "Chugong"
    assert len(story.chapters) == 1
    assert story.chapters[0].external_id == "ch-999"

    # 4. Chapter detail
    chapter = await connector.fetch_chapter("manga-123", "ch-999")
    assert len(chapter.images) == 2
    assert chapter.images[0] == "https://uploads.mangadex.org/data/hash123/page1.jpg"

    await connector.close()


# --- Generic HTML Comic Scraper Tests ---
@pytest.mark.asyncio
async def test_html_comic_scraper():
    def html_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        if url_str.endswith("generic-comic-site.com"):
            html = """
            <html>
                <body>
                    <div class="item">
                        <a class="title" href="/comic/test-comic">Test Comic Title</a>
                        <img src="/covers/test.jpg" />
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "comic/test-comic/chapter-1" in url_str:
            html = """
            <html>
                <body>
                    <div class="reader">
                        <img src="/img/c1/p1.jpg" />
                        <img src="/img/c1/p2.jpg" />
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "comic/test-comic" in url_str:
            html = """
            <html>
                <body>
                    <h1 class="title">Test Comic Title</h1>
                    <div class="author">Artist Name</div>
                    <div class="summary">Great comic summary</div>
                    <div class="cover"><img src="/covers/test.jpg" /></div>
                    <div class="genre"><a href="/g/action">Action</a></div>
                    <div class="list-chapter">
                        <li><a href="/comic/test-comic/chapter-1">Chapter 1: The Beginning</a></li>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(html_handler))
    connector = HtmlComicScraper(base_url="https://generic-comic-site.com", client=client)

    # 1. Health check
    assert await connector.health_check() is True

    # 2. Catalog
    catalog = await connector.fetch_catalog(page=1)
    assert len(catalog.stories) == 1
    assert catalog.stories[0].title == "Test Comic Title"
    assert catalog.stories[0].cover_url == "https://generic-comic-site.com/covers/test.jpg"

    # 3. Story detail
    story = await connector.fetch_story("test-comic")
    assert story.title == "Test Comic Title"
    assert story.author == "Artist Name"
    assert story.description == "Great comic summary"
    assert len(story.chapters) == 1
    assert story.chapters[0].chapter_number == "1"

    # 4. Chapter detail
    chapter = await connector.fetch_chapter("test-comic", "chapter-1")
    assert len(chapter.images) == 2
    assert chapter.images[0] == "https://generic-comic-site.com/img/c1/p1.jpg"

    await connector.close()


@pytest.mark.asyncio
async def test_html_comic_scraper_rejects_arbitrary_urls_before_network():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    client = httpx.AsyncClient(transport=create_mock_transport(handler))
    connector = HtmlComicScraper(
        base_url="https://generic-comic-site.com",
        client=client,
    )
    with pytest.raises(ValueError, match="story id"):
        await connector.fetch_story("https://127.0.0.1/admin")
    with pytest.raises(ValueError, match="chapter id"):
        await connector.fetch_chapter("test-comic", "../private")
    assert calls == 0
    await connector.close()


# --- Hako Novel Connector Tests ---
@pytest.mark.asyncio
async def test_hako_connector():
    def hako_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        if "danh-sach" in url_str or url_str.endswith("ln.hako.vn"):
            html = """
            <html>
                <body>
                    <div class="thumb-item-flow">
                        <div class="series-title"><a href="/truyen/100-hako-novel">Hako Novel Title</a></div>
                        <div class="img-in-ratio" style="background-image: url('https://ln.hako.vn/covers/hako.jpg');"></div>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "/truyen/100-hako-novel/c1000-chuong-1" in url_str:
            html = """
            <html>
                <body>
                    <h2 class="title-item">Chương 01: Mở Đầu</h2>
                    <div id="chapter-content">
                        <p>Dòng chữ đầu tiên của tiểu thuyết.</p>
                        <p>Dòng chữ thứ hai.</p>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "/truyen/100-hako-novel" in url_str:
            html = """
            <html>
                <body>
                    <div class="series-name"><a href="/truyen/100-hako-novel">Hako Novel Title</a></div>
                    <div class="info-item">Tác giả: <span class="info-value">Author Hako</span></div>
                    <div class="info-item">Tình trạng: <span class="info-value">Đang tiến hành</span></div>
                    <div class="summary-content"><p>Tóm tắt tiểu thuyết Hako.</p></div>
                    <div class="feature-img"><div class="img-in-ratio" style="background-image: url('https://ln.hako.vn/covers/hako.jpg');"></div></div>
                    <div class="series-genders"><a href="/g/fantasy">Fantasy</a></div>
                    <div class="list-chapters">
                        <a href="/truyen/100-hako-novel/c1000-chuong-1">Chương 01: Mở Đầu</a>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(hako_handler))
    connector = HakoConnector(client=client)

    # 1. Health check
    assert await connector.health_check() is True

    # 2. Catalog
    catalog = await connector.fetch_catalog(page=1)
    assert len(catalog.stories) == 1
    assert catalog.stories[0].title == "Hako Novel Title"

    # 3. Story detail
    story = await connector.fetch_story("100-hako-novel")
    assert story.title == "Hako Novel Title"
    assert story.author == "Author Hako"
    assert story.status == StoryStatus.ONGOING
    assert story.medium == StoryMedium.NOVEL
    assert len(story.chapters) == 1

    # 4. Chapter detail
    chapter = await connector.fetch_chapter("100-hako-novel", "c1000-chuong-1")
    assert chapter.title == "Chương 01: Mở Đầu"
    assert "Dòng chữ đầu tiên" in chapter.text_content

    await connector.close()


# --- TruyenFull Connector Tests ---
@pytest.mark.asyncio
async def test_truyenfull_connector():
    def truyenfull_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        if "danh-sach/truyen-moi" in url_str or url_str.endswith("truyenfull.io"):
            html = """
            <html>
                <body>
                    <div class="list-truyen">
                        <div class="row">
                            <h3 class="truyen-title"><a href="https://truyenfull.io/truyen-test/">Truyện Test Full</a></h3>
                            <span class="author">Tác Giả Full</span>
                        </div>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "truyen-test/chuong-1" in url_str:
            html = """
            <html>
                <body>
                    <div class="chapter-title">Chương 1: Khởi đầu</div>
                    <div id="chapter-c">
                        <p>Nội dung chương 1 truyện full.</p>
                        <p>Nội dung đoạn 2.</p>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "truyen-test" in url_str:
            html = """
            <html>
                <body>
                    <h3 class="title">Truyện Test Full</h3>
                    <a itemprop="author">Tác Giả Full</a>
                    <div class="desc-text">Mô tả truyện test full</div>
                    <div class="book"><img src="/covers/tf.jpg" /></div>
                    <a itemprop="genre">Tiên Hiệp</a>
                    <div class="info"><span class="text-success">Full</span></div>
                    <div class="list-chapter">
                        <li><a href="https://truyenfull.io/truyen-test/chuong-1/">Chương 1: Khởi đầu</a></li>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(truyenfull_handler))
    connector = TruyenFullConnector(client=client)

    # 1. Health check
    assert await connector.health_check() is True

    # 2. Catalog
    catalog = await connector.fetch_catalog(page=1)
    assert len(catalog.stories) == 1
    assert catalog.stories[0].title == "Truyện Test Full"

    # 3. Story detail
    story = await connector.fetch_story("truyen-test")
    assert story.title == "Truyện Test Full"
    assert story.author == "Tác Giả Full"
    assert story.status == StoryStatus.COMPLETED
    assert story.medium == StoryMedium.NOVEL
    assert len(story.chapters) == 1

    # 4. Chapter detail
    chapter = await connector.fetch_chapter("truyen-test", "chuong-1")
    assert "Nội dung chương 1" in chapter.text_content

    await connector.close()


# --- Metruyenchu Connector Tests ---
@pytest.mark.asyncio
async def test_metruyenchu_connector():
    def metruyenchu_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        if "danh-sach" in url_str or url_str.endswith("metruyenchu.com.vn"):
            html = """
            <html>
                <body>
                    <div class="list-truyen">
                        <div class="item">
                            <div class="title"><a href="/truyen/metruyen-1">Mê Truyện Chu Test</a></div>
                        </div>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "/truyen/metruyen-1/chuong-1" in url_str:
            html = """
            <html>
                <body>
                    <div class="chapter-title">Chương 1: Mê Truyện Chu</div>
                    <div id="article-content">
                        <p>Nội dung chương 1 của mê truyện chữ.</p>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "/truyen/metruyen-1" in url_str:
            html = """
            <html>
                <body>
                    <h1 class="title">Mê Truyện Chu Test</h1>
                    <div class="author">Tác Giả Mê</div>
                    <div class="description">Mô tả mê truyện chữ</div>
                    <div class="cover"><img src="/covers/mtc.jpg" /></div>
                    <div class="genres"><a href="/the-loai/huyen-huyen">Huyền Huyễn</a></div>
                    <div class="status">Đang ra</div>
                    <div class="chapter-list">
                        <a href="/truyen/metruyen-1/chuong-1">Chương 1: Mê Truyện Chu</a>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(metruyenchu_handler))
    connector = MetruyenchuConnector(client=client)

    # 1. Health check
    assert await connector.health_check() is True

    # 2. Catalog
    catalog = await connector.fetch_catalog(page=1)
    assert len(catalog.stories) == 1
    assert catalog.stories[0].title == "Mê Truyện Chu Test"

    # 3. Story detail
    story = await connector.fetch_story("metruyen-1")
    assert story.title == "Mê Truyện Chu Test"
    assert story.author == "Tác Giả Mê"
    assert story.status == StoryStatus.ONGOING
    assert story.medium == StoryMedium.NOVEL
    assert len(story.chapters) == 1

    # 4. Chapter detail
    chapter = await connector.fetch_chapter("metruyen-1", "chuong-1")
    assert "Nội dung chương 1 của mê truyện chữ" in chapter.text_content

    await connector.close()


# --- Remediation / Specific Issue Tests ---
@pytest.mark.asyncio
async def test_otruyen_cover_url_normalization():
    connector = OTruyenConnector()

    # 1. Normal relative path with default CDN domain
    url1 = connector._build_cover_url("one-piece.jpg")
    assert url1 == "https://otruyencdn.com/uploads/comics/one-piece.jpg"

    # 2. Relative path starting with uploads/comics/ with domain ending in uploads/comics
    url2 = connector._build_cover_url("uploads/comics/one-piece.jpg", cdn_domain="https://otruyencdn.com/uploads/comics")
    assert url2 == "https://otruyencdn.com/uploads/comics/one-piece.jpg"

    # 3. Relative path starting with uploads/comics/ with domain NOT ending in uploads/comics
    url3 = connector._build_cover_url("uploads/comics/one-piece.jpg", cdn_domain="https://otruyencdn.com")
    assert url3 == "https://otruyencdn.com/uploads/comics/one-piece.jpg"

    # 4. Double slashes cleaning
    url4 = connector._build_cover_url("https://otruyencdn.com//uploads//comics/one-piece.jpg")
    assert url4 == "https://otruyencdn.com/uploads/comics/one-piece.jpg"

    # 5. Trailing slash on cdn_domain and leading slash on thumb_url
    url5 = connector._build_cover_url("/uploads/comics/one-piece.jpg", cdn_domain="https://otruyencdn.com/uploads/comics/")
    assert url5 == "https://otruyencdn.com/uploads/comics/one-piece.jpg"


@pytest.mark.asyncio
async def test_truyenfull_multipage_and_slug_extraction():
    def truyenfull_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        if url_str.endswith("truyen-multi/") or url_str.endswith("truyen-multi"):
            html = """
            <html>
                <body>
                    <h3 class="title">Truyện Multi Page</h3>
                    <input type="hidden" id="total-page" value="2" />
                    <div class="list-chapter">
                        <li><a href="https://truyenfull.io/truyen-multi/chuong-1/">Chương 1: Bắt đầu</a></li>
                        <li><a href="https://truyenfull.io/truyen-multi/phan-1-chuong-2/">Phần 1 - Chương 2: Tiếp theo</a></li>
                    </div>
                    <ul class="pagination">
                        <li><a href="https://truyenfull.io/truyen-multi/trang-1/">1</a></li>
                        <li><a href="https://truyenfull.io/truyen-multi/trang-2/">2</a></li>
                    </ul>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "truyen-multi/trang-2" in url_str:
            html = """
            <html>
                <body>
                    <div class="list-chapter">
                        <li><a href="https://truyenfull.io/truyen-multi/chuong-3/">Chương 3: Trung đoạn</a></li>
                        <li><a href="https://truyenfull.io/truyen-multi/phan-2-chuong-4/">Phần 2 - Chương 4: Kết thúc</a></li>
                    </div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "truyen-multi/phan-1-chuong-2" in url_str:
            html = """
            <html>
                <body>
                    <div class="chapter-title">Phần 1 - Chương 2</div>
                    <div id="chapter-c"><p>Nội dung phần 1 chương 2.</p></div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        if "truyen-multi/chuong-1" in url_str:
            html = """
            <html>
                <body>
                    <div class="chapter-title">Chương 1</div>
                    <div id="chapter-c"><p>Nội dung chương 1.</p></div>
                </body>
            </html>
            """
            return httpx.Response(200, text=html)

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(truyenfull_handler))
    connector = TruyenFullConnector(client=client)

    # 1. Fetch story with multiple pages of chapters
    story = await connector.fetch_story("truyen-multi")
    assert len(story.chapters) == 4
    chapter_ids = [ch.external_id for ch in story.chapters]
    assert chapter_ids == ["chuong-1", "phan-1-chuong-2", "chuong-3", "phan-2-chuong-4"]

    # 2. Fetch chapter with slug ID (phan-1-chuong-2) - verify URL transformation does not prepend chuong-
    chapter2 = await connector.fetch_chapter("truyen-multi", "phan-1-chuong-2")
    assert chapter2.external_id == "phan-1-chuong-2"
    assert "Nội dung phần 1 chương 2" in chapter2.text_content

    # 3. Fetch chapter with numeric ID "1" - verify prepend chuong-
    chapter1 = await connector.fetch_chapter("truyen-multi", "1")
    assert "Nội dung chương 1" in chapter1.text_content

    await connector.close()


@pytest.mark.asyncio
async def test_mangadex_paginated_feed():
    def mangadex_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)

        if "/manga/manga-long/feed" in url_str:
            offset = 0
            if "offset=100" in url_str:
                offset = 100
            
            if offset == 0:
                data = {
                    "result": "ok",
                    "total": 150,
                    "limit": 100,
                    "offset": 0,
                    "data": [
                        {
                            "id": f"ch-{i}",
                            "attributes": {"chapter": str(i), "title": f"Chapter {i}"},
                        }
                        for i in range(1, 101)
                    ],
                }
                return httpx.Response(200, json=data)
            else:
                data = {
                    "result": "ok",
                    "total": 150,
                    "limit": 100,
                    "offset": 100,
                    "data": [
                        {
                            "id": f"ch-{i}",
                            "attributes": {"chapter": str(i), "title": f"Chapter {i}"},
                        }
                        for i in range(101, 151)
                    ],
                }
                return httpx.Response(200, json=data)

        if "/manga/manga-long" in url_str:
            data = {
                "result": "ok",
                "data": {
                    "id": "manga-long",
                    "type": "manga",
                    "attributes": {"title": {"en": "Long Manga"}},
                    "relationships": [],
                },
            }
            return httpx.Response(200, json=data)

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(mangadex_handler))
    connector = MangaDexConnector(client=client)

    story = await connector.fetch_story("manga-long")
    assert len(story.chapters) == 150
    assert story.chapters[0].external_id == "ch-1"
    assert story.chapters[149].external_id == "ch-150"

    await connector.close()


@pytest.mark.asyncio
async def test_http_retry_handling():
    attempts = 0

    def retry_handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        url_str = str(request.url)

        if "retry-success" in url_str:
            if attempts < 3:
                return httpx.Response(500, text="Internal Server Error")
            return httpx.Response(200, json={"status": "ok", "data": []})

        if "retry-fail" in url_str:
            return httpx.Response(429, text="Too Many Requests")

        return httpx.Response(404)

    client = httpx.AsyncClient(transport=create_mock_transport(retry_handler))
    connector = OTruyenConnector(client=client)

    # 1. Test success after 2 retries
    resp = await connector.get("https://otruyenapi.com/v1/api/retry-success", backoff_factor=0.01)
    assert resp.status_code == 200
    assert attempts == 3

    # 2. Test max retries exceeded (returns 429 status code)
    attempts = 0
    resp_fail = await connector.get("https://otruyenapi.com/v1/api/retry-fail", max_retries=3, backoff_factor=0.01)
    assert resp_fail.status_code == 429
    assert attempts == 4

    await connector.close()
