import requests
import logging
from typing import Optional, Dict, Any
from app.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

logger = logging.getLogger("telegram_storage")

class TelegramStorageManager:
    def __init__(self, bot_token: str = TELEGRAM_BOT_TOKEN, chat_id: str = TELEGRAM_CHAT_ID):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"

    def upload_image_from_url(self, image_url: str, caption: str = "") -> Optional[Dict[str, Any]]:
        """
        Tải ảnh từ URL gốc và Upload trực tiếp lên Telegram Channel riêng tư.
        Trả về dictionary chứa tg_file_id và tg_file_path.
        """
        if not self.bot_token or not self.chat_id:
            logger.error("Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID!")
            return None

        try:
            # 1. Download ảnh tạm thời từ nguồn
            img_res = requests.get(image_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            if img_res.status_code != 200:
                logger.error(f"Không thể tải ảnh từ URL: {image_url} (HTTP {img_res.status_code})")
                return None

            files = {"photo": ("image.jpg", img_res.content, "image/jpeg")}
            data = {"chat_id": self.chat_id, "caption": caption}

            # 2. Upload ảnh lên Telegram Channel qua sendPhoto API
            upload_res = requests.post(f"{self.base_url}/sendPhoto", data=data, files=files, timeout=30)
            if upload_res.status_code != 200:
                logger.error(f"Telegram upload thất bại: {upload_res.text}")
                return None

            res_json = upload_res.json()
            if not res_json.get("ok"):
                return None

            # Lấy file_id ảnh có kích thước cao nhất (photo array cuối cùng)
            photos = res_json["result"]["photo"]
            best_photo = photos[-1]
            file_id = best_photo["file_id"]

            # 3. Lấy file_path để đọc trực tiếp từ Telegram CDN
            file_path = self.get_file_path(file_id)

            return {
                "file_id": file_id,
                "file_path": file_path,
                "cdn_url": f"https://api.telegram.org/file/bot{self.bot_token}/{file_path}" if file_path else ""
            }

        except Exception as e:
            logger.error(f"Lỗi khi upload ảnh sang Telegram: {e}")
            return None

    def get_file_path(self, file_id: str) -> Optional[str]:
        """
        Gọi API getFile của Telegram để lấy đường dẫn file_path.
        """
        try:
            res = requests.get(f"{self.base_url}/getFile", params={"file_id": file_id}, timeout=10)
            if res.status_code == 200 and res.json().get("ok"):
                return res.json()["result"]["file_path"]
        except Exception as e:
            logger.error(f"Lỗi khi getFile từ Telegram: {e}")
        return None

# Singleton instance
telegram_storage = TelegramStorageManager()
