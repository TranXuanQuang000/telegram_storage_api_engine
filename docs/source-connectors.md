# Connector và parser cho 10 nguồn

## Trạng thái triển khai

| ID | Loại | Cơ chế | Trạng thái |
|---|---|---|---|
| `otruyen` | Comic | REST API | Bật |
| `mangadex` | Comic | REST API v5, chapter `vi` | Bật |
| `cuutruyen` | Comic | SPA/không có API ổn định đã xác minh | Fail-closed |
| `nettruyen` | Comic | Tên miền cung cấp hiện không xác minh được catalog reader | Fail-closed |
| `blogtruyen` | Comic | Không xác minh được API/canonical host ổn định | Fail-closed |
| `hako` | Novel | HTML công khai | Bật |
| `truyenfull` | Novel | HTML công khai | Bật |
| `tangthuvien` | Novel | HTML công khai | Bật |
| `metruyenchu` | Novel | HTML công khai | Bật |
| `wikidich` | Novel | HTML công khai | Bật |

Fail-closed nghĩa là registry có khai báo nguồn nhưng không thử vượt CAPTCHA,
Cloudflare challenge, đăng nhập hoặc paywall. Khi xác minh được API công khai hay
được chủ nguồn cấp quyền, chỉ cần thêm connector vào factory và fixture contract.

Danh sách runtime được xem tại `GET /v1/api/sources`. Dùng `ENABLED_SOURCES` để
giới hạn connector được phép chạy.

## Hợp đồng connector

Mọi connector kế thừa `BaseConnector`:

```python
async def fetch_catalog(page, limit, category=None) -> CatalogFetchResult
async def fetch_story(identifier) -> Story
async def fetch_chapter(story_identifier, chapter_identifier) -> ChapterContent
async def health_check() -> bool
```

`ChapterContent.images` chứa URL HTTPS đầy đủ đối với comic.
`ChapterContent.text_content` chứa nội dung novel thô; `NovelTextCleaner` thực
hiện bước sanitize cuối trước khi API trả dữ liệu. API luôn trả provenance riêng,
không dùng URL tùy ý làm chapter ID.

## Smart merge

`SmartChapterMerger` tạo canonical identity độc lập với ID của nguồn:

```text
regular:v_:n10:s_
regular:v2:n10.5:sa
extra:v1:n3:s_
```

Các nhãn `Chương 010`, `Chapter 10` và `Episode 10` được coi là cùng chapter.
Volume reset, chapter thập phân, hậu tố `a/b`, prologue, epilogue và ngoại truyện
được tách riêng. Mỗi chapter hợp nhất giữ `source_refs`, `original_source`,
`is_filled` và `merged_at`.

Merger chỉ bù khoảng trống bằng nguồn đã được xác định là cùng tác phẩm. Bộ
`matcher.py` chuẩn hóa tên/dấu/tác giả và từ chối kết quả mơ hồ; không được merge
chỉ vì hai slug trùng nhau nếu title/author mâu thuẫn. Hiện resolver liên nguồn
vẫn cần lưu mapping canonical story trong database để bao phủ toàn catalog.

## OTruyen-compatible comic API

```http
GET /v1/api/truyen-tranh/{source-story-id}?source=otruyen
GET /v1/api/truyen-tranh/{mangadex-uuid}?source=mangadex
GET /v1/api/chapter/{opaque-id}
```

Chapter MangaDex được mã hóa thành `ms1.*`; backend giải mã source/story/chapter
và chỉ gọi connector đã đăng ký. Đặt `OPAQUE_ID_SECRET` ở production.

MangaDex dùng `/manga/{id}/feed?translatedLanguage[]=vi` và
`/at-home/server/{chapter-id}`. URL at-home là tạm thời: không lưu lâu dài và
không rehost.

## Novel API

```http
GET /v1/api/truyen-chu/danh-sach?source=tangthuvien
GET /v1/api/truyen-chu/{slug}?source=truyenfull&secondary_sources=wikidich
GET /v1/api/truyen-chu/{slug}/chapter/{chapter-id}?source=wikidich
```

Parser novel chỉ nhận HTML public server-rendered. `public_html.py` phát hiện
trang challenge/login/paywall và dừng, để aggregator thử nguồn khác.

Không thể cam kết “sạch 100%” với HTML thay đổi liên tục. Bộ sanitizer loại
script, iframe, style, form, phần tử ẩn, quảng cáo và watermark đã biết; fixture
tests đảm bảo những marker này không lọt vào output. Production nên theo dõi tỷ
lệ chapter rỗng và thay đổi selector.

## Thêm một connector HTML

1. Khai báo source trong `app/config/sources.py`.
2. Kế thừa `BaseConnector`.
3. Dùng `parse_public_html()` và `extract_public_chapter_text()`; không tự xử lý
   login/challenge.
4. Trả URL tuyệt đối và `raw_metadata.source_id/parsed_url`.
5. Đăng ký connector trong `AggregatorService`.
6. Thêm fixture cho catalog, detail, chapter, restricted page và DOM bị đổi.
7. Chỉ bật production sau live smoke test và kiểm tra điều khoản của nguồn.
