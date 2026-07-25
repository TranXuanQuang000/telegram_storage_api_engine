import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
DATABASE_PATH = os.getenv("DATABASE_PATH", "app_storage.db")
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

# OTruyen Base API for fallback
API_OTRUYEN_BASE = "https://otruyenapi.com/v1/api"
