# JCAP – Bàn giao UI/UX cho jcap-web

Tài liệu này mô tả giao diện mới của phía **học viên** để dựng lại trong `jcap-web/` (React 19 + TS + Vite + Tailwind CDN).
Nguồn sự thật về hình ảnh và hành vi là bản tương tác trong `prototype/AppPrototype.dc.html`
(đã chia sẻ cho team trên claude.ai, tên "JCAP – Bản tương tác"). Khi tài liệu này và prototype lệch nhau, theo prototype.

## 0. Nguyên tắc chung (đọc trước mọi bước)

- **Chỉ đổi UI.** Không đổi API, service, type, logic chấm điểm hay luồng dữ liệu. Dữ liệu thật lấy từ `src/services/*` như hiện tại; số liệu trong prototype là dữ liệu mẫu.
- **Dùng token, không dùng mã màu tự chế.** Mọi màu, font, bo góc, đổ bóng lấy từ `tokens/tokens.css` (CSS variables). Không viết `#0878EE`, `bg-[#F4F9FE]`… mới.
- **Direction theo khu vực** (đặt `data-theme` ở phần tử gốc của route/khu vực):
  | Khu vực | `data-theme` |
  |---|---|
  | Trang học viên: thư viện, kết quả, hồ sơ, cài đặt, Gói & Credit | `hoc-tap` |
  | Phòng luyện Shadowing, phòng Hội thoại AI | `phong-luyen` (kèm lớp nền trung tính, xem mục 8) |
  | Bản đồ Hành trình (trang chủ) | `kham-pha` |
  | Admin | `quan-tri` |
- **Dùng component của design system.** `design-system/bundle.js` là bản tham chiếu (React, global `window.JCAP`). Không nhúng file này nguyên xi; hãy **port sang TSX** vào `src/components/jcap/` và dùng chung `bundle.css` (tên class `jc-*`). Props xem `design-system/index.d.ts` và `design-system/COMPONENTS.md`.
- **Thuật ngữ** theo `GLOSSARY.md` (Credit, RoleplaySession, ShadowingDialogue…). Chữ trên UI viết tiếng Việt, câu ngắn, không IN HOA nhãn.
- **Font**: Be Vietnam Pro (chữ Việt), Noto Sans JP (tiếng Nhật), Noto Serif JP (chữ trang trí, nhãn vùng). **Icon**: Material Symbols **Rounded**.
- **Truy cập**: nút thật là `<button>`/`<a>`, nút chỉ có icon phải có `aria-label`, focus nhìn thấy được, tôn trọng `prefers-reduced-motion`.

## 1. Nền tảng (làm đầu tiên)

1. Copy `tokens/tokens.css` → `jcap-web/src/styles/tokens.css`, `design-system/bundle.css` → `jcap-web/src/styles/jcap.css`; import cả hai trong `src/main.tsx` (tokens trước).
2. `index.html`: thay link font Inter/Plus Jakarta bằng 3 font ở trên; đổi `Material Symbols Outlined` → `Material Symbols Rounded`; thêm cấu hình Tailwind theo `tokens/tailwind-config-snippet.html` để dùng được `bg-paper-100`, `text-sumi`, `text-ai`… trỏ vào CSS variables.
3. Port các component cần dùng (đủ cho mọi màn bên dưới): `Icon, Logo, Button, IconButton, Badge, JlptBadge, CreditBadge, SegmentedControl, Tabs, Switch, TextField, Select, ProgressBar, QuotaMeter, ScoreRing, Stepper, EmptyState, JpText, ChatBubble, MicButton, AudioPlayer, WordDiff, FeedbackItem`.
   - `Logo`: truyền `src` bằng file của dự án (`assets/jcap-logo-mark.svg`), không dùng đường dẫn `/_blob/…` trong bundle.
   - **Sửa lỗi đã biết của `ChatBubble`**: CSS gốc đổi nền mọi bóng thoại sang `--ai-hover` khi hover, làm bóng của AI mất chữ. Chỉ bóng của học viên khi bấm được mới đổi nền.
   - `ChatBubble` nhận prop `from: 'ai' | 'me'` (trong prototype có lớp bọc `JCAPX.Bubble` với prop `side` chỉ vì công cụ canvas, code thật không cần).
4. Trang `/dev/ui-foundation` (`DevShowcaseView`) có thể dùng để bày các component vừa port cho dễ kiểm tra.

## 2. Khung ứng dụng: thanh bên mới (thay `Header` + `Navbar`)

