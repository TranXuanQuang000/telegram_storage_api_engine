# STRATEGY BLUEPRINT — MỰC

## 1. Core Vision

**Mực** là phòng đọc truyện tranh cá nhân hóa cho người Việt: mở vào là tiếp tục đúng trang đang đọc, tìm truyện bằng cả bộ lọc sâu lẫn ngôn ngữ tự nhiên, và tải chương về thiết bị để đọc ổn định khi mạng yếu.

Khác biệt cốt lõi không nằm ở “nhiều truyện hơn”, mà ở ba lời hứa:

1. **Đọc không đứt mạch** — tiếp tục đúng vị trí, tải theo chương, reader tối ưu webtoon/manga và mạng yếu.
2. **Tìm đúng gu, không mò vô tận** — kết hợp lịch sử, tag, mood, nhịp truyện và tín hiệu gần đây; AI là lớp giải thích/tương tác tùy chọn, không phải hộp đen bắt buộc.
3. **Tin được vì có nguồn** — điểm 5 sao là tổng hợp có trọng số từ nguồn thật, luôn hiển thị nguồn, số lượt đánh giá, độ mới và mức tin cậy; AI không được tự bịa điểm.

## 2. Innovative Workflows

### Luồng A — “Nhặt lên đọc tiếp”

Trang đầu ưu tiên đúng một truyện đang đọc dở, hiển thị chương/trang, phần trăm và thời gian đọc ước tính. Một chạm quay lại reader; không phải đi qua trang chi tiết.

### Luồng B — “Tìm bằng gu”

Người dùng có thể kết hợp tìm kiếm văn bản với chip bao gồm/loại trừ: thể loại, mood, nhịp, quốc gia, trạng thái, số chương, điểm tối thiểu, độ mới và nguồn. Câu hỏi như “manhwa trả thù, nữ chính thông minh, ít romance, đã hoàn thành” được chuyển thành bộ lọc có thể nhìn thấy và chỉnh sửa.

### Luồng C — “Vì sao hợp với tôi?”

Mỗi gợi ý có ba bằng chứng ngắn: tương đồng với truyện đã đọc, tag/mood trùng, và điểm khác biệt để tránh vòng lặp đề xuất. Nếu bật BYOK AI, người dùng có thể hỏi tiếp; API key chỉ tồn tại trong phiên và không được ghi log/lưu máy chủ.

### Luồng D — “Gói đọc đường dài”

Tại trang truyện hoặc reader, người dùng chọn chương rồi tải. Service worker + Cache Storage giữ app shell và ảnh chương; IndexedDB giữ manifest, tiến độ và dung lượng. UI báo rõ số MB, trạng thái, bản cập nhật và nút xóa.

### Luồng E — “Nguồn minh bạch”

Catalog hợp nhất metadata từ các connector được phép (API/OPDS/feed). Mỗi truyện có bảng nguồn, thời điểm đồng bộ, liên kết gốc, tình trạng quyền sử dụng và health. Hệ thống không vượt robots, paywall, DRM hoặc điều khoản nguồn.

## 3. Market Validation

- TruyenQQ cho thấy nhu cầu Việt tập trung vào cập nhật mới, thể loại dày, xếp hạng, theo dõi và truyện phổ biến: https://truyenqq.com.vn/ (truy cập 2026-07-23).
- Mihon xác nhận giá trị của global search đa nguồn, thư viện, download, nhiều chế độ đọc và tracking: https://mihon.app/ và https://mihon.app/docs/guides/getting-started (truy cập 2026-07-23).
- Apple Books nhấn mạnh resume, tùy biến reader, offline và reading goals; review thực tế cảnh báo không được tự xóa nội dung offline hoặc làm mất vị trí đọc: https://apps.apple.com/us/app/apple-books/id364709193 (truy cập 2026-07-23).
- The StoryGraph chứng minh mood/pace là ngôn ngữ khám phá dễ hiểu hơn chỉ thể loại: https://www.thestorygraph.com/ (truy cập 2026-07-23).
- Netflix công khai việc dùng history, rating, recency, tương đồng người dùng và metadata để cá nhân hóa, đồng thời ưu tiên “Continue Watching”: https://help.netflix.com/en/node/100639 (truy cập 2026-07-23).
- AniList API có average score, reviews, tags và recommendations, nhưng có rate limit/điều khoản chống hoarding nên chỉ enrich theo nhu cầu và cache có TTL: https://docs.anilist.co/reference/object/media và https://docs.anilist.co/guide/terms-of-use (truy cập 2026-07-23).

## 4. UI Opportunity

- **Audience:** độc giả manga/manhwa/manhua Việt, chủ yếu mobile; nhóm power-user có thư viện lớn và đọc mỗi ngày.
- **Top tasks:** đọc tiếp; kiểm tra chương mới; tìm truyện đúng gu; tải chương; quản lý lịch sử/thư viện.
- **Art direction A — Inkroom Editorial:** giấy ấm, mực đen, dấu son đỏ cam, typography editorial, cover như vật thể sưu tầm.
- **Art direction B — Midnight Panels:** nền than, cover sáng, không gian reader điện ảnh.
- **Art direction C — Index Kiosk:** giao diện dữ liệu dày, tìm kiếm/chip mạnh, cảm giác công cụ chuyên nghiệp.
- **Cơ hội tương tác:** command search mở nhanh, shelf ngang có snap, hover/focus như lật thẻ, reader chrome tự ẩn, thanh tiến độ dạng chỉ trang.
- **Anti-goals:** không purple-gradient/glass mặc định; không card hóa mọi nội dung; không hero marketing sáo rỗng; không số liệu/đánh giá giả; không animation cuộn trang hàng loạt.

## 5. Technical Caveats & Risks

- Bản quyền và điều khoản nguồn là rủi ro số một. Chỉ kết nối API/feed/OPDS được phép, lưu provenance và hỗ trợ takedown; không vượt DRM/paywall.
- Offline ảnh truyện có thể chiếm hàng GB. Cần quota, ước lượng dung lượng, LRU có consent và không tự xóa gói đã pin.
- PWA background/periodic sync phụ thuộc trình duyệt; server-side scheduler vẫn cần cho ingestion ổn định.
- BYOK phải chống SSRF, giới hạn nhà cung cấp/base URL, không log Authorization và không lưu key mặc định.
- Điểm tổng hợp phải chuẩn hóa thang điểm, dùng Bayesian weighting và hiển thị confidence; comment sentiment chỉ là tóm tắt có liên kết nguồn.
- AniList hiện có giới hạn 30 req/phút khi degraded; connector phải cache, backoff và circuit-breaker.

