# Handoff Report — Worker 5 (Milestone 4 Remediation Worker)

## 1. Observation

- **Initial State**: Running `python -m pytest -v` inside `backend_api_engine` yielded 32/32 passing tests.
- **Bug 1 Observation**: `WATERMARK_PATTERNS` in `app/engine/cleaner.py` had shorter pattern `r"Đọc\s+truyện\s+tại[^\n<]*"` defined at line 46 before longer pattern `r"Chúc\s+bạn\s+có\s+những\s+giây\s+phút\s+vui\s+vẻ\s+khi\s+đọc\s+truyện\s+tại[^\n<]*"` at line 48. When cleaning text like `<p>Chúc bạn có những giây phút vui vẻ khi đọc truyện tại truyenfull.vn</p>`, the shorter pattern matched first, stripping `"đọc truyện tại truyenfull.vn"` and leaving an orphan fragment `<p>Chúc bạn có những giây phút vui vẻ khi</p>`.
- **Bug 2 Observation**: In `GapDetector.detect_gaps` (`app/engine/merger.py:96`), the filter condition `if not key.is_extra and key.chapter_float > 0:` excluded Chapter 0 (`chapter_float == 0.0`), failing to detect gaps between Chapter 0 and subsequent chapters (e.g., Ch 0 -> Ch 5 returned `[]` instead of `[(1, 4)]`).
- **Bug 3 Observation**: In `SmartChapterMerger.merge` (`app/engine/merger.py:170`), the gap bounds check `if gap_start <= key.chapter_float <= gap_end:` excluded fractional sub-chapters equal to or greater than `gap_end` (such as `10.5` or `19.5` when gap range was `[10, 19]` or `[10, 10]`).
- **Fix 4 Observation**: In `AggregatorService.get_novel_chapter` (`app/services/aggregator.py:180-192`), empty or whitespace-only `text_content` was not checked before returning, causing empty payload responses with HTTP 200 OK instead of raising a `ValueError` that maps to HTTP 404 in `app/api/v1/novel.py`.
- **Fix 5 Observation**: In `cleaner.py`, `AD_CLASS_PATTERNS` contained unanchored `r"ads"` which matched CSS class names like `downloads`, `uploads`, `threads`, `spreads`.
- **Fix 6 Observation**: In `cleaner.py`, `soup.get_text()` without separator fused adjacent div/span texts together without linebreaks.
- **Fix 7 Observation**: In `GapDetector.detect_gaps`, if the primary list's first integer chapter was `first_ch > 1` (e.g., primary starting at Ch 5), the leading gap `(1, first_ch - 1)` was not included.
- **Fix 8 Observation**: In `ChapterParser.parse` (`app/engine/merger.py`), sub-chapter letter matching matched any single letter following space after chapter numbers, causing title words like "Thất Tinh" in `"Chương 10 Thất Tinh"` to be parsed as `sub_chapter='t'`.

## 2. Logic Chain

- **Fix 1 Reasoning**: By re-ordering `WATERMARK_PATTERNS` so longer, more specific sentence patterns (such as `Chúc bạn có những giây phút vui vẻ khi đọc truyện tại...` and `Bạn đang đọc truyện được cập nhật tại...`) precede shorter patterns (`Đọc truyện tại...`), regex iteration in `NovelTextCleaner._clean_text_string` matches and removes the complete sentence in a single pass without leaving orphan fragments.
- **Fix 2 Reasoning**: Updating `key.chapter_float > 0` to `key.chapter_float >= 0` allows Chapter 0 (int value `0`) to be added to `integers`. For a primary list containing Ch 0 and Ch 5, `sorted_ints` becomes `[0, 5]` and the consecutive diff `5 - 0 >= 2` computes gap `(0 + 1, 5 - 1)` = `(1, 4)`.
- **Fix 3 Reasoning**: Changing the gap inclusion check from `gap_start <= key.chapter_float <= gap_end` to `gap_start <= key.chapter_float < gap_end + 1.0` ensures all sub-chapters whose integer portion matches `gap_end` (e.g., `10.5` for gap `[10, 10]` or `19.5` for gap `[10, 19]`) satisfy `key.chapter_float < 11.0` or `< 20.0` and are correctly merged.
- **Fix 4 Reasoning**: Checking `if chapter_content is None or not chapter_content.text_content or not chapter_content.text_content.strip():` in `AggregatorService.get_novel_chapter` guarantees that chapters with missing or empty text content raise `ValueError("... not found.")`, which `app/api/v1/novel.py` converts into an HTTP 404 response.
- **Fix 5 Reasoning**: Replacing unanchored `r"ads"` with word-bounded `r"\bads\b"` in `AD_CLASS_PATTERNS` ensures `re.search` only matches exact class name `"ads"` (or space/hyphen bounded), leaving legitimate non-ad class names like `downloads`, `uploads`, `threads`, `spreads` intact.
- **Fix 6 Reasoning**: Using `soup.get_text(separator="\n", strip=True)` and `p.get_text(separator=" ", strip=True)` preserves whitespace and newline separation between DOM nodes during text extraction.
- **Fix 7 Reasoning**: In `GapDetector.detect_gaps`, checking `first_ch = sorted_ints[0]; if first_ch > 1: gaps.append((1, first_ch - 1))` catches leading missing chapter ranges when primary source starts after Chapter 1.
- **Fix 8 Reasoning**: Updating regexes in `ChapterParser.parse` to `(?:(?:[\.-]|(?<=\d))([a-zA-Z])\b)?` enforces that a sub-chapter letter must either be directly attached to the chapter number (e.g., `10a`) or preceded by a dot/dash (e.g., `10.a`, `10-a`). Standard title words (e.g., `"Chương 10 Thất Tinh"`) are no longer misidentified as sub-chapters.

## 3. Caveats

- No caveats. All edge cases specified in the initial prompt and subsequent reviewer notes have been fully addressed and tested.

## 4. Conclusion

- All 8 remediation items across `app/engine/cleaner.py`, `app/engine/merger.py`, `app/services/aggregator.py`, `tests/test_cleaner.py`, `tests/test_merger.py`, `tests/test_api.py`, and `tests/test_empirical_m4.py` were implemented cleanly without regressions.
- The test suite execution via `python -m pytest -v` passes 100% (40 passed out of 40 tests).

## 5. Verification Method

To verify the implementation independently:

1. Change directory to `backend_api_engine`:
   ```bash
   cd "d:/Code/Project/App Truyen Nova/backend_api_engine"
   ```
2. Execute pytest:
   ```bash
   python -m pytest -v
   ```
3. Invalidation conditions: Any test failure or unhandled exception during test suite execution.
