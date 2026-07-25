# Milestone 2 Handoff Report — Smart Chapter Merge & Gap Filling Engine + Text Cleaner

## 1. Observation
- Created `app/engine/merger.py`:
  - `ChapterParser`: Parses titles like "Chương 10", "Chapter 10.5", "10", "Vol 1 Chap 10", "Chương 10a", "Ngoại truyện 1" into `NormalizedChapterKey` (`chapter_float`, `volume_number`, `is_extra`, `sub_chapter`, `raw_title`).
  - `GapDetector`: Detects missing chapter ranges in lists where `int(C_{i+1}) - int(C_i) >= 2`.
  - `SmartChapterMerger`: Merges primary and secondary chapter sources, fills gap ranges, deduplicates, and tags filled chapters with `raw_metadata`: `is_filled=True`, `original_source`, `merged_at`.
- Created `app/engine/cleaner.py`:
  - `NovelTextCleaner`: Removes `<script>`, `<iframe>`, `<style>`, elements with `display: none` / `visibility: hidden` / `hidden` attribute, ad classes (`.adsbygoogle`, `.truyenfull-ad`, `.quang-cao`, `.goc-quang-cao`, `.outbrain-widget`, etc.), watermarks ("Nguồn: truyenfull.vn", "Bạn đang đọc truyện tại...", "Nguồn: ln.hako.vn", "metruyenchu.com", etc.), and zero-width spaces (`\u200B`, `\uFEFF`, `\u00A0`). Returns standardized `<p>` paragraph HTML elements or plain text.
- Created unit tests in `tests/test_merger.py` and `tests/test_cleaner.py`.
- Execution of `python -m pytest -v` in `d:/Code/Project/App Truyen Nova/backend_api_engine`:
```
tests/test_cleaner.py::test_cleaner_script_iframe_style_removal PASSED   [  6%]
tests/test_cleaner.py::test_cleaner_hidden_elements_and_ad_classes PASSED [ 13%]
tests/test_cleaner.py::test_cleaner_watermark_removal PASSED             [ 20%]
tests/test_cleaner.py::test_cleaner_zero_width_spaces PASSED             [ 26%]
tests/test_cleaner.py::test_cleaner_plain_text_mode PASSED               [ 33%]
tests/test_connectors.py::test_otruyen_connector PASSED                  [ 40%]
tests/test_connectors.py::test_mangadex_connector PASSED                 [ 46%]
tests/test_connectors.py::test_html_comic_scraper PASSED                 [ 53%]
tests/test_connectors.py::test_hako_connector PASSED                     [ 60%]
tests/test_connectors.py::test_truyenfull_connector PASSED               [ 66%]
tests/test_connectors.py::test_metruyenchu_connector PASSED              [ 73%]
tests/test_merger.py::test_chapter_parser_variations PASSED              [ 80%]
tests/test_merger.py::test_gap_detector PASSED                           [ 86%]
tests/test_merger.py::test_smart_chapter_merger PASSED                   [ 93%]
tests/test_merger.py::test_smart_chapter_merger_tuples_input PASSED      [100%]

============================= 15 passed in 0.44s ==============================
```

## 2. Logic Chain
1. `ChapterParser` uses structured regex to isolate volume numbers, side story indicators ("ngoại truyện", "extra"), chapter floating point values, and sub-chapter indicators ('a', 'b'), guaranteeing accurate chapter key normalizations.
2. `GapDetector` extracts non-extra integer chapter values from primary chapter lists, sorts them, and identifies missing contiguous sub-ranges where gap width is 2 or greater.
3. `SmartChapterMerger` receives priority-ordered source lists, checks primary missing gaps against secondary chapters, deduplicates using key tuples, tags provenance metadata onto `ChapterHeader.raw_metadata`, and sorts final merged list into contiguous order.
4. `NovelTextCleaner` executes BeautifulSoup element decomposition for scripts/styles/iframes/hidden elements and ad CSS selectors, cleans zero-width unicode characters and watermarks via regex, and outputs clean `<p>` paragraph HTML.

## 3. Caveats
- Watermark removal relies on regex patterns matching standard Vietnamese novel site watermarks (TruyenFull, Hako, Metruyenchu, Wikidich, etc.). Custom site-specific domain text outside defined patterns will default to clean paragraph text.
- No caveats for gap merger logic.

## 4. Conclusion
Milestone 2 implementation is 100% complete and fully verified with 15 passing unit tests.

## 5. Verification Method
Run the pytest command inside `backend_api_engine`:
```bash
python -m pytest -v
```
All 15 tests should complete with 100% pass rate.
