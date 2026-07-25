import requests
import logging
from app.db import save_story, save_chapter, save_page_mapping, get_chapter_pages_from_db
from app.telegram_storage import telegram_storage
from app.config import API_OTRUYEN_BASE

logger = logging.getLogger("ingest_worker")

def backup_chapter_to_telegram(chapter_id: str, chapter_api_url: str) -> bool:
    """
    Tải toàn bộ các trang ảnh của 1 chapter và Upload lưu trữ vĩnh viễn trên Telegram.
    """
    # 1. Kiểm tra xem chapter đã được lưu trên DB chưa
    existing_pages = get_chapter_pages_from_db(chapter_id)
    if existing_pages:
        logger.info(f"Chapter {chapter_id} đã được lưu trữ sẵn trên Telegram ({len(existing_pages)} trang).")
        return True

    # 2. Lấy danh sách ảnh từ API OTruyen (hoặc nguồn khác)
    url = chapter_api_url if chapter_api_url.startswith("http") else f"https://otruyenapi.com{chapter_api_url}"
    try:
        res = requests.get(url, timeout=10)
        if res.status_code != 200:
            return False
        
        data = res.json().get("data", {})
        domain_cdn = data.get("domain_cdn", "https://sv1.otruyencdn.com")
        item = data.get("item", {})
        chapter_path = item.get("chapter_path", "")
        chapter_images = item.get("chapter_image", [])

        logger.info(f"Đang tiến hành Backup {len(chapter_images)} trang ảnh của Chapter {chapter_id} sang Telegram...")

        # 3. Duyệt qua từng ảnh và Upload sang Telegram Storage
        for img in chapter_images:
            page_no = img.get("image_page", 1)
            file_name = img.get("image_file", "")
            img_url = f"{domain_cdn}/{chapter_path}/{file_name}"

            caption = f"Chapter: {chapter_id} | Page: {page_no}"
            result = telegram_storage.upload_image_from_url(img_url, caption=caption)

            if result and result.get("file_id"):
                save_page_mapping(
                    chapter_id=chapter_id,
                    page_no=page_no,
                    tg_file_id=result["file_id"],
                    tg_file_path=result.get("file_path", ""),
                    original_url=img_url
                )
                logger.info(f" -> Đã lưu Trang {page_no}/{len(chapter_images)} lên Telegram Storage (file_id: {result['file_id'][:15]}...)")
            else:
                logger.error(f" -> Thất bại khi upload Trang {page_no} của {chapter_id}")

        return True

    except Exception as e:
        logger.error(f"Lỗi khi backup chapter {chapter_id}: {e}")
        return False
