# Milestone 1 Code Review & Adversarial Stress-Test Report (Reviewer 2)

## Review Summary

**Verdict**: REQUEST_CHANGES

The 6 connector implementations (`OTruyen`, `MangaDex`, `HtmlComicScraper`, `Hako`, `TruyenFull`, `Metruyenchu`) provide solid foundational models and clean baseline async HTTP integration. All 6 unit tests in `tests/test_connectors.py` pass cleanly (`6 passed in 0.55s`). No integrity violations or facade/cheating patterns were found in the codebase.

However, detailed static analysis and adversarial execution revealed **3 Major functional defects** (CDN URL corruption, truncated chapter pagination, malformed chapter slug assembly) and **3 Medium resiliency flaws** (hardcoded 100-chapter feed limits, unhandled HTTP status/transient network errors, and potential double-slash URL formatting).

---

## Findings

### [Major] Finding 1: OTruyen Cover CDN URL Path Duplication
- **What**: When assembling OTruyen cover URLs, if the CDN domain includes `/uploads/comics` and the `thumb_url` also includes `uploads/comics/`, path duplication occurs.
- **Where**: `backend_api_engine/app/connectors/comic/otruyen.py`, lines 40-45.
- **Why**: The conditional `if not thumb_clean.startswith("uploads/comics/") and not base_cdn.endswith("uploads/comics"):` fails when both conditions are False, jumping to `return f"{base_cdn}/{thumb_clean}"`.
- **Proof/Observation**:
  Command executed: `python -c "from app.connectors.comic.otruyen import OTruyenConnector; c = OTruyenConnector(); print(c._build_cover_url('uploads/comics/one-piece.jpg', 'https://otruyencdn.com/uploads/comics'))"`
  Output: `https://otruyencdn.com/uploads/comics/uploads/comics/one-piece.jpg`
- **Suggestion**: Use regular expressions or string replacement to ensure `uploads/comics/` is not duplicated regardless of whether it exists in `base_cdn` or `thumb_url`.

### [Major] Finding 2: TruyenFull Incomplete Chapter Feed Pagination (Truncated at Page 2)
- **What**: TruyenFull novel chapter listing hardcodes a check for page 2 (`page2_url = f"{url.rstrip('/')}/trang-2/"`) and does not paginate further pages (`trang-3`, `trang-4`, etc.).
- **Where**: `backend_api_engine/app/connectors/novel/truyenfull.py`, lines 175-200.
- **Why**: Long novels with 500+ chapters spread across 20+ HTML pages lose all chapters past page 2.
- **Suggestion**: Replace single-page fetch logic with an asynchronous loop over `trang-{i}` or implement pagination up to `total_pages`.

### [Major] Finding 3: TruyenFull Invalid Chapter Identifier Transformation
- **What**: TruyenFull `fetch_chapter` forcibly prepends `chuong-` to `chapter_identifier` if it does not start with `chuong-`.
- **Where**: `backend_api_engine/app/connectors/novel/truyenfull.py`, line 231.
- **Why**: When chapter identifiers use non-standard naming schemes like `phan-1-chuong-1`, line 231 turns `phan-1-chuong-1` into `chuong-phan-1-chuong-1`, causing 404 HTTP errors.
- **Proof/Observation**:
  Command executed: `python -c "ch_id='phan-1-chuong-1'; ch_id = f'chuong-{ch_id}' if not ch_id.startswith('chuong-') else ch_id; print(ch_id)"`
  Output: `chuong-phan-1-chuong-1`
- **Suggestion**: Retain `chapter_identifier` as provided unless it is purely numeric, or check against chapter URL metadata.

### [Medium] Finding 4: MangaDex Hardcoded 100-Chapter Feed Limit
- **What**: MangaDex `fetch_story` queries `/manga/{manga_id}/feed` with `"limit": 100` and no offset pagination loop.
- **Where**: `backend_api_engine/app/connectors/comic/mangadex.py`, lines 163-170.
- **Why**: Popular manga series (e.g. One Piece, Naruto) exceeding 100 chapters will have their chapter lists truncated at chapter 100.
- **Suggestion**: Add a loop over `offset += 100` until `offset >= feed_json.get("total", 0)`.

### [Medium] Finding 5: Lack of HTTP Exception Handling & Retry Resiliency
- **What**: Base and sub-connectors do not handle transient HTTP errors (429 Rate Limit, 502/503/504 Bad Gateway/Timeout).
- **Where**: `backend_api_engine/app/connectors/base.py` and all 6 connectors.
- **Why**: Unhandled `httpx.HTTPStatusError` or `httpx.ConnectTimeout` will bubble up and crash upstream API endpoints without retrying or wrapping into domain exceptions.
- **Suggestion**: Add HTTP status code checks / retry middleware (e.g., using `tenacity` or `httpx` retry transport) and domain exception wrappers.

