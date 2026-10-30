Giao diện luyện nói tiếng Nhật cho người Việt. Bảng màu lấy từ tranh *Sóng lừng ngoài khơi Kanagawa* của Hokusai, đẩy sáng như buổi sớm mai trên biển: **lam Phổ** tươi của con sóng, **sương sớm** gần trắng làm nền, **trời bình minh** màu đào cho những khoảnh khắc khích lệ, **bọt sóng** lam ngọc cho khu nghe. Hệ thống có 6 **direction**, mỗi direction phục vụ một use case và dùng chung một bộ tên token. Các direction sáng là mặc định, direction tối chỉ là lựa chọn. Tinh thần chung là thân thiện, khích lệ, có chất Nhật nhưng không sến. Mọi quyết định đều ưu tiên khu **nói và nghe**.

> 千里の道も一言から: Đường ngàn dặm cũng bắt đầu từ một câu nói.

## Direction theo use case

Mỗi khu vực của sản phẩm đặt **một** `data-theme` ở phần tử gốc của route. Component không cần biết mình đang ở đâu, vì cùng một tên token (`--ai`, `--paper-100`…) sẽ nhận giá trị khác theo direction.

| Direction | `data-theme` | Dùng cho | Cảm giác | Quy tắc riêng |
|---|---|---|---|---|
| Học tập · Sớm mai | `hoc-tap` (mặc định) | Trang chủ, thư viện kịch bản và Shadowing, kết quả, hồ sơ, cài đặt, Gói & Credit, thanh toán | Sáng, thoáng, tươi, khích lệ | Mỗi màn hình được một mảng `sora` (lời chào, chúc mừng) và một thẻ `ai` (việc nên làm tiếp) |
| Phòng luyện · Sóng sớm | `phong-luyen` | Phòng Hội thoại AI, phòng luyện Shadowing, màn hoàn thành bài | Sáng, mát, tĩnh, tập trung | Nền lam ngọc nhạt như bọt sóng để tách khỏi Học tập mà vẫn sáng. Không có `sora` và hoạ tiết. `shu` chỉ xuất hiện khi micro đang thu |
| Phòng luyện · Sóng đêm | `phong-luyen-dem` | Phòng luyện khi người dùng bật chế độ tối | Tối, tĩnh | Cùng quy tắc với Sóng sớm |
| Khám phá · Mộc bản | `kham-pha` | Bản đồ 47 tỉnh, thẻ mốc, sổ con dấu, lộ trình chương | Tranh khắc gỗ, giàu màu | Giữ đúng 4 màu của thiết kế Khám phá hiện có. `shu` là màu dấu son. Màu riêng từng vùng do bản đồ tự quản lý |
| Quản trị · Trời trong | `quan-tri` | Toàn bộ `/admin` | Trung tính, sáng, dày thông tin | Không có `sora`, hoạ tiết hay hero. Bảng và form là nội dung chính. Màu chính vẫn là lam Phổ |
| Học tập · Đêm | `hoc-tap-dem` | Chế độ tối của Học tập | Mực đêm trung tính | Cấu trúc giống `hoc-tap`. Nền mực trung tính để không lẫn với Sóng đêm |

- Chuyển từ Học tập vào phòng luyện là chuyển direction (`hoc-tap` → `phong-luyen`, hoặc `hoc-tap-dem` → `phong-luyen-dem` khi bật chế độ tối). Nền chuyển từ trắng sương sang lam ngọc nhạt, đó chính là tín hiệu "vào phòng tập".
- Thanh toán dùng `hoc-tap`, kèm thêm quy tắc bố cục: số tiền và số Credit dùng `numeral`, mỗi màn chỉ có một nút chính, không có hoạ tiết.
- Admin bấm "Xem như học viên" thì trang mở bằng direction của học viên, kèm `Alert` tone info "Chế độ xem trước".
- Không trộn hai direction trên cùng một màn hình, trừ preview và Modal xem trước cho admin.

## Nguyên tắc

