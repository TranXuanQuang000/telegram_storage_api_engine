import requests
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db, get_chapter_pages_from_db, save_story, save_chapter
from app.config import TELEGRAM_BOT_TOKEN
from app.ingest_worker import backup_chapter_to_telegram
from app.telegram_storage import telegram_storage
from app.multi_source_fallback import failover_engine
from app.scrapers.multi_site_scrapers import MasterMultiSourceAggregator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_server")

app = FastAPI(
    title="Master TruyenQQ-Style Multi-Source Comic API Engine",
    description="Hệ thống Backend API tổng hợp truyện từ 5 nguồn lớn (TruyenQQ, Nettruyen, Cuutruyen, MangaDex, OTruyen) lưu vĩnh viễn trên Telegram CDN",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    logger.info("Khởi tạo Master Multi-Source TruyenQQ Engine thành công!")

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Master TruyenQQ-Style Multi-Source API Engine",
        "version": "3.0.0",
        "active_sources": ["TruyenQQ", "Nettruyen", "Cuutruyen", "MangaDex", "OTruyen API"],
        "storage": "Telegram Channel Permanent Storage",
        "docs_url": "/docs"
    }

# ---------------------------------------------------------
# 1. API TRANG CHỦ & DANH SÁCH GỘP TỪ 5 NGUỒN CHÍNH (TRUYENQQ STYLE)
# ---------------------------------------------------------

@app.get("/v1/api/danh-sach/truyen-moi")
def get_latest_stories(page: int = 1):
    """
    Lấy danh sách truyện mới được gộp tự động từ 5 NGUỒN CẠNH TRANH TRUYENQQ:
    TruyenQQ + Nettruyen + Cuutruyen + MangaDex + OTruyen API.
    """
    return MasterMultiSourceAggregator.get_aggregated_latest(page)

@app.get("/v1/api/truyen-tranh/{slug}")
def get_story_detail(slug: str, background_tasks: BackgroundTasks):
    """
    Lấy chi tiết truyện sử dụng Failover Engine đa nguồn.
    """
    story_data = failover_engine.fetch_story_detail(slug)
    if not story_data:
        raise HTTPException(status_code=404, detail="Không tìm thấy truyện ở bất kỳ nguồn nào!")
    
    item = story_data.get("data", {}).get("item", {})
    if item:
        save_story(
            slug=item.get("slug", slug),
            title=item.get("name", ""),
            thumb_url=item.get("thumb_url", ""),
            status=item.get("status", "ongoing"),
            summary=item.get("content", "")
        )
        chapters = item.get("chapters", [])
        for server in chapters:
            for chap in server.get("server_data", []):
                chap_name = chap.get("chapter_name", "")
                chap_id = f"{slug}-chap-{chap_name}"
                save_chapter(chap_id, slug, chap_name, chap.get("chapter_title", ""))

    return story_data

@app.get("/v1/api/chapter/{chapter_id:path}")
def get_chapter_pages(chapter_id: str, background_tasks: BackgroundTasks):
    """
    Lấy danh sách trang ảnh của chapter.
    ƯU TIÊN 1: Telegram Permanent Storage (Link Telegram CDN vĩnh viễn không bao giờ lỗi!).
    ƯU TIÊN 2: Nguồn gốc + Tự động Upload sang Telegram cho lần đọc tiếp theo.
    """
    cached_pages = get_chapter_pages_from_db(chapter_id)
    if cached_pages:
        logger.info(f"⚡ Trả về Chapter [{chapter_id}] từ Telegram Permanent Storage!")
        return {
            "status": "success",
            "source": "telegram_storage_permanent",
            "data": {
                "domain_cdn": "",
                "item": {
                    "chapter_path": "",
                    "chapter_image": [
                        {
                            "image_page": page["page_no"],
                            "image_file": f"/v1/storage/tg/{page['tg_file_id']}"
                        }
                        for page in cached_pages
                    ]
                }
            }
        }

    clean_id = chapter_id.replace("v1/api/chapter/", "")
    chapter_api_url = f"/v1/api/chapter/{clean_id}"
    
    chapter_data = failover_engine.fetch_chapter_pages(clean_id, chapter_api_url)
    if chapter_data:
        background_tasks.add_task(backup_chapter_to_telegram, clean_id, chapter_api_url)
        return chapter_data

    raise HTTPException(status_code=502, detail="Tất cả các nguồn chapter đều gặp sự cố!")

# ---------------------------------------------------------
# 2. TELEGRAM CDN STORAGE PROXY ENDPOINT
# ---------------------------------------------------------

@app.get("/v1/storage/tg/{file_id}")
def proxy_telegram_image(file_id: str):
    """
    Proxy trả ảnh trực tiếp từ Telegram CDN vĩnh viễn.
    """
    file_path = telegram_storage.get_file_path(file_id)
    if not file_path or not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=404, detail="Không tìm thấy file trên Telegram Storage")

    cdn_url = f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}"
    return RedirectResponse(url=cdn_url, status_code=307)
