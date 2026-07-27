# STRATEGY BLUEPRINT: MULTI-SOURCE AGGREGATOR & CONSENT-VERIFIED CONNECTOR ENGINE

## 1. Core Vision (Tầm nhìn khác biệt)
Hệ thống sẽ đi theo mô hình **Compliance-First Server-Side Aggregator**. Thay vì đẩy gánh nặng xử lý và rủi ro vi phạm bản quyền xuống client (như Mihon/Tachiyomi), hệ thống sử dụng một API Gateway tập trung mạnh mẽ kết hợp với tư duy "Đạo đức Dữ liệu" (Ethical Data). Điểm cân bằng Nash giữa Sáng tạo và Thực tế nằm ở việc tạo ra sự minh bạch tuyệt đối cho người dùng (Trust) và công cụ trực quan tối đa cho đội ngũ quản trị (Efficiency), vận hành trên một lõi dữ liệu đã được tối ưu hóa.

## 2. Innovative Workflows (Các luồng đột phá chốt lại)

### A. Tự động hợp nhất & Bù đắp (Smart Story/Chapter Merge)
- **Thuật toán "Zipper" kết hợp Entity Resolution**: 
  Sử dụng mô hình Probabilistic Record Linkage. Thuật toán Blocking sẽ nhóm các truyện/chap theo đặc tính (độ dài, ký tự đầu, tác giả) để tránh độ phức tạp $O(N^2)$. Sau đó, áp dụng Jaccard Similarity (cho văn bản) hoặc pHash (cho ảnh) trên tập con để xác định độ trùng lặp.
- **Workflow "The Curator's Canvas"**: 
  Admin không quản lý dữ liệu bằng danh sách (List/Table). Giao diện là một Infinite Canvas (React Flow) nơi các nguồn hiển thị dưới dạng luồng (Node stream). Admin có thể kéo thả để merge dữ liệu hoặc hệ thống tự động báo cáo các đoạn "lỗ hổng" (gap) để duyệt.

### B. Cơ chế Xác thực Quyền Nguồn (Consent Verification)
- **4 Lớp Khiên Bảo Vệ**: 
  1. *Robots.txt Parser Layer* tuân thủ nghiêm ngặt rule và crawl-delay.
  2. *Domain Whitelist* chặn các trang có license thương mại tại tầng Gateway.
  3. *Opt-in/AI Headers Scanner* đọc thẻ meta và custom HTTP Headers.
  4. *TOS Keyword Heuristic Scanner* cắm cờ các site cấm sao chép để manual review.
- **Workflow "The Verified Journal"**:
  Giao diện end-user hiển thị "Consent Badge" cho từng chap. Độc giả bấm vào sẽ xem được "Chứng thư nguồn gốc" (Provenance) chứng minh tính hợp pháp của dữ liệu đang đọc.

### C. Giải pháp Resiliency & Anti-Blocking
- **Kiến trúc Pipeline Tự Sửa Chữa (Self-Healing)**:
  Sử dụng Adaptive Rate Limiting với Jitter, Exponential Backoff. Kết hợp Proxy Pool Rotation thông minh (theo dõi ASN/Subnet) và Sticky Sessions cho các trang cần auth.
- **Workflow "Cyber-Nexus" Dashboard**:
  Giám sát thời gian thực dạng tia sáng/particle stream. Áp dụng Circuit Breakers ngắt mạch tự động khi tỷ lệ lỗi vượt quá 20%/phút, cảnh báo đỏ trên UI để DevOps thay pool proxy.

## 3. Market Validation (Chứng cứ)
- **Kiến trúc Aggregator**: Trái ngược với *Tachiyomi/Mihon* (Client-side adapter), hệ thống này dùng *Server-side Microservices* để đảm bảo dữ liệu sạch và an toàn tập trung.
- **Data Deduplication**: Thuật toán Record Linkage được chứng minh tính hiệu quả qua các thư viện như `Splink` (phát triển bởi MOJ Anh) hoặc `Dedupe.io`.
- **Anti-Blocking**: Mô hình Circuit Breakers và ASN-aware Proxy Rotation học hỏi từ các nền tảng scraper chuyên nghiệp như *Scrapfly* và *ScrapingBee* (tham chiếu kiến trúc ngày 26/07/2026).

## 4. UI Opportunity
- **Audience**: Độc giả có ý thức (Ethical Readers), Curators/Data Admins, DevOps.
- **Top Tasks**: Đọc truyện với nguồn gốc rõ ràng, Merge chapter kéo thả trực quan, Giám sát sức khỏe pipeline cào dữ liệu.
- **3 Art Directions**:
  1. *The Curator's Canvas (Admin)*: Node-graph, infinite canvas, drag-and-drop manipulation.
  2. *Cyber-Nexus (Monitor)*: Monospace, real-time data visualizer, dark mode HUD.
  3. *The Verified Journal (End-user)*: Sạch sẽ, serif typography, editorial style, có Consent Badge.
- **Interaction/Motion**: Kéo thả mượt mà trên Canvas, cuộn vô tận không giật lag (Seamless scroll), tia sáng real-time báo trạng thái mạng.
- **Anti-Goals**: Không dùng thiết kế lòe loẹt/quảng cáo như web lậu; không dùng list tĩnh nhàm chán cho Admin.

## 5. Cảnh báo rủi ro kỹ thuật
- **Nghẽn cổ chai Entity Resolution**: So sánh nội dung lớn sẽ hao tốn CPU. Cần chạy Queue (RabbitMQ/Kafka) và tận dụng Blocking/Hashing tốt trước khi so sánh chi tiết.
- **Performance Client-Side Admin**: Render hàng ngàn nodes trên Canvas có thể gây lag. Phải áp dụng ảo hóa (virtualization/Viewport culling) ở thư viện React Flow.
- **Deadlock Rate Limit**: Thuật toán Circuit Breaker và Backoff phải cấu hình tỉ mỉ. Nếu quá nhạy, hệ thống sẽ ngừng cào liên tục; nếu quá trễ, sẽ bị ban hàng loạt IP đắt tiền. Lượng Jitter phải đủ ngẫu nhiên để không tạo sóng DDoS.