1. **Nói trước, đọc sau.** Trong phòng luyện, micro và câu đang luyện luôn là thứ to nhất và rõ nhất. Panel nhiệm vụ và panel đánh giá là phụ: thu gọn được, và trên mobile chuyển thành `Drawer`.
2. **Mỗi khu vực tối đa một điểm son.** `shu` chỉ dùng cho micro đang thu, con dấu, dấu chấm logo và streak. Hành động chính dùng `ai`.
3. **Trạng thái không bao giờ chỉ bằng màu.** Điểm, lỗi, thành công đều đi kèm icon và chữ (`Khớp tốt`, `Khớp một phần`, `Chưa khớp`).
4. **Khích lệ, không phán xét.** Nhận xét bắt đầu bằng điều làm tốt, sau đó mới đến điều cần sửa và câu nói tự nhiên hơn.
5. **Chạm được trên điện thoại.** Mọi vùng bấm tối thiểu `touch-target` (44px). Không có tương tác nào chỉ chạy bằng hover.

## Giọng văn và chữ trên giao diện

- Toàn bộ chữ giao diện là **tiếng Việt**, viết **hoa chữ đầu câu** (sentence case): "Lịch sử giao dịch", "Mua ngay", "Bắt đầu hội thoại". Không viết "Lịch Sử Giao Dịch Credit" hay "MUA NGAY". Ngoại lệ duy nhất là tiêu đề nhóm menu admin dùng style `overline` (viết hoa bằng CSS).
- Xưng **"bạn"** với học viên. Câu ngắn, động từ đứng đầu nút: "Tiếp tục học", "Nạp thêm Credit", "Thu lại".
- Nội dung học là **tiếng Nhật** (Kanji + furigana `<ruby>` + romaji khi cần). Nghĩa tiếng Việt đặt ngay dưới, dùng `sumi-muted`.
- Không dùng emoji trên giao diện (bỏ 🪙 🚪 ⚙️ 🎙️, 💡). Dùng icon từ bộ duy nhất ở phần Biểu tượng.
- Thuật ngữ bắt buộc:

| Dùng | Không dùng |
|---|---|
| Credit, Gói Credit | token, coin, xu, điểm |
| Hội thoại AI, Phiên hội thoại | chat bot, chat |
| Bài Shadowing, Buổi luyện Shadowing | bài nghe, record |
| Kịch bản | scenario, bài học (cho tình huống hội thoại) |
| Mốc, Chương, Con dấu / Dấu son | điểm, level, huy chương |
| Vô hiệu hoá, Ẩn | Xoá vĩnh viễn (dữ liệu luôn xoá mềm) |

- Lỗi nói rõ chuyện gì xảy ra và cách sửa: "Chưa có quyền dùng micro. Bấm biểu tượng ổ khoá trên thanh địa chỉ để cho phép." Không viết "Đã xảy ra lỗi".
- Trạng thái rỗng mời hành động: "Bạn chưa lưu bài nào. Bấm biểu tượng dấu trang trên thẻ bài để lưu lại."

## Màu

Bảng dưới đây là **vai trò** của từng token. Giá trị cụ thể của token thay đổi theo direction.

