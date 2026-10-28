# Component reference (JCAP design system)
Mỗi mục là README gốc của component. Code tham chiếu: `bundle.js` (React, global `window.JCAP`), style: `bundle.css`, kiểu props: `index.d.ts`.

---

# Alert

Thông báo nằm cố định trong trang, dùng cho lỗi tải, cảnh báo hết Credit, banner xem trước, hướng dẫn cấp quyền micro.

- `tone`: `info` | `success` | `warning` | `danger`. Truyền `title`, nội dung là `children`, `action` (nút), `onClose` (nếu đóng được).
- Lỗi luôn có hành động khắc phục, như "Thử lại" hoặc "Nạp thêm Credit".
- Hết Credit trong phòng luyện: đặt `tone="warning"` ngay trên thanh nhập. Hội thoại không bị khoá cho người đọc lại.

---

# AppHeader

Header cố định cao 60px của mọi trang sau đăng nhập, trừ các phòng luyện toàn màn hình.

- Truyền `name`, `level` (học viên), `role` (`learner` | `admin`), `credits`, `onCreditClick`, `avatarUrl`, `onMenu` (chỉ truyền dưới 1024px để hiện nút mở Drawer), `menuItems`.
- Menu avatar mở bằng **bấm**, đóng khi bấm ra ngoài hoặc nhấn Esc. Mặc định có: Hồ sơ cá nhân, Nạp thêm Credit, Lịch sử giao dịch, Đăng xuất.
- Admin hiện nhãn "Quản trị" và không hiện Credit.
- Dưới 640px ẩn tên và cấp, chỉ giữ avatar.
- Logo hiện là chữ "JCAP" giữ chỗ cho tới khi có logo thật.

---

# AudioPlayer

Trình phát âm thanh mini cho câu mẫu, bản ghi của học viên và audio bản xứ.

- `variant`: mặc định là thanh phát có tiến độ (`label`, `duration` tính bằng giây, `progress` 0–1, `speeds` + `speed` + `onSpeed`). `chip` là nút nhỏ "Nghe" / "Nghe lại" trong bong bóng và thẻ nhận xét.
- `playing` + `onToggle` để điều khiển từ ngoài. Component chỉ hiển thị, phần phát thật (HTMLAudio, VOICEVOX) nằm ở phía ứng dụng.
- So sánh "Bản của bạn" với "Mẫu" bằng hai `AudioPlayer` xếp chồng nhau.

---

# Badge

Nhãn trạng thái ngắn, tối đa 3 từ, đặt cạnh tiêu đề hoặc trong bảng.

- `tone`: `neutral` (Nháp, Đã ẩn), `ai` (Đang mở), `success` (Đạt, Thành công, Đang dùng), `warning` (Đang chờ, Còn thiếu), `danger` (Đã khoá, Đã huỷ, Chưa đạt), `info`, `shu` (Quản trị, Dấu son).
- `dot` hoặc `icon` giúp phân biệt mà không phụ thuộc màu.

---

# BottomNav

Thanh điều hướng đáy cho học viên trên điện thoại và máy tính bảng (<1024px). Có đúng 5 mục.

- Truyền `items` (`{id, label, icon, href?}`), `value`, `onChange`.
- Mục cố định: Trang chủ · Hội thoại · Shadowing · Khám phá · Tôi. "Tôi" mở trang Tài khoản (Kết quả, Gói & Credit, Hồ sơ, Cài đặt).
- Thanh tự cộng `safe-area-inset-bottom`. Ẩn trong các phòng luyện và bản đồ toàn màn hình.

---

# Button

Nút hành động. Mỗi khu vực chỉ có tối đa **một** nút `primary` (nền `ai`), dành cho việc chính của màn hình.

