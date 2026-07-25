import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import DefaultDict, Dict, Iterable, List, Optional, Tuple, Union

from app.models.chapter import (
    ChapterGap,
    ChapterHeader,
    ChapterIdentity,
    ChapterKind,
    ChapterSourceRef,
)


class NormalizedChapterKey(ChapterIdentity):
    """Backward-compatible name for the canonical identity model."""


class ChapterParser:
    _EXTRA_PATTERN = re.compile(
        r"(?:ngoại\s*truyện|ngoai\s*truyen|extra|side\s*story|"
        r"phụ\s*chương|phu\s*chuong|chương\s*phụ|chuong\s*phu|"
        r"omake|bonus|special|đặc\s*biệt|dac\s*biet|\bova\b|\bsp\b)",
        re.IGNORECASE,
    )
    _PROLOGUE_PATTERN = re.compile(
        r"(?:prologue|mở\s*đầu|mo\s*dau|lời\s*mở\s*đầu|loi\s*mo\s*dau)",
        re.IGNORECASE,
    )
    _EPILOGUE_PATTERN = re.compile(
        r"(?:epilogue|kết\s*truyện|ket\s*truyen|lời\s*kết|loi\s*ket)",
        re.IGNORECASE,
    )
    _VOLUME_PATTERN = re.compile(
        r"(?:vol(?:ume)?|tập|tap|quyển|quyen)\s*[#.:_-]?\s*(\d+)",
        re.IGNORECASE,
    )
    _CHAPTER_PATTERN = re.compile(
        r"(?:chương|chuong|chapter|chap|ch\.?|episode|ep\.?|hồi|hoi)"
        r"\s*[#.:_-]?\s*(\d+(?:[.,]\d+)?)(?:(?:[-._]?([a-z]))\b)?",
        re.IGNORECASE,
    )
    _HASH_PATTERN = re.compile(
        r"#\s*(\d+(?:[.,]\d+)?)(?:(?:[-._]?([a-z]))\b)?",
        re.IGNORECASE,
    )
    _NUMBER_PATTERN = re.compile(
        r"\b(\d+(?:[.,]\d+)?)(?:(?:[-._]?([a-z]))\b)?",
        re.IGNORECASE,
    )
    _PART_PATTERN = re.compile(
        r"(?:^|[^a-z0-9])(?:part|phần|phan)\s*(\d+)\b",
        re.IGNORECASE,
    )

    @staticmethod
    def _normalize_text(value: str) -> str:
        vietnamese_folded = value.replace("đ", "d").replace("Đ", "D")
        decomposed = unicodedata.normalize("NFKD", vietnamese_folded)
        asciiish = "".join(char for char in decomposed if not unicodedata.combining(char))
        lowered = asciiish.casefold()
        return re.sub(r"[^a-z0-9]+", " ", lowered).strip()

    @staticmethod
    def _decimal_string(raw_number: str) -> Optional[str]:
        try:
            value = Decimal(raw_number.replace(",", "."))
        except (InvalidOperation, ValueError):
            return None
        if not value.is_finite() or value < 0:
            return None
        normalized = format(value.normalize(), "f")
        return normalized.rstrip("0").rstrip(".") if "." in normalized else normalized

    @staticmethod
    def _kind_for(title: str) -> ChapterKind:
        if ChapterParser._PROLOGUE_PATTERN.search(title):
            return ChapterKind.PROLOGUE
        if ChapterParser._EPILOGUE_PATTERN.search(title):
            return ChapterKind.EPILOGUE
        if ChapterParser._EXTRA_PATTERN.search(title):
            return ChapterKind.EXTRA
        return ChapterKind.REGULAR

    @staticmethod
    def _canonical_id(
        kind: ChapterKind,
        chapter_number: Optional[str],
        volume_number: Optional[int],
        sub_chapter: Optional[str],
        normalized_title: str,
    ) -> str:
        if chapter_number is None:
            slug = normalized_title.replace(" ", "-")
            return f"unknown:{slug}" if slug else "unknown"
        volume = str(volume_number) if volume_number is not None else "_"
        suffix = sub_chapter or "_"
        return f"{kind.value}:v{volume}:n{chapter_number}:s{suffix}"

    @classmethod
    def _build_identity(
        cls,
        *,
        raw_title: str,
        chapter_number: Optional[str],
        volume_number: Optional[int],
        kind: ChapterKind,
        sub_chapter: Optional[str],
    ) -> NormalizedChapterKey:
        normalized_title = cls._normalize_text(raw_title)
        canonical_id = cls._canonical_id(
            kind,
            chapter_number,
            volume_number,
            sub_chapter,
            normalized_title,
        )
        return NormalizedChapterKey(
            canonical_id=canonical_id,
            chapter_number=chapter_number,
            volume_number=volume_number,
            kind=kind,
            sub_chapter=sub_chapter,
            normalized_title=normalized_title,
            raw_title=raw_title,
            is_parseable=chapter_number is not None,
        )

    @classmethod
    def parse(cls, raw_title_or_slug: str) -> NormalizedChapterKey:
        """
        Normalize multilingual chapter labels without using source IDs.

        Unparseable labels remain explicitly unknown instead of aliasing chapter 0.
        """
        title = str(raw_title_or_slug or "").strip()
        if not title:
            return cls._build_identity(
                raw_title="",
                chapter_number=None,
                volume_number=None,
                kind=ChapterKind.UNKNOWN,
                sub_chapter=None,
            )

        kind = cls._kind_for(title)
        volume_match = cls._VOLUME_PATTERN.search(title)
        volume_number = int(volume_match.group(1)) if volume_match else None
        text_for_chapter = title
        if volume_match:
            text_for_chapter = title[: volume_match.start()] + title[volume_match.end() :]

        match = cls._CHAPTER_PATTERN.search(text_for_chapter)
        if match is None:
            match = cls._HASH_PATTERN.search(text_for_chapter)
        if match is None:
            match = cls._NUMBER_PATTERN.search(text_for_chapter)

        chapter_number: Optional[str] = None
        sub_chapter: Optional[str] = None
        if match is not None:
            chapter_number = cls._decimal_string(match.group(1))
            suffix = match.group(2)
            if suffix:
                sub_chapter = suffix.lstrip("-._").casefold()
            else:
                part_match = cls._PART_PATTERN.search(text_for_chapter[match.end() :])
                if part_match:
                    sub_chapter = f"p{int(part_match.group(1))}"

        return cls._build_identity(
            raw_title=title,
            chapter_number=chapter_number,
            volume_number=volume_number,
            kind=kind,
            sub_chapter=sub_chapter,
        )

    @classmethod
    def parse_chapter(cls, chapter: ChapterHeader) -> NormalizedChapterKey:
        """Use both connector fields so a plain number retains title qualifiers."""
        number_identity = cls.parse(chapter.chapter_number or "")
        title_identity = cls.parse(chapter.title or "")

        if number_identity.is_parseable:
            kind = title_identity.kind if title_identity.kind != ChapterKind.UNKNOWN else number_identity.kind
            volume = (
                title_identity.volume_number
                if title_identity.volume_number is not None
                else number_identity.volume_number
            )
            suffix = number_identity.sub_chapter
            if (
                suffix is None
                and title_identity.chapter_number == number_identity.chapter_number
            ):
                suffix = title_identity.sub_chapter
            return cls._build_identity(
                raw_title=chapter.title or chapter.chapter_number or "",
                chapter_number=number_identity.chapter_number,
                volume_number=volume,
                kind=kind,
                sub_chapter=suffix,
            )
        if title_identity.is_parseable:
            return title_identity

        raw = chapter.title or chapter.chapter_number or ""
        return cls._build_identity(
            raw_title=raw,
            chapter_number=None,
            volume_number=None,
            kind=ChapterKind.UNKNOWN,
            sub_chapter=None,
        )

    @classmethod
    def with_volume(
        cls, identity: NormalizedChapterKey, volume_number: Optional[int]
    ) -> NormalizedChapterKey:
        return cls._build_identity(
            raw_title=identity.raw_title,
            chapter_number=identity.chapter_number,
            volume_number=volume_number,
            kind=identity.kind,
            sub_chapter=identity.sub_chapter,
        )