- **Màu của logo (lam đậm, vàng kasagi) chỉ thuộc về logo.** Không dùng làm màu nút, nền hay chữ. Lam của giao diện là lam Phổ của sóng (`ai`), không phải lam của logo.
- Nền trang luôn là `paper-100`. Thẻ, modal, ô nhập và bong bóng AI dùng `paper-50`. Khu chìm (cheat sheet, đầu bảng, thanh tab, nền thanh đo) dùng `paper-200`. Hover hàng và mục điều hướng dùng `paper-300`.
- Chữ chính là `sumi`, chữ phụ là `sumi-muted`. `sumi-faint` chỉ dùng cho icon trang trí, không bao giờ cho chữ.
- Viền thẻ dùng `line`. Viền của điều khiển (ô nhập, Switch tắt, Checkbox) dùng `line-strong` để đạt 3:1.
- Hành động chính, link, tab và mục điều hướng đang chọn dùng `ai`, chữ trên nền `ai` là `on-ai`. Nền chọn nhạt dùng `ai-soft`. Bong bóng của người học là nền `ai` với chữ `on-ai`.
- Trạng thái: `success`, `warning`, `danger`, `info`. Mỗi màu có bản `*-soft` làm nền Alert, Toast, Badge. Chữ đặt trên `*-soft` là chính màu đậm tương ứng.
- Điểm phát âm: `score-good` (≥80), `score-mid` (50–79), `score-low` (<50), mỗi màu có bản `*-soft`. Cặp tốt/kém tách theo trục lam ↔ đỏ, không phải xanh lá ↔ đỏ, và luôn có icon `check_circle` / `change_history` / `cancel` đi kèm.
- Cấp JLPT: `n5` (lá non 若葉, người mới), `n4` (asagi 浅葱), `n3` (fuji 藤), chữ đậm trên nền `n*-soft`. Không dùng màu JLPT cho việc gì khác.
- Credit: chữ và số dùng `credit` trên `credit-soft`. `credit-coin` chỉ dùng cho hình đồng xu và phần đã dùng của ví Credit nạp thêm.
- Hạn mức: thanh 5 giờ dùng `quota-5h`, thanh tuần dùng `quota-week`. Hai màu khác nhau về độ sáng để phân biệt được khi in đen trắng.
- `sora` (trời bình minh) là mảng nhấn ấm cho lời chào, chúc mừng và câu mỗi ngày, chữ trên nó là `on-sora`. `sora-soft` dùng cho thẻ gợi ý. Không dùng ở Phòng luyện. Ở Quản trị chỉ dùng `sora-soft` cho banner thông báo.
- `nami` (lam sóng nhạt) dùng cho dữ liệu phụ, khu nghe mẫu và thẻ Shadowing (`nami-soft`).
- Lớp phủ sau Modal/Drawer dùng `scrim`.
- Ở direction tối (`hoc-tap-dem`, `phong-luyen-dem`), các màu nhấn sáng lên. Chữ trên nền `ai` hoặc `shu` luôn là `on-ai` / `on-shu`, không viết cứng `#fff`. Logo đặt trên `logo-plate`.
- **Focus bàn phím:** `outline: 2px solid var(--focus); outline-offset: 2px` trên mọi phần tử tương tác (chỉ khi `:focus-visible`). Đạt 3:1 trên mọi nền paper và `ai-soft`.

## Chữ

- Giao diện dùng **Be Vietnam Pro** (`--font-sans`), một font vẽ riêng cho tiếng Việt nên dấu chồng như Ấ, Ộ, Ữ không bị cắt. Chữ Nhật dùng **Noto Sans JP** (`--font-jp`). Tiêu đề trang trí tiếng Nhật, khẩu hiệu và con dấu dùng **Noto Serif JP** (`--font-mincho`), cùng font với khẩu hiệu trong lockup logo. Cả ba nạp từ Google Fonts.
- Bất cứ phần tử nào chứa tiếng Nhật đều phải đặt `lang="ja"` và `font-family: var(--font-jp)`, để trình duyệt chọn đúng nét chữ Hán Nhật thay vì Hán Trung.
- Thang chữ giao diện: `display` → `title-1` → `title-2` → `title-3` → `body` / `body-strong` → `body-sm` → `label` → `caption`. Chữ thân không nhỏ hơn 13px, nhãn không nhỏ hơn 12px. Chữ có dấu cần line-height ≥ 1.5, vì vậy không tự ý giảm line-height.
- Thang chữ Nhật: `jp-lg` (câu đang luyện), `jp-md` (bong bóng hội thoại), `jp-sm` (bảng từ vựng). Line-height đã chừa sẵn chỗ cho furigana.
- **Furigana:** `<ruby>漢字<rt>かんじ</rt></ruby>`. `rt` cỡ 0.5em (tối thiểu 10px), màu `sumi-muted` (trên bong bóng `ai` thì là `on-ai` với độ mờ 0.85), `ruby-position: over`. Công tắc "Furigana" ẩn `rt` bằng `visibility: hidden` chứ không dùng `display: none`, để dòng chữ không nhảy.
- `romaji` không in nghiêng, màu `sumi-muted`, đặt dưới câu Nhật.
- Số (điểm, Credit, giá) dùng `font-variant-numeric: tabular-nums`. Điểm lớn dùng `numeral`.
- `jp-display` (mincho) chỉ dùng trang trí, như phụ đề 会話の旅 dưới "Hành trình Kaiwa" hoặc chữ trong con dấu. Không dùng cho nội dung học.

## Khoảng cách, bo góc, đổ bóng

