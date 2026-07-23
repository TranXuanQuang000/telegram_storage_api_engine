# PRD — Mực v1

## Product summary

Mực là PWA đọc manga/manhwa/manhua cho người Việt, hợp nhất catalog từ connector có quyền sử dụng, cung cấp tìm kiếm nâng cao, thư viện/lịch sử đồng bộ, reader offline và trợ lý gợi ý BYOK.

## Goals

- Người đã đọc quay lại đúng chương/trang trong tối đa hai thao tác.
- Tìm được một truyện phù hợp trong dưới 90 giây bằng filter hoặc câu mô tả tự nhiên.
- Chương đã tải vẫn mở được khi offline; không mất vị trí đọc và không tự xóa gói đã pin.
- Mọi score/gợi ý ngoài nguồn đều có provenance và confidence.
- AI là tùy chọn; app hữu ích đầy đủ khi không có API key.

## Non-goals v1

- Không phá DRM/paywall, crawl nguồn cấm bot hoặc mirror nội dung không có quyền.
- Không xây mạng xã hội/comment riêng trong v1.
- Không lưu API key AI trên server hoặc trong D1.
- Không hứa background sync luôn chạy trên mọi trình duyệt.

## Personas

1. **Độc giả hằng ngày:** đọc mobile, cần chương mới/đọc tiếp/mạng yếu.
2. **Thợ săn truyện:** dùng nhiều tag và nguồn, quan tâm mood/nhịp/score/confidence.
3. **Người giữ thư viện:** muốn history, collections, download và đồng bộ tiến độ.

## Functional requirements

### F1 — Home cá nhân hóa

- Hiển thị đọc tiếp với chapter/page/progress/last read.
- Hiển thị chương mới từ truyện theo dõi, truyện mới nhập, top có confidence cao và “đúng gu”.
- New user thấy mood picker + các bộ đại diện đa dạng, không giả personal data.

**Acceptance:** khi có history, CTA đầu tiên mở đúng reader position; khi không có history, không render số liệu cá nhân giả.

### F2 — Search & discovery nâng cao

- Search title/alias/author.
- Include/exclude nhiều genre/tag; filter format, origin, status, source, language, chapter range, rating, recency.
- Sort relevance/latest/rating/popularity/shortest.
- Query tự nhiên chuyển thành filter khi AI được bật; luôn hiển thị filter parse được để chỉnh.

**Acceptance:** URL phản ánh filter; keyboard dùng được; include/exclude không chỉ phân biệt bằng màu.

### F3 — Story detail

- Cover, title/alias, author, synopsis, status, tags, chapter list và source availability.
- Score tổng hợp 0–5, vote count, source breakdown, last sync và confidence.
- CTA đọc từ đầu/đọc tiếp, theo dõi, thêm collection, tải nhiều chương.

**Acceptance:** score không có nguồn hiển thị “chưa đủ dữ liệu”, không mặc định 0 hoặc 5.

### F4 — Reader

- Webtoon vertical, single page; dual page khi viewport/metadata phù hợp.
- Tap/keyboard navigation, chapter jump, reading progress, brightness/theme/fit/gap.
- Loading/failed image/retry/offline/end chapter states.
- Lưu vị trí theo page và tỷ lệ; sync có idempotency.

**Acceptance:** reload quay lại đúng page ±1; reader dùng được ở zoom 200%; reduced motion không tự cuộn.

### F5 — Library/history/following

- Shelves: đang đọc, muốn đọc, hoàn thành, tạm dừng, bỏ.
- History theo thời gian; unread chapter badge; collections tùy chỉnh.
- Signed-in user sync D1; anonymous user có device-local queue và được mời đăng nhập để đồng bộ.

**Acceptance:** lịch sử có nút xóa theo truyện/toàn bộ; action có undo hoặc confirm.

### F6 — Offline/downloads

- Chọn chương hoặc “5 chương tiếp theo”; ước tính dung lượng và quota.
- Download manager: queued/downloading/ready/update/error, pause/cancel/delete/pin.
- Cache app shell + images; IndexedDB giữ manifest/checksum/progress.

**Acceptance:** tắt mạng vẫn mở app shell và chương `ready`; gói pinned không bị LRU xóa tự động.

### F7 — Source ingestion & auto tagging

- Connector registry cho OTruyen API, OPDS/Komga/Kavita, và provider metadata/review theo nhu cầu.
- Sync incremental bằng cursor/updatedAt, dedupe theo normalized title + author + external id.
- Mapping genre deterministic; AI tag là optional, kèm `origin=machine`, confidence và model.
- Sync run có status/count/error RTK summary; backoff/rate limit/circuit breaker.

**Acceptance:** connector disabled/ToS-blocked không chạy; mọi story/chapter/source item có provenance.

### F8 — Rating aggregation

- Normalize source score về 5; Bayesian prior giảm cực đoan ít phiếu; freshness/source quality weight có tài liệu.
- Hiển thị breakdown và confidence; không trộn score AI vào user score.
- Review/comment summary chỉ dùng nội dung truy xuất hợp lệ, có link nguồn và ngày; AI chỉ tóm tắt khi BYOK.

**Acceptance:** dữ liệu thiếu/nguồn lỗi không làm score thành 0; có thể audit từng thành phần.

### F9 — AI BYOK

- Provider preset: OpenAI-compatible, Anthropic, Gemini; developer config giới hạn model/base URL/system instruction/temperature/schema.
- Key nhập ở client, mặc định session-only; request proxy không log Authorization/body nhạy cảm.
- Use cases: query → filters; recommendation chat; “vì sao hợp”; summarize external comments.
- Không gửi toàn bộ history nếu user chưa xem payload/consent; hỗ trợ xóa key ngay.

**Acceptance:** app không AI vẫn hoạt động; key không xuất hiện trong HTML/log/D1/localStorage; endpoint có allowlist/size/rate limit.

### F10 — Safety/content

- Content rating filter mặc định safe/suggestive; mature explicit cần opt-in.
- Takedown/source attribution, report broken/misattributed chapter.
- Connector tuân thủ robots/ToS/license mode.

## Quality requirements

- WCAG 2.2 AA; keyboard/focus/semantic/contrast/reduced motion/zoom 200%.
- LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 trên luồng chính mục tiêu.
- API P95 read <200ms khi cache hit; external connectors có timeout ≤8s.
- Strict validation, parameterized D1 queries, rate limit write/AI/ingest endpoints.
- Không log key/token; CSP/headers; SSRF protection cho connector và AI proxy.

## Success metrics

- Resume success ≥99.5%; offline-open success ≥98% cho gói ready.
- Search-to-open-detail median <60s; detail-to-read conversion.
- Recommendation hide/save/read signals và diversity coverage.
- Source freshness, duplicate rate, broken chapter rate, score confidence distribution.

