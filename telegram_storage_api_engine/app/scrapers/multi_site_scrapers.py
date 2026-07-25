import requests
import re
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("multi_site_scrapers")

# Danh sách User-Agents thật để xoay tua chống chặn
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0"
]

def get_headers(referer: str = "") -> Dict[str, str]:
    import random
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    if referer:
        headers["Referer"] = referer
    return headers

class TruyenQQScraper:
    """Module cào dữ liệu trực tiếp từ TruyenQQ (Mirror Domain Cập Nhật Mới Nhất)"""
    MIRRORS = [
        "https://truyenqqko.com",  # Domain chính mới nhất 2026
        "https://truyenqqto.com",
        "https://truyenqqgo.com",
        "https://truyenqqno.com",
        "https://truyenqqvi.com"
    ]

    @classmethod
    def get_latest_stories(cls, page: int = 1) -> List[Dict[str, Any]]:
        for domain in cls.MIRRORS:
            try:
                url = f"{domain}/truyen-moi-cap-nhat/trang-{page}.html"
                res = requests.get(url, headers=get_headers(domain), timeout=5)
                if res.status_code == 200:
                    stories = []
                    matches = re.findall(r'<a href="([^"]+/truyen-tranh/[^"]+)".*?title="([^"]+)".*?<img.*?src="([^"]+)"', res.text, re.DOTALL)
                    for link, title, thumb in matches:
                        slug = link.split("/")[-1].replace(".html", "")
                        stories.append({
                            "_id": f"tqq-{slug}",
                            "name": title.strip(),
                            "slug": slug,
                            "thumb_url": thumb,
                            "source": "truyenqq"
                        })
                    if stories:
                        logger.info(f"✅ Cào thành công {len(stories)} truyện từ TruyenQQ ({domain})")
                        return stories
            except Exception as e:
                logger.warning(f"Lỗi cào TruyenQQ tại domain {domain}: {e}")
        return []

class NettruyenScraper:
    """Module cào dữ liệu trực tiếp từ Nettruyen (Mirror Domain Cập Nhật Mới Nhất)"""
    MIRRORS = [
        "https://nettruyen.gg",   # Domain chính mới nhất 2026
        "https://nettruyenco.vn",
        "https://nettruyen.live",
        "https://nettruyennew.com",
        "https://nettruyenx.com"
    ]

    @classmethod
    def get_latest_stories(cls, page: int = 1) -> List[Dict[str, Any]]:
        for domain in cls.MIRRORS:
            try:
                url = f"{domain}/?page={page}"
                res = requests.get(url, headers=get_headers(domain), timeout=5)
                if res.status_code == 200:
                    stories = []
                    matches = re.findall(r'<a class="jtip".*?href="([^"]+/truyen-tranh/[^"]+)">(.*?)</a>.*?src="([^"]+)"', res.text, re.DOTALL)
                    for link, title, thumb in matches:
                        slug = link.split("/")[-1]
                        stories.append({
                            "_id": f"net-{slug}",
                            "name": title.strip(),
                            "slug": slug,
                            "thumb_url": thumb if thumb.startswith("http") else f"https:{thumb}",
                            "source": "nettruyen"
                        })
                    if stories:
                        logger.info(f"✅ Cào thành công {len(stories)} truyện từ Nettruyen ({domain})")
                        return stories
            except Exception as e:
                logger.warning(f"Lỗi cào Nettruyen tại domain {domain}: {e}")
        return []

class CuutruyenScraper:
    """Module cào dữ liệu từ Cuutruyen (Nhóm dịch)"""
    BASE_URL = "https://cuutruyen.net"

    @classmethod
    def get_latest_stories(cls, page: int = 1) -> List[Dict[str, Any]]:
        try:
            res = requests.get(f"{cls.BASE_URL}/api/mangas/newly_updated?page={page}", headers=get_headers(cls.BASE_URL), timeout=5)
            if res.status_code == 200:
                data = res.json().get("data", [])
                return [
                    {
                        "_id": f"cuutruyen-{item['id']}",
                        "name": item.get("title", ""),
                        "slug": f"cuutruyen-{item['id']}",
                        "thumb_url": item.get("cover_url", ""),
                        "source": "cuutruyen"
                    }
                    for item in data
                ]
        except Exception as e:
            logger.warning(f"Lỗi cào Cuutruyen: {e}")
        return []

class MasterMultiSourceAggregator:
    """
    Bộ Tổng Hợp Đa Nguồn Giống Mô Hình TruyenQQ.
    Gộp dữ liệu từ TruyenQQ + Nettruyen + Cuutruyen + OTruyen + MangaDex.
    """
    @classmethod
    def get_aggregated_latest(cls, page: int = 1) -> Dict[str, Any]:
        all_stories = []

        # 1. Cào từ TruyenQQ mới nhất
        tqq = TruyenQQScraper.get_latest_stories(page)
        all_stories.extend(tqq)

        # 2. Cào từ Nettruyen mới nhất
        net = NettruyenScraper.get_latest_stories(page)
        all_stories.extend(net)

        # 3. Cào từ Cuutruyen
        cuu = CuutruyenScraper.get_latest_stories(page)
        all_stories.extend(cuu)

        # 4. Lấy từ OTruyen API làm nền
        try:
            res = requests.get(f"https://otruyenapi.com/v1/api/danh-sach/truyen-moi?page={page}", timeout=5)
            if res.status_code == 200:
                otruyen_items = res.json().get("data", {}).get("items", [])
                for item in otruyen_items:
                    all_stories.append({
                        "_id": item.get("_id"),
                        "name": item.get("name"),
                        "slug": item.get("slug"),
                        "thumb_url": item.get("thumb_url"),
                        "source": "otruyen"
                    })
        except Exception as e:
            logger.warning(f"OTruyen API timeout trong bộ gộp: {e}")

        # Lọc trùng truyện theo Tên
        seen = set()
        unique_stories = []
        for story in all_stories:
            key = story["name"].lower().strip()
            if key not in seen:
                seen.add(key)
                unique_stories.append(story)

        logger.info(f"🔥 Tổng hợp thành công {len(unique_stories)} truyện mới từ các domain active mới nhất!")

        return {
            "status": "success",
            "source": "master_multi_source_truyenqq_engine",
            "data": {
                "APP_DOMAIN_CDN_IMAGE": "https://img.otruyenapi.com/uploads/comics",
                "items": unique_stories
            }
        }