- Lưới 4px: `space-1` … `space-12`. Lề màn hình điện thoại là `space-4`, desktop là `space-6`. Khoảng giữa các khối trong một trang là `space-6`, giữa các section lớn là `space-8`.
- Bo góc: `radius-sm` cho huy hiệu và chip, `radius-md` cho nút và ô nhập, `radius-lg` cho thẻ và bong bóng, `radius-xl` cho modal và bottom sheet, `radius-full` cho micro, avatar và Switch.
- Phân lớp bằng **viền trước, bóng sau**. Thẻ dùng viền `line` cộng `shadow-sm`. Popover và menu dùng `shadow-md`. Modal, Drawer, Toast dùng `shadow-lg`. Không đổ bóng màu.
- Không dùng gradient. Hoạ tiết Nhật duy nhất được phép là **seigaiha (sóng)** trong ảnh giữ chỗ của thẻ kịch bản, vẽ bằng `ai` trên `ai-soft`.

## Chuyển động

- Thời lượng 120ms (hover, nhấn), 200ms (mở panel, Toast), 280ms (Modal, Drawer), easing `cubic-bezier(.2,.7,.2,1)`.
- Micro đang thu có vòng sóng lan ra theo mức âm lượng. Đây là chuyển động lặp duy nhất trong app.
- Tôn trọng `prefers-reduced-motion: reduce`: tắt vòng sóng (thay bằng viền dày theo mức âm) và tắt mọi trượt.

## Biểu tượng

- Một bộ duy nhất: **Material Symbols Rounded** (Google Fonts), dùng qua component `Icon`. Nét 400, `FILL 0`. Trạng thái đang chọn dùng `FILL 1` (VD: mục điều hướng đang chọn, bookmark đã lưu).
- Cỡ 20px trong nút và ô nhập, 24px trong điều hướng, 18px trong huy hiệu.
- Icon mang nghĩa đạt 3:1 với nền. Icon đứng một mình (`IconButton`) bắt buộc có `aria-label`.
- Bảng ánh xạ thay emoji cũ:

| Ý nghĩa | Icon |
|---|---|
| Credit | `toll` |
| Micro / đang thu / bị chặn | `mic` / `graphic_eq` / `mic_off` |
| Gợi ý | `lightbulb` |
| Cài đặt | `tune` (trong phòng luyện), `settings` (trang) |
| Rời phòng | `logout` (đăng xuất), `arrow_back` (rời phòng luyện) |
| Nghe | `volume_up`, nghe chậm `slow_motion_video` |
| Dịch | `translate` |
| Furigana | `match_case` |
| Hội thoại AI | `forum` |
| Shadowing | `record_voice_over` |
| Khám phá | `map` |
| Kết quả | `insights` |
| Nhiệm vụ | `task_alt` |
| Con dấu | `approval` |

## Logo

- Logo là cổng torii đặt trong bong bóng thoại (nhóm tài sản **Logo**): `jcap-2-torii-icon.svg` (mark) và `jcap-lockup-torii.svg` (lockup ngang có khẩu hiệu). Luôn dùng qua component `Logo`.
- Header dùng mark 32px cùng tên "JCAP". Màn đăng nhập/đăng ký và màn hoàn thành dùng lockup, cao tối thiểu 64px. Mark tối thiểu 24px.
- Logo giữ nguyên màu gốc ở mọi direction. Ở direction tối, logo nằm trên tấm `logo-plate`. Không tô lại màu, không kéo giãn, không đổ bóng.
- Màu của logo không bao giờ trở thành màu giao diện (xem mục Màu).

## Điều hướng

**Học viên.** Sắp xếp theo 3 trải nghiệm chính, sau đó đến tài khoản. Bỏ hẳn "Lịch học" và "Trợ giúp" cho tới khi có trang.

| Desktop (`SideNav`, ≥1024px) | Mobile (`BottomNav`, <1024px) |
|---|---|
| Trang chủ | Trang chủ |
| Hội thoại AI (thay cho "Học tập") | Hội thoại |
| Shadowing | Shadowing |
| Khám phá | Khám phá |
| Kết quả | Tôi (mở trang Tài khoản: Kết quả, Gói & Credit, Hồ sơ, Cài đặt) |
| — nhóm TÀI KHOẢN: Gói & Credit, Hồ sơ, Cài đặt | |

- `AppHeader`: logo, `CreditBadge` (bấm để sang trang Gói & Credit), nhãn cấp JLPT, avatar. Menu avatar mở bằng **bấm** (không hover), đóng khi bấm ra ngoài hoặc nhấn Esc. Ẩn chuông thông báo cho tới khi có chức năng.
- Phòng Hội thoại AI, phòng Shadowing và bản đồ chạy **toàn màn hình**, không có sidebar hay bottom nav. Góc trái có nút quay lại `arrow_back` kèm chữ ("Rời phòng").

