# UI Direction — Mực

## Context

- **Audience:** độc giả truyện tranh Việt 16–35, mobile-first; nhóm đọc hằng ngày và quản lý nhiều bộ.
- **Top 3 tasks:** tiếp tục đọc; xem chương mới; tìm truyện hợp mood/gu.
- **Platform/input:** mobile touch, tablet, desktop keyboard/mouse; PWA installable.
- **Data extremes:** tên truyện rất dài, 0–5000 chương, nhiều alias/nguồn/tag, ảnh dọc không đồng nhất.
- **Constraints:** WCAG 2.2 AA, mạng yếu, reduced motion, không bịa social proof, provenance cho dữ liệu ngoài.

## Brand traits

| Trait | Biểu hiện | Tránh |
|---|---|---|
| Thân mật | Copy Việt ngắn, trực tiếp; “Đọc tiếp”, “Đúng gu bạn” | Giọng máy móc hoặc teen-code quá mức |
| Tò mò | Nhãn mood, lý do gợi ý, trích dẫn nguồn | Clickbait và infinite scroll vô tận |
| Tin cậy | Điểm có confidence, cập nhật có timestamp, source drawer | Điểm 5.0 không số phiếu |
| Sưu tầm | Cover như ấn phẩm, shelf có nhịp | Card soup đồng đều |
| Tĩnh tâm | Nền giấy/than dịu, motion ít và có mục đích | Glow, parallax, autoplay |

## Three concepts

| Concept | Visual grammar | Signature idea | Fit /100 | Risk |
|---|---|---|---:|---|
| A — Inkroom Editorial | giấy ấm + mực đen + son đỏ cam; type editorial; layout tạp chí | “Dấu mực” đánh dấu tiến độ/chương mới | 92 | texture/serif có thể ảnh hưởng readability nếu lạm dụng |
| B — Midnight Panels | nền than, ảnh bìa lớn, chrome tối giản | reader-first cinematic spotlight | 84 | dễ giống streaming app, contrast ảnh thất thường |
| C — Index Kiosk | data-dense, mono metadata, command bar | bộ lọc include/exclude dạng phiếu mục lục | 80 | lạnh và khó tiếp cận người đọc casual |

## Chosen North Star

- **Design thesis:** Một phòng đọc Việt hiện đại, nơi truyện hiện lên như ấn phẩm được chọn kỹ còn dữ liệu nguồn nằm gọn như mục lục đáng tin.
- **Recipe:** Inkroom Editorial + compact utility modifier từ Index Kiosk.
- **Signature device:** dấu son “MỚI / ĐANG ĐỌC / OFFLINE” và đường chỉ trang chạy ngang xuyên các module.
- **Why it wins:** khác rõ web đọc truyện phổ biến, phù hợp nội dung truyện in, vẫn đủ mật độ cho power user.

## System

- **Typography:** display serif có độ tương phản vừa cho tiêu đề; sans humanist cho UI/body; mono cho chapter/source/score metadata. Dùng font hệ thống/fallback để build ổn định, preload chỉ khi có asset self-hosted.
- **Color:** paper `#f1eadc`, ink `#171714`, vermilion `#e4512e`, moss `#526b50`, muted `#756f64`, night `#131311`. Accent hiếm.
- **Composition:** desktop 12 cột, hero lệch 7/5; mobile một cột với shelf snap; nội dung dài tối đa 72ch.
- **Surface:** paper/ink, border hairline, shadow ngắn có sắc ấm; halftone rất nhẹ chỉ ở vùng editorial/cover.
- **Imagery:** cover art chi phối; fallback cover là type-led poster có màu/token, không icon placeholder chung.
- **Icons/shapes:** icon nét 1.75px, corner 10–18px; dấu tròn/rect hơi lệch như con dấu.
- **Voice:** “Đọc tiếp chương 47”, “Mạng chập chờn? Ghim 5 chương”, “Điểm này đến từ 3 nguồn”.

## Interaction and motion

- **Model:** search command mở bằng `/` hoặc `Ctrl/Cmd+K`; mobile dùng thanh tìm cố định; tap cover mở detail, CTA riêng đọc tiếp để tránh mơ hồ.
- **Productive motion:** 120–220ms, ease-out; filter chip/state và drawer.
- **Expressive:** hero cover settle, dấu son đóng nhẹ khi lưu offline, chapter transition; tối đa 3.
- **Budget:** translate/opacity only; stagger 24ms, chuỗi < 360ms; không animation mọi section khi scroll.
- **Reduced motion:** bỏ translate/stagger, giữ opacity nhanh ≤100ms; reader không tự trượt.

## Responsive strategy

- **Mobile:** bottom dock 4 mục; continue card full-width; chip scroll; detail CTA sticky; reader tap zones.
- **Tablet:** navigation rail ngắn; shelf 3–4 cover; reader hỗ trợ single/dual khi phù hợp.
- **Desktop:** top nav + command search; 12-column; sidebar source/filter ở discovery; keyboard shortcuts.
- **Persist:** search, current reading, download status và source provenance không biến mất theo viewport.

## State coverage

- Loading skeleton khớp cover/title/chapter; empty có hành động cụ thể; partial source có cảnh báo; error có retry; success/toast có undo khi phù hợp.
- Offline hiển thị local availability và last sync; permission/quota có giải thích; destructive download delete có confirm/undo.
- Tên dài 3 dòng rồi ellipsis; tag wrap; số chương lớn dùng locale; không overflow ngang ở zoom 200%.

## Anti-goals

1. Không purple/blue gradient + glass + glow.
2. Không hero “Khám phá thế giới truyện vô tận” và CTA “Bắt đầu”.
3. Không biến mỗi dòng thành rounded card.
4. Không dùng điểm AI vô nguồn hoặc review giả.
5. Không hy sinh reader cho animation/trang trí.

## Visual validation

- **Viewports:** 390×844, 768×1024, 1440×900.
- **Critical:** home personalized/new user, discovery filters, detail/source score, reader toolbar/offline, library/download empty/error.
- **Evidence:** `artifacts/screenshots/` kèm tên viewport/state.
- **Target:** ≥85/100, không blocker keyboard/contrast/overflow/clipping.

