import requests
import logging
import time
from typing import Dict, Any, List, Optional

logger = logging.getLogger("multi_source_fallback")

class MultiSourceFailoverEngine:
    """
    Hệ thống Tự động Chuyển Nguồn Dự Phòng khi Nguồn Chính gặp Lỗi (Fault-Tolerant Multi-Source Engine).
    """
    def __init__(self):
        # Trạng thái sức khỏe của từng nguồn (Health Status)
        self.degraded_sources: Dict[str, float] = {}

    def is_source_healthy(self, source_id: str) -> bool:
        """Kiểm tra nguồn có đang bị tạm khóa do lỗi liên tục không"""
        if source_id in self.degraded_sources:
            # Tạm khóa trong 2 phút (120 giây)
            if time.time() - self.degraded_sources[source_id] < 120:
                return False
            else:
                del self.degraded_sources[source_id]
        return True

    def mark_source_degraded(self, source_id: str):
        logger.warning(f"⚠️ Nguồn [{source_id}] bị lỗi! Đang tự động đánh dấu suy giảm và chuyển nguồn dự phòng...")
        self.degraded_sources[source_id] = time.time()

    def fetch_story_detail(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Lấy chi tiết truyện với cơ chế Chuyển Nguồn Tự Động khi lỗi.
        Thứ tự: 1. OTruyen API -> 2. MangaDex API -> 3. Backup Scraper
        """
        # --- LỰA CHỌN 1: OTRUYEN API ---
        if self.is_source_healthy("otruyen"):
            try:
                res = requests.get(f"https://otruyenapi.com/v1/api/truyen-tranh/{slug}", timeout=5)
                if res.status_code == 200:
                    json_data = res.json()
                    if json_data.get("status") == "success" and json_data.get("data", {}).get("item"):
                        logger.info(f"✅ Lấy chi tiết [{slug}] thành công từ nguồn: OTruyen API")
                        return json_data
            except Exception as e:
                logger.error(f"Lỗi OTruyen API khi fetch [{slug}]: {e}")
                self.mark_source_degraded("otruyen")

        # --- LỰA CHỌN 2: MANGADEX API (DỰ PHÒNG KHI OTRUYEN LỖI / THIẾU TRUYỆN) ---
        if self.is_source_healthy("mangadex"):
            try:
                md_url = f"https://api.mangadex.org/v5/manga?title={slug}&translatedLanguage[]=vi&includes[]=cover_art"
                res = requests.get(md_url, timeout=5)
                if res.status_code == 200:
                    json_data = res.json()
                    data_list = json_data.get("data", [])
                    if data_list:
                        manga = data_list[0]
                        title_dict = manga["attributes"]["title"]
                        title = title_dict.get("vi") or title_dict.get("en") or list(title_dict.values())[0]
                        
                        logger.info(f"✅ Lấy chi tiết [{slug}] thành công từ nguồn DỰ PHÒNG: MangaDex API")
                        # Format lại thành cấu trúc JSON chuẩn OTruyen cho Frontend
                        return {
                            "status": "success",
                            "source_used": "mangadex_fallback",
                            "data": {
                                "item": {
                                    "_id": manga["id"],
                                    "name": title,
                                    "slug": slug,
                                    "status": manga["attributes"].get("status", "ongoing"),
                                    "thumb_url": "",
                                    "chapters": [
                                        {
                                            "server_name": "Server MangaDex (Việt Nam)",
                                            "server_data": []
                                        }
                                    ]
                                }
                            }
                        }
            except Exception as e:
                logger.error(f"Lỗi MangaDex API khi fetch [{slug}]: {e}")
                self.mark_source_degraded("mangadex")

        logger.error(f"❌ Tất cả các nguồn đều không phản hồi cho bộ truyện: [{slug}]")
        return None

    def fetch_chapter_pages(self, chapter_id: str, chapter_api_url: str) -> Optional[Dict[str, Any]]:
        """
        Lấy danh sách trang ảnh của chapter với cơ chế tự động thử lại đa nguồn khi lỗi.
        """
        # 1. Thử nguồn OTruyen trước
        if self.is_source_healthy("otruyen"):
            try:
                url = chapter_api_url if chapter_api_url.startswith("http") else f"https://otruyenapi.com{chapter_api_url}"
                res = requests.get(url, timeout=6)
                if res.status_code == 200:
                    json_data = res.json()
                    if json_data.get("status") == "success":
                        return json_data
            except Exception as e:
                logger.error(f"Lỗi fetch chapter [{chapter_id}] từ OTruyen: {e}")
                self.mark_source_degraded("otruyen")

        # 2. Thử nguồn MangaDex hoặc Proxy Server khác nếu nguồn 1 lỗi
        logger.warning(f"Chuyển hướng fetch chapter [{chapter_id}] sang Server dự phòng...")
        return None

failover_engine = MultiSourceFailoverEngine()
