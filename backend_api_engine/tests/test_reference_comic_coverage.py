from app.engine.coverage import analyze_chapter_coverage
from app.engine.merger import SmartChapterMerger
from app.models.chapter import ChapterHeader


def chapters(start: int, end: int, source: str):
    return [
        ChapterHeader(
            external_id=f"{source}-{number}",
            title=f"Chapter {number}",
            chapter_number=str(number),
            url=f"https://source.example/{source}/{number}",
        )
        for number in range(start, end + 1)
    ]


def test_lazy_lord_reference_merge_requires_all_151_integer_chapters():
    primary = chapters(1, 138, "primary")
    secondary = chapters(139, 151, "secondary")
    merged = SmartChapterMerger().merge(
        primary_chapters=primary,
        secondary_sources=[("secondary", secondary)],
        primary_source_name="primary",
    )
    coverage = analyze_chapter_coverage(merged, expected_latest=151)
    assert coverage["current_max"] == 151
    assert coverage["unique_integer_chapters"] == 151
    assert coverage["missing_chapters"] == []
    assert coverage["complete"] is True


def test_lazy_lord_current_138_chapter_manifest_is_reported_incomplete():
    coverage = analyze_chapter_coverage(
        chapters(1, 138, "otruyen"),
        expected_latest=151,
    )
    assert coverage["complete"] is False
    assert coverage["missing_chapters"] == list(range(139, 152))