- `variant`: `primary` (việc chính: "Bắt đầu hội thoại", "Lưu"), `secondary` (mặc định, việc phụ), `ghost` (hành động nhẹ trong thẻ, link dạng nút), `danger` (Vô hiệu hoá, Huỷ đơn, Đăng xuất: viền đỏ, không tô nền).
- `size`: `sm` 36px, `md` 40px, `lg` 48px (dùng `lg` cho nút chính trên mobile và nút Bắt đầu/Tiếp tục).
- `icon` / `iconRight`: tên icon. `loading` tự khoá nút và hiện vòng quay. `block` để nút giãn hết chiều ngang.
- Nhãn bắt đầu bằng động từ, viết hoa chữ đầu câu: "Nạp thêm Credit", không viết "Nạp Thêm Credit".
- Nút có tốn Credit thì ghi chi phí ngay trên nhãn: "Bắt đầu · 5 Credit".

---

# Card

Khung chứa nội dung trên nền giấy, là khối dựng chính của trang chủ, trang chi tiết và trang admin.

- Truyền `title`, `subtitle`, `eyebrow`, `actions` (nút góc phải), `children`. `onClick` biến cả thẻ thành nút. `padding="none"` dùng cho thẻ chứa bảng hoặc ảnh tràn viền.
- `tone`: mặc định giấy, `sunken` (khu chìm như cheat sheet), `ai` (thẻ nổi bật duy nhất trên trang chủ, VD "Tiếp tục học"), `sora` (mảng trời hoàng hôn: lời chào, chúc mừng, câu mỗi ngày), `nami` (khu nghe mẫu, thẻ Shadowing).
- Tối đa một thẻ `ai` và một thẻ `sora` trên mỗi màn hình.

---

# ChatBubble

Bong bóng hội thoại trong phòng Hội thoại AI và danh sách câu thoại Shadowing.

- `from`: `ai` (nền giấy, avatar nhân vật bên trái) hoặc `me` (nền `ai`, bên phải). Truyền `name`, `jp` (cú pháp của `JpText`), `vi`, `romaji`, `showFurigana`, `showTranslation` (bỏ trống thì bong bóng có nút "Dịch" riêng), `onPlay` (truyền `null` để ẩn nút nghe).
- Bong bóng `me` có `onSelect` sẽ thành nút. Bấm vào để mở đánh giá câu đó trong panel Đánh giá, câu đang xem có `selected`. `score` hiện điểm kèm icon.
- `status`: `sending` hoặc `error` (kèm `onRetry`).
- Cột hội thoại rộng tối đa `reading-max`, giữa các bong bóng cách `space-4`.

---

# CreditBadge

Hiển thị **Credit**: số dư (`variant="balance"`) hoặc chi phí (`variant="cost"`). Luôn có hình đồng xu `toll` và chữ "Credit", không gọi là xu hay điểm.

- Truyền `amount`, `variant`, `size` (`sm` | `md` | `lg`).
- Có `onClick` thì huy hiệu thành nút. Trên header, bấm vào sẽ mở trang Gói & Credit.
- `low` thêm viền cảnh báo khi số dư không đủ cho phiên kế tiếp.
- `size="lg"` dùng cho ví Credit nạp thêm trên trang Gói & Credit và màn kết quả thanh toán.

---

# Directions

Trang trình diễn 6 direction theo use case. Mỗi direction là một giá trị `data-theme` đặt ở phần tử gốc của khu vực đó. Mọi component dùng chung tên token nên tự đổi giao diện theo direction.

- `hoc-tap`: mặc định cho mọi trang học viên, Gói & Credit, thanh toán.
- `phong-luyen`: phòng Hội thoại AI và phòng Shadowing.
- `kham-pha`: bản đồ và các thẻ của Khám phá.
- `quan-tri`: toàn bộ `/admin`.
- `hoc-tap-dem`: chế độ tối của `hoc-tap`.
- `phong-luyen-dem`: chế độ tối của `phong-luyen`.

Đây không phải component để import. Đây là ví dụ tham chiếu cho bố cục và cách đặt `data-theme`.

---

# Drawer

Panel trượt vào từ cạnh màn hình. Dùng cho panel Đánh giá / Nhiệm vụ của phòng luyện khi không đủ chỗ, menu admin trên mobile, form bài Shadowing.

