from app.engine.matcher import (
    find_best_story_match,
    normalize_identity_text,
    story_identity_score,
)
from app.models.story import Story, StoryMedium


def story(source: str, title: str, author: str | None = None):
    return Story(
        source_id=source,
        external_id=f"{source}:{title}",
        external_url=f"https://example.test/{source}",
        title=title,
        slug=title.lower().replace(" ", "-"),
        author=author,
        medium=StoryMedium.COMIC,
    )


def test_title_identity_normalizes_vietnamese_and_edition_noise():
    assert normalize_identity_text("Đấu Phá Thương Khung (Manga 2025)") == "dau pha thuong khung"


def test_story_identity_accepts_alias_like_punctuation_and_diacritics():
    primary = story("a", "Tôi Là Đại Thần Tiên", "Shidi Man Wang")
    candidate = story("b", "Toi la Dai Than Tien - Manhua", "Shidi Man Wang")
    assert story_identity_score(primary, candidate) >= 0.9


def test_story_identity_penalizes_conflicting_authors():
    primary = story("a", "Hành Trình Bất Tận", "Nguyễn Văn A")
    candidate = story("b", "Hanh Trinh Bat Tan", "Tác Giả Hoàn Toàn Khác")
    assert story_identity_score(primary, candidate) < 0.9


def test_ambiguous_best_match_is_rejected_instead_of_merging_wrong_story():
    primary = story("a", "Vương Giả")
    candidates = [
        story("b", "Vương Giả Manga"),
        story("c", "Vuong Gia Manhwa"),
    ]
    assert find_best_story_match(primary, candidates) is None
