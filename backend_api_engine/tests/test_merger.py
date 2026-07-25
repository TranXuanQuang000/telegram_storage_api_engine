import pytest
from app.models.chapter import ChapterHeader
from app.engine.merger import ChapterParser, GapDetector, SmartChapterMerger, NormalizedChapterKey


def test_chapter_parser_variations():
    # 1. "Chương 10"
    key1 = ChapterParser.parse("Chương 10")
    assert key1.chapter_float == 10.0
    assert key1.volume_number is None
    assert key1.is_extra is False
    assert key1.sub_chapter is None

    # 2. "Chapter 10.5"
    key2 = ChapterParser.parse("Chapter 10.5")
    assert key2.chapter_float == 10.5
    assert key2.volume_number is None
    assert key2.is_extra is False
    assert key2.sub_chapter is None

    # 3. "10"
    key3 = ChapterParser.parse("10")
    assert key3.chapter_float == 10.0
    assert key3.volume_number is None
    assert key3.is_extra is False
    assert key3.sub_chapter is None

    # 4. "Vol 1 Chap 10"
    key4 = ChapterParser.parse("Vol 1 Chap 10")
    assert key4.chapter_float == 10.0
    assert key4.volume_number == 1
    assert key4.is_extra is False
    assert key4.sub_chapter is None

    # 5. "Chương 10a"
    key5 = ChapterParser.parse("Chương 10a")
    assert key5.chapter_float == 10.0
    assert key5.volume_number is None
    assert key5.is_extra is False
    assert key5.sub_chapter == "a"

    # 6. "Ngoại truyện 1"
    key6 = ChapterParser.parse("Ngoại truyện 1")
    assert key6.chapter_float == 1.0
    assert key6.volume_number is None
    assert key6.is_extra is True
    assert key6.sub_chapter is None

    # Additional parser variations: "Tập 2 Chapter 15.5b"
    key7 = ChapterParser.parse("Tập 2 Chapter 15.5b")
    assert key7.chapter_float == 15.5
    assert key7.volume_number == 2
    assert key7.is_extra is False
    assert key7.sub_chapter == "b"

    # "Side Story 3"
    key8 = ChapterParser.parse("Side Story 3")
    assert key8.chapter_float == 3.0
    assert key8.is_extra is True


def test_gap_detector():
    # Primary list: ch 1..9 and 21..50
    ch_list = []
    for i in range(1, 10):
        ch_list.append(ChapterHeader(external_id=f"c{i}", title=f"Chương {i}", chapter_number=str(i)))
    for i in range(21, 51):
        ch_list.append(ChapterHeader(external_id=f"c{i}", title=f"Chương {i}", chapter_number=str(i)))

    gaps = GapDetector.detect_gaps(ch_list)
    assert len(gaps) == 1
    assert gaps[0] == (10, 20)

    # Test multiple gaps: 1..5, 10..12, 20..22
    multi_list = []
    for i in [1, 2, 3, 4, 5, 10, 11, 12, 20, 21, 22]:
        multi_list.append(ChapterHeader(external_id=f"c{i}", title=f"Chương {i}", chapter_number=str(i)))
    
    multi_gaps = GapDetector.detect_gaps(multi_list)
    assert multi_gaps == [(6, 9), (13, 19)]


def test_smart_chapter_merger():
    # Source A (Primary): ch 1..9 and 21..50 (missing ch 10..20)
    source_a_chapters = []
    for i in range(1, 10):
        source_a_chapters.append(
            ChapterHeader(
                external_id=f"a_{i}",
                title=f"Chương {i}",
                chapter_number=str(i),
                raw_metadata={"source": "Source A"}
            )
        )
    for i in range(21, 51):
        source_a_chapters.append(
            ChapterHeader(
                external_id=f"a_{i}",
                title=f"Chương {i}",
                chapter_number=str(i),
                raw_metadata={"source": "Source A"}
            )
        )

    # Source B (Secondary): ch 1..50
    source_b_chapters = []
    for i in range(1, 51):
        source_b_chapters.append(
            ChapterHeader(
                external_id=f"b_{i}",
                title=f"Chương {i} (Source B)",
                chapter_number=str(i),
                raw_metadata={"source": "Source B"}
            )
        )

    merger = SmartChapterMerger()
    merged = merger.merge(
        primary_chapters=source_a_chapters,
        secondary_sources=[("Source B", source_b_chapters)],
        primary_source_name="Source A",
    )

    # Assert total length is 50 contiguous chapters
    assert len(merged) == 50

    # Verify contiguous chapter numbers 1 to 50
    for idx, ch in enumerate(merged, start=1):
        parsed = ChapterParser.parse(ch.chapter_number or ch.title or "")
        assert parsed.chapter_float == float(idx)

    # Check gap filled chapters (10 to 20)
    for i in range(10, 21):
        ch = merged[i - 1]  # 0-indexed
        assert ch.raw_metadata["is_filled"] is True
        assert ch.raw_metadata["original_source"] == "Source B"
        assert "merged_at" in ch.raw_metadata

    # Check non-filled primary chapters (e.g., ch 1..9 and 21..50)
    for i in range(1, 10):
        ch = merged[i - 1]
        assert ch.raw_metadata["is_filled"] is False
        assert ch.raw_metadata["original_source"] == "Source A"

    for i in range(21, 51):
        ch = merged[i - 1]
        assert ch.raw_metadata["is_filled"] is False
        assert ch.raw_metadata["original_source"] == "Source A"