class GapDetector:
    @staticmethod
    def detect_gap_ranges(chapters: List[ChapterHeader]) -> List[ChapterGap]:
        """
        Detect missing regular integer chapters per volume.

        Decimal sub-chapters and extras do not masquerade as the missing base
        chapter. Leading gaps retain the legacy expectation that a sequence
        normally begins at chapter 1.
        """
        integers_by_volume: DefaultDict[Optional[int], set[int]] = defaultdict(set)
        for chapter in chapters:
            identity = ChapterParser.parse_chapter(chapter)
            value = identity.chapter_decimal
            if (
                not identity.is_parseable
                or identity.kind != ChapterKind.REGULAR
                or value is None
                or value != value.to_integral_value()
            ):
                continue
            integers_by_volume[identity.volume_number].add(int(value))

        gaps: List[ChapterGap] = []
        for volume_number, integers in integers_by_volume.items():
            if not integers:
                continue
            ordered = sorted(integers)
            if ordered[0] > 1:
                gaps.append(
                    ChapterGap(
                        start=1,
                        end=ordered[0] - 1,
                        volume_number=volume_number,
                    )
                )
            for left, right in zip(ordered, ordered[1:]):
                if right - left >= 2:
                    gaps.append(
                        ChapterGap(
                            start=left + 1,
                            end=right - 1,
                            volume_number=volume_number,
                        )
                    )
        return sorted(
            gaps,
            key=lambda gap: (
                gap.volume_number if gap.volume_number is not None else -1,
                gap.start,
            ),
        )

    @staticmethod
    def detect_gaps(chapters: List[ChapterHeader]) -> List[Tuple[int, int]]:
        """Backward-compatible unqualified gap representation."""
        return [(gap.start, gap.end) for gap in GapDetector.detect_gap_ranges(chapters)]