Prototype: phần `<aside class="side">` trong `AppPrototype.dc.html`.

- Bỏ thanh header ngang trên cùng. Chỉ còn **một thanh bên trái**: rộng 240px, thu gọn 72px. Trạng thái thu gọn lưu `localStorage`.
- **Trên trang chủ (bản đồ)** thanh bên **nổi** trên bản đồ (cách mép 12px, bo 20px, đổ bóng). **Các trang khác** thanh bên **áp sát mép trái** (không bo, chỉ có đường kẻ phải), nền `--paper-50`. Có chuyển động khi đổi giữa hai kiểu (~300ms).
- **Hàng thương hiệu**: logo + chữ "JCAP" + nút thu gọn (icon `left_panel_close`, tooltip "Đóng thanh bên").
  - Đang mở rộng: bấm logo hoặc chữ JCAP → về trang chủ (bản đồ toàn quốc).
  - Đang thu gọn: chỉ còn logo; rê vào logo đổi thành icon `left_panel_open` + tooltip "Mở thanh bên"; bấm để mở rộng.
- **Nhóm "Đang học"** (nhãn màu `--shu`), 3 mục lấy từ tiến độ thật:
  1. Chương hiện tại của Hành trình (vd "Chương 1 · 3/10" dấu).
  2. Bài Shadowing đang dở (vd "Makuhari Messe · 3/6").
  3. RoleplaySession đang dở (vd "Mua vé tàu ở ga · 2/4").
  - Rê chuột vào một mục: một **viên dài (pill)** trượt ra bên phải thanh bên (clip-path, ~260ms) với thông tin + nút ▶ (tiếp tục học ngay) + nút mũi tên xuống.
  - Bấm mũi tên xuống: thả xuống **thẻ chi tiết** dưới viên (chương: thanh tiến độ + danh sách tỉnh; Shadowing: câu đang luyện + tiến độ; hội thoại: các nhiệm vụ dạng Stepper).
  - Viên chỉ hiện khi rê/ focus/ mở; khi không thì ẩn hẳn (`visibility: hidden`).
- **Nhóm "Học"**: Hành trình (`/`), Hội thoại AI (`/scenarios`), Shadowing (`/shadowing`), Kết quả (`/roleplay/results`), Sổ con dấu (chưa có route: để mục mờ hoặc trỏ tạm về `/explore`). **Flashcard** (`/flashcards`) có trong code nhưng không có trong prototype: giữ, đặt dưới Shadowing cùng kiểu. Mục đang mở nền `--shu-soft`, icon màu `--shu`.
- **Đáy thanh bên**: dòng "Số dư · 3.800" (bấm → `/subscription`) và **nút tài khoản** (avatar, tên, "Mục tiêu JLPT N5"). Bấm nút tài khoản → **menu bật lên phía trên**: đầu menu (avatar, tên, email), Gói & Credit (kèm số dư) → `/subscription`, Hồ sơ → `/profile`, Cài đặt → `/settings`, đường kẻ, Đăng xuất (màu `--danger`). Khi đang ở một trong ba trang đó, nút tài khoản và mục tương ứng được tô sáng.
- Bỏ các mục "Gói & Hạn mức", "Hồ sơ", "Cài đặt" khỏi danh sách nav (đã vào menu tài khoản). "Lịch học", "Trợ giúp" chưa có trong thiết kế: hỏi lại trước khi bỏ.
- `MainLayout`: bỏ `Header`, `Footer`; nội dung trang nằm bên phải thanh bên, nền `--paper-100`, cuộn riêng.

## 3. Trang chủ = Bản đồ Hành trình (`/`, hiện là `/explore` + `JapanMapView`)

Prototype: phần `.mapfull`, `.natl`, `.zoomL`, `.ppanel` trong `AppPrototype.dc.html`. Giữ toàn bộ dữ liệu/logic bản đồ hiện có (`JapanMap.tsx`, `exploreStore`, `learnRoute`…), chỉ đổi lớp trình bày.

