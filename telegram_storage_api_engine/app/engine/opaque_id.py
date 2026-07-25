import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from typing import Optional

from app.config.sources import SOURCE_SPECS


@dataclass(frozen=True)
class ChapterRef:
    source: str
    story_id: str
    chapter_id: str


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(payload: str) -> str:
    secret = os.getenv("OPAQUE_ID_SECRET", "").encode("utf-8")
    if secret:
        digest = hmac.new(secret, payload.encode("ascii"), hashlib.sha256).digest()
    else:
        # This checksum catches corruption in local development. Production
        # should set OPAQUE_ID_SECRET to make identifiers tamper evident.
        digest = hashlib.sha256(payload.encode("ascii")).digest()
    return _b64encode(digest[:12])


def encode_chapter_ref(source: str, story_id: str, chapter_id: str) -> str:
    normalized_source = source.strip().lower()
    if normalized_source not in SOURCE_SPECS:
        raise ValueError("Unknown chapter source")
    if not story_id or not chapter_id or len(story_id) > 240 or len(chapter_id) > 240:
        raise ValueError("Invalid chapter reference")
    raw = json.dumps(
        [normalized_source, story_id, chapter_id],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    payload = _b64encode(raw)
    return f"ms1.{payload}.{_signature(payload)}"


def decode_chapter_ref(value: str) -> Optional[ChapterRef]:
    if not value.startswith("ms1.") or len(value) > 1024:
        return None
    parts = value.split(".")
    if len(parts) != 3 or not hmac.compare_digest(parts[2], _signature(parts[1])):
        return None
    try:
        decoded = json.loads(_b64decode(parts[1]).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if (
        not isinstance(decoded, list)
        or len(decoded) != 3
        or not all(isinstance(part, str) for part in decoded)
    ):
        return None
    source, story_id, chapter_id = decoded
    if source not in SOURCE_SPECS or not story_id or not chapter_id:
        return None
    if len(story_id) > 240 or len(chapter_id) > 240:
        return None
    return ChapterRef(source=source, story_id=story_id, chapter_id=chapter_id)
