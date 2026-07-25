from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChapterKind(str, Enum):
    REGULAR = "regular"
    EXTRA = "extra"
    PROLOGUE = "prologue"
    EPILOGUE = "epilogue"
    UNKNOWN = "unknown"


class ChapterIdentity(BaseModel):
    """A stable chapter identity that never depends on a connector's ID."""

    canonical_id: str
    chapter_number: Optional[str] = None
    volume_number: Optional[int] = None
    kind: ChapterKind = ChapterKind.UNKNOWN
    sub_chapter: Optional[str] = None
    normalized_title: str = ""
    raw_title: str = ""
    is_parseable: bool = False

    @property
    def chapter_decimal(self) -> Optional[Decimal]:
        if self.chapter_number is None:
            return None
        return Decimal(self.chapter_number)

    @property
    def chapter_float(self) -> float:
        """Compatibility accessor for the original merger API."""
        value = self.chapter_decimal
        return float(value) if value is not None else 0.0

    @property
    def is_extra(self) -> bool:
        """Compatibility accessor for callers that predate ChapterKind."""
        return self.kind in {
            ChapterKind.EXTRA,
            ChapterKind.PROLOGUE,
            ChapterKind.EPILOGUE,
        }


class ChapterSourceRef(BaseModel):
    source_id: str
    external_id: str
    url: Optional[str] = None


class ChapterGap(BaseModel):
    start: int
    end: int
    volume_number: Optional[int] = None


class ChapterHeader(BaseModel):
    id: Optional[str] = None
    external_id: str
    title: str
    chapter_number: Optional[str] = None
    url: Optional[str] = None
    updated_at: Optional[str] = None
    canonical_id: Optional[str] = None
    source_refs: List[ChapterSourceRef] = Field(default_factory=list)
    raw_metadata: Dict[str, Any] = Field(default_factory=dict)


class ChapterContent(BaseModel):
    story_id: Optional[str] = None
    chapter_id: Optional[str] = None
    external_id: str
    title: str
    chapter_number: Optional[str] = None
    images: Optional[List[str]] = None
    text_content: Optional[str] = None
    raw_metadata: Dict[str, Any] = Field(default_factory=dict)