- `data-theme="kham-pha"`; thay màu trong `exploreTheme.ts` (đang dùng `#0878EE`) bằng token của `kham-pha`.
- Bản đồ chiếm toàn màn hình, thanh bên nổi bên trái. Nhãn vùng chữ dọc (北海道, 関東…) khung viền đôi, font mincho.
- **Cụm điều khiển góc dưới phải**: nút "Chú giải" (mở bảng chú giải phía trên: Tỉnh đã mở, Tỉnh đang khoá, Con dấu son, Chấm đỏ = mốc đang học, Nhãn vùng, Lộ trình nét đứt), cạnh đó là cột nút: [ふ bật/tắt furigana · tìm tỉnh] rồi [+ · − · về toàn quốc]. Không đặt nút nào ở góc trên phải.
- Bấm tỉnh đang khoá → popover nhỏ cạnh tỉnh: lý do khoá + nút gợi ý học tiếp ở tỉnh đang mở.
- **Vào tỉnh** (bấm tỉnh đã mở): chuỗi chuyển động: thanh bên trượt ra (200ms) → camera phóng vào tỉnh (600ms) → lớp bản đồ chi tiết hiện (250ms) → panel tỉnh trượt vào từ phải (280ms) → nút "← Toàn quốc" hiện. Thoát thì ngược lại, nhanh hơn. `prefers-reduced-motion`: chỉ đổi mờ.
- **Panel tỉnh** (phải, 360px): tên tỉnh có furigana, tiến độ x/5 mốc, từ đặc trưng, mốc đang học mở rộng (câu tiếng Nhật, Stepper 4 bước Hiểu → Shadowing → Kiểm tra → Hội thoại AI, nút tiếp tục), danh sách các mốc còn lại.

## 4. Gói & Credit (`/subscription`, `SubscriptionQuotaView`)

Prototype: trang `pgPlan` (lớp `.um-*`). Bố cục **tối giản dạng danh sách** (một cột ~760px giữa trang, ngăn bằng đường kẻ, không thẻ, không nền màu):

1. Tiêu đề "Mức dùng của bạn" + tên gói nhạt bên cạnh.
2. Câu trạng thái đậm (vd "Ổn định. Bạn còn dư hạn mức tới lần hồi phục tiếp theo."), tính từ số liệu thật.
3. Hai hàng thanh mảnh: **Chu kỳ 5 giờ** (dòng phụ: giờ hồi đầy, vd "Hồi đầy lúc 15:23 hôm nay") và **Tuần này** (dòng phụ: thời điểm làm mới). Bên phải "x% đã dùng".
4. **Gói**: tên gói + "Cơ bản", bên phải "Còn N ngày"; dòng phụ ngày hết hạn + hạn mức; liên kết "Xem quyền lợi của gói" (mở/đóng danh sách quyền lợi) + nút "Đổi gói" → `/credits`.
5. **Credit nạp thêm**: số dư bên phải; mô tả "Không hết hạn. Chỉ dùng khi bạn chạm giới hạn của gói."; công tắc tự dùng credit khi hết hạn mức (nối với cài đặt thật nếu backend có, nếu chưa có thì ghi chú TODO); nút "Nạp thêm credit" → `/credits`.
6. **Mức dùng tuần này theo kỹ năng**: Hội thoại AI, Shadowing (thanh + số credit).
7. Chân trang: mô hình AI, thời điểm cập nhật, "Làm mới", "Lịch sử giao dịch" → `/credits/history`.

## 5. Hồ sơ (`/profile`, `LearnerProfileView`) và 6. Cài đặt (`/settings`, `SettingsView`)

Prototype: trang `pgProfile`, `pgSettings`.

- **Hồ sơ**: cột trái thẻ danh tính (avatar lớn + nút đổi ảnh, tên, email, JlptBadge + "Học viên", ngày tham gia, "Chỉnh sửa hồ sơ" → `/profile/edit`). Cột phải: Mục tiêu JLPT (SegmentedControl N5/N4/N3) + 3 số liệu (phiên Hội thoại AI, buổi Shadowing, con dấu); Thông tin tài khoản (dòng có icon, "Đã xác minh", "Thêm số điện thoại"); Bảo mật (Đổi mật khẩu → `/profile/change-password`, Liên kết Google); thẻ Gói và Credit; Đăng xuất (Button danger).
- **Cài đặt**: menu mục con bên trái (Giọng đọc AI, Micro và loa, Khi luyện tập, Giao diện; cuộn tới mục). Giọng đọc AI: thẻ "Đang dùng" + nghe thử, chọn nhóm giọng (Chuẩn / Vùng miền / Hoạt hình và khác) và lưới 3 cột thẻ giọng. Micro và loa: chọn thiết bị + đo mức âm + nói thử / phát thử. Khi luyện tập: các Switch (furigana, nghĩa tiếng Việt, tự phát giọng AI) + tốc độ đọc. Giao diện: Sáng / Tối / Theo máy. Giữ nguyên logic hiện có (`AiVoiceSettingsModal`, `AudioDeviceSettingsModal` có thể tái dùng phần xử lý).

