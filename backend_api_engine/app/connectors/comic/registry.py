from dataclasses import dataclass
from typing import Dict, Literal, Optional

import httpx

from app.connectors.base import BaseConnector
from app.connectors.comic.mangadex import MangaDexConnector
from app.connectors.comic.otruyen import OTruyenConnector
from app.connectors.comic.xkcd import XkcdConnector


ConnectorMode = Literal["direct_api", "upstream_alias", "disabled"]


@dataclass(frozen=True)
class ComicSourcePolicy:
    source_id: str
    source_name: str
    mode: ConnectorMode
    enabled: bool
    upstream_source_id: Optional[str] = None
    reason: str = ""


class SourceUnavailableError(RuntimeError):
    """Raised when a source would require an unsupported or evasive access method."""


COMIC_SOURCE_POLICIES: Dict[str, ComicSourcePolicy] = {
    "otruyen": ComicSourcePolicy(
        source_id="otruyen",
        source_name="OTruyen API",
        mode="direct_api",
        enabled=True,
        reason="Public compatibility API and the default legacy source.",
    ),
    "mangadex": ComicSourcePolicy(
        source_id="mangadex",
        source_name="MangaDex",
        mode="direct_api",
        enabled=True,
        reason="Official public API; no login required for public catalog and chapter reads.",
    ),
    "xkcd": ComicSourcePolicy(
        source_id="xkcd",
        source_name="xkcd",
        mode="direct_api",
        enabled=True,
        reason="Official JSON feed with CC BY-NC 2.5 attribution.",
    ),
    "nettruyen": ComicSourcePolicy(
        source_id="nettruyen",
        source_name="Nettruyen",
        mode="disabled",
        enabled=False,
        reason=(
            "No canonical, documented public catalog API was verified for the requested "
            "Nettruyen source. A similarly named domain using MangaDex is insufficient "
            "evidence to assign Nettruyen provenance."
        ),
    ),
    "cuutruyen": ComicSourcePolicy(
        source_id="cuutruyen",
        source_name="Cứu Truyện",
        mode="disabled",
        enabled=False,
        reason=(
            "Direct programmatic access currently requires browser/TLS fingerprint "
            "emulation. This connector intentionally does not bypass that control."
        ),
    ),
    "blogtruyen": ComicSourcePolicy(
        source_id="blogtruyen",
        source_name="BlogTruyen",
        mode="disabled",
        enabled=False,
        reason=(
            "No documented stable public API or canonical host is available. "
            "Unapproved HTML crawling and anti-bot bypass are disabled."
        ),
    ),
}


def get_comic_source_policy(source_id: str) -> ComicSourcePolicy:
    normalized = source_id.strip().lower()
    try:
        return COMIC_SOURCE_POLICIES[normalized]
    except KeyError as exc:
        raise SourceUnavailableError(f"Unknown comic source: {source_id!r}") from exc


def create_comic_connector(
    source_id: str,
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> BaseConnector:
    policy = get_comic_source_policy(source_id)
    if not policy.enabled:
        raise SourceUnavailableError(f"{policy.source_name} is disabled: {policy.reason}")

    effective_source = policy.upstream_source_id or policy.source_id
    if effective_source == "otruyen":
        return OTruyenConnector(client=client)
    if effective_source == "mangadex":
        return MangaDexConnector(client=client)
    if effective_source == "xkcd":
        return XkcdConnector(client=client)

    raise SourceUnavailableError(f"No connector factory is registered for {source_id!r}")


def create_direct_public_comic_connectors(
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, BaseConnector]:
    """Return one connector per real upstream, excluding aliases and disabled sources."""
    return {
        "otruyen": OTruyenConnector(client=client),
        "mangadex": MangaDexConnector(client=client),
        "xkcd": XkcdConnector(client=client),
    }
