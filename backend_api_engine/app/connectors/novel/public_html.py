from __future__ import annotations

import re
from typing import Iterable, Optional

import httpx
from bs4 import BeautifulSoup, Tag


class SourceAccessRestrictedError(RuntimeError):
    """The source requires an interactive challenge, login, or payment."""


class SourceMarkupError(RuntimeError):
    """A public page loaded, but no supported content markup was present."""


_CHALLENGE_MARKERS = (
    "cf-chl-",
    "cf_chl_",
    "challenge-platform",
    "g-recaptcha",
    "hcaptcha",
    "just a moment...",
)

_RESTRICTED_SELECTORS = (
    ".login-required",
    ".requires-login",
    ".paywall",
    ".premium-content",
    "[data-requires-login='true']",
    "[data-paywall='true']",
    "form[action*='/login']",
    "form[action*='/dang-nhap']",
)


def clean_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_public_html(
    response: httpx.Response,
    *,
    expected_selectors: Iterable[str] = (),
) -> BeautifulSoup:
    """
    Parse a directly accessible HTML response.

    This intentionally does not solve challenges, submit login forms, attach
    cookies, or unlock premium content. Restricted pages fail closed so the
    aggregator can try a different public source.
    """
    if response.status_code in {401, 403, 451}:
        raise SourceAccessRestrictedError(
            f"Public access denied by {response.request.url.host} ({response.status_code})"
        )
    response.raise_for_status()

    html = response.text
    lowered = html[:200_000].lower()
    if any(marker in lowered for marker in _CHALLENGE_MARKERS):
        raise SourceAccessRestrictedError(
            f"Interactive anti-bot challenge returned by {response.request.url.host}"
        )

    soup = BeautifulSoup(html, "lxml")
    expected = tuple(expected_selectors)
    has_expected_content = not expected or any(soup.select_one(selector) for selector in expected)
    if not has_expected_content and any(soup.select_one(selector) for selector in _RESTRICTED_SELECTORS):
        raise SourceAccessRestrictedError(
            f"Login or paid access required by {response.request.url.host}"
        )
    return soup


def extract_public_chapter_text(
    soup: BeautifulSoup,
    selectors: Iterable[str],
) -> str:
    content: Optional[Tag] = None
    for selector in selectors:
        candidate = soup.select_one(selector)
        if isinstance(candidate, Tag):
            content = candidate
            break
    if content is None:
        raise SourceMarkupError("No supported public chapter content container found")

    for element in content.select(
        "script, style, noscript, iframe, form, button, ins, "
        ".ads, .advertisement, .quang-cao, .social-share, [hidden]"
    ):
        element.decompose()

    paragraphs = [
        clean_text(paragraph.get_text(" ", strip=True))
        for paragraph in content.find_all("p")
    ]
    paragraphs = [paragraph for paragraph in paragraphs if paragraph]
    if not paragraphs:
        paragraphs = [
            clean_text(line)
            for line in content.get_text("\n", strip=True).splitlines()
        ]
        paragraphs = [paragraph for paragraph in paragraphs if paragraph]
    if not paragraphs:
        raise SourceMarkupError("Public chapter content container was empty")
    return "\n\n".join(paragraphs)