## 7. Thư viện: Shadowing (`/shadowing`) và Hội thoại AI (`/scenarios`)

Prototype: trang `pgShadow`, `pgRole`.

- **Shadowing** (`LearnerShadowingListView`):
  - Tiêu đề + mô tả 1 dòng.
  - Khối "Đang học dở" (nền `--nami-soft`): tên bài, câu đang dừng (JpText), ProgressBar, nút "Tiếp tục từ câu N".
  - **Thanh lọc một hàng** trên đường kẻ mảnh: tab chữ Tất cả / Đang học / Chưa học / Đã lưu (gạch chân `--ai` trượt, số đếm trong viên nhỏ); bên phải chip cấp độ Mọi cấp / N5 / N4 / N3 (chip đang chọn mang màu của cấp, bấm lại để bỏ); ô tìm kiếm thu thành icon, bấm giãn ra. Lọc thật và số đếm cập nhật theo nhau; không có kết quả → EmptyState.
  - Danh sách nhóm theo kịch bản (thẻ có tiêu đề nhóm + "x/y bài xong"), mỗi bài: icon trạng thái, tên + JlptBadge, thông tin phụ, điểm cao nhất, nút lưu, nút Bắt đầu/Tiếp tục/Luyện lại.
  - Cột phải: Buổi luyện gần đây (ScoreRing + tên + thời gian, nút "Xem toàn bộ lịch sử"), thẻ mẹo tai nghe.
- **Hội thoại AI** (`ScenarioListView` + chi tiết): bên trái tìm kiếm + SegmentedControl chủ đề + lọc trình độ, danh sách tình huống nhóm theo chủ đề (icon, tên, mục tiêu, JlptBadge, thời lượng, nhãn "Đang dở x/y", chi phí credit). Bên phải panel xem trước tình huống đang chọn: nhân vật AI, chọn cấp độ, nhiệm vụ trong phiên, từ sẽ gặp (JpText), chi phí và số dư sau khi bắt đầu, nút "Bắt đầu hội thoại" hoặc "Tiếp tục" + "Làm lại từ đầu".

## 8. Phòng luyện Shadowing (`/shadowing/:id/practice`, `LearnerShadowingPracticeView`)

Prototype: `prototype/ShadowingRoom.dc.html` (cũng có trong AppPrototype, trang `rm-pg`).

- Toàn màn hình, không thanh bên. `data-theme="phong-luyen"` + **ghi đè nền trung tính** cho phòng: `--paper-100:#f4f6f8; --paper-200:#e9edf1; --paper-300:#dde3e9; --line:#dce2e8`, nền chấm `radial-gradient(rgba(15,37,56,.10) 1px)` 22px.
- **Thanh trên** (56px, trắng hơi trong): logo, đường dẫn "Đi máy bay › Lần đầu tiên đi máy bay", nhãn cấp nhỏ "N4 ⌄" (đổi cấp), bên phải icon "Cài đặt âm thanh".
- **Thẻ trái** (380px): Quay lại / Kết thúc (Button danger), ảnh bối cảnh + avatar nhân vật đè góc + tên vai, dòng vai của học viên + "Đổi vai", mục mở/thu "Tình huống" và "Nội dung bài học" (Cả hội thoại / Từ vựng / Ngữ pháp).
- **Hội thoại** (ChatBubble): câu của AI bên trái (trắng), câu của học viên bên phải, **nền `--sumi` (xanh than đậm), chữ trắng, to hơn bóng AI một bậc** (JpText ~21px, đậm 600, khung rộng tới 660px). Avatar học viên bên phải, **điểm của câu là viên nhỏ đặt trên avatar** (màu theo mức điểm). Dưới mỗi câu: mic (thu lại câu này), Nghe mẫu, Dịch. Câu đang tới lượt nói: viền nét đứt `--ai`, nhãn "Lượt của bạn". Vùng hội thoại cuộn được và tự cuộn xuống câu mới nhất khi có câu mới.
- **Khung thu âm** (viền nét đứt, đáy): chờ = MicButton giữa; đang thu = sóng âm + nút dừng + nút gửi; **chưa đánh giá được** = icon cảnh báo, "Chưa thể đánh giá bản ghi" + "Lần thử #n", lời khuyên, chú thích không tính điểm, hộp "Câu mẫu cần luyện", nút Nghe lại bản thu / Bỏ qua câu / Thu âm lại; **có điểm** = ScoreRing + WordDiff + FeedbackItem + Nghe lại bản thu / Thu âm lại / Câu tiếp; **xong bài** = điểm trung bình + Luyện lại / Bài tiếp theo. Dùng kết quả chấm thật từ backend (`ShadowingEvaluationService`), giữ nguyên `RecordingBar`/logic thu âm hiện có.