def test_smart_chapter_merger_tuples_input():
    source_a = [
        ChapterHeader(external_id="1", title="Chương 1", chapter_number="1"),
        ChapterHeader(external_id="5", title="Chương 5", chapter_number="5"),
    ]
    source_b = [
        ChapterHeader(external_id="2", title="Chương 2", chapter_number="2"),
        ChapterHeader(external_id="3", title="Chương 3", chapter_number="3"),
        ChapterHeader(external_id="4", title="Chương 4", chapter_number="4"),
    ]

    merger = SmartChapterMerger()
    merged = merger.merge([("Source A", source_a), ("Source B", source_b)])
    assert len(merged) == 5
    assert [ch.chapter_number for ch in merged] == ["1", "2", "3", "4", "5"]
    assert merged[1].raw_metadata["is_filled"] is True
    assert merged[1].raw_metadata["original_source"] == "Source B"


def test_gap_detector_ch0():
    ch_list = [
        ChapterHeader(external_id="c0", title="Chương 0", chapter_number="0"),
        ChapterHeader(external_id="c5", title="Chương 5", chapter_number="5"),
    ]
    gaps = GapDetector.detect_gaps(ch_list)
    assert gaps == [(1, 4)]


def test_gap_detector_leading_gap():
    ch_list = [
        ChapterHeader(external_id="c5", title="Chương 5", chapter_number="5"),
        ChapterHeader(external_id="c6", title="Chương 6", chapter_number="6"),
    ]
    gaps = GapDetector.detect_gaps(ch_list)
    assert gaps == [(1, 4)]


def test_merger_fractional_subchapters_in_gap():
    source_a = [
        ChapterHeader(external_id="a1", title="Chương 1", chapter_number="1"),
        ChapterHeader(external_id="a9", title="Chương 9", chapter_number="9"),
        ChapterHeader(external_id="a20", title="Chương 20", chapter_number="20"),
    ]
    source_b = [
        ChapterHeader(external_id="b10_5", title="Chương 10.5", chapter_number="10.5"),
        ChapterHeader(external_id="b19_5", title="Chương 19.5", chapter_number="19.5"),
    ]
    merger = SmartChapterMerger()
    merged = merger.merge(
        primary_chapters=source_a,
        secondary_sources=[("Source B", source_b)],
        primary_source_name="Source A",
    )
    ch_numbers = [ch.chapter_number for ch in merged]
    assert "10.5" in ch_numbers
    assert "19.5" in ch_numbers
    filled = [ch for ch in merged if ch.raw_metadata.get("is_filled")]
    assert len(filled) == 2


def test_sub_chapter_regex_title_word_handling():
    key_title_word = ChapterParser.parse("Chương 10 Thất Tinh")
    assert key_title_word.chapter_float == 10.0
    assert key_title_word.sub_chapter is None

    key_sub = ChapterParser.parse("Chương 10a")
    assert key_sub.chapter_float == 10.0
    assert key_sub.sub_chapter == "a"


@pytest.mark.parametrize(
    ("label", "expected_number", "expected_suffix"),
    [
        ("Chương 001.50", "1.5", None),
        ("Episode #12,5", "12.5", None),
        ("Hồi 7", "7", None),
        ("chapter-10_part 2", "10", "p2"),
    ],
)
def test_parser_builds_source_neutral_decimal_identity(
    label, expected_number, expected_suffix
):
    parsed = ChapterParser.parse(label)
    assert parsed.is_parseable is True
    assert parsed.chapter_number == expected_number
    assert parsed.sub_chapter == expected_suffix

    equivalent = ChapterParser.parse(f"Chapter {expected_number}{expected_suffix or ''}")
    if expected_suffix != "p2":
        assert parsed.canonical_id == equivalent.canonical_id


def test_unparseable_label_does_not_alias_real_chapter_zero():
    unknown = ChapterParser.parse("Thông báo từ nhóm dịch")
    chapter_zero = ChapterParser.parse("Chương 0")

    assert unknown.is_parseable is False
    assert unknown.chapter_decimal is None
    assert unknown.canonical_id.startswith("unknown:")
    assert chapter_zero.is_parseable is True
    assert chapter_zero.chapter_decimal == 0
    assert unknown.canonical_id != chapter_zero.canonical_id


def test_header_number_inherits_extra_qualifier_from_title():
    chapter = ChapterHeader(
        external_id="side-1",
        chapter_number="1",
        title="Ngoại truyện đặc biệt",
    )
    identity = ChapterParser.parse_chapter(chapter)

    assert identity.is_extra is True
    assert identity.canonical_id.startswith("extra:")


