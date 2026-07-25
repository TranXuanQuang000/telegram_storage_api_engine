import requests
import logging
from app.db import save_story, save_chapter, save_page_mapping, get_chapter_pages_from_db
from app.telegram_storage import telegram_storage

logger = logging.getLogger("ingest_worker")

def backup_chapter_to_telegram(chapter_id: str, chapter_api_url: str) -> bool:
    """
    Tải toàn bộ các trang ảnh của 1 chapter và Upload lưu trữ vĩnh viễn trên Telegram.
    """
    existing_pages = get_chapter_pages_from_db(chapter_id)
    if existing_pages:
        logger.info(f"Chapter {chapter_id} đã được lưu trữ sẵn trên Telegram ({len(existing_pages)} trang).")
        return True

    clean_id = chapter_id.split("/")[-1]
    urls_to_try = [
        f"https://sv1.otruyencdn.com/v1/api/chapter/{clean_id}",
        f"https://otruyenapi.com/v1/api/chapter/{clean_id}",
    ]
    if chapter_api_url:
        if chapter_api_url.startswith("http"):
            urls_to_try.insert(0, chapter_api_url)
        else:
            urls_to_try.insert(0, f"https://sv1.otruyencdn.com{chapter_api_url}")

    data = None
    for url in urls_to_try:
        try:
            res = requests.get(url, timeout=7)
            if res.status_code == 200:
                json_data = res.json()
                if json_data.get("status") == "success":
                    data = json_data.get("data", {})
                    break
        except Exception as e:
            logger.error(f"Lỗi fetch chapter {chapter_id} tại {url}: {e}")

    if not data:
        logger.error(f"Không thể lấy dữ liệu chapter {chapter_id} từ bất kỳ URL nào!")
        return False

    domain_cdn = data.get("domain_cdn", "https://sv1.otruyencdn.com")
    item = data.get("item", {})
    chapter_path = item.get("chapter_path", "")
    chapter_images = item.get("chapter_image", [])

    logger.info(f"Đang tiến hành Backup {len(chapter_images)} trang ảnh của Chapter {chapter_id} sang Telegram...")

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
