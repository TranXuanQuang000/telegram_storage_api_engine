## 2026-07-26T03:36:41Z
You are Worker 3 (Milestone 1 Remediation Worker) for the Multi-Source Aggregator API System project.
Working directory: d:/Code/Project/App Truyen Nova/.agents/worker_m1_fix_1
Project Code Directory: d:/Code/Project/App Truyen Nova/backend_api_engine

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task — Fix 6 specific connector issues reported by Reviewer 2 in Milestone 1:
1. Fix OTruyen Cover CDN Path Duplication in `app/connectors/comic/otruyen.py`: Ensure `_build_cover_url` handles cases where `thumb_url` already starts with `uploads/comics` or full domain without duplicating `uploads/comics/uploads/comics`. Clean double slashes `//`.
2. Fix TruyenFull Chapter Pagination in `app/connectors/novel/truyenfull.py`: Parse `total_pages` from HTML or pagination selector and fetch all pages (trang-1, trang-2, ... trang-N) up to total pages so long chapter lists (>100 chapters) are complete.
3. Fix TruyenFull Chapter Slug Transformation in `app/connectors/novel/truyenfull.py`: Fix slug extraction so chapter IDs like `phan-1-chuong-1` are not prepended with duplicate `chuong-` to become `chuong-phan-1-chuong-1`.
4. Fix MangaDex Chapter Feed Limit in `app/connectors/comic/mangadex.py`: Implement pagination loop using `offset` parameter (fetch offset 0, 100, 200...) until all chapters (`total` in response) are retrieved.
5. Add HTTP Retry / Resilience & Error Handling in `app/connectors/base.py` (or individual connectors): Add retry logic for 429/5xx status codes with exponential backoff / max retries (3 retries).
6. Fix potential double slashes in CDN image URL paths across all comic and novel connectors.

7. Update `tests/test_connectors.py` to add test cases covering:
   - OTruyen cover URL normalization test.
   - TruyenFull multi-page chapter parsing & slug extraction test.
   - MangaDex paginated feed test.
   - HTTP retry handling test.
8. Run unit tests (`python -m pytest -v`) in `backend_api_engine` and verify all tests pass.
9. Report completion and test results in your `handoff.md`.