- Truyền `side` (`right` | `left` | `bottom`), `title`, `children`, `footer`, `onClose`, `width`. `inline` chỉ dùng cho bản xem trước.
- Dưới 1024px, panel Nhiệm vụ và Đánh giá của phòng Hội thoại AI dùng `side="bottom"`, cao tối đa 85% màn hình, có thanh kéo.

---

# EmptyState

Trạng thái rỗng, luôn kèm hành động tiếp theo.

- Truyền `icon`, `title`, `children` (một câu giải thích), `action` (nút primary), `secondaryAction`, `compact` (dùng trong tab và panel).
- Mỗi tab Shadowing có nội dung rỗng riêng. Không dùng chung một câu "Không có dữ liệu".

---

# FeedbackItem

Một mục nhận xét trong panel Đánh giá lượt nói và trang chi tiết kết quả.

- `tone`: `success` (Làm tốt), `warning` (Nên chỉnh), `error` (Cần sửa), `tip` (Mẹo văn hoá). Truyền `title`, `children`, `suggestion` (`{jp, vi}`: cách nói tự nhiên hơn), `onPlay`, `onCopy`.
- Thứ tự trong panel: Nhận xét chung → Ngữ pháp & trợ từ → Dùng từ & độ tự nhiên → Sắc thái & kính ngữ → Cách diễn đạt tự nhiên hơn → Mẹo văn hoá. Trong mỗi nhóm, mục `success` luôn đứng trước.

---

# Icon

Biểu tượng duy nhất của JCAP, dùng Material Symbols Rounded qua tên ligature. Nó thay toàn bộ emoji và SVG tự vẽ.

- Truyền `name` (tên icon Material Symbols, VD `mic`, `toll`, `translate`), `size` (mặc định 20) và `fill` (dùng cho trạng thái đang chọn).
- Icon trang trí tự đặt `aria-hidden`. Icon mang nghĩa mà đứng một mình thì truyền `label`.
- Màu kế thừa từ `color` của phần tử cha. Không tự gán màu hex.
- Bảng ánh xạ ý nghĩa sang icon nằm trong README chính, mục Biểu tượng.

---

# IconButton

Nút chỉ có icon, vùng bấm luôn từ 44px trở lên. Bắt buộc truyền `label`, vì nó vừa là `aria-label` vừa là tooltip.

- `variant`: `ghost` (mặc định, trên thanh công cụ), `secondary` (có viền), `primary` (nền `ai`, như nút Gửi).
- `active` biến nút thành nút bật/tắt (`aria-pressed`), dùng cho bật/tắt Furigana, Dịch, bookmark.
- `size="sm"` cho nút trong thẻ và bảng.

---

# JlptBadge

Huy hiệu cấp JLPT, mỗi cấp một màu cố định: N5 lá non, N4 asagi, N3 fuji.

- Truyền `level` (`N5` | `N4` | `N3`) và `size` (`sm` | `md` | `lg`).
- Chỉ dùng cho cấp JLPT. Không mượn màu này cho trạng thái khác.

---

# JpText

Chữ tiếng Nhật có furigana bằng `<ruby>`, tự đặt `lang="ja"` và font Noto Sans JP.

- Truyền `text` theo cú pháp `{漢字|かんじ}`: phần trong ngoặc nhọn là Kanji kèm cách đọc, phần ngoài là chữ thường. VD `{駅|えき}はどこですか`.
- `furigana={false}` ẩn cách đọc nhưng vẫn giữ chỗ, nên dòng không bị nhảy. `size` là `lg` | `md` | `sm`. `romaji` hiện dòng romaji bên dưới. `as` chọn thẻ bao.

---

# Logo

Logo thật của JCAP là cổng torii đặt trong bong bóng thoại, xà kasagi màu vàng. Logo luôn giữ nguyên màu gốc. Màu của logo không phải màu giao diện.

