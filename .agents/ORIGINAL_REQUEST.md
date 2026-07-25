# Original User Request

## Initial Request — 2026-07-23T14:03:46Z

# Teamwork Project Prompt — Draft

> Status: Sẵn sàng khởi chạy — Chờ bạn phê duyệt (Ready for launch — awaiting user approval)
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Sử dụng AI để tạo ra một bộ sprite sheet pixel art frame-by-frame hoàn toàn mới cho nhân vật pet của website (chấp nhận việc nhân vật có thể thay đổi thiết kế so với gốc). Tích hợp sprite sheet mới này vào hệ thống animation hiện tại.

Working directory: d:/Code/Project/App Truyen Nova
Integrity mode: benchmark

## Requirements

### R1. Tạo Sprite Sheet mới bằng AI
Sử dụng công cụ tạo ảnh (generate_image) để vẽ một sprite sheet hoàn toàn mới từ đầu cho một sinh vật pet robot dễ thương phong cách pixel art. Sprite sheet cần có các hàng tương ứng với các hành động: Đứng yên (Idle), Chạy/Di chuyển (Running), Được nựng (Petting/Happy), Bị nhấc lên (Dragging). Khung hình phải là những bức vẽ thực sự khác nhau, không phải là một bức ảnh bị bóp méo hay xoay.

### R2. Xử lý ảnh và Tích hợp
Lưu ảnh được tạo thành file `public/muc-pet-sprite.png` (hoặc định dạng phù hợp). Viết script Python (dùng Pillow/OpenCV nếu cần) để xóa phông nền (tạo độ trong suốt) hoặc cắt ghép lại lưới ảnh (grid) cho chuẩn xác nếu AI tạo ra lưới không đều.

### R3. Cập nhật Frontend Code
Điều chỉnh lại CSS trong `app/globals.css` (thuộc tính `background-size`, `@keyframes`, và `steps()`) và code React trong `components/MucPet.tsx` sao cho khớp chính xác với số lượng cột và hàng của sprite sheet mới vừa được AI tạo ra.

## Acceptance Criteria

### 1. File Ảnh Hợp lệ
- [ ] Tồn tại file sprite sheet mới trong thư mục `public/`.
- [ ] Ảnh chứa nhiều khung hình (frames) có sự khác biệt rõ rệt về cử động tay chân/mắt (được AI vẽ ra) chứ không phải ảnh cũ bị xê dịch.
- [ ] Background của ảnh sprite sheet phải trong suốt, hoặc dùng CSS blend-mode phù hợp để không bị dính nền vuông trắng/đen vào website.

### 2. Hoạt ảnh (Animation) Hoạt động tốt
- [ ] Các class CSS (`.is-moving`, `.is-petting`, v.v.) trỏ đúng vị trí hàng (background-position-y) của sprite sheet mới.
- [ ] Hàm `steps(N)` khớp chính xác với số khung hình trên một hàng của ảnh.
- [ ] Khi chạy trang web, Mực hiển thị hiệu ứng chuyển cảnh frame-by-frame mượt mà, không bị rung giật (jitter) lệch khung hình.

## Follow-up — 2026-07-23T14:09:38Z

Xin chào, đã 5 phút trôi qua kể từ khi khởi chạy nhiệm vụ. Đội đặc nhiệm có thể báo cáo nhanh tiến độ hiện tại (đã tạo xong ảnh chưa, hay đang xử lý ghép ảnh) để tôi cập nhật cho người dùng được không?

## Follow-up — 2026-07-23T14:15:29Z

Tôi vừa thấy các file hệ thống (như generate_sprite.py, MucPet.tsx và globals.css) đã được cập nhật logic mới (thêm cả nháy mắt - eye blink) và chạy thành công. Đội đặc nhiệm đã hoàn thành nhiệm vụ và sẵn sàng đóng mục tiêu chưa?


## Follow-up — 2026-07-26T03:30:35Z

Xây dựng hệ thống Multi-Source Aggregator API hoàn chỉnh cho cả Truyện Tranh và Truyện Chữ, hỗ trợ chuẩn đầu ra OTruyen API và mở rộng Novel API. Hệ thống có khả năng thu thập, tự động hợp nhất danh sách chapter và lấp khoảng trống (gap filling) từ nhiều trang web (OTruyen, MangaDex, Cuutruyen, TruyenFull, Hako, Metruyenchu,...).

Working directory: d:/Code/Project/App Truyen Nova/backend_api_engine
Integrity mode: benchmark

## Requirements

### R1. Multi-Source Connector Architecture (Comic + Novel)
Xây dựng kiến trúc Plugin/Connector cắm nguồn linh hoạt cho cả Truyện Tranh (Comic) và Truyện Chữ (Novel/Light Novel).
Hỗ trợ các connector chính:
- **Truyện Tranh**: OTruyen API, MangaDex API, Custom HTML Scraper.
- **Truyện Chữ**: Hako (ln.hako.vn), TruyenFull, Metruyenchu.

### R2. Smart Chapter Merge & Gap Filling Engine
Hệ thống tự động hợp nhất danh sách chapter từ nhiều nguồn khác nhau, nhận diện và bù đắp các chapter bị thiếu ở giữa để đảm bảo danh sách chapter liên tục và đầy đủ nhất.

### R3. REST API Compatibility (OTruyen Standard & Novel Extensions)
Cung cấp các endpoint REST API:
- Truyện tranh chuẩn OTruyen API: `/v1/api/danh-sach/truyen-moi`, `/v1/api/truyen-tranh/{slug}`, `/v1/api/chapter/{id}`.
- Truyện chữ chuẩn Novel API: `/v1/api/truyen-chu/danh-sach`, `/v1/api/truyen-chu/{slug}`, `/v1/api/truyen-chu/{slug}/chapter/{chapterNo}`.
- Làm sạch nội dung văn bản truyện chữ (xóa rác, quảng cáo, script).

### R4. Automated Verification & Testing Suite
Viết bộ script kiểm thử độc lập (integration tests) kiểm tra khả năng fetch dữ liệu, hợp nhất chap bị thiếu giữa các nguồn và phản hồi đúng chuẩn JSON API.

## Acceptance Criteria

### API Standard & Multi-Source Engine
- [ ] Khởi chạy backend API độc lập trong thư mục `d:/Code/Project/App Truyen Nova/backend_api_engine`.
- [ ] Tích hợp đầy đủ các connector cho Truyện Tranh (OTruyen, MangaDex) Avi Truyện Chữ (TruyenFull/Hako).
- [ ] Chạy thành công script kiểm thử hợp nhất chapter: Khi Nguồn A thiếu chap 10-20, API tự động lấy chap 10-20 từ Nguồn B để lấp đầy.
- [ ] API trả về định dạng JSON hợp lệ, phản hồi nhanh dưới 1.5s và loại bỏ 100% rác/quảng cáo trong nội dung truyện chữ.
- [ ] Tất cả các test suites kiểm thử chạy qua 100% thành công.




