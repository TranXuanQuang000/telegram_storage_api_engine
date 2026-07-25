import os
from dataclasses import dataclass
from typing import Dict, FrozenSet, Literal

from app.models.story import StoryMedium


SourceTransport = Literal["rest", "html"]


@dataclass(frozen=True)
class SourceSpec:
    id: str
    name: str
    medium: StoryMedium
    base_url: str
    transport: SourceTransport
    default_enabled: bool
    attribution_required: bool = True


SOURCE_SPECS: Dict[str, SourceSpec] = {
    "otruyen": SourceSpec(
        id="otruyen",
        name="OTruyen API",
        medium=StoryMedium.COMIC,
        base_url="https://otruyenapi.com/v1/api",
        transport="rest",
        default_enabled=True,
    ),
    "mangadex": SourceSpec(
        id="mangadex",
        name="MangaDex",
        medium=StoryMedium.COMIC,
        base_url="https://api.mangadex.org",
        transport="rest",
        default_enabled=True,
    ),
    "cuutruyen": SourceSpec(
        id="cuutruyen",
        name="Cứu Truyện",
        medium=StoryMedium.COMIC,
        base_url="https://cuutruyen.net",
        transport="rest",
        default_enabled=False,
    ),
    "nettruyen": SourceSpec(
        id="nettruyen",
        name="NetTruyen",
        medium=StoryMedium.COMIC,
        base_url="https://nettruyenco.vn",
        transport="html",
        default_enabled=False,
    ),
    "blogtruyen": SourceSpec(
        id="blogtruyen",
        name="BlogTruyen",
        medium=StoryMedium.COMIC,
        base_url="https://blogtruyen.vn",
        transport="html",
        default_enabled=False,
    ),
    "hako": SourceSpec(
        id="hako",
        name="Hako Light Novel",
        medium=StoryMedium.NOVEL,
        base_url="https://ln.hako.vn",
        transport="html",
        default_enabled=True,
    ),
    "truyenfull": SourceSpec(
        id="truyenfull",
        name="TruyenFull",
        medium=StoryMedium.NOVEL,
        base_url="https://truyenfull.vn",
        transport="html",
        default_enabled=True,
    ),
    "tangthuvien": SourceSpec(
        id="tangthuvien",
        name="Tàng Thư Viện",
        medium=StoryMedium.NOVEL,
        base_url="https://truyen.tangthuvien.vn",
        transport="html",
        default_enabled=True,
    ),
    "metruyenchu": SourceSpec(
        id="metruyenchu",
        name="Mê Truyện Chữ",
        medium=StoryMedium.NOVEL,
        base_url="https://metruyenchu.com.vn",
        transport="html",
        default_enabled=True,
    ),
    "wikidich": SourceSpec(
        id="wikidich",
        name="Wikidich",
        medium=StoryMedium.NOVEL,
        base_url="https://wikidich.vn",
        transport="html",
        default_enabled=True,
    ),
}


def enabled_source_ids() -> FrozenSet[str]:
    raw = os.getenv("ENABLED_SOURCES", "").strip().lower()
    if not raw:
        return frozenset(source.id for source in SOURCE_SPECS.values() if source.default_enabled)
    if raw == "*":
        return frozenset(SOURCE_SPECS)
    return frozenset(
        source_id
        for source_id in (part.strip() for part in raw.split(","))
        if source_id in SOURCE_SPECS
    )


def is_source_enabled(source_id: str) -> bool:
    return source_id.strip().lower() in enabled_source_ids()


def source_specs_for_medium(medium: StoryMedium, enabled_only: bool = True):
    enabled = enabled_source_ids()
    return [
        spec
        for spec in SOURCE_SPECS.values()
        if spec.medium == medium and (not enabled_only or spec.id in enabled)
    ]
