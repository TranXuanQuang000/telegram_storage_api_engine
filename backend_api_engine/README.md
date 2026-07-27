# Mực Novel Aggregator

FastAPI service cho catalog, chi tiết và nội dung truyện chữ. Mọi connector chỉ
đọc endpoint/HTML công khai, không giải CAPTCHA, không gửi form đăng nhập và
không mở nội dung trả phí.

## Chạy local

```powershell
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

File `.env.example` bật mặc định:

- `hako`: metadata, bìa và mục lục qua mirror công khai `docln.sbs`.
- `gutendex`: metadata và toàn văn Project Gutenberg.

Wikisource tiếng Việt được frontend sử dụng trực tiếp qua API chính thức làm
lớp dự phòng. Những nguồn HTML còn lại chỉ nên bật sau khi origin công khai
được xác minh và điều khoản cho phép.

## API

```text
GET /health
GET /v1/api/truyen-chu/danh-sach?page=1&limit=20&source=auto
GET /v1/api/truyen-chu/{slug}?source={source}
GET /v1/api/truyen-chu/{slug}/chapter/{chapterId}?source={source}
```

Chapter response có cả `text_content` và alias `content`, kèm `word_count`,
`source` và `source_url`.

## Thuật toán

1. Catalog `auto` gọi song song các nguồn đang bật, round-robin kết quả và
   loại trùng theo tên + tác giả.
2. Detail chỉ merge nguồn phụ sau khi điểm đối chiếu tác phẩm đạt ngưỡng.
3. Chapter được chuẩn hóa theo volume, số chương, phần nhỏ, ngoại truyện và
   provenance nguồn.
4. Gap filling chỉ dùng chapter từ tác phẩm đã xác minh.
5. Nội dung được làm sạch script, iframe, quảng cáo và watermark.
6. Chapter content luôn được tải từ đúng `original_source`; không thử cùng
   slug trên một website chưa được xác minh.

## Kiểm tra

```powershell
python -m pytest -q
```
