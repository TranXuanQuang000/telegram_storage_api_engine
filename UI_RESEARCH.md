# Báo cáo Nghiên cứu UI/UX - App Truyen Nova

**Ngày thực hiện:** 26/07/2026
**Mục tiêu:** Phân tích 6 nguồn UI/UX tiêu biểu phục vụ thiết kế cho các phân hệ của 'App Truyen Nova' (Aggregator, Canvas/Node UI, Verified Journal, DevOps Monitor).

---

## 1. Cùng Domain (Aggregator Model)
### **Nguồn:** [Line Webtoon](https://www.webtoons.com/) (Truy cập: 26/07/2026)
* **Phân tích UX:** 
  - Giao diện tối giản, tập trung tối đa vào cover art của truyện. 
  - Hệ thống phân loại (Genre, Ranking, Originals) rõ ràng, sử dụng infinite scroll thân thiện với thiết bị di động.
  - Cơ chế "Daily Pass" và tiến trình đọc được hiển thị trực quan thông qua thanh progress bar siêu mỏng.
* **Ứng dụng cho Truyen Nova:** 
  - Áp dụng cấu trúc lưới (grid layout) bất đối xứng cho màn hình Homepage để làm nổi bật các truyện Top Trending.
  - Tối ưu hóa trải nghiệm vuốt (swipe) và cuộn dọc cho đọc truyện.

## 2. Cross-domain (UI Canvas/Node cho Admin)
### **Nguồn:** [React Flow](https://reactflow.dev/) (Truy cập: 26/07/2026)
* **Phân tích UX:** 
  - Trải nghiệm Canvas tương tác mượt mà với tính năng drag-and-drop, zoom/pan.
  - Các node được thiết kế dưới dạng thẻ (card) với các "handles" (điểm kết nối) rõ ràng, có trạng thái hover/active dễ nhận biết.
  - Minimap và bảng điều khiển floating giúp định vị trong không gian canvas lớn.
* **Ứng dụng cho Truyen Nova:** 
  - Xây dựng hệ thống quản lý flow phân phối truyện (Admin Panel) bằng UI Node-based. Admin có thể kéo thả các node (Nguồn crawl -> Bộ lọc -> Dịch thuật -> Xuất bản) để thiết lập luồng xử lý tự động.

## 3. Cross-domain (Verified Journal cho User)
### **Nguồn:** [Substack](https://substack.com/) (Truy cập: 26/07/2026)
* **Phân tích UX:**
  - Tập trung vào typography với font chữ serif đọc dễ chịu, tạo cảm giác như một ấn phẩm báo chí uy tín (editorial feel).
  - Tích hợp huy hiệu (badge) "Bestseller" hoặc "Verified" tinh tế bên cạnh tên tác giả.
  - Trải nghiệm viết và đọc không bị phân tâm (Distraction-free).
* **Ứng dụng cho Truyen Nova:**
  - Thiết kế phân hệ Verified Journal cho các dịch giả/nhóm dịch uy tín. Sử dụng typography chuẩn editorial và huy hiệu Verified (Tick xanh/vàng) để tăng độ tin cậy.
  - Layout đọc bài review/journal sẽ có khoảng trắng (whitespace) lớn, ưu tiên readability.

## 4. Cross-domain / Monitor (Dark Mode cho DevOps)
### **Nguồn:** [Grafana](https://grafana.com/) (Truy cập: 26/07/2026)
* **Phân tích UX:**
  - Giao diện Dark mode thuần túy được tinh chỉnh với các mã màu (palette) tối ưu cho việc quan sát dữ liệu trong thời gian dài (giảm mỏi mắt).
  - Sử dụng các màu neon (xanh lá, đỏ, cam) có độ tương phản cao (High Contrast) để cảnh báo trạng thái hệ thống.
  - Các dashboard widget được bo góc nhẹ, có đường viền mờ (subtle border) để phân chia không gian.
* **Ứng dụng cho Truyen Nova:**
  - Áp dụng vào màn hình Monitor của DevOps: Nền `#111217` kết hợp với các dải màu neon để biểu diễn biểu đồ băng thông, lượng truy cập, và trạng thái server.
  - Cảnh báo lỗi (Error/Alert) sử dụng hiệu ứng pulse (nhịp đập) để thu hút sự chú ý.

## 5. Design System
### **Nguồn:** [Vercel Geist Design System](https://vercel.com/design) (Truy cập: 26/07/2026)
* **Phân tích UX:**
  - Triết lý thiết kế "Functional & Brutalist", tối giản các chi tiết trang trí không cần thiết.
  - Bảng màu (color palette) cực kỳ nhất quán, hỗ trợ chuyển đổi Light/Dark mode hoàn hảo.
  - Hệ thống spacing và typography có tính toán toán học chính xác, tạo cảm giác công nghệ và hiện đại.
* **Ứng dụng cho Truyen Nova:**
  - Đồng bộ Design System của toàn ứng dụng theo hướng của Vercel: sử dụng font sans-serif (như Inter hoặc Geist), các component UI (nút, input, modal) thiết kế phẳng, viền mỏng 1px và shadow mềm mại.

## 6. Experimental / Editorial
### **Nguồn:** [The Pudding](https://pudding.cool/) (Truy cập: 26/07/2026)
* **Phân tích UX:**
  - Kết hợp kể chuyện (storytelling) bằng dữ liệu trực quan thông qua hiệu ứng scroll-telling.
  - Bố cục phá cách, không gò bó vào grid truyền thống. Đồ họa chuyển động mượt mà khi người dùng tương tác.
* **Ứng dụng cho Truyen Nova:**
  - Dành cho các chiến dịch ra mắt truyện độc quyền hoặc các bài báo cáo/tổng kết cuối năm (Year in Review) của người dùng.
  - Sử dụng hiệu ứng Parallax và Scroll-driven animations để tạo cảm giác nhập vai khi xem giới thiệu về các vũ trụ truyện tranh.