- `variant="mark"` (mặc định) gồm mark và tên "JCAP" bằng chữ thường, dùng trên header. `withName={false}` để chỉ còn mark (favicon, avatar ứng dụng, bottom sheet).
- `variant="lockup"` là bản ngang có khẩu hiệu 千里の道も一言から. Dùng ở màn đăng nhập/đăng ký, màn hoàn thành và footer, cao tối thiểu 64px.
- `size`: chiều cao mark tính bằng px. Header dùng 32. Mark tối thiểu 24px, lockup tối thiểu 64px. Khoảng trống quanh logo ít nhất bằng 1/4 chiều cao.
- `src`: trong ứng dụng, truyền đường dẫn asset của dự án (VD `/brand/jcap-mark.svg`). Mặc định trỏ tới file đã tải lên hệ thống này.
- Ở direction tối (`hoc-tap-dem`, `phong-luyen-dem`), logo tự nằm trên tấm `logo-plate` màu giấy kem. Không đổi màu, không tô trắng, không đặt logo trực tiếp lên nền tối.
- Không kéo giãn, không xoay, không thêm bóng, không đặt lên ảnh có nhiều chi tiết.

---

# MicButton

Nút micro, trung tâm của mọi phòng luyện. Trạng thái của nó phải **cực rõ**: luôn có nhãn chữ, đổi màu và đổi icon theo trạng thái.

- `state`: `idle` (Bấm để nói), `permission` (đang xin quyền), `recording` (nền `shu`, sóng lan theo `level` 0–1), `analyzing` (đang phân tích), `denied` (chưa cấp quyền: bấm để mở hướng dẫn), `unsupported` (trình duyệt không hỗ trợ: khoá nút), `disabled`.
- Truyền `level` (âm lượng 0–1 từ Web Audio), `onClick`, `label` (ghi đè nhãn), `hint` (dòng phụ, VD "Chỉ hỗ trợ Chrome/Edge"), `size` (`lg` 72px | `md` 56px), `hideLabel`.
- Khi `denied` hoặc `unsupported`, đặt kèm `Alert` hướng dẫn và vẫn cho phép gõ phím.

---

# Modal

Hộp thoại xác nhận hoặc nhập nhanh, chặn tương tác phía sau. Dưới 640px tự chuyển thành bottom sheet, nút xếp dọc và giãn hết chiều ngang.

- Truyền `title`, `children`, `footer` (nút; nút chính đặt phải, nút huỷ đặt trái), `onClose` (Esc và bấm ra ngoài), `icon` cùng `tone` (`ai` | `warning` | `danger` | `success`), `size` (`sm` | `md` | `lg`). `inline` chỉ dùng cho bản xem trước.
- Hộp xác nhận phải nêu rõ hệ quả và con số: "Tiến trình N5 hiện tại (2/4 nhiệm vụ) sẽ bị huỷ. Bắt đầu N4 tốn 8 Credit."
- Nút xác nhận ghi đúng hành động ("Chuyển sang N4"), không ghi "OK".

---

# ProgressBar

Thanh tiến độ tuyến tính, dùng cho tiến độ bài, nhiệm vụ và chương.

- Truyền `value`, `max` (mặc định 100), `label`, `showValue` (hiện %), `tone` (`ai` | `success` | `warning` | `danger` | `shu` | `credit`), `size` (`sm` | `md` | `lg`).
- Hạn mức Credit dùng `QuotaMeter`, không dùng `ProgressBar`.

---

# QuotaMeter

Thanh đo hạn mức AI (5 giờ, tuần) hoặc ví Credit nạp thêm, theo mô hình "hai thanh đo cộng một ví" trong README chính.

- Truyền `label`, `used`, `total`, `resetIn` (VD "2 giờ 15 phút"), `tone` (`5h` | `week` | `wallet`), `icon`.
- Từ 80% trở lên thì số còn lại chuyển `warning`, đạt 100% thì hiện "Đã hết" màu `danger`.
- Luôn xếp theo thứ tự trừ: 5 giờ → tuần → ví Credit, kèm công tắc "Tự động dùng Credit nạp thêm".

---

# ScenarioCard

Thẻ một kịch bản Hội thoại AI trong thư viện.

