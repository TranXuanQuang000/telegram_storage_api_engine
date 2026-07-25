## 2026-07-25T20:36:16Z
<USER_REQUEST>
You are Worker 2 for Milestone 2 of the Multi-Source Aggregator API System project.
Working directory: d:/Code/Project/App Truyen Nova/.agents/worker_m2_1
Project Code Directory: d:/Code/Project/App Truyen Nova/backend_api_engine

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task — Implement Milestone 2 (Smart Chapter Merge & Gap Filling Engine R2 + Novel Text Content Cleaner R3):
1. Implement `app/engine/merger.py`:
   - `ChapterParser`: Parse raw chapter titles/slugs ("Chương 10", "Chapter 10.5", "10", "Vol 1 Chap 10", "Chương 10a", "Ngoại truyện 1") into `NormalizedChapterKey` objects containing `chapter_float: float`, `volume_number: Optional[int]`, `is_extra: bool`, `sub_chapter: Optional[str]`.
   - `GapDetector`: Detect missing integer chapter ranges in chapter lists where `int(C_{i+1}) - int(C_i) >= 2` (e.g., detecting missing ch 10-20 when primary list has ch 1..9 and 21..50).
   - `SmartChapterMerger`: Given primary source chapters and secondary source chapters (ordered by `source_priority`), automatically detect gaps in primary source list, fill missing chapter ranges from secondary sources, deduplicate, tag filled chapters with provenance metadata (`is_filled=True`, `original_source`, `merged_at`), and return a fully ordered, contiguous list of `ChapterHeader`.
2. Implement `app/engine/cleaner.py`:
   - `NovelTextCleaner`:
     - Clean novel text content using BeautifulSoup DOM parsing + regex.
     - Remove `<script>`, `<iframe>`, `<style>`, tags with `display: none` / `visibility: hidden`.
     - Remove ad/noise CSS classes (`.adsbygoogle`, `.truyenfull-ad`, `.quang-cao`, `.goc-quang-cao`, `.outbrain-widget`, etc.).
     - Strip watermark lines using regex (e.g. "Nguồn: truyenfull.vn", "Bạn đang đọc truyện tại...", "Nguồn: ln.hako.vn", "metruyenchu.com", etc.).
     - Clean zero-width unicode spaces (`\u200B`, `\uFEFF`, `\u00A0`).
     - Wrap clean text in standardized `<p>` paragraph HTML elements or returns clean plain text / HTML.
3. Create unit tests:
   - `tests/test_merger.py`: Test `ChapterParser`, `GapDetector`, and `SmartChapterMerger` (specifically test Source A missing ch 10-20, Source B filling ch 10-20, provenance tags, deduplication).
   - `tests/test_cleaner.py`: Test `NovelTextCleaner` (script stripping, watermark removal, zero-width space removal, ad class removal).
4. Run all unit tests using `python -m pytest -v` in `backend_api_engine` and confirm 100% of tests pass.
5. Document test output and commands in `handoff.md` and send completion message to orchestrator.
</USER_REQUEST>
