import requests
import logging
import time
from typing import Dict, Any, List, Optional

logger = logging.getLogger("multi_source_fallback")

class MultiSourceFailoverEngine:
    def __init__(self):
        self.degraded_sources: Dict[str, float] = {}

    def is_source_healthy(self, source_id: str) -> bool:
        if source_id in self.degraded_sources:
            if time.time() - self.degraded_sources[source_id] < 120:
                return False
            else:
                del self.degraded_sources[source_id]
        return True

    def mark_source_degraded(self, source_id: str):
        logger.warning(f"⚠️ Nguồn [{source_id}] bị lỗi! Đang tự động đánh dấu suy giảm và chuyển nguồn dự phòng...")
        self.degraded_sources[source_id] = time.time()

    def fetch_story_detail(self, slug: str) -> Optional[Dict[str, Any]]:
        if self.is_source_healthy("otruyen"):
            try:
                res = requests.get(f"https://otruyenapi.com/v1/api/truyen-tranh/{slug}", timeout=6)
                if res.status_code == 200:
                    json_data = res.json()
                    if json_data.get("status") == "success" and json_data.get("data", {}).get("item"):
                        logger.info(f"✅ Lấy chi tiết [{slug}] thành công từ nguồn: OTruyen API")
                        return json_data
            except Exception as e:
                logger.error(f"Lỗi OTruyen API khi fetch [{slug}]: {e}")
                self.mark_source_degraded("otruyen")

        if self.is_source_healthy("mangadex"):
            try:
                md_url = f"https://api.mangadex.org/v5/manga?title={slug}&translatedLanguage[]=vi&includes[]=cover_art"
                res = requests.get(md_url, timeout=6)
                if res.status_code == 200:
                    json_data = res.json()
                    data_list = json_data.get("data", [])
                    if data_list:
                        manga = data_list[0]
                        title_dict = manga["attributes"]["title"]
                        title = title_dict.get("vi") or title_dict.get("en") or list(title_dict.values())[0]
                        
                        logger.info(f"✅ Lấy chi tiết [{slug}] thành công từ nguồn DỰ PHÒNG: MangaDex API")
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

        for url in urls_to_try:
            try:
                res = requests.get(url, timeout=7)
                if res.status_code == 200:
                    json_data = res.json()
                    logger.info(f"✅ Fetch chapter [{chapter_id}] thành công từ: {url}")
                    return json_data
            except Exception as e:
                logger.error(f"Lỗi fetch chapter [{chapter_id}] từ {url}: {e}")

        logger.error(f"❌ Tất cả các URL chapter đều không phản hồi cho ID: [{chapter_id}]")
        return None

failover_engine = MultiSourceFailoverEngine()
