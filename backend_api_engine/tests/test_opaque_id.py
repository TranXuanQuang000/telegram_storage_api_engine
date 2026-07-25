from app.engine.opaque_id import decode_chapter_ref, encode_chapter_ref


def test_chapter_ref_round_trip_supports_unicode_and_source_provenance(monkeypatch):
    monkeypatch.setenv("OPAQUE_ID_SECRET", "unit-test-secret")
    value = encode_chapter_ref("mangadex", "đấu-phá-thương-khung", "chapter/10.5")
    decoded = decode_chapter_ref(value)
    assert decoded is not None
    assert decoded.source == "mangadex"
    assert decoded.story_id == "đấu-phá-thương-khung"
    assert decoded.chapter_id == "chapter/10.5"


def test_chapter_ref_rejects_tampering(monkeypatch):
    monkeypatch.setenv("OPAQUE_ID_SECRET", "unit-test-secret")
    value = encode_chapter_ref("otruyen", "one-piece", "chapter-1")
    payload = value.split(".")
    payload[1] = payload[1][:-1] + ("A" if payload[1][-1] != "A" else "B")
    assert decode_chapter_ref(".".join(payload)) is None
