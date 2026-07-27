# UI DIRECTION: App Truyen Nova

## 1. 3 Concepts Khác Biệt
**Concept A: Neo-Brutalism & Editorial (The Substack / Webtoon Blend)**
- *Visual Grammar*: Tập trung vào typography serif sang trọng, ranh giới rõ ràng bằng viền đen mỏng, không dùng đổ bóng (flat shadows).
- *Interaction*: Cuộn tự nhiên, tĩnh lặng, chuyển trang mượt mà không dùng hiệu ứng dư thừa.

**Concept B: Cyber-Minimalism (The Vercel / Grafana Influence) - NORTH STAR**
- *Visual Grammar*: Giao diện Dark-mode/Light-mode linh hoạt. Hệ thống lưới lưới (grid) khắt khe, viền 1px mờ, font chữ Geist/Inter monospace cho dữ liệu và sans-serif cho văn bản thường.
- *Interaction*: Hiệu ứng hover mềm mại (soft glow), data visualizations trực quan, canvas kéo thả như không gian làm việc chuyên nghiệp. Nhấn mạnh vào sự tin cậy và tốc độ.

**Concept C: Experimental Scroll-Telling (The Pudding)**
- *Visual Grammar*: Bố cục phá vỡ lưới, nhiều khoảng trắng bất đối xứng.
- *Interaction*: Scroll-driven animations, parallax hiệu ứng mạnh, thu hút chú ý vào đồ họa.

## 2. Score Matrix
| Tiêu chí | Concept A (Editorial) | Concept B (Cyber-Minimal) | Concept C (Experimental) |
|---|---|---|---|
| Trust & Compliance (Cốt lõi) | 8/10 | **10/10** | 5/10 |
| Admin/DevOps Efficiency | 5/10 | **10/10** | 3/10 |
| Performance / Scalability | 9/10 | **8/10** | 4/10 |
| **Tổng** | 22 | **28** | 12 |

## 3. North Star (Lựa Chọn Cuối)
**Concept B: Cyber-Minimalism**.
*Product Rationale*: Ứng dụng Aggregator chú trọng vào Data Ethics và Backend mạnh mẽ. Giao diện người dùng cần truyền tải tính minh bạch (Trust), trong khi giao diện Admin/DevOps cần công năng cao nhất.

## 4. Anti-Goals
- Không sử dụng Glassmorphism làm giảm hiệu suất thiết bị di động.
- Không sử dụng gradients chói lóa (làm mất tập trung khỏi artwork của truyện).
- Không làm giao diện Admin dưới dạng List table tĩnh (bắt buộc dùng Canvas node-based).

## 5. Motion Narrative & Reduced Motion
- *Motion*: Tập trung vào "Micro-interactions". Các node trên Canvas có hiệu ứng "snap-to-grid". Các cảnh báo Monitor có "pulse" mềm, không chớp tắt mạnh.
- *Reduced Motion*: Tắt pulse, tắt animation chuyển trang, chỉ giữ lại sự thay đổi trạng thái màu sắc ngay lập tức (instant state change) cho người dùng nhạy cảm.

## 6. Responsive & Validation Plan
- *Responsive*: Admin/Monitor tối ưu trên Desktop/Tablet (landscape). Màn hình End-user ưu tiên Mobile-first (cuộn dọc).
- *Validation*: A/B Test tỷ lệ click vào "Consent Badge" trên mobile. Theo dõi thời gian trung bình Admin hoàn thành 1 thao tác merge trên Canvas (nhỏ hơn 5 giây).
