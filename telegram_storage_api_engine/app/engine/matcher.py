import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Iterable, Optional

from app.models.story import Story


_EDITION_NOISE = re.compile(
    r"\b(?:manga|manhwa|manhua|comic|novel|light\s+novel|web\s+novel|truyen|truyện)\b",
    re.IGNORECASE,
)


def normalize_identity_text(value: Optional[str]) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(character for character in decomposed if not unicodedata.combining(character))
    ascii_text = ascii_text.replace("đ", "d").replace("Đ", "D").lower()
    ascii_text = re.sub(r"\([^)]*(?:20\d{2}|19\d{2})[^)]*\)", " ", ascii_text)
    ascii_text = _EDITION_NOISE.sub(" ", ascii_text)
    return " ".join(re.findall(r"[a-z0-9]+", ascii_text))


def _token_similarity(left: str, right: str) -> float:
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def story_identity_score(primary: Story, candidate: Story) -> float:
    left_title = normalize_identity_text(primary.title)
    right_title = normalize_identity_text(candidate.title)
    if not left_title or not right_title:
        return 0.0
    if left_title == right_title:
        title_score = 1.0
    else:
        sequence = SequenceMatcher(None, left_title, right_title).ratio()
        title_score = sequence * 0.65 + _token_similarity(left_title, right_title) * 0.35

    left_author = normalize_identity_text(primary.author)
    right_author = normalize_identity_text(candidate.author)
    if left_author and right_author:
        author_score = max(
            SequenceMatcher(None, left_author, right_author).ratio(),
            _token_similarity(left_author, right_author),
        )
        if author_score < 0.5:
            title_score -= 0.12
        else:
            title_score = title_score * 0.9 + author_score * 0.1
    return max(0.0, min(title_score, 1.0))


@dataclass(frozen=True)
class StoryMatch:
    story: Story
    score: float


def find_best_story_match(
    primary: Story,
    candidates: Iterable[Story],
    threshold: float = 0.9,
) -> Optional[StoryMatch]:
    ranked = sorted(
        (StoryMatch(story=candidate, score=story_identity_score(primary, candidate)) for candidate in candidates),
        key=lambda match: match.score,
        reverse=True,
    )
    if not ranked or ranked[0].score < threshold:
        return None
    if len(ranked) > 1 and ranked[0].score - ranked[1].score < 0.025:
        return None
    return ranked[0]