**Admin.** `SideNav` có nhóm tiêu đề (`overline`) TỔNG QUAN · QUẢN LÝ NỘI DUNG · HỆ THỐNG & NGƯỜI DÙNG. Dưới 1024px, sidebar chuyển thành `Drawer` mở bằng nút `menu` trên header. Các mục chưa làm thì ẩn, không để link chết.

## Bố cục và responsive

- Hỗ trợ từ **360px**. Mốc bố cục: `bp-md` 768px, `bp-lg` 1024px, `bp-xl` 1280px.
- Trang thường: nội dung rộng tối đa `content-max`. Lưới thẻ 1 cột (<768), 2 cột (768–1279), 3 cột (≥1280).
- **Phòng Hội thoại AI**: ≥1280px có 3 cột (Nhiệm vụ 280px | hội thoại tối đa `reading-max` | Đánh giá 360px). Từ 1024–1279px panel Đánh giá thành `Drawer` phải. Dưới 1024px chỉ còn cột hội thoại, Nhiệm vụ và Đánh giá mở thành bottom sheet từ thanh trên. Thanh nhập cố định ở đáy với `MicButton` ở giữa.
- **Phòng Shadowing**: một cột, câu đang luyện ở giữa màn hình, thanh ghi âm cố định đáy. Kết quả từng câu trượt lên dưới câu đó.
- Bảng admin trên mobile thì cuộn ngang trong khung, cột đầu cố định. Form dài chia bằng `Stepper` hoặc `Tabs`, kèm thanh lưu cố định đáy ("Lưu nháp" / "Xuất bản").

## Trạng thái

Mọi màn hình đều thiết kế đủ 4 trạng thái: **đang tải** (`Skeleton` đúng hình nội dung, không dùng spinner toàn trang), **rỗng** (`EmptyState` có hành động), **lỗi** (`Alert` tone danger có nút "Thử lại"), **thành công** (`Toast` tone success, tự ẩn sau 4 giây).

Phòng luyện có thêm các trạng thái micro của `MicButton`: `idle` → `permission` (đang xin quyền) → `recording` → `analyzing`. Hai trạng thái chặn là `denied` (chưa cấp quyền, kèm hướng dẫn) và `unsupported` (trình duyệt không hỗ trợ, gợi ý mở bằng Chrome/Edge và vẫn cho phép gõ phím). Khi hết Credit, hiện `Alert` tone warning ngay trên thanh nhập, kèm nút "Nạp thêm Credit". Hội thoại không bị mất.

## Mô hình Credit và hạn mức

Trình bày như **hai thanh đo cộng một ví**, theo đúng thứ tự trừ:

1. **Hạn mức 5 giờ** (`QuotaMeter`, `quota-5h`): dùng trước, tự hồi phục.
2. **Hạn mức tuần** (`QuotaMeter`, `quota-week`): trần tổng của tuần.
3. **Ví Credit nạp thêm** (`CreditBadge` cỡ lớn, `credit`): không hết hạn, chỉ dùng khi hạn mức 5 giờ đã hết **và** công tắc "Tự động dùng Credit nạp thêm" đang bật.

Mỗi thanh ghi rõ "Đã dùng X / Y", số phần trăm và "Hồi phục sau …". Không gọi hạn mức là Credit.

## Dùng với React + Tailwind

`tokens.css` khai báo mọi token thành biến CSS (`--ai`, `--paper-100`, `--space-4`…) và đổi theo `data-theme` (`hoc-tap`, `phong-luyen`, `kham-pha`, `quan-tri`, `hoc-tap-dem`, `phong-luyen-dem`) đặt ở layout gốc của mỗi khu vực: `<div data-theme="phong-luyen">` bọc phòng luyện, `<div data-theme="quan-tri">` bọc `AdminLayout`. Khi chuyển Tailwind sang cấu hình thật, ánh xạ token vào theme thay vì viết mã màu:

