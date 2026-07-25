import sqlite3
import json
from typing import List, Dict, Any, Optional
from app.config import DATABASE_PATH

def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Bảng truyện
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS stories (
                slug TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                thumb_url TEXT,
                status TEXT DEFAULT 'ongoing',
                summary TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Bảng chapter
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chapters (
                chapter_id TEXT PRIMARY KEY,
                story_slug TEXT NOT NULL,
                chapter_name TEXT NOT NULL,
                chapter_title TEXT,
                is_backed_up INTEGER DEFAULT 0,
                FOREIGN KEY (story_slug) REFERENCES stories (slug)
            )
        """)
        
        # Bảng các trang ảnh của chapter lưu trên Telegram
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chapter_pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter_id TEXT NOT NULL,
                page_no INTEGER NOT NULL,
                tg_file_id TEXT NOT NULL,
                tg_file_path TEXT,
                original_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chapter_id) REFERENCES chapters (chapter_id),
                UNIQUE(chapter_id, page_no)
            )
        """)
        conn.commit()

def save_story(slug: str, title: str, thumb_url: str = "", status: str = "ongoing", summary: str = ""):
    with get_connection() as conn:
        conn.cursor().execute("""
            INSERT INTO stories (slug, title, thumb_url, status, summary, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(slug) DO UPDATE SET
                title=excluded.title,
                thumb_url=excluded.thumb_url,
                status=excluded.status,
                summary=excluded.summary,
                updated_at=CURRENT_TIMESTAMP
        """, (slug, title, thumb_url, status, summary))

def save_chapter(chapter_id: str, story_slug: str, chapter_name: str, chapter_title: str = ""):
    with get_connection() as conn:
        conn.cursor().execute("""
            INSERT INTO chapters (chapter_id, story_slug, chapter_name, chapter_title)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(chapter_id) DO UPDATE SET
                chapter_name=excluded.chapter_name,
                chapter_title=excluded.chapter_title
        """, (chapter_id, story_slug, chapter_name, chapter_title))

def save_page_mapping(chapter_id: str, page_no: int, tg_file_id: str, tg_file_path: str = "", original_url: str = ""):
    with get_connection() as conn:
        conn.cursor().execute("""
            INSERT INTO chapter_pages (chapter_id, page_no, tg_file_id, tg_file_path, original_url)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(chapter_id, page_no) DO UPDATE SET
                tg_file_id=excluded.tg_file_id,
                tg_file_path=excluded.tg_file_path,
                original_url=excluded.original_url
        """, (chapter_id, page_no, tg_file_id, tg_file_path, original_url))
        conn.cursor().execute("UPDATE chapters SET is_backed_up = 1 WHERE chapter_id = ?", (chapter_id,))

def get_chapter_pages_from_db(chapter_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT page_no, tg_file_id, tg_file_path, original_url
            FROM chapter_pages
            WHERE chapter_id = ?
            ORDER BY page_no ASC
        """, (chapter_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
