# 🚀 HƯỚNG DẪN CẤU HÌNH & CHẠY TELEGRAM STORAGE API ENGINE

Hệ thống Backend API đọc truyện tranh tự động **Lưu trữ Ảnh Vĩnh Viễn trên Telegram CDN**, giúp website của bạn vận hành 100% ổn định, không lo chết link, sập nguồn hay mất chap.

---

## 📌 HƯỚNG DẪN TỪNG BƯỚC THIẾT LẬP (STEP-BY-STEP SETUP)

### BƯỚC 1: Tạo Telegram Bot Mới (Lấy `BOT_TOKEN`)

1. Mở ứng dụng **Telegram** trên điện thoại hoặc máy tính.
2. Tìm kiếm bot chính thức: `@BotFather` (có dấu tích xanh).
3. Gửi tin nhắn: `/newbot`
4. Nhập tên cho Bot của bạn (Ví dụ: `TruyenStorageBot`).
5. Nhập username cho Bot (phải kết thúc bằng chữ `bot`, ví dụ: `my_truyen_nova_storage_bot`).
6. BotFather sẽ gửi lại một đoạn mã token dạng:
   `7890123456:AAFxYzabc123456789...`  
   👉 **Đây chính là `TELEGRAM_BOT_TOKEN` của bạn!**

---

### BƯỚC 2: Tạo Telegram Channel Và Lấy `CHAT_ID`

1. Trên Telegram, bấm **New Channel** (Tạo kênh mới).
2. Đặt tên Kênh (VD: `KhoTruyenNovaStorage`) và chọn chế độ **Private Channel** (Kênh riêng tư).
3. Vào phần **Channel Settings** -> **Administrators** -> Bấm **Add Admin**.
4. Tìm kiếm username của Bot bạn vừa tạo ở Bước 1 và thêm Bot làm **Administrator** (Cấp quyền Upload bài viết).
5. **Cách lấy `CHAT_ID` của Channel**:
   - Chuyển tiếp (Forward) 1 tin nhắn từ Channel của bạn sang bot `@userinfobot` hoặc `@getidsbot`.
   - Bot sẽ trả về `Chat ID` của Channel (Thường là một chuỗi số âm bắt đầu bằng `-100`, ví dụ: `-1001987654321`).
   👉 **Đây chính là `TELEGRAM_CHAT_ID` của bạn!**

---

### BƯỚC 3: Cấu Hình File Môi Trường `.env`

Di chuyển vào thư mục dự án `telegram_storage_api_engine` và tạo file `.env` từ file `.env.example`:

```bash
cd "d:/Code/Project/App Truyen Nova/telegram_storage_api_engine"
cp .env.example .env
```

Mở file `.env` và dán `BOT_TOKEN` + `CHAT_ID` vào:

```env
TELEGRAM_BOT_TOKEN=7890123456:AAFxYzabc123456789...
TELEGRAM_CHAT_ID=-1001987654321
DATABASE_PATH=app_storage.db
PORT=8000
HOST=0.0.0.0
```

---

### BƯỚC 4: Cài Đặt Thư Viện Và Chạy Backend Server

1. Cài đặt các thư viện Python cần thiết:
   ```bash
   pip install -r requirements.txt
   ```

2. Khởi động Server API Backend:
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. Mở trình duyệt truy cập: `http://localhost:8000/docs` để xem tài liệu Swagger API tương tác trực tiếp!

---

## 🛠️ CÁCH HỆ THỐNG TỰ ĐỘNG LƯU TRỮ VĨNH VIỄN

1. Khi người đọc truy cập một Chapter lần đầu tiên, Backend sẽ trả về ảnh gốc và **tự động chạy một Background Worker** để upload toàn bộ các trang ảnh của chapter đó lên Telegram Channel của bạn.
2. Từ lần đọc thứ 2 trở đi, Backend sẽ kiểm tra CSDL và trả về đường dẫn **Telegram Proxy CDN (`/v1/storage/tg/{file_id}`)**.
3. Ảnh sẽ được tải thẳng từ máy chủ **Telegram CDN** với tốc độ cực nhanh, ổn định 100% vĩnh viễn dù nguồn gốc có bị xóa hay bị sập!

---

## 🌐 TÍCH HỢP VÀO WEBSITE FRONTEND CỦA BẠN

Chỉ cần đổi URL API trên file `.env` của Website Frontend từ:
`NEXT_PUBLIC_API_URL=https://otruyenapi.com/v1/api`  
thành:  
`NEXT_PUBLIC_API_URL=http://localhost:8000/v1/api`

Website của bạn sẽ chạy 100% ổn định trên nền tảng **Telegram Storage Permanent**!
