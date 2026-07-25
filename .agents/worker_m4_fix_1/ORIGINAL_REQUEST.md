## 2026-07-26T03:42:50Z

You are Worker 5 (Milestone 4 Remediation Worker) for the Multi-Source Aggregator API System project.
Working directory: d:/Code/Project/App Truyen Nova/.agents/worker_m4_fix_1
Project Code Directory: d:/Code/Project/App Truyen Nova/backend_api_engine

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task — Fix 3 specific edge-case bugs identified in `backend_api_engine`:

1. Fix Bug 1 (Watermark Regex Pattern Order in `app/engine/cleaner.py`):
   - In `WATERMARK_PATTERNS`, longer/more specific patterns (such as `Chúc bạn có những giây phút vui vẻ khi đọc truyện tại...`) must be checked/replaced BEFORE shorter patterns (like `Đọc truyện tại...`).
   - Re-order `WATERMARK_PATTERNS` so longer regex patterns precede shorter substring patterns, preventing orphan string fragments like `<p>Chúc bạn có những giây phút vui vẻ khi</p>`.

2. Fix Bug 2 (Chapter 0 Ignored in Gap Detection in `app/engine/merger.py`):
   - In `GapDetector.detect_gaps`, line 96: Change `if not key.is_extra and key.chapter_float > 0:` to `if not key.is_extra and key.chapter_float >= 0:` so Chapter 0 / Prologue is included when evaluating gaps (e.g. primary having Ch 0 and Ch 5 will correctly detect missing gap 1..4).

3. Fix Bug 3 (Fractional / Decimal Sub-Chapters Dropped in Gap Merging in `app/engine/merger.py`):
   - In `SmartChapterMerger.merge`, line 170: Update the gap inclusion bounds check so that decimal/fractional sub-chapters (e.g. `10.5` or `19.5`) inside a gap range `[10, 19]` or `[10, 10]` are included. For example, check `gap_start <= key.chapter_float < gap_end + 1.0` (or `gap_start <= key.chapter_float <= gap_end + 0.9999`).

4. Add dedicated unit tests in `tests/test_merger.py` and `tests/test_cleaner.py`:
   - Add test case verifying watermark cleaner removes full sentence without leaving fragment text.
   - Add test case verifying gap detection with Chapter 0 (Ch 0 -> Ch 5 detects gap 1..4).
   - Add test case verifying fractional sub-chapters (e.g. 10.5) inside gap ranges are merged correctly.

5. Execute `python -m pytest -v` in `backend_api_engine` and verify all tests pass (100% pass rate).
6. Document test results and commands in `handoff.md` and report completion to the orchestrator.

## 2026-07-25T20:43:33Z

Hi Worker 5, please also include this 4th fix in your task:

4. Fix `AggregatorService.get_novel_chapter` in `app/services/aggregator.py`:
   When querying a novel chapter, if `chapter_content` has empty `text_content` (or `not chapter_content.text_content` or `not chapter_content.text_content.strip()`), treat it as not found so that `get_novel_chapter` returns `None` (which correctly maps to HTTP 404 in `app/api/v1/novel.py`) instead of returning an empty payload with HTTP 200 OK.
   Add a unit test in `tests/test_api.py` verifying that querying a non-existent chapter number returns HTTP 404.

Please ensure all tests pass with python -m pytest -v.

## 2026-07-25T20:43:48Z

Hi Worker 5, please also incorporate these 4 cleaner & merger refinement items from Reviewer 2 into your current remediation task:

5. Fix `AD_CLASS_PATTERNS` in `app/engine/cleaner.py`:
   - Replace unanchored `r"ads"` with word-bounded pattern `r"\bads\b"` or `r"\badsbygoogle\b"`, `r"\bad-container\b"`, etc. so class names like `downloads`, `uploads`, `threads`, `spreads` are NOT matched or stripped.

6. Fix `soup.get_text()` in `app/engine/cleaner.py`:
   - Use `soup.get_text(separator="\n", strip=True)` when extracting plain text so div/span content blocks don't fuse words together without linebreaks.

7. Fix Leading Gaps in `GapDetector.detect_gaps` in `app/engine/merger.py`:
   - If the first integer chapter in primary list is `first_ch > 1` (e.g. primary starts at chapter 5), include the leading gap `(1, first_ch - 1)` (or `0` if chapter 0 exists) in detected gaps.

8. Fix `sub_chapter` regex in `app/engine/merger.py`:
   - Only match single trailing sub-chapter letters (like `10a`, `10b`) when attached to numbers or preceded by a dash/dot, so title words like "Thất Tinh" in "Chương 10 Thất Tinh" are not parsed as sub_chapter='t'.

Please verify all tests pass with `python -m pytest -v`.