def test_decimal_subchapter_does_not_hide_missing_integer_base():
    chapters = [
        ChapterHeader(external_id="9", title="Chapter 9", chapter_number="9"),
        ChapterHeader(external_id="10-5", title="Chapter 10.5", chapter_number="10.5"),
        ChapterHeader(external_id="11", title="Chapter 11", chapter_number="11"),
    ]
    assert GapDetector.detect_gaps(chapters) == [(1, 8), (10, 10)]


def test_merger_deduplicates_primary_and_tracks_all_source_variants():
    primary = [
        ChapterHeader(external_id="a-10", title="Chương 10", chapter_number="10"),
        ChapterHeader(external_id="a-10-duplicate", title="Chapter 10", chapter_number="10"),
    ]
    secondary = [
        ChapterHeader(external_id="b-10", title="Episode 10", chapter_number="10"),
    ]

    merged = SmartChapterMerger().merge(
        primary,
        [("source-b", secondary)],
        "source-a",
    )

    assert len(merged) == 1
    assert merged[0].canonical_id == "regular:v_:n10:s_"
    assert {
        (ref.source_id, ref.external_id) for ref in merged[0].source_refs
    } == {
        ("source-a", "a-10"),
        ("source-a", "a-10-duplicate"),
        ("source-b", "b-10"),
    }
    assert merged[0].raw_metadata["available_sources"] == ["source-a", "source-b"]


def test_merger_aligns_optional_volume_labels_using_overlapping_chapters():
    primary = [
        ChapterHeader(external_id="a-1", title="Chương 1", chapter_number="1"),
        ChapterHeader(external_id="a-3", title="Chương 3", chapter_number="3"),
    ]
    secondary = [
        ChapterHeader(
            external_id=f"b-{number}",
            title=f"Vol 1 Chapter {number}",
            chapter_number=str(number),
        )
        for number in (1, 2, 3)
    ]

    merged = SmartChapterMerger().merge(
        primary,
        [("source-b", secondary)],
        "source-a",
    )

    assert [chapter.chapter_number for chapter in merged] == ["1", "2", "3"]
    filled = merged[1]
    assert filled.canonical_id == "regular:v_:n2:s_"
    assert filled.raw_metadata["is_filled"] is True
    assert filled.raw_metadata["fill_reason"] == "gap"
    assert len(merged[0].source_refs) == 2


def test_merger_preserves_ambiguous_volume_reset_sequences():
    primary = [
        ChapterHeader(
            external_id="v1-c1",
            title="Vol 1 Chapter 1",
            chapter_number="1",
        ),
        ChapterHeader(
            external_id="v2-c1",
            title="Vol 2 Chapter 1",
            chapter_number="1",
        ),
    ]
    ambiguous_secondary = [
        ChapterHeader(external_id="plain-c1", title="Chapter 1", chapter_number="1"),
    ]

    merged = SmartChapterMerger().merge(
        primary,
        [("source-b", ambiguous_secondary)],
        "source-a",
    )

    assert len(merged) == 3
    assert {chapter.canonical_id for chapter in merged} == {
        "regular:v1:n1:s_",
        "regular:v2:n1:s_",
        "regular:v_:n1:s_",
    }


def test_extra_cannot_satisfy_a_regular_gap_and_inputs_are_not_mutated():
    primary = [
        ChapterHeader(external_id="a-9", title="Chapter 9", chapter_number="9"),
        ChapterHeader(external_id="a-11", title="Chapter 11", chapter_number="11"),
    ]
    secondary = [
        ChapterHeader(
            external_id="b-extra-10",
            title="Ngoại truyện 10",
            chapter_number="10",
        ),
    ]
    original_primary = [chapter.model_dump() for chapter in primary]
    original_secondary = [chapter.model_dump() for chapter in secondary]

    merged = SmartChapterMerger().merge(
        primary,
        [("source-b", secondary)],
        "source-a",
    )

    assert GapDetector.detect_gaps(merged) == [(1, 8), (10, 10)]
    extra = next(chapter for chapter in merged if chapter.external_id == "b-extra-10")
    assert extra.raw_metadata["fill_reason"] == "secondary_unique"
    assert [chapter.model_dump() for chapter in primary] == original_primary
    assert [chapter.model_dump() for chapter in secondary] == original_secondary


def test_secondary_unique_tail_extends_the_canonical_sequence():
    primary = [
        ChapterHeader(external_id="a-1", title="Chapter 1", chapter_number="1"),
    ]
    secondary = [
        ChapterHeader(external_id="b-1", title="Chapter 1", chapter_number="1"),
        ChapterHeader(external_id="b-2", title="Chapter 2", chapter_number="2"),
    ]

    merged = SmartChapterMerger().merge(
        primary,
        [("source-b", secondary)],
        "source-a",
    )

    assert [chapter.chapter_number for chapter in merged] == ["1", "2"]
    assert merged[1].raw_metadata["fill_reason"] == "secondary_unique"