```js
// tailwind.config.js
export default {
  // direction tối: dùng variant dark: cho phong-luyen và hoc-tap-dem
  darkMode: ['variant', '&:is([data-theme="hoc-tap-dem"] *, [data-theme="phong-luyen-dem"] *)'],
  theme: {
    extend: {
      colors: {
        paper: { 50: 'var(--paper-50)', 100: 'var(--paper-100)', 200: 'var(--paper-200)', 300: 'var(--paper-300)' },
        sumi: { DEFAULT: 'var(--sumi)', muted: 'var(--sumi-muted)', faint: 'var(--sumi-faint)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        ai: { DEFAULT: 'var(--ai)', hover: 'var(--ai-hover)', soft: 'var(--ai-soft)', on: 'var(--on-ai)' },
        shu: { DEFAULT: 'var(--shu)', soft: 'var(--shu-soft)', on: 'var(--on-shu)' },
        sora: { DEFAULT: 'var(--sora)', soft: 'var(--sora-soft)', on: 'var(--on-sora)' },
        nami: { DEFAULT: 'var(--nami)', soft: 'var(--nami-soft)' },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        n5: { DEFAULT: 'var(--n5)', soft: 'var(--n5-soft)' },
        n4: { DEFAULT: 'var(--n4)', soft: 'var(--n4-soft)' },
        n3: { DEFAULT: 'var(--n3)', soft: 'var(--n3-soft)' },
        credit: { DEFAULT: 'var(--credit)', soft: 'var(--credit-soft)', coin: 'var(--credit-coin)' },
      },
      fontFamily: { sans: 'var(--font-sans)', jp: 'var(--font-jp)', mincho: 'var(--font-mincho)' },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
      screens: { md: '768px', lg: '1024px', xl: '1280px' },
    },
  },
};
```

- Không bao giờ viết mã hex trong JSX (`bg-[#0878EE]`). Luôn dùng class ánh xạ token (`bg-ai text-ai-on`).
- Component trong hệ thống này (`window.JCAP`, class `jc-*` trong `components/bundle.css`) là bản tham chiếu: đúng props, đúng trạng thái, đúng token. Khi viết lại bằng TSX + Tailwind trong dự án, giữ nguyên tên component và tên props.

---

## Consuming this system (generated — do not edit)

Every path named below is under `project/` in this design system: read `project/api/tokens.md`, not `api/tokens.md`.

`components/bundle.js` defines `window.JCAP` (34 components); `components/bundle.css` is its stylesheet; `tokens.css` is every token as a CSS variable plus `@font-face` for the fonts. `components/bundle.css` reads its variables from `tokens.css`. The bundle needs react 18 (not packed in this system: bring your own copy) (`window.React`), react-dom 18 (not packed in this system: bring your own copy) (`window.ReactDOM`), loaded before it. Build any UI by mounting these components; never hand-build a control or draw an icon the system provides.

- **Standalone page:** inline `tokens.css` and `components/bundle.css` in a `<style>`, then the library files and `components/bundle.js` as classic scripts (a file containing `</style`, `</script` or `<!--` breaks an inline element: write the sequence `<\/style`, `<\/script` or `\x3C!--` in your copy, or load that file by URL).
- **Design canvas:** bring `tokens.css`, `components/bundle.css`, `components/bundle.js` and `components/index.d.ts` (for the editor’s props panel) onto the canvas in full, as the canvas type’s design-system components reference says (a server-side copy first where it offers one); in each artboard that uses this system, right after the `support.js` line, load `tokens.css` first, then the stylesheet, then the script; skip the library files (the artboard supplies React); mount with `<x-import component-from-global-scope="JCAP.<Comp>" …>`.
- **Slides deck, or any surface that cannot run the bundle:** tokens only — the values are on `api/tokens.md`; the deck takes `tokens.json` by file path for its colour pickers.

**Read, per thing:** a component’s props, parts and examples: `api/components/<Comp>.md`; token values: `api/tokens.md`; stored assets and their paths: `api/assets/<Group>.md`. After this README, fetch the cards and fonts you need in ONE message as parallel calls — none depends on another.

**Two rules.** Before you use a thing — a component, a token group, an icon, an asset — read its card from the index below; a value you did not read from a card is a guess. `tokens.json`, `manifest.json`, `components/index.d.ts` and `design-system.json` are sources for tools: hand them over. `components/<Comp>/README.md` is the long-form second read a card links to; `SKILL.md` and `artifact-type/` beside them are authoring guidance, not needed to consume the system.

## Index (generated — do not edit)

**Tokens**

- `api/tokens.md` — Every token: surface, fill, palette, type, spacing, radius, shadow, size, breakpoint. (15.0k)

**Icons and assets**

- `api/assets/Logo.md` — 1 file, by asset id. (0.7k)
- `api/assets/Tone-and-Style.md` — 1 file, by asset id. (0.9k)