- Truyền `code`, `title`, `description`, `levels` (cấp đang mở), `cost` (Credit của cấp đang lọc), `thumbnail` (URL; bỏ trống thì hiện hoạ tiết seigaiha), `status` (`open` | `draft`), `progress` (`{done, total}` khi có phiên dở), `onClick`.
- Mô tả cắt ở 2 dòng. Lưới thẻ là 1 cột trên điện thoại, 2 cột trên máy tính bảng, 3 cột trên desktop.

---

# ScoreRing

Vòng điểm 0–100 cho kết quả Shadowing, Hội thoại AI và điểm thành phần.

- Truyền `value`, `size` (mặc định 96), `label`, `showVerdict` (hiện "Khớp tốt / Khớp một phần / Chưa khớp" kèm icon), `tone` (ghi đè ngưỡng mặc định ≥80 / 50–79 / <50).
- Tổng điểm trên màn hoàn thành dùng size 160. Ba điểm thành phần (Ngữ pháp & cấu trúc, Vốn từ vựng, Kính ngữ & văn phong) dùng size 72.

---

# SegmentedControl

Nhóm 2 đến 5 lựa chọn loại trừ nhau, hiển thị cùng lúc.

- Truyền `options` (`{value, label, icon?, count?, disabled?}`), `value` / `defaultValue`, `onChange`, `ariaLabel`. `block` để giãn hết chiều ngang (dùng trên mobile).
- Dùng cho bộ lọc trình độ (Tất cả / N5 / N4 / N3), bộ chọn cấp độ trên trang chi tiết kịch bản, chọn Vai A / Vai B.
- Cấp chưa mở thì đặt `disabled` và giải thích ở chỗ khác. Không ẩn cấp đó đi.

---

# Select

Danh sách chọn dùng `<select>` gốc, để trên điện thoại hiện bộ chọn của hệ điều hành.

- Truyền `label`, `options` (mảng chuỗi hoặc `{value, label}`), `value` / `defaultValue`, `onChange`, `placeholder`, `hint`, `error`.
- Dùng cho danh sách từ 5 lựa chọn trở lên (giáo trình, kịch bản cha, giọng đọc). Từ 2 đến 4 lựa chọn thì dùng `SegmentedControl`.

---

# ShadowingCard

Thẻ một bài Shadowing trong thư viện.

- Truyền `title`, `topic`, `textbook`, `level`, `sentences`, `minutes`, `progress` (`{done, total}`), `bestScore`, `bookmarked`, `onBookmark`, `onStart`.
- Nút tự đổi nhãn: "Bắt đầu" (chưa học), "Tiếp tục" (đang dở, dạng primary), "Luyện lại" (đã xong).

---

# SideNav

Sidebar desktop (≥1024px), rộng 240px. Dưới 1024px, học viên dùng `BottomNav`, còn admin đặt `SideNav` bên trong `Drawer`.

- Truyền `sections` (`{title?, items:[{id, label, icon, badge?, href?}]}`), `value` (id mục đang mở), `onChange`.
- Thứ tự học viên: Trang chủ · Hội thoại AI · Shadowing · Khám phá · Kết quả, rồi nhóm Tài khoản. Admin dùng `title` cho từng nhóm.
- Mục đang chọn có nền `ai-soft` và icon tô đặc. Không để mục dẫn tới trang chưa có.

---

# Skeleton

Khung giữ chỗ khi đang tải, có cùng hình dạng với nội dung thật. Không dùng spinner toàn trang.

- `variant`: `text` (cùng `lines`, `width`), `card` (thẻ trong lưới), `bubble` (tin nhắn AI đang soạn).
- Lưới thẻ đang tải hiện đúng số cột của lưới thật, mỗi cột 1 đến 2 thẻ.
- Tắt hiệu ứng ánh sáng khi `prefers-reduced-motion`.

---

# Stepper

Chuỗi bước có thứ tự: các bước luyện ở một mốc (Hiểu → Shadowing → Kiểm tra → Hội thoại AI), form admin dài chia bước, tiến độ nhiệm vụ.

- Truyền `steps` (`{label, description?, status, tag?}`) với `status` là `done` | `current` | `todo` | `locked` | `error`, và `orientation` (`horizontal` | `vertical`).
- Bước "Sắp có" thì đặt `status="locked"` cùng `tag="Sắp có"`.
- Trên mobile dùng `vertical`.

