# UI Research — Mực

Ngày nghiên cứu: 2026-07-23

## Nguồn và bài học

| Nguồn | Vai trò | Quan sát có bằng chứng | Mượn nguyên lý | Không sao chép |
|---|---|---|---|---|
| https://truyenqq.com.vn/ | Cùng domain, Việt Nam | Điều hướng ưu tiên thể loại, xếp hạng, tìm truyện, theo dõi; home có truyện mới, 3 chương gần nhất, top đọc nhiều. | Nhịp cập nhật, taxonomy Việt, chapter recency. | Mật độ link quá dày, hierarchy cũ, quảng bá/metadata lẫn nhau. |
| https://truyenqq.me/ | Cùng domain, Việt Nam | Tách Manga/Manhwa/Manhua, nhiều thể loại, lưới cập nhật và điểm 5 sao. | Shortcuts theo nguồn gốc và chương mới. | Không dùng điểm 0/5 thiếu confidence; không clone layout. |
| https://mihon.app/ và https://mihon.app/docs/guides/getting-started | Reader đa nguồn | Library, tracking, customization, extensions; global search xuyên nguồn và offline/download là luồng cấp một. | Tách Library / Updates / Browse; download rõ trạng thái; reader settings. | Không đem mô hình extension có quyền rộng lên web; không ẩn rủi ro nguồn. |
| https://apps.apple.com/us/app/apple-books/id364709193 | Cross-domain reader | Resume, theme/font/spacing, vertical scroll, reading goals, offline. Review người dùng nhấn mạnh mất file/vị trí đọc là lỗi nghiêm trọng. | Chrome yên tĩnh, resume tức thì, quyền kiểm soát offline, accessibility 200%. | Không dùng skeuomorphism giả; không tự xóa download đã pin. |
| https://www.thestorygraph.com/ | Cross-domain discovery | Tìm theo mood, pace, fiction/genre; recommendation dựa vào preference rõ ràng. | Mood/pace chips và survey tự do; giải thích recommendation. | Không để form preference dài chặn người mới. |
| https://help.netflix.com/en/node/100639 | Cross-domain personalization | History, rating, similarity, metadata và recency; cá nhân hóa cả row và thứ tự; Continue Watching là row riêng. | Home đổi theo “continuation mode” và “discovery mode”; ưu tiên tín hiệu gần đây. | Không dùng endless horizontal rows hoặc autoplay gây nhiễu. |
| https://m3.material.io/components/search/overview và https://m3.material.io/components/chips/overview | Design system | Search/chip có trạng thái, vai trò lọc rõ, keyboard/touch cần nhất quán. | Filter chips có include/exclude rõ bằng biểu tượng + chữ; focus-visible. | Không bê nguyên phong cách Material mặc định. |
| https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation | Chuẩn nền tảng | Service worker, Cache API, background sync/fetch; cache-first và network-first có trade-off. | App-shell offline; chapter cache có manifest và fallback; sync tiến độ khi mạng lại. | Không hứa periodic sync luôn chạy; không coi online flag là tuyệt đối. |
| https://docs.anilist.co/reference/object/media | Dữ liệu đánh giá | Có averageScore, meanScore, popularity, tags, reviews, recommendations và URL nguồn. | Bảng provenance và phân rã score/tag. | Không mass-hoard; không trình bày score như điểm nội bộ. |
| https://www.kavitareader.com/ | Experimental/self-hosted reader | Reader webtoon/single/double, smart collections, metadata, OPDS và đề xuất. | Connector OPDS; “on deck”; mode reader theo format. | Không nhồi mọi khả năng quản trị self-hosted vào UI độc giả. |

## Pattern chung

1. “Đọc tiếp” phải ở trên cùng nếu có lịch sử; discovery đứng đầu khi chưa có dữ liệu.
2. Tìm kiếm tốt cần hai lớp: câu ngắn tự nhiên và bộ lọc sâu nhìn thấy được.
3. Library, Updates, Browse và Downloads là bốn ngữ cảnh khác nhau; không gộp thành một lưới vô tận.
4. Reader tốt giảm chrome, nhớ vị trí chính xác, có nhiều chế độ và trạng thái lỗi/offline rõ.
5. Đánh giá hữu ích hơn khi có số phiếu, nguồn, freshness và câu “vì sao hợp gu”.

## Khoảng trống để khác biệt

- Web đọc truyện Việt thường mạnh ở tốc độ cập nhật nhưng yếu ở provenance, confidence và trải nghiệm offline có quản lý.
- Reader đa nguồn mạnh về công cụ nhưng discovery thường lạnh và khó hiểu với người mới.
- Cơ hội của Mực: kết hợp một “phòng đọc” có cảm xúc với “bàn tra cứu” rất mạnh, đồng thời giải thích AI/điểm số bằng ngôn ngữ bình dân.

## Ba visual grammar

1. **Inkroom Editorial:** warm paper, black ink, vermilion stamp, editorial columns, shelf như zine.
2. **Midnight Panels:** charcoal canvas, covers cinematic, focus vào reader và ảnh.
3. **Index Kiosk:** dense utility, mono metadata, command/search first, lime status.

