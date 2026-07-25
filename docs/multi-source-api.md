# API nội dung thay thế OTruyen

Frontend Cloudflare Pages/Workers gọi một FastAPI HTTPS riêng. API này giữ hợp
đồng tương thích OTruyen cho truyện tranh, đồng thời cung cấp một hợp đồng riêng
cho truyện chữ. Frontend không gọi trực tiếp các website nguồn và không nhận URL
tùy ý từ người dùng.

## Luồng chạy

```text
Browser
  -> Cloudflare Pages/Worker (Mực)
      -> MUC_CONTENT_API_URL (FastAPI HTTPS)
          -> connector truyện tranh / truyện chữ được cho phép
```

Trong giai đoạn chuyển đổi, `MUC_CONTENT_API_STRICT=false` cho phép truyện tranh
rơi về OTruyen nếu API mới tạm lỗi. Khi backend đã ổn định, đặt thành `true` để
ngắt hoàn toàn đường gọi cũ. Truyện chữ luôn giữ Wikisource và dữ liệu đóng gói
làm nguồn dự phòng.

## Chạy backend cục bộ

```powershell
cd backend_api_engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Kiểm tra `http://localhost:8000/health`. Frontend local dùng:

```dotenv
MUC_CONTENT_API_URL=http://localhost:8000
MUC_CONTENT_API_STRICT=false
```

## Triển khai production

Cloudflare Pages không thể truy cập `localhost:8000`. Build container trong
`backend_api_engine/Dockerfile`, chạy nó trên một dịch vụ có URL HTTPS công khai
(VPS, dịch vụ container hoặc máy nhà qua Cloudflare Tunnel), rồi cấu hình các
biến server-side của Pages/Worker:

```dotenv
MUC_CONTENT_API_URL=https://api.example.com
MUC_CONTENT_API_TOKEN=<cùng giá trị với backend>
MUC_CONTENT_API_STRICT=false
MUC_NOVEL_API_SOURCES=hako,truyenfull,metruyenchu,tangthuvien,wikidich
MUC_NOVEL_API_SCAN_PAGES=2
```

Backend:

```dotenv
MUC_API_TOKEN=<bí mật dài, ngẫu nhiên>
ALLOWED_ORIGINS=https://muctruyen.pages.dev
OTRUYEN_UPSTREAM_URL=https://otruyenapi.com/v1/api
CACHE_MAX_ENTRIES=512
ENABLED_SOURCES=otruyen,mangadex,hako,truyenfull,metruyenchu,tangthuvien,wikidich
OPAQUE_ID_SECRET=<bí mật dài, ngẫu nhiên>
```

`MUC_CONTENT_API_TOKEN` chỉ được gửi từ Worker tới đúng origin đã cấu hình, không
bao giờ gửi sang API dự phòng. Không đặt secret dưới tên `NEXT_PUBLIC_*`.

## Hợp đồng chính

Truyện tranh tương thích:

- `GET /v1/api/home`
- `GET /v1/api/danh-sach/{truyen-moi|hoan-thanh|dang-phat-hanh}`
- `GET /v1/api/the-loai`
- `GET /v1/api/the-loai/{slug}`
- `GET /v1/api/tim-kiem?keyword=...`
- `GET /v1/api/truyen-tranh/{slug}`
- `GET /v1/api/chapter/{opaque-id}`

Truyện chữ:

- `GET /v1/api/truyen-chu/danh-sach`
- `GET /v1/api/truyen-chu/{slug}`
- `GET /v1/api/truyen-chu/{slug}/chapter/{chapter-id}`
- `GET /v1/api/sources`

ID chương là ID mờ (opaque), không phải URL nguồn. Mọi phản hồi nội dung có
`source`/`source_url` để frontend hiển thị nguồn đúng.

## Giới hạn hiện tại

Truyện tranh hiện có hai connector API thực là OTruyen và MangaDex. Ba nguồn HTML
còn lại được khai báo nhưng fail-closed vì chưa xác minh được API/canonical reader
ổn định mà không cần vượt anti-bot. Xem ma trận và quy trình parser tại
`docs/source-connectors.md`. Việc có connector kỹ thuật không tự cấp quyền sao
chép nội dung; chỉ bật các nguồn/API mà bạn được phép truy cập và tuân thủ điều
khoản của nguồn.
