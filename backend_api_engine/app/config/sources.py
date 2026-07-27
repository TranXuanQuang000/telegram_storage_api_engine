import os
from dataclasses import dataclass
from typing import Dict, FrozenSet, Literal, Tuple

from app.models.story import StoryMedium


SourceTransport = Literal["rest", "html", "graphql", "opds"]
SourceAccess = Literal["reader", "metadata", "disabled"]
SourceImplementation = Literal["backend", "frontend", "planned"]


@dataclass(frozen=True)
class SourceSpec:
    id: str
    name: str
    medium: StoryMedium
    base_url: str
    transport: SourceTransport
    default_enabled: bool
    attribution_required: bool = True
    access: SourceAccess = "reader"
    implementation: SourceImplementation = "backend"
    capabilities: Tuple[str, ...] = ("catalog", "detail", "chapters", "content")
    languages: Tuple[str, ...] = ()
    coverage: str = "specialized"
    stability_score: int = 3
    notes: str = ""


SOURCE_SPECS: Dict[str, SourceSpec] = {
    # Comic reader sources
    "otruyen": SourceSpec(
        id="otruyen",
        name="OTruyen API",
        medium=StoryMedium.COMIC,
        base_url="https://otruyenapi.com/v1/api",
        transport="rest",
        default_enabled=True,
        languages=("vi",),
        coverage="high",
        stability_score=4,
        notes="Vietnamese comic compatibility API; freshness is monitored at runtime.",
    ),
    "mangadex": SourceSpec(
        id="mangadex",
        name="MangaDex",
        medium=StoryMedium.COMIC,
        base_url="https://api.mangadex.org",
        transport="rest",
        default_enabled=True,
        languages=("vi", "en", "ja", "ko", "zh"),
        coverage="high",
        stability_score=5,
        notes="Official public API; Vietnamese chapters depend on scanlation availability.",
    ),
    # Comic candidates kept fail-closed until a stable public interface exists.
    "cuutruyen": SourceSpec(
        id="cuutruyen",
        name="Cứu Truyện",
        medium=StoryMedium.COMIC,
        base_url="https://cuutruyen.net",
        transport="rest",
        default_enabled=False,
        access="disabled",
        implementation="planned",
        languages=("vi",),
        stability_score=2,
        notes="Fail-closed: no stable documented API/TLS path is currently available.",
    ),
    "nettruyen": SourceSpec(
        id="nettruyen",
        name="NetTruyen",
        medium=StoryMedium.COMIC,
        base_url="https://nettruyenco.vn",
        transport="html",
        default_enabled=False,
        access="disabled",
        implementation="planned",
        languages=("vi",),
        coverage="high",
        stability_score=2,
        notes="Fail-closed: no verified public API; HTML crawling is not treated as stable.",
    ),
    "blogtruyen": SourceSpec(
        id="blogtruyen",
        name="BlogTruyen",
        medium=StoryMedium.COMIC,
        base_url="https://blogtruyen.vn",
        transport="html",
        default_enabled=False,
        access="disabled",
        implementation="planned",
        languages=("vi",),
        stability_score=2,
        notes="Fail-closed: no verified stable public API.",
    ),
    # Stable comic metadata/ratings sources. These never masquerade as chapter sources.
    "anilist": SourceSpec(
        id="anilist",
        name="AniList",
        medium=StoryMedium.COMIC,
        base_url="https://graphql.anilist.co",
        transport="graphql",
        default_enabled=False,
        access="metadata",
        capabilities=("catalog", "search", "detail", "ratings"),
        languages=("en", "ja"),
        coverage="high",
        stability_score=5,
        notes="Metadata and ratings enrichment only; not a chapter-content source.",
    ),
    "jikan": SourceSpec(
        id="jikan",
        name="Jikan / MyAnimeList",
        medium=StoryMedium.COMIC,
        base_url="https://api.jikan.moe/v4",
        transport="rest",
        default_enabled=False,
        access="metadata",
        capabilities=("catalog", "search", "detail", "ratings"),
        languages=("en", "ja"),
        coverage="high",
        stability_score=4,
        notes="Metadata fallback with strict public rate limits.",
    ),
    "kitsu": SourceSpec(
        id="kitsu",
        name="Kitsu",
        medium=StoryMedium.COMIC,
        base_url="https://kitsu.io/api/edge",
        transport="rest",
        default_enabled=False,
        access="metadata",
        capabilities=("catalog", "search", "detail", "ratings"),
        languages=("en", "ja"),
        coverage="medium",
        stability_score=4,
        notes="Metadata enrichment only.",
    ),
    "mangaupdates": SourceSpec(
        id="mangaupdates",
        name="MangaUpdates",
        medium=StoryMedium.COMIC,
        base_url="https://api.mangaupdates.com/v1",
        transport="rest",
        default_enabled=False,
        access="metadata",
        capabilities=("search", "detail", "genres"),
        languages=("en",),
        coverage="high",
        stability_score=4,
        notes="Series metadata and release information; no reader pages.",
    ),
    "xkcd": SourceSpec(
        id="xkcd",
        name="xkcd",
        medium=StoryMedium.COMIC,
        base_url="https://xkcd.com",
        transport="rest",
        default_enabled=True,
        access="reader",
        capabilities=("catalog", "detail", "chapters", "content"),
        languages=("en",),
        coverage="webcomic",
        stability_score=5,
        notes="Official JSON feed; comic images are attributed under CC BY-NC 2.5.",
    ),
    # Existing Vietnamese novel reader sources
    "hako": SourceSpec(
        id="hako",
        name="Hako Light Novel",
        medium=StoryMedium.NOVEL,
        base_url="https://ln.hako.vn",
        transport="html",
        default_enabled=True,
        languages=("vi",),
        coverage="light-novel",
        stability_score=3,
        notes="Vietnamese light novels; upstream attribution and access rules are preserved.",
    ),
    "truyenfull": SourceSpec(
        id="truyenfull",
        name="TruyenFull",
        medium=StoryMedium.NOVEL,
        base_url="https://truyenfull.vn",
        transport="html",
        default_enabled=True,
        languages=("vi",),
        coverage="high",
        stability_score=3,
    ),
    "tangthuvien": SourceSpec(
        id="tangthuvien",
        name="Tàng Thư Viện",
        medium=StoryMedium.NOVEL,
        base_url="https://truyen.tangthuvien.vn",
        transport="html",
        default_enabled=True,
        languages=("vi",),
        coverage="high",
        stability_score=3,
    ),
    "metruyenchu": SourceSpec(
        id="metruyenchu",
        name="Mê Truyện Chữ",
        medium=StoryMedium.NOVEL,
        base_url="https://metruyenchu.org",
        transport="html",
        default_enabled=True,
        languages=("vi",),
        coverage="high",
        stability_score=3,
    ),
    "wikidich": SourceSpec(
        id="wikidich",
        name="Wikidich",
        medium=StoryMedium.NOVEL,
        base_url="https://wikidich.vn",
        transport="html",
        default_enabled=True,
        languages=("vi",),
        coverage="high",
        stability_score=3,
    ),
    # Legal public-domain reader backbones
    "wikisourcevi": SourceSpec(
        id="wikisourcevi",
        name="Wikisource tiếng Việt",
        medium=StoryMedium.NOVEL,
        base_url="https://vi.wikisource.org",
        transport="rest",
        default_enabled=False,
        access="reader",
        implementation="frontend",
        capabilities=("catalog", "search", "detail", "chapters", "content"),
        languages=("vi",),
        coverage="public-domain",
        stability_score=5,
        notes="Public-domain/free-license full text through the official MediaWiki API.",
    ),
    "gutendex": SourceSpec(
        id="gutendex",
        name="Project Gutenberg (Gutendex)",
        medium=StoryMedium.NOVEL,
        base_url="https://gutendex.com",
        transport="rest",
        default_enabled=True,
        access="reader",
        capabilities=("catalog", "search", "detail", "content"),
        languages=("en", "fr", "de", "es", "zh"),
        coverage="public-domain",
        stability_score=4,
        notes="Public-domain ebook catalog; each ebook is exposed as one full-text reading unit.",
    ),
    # Stable novel discovery/enrichment sources
    "syosetu": SourceSpec(
        id="syosetu",
        name="Shōsetsuka ni Narō",
        medium=StoryMedium.NOVEL,
        base_url="https://api.syosetu.com/novelapi/api/",
        transport="rest",
        default_enabled=False,
        access="metadata",
        capabilities=("catalog", "search", "detail"),
        languages=("ja",),
        coverage="web-novel",
        stability_score=5,
        notes="Official metadata API for Japanese web novels; chapter content is not imported.",
    ),
    "openlibrary": SourceSpec(
        id="openlibrary",
        name="Open Library",
        medium=StoryMedium.NOVEL,
        base_url="https://openlibrary.org",
        transport="rest",
        default_enabled=False,
        access="metadata",
        capabilities=("catalog", "search", "detail", "covers"),
        languages=("vi", "en", "multi"),
        coverage="high",
        stability_score=5,
        notes="Metadata/cover enrichment only; borrowable books are not rehosted.",
    ),
    "wattpad": SourceSpec(
        id="wattpad",
        name="Wattpad",
        medium=StoryMedium.NOVEL,
        base_url="https://www.wattpad.com",
        transport="html",
        default_enabled=False,
        access="metadata",
        implementation="backend",
        capabilities=("detail", "covers", "genres", "source-link"),
        languages=("vi", "en", "multi"),
        coverage="user-generated",
        stability_score=2,
        notes="Import-by-ID from public JSON-LD/Open Graph only; chapter text copying is disabled.",
    ),
}


def _is_backend_reader(spec: SourceSpec) -> bool:
    return spec.access == "reader" and spec.implementation == "backend"


def enabled_source_ids() -> FrozenSet[str]:
    raw = os.getenv("ENABLED_SOURCES", "").strip().lower()
    if not raw:
        return frozenset(
            source.id
            for source in SOURCE_SPECS.values()
            if source.default_enabled and _is_backend_reader(source)
        )
    if raw == "*":
        # Wildcards must never bypass a fail-closed or metadata-only policy.
        return frozenset(source.id for source in SOURCE_SPECS.values() if _is_backend_reader(source))
    return frozenset(
        source_id
        for source_id in (part.strip() for part in raw.split(","))
        if source_id in SOURCE_SPECS and _is_backend_reader(SOURCE_SPECS[source_id])
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
