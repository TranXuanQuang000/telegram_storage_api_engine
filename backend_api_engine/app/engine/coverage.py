from collections import Counter
from decimal import Decimal, InvalidOperation
from typing import Iterable, Optional

from app.models.chapter import ChapterHeader


def analyze_chapter_coverage(
    chapters: Iterable[ChapterHeader],
    *,
    expected_latest: Optional[int] = None,
) -> dict:
    """Return deterministic integer chapter coverage without trusting list length."""
    integer_numbers = []
    fractional_numbers = []
    unnumbered = 0
    for chapter in chapters:
        raw = (chapter.chapter_number or "").strip()
        try:
            number = Decimal(raw)
        except (InvalidOperation, ValueError):
            unnumbered += 1
            continue
        if number <= 0:
            continue
        if number == number.to_integral_value():
            integer_numbers.append(int(number))
        else:
            fractional_numbers.append(str(number.normalize()))

    counts = Counter(integer_numbers)
    unique = sorted(counts)
    current_max = max(unique, default=0)
    target = expected_latest if expected_latest is not None else current_max
    missing = [number for number in range(1, max(0, target) + 1) if number not in counts]
    duplicates = sorted(number for number, count in counts.items() if count > 1)
    return {
        "expected_latest": target,
        "current_max": current_max,
        "unique_integer_chapters": len(unique),
        "fractional_chapters": sorted(set(fractional_numbers), key=Decimal),
        "unnumbered_chapters": unnumbered,
        "missing_chapters": missing,
        "duplicate_chapters": duplicates,
        "coverage_ratio": round((target - len(missing)) / target, 6) if target else 0.0,
        "complete": bool(target) and current_max >= target and not missing,
    }