---

# Switch

Công tắc bật/tắt có hiệu lực ngay lập tức, không cần nút Lưu.

- Truyền `label`, `description` (giải thích hệ quả), `checked` + `onChange` (khi điều khiển từ ngoài) hoặc `defaultChecked`.
- Dùng cho: Dịch nghĩa, Furigana, Tự động phát giọng AI, "Tự động dùng Credit nạp thêm khi hết hạn mức 5 giờ".
- Khi đang bật, nút gạt hiện dấu check để không phải phân biệt chỉ bằng màu.

---

# Table

Bảng dữ liệu cho admin, lịch sử giao dịch và lịch sử luyện tập.

- Truyền `columns` (`{key, label, align?, width?, render?}`), `rows`, `loading` (hiện skeleton theo cột), `empty` (nội dung khi rỗng), `stickyFirst` (cố định cột đầu khi cuộn ngang trên mobile), `caption` (cho trình đọc màn hình).
- Số và tiền thì `align: 'right'`. Biến động Credit có dấu ± và màu: cộng là `success`, trừ là `sumi`.
- Thao tác trong hàng dùng `IconButton size="sm"` hoặc `Button size="sm" variant="ghost"`.

---

# Tabs

Chuyển giữa các nhóm nội dung cùng cấp trong một trang, như thư viện Shadowing hay các tab admin.

- Truyền `items` (`{id, label, icon?, count?}`), `value` / `defaultValue`, `onChange`, `ariaLabel`.
- Trên mobile thanh tab cuộn ngang, không xuống dòng.
- `count` hiện số lượng (VD: Đã lưu 4) và không được thay cho trạng thái rỗng.

---

# TextField

Ô nhập có nhãn, gợi ý và lỗi. Nhãn luôn đặt phía trên ô, không dùng placeholder thay cho nhãn.

- Truyền `label`, `hint`, `error` (thay thế hint, tô nền `danger-soft`), `required` (hiện dấu *), `icon` (icon đầu ô), `type`.
- `type="password"` tự có nút ẩn/hiện. `multiline` cùng `rows` cho ô soạn nội dung dài (admin).
- Lỗi phải nói cách sửa: "Số điện thoại gồm 10 số, bắt đầu bằng 0."
- Ô nhập câu tiếng Nhật trong phòng luyện thêm `lang="ja"`.

---

# Toast

Thông báo nổi ngắn sau một hành động, tự ẩn sau 4 giây (lỗi thì giữ đến khi người dùng đóng).

- `tone`: `success` | `info` | `warning` | `danger`. Truyền `title`, `children` (một câu), `action` (nút ghost nhỏ, VD "Hoàn tác"), `onClose`.
- Vị trí: desktop ở góc dưới phải, cách mép `space-6`. Mobile ở giữa phía trên bottom nav hoặc thanh nhập. Bên ngoài bọc bằng vùng `aria-live`.
- Không dùng Toast cho lỗi chặn luồng. Trường hợp đó dùng `Alert`.

---

# WordDiff

So sánh câu học viên nói với câu mẫu theo từng từ hoặc mora, dùng trong thẻ kết quả Shadowing. Cách trình bày này giúp người mới thấy lỗi bằng mắt thay vì phải đọc nhãn chữ.

- Truyền `tokens` (`{text, reading?, status, error?, expected?}`) và `showLegend`.
- `status`: `ok` (nền `score-good-soft`), `wrong` (viền đỏ + gạch sóng + "Đúng: …"), `missing` (khung đứt nét màu `score-mid`, hiện chữ cần nói), `extra` (gạch ngang).
- `error` chọn nhãn lỗi: `chouon` Trường âm, `sokuon` Âm ngắt っ, `hatsuon` Âm mũi ん, `dakuon` Hữu thanh ゛, `mora` Số mora, `particle` Trợ từ, `word` Sai từ, `extra` Thừa âm.
- Mỗi trạng thái đều có icon và chữ riêng, nên người mù màu vẫn đọc được.