## 9. Phòng Hội thoại AI (`/scenarios/practice/:sessionId`, `RoleplayPracticeView`)

Prototype: `prototype/ConversationRoom.dc.html` (cũng có trong AppPrototype, trang `cv`).

- Cùng nền trung tính và kiểu bóng thoại với phòng Shadowing.
- **Thanh trên**: ← Rời phòng, logo, đường dẫn "Hội thoại AI › <tên tình huống>" + JlptBadge; bên phải: nút "Nhiệm vụ x/3" (bật/tắt cột trái), "Đánh giá" (bật/tắt cột phải), CreditBadge số dư, icon cài đặt (popover: Furigana, Hiện nghĩa tiếng Việt, Tự phát giọng AI, Tốc độ giọng; chấm xanh khi khác mặc định), "Kết thúc sớm" (Button danger sm).
- **Cột trái** (320px, thu được): nhân vật (avatar, tên vai, mô tả ngắn), Tiến độ x/3 + ProgressBar, Tabs "Nhiệm vụ" (Stepper dọc: done/current/todo) / "Mẫu câu" (cheat sheet: JpText + nghĩa + nút nghe).
- **Giữa**: thẻ bối cảnh ngắn ở đầu; ChatBubble AI (có nghĩa + Nghe) và của học viên (nền `--sumi`, kèm điểm; **bấm vào câu của mình → mở cột Đánh giá** với câu đó). Tự cuộn xuống câu mới.
- **Ô trả lời (một thanh bo tròn)**: nút Gợi ý (mở thẻ vàng nhạt: câu gợi ý cho nhiệm vụ hiện tại + Nghe + "Dùng câu này" điền vào ô) · ô nhập (Enter gửi) · nút Gửi (chỉ hiện khi có chữ) · nút mic tròn. Đang thu: sóng âm, Huỷ, Gửi. Dòng nhắc nhỏ dưới thanh: "Bấm vào câu của bạn để xem nhận xét chi tiết".
- **Cột phải "Đánh giá"** (360px, mở khi cần): ScoreRing + verdict, WordDiff, FeedbackItem (kèm câu gợi ý tự nhiên hơn), danh sách các câu của bạn với điểm, điểm trung bình. Chưa có câu → EmptyState.
- **Xong 3 nhiệm vụ**: thẻ "Hoàn thành" trong hội thoại; ô trả lời đổi thành Luyện lại / Xem đánh giá.
- Giữ nguyên logic RoleplaySession, trừ credit, gọi AI hiện có.

## 10. Thứ tự làm và cách nghiệm thu

| Bước | Nội dung | Xong khi |
|---|---|---|
| 1 | Nền tảng (mục 1) | Trang dev hiển thị đủ component, `npm run build` qua |
| 2 | Thanh bên + MainLayout (mục 2) | Điều hướng đủ route cũ, thu gọn/mở, menu tài khoản, nhóm Đang học hoạt động |
| 3 | Gói & Credit (4), Hồ sơ, Cài đặt (5) | So khớp prototype, dữ liệu thật |
| 4 | Thư viện Shadowing, Hội thoại AI (7) | Lọc/tìm hoạt động, nút dẫn đúng route |
| 5 | Phòng Shadowing (8) | Đủ 5 trạng thái khung thu âm, điểm thật |
| 6 | Phòng Hội thoại AI (9) | Gợi ý, mic, gõ chữ, đánh giá từng câu |
| 7 | Bản đồ Hành trình (3) | Chuyển động vào/ra tỉnh, chú giải, điều khiển |

Mỗi bước: chạy `npm run build` (typecheck) và `npm test`, chụp màn hình so với prototype, commit riêng.

## Cách đọc file prototype `.dc.html`

Đây là định dạng của công cụ thiết kế: HTML + CSS inline thật (đọc trực tiếp kích thước, màu, khoảng cách), `{{ten}}` là giá trị lấy từ hàm `renderVals()` trong thẻ `<script data-dc-script>` cuối file, `<sc-if>` là điều kiện hiển thị, `<sc-for>` là vòng lặp, `<x-import component-from-global-scope="JCAP.Button" …>` là component của design system (thuộc tính kebab-case = props). Trạng thái tương tác nằm trong `this.state` của class `Component`.