**Components** (`api/components/<Comp>.md`, 34)

- **Nền tảng**: `Icon` — Biểu tượng duy nhất của JCAP, dùng Material Symbols Rounded qua tên ligature
- **Hành động**: `Button` — Nút hành động · `IconButton` — Nút chỉ có icon, vùng bấm luôn từ 44px trở lên
- **Biểu mẫu**: `TextField` — Ô nhập có nhãn, gợi ý và lỗi · `Select` — Danh sách chọn dùng gốc, để trên điện thoại hiện bộ chọn của hệ điều hành · `Switch` — Công tắc bật/tắt có hiệu lực ngay lập tức, không cần nút Lưu · `SegmentedControl` — Nhóm 2 đến 5 lựa chọn loại trừ nhau, hiển thị cùng lúc
- **Trạng thái**: `JlptBadge` — Huy hiệu cấp JLPT, mỗi cấp một màu cố định: N5 lá non, N4 asagi, N3 fuji · `CreditBadge` — Hiển thị Credit: số dư (variant="balance") hoặc chi phí (variant="cost") · `Badge` — Nhãn trạng thái ngắn, tối đa 3 từ, đặt cạnh tiêu đề hoặc trong bảng
- **Phản hồi**: `Alert` — Thông báo nằm cố định trong trang, dùng cho lỗi tải, cảnh báo hết Credit, banner xem trước, hướng dẫn cấp quyền micro · `Toast` — Thông báo nổi ngắn sau một hành động, tự ẩn sau 4 giây (lỗi thì giữ đến khi người dùng đóng) · `EmptyState` — Trạng thái rỗng, luôn kèm hành động tiếp theo · `Skeleton` — Khung giữ chỗ khi đang tải, có cùng hình dạng với nội dung thật
- **Điều hướng**: `Tabs` — Chuyển giữa các nhóm nội dung cùng cấp trong một trang, như thư viện Shadowing hay các tab admin · `Stepper` — Chuỗi bước có thứ tự: các bước luyện ở một mốc (Hiểu → Shadowing → Kiểm tra → Hội thoại AI), form admin dài chia bước, tiến độ nhiệm vụ · `AppHeader` — Header cố định cao 60px của mọi trang sau đăng nhập, trừ các phòng luyện toàn màn hình · `SideNav` — Sidebar desktop (≥1024px), rộng 240px · `BottomNav` — Thanh điều hướng đáy cho học viên trên điện thoại và máy tính bảng (<1024px)
- **Bố cục**: `Card` — Khung chứa nội dung trên nền giấy, là khối dựng chính của trang chủ, trang chi tiết và trang admin
- **Thẻ nội dung**: `ScenarioCard` — Thẻ một kịch bản Hội thoại AI trong thư viện · `ShadowingCard` — Thẻ một bài Shadowing trong thư viện
- **Dữ liệu**: `Table` — Bảng dữ liệu cho admin, lịch sử giao dịch và lịch sử luyện tập · `ProgressBar` — Thanh tiến độ tuyến tính, dùng cho tiến độ bài, nhiệm vụ và chương · `QuotaMeter` — Thanh đo hạn mức AI (5 giờ, tuần) hoặc ví Credit nạp thêm, theo mô hình "hai thanh đo cộng một ví" trong README chính · `ScoreRing` — Vòng điểm 0–100 cho kết quả Shadowing, Hội thoại AI và điểm thành phần
- **Lớp phủ**: `Modal` — Hộp thoại xác nhận hoặc nhập nhanh, chặn tương tác phía sau · `Drawer` — Panel trượt vào từ cạnh màn hình
- **Luyện nói**: `MicButton` — Nút micro, trung tâm của mọi phòng luyện · `AudioPlayer` — Trình phát âm thanh mini cho câu mẫu, bản ghi của học viên và audio bản xứ · `JpText` — Chữ tiếng Nhật có furigana bằng , tự đặt lang="ja" và font Noto Sans JP · `ChatBubble` — Bong bóng hội thoại trong phòng Hội thoại AI và danh sách câu thoại Shadowing · `WordDiff` — So sánh câu học viên nói với câu mẫu theo từng từ hoặc mora, dùng trong thẻ kết quả Shadowing · `FeedbackItem` — Một mục nhận xét trong panel Đánh giá lượt nói và trang chi tiết kết quả
