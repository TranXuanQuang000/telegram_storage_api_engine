from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.models.chapter import ChapterHeader


class StoryMedium(str, Enum):
    COMIC = "comic"
    NOVEL = "novel"


class StoryStatus(str, Enum):
    ONGOING = "ongoing"
    COMPLETED = "completed"
    PAUSED = "paused"
    UNKNOWN = "unknown"


class ContentRating(str, Enum):
    SAFE = "safe"
    SUGGESTIVE = "suggestive"
    EROTICA = "erotica"
    PORNOGRAPHIC = "pornographic"
    UNKNOWN = "unknown"


class Story(BaseModel):
    source_id: str
    external_id: str
    external_url: str
    title: str
    slug: str
    author: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    genres: List[str] = Field(default_factory=list)
    status: StoryStatus = StoryStatus.UNKNOWN
    medium: StoryMedium
    content_rating: ContentRating = ContentRating.SAFE
    updated_at: Optional[str] = None
    chapters: List[ChapterHeader] = Field(default_factory=list)
    raw_metadata: Dict[str, Any] = Field(default_factory=dict)


class CatalogFetchResult(BaseModel):
    stories: List[Story]
    total: Optional[int] = None
    page: int = 1
    limit: int = 20
    has_more: bool = False
    raw_metadata: Dict[str, Any] = Field(default_factory=dict)