class SmartChapterMerger:
    def __init__(
        self,
        parser: Optional[ChapterParser] = None,
        gap_detector: Optional[GapDetector] = None,
    ):
        self.parser = parser or ChapterParser()
        self.gap_detector = gap_detector or GapDetector()

    @staticmethod
    def _base_key(identity: NormalizedChapterKey) -> Tuple[str, str, str]:
        return (
            identity.kind.value,
            identity.chapter_number or "",
            identity.sub_chapter or "",
        )

    @staticmethod
    def _source_ref(source_name: str, chapter: ChapterHeader) -> ChapterSourceRef:
        return ChapterSourceRef(
            source_id=source_name,
            external_id=chapter.external_id,
            url=chapter.url,
        )

    def _copy_with_identity(
        self,
        chapter: ChapterHeader,
        identity: NormalizedChapterKey,
        source_name: str,
        *,
        is_filled: bool,
        merged_at: Optional[str] = None,
        fill_reason: Optional[str] = None,
    ) -> ChapterHeader:
        data = chapter.model_dump()
        metadata = dict(data.get("raw_metadata") or {})
        metadata["is_filled"] = is_filled
        metadata["original_source"] = source_name
        metadata["canonical_chapter_id"] = identity.canonical_id
        metadata["normalized_chapter"] = identity.model_dump(mode="json")
        if merged_at is not None:
            metadata["merged_at"] = merged_at
        if fill_reason is not None:
            metadata["fill_reason"] = fill_reason

        refs = [
            ref if isinstance(ref, ChapterSourceRef) else ChapterSourceRef(**ref)
            for ref in (chapter.source_refs or [])
        ]
        new_ref = self._source_ref(source_name, chapter)
        if not any(
            ref.source_id == new_ref.source_id and ref.external_id == new_ref.external_id
            for ref in refs
        ):
            refs.append(new_ref)

        data["canonical_id"] = identity.canonical_id
        data["source_refs"] = refs
        data["raw_metadata"] = metadata
        return ChapterHeader(**data)

    @staticmethod
    def _record_variant(
        selected: ChapterHeader,
        source_name: str,
        variant: ChapterHeader,
    ) -> None:
        ref = ChapterSourceRef(
            source_id=source_name,
            external_id=variant.external_id,
            url=variant.url,
        )
        if not any(
            item.source_id == ref.source_id and item.external_id == ref.external_id
            for item in selected.source_refs
        ):
            selected.source_refs.append(ref)

        metadata = dict(selected.raw_metadata or {})
        sources = list(metadata.get("available_sources") or [])
        if source_name not in sources:
            sources.append(source_name)
        metadata["available_sources"] = sources
        variants = list(metadata.get("source_variants") or [])
        marker = {
            "source_id": source_name,
            "external_id": variant.external_id,
            "url": variant.url,
        }
        if marker not in variants:
            variants.append(marker)
        metadata["source_variants"] = variants
        selected.raw_metadata = metadata

    def _find_equivalent(
        self,
        identity: NormalizedChapterKey,
        identities: List[NormalizedChapterKey],
        base_index: Dict[Tuple[str, str, str], List[int]],
        unknown_index: Dict[str, int],
        *,
        allow_relaxed_volume: bool = True,
    ) -> Optional[int]:
        if not identity.is_parseable:
            if identity.normalized_title:
                return unknown_index.get(identity.canonical_id)
            return None

        candidates = base_index.get(self._base_key(identity), [])
        exact = [
            index
            for index in candidates
            if identities[index].volume_number == identity.volume_number
        ]
        if exact:
            return exact[0]

        # A missing volume label is equivalent only when it cannot collapse
        # two distinct volume-reset sequences.
        if not allow_relaxed_volume:
            return None
        relaxed = [
            index
            for index in candidates
            if identities[index].volume_number is None or identity.volume_number is None
        ]
        return relaxed[0] if len(relaxed) == 1 else None

    def _infer_volume_map(
        self,
        secondary: Iterable[ChapterHeader],
        primary_identities: List[NormalizedChapterKey],
        primary_base_index: Dict[Tuple[str, str, str], List[int]],
    ) -> Dict[Optional[int], Optional[int]]:
        votes: DefaultDict[Optional[int], set[Optional[int]]] = defaultdict(set)
        bases_by_volume: DefaultDict[
            Optional[int], set[Tuple[str, str, str]]
        ] = defaultdict(set)
        secondary_identities = [self.parser.parse_chapter(chapter) for chapter in secondary]
        for identity in secondary_identities:
            if not identity.is_parseable:
                continue
            base_key = self._base_key(identity)
            bases_by_volume[identity.volume_number].add(base_key)
            candidates = primary_base_index.get(base_key, [])
            candidate_volumes = {
                primary_identities[index].volume_number for index in candidates
            }
            if len(candidate_volumes) == 1:
                votes[identity.volume_number].update(candidate_volumes)

        mapping: Dict[Optional[int], Optional[int]] = {}
        for source_volume, target_volumes in votes.items():
            if len(target_volumes) == 1:
                mapping[source_volume] = next(iter(target_volumes))

        explicit_primary = {
            identity.volume_number
            for identity in primary_identities
            if identity.is_parseable and identity.volume_number is not None
        }
        explicit_secondary = {
            identity.volume_number
            for identity in secondary_identities
            if identity.is_parseable and identity.volume_number is not None
        }
        if not explicit_primary and len(explicit_secondary) == 1:
            mapping.setdefault(next(iter(explicit_secondary)), None)
        elif len(explicit_primary) == 1 and not explicit_secondary:
            mapping.setdefault(None, next(iter(explicit_primary)))

        # Do not collapse two reset sequences merely because the primary source
        # omitted volume labels. Disjoint global numbering remains alignable.
        mapped_by_target: DefaultDict[Optional[int], List[Optional[int]]] = defaultdict(list)
        for source_volume, target_volume in mapping.items():
            mapped_by_target[target_volume].append(source_volume)
        ambiguous: set[Optional[int]] = set()
        for source_volumes in mapped_by_target.values():
            for index, left in enumerate(source_volumes):
                for right in source_volumes[index + 1 :]:
                    if bases_by_volume[left] & bases_by_volume[right]:
                        ambiguous.update((left, right))
        for source_volume in ambiguous:
            mapping.pop(source_volume, None)
        return mapping

    @staticmethod
    def _gap_for(
        identity: NormalizedChapterKey, gaps: List[ChapterGap]
    ) -> Optional[ChapterGap]:
        value = identity.chapter_decimal
        if value is None or identity.kind != ChapterKind.REGULAR:
            return None
        for gap in gaps:
            if (
                gap.volume_number == identity.volume_number
                and Decimal(gap.start) <= value < Decimal(gap.end + 1)
            ):
                return gap
        return None

    def merge(
        self,
        primary_chapters: Union[
            List[ChapterHeader], List[Tuple[str, List[ChapterHeader]]]
        ],
        secondary_sources: Optional[List[Tuple[str, List[ChapterHeader]]]] = None,
        primary_source_name: str = "primary",
    ) -> List[ChapterHeader]:
        """
        Merge connector lists by canonical chapter identity.

        The first source wins content selection. Equivalent chapters retain all
        source references, while secondary-only chapters fill gaps or extend the
        sequence and carry explicit provenance.
        """
        if (
            isinstance(primary_chapters, list)
            and primary_chapters
            and isinstance(primary_chapters[0], tuple)
        ):
            sources = primary_chapters
            primary_source_name, primary_list = sources[0]
            secondary = sources[1:]
        else:
            primary_list = primary_chapters  # type: ignore[assignment]
            secondary = secondary_sources or []

        selected: List[ChapterHeader] = []
        identities: List[NormalizedChapterKey] = []
        base_index: DefaultDict[Tuple[str, str, str], List[int]] = defaultdict(list)
        unknown_index: Dict[str, int] = {}

        def index_identity(identity: NormalizedChapterKey, index: int) -> None:
            if identity.is_parseable:
                base_index[self._base_key(identity)].append(index)
            elif identity.normalized_title:
                unknown_index.setdefault(identity.canonical_id, index)

        for chapter in primary_list:
            identity = self.parser.parse_chapter(chapter)
            match = self._find_equivalent(
                identity, identities, base_index, unknown_index
            )
            if match is not None:
                self._record_variant(selected[match], primary_source_name, chapter)
                continue
            copied = self._copy_with_identity(
                chapter,
                identity,
                primary_source_name,
                is_filled=False,
            )
            index = len(selected)
            selected.append(copied)
            identities.append(identity)
            index_identity(identity, index)

        primary_identities = list(identities)
        primary_base_index = {
            key: list(indices) for key, indices in base_index.items()
        }
        gaps = self.gap_detector.detect_gap_ranges(list(primary_list))
        merged_at = datetime.now(timezone.utc).isoformat()

        for source_name, source_chapters in secondary:
            volume_map = self._infer_volume_map(
                source_chapters, primary_identities, primary_base_index
            )
            for chapter in source_chapters:
                identity = self.parser.parse_chapter(chapter)
                if identity.volume_number in volume_map:
                    identity = self.parser.with_volume(
                        identity, volume_map[identity.volume_number]
                    )

                match = self._find_equivalent(
                    identity,
                    identities,
                    base_index,
                    unknown_index,
                    allow_relaxed_volume=False,
                )
                if match is not None:
                    self._record_variant(selected[match], source_name, chapter)
                    continue

                gap = self._gap_for(identity, gaps)
                fill_reason = "gap" if gap is not None else "secondary_unique"
                copied = self._copy_with_identity(
                    chapter,
                    identity,
                    source_name,
                    is_filled=True,
                    merged_at=merged_at,
                    fill_reason=fill_reason,
                )
                index = len(selected)
                selected.append(copied)
                identities.append(identity)
                index_identity(identity, index)

        return self._sort_chapters(selected)

    def _sort_chapters(self, chapters: List[ChapterHeader]) -> List[ChapterHeader]:
        kind_order = {
            ChapterKind.PROLOGUE: 0,
            ChapterKind.REGULAR: 1,
            ChapterKind.EXTRA: 2,
            ChapterKind.EPILOGUE: 3,
            ChapterKind.UNKNOWN: 4,
        }

        def sort_key(chapter: ChapterHeader):
            normalized = (chapter.raw_metadata or {}).get("normalized_chapter")
            try:
                identity = (
                    NormalizedChapterKey(**normalized)
                    if isinstance(normalized, dict)
                    else self.parser.parse_chapter(chapter)
                )
            except (TypeError, ValueError):
                identity = self.parser.parse_chapter(chapter)
            volume = (
                identity.volume_number if identity.volume_number is not None else -1
            )
            number = identity.chapter_decimal
            return (
                volume,
                number if number is not None else Decimal("Infinity"),
                kind_order[identity.kind],
                identity.sub_chapter or "",
                identity.normalized_title,
                chapter.external_id,
            )

        return sorted(chapters, key=sort_key)
