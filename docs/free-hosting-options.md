# Phương án host Mực miễn phí cho nhóm nhỏ

Cập nhật: 23/07/2026.

## Khuyến nghị: giữ Cloudflare Workers + D1

Dự án hiện đã build thành Worker và đã có binding D1 `DB`, nên đây là đường ngắn nhất, ít rủi ro nhất:

- Frontend/API: Cloudflare Workers, gói Free hiện có 100.000 request/ngày.
- Database: D1 Free hiện có 5 triệu row read/ngày, 100.000 row write/ngày và 5 GB lưu trữ.
- Dữ liệu phù hợp: tài khoản, tủ truyện, lịch sử/tiến độ, rating cache, chỉ mục truyện.
- Không phụ thuộc `localStorage` khi mở cho nhiều người. `localStorage` chỉ còn là cache/offline và là nguồn để nhập dữ liệu lần đầu.
- Chạy cron theo lô để quét các trang nguồn vào D1. API tìm kiếm luôn lọc + sắp xếp trên toàn bộ bảng đã lập chỉ mục rồi mới phân trang.

Tài liệu chính thức:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/

## Phương án dễ làm tài khoản nhất: Supabase Free

Supabase hợp nếu ưu tiên đăng nhập và quản trị dữ liệu qua dashboard:

- PostgreSQL 500 MB.
- 50.000 monthly active users.
- 5 GB egress và 1 GB file storage.
- Có Auth và Row Level Security (RLS), thuận tiện để mỗi người chỉ đọc/ghi tủ truyện của mình.
- Hạn chế đáng lưu ý: dự án Free có thể bị pause sau một tuần không hoạt động; tối đa hai project Free.

Kiến trúc đề xuất nếu chọn Supabase:

1. Sites/Worker phục vụ giao diện và proxy các nguồn truyện.
2. Supabase Auth cấp phiên đăng nhập.
3. PostgreSQL lưu `profiles`, `library_entries`, `reading_progress`, `stories`, `ratings`.
4. Bật RLS trên mọi bảng có dữ liệu cá nhân; không đưa service-role key vào trình duyệt.

Tài liệu chính thức:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Phương án khác: Neon + Vercel

- Neon Free: 0,5 GB storage, 100 CU-hours cho mỗi project; Neon Auth Free nêu 60.000 MAU.
- Vercel Hobby miễn phí nhưng hướng tới dự án cá nhân/phi thương mại.
- Dùng được, nhưng phải đổi nhiều phần hơn so với Worker + D1 đang có.

Tài liệu chính thức:

- https://neon.com/pricing
- https://vercel.com/docs/plans

## Lộ trình mở cho ít người

1. Giữ bản hiện tại trên Sites/Workers và D1.
2. Thêm đăng nhập, `user_id` và policy/kiểm tra quyền trên mọi API tủ truyện.
3. Khi người dùng đăng nhập lần đầu, hỏi họ có muốn nhập tủ truyện/lịch sử từ thiết bị vào database hay không.
4. Thêm index SQL cho `stories(updated_at)`, `ratings(score)`, `story_genres(genre_slug, story_id)` và `reading_progress(user_id, updated_at)`.
5. Cron theo giờ nạp tiếp sáu trang từ cursor gần nhất cho đến khi phủ toàn bộ catalog, sau đó quay lại trang đầu để refresh. Request tìm kiếm ưu tiên D1 và luôn lọc/sắp xếp trước `LIMIT/OFFSET`; trong lúc D1 chưa đủ dữ liệu, hệ thống dùng chỉ mục hợp nhất nhiều trang làm dự phòng.
6. Chỉ thêm R2 khi cần lưu avatar/tài sản do người dùng tạo; không sao chép ảnh chương truyện lên hạ tầng riêng.

Với quy mô ít người, Cloudflare D1 là lựa chọn phù hợp nhất cho code hiện tại. Supabase là lựa chọn thay thế tốt nếu Auth/RLS và dashboard PostgreSQL quan trọng hơn việc giữ kiến trúc đơn giản.
