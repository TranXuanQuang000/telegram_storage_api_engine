# Multi-Source API + kho lưu trữ Telegram có kiểm soát

Backend cung cấp API tổng hợp truyện và một pipeline tùy chọn để lưu các ảnh mà
người vận hành **có quyền lưu trữ** lên Telegram. Pipeline không tự động vượt
đăng nhập, paywall, DRM, anti-bot hoặc sao chép hàng loạt nội dung bên thứ ba.

## Chạy local

```powershell
cd "D:\Code\Project\App Truyen Nova\telegram_storage_api_engine"
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Swagger: `http://localhost:8000/docs`

## Cấu hình archive

Sao chép `.env.example` thành `.env`, rồi cấu hình biến môi trường ở máy chủ:

```env
ARCHIVE_API_TOKEN=<chuỗi-bí-mật-dài>
ARCHIVE_ALLOWED_SOURCES=xkcd
ARCHIVE_MAX_IMAGE_BYTES=19000000
TELEGRAM_BOT_TOKEN=<token-từ-BotFather>
TELEGRAM_CHAT_ID=<id-channel-riêng-tư>
```

Bot phải được thêm làm quản trị viên của channel đích với quyền đăng tài liệu.
Không đưa `TELEGRAM_BOT_TOKEN` vào frontend.

Mặc định chỉ `xkcd` được cho phép vì license CC BY-NC 2.5 đã được xác minh trong
connector. Muốn thêm connector chứa nội dung do bạn sở hữu/được cấp phép, phải:

1. Thêm source ID vào `ARCHIVE_ALLOWED_SOURCES`.
2. Khai báo đúng các CDN host, ví dụ
   `ARCHIVE_ASSET_HOSTS_MY_SOURCE=cdn.example.com`.
3. Gửi `rights_basis` là `owned` hoặc `licensed`, cùng
   `rights_attested: true` trong request.

## API

Lưu toàn bộ ảnh của một chapter:

```http
POST /v1/api/archive/chapter
X-Archive-Api-Key: <ARCHIVE_API_TOKEN>
Content-Type: application/json

{
  "source": "xkcd",
  "story_identifier": "3531",
  "chapter_identifier": "3531",
  "rights_basis": "cc",
  "rights_attested": true,
  "attribution": "",
  "destination": "source_manifest"
}
```

Pipeline lấy chapter qua connector, kiểm tra HTTPS host allowlist, MIME, magic
bytes, giới hạn 19 MB và tính SHA-256. `source_manifest` chỉ trả link đã xác thực
mà không sao chép. Đổi `destination` thành `telegram` để upload bằng Telegram
`sendDocument` và nhận `file_id` cùng proxy URL.

Đọc manifest:

```http
GET /v1/api/archive/{archive_id}
X-Archive-Api-Key: <ARCHIVE_API_TOKEN>
```

Proxy ảnh riêng tư:

```http
GET /v1/storage/tg/{file_id}
X-Archive-Api-Key: <ARCHIVE_API_TOKEN>
```

## Giới hạn hiện tại

Telegram giữ message/file, nhưng index manifest hiện nằm trong RAM và sẽ mất khi
Render khởi động lại. Trước khi dùng production lâu dài, nên lưu manifest vào
Supabase/Postgres/D1. Không nên mô tả cơ chế này là “vĩnh viễn 100%”.
