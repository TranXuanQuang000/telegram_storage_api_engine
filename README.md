# Mực

Mực là web app đọc manga, manhwa và manhua theo hướng “phòng đọc”: catalog có nguồn, tìm kiếm sâu, lịch sử, tủ truyện, tải chương offline và gợi ý AI bằng API key do người dùng tự cung cấp.

## Chạy local

Yêu cầu Node.js `>=22.13.0`.

```powershell
npm ci
npm run dev
```

Để chạy đúng bundle production Cloudflare-compatible tại local:

```powershell
npm run build
npx wrangler dev --config dist/server/wrangler.json --port 3000 --persist-to .wrangler/state
```

Mở `http://127.0.0.1:3000`. Các lệnh kiểm tra:

```powershell
npm run lint
npx tsc --noEmit
npm test
```

## Dữ liệu và quyền sử dụng

- Catalog/chapter hiện dùng public API của OTruyen và luôn giữ đường dẫn provenance.
- Điểm 5 sao được làm giàu từ aggregate rating công khai của AniList và Kitsu; chỉ hiện nhãn “tổng hợp” khi có ít nhất hai nguồn khớp tên. Kệ đề xuất ưu tiên điểm cao, tỷ lệ tích cực cao và tỷ lệ chấm xấu thấp.
- Mực không sao chép chapter lên máy chủ riêng. Tải offline dùng Cache Storage trên thiết bị, còn manifest nằm trong IndexedDB.
- Trước khi thêm connector mới, cần kiểm tra điều khoản, robots/rate limit và quyền phân phối của nguồn. Connector không được dùng để vượt paywall hoặc cơ chế bảo vệ truy cập.

## Hosting và D1

`.openai/hosting.json` khai báo binding D1 tên `DB`. Schema nằm tại `db/schema.ts`, migration tại `drizzle/0000_mighty_rattler.sql`.

Biến môi trường cần cấu hình trên hosting:

- `INGEST_TOKEN`: secret cho hai API quản trị ingestion.
- `NEXT_PUBLIC_SITE_URL`: origin công khai dùng cho metadata, ví dụ `https://muc.example.com`.

API quản trị:

- `POST /api/admin/ingest` với header `X-Ingest-Token` và body `{"source":"otruyen","mode":"incremental"}`.
- `POST /api/admin/ratings` với header `X-Ingest-Token` và body `{"limit":6}`.

Cloudflare scheduled handler chạy catalog ingestion rồi làm giàu rating theo lô nhỏ. Lịch cron cần được bật trong cấu hình môi trường triển khai.

## AI BYOK

Mực hỗ trợ OpenAI, Anthropic và Gemini. Key chỉ nằm trong `sessionStorage`, được gửi bằng header tới proxy cùng origin, không ghi vào D1, log hay localStorage. Khi người dùng hỏi “truyện giống ABC”, hệ thống nhận diện ABC, lấy tóm tắt/thể loại/nhịp truyện, xây candidate pool gần nội dung rồi mới gọi model. Endpoint AI có schema validation, allowlist provider/model, rate limit và chỉ được giới thiệu các truyện có trong catalog ứng viên.

## Reader và tìm kiếm

- Tìm tên hỗ trợ bỏ dấu, đảo ký tự nhẹ, thiếu khoảng trắng và gợi ý gần đúng. Nếu không có tên chính xác, giao diện luôn nói rõ trước khi hiển thị đề xuất.
- Reader có lối thoát nhanh về trang chủ/khám phá, mục lục tìm kiếm được, nút chương trước/sau và tự chuyển chương khi bấm tiếp ở trang cuối.
- Font Be Vietnam Pro + Lora được bundle với subset tiếng Việt; bìa luôn phủ kín khung 2:3 và rating nằm trực tiếp trên bìa.

## Cấu trúc chính

- `app/`: giao diện và API routes.
- `components/`: reader, discovery, tủ truyện, tải offline và AI settings.
- `lib/sources/`: connector OTruyen và rating enrichment.
- `lib/ratings.ts`: công thức Bayesian, freshness và confidence.
- `lib/offline-store.ts`: IndexedDB, Cache Storage, quota và progress queue.
- `db/`: schema D1 và migration.
- `worker/`: entrypoint Vinext/Cloudflare và scheduled ingestion.
