# Mực

Mực là web app đọc manga, manhwa và manhua theo hướng “phòng đọc”: catalog có nguồn, tìm kiếm sâu, lịch sử, tủ truyện, tải chương offline và gợi ý AI bằng API key do người dùng tự cung cấp.

## Chạy local với Manga API

Yêu cầu Node.js `>=22.13.0`.

Chạy backend trước ở terminal thứ nhất:

```powershell
cd "D:\Code\Project\manga-api"
npm ci
npm run seed
npm start
```

Nếu Redis/Telegram cache được cấu hình, chạy thêm worker trong một terminal riêng:

```powershell
cd "D:\Code\Project\manga-api"
npm run worker
```

Chạy web ở terminal tiếp theo:

```powershell
cd "D:\Code\Project\App Truyen Nova"
npm ci
$env:MANGA_API_BASE_URL="http://localhost:3100"
$env:CATALOG_PROVIDER="manga-api"
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

## Chạy API truyện chữ

API truyện chữ là service FastAPI độc lập trong `backend_api_engine`. Service
không dùng crawler manga, Telegram hay MongoDB; connector đọc metadata/nội dung
công khai theo yêu cầu, cache trong bộ nhớ và tự ngắt nguồn lỗi bằng circuit
breaker.

Terminal riêng:

```powershell
cd "D:\Code\Project\App Truyen Nova\backend_api_engine"
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend dùng:

```dotenv
MUC_CONTENT_API_URL=http://localhost:8000/v1/api
MUC_CONTENT_API_STRICT=true
MUC_NOVEL_API_SOURCES=hako,gutendex
MUC_NOVEL_API_SCAN_PAGES=3
```

Hako dùng origin công khai thay thế `https://docln.sbs`. Catalog, bìa và mục
lục đang đọc được; chapter có `#chapter-c-protected` bị từ chối rõ ràng thay vì
trả quảng cáo hoặc cố vượt cơ chế bảo vệ. Gutendex và Wikisource cung cấp lớp
đọc toàn văn có giấy phép/public-domain ổn định. Các connector TruyenFull,
MeTruyenChu, Tàng Thư Viện và Wikidich vẫn được giữ sau cấu hình nguồn nhưng
không bật mặc định khi domain công khai không truy cập được.

Kiểm tra:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod "http://127.0.0.1:8000/v1/api/truyen-chu/danh-sach?page=1&limit=20&source=auto"
python -m pytest -q
```

## Dữ liệu và quyền sử dụng

- Catalog, detail, chapter cache và signed image URL đi qua `manga-api`; web không gọi trực tiếp OTruyen, NetTruyen hoặc TruyenQQ khi `CATALOG_PROVIDER=manga-api`.
- Điểm 5 sao được đối chiếu theo tên gốc, tên thay thế và tên tiếng Việt từ AniList, Kitsu và dữ liệu MyAnimeList đọc qua Jikan; chỉ hiện nhãn “tổng hợp” khi có ít nhất hai nguồn khớp tên. Nếu chưa tìm thấy điểm công khai, bìa vẫn hiện `~ Điểm Mực tạm tính` dựa trên độ mới và độ đầy đủ metadata để không bị trống, nhưng luôn phân biệt rõ với điểm cộng đồng.
- Reader chỉ dùng `proxyUrl`/`image_file` đã ký do Manga API trả về, không render `originalUrl`. Tải offline dùng Cache Storage trên thiết bị, còn manifest nằm trong IndexedDB.
- Trước khi thêm connector mới, cần kiểm tra điều khoản, robots/rate limit và quyền phân phối của nguồn. Connector không được dùng để vượt paywall hoặc cơ chế bảo vệ truy cập.

## Hosting và D1

`.openai/hosting.json` khai báo binding D1 tên `DB`. Schema nằm tại `db/schema.ts`, migration tại `drizzle/0000_mighty_rattler.sql`.

Biến môi trường cần cấu hình trên hosting:

- `MANGA_API_BASE_URL`: origin server-side của Manga API.
- `CATALOG_PROVIDER=manga-api`: bật adapter mới và vô hiệu hóa OTruyen ingestion trong web.
- `INGEST_TOKEN`: secret cho ingestion legacy/rating; không dùng để gọi Manga API.
- `NEXT_PUBLIC_SITE_URL`: origin công khai dùng cho metadata, ví dụ `https://muc.example.com`.

API quản trị:

- `POST /api/admin/ingest` chỉ còn cho rollback legacy; route trả `409` khi Manga API đang quản lý catalog.
- `POST /api/admin/ratings` với header `X-Ingest-Token` và body `{"limit":6}`.

Cloudflare scheduled handler chạy catalog ingestion rồi làm giàu rating theo lô nhỏ. Lịch cron cần được bật trong cấu hình môi trường triển khai.

## AI BYOK

Mực hỗ trợ OpenAI, Anthropic và Gemini. Key chỉ nằm trong `sessionStorage`, được gửi bằng header tới proxy cùng origin, không ghi vào D1, log hay localStorage. Khi người dùng hỏi “truyện giống ABC”, hệ thống nhận diện ABC, lấy tóm tắt/thể loại/nhịp truyện, xây candidate pool gần nội dung rồi mới gọi model. Endpoint AI có schema validation, allowlist provider/model, rate limit và chỉ được giới thiệu các truyện có trong catalog ứng viên. Kết quả được ánh xạ trở lại thành thẻ truyện thật có bìa, điểm, chương mới, nút xem truyện và đọc ngay; model không còn chỉ trả một danh sách tên.

## Reader và tìm kiếm

- Tìm tên hỗ trợ bỏ dấu, đảo ký tự nhẹ, thiếu khoảng trắng và gợi ý gần đúng. Nếu không có tên chính xác, giao diện luôn nói rõ trước khi hiển thị đề xuất.
- Khi người dùng bấm một bìa lần đầu, route loading đọc bản xem trước đã lưu trong phiên và hiện ngay bìa, tên, thể loại, điểm và chương mới; tóm tắt, mục lục và điểm đa nguồn được bổ sung sau khi tải xong.
- Reader có lối thoát nhanh về trang chủ/khám phá, mục lục tìm kiếm được, nút chương trước/sau và tự chuyển chương khi bấm tiếp ở trang cuối.
- Font Be Vietnam Pro + Lora được bundle với subset tiếng Việt; bìa luôn phủ kín khung 2:3 và rating nằm trực tiếp trên bìa.

## Cấu trúc chính

- `app/`: giao diện và API routes.
- `components/`: reader, discovery, tủ truyện, tải offline và AI settings.
- `lib/sources/manga-api.ts`: adapter duy nhất cho catalog, search, genre, detail, chapter và signed image URL.
- `lib/sources/novel-api.ts`: adapter truyện chữ có opaque ID và provenance theo từng chapter.
- `backend_api_engine/`: source selector, chapter merge/gap filling, HTML cleaner và connector truyện chữ.
- `lib/sources/otruyen.ts`: adapter legacy chỉ giữ lại để rollback.
- `lib/ratings.ts`: công thức Bayesian, freshness và confidence.
- `lib/offline-store.ts`: IndexedDB, Cache Storage, quota và progress queue.
- `db/`: schema D1 và migration.
- `worker/`: entrypoint Vinext/Cloudflare và scheduled ingestion.

## Dashboard vận hành

Trang `/admin/cyber-nexus` hiển thị dữ liệu thật từ Manga API và Novel API:

- tổng catalog, manifest chapter, chapter cache và hàng đợi;
- cursor, lần chạy, số bản ghi nhập/cập nhật và lỗi gần nhất của từng nguồn manga;
- trạng thái backend, MongoDB, snapshot truyện chữ và circuit của từng nguồn novel.

Hai secret bắt buộc phải được cấu hình trên Cloudflare, không ghi vào `wrangler.json`:

```powershell
npx wrangler pages secret put ADMIN_DASHBOARD_TOKEN --project-name muctruyen
npx wrangler pages secret put MANGA_API_ADMIN_TOKEN --project-name muctruyen
```

`ADMIN_DASHBOARD_TOKEN` là mã riêng để mở dashboard. `MANGA_API_ADMIN_TOKEN` phải
khớp `ADMIN_TOKEN` của service `muc-manga-api` trên Render. Route
`/api/admin/dashboard` giữ credential backend ở server; trình duyệt không nhận được
credential này.

Script PowerShell/Python local vẫn dừng khi Windows tắt hoặc sleep. Catalog truyện
chữ production được cập nhật theo lô bởi `.github/workflows/sync-novel-catalog.yml`
mỗi bốn giờ; checkpoint mới được commit sẽ kích hoạt Render auto-deploy. Vì vậy
laptop không còn là thành phần bắt buộc để kho production tiếp tục lớn dần.