### [Medium] Finding 6: CDN Double-Slash Concatenation Risk
- **What**: Image URLs in OTruyen (`otruyen.py:188`) and MangaDex (`mangadex.py:224`) are assembled via string formatting `f"{domain_cdn}/{chapter_path}/{filename}"` without stripping trailing/leading slashes.
- **Where**: `app/connectors/comic/otruyen.py:188`, `app/connectors/comic/mangadex.py:224`.
- **Why**: If `domain_cdn` contains a trailing slash, double slashes (`https://cdn.example.com//path/img.jpg`) are produced.
- **Suggestion**: Standardize CDN joining using `urljoin` or `.strip('/')`.

### [Minor] Finding 7: Hako HTML Chapter Text Cleaning Strips Light Novel Illustrations
- **What**: `HakoConnector.fetch_chapter` extracts paragraph text using `p.get_text(strip=True)`, discarding embedded `<img>` tags inside novel chapters.
- **Where**: `backend_api_engine/app/connectors/novel/hako.py`, lines 196-199.
- **Why**: Light novel readers miss inline artwork images.
- **Suggestion**: Preserve embedded `<img>` tags or extract them into an `images` list for novel chapters.

---

## Handoff 5-Component Report

### 1. Observation
- Ran unit test suite in `backend_api_engine`:
  - Command: `python -m pytest -v`
  - Output: `6 passed in 0.55s`
- Code inspection of `app/connectors/`:
  - `otruyen.py:40-45`: `_build_cover_url("uploads/comics/one-piece.jpg", "https://otruyencdn.com/uploads/comics")` -> returns `https://otruyencdn.com/uploads/comics/uploads/comics/one-piece.jpg`.
  - `truyenfull.py:175-200`: `total_pages` check only fetches `trang-2` and skips `trang-3` through `total_pages`.
  - `truyenfull.py:231`: `chapter_identifier` of `phan-1-chuong-1` becomes `chuong-phan-1-chuong-1`.
  - `mangadex.py:166`: Hardcoded `limit: 100` on chapter feed without offset iteration.

### 2. Logic Chain
1. Verified that unit tests pass out-of-the-box (`6 passed`).
2. Checked test code (`tests/test_connectors.py`) for integrity. Tests use `httpx.MockTransport` which is valid and expected for offline unit tests. No facade implementations or hardcoded cheat values found in production connector classes.
3. Conducted static analysis & edge-case stress-testing on connector URL construction and scraping functions.
4. Identified OTruyen cover builder defect where duplicate `/uploads/comics` segments are generated under standard API payloads.
5. Identified TruyenFull truncation where novels with >2 pages of chapters lose 90%+ of their chapter list.
6. Identified TruyenFull chapter slug transformation bug where non-`chuong-` prefixed slugs get mangled.
7. Identified MangaDex chapter feed query truncation at 100 chapters.
8. Therefore, the implementation requires modifications before approval.

### 3. Caveats
- Tests were performed in `CODE_ONLY` offline mode using static string execution and unit test execution. Live external HTTP requests to OTruyen, MangaDex, Hako, TruyenFull, and Metruyenchu endpoints were not performed to respect network restrictions.

### 4. Conclusion
Work quality is good in terms of architecture and code structure, but **REQUEST_CHANGES** is issued due to 3 Major functional defects (OTruyen CDN path duplication, TruyenFull pagination truncation, TruyenFull chapter slug mangling) and 3 Medium resiliency issues.

### 5. Verification Method
To verify all findings independently:
1. Run pytest suite:
   `python -m pytest -v` (in `backend_api_engine`)
2. Reproduce OTruyen CDN bug:
   `python -c "from app.connectors.comic.otruyen.py import OTruyenConnector; c = OTruyenConnector(); print(c._build_cover_url('uploads/comics/one-piece.jpg', 'https://otruyencdn.com/uploads/comics'))"`
   Expected clean: `https://otruyencdn.com/uploads/comics/one-piece.jpg`
   Actual buggy: `https://otruyencdn.com/uploads/comics/uploads/comics/one-piece.jpg`
3. Reproduce TruyenFull slug bug:
   `python -c "ch_id='phan-1-chuong-1'; print(f'chuong-{ch_id}' if not ch_id.startswith('chuong-') else ch_id)"`
   Expected clean: `phan-1-chuong-1`
   Actual buggy: `chuong-phan-1-chuong-1`
