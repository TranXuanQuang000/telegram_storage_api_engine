# Mực Source Hub API

API này gom các nguồn đã được duyệt vào một hợp đồng chung. Nó không nhận URL
tùy ý và không phải là proxy scraping đa năng.

## Endpoints

- `GET /api/sources`: danh sách nguồn, quyền truy cập và khả năng của từng nguồn.
- `GET /api/source-catalog?source=all&q=&page=1&limit=24`: catalog chuẩn hóa.
- `GET /api/source-catalog/{source}/{slug}`: chi tiết và danh sách chương.
- `GET /api/source-content/{source}/{chapterId}`: nội dung chương nếu nguồn cho
  phép. Nguồn `metadata-only` luôn trả HTTP 403 cùng link nguồn.

Nguồn hợp lệ hiện tại:

- `otruyen`: catalog, chương và trang ảnh từ API nhà cung cấp;
- `wikisource`: catalog, chương và văn bản công khai;
- `mangadex`: metadata và liên kết nguồn;
- `anilist`: snapshot metadata manga, điểm và liên kết nguồn.

## Thêm adapter mới

Chỉ thêm một website khi có ít nhất một trong các căn cứ sau:

1. API chính thức ghi rõ quyền sử dụng;
2. nội dung public domain hoặc giấy phép mở;
3. chủ website/tác giả cho phép bằng văn bản.

Adapter mới phải khai báo `access`, `capabilities`, `policyUrl`,
`attributionRequired` và `rightsNote`. Không thêm nguồn cần vượt đăng nhập,
paywall, DRM, CAPTCHA hoặc cấm bot. Nguồn chưa cho phép đọc lại phải đặt
`metadata-only`, không được triển khai hàm lấy trang/chương.

Mọi request ra ngoài phải có timeout, cache, giới hạn tốc độ, User-Agent nhận
diện được và chỉ được gọi tới hostname cố định trong code. Không truyền URL do
người dùng gửi thẳng vào `fetch`.
