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

- **Shadowing** (`LearnerShadowingListView`): **đã thay bằng mục 9j**, phần dưới chỉ để tham khảo.
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

## 9b. Chế độ tối (Cài đặt › Giao diện)

Prototype: SegmentedControl "Chế độ màu" trong trang `pgSettings`, giá trị `themeMode` và khối CSS "Chế độ tối" trong `AppPrototype.dc.html`.

- Ba lựa chọn: **Sáng / Tối / Theo máy**. Lưu vào `localStorage` (và cài đặt người dùng nếu backend có). "Theo máy" đọc `matchMedia('(prefers-color-scheme: dark)')` và lắng nghe thay đổi.
- Cách hoạt động: chỉ đổi giá trị `data-theme` ở gốc mỗi khu vực, mọi token tự đổi theo:
  | Sáng | Tối |
  |---|---|
  | `hoc-tap` (trang học viên, thanh bên) | `hoc-tap-dem` |
  | `phong-luyen` (hai phòng luyện) | `phong-luyen-dem` |
  | `kham-pha` (bản đồ) | giữ `kham-pha` cho bản đồ (tranh minh hoạ), riêng thanh bên nổi dùng `hoc-tap-dem` |
- Nên làm một `ThemeProvider` (context) trả về `isDark` và hàm `themeFor('learn' | 'room' | 'map')`, các layout gọi hàm này để đặt `data-theme`.
- Tông nền tối là **mực sumi** (nâu đen ấm, không dùng navy). Giá trị đã nằm sẵn trong `tokens.css` cho `hoc-tap-dem` (`--paper-50:#232220; --paper-100:#1a1917; --paper-200:#2c2a27; --paper-300:#37342f; --line:#38352f`) và `phong-luyen-dem` (sâu hơn một nấc: `#201f1c / #141311 / #2a2825 / #34312d`). Chữ `--sumi:#efe9dc`, màu nhấn `--ai:#a9b8f0`. Chấm nền phòng luyện `rgba(255,255,255,.06)`.
- Câu của học viên trong phòng tối: nền `--ai-soft`, viền `#3d4668`, chữ `--sumi` (không dùng nền `--sumi` như bản sáng vì sẽ thành màu sáng).
- Không còn mã màu cứng nào được phép phụ thuộc chế độ sáng: rà các `bg-white`, `text-slate-*`, `#...` cũ trong các view khi chuyển sang token.
- Logo trên nền tối tự nằm trên tấm `--logo-plate` (component Logo đã xử lý).

## 9c. Sổ con dấu (`/stamps`, `views/explore/StampBookView.tsx`)

Prototype: `prototype/StampBook.dc.html` (bấm Play để thử tab vùng, lật trang, Tổng quan, Mục lục). `prototype/StampKit.dc.html` chỉ để tham khảo trạng thái tải, lỗi và hoạt ảnh đóng dấu.

Chỉ đổi giao diện. Dữ liệu giữ nguyên: `useExploreJourney()` (chương, tỉnh) và `exploreService.getStampBook()` (mốc đã có dấu). Trang vẫn chỉ đọc, không cấp dấu.

**Con dấu: dùng lại `SpotStampMark` và `PrefectureStampMark` trong `ExploreStamp.tsx`.** Con dấu trong prototype chỉ là bản vẽ minh hoạ. Bản thật đã có biểu tượng NDC và hình tỉnh lấy từ dữ liệu bản đồ, lại giống hệt con dấu trên bản đồ. Cỡ: dấu mốc 72px (ô rộng 84px), dấu tỉnh 80px.

Bố cục, từ trên xuống, cột rộng 1000px căn giữa:

- **Nền trang:** cả trang (kể cả thanh bên) đặt `data-theme="kham-pha"`. `main` có nền `--paper-100` và hoa văn sóng biển (seigaiha) rất nhạt, vẽ bằng `radial-gradient` màu `--paper-300` 55%. Lấy nguyên CSS của `main` trong prototype.
- **Dòng đầu (một hàng):** bên trái là dấu 旅 nhỏ (khung đỏ son, nghiêng −6°) và tiêu đề "Sổ con dấu". Bên phải có ba nút:
  - "Về chương đang học": chỉ hiện khi đang xem chương khác.
  - "Tổng quan": bật/tắt một bảng nổi, `aria-expanded`.
  - "Mục lục": mở ngăn kéo bên phải.
  - Không có dòng mô tả và 4 ô số liệu ở đầu trang nữa, các thứ này nằm trong bảng Tổng quan.
- **Bảng Tổng quan** (rộng 440px, neo dưới nút, bấm ra ngoài hoặc Esc để đóng). Có ba phần:
  - 4 số liệu xếp 2×2, số dùng font Mincho.
  - Bản đồ nhỏ: các tỉnh vẽ từ `PREFECTURES` (khung `HOME_VIEWBOX`). Vùng đang xem tô `--ai` 32%. Tỉnh có dấu tỉnh: vòng đỏ son. Tỉnh chỉ có dấu mốc: chấm `--ai`. Đường đã đi: nét đứt đỏ son. Có nút "Mở bản đồ" dẫn về `/`.
  - "Cách đọc sổ": ba dòng, mỗi dòng có một con dấu thật cỡ 40px (mực xanh, dấu son, ô trống).
- **Thông tin chương (nằm ngoài cuốn sổ, ngay trên sổ):** chia hai cột.
  - Cột trái: dòng "Chương N · Vùng" kèm JlptBadge (và Badge "Đang học" nếu là chương đang học), tên chương, mô tả, rồi ProgressBar nhỏ "Con dấu trong chương" (`stampCount/spotCount`).
  - Cột phải, rộng 380px: mỗi tỉnh một dòng gồm tên Việt + Nhật, "x/y địa điểm có con dấu · z dấu son" và link "Mở" dẫn tới `/explore?tinh=slug`.
  - Chương chưa mở: Badge "Chưa mở" ở cột trái. Cột phải là khung ổ khoá ghi điều kiện mở, kèm chip tên các tỉnh.
- **Cuốn sổ chỉ chứa con dấu, không có chữ nội dung:**
  - Bìa màu `--sumi`, bo 12px 22px 22px 12px, có đường chỉ đứt nét `--sora` 55% chạy cách mép 4px, và hai lớp giấy chồng ở góc dưới phải. Mỗi lần chỉ hiện một chương, dạng trang đôi.
  - Trang trái: con dấu tỉnh của chương ở cỡ lớn 116px, nghiêng xen kẽ −5° và 4°, căn giữa trang. Dưới mỗi dấu là "x/y" và tên tỉnh.
  - Trang phải: theo từng tỉnh, trước hết là tên tỉnh tiếng Nhật nhỏ, rồi lưới con dấu mốc đã đóng kèm tên tiếng Việt, rồi `spotCount − stampCount` ô trống tròn nét đứt, không ghi tên.
  - Số chương in mờ bằng chữ kanji (零 一 二 … 十 十一 … 四十九), viết dọc ở góc dưới phải trang trái, màu `--paper-200`. Cỡ chữ: 150px nếu một chữ, 96px nếu hai hoặc ba chữ.
  - Chương chưa mở: trang trái chỉ có số kanji. Trang phải chỉ có ấn 未開放 mờ.
  - Lật trang: nút "‹ Chương N−1" và "Chương N+1 ›" ở hai góc dưới của trang giấy. Hỗ trợ cả phím ← →.
  - Chương đang học có thẻ đánh dấu sách 栞 (shiori) treo ở mép trên trang phải: dải giấy hẹp, viền đỏ son, chữ dọc 学習中, dây đỏ và tua. Lấy nguyên SVG `.shiori` trong prototype.
- **Tab vùng ở mép phải sổ:** 7 tab là vùng, không phải chương: 関東, 中部, 関西, 中四国, 九州, 東北, 北海道. Tab đang chọn màu đỏ son, vùng chưa mở có ổ khoá. Bấm tab sẽ nhảy tới chương đầu của vùng, hoặc tới chương đang học nếu chương đó nằm trong vùng.
- **Dưới sổ:** một hàng chấm cho các chương trong vùng (chấm đặc là có dấu, viền đứt là chưa mở, chấm dài đỏ là trang đang mở; bấm được). Kèm dòng "Kanto · chương 3 trên 8 · 3 / 50".
- **Ngăn kéo Mục lục** (rộng 440px, có lớp phủ, khoá focus, Esc để đóng):
  - Ô tìm theo tên chương hoặc tỉnh.
  - Chip lọc: Tất cả / Đã mở / Có dấu / Chưa mở, kèm số lượng.
  - Danh sách theo vùng, gập/mở được. Mặc định chỉ mở vùng đang xem. Khi đang tìm hoặc lọc thì mở mọi vùng có kết quả.
  - Mỗi chương một dòng: số, tên, cấp, các tỉnh, "x/y" hoặc ổ khoá, nhãn "Đang học". Bấm vào là nhảy tới chương và đóng ngăn kéo.

Dữ liệu cần suy ra ở client (API không có sẵn):

- **Vùng của chương:** lấy theo vùng của tỉnh đầu tiên trong `prefectureIds`, tra trong `PREFECTURES[].region`. Gộp `chugoku` và `shikoku` thành 中四国, `kyushu` gồm cả Okinawa.
- **Chương đang học:** chương có `isUnlocked` với `orderIndex` lớn nhất. Trang mở mặc định vào chương này.
- **Điều kiện mở:** chương trước cùng vùng thì ghi "Mở khi đạt {unlockThresholdPercent}% con dấu của “{tên chương trước}” (x/y)". Chương đầu vùng mới thì ghi "Mở khi xong vùng {tên vùng} (Chương N · {tên})".
- **Ngoài các chương** (phần `UnassignedOpen` hiện có): một trang đôi sau chương cuối, kèm một nhóm cuối trong Mục lục. Chỉ hiện khi có dữ liệu.

Trạng thái và yêu cầu khác:

- **Đang tải:** khung cuốn sổ xám nhạt kèm 2 khối giấy. **Lỗi:** giữ khung báo lỗi đỏ nhạt có nút "Thử lại" như hiện tại.
- **Chế độ tối:** cuốn sổ và các bảng nổi luôn dùng `kham-pha`. Nền trang đổi sang `--paper-100` của `hoc-tap-dem` (sóng biển dùng `--line`).
- **Chuyển động:** đổi chương thì làm mờ trang và trượt 8px theo hướng lật, 200ms. Khi `prefers-reduced-motion` thì chỉ đổi ngay.
- **Đóng dấu mới:** nếu muốn mừng dấu mới thì dùng thuộc tính `pressing` sẵn có của `SpotStampMark`, đúng một lần.

## 9d. Landing page cho khách chưa đăng nhập (`/`)

Prototype: `prototype/Landing.dc.html` (một file, tự đổi bố cục ở chiều rộng ≤ 760px; trên canvas có thêm bảng xem ở 390px).

- **Route:** khách chưa đăng nhập vào `/` thì thấy landing page; người đã đăng nhập vào thẳng bản đồ Hành trình. Hiện `/` nằm trong `PrivateRoute`, nên cần tách: một component kiểm tra `isAuthenticated` (AuthContext) rồi render `LandingView` hoặc bản đồ. Kiểm tra `router/index.tsx` có code của người khác trước khi sửa.
- **Nút:** "Bắt đầu miễn phí" dẫn tới `/register`, "Đăng nhập" và "Tôi đã có tài khoản" dẫn tới `/login`, các link trên thanh đầu cuộn tới mục (`#thu`, `#thich-ung`, `#lich-su`, `#lo-trinh`, `#bang-gia`, `#cau-hoi`).
- **Theme và màu:** cả trang `data-theme="kham-pha"`. Nút hành động dùng màu chàm `--ai` (chữ `--on-ai`), bo 14px, cao 52px (40px trên thanh đầu). Màu đỏ son `--shu` chỉ dành cho con dấu và dấu 旅, không dùng cho nút.
- **Thứ tự mục (bản 3, bản chốt):** bản 3 thay bản 2. Trang nói về cả hệ thống, không xoay quanh một chuyến đi tới Narita.
  1. Thanh đầu dính trên cùng. Chỉ 3 link: Tính năng (`#thu`), Bảng giá (`#bang-gia`), Câu hỏi (`#cau-hoi`). Chân trang dùng cùng tên "Tính năng".
  2. Phần đầu: dòng cấp độ mảnh phía trên tiêu đề (chữ "JLPT" cỡ 12px màu `--sumi-muted`, vạch dọc, rồi N5 ─ N4 ─ N3 chữ Mincho 16px màu `--sumi` nối bằng vạch ngang 28px màu `--line-strong`; một màu, không dùng JlptBadge, không có dòng "Cho người Việt…"), tiêu đề "Đường ngàn dặm cũng bắt đầu từ một câu nói" (3 dòng cố định: "Đường ngàn dặm" / "cũng bắt đầu" / "từ một câu nói") dùng font **Lora** đậm 600, cỡ 62/70px (điện thoại 40/48px), letter-spacing -0.015em; nạp thêm `Lora:wght@500;600;700` từ Google Fonts (có bộ chữ tiếng Việt). Câu lớn bên trái màn hình Đăng nhập/Đăng ký cũng dùng Lora 600, 36/44px. Bỏ dòng "Shadowing và Hành trình miễn phí. Hội thoại AI dùng Credit." dưới hai nút, dòng 「千里の道も一歩から。」 có furigana, rồi tới hai nút (không có đoạn giới thiệu) (không có hàng chip tính năng). Bên phải là bản đồ cả nước vẽ từ `PREFECTURES` (bỏ Okinawa), có 4 ghim tròn màu `--ai` mang chữ 宿 食 駅 医 đặt tại `labelPos` của Hokkaido, Osaka, Tokyo, Fukuoka. Mỗi ghim nối bằng nét đứt mảnh tới một thẻ: loại nơi, câu mẫu có furigana, nghĩa tiếng Việt. Thẻ nằm ở vùng biển để không che đất liền.
  3. Câu mở: 「すみません、もう一度お願いします。」 cỡ 76px Mincho, ngắt thành 2 dòng ("すみません、" / "もう一度お願いします。"), nghĩa tiếng Việt, câu gợi vấn đề, 4 khó khăn xếp 2 cột.
  4. "Mỗi tình huống, ba bước luyện." (`#thu`, không có đoạn mô tả dưới tiêu đề): ví dụ ở cửa hàng tiện lợi. 3 bước 一 二 三 bên trái (Nói theo câu mẫu, Hội thoại với nhân vật, Nhận con dấu), khung minh hoạ bên phải. Trên điện thoại 3 bước thành thanh tab ngang.
  5. Học tập thích ứng (`#thich-ung`, nền `--sumi`): cùng nội dung bản 2 nhưng ví dụ là cửa hàng tiện lợi (お弁当、温めますか。 → nhánh chậm 大丈夫ですよ。袋、いりますか。 kèm gợi ý; nhánh nhanh かしこまりました。袋はご利用ですか。お箸もおつけしましょうか。).
  6. Mục mới "Cùng một ý, nói khác nhau với từng người" (`#lich-su`): 3 hàng (Bạn bè もう一回言って。 / Nhân viên cửa hàng すみません、もう一度お願いします。 / Người phỏng vấn 恐れ入りますが、もう一度おっしゃっていただけますか。), bên trái có thanh dọc từ "Thân mật" (`--sora`) đến "Trang trọng" (`--ai`). Không có đoạn ghi chú dưới 3 hàng. Nguồn: các vai trong `RoleplaySocialRegister` và điểm kính ngữ trong hồ sơ phản xạ. Không viết rằng hệ thống sửa cách dùng kính ngữ của người học.
  7. Lộ trình (`#lo-trinh`), tiêu đề "Lộ trình là một tấm bản đồ, mỗi nơi đi qua để lại một con dấu.": bản đồ cả nước tô 3 trạng thái (đã đi qua: `--ai` 42% trộn `--paper-50`; đang học: `--ai`; chưa đi: `--paper-200`) kèm chú thích, bên phải là 3 bước 一 二 三 (Chọn chương, Luyện ở từng địa điểm, Nhận con dấu: "Học xong ở đâu, sổ của bạn có thêm con dấu của nơi đó."). Chú thích ở tab Nhận con dấu: "Mỗi nơi học xong là một con dấu. Lật sổ ra là thấy mình đã đi được bao xa.". **Không nhắc quy tắc "đủ 70% con dấu mới mở chương"**, hệ thống không có quy tắc này. Landing cũng không nhắc dấu son: chỉ nói hoàn thành bài học thì nhận con dấu.
  8. Bảng giá: giữ như bản 2 nhưng bỏ dòng ghi chú "Credit dùng cho Hội thoại AI… (5 Credit một bộ)" dưới bảng. 9. Câu hỏi thường gặp: giữ như bản 2.
  10. Lời mời cuối trang "Câu tiếng Nhật đầu tiên bạn nói ra, hôm nay." kèm con dấu son vuông 話す, rồi chân trang.
- **Hiệu ứng phần đầu:** ghim và thẻ hiện lần lượt (trễ 0.35s, 0.75s, 1.15s, 1.55s; mỗi lần 420ms, mờ dần và trượt lên 6px). Khi `prefers-reduced-motion` thì hiện sẵn. Trên điện thoại (≤ 760px) chỉ giữ 2 thẻ Hokkaido và Tokyo, ẩn dòng tiếng Việt trong thẻ.
- **Bỏ khỏi bản 1:** các nhãn nhỏ có icon phía trên tiêu đề, hàng tính năng so le trái phải, mục "Cách học" riêng (đã gộp vào Lộ trình), ba thẻ giá giống nhau.
- **Mục "Học tập thích ứng"** (`#thich-ung`, có link trên thanh đầu): nội dung bám đúng code đang chạy, không quảng cáo gì chưa có.
  - Minh hoạ hai nhánh cho cùng một câu hỏi của nhân viên cửa hàng tiện lợi. Nhánh "Trả lời sau 5 giây · Xem bản dịch 2 lần": nhân vật nói chậm và dễ hơn, kèm gợi ý điền chỗ trống. Nhánh "Trả lời sau 1,4 giây · Không dùng gợi ý": nhân vật nói tự nhiên hơn. Nguồn: `TelemetryEvaluatorService` (ngưỡng > 4,5 giây, xem dịch > 1 lần hoặc gợi ý ≥ 2; < 1,8 giây, không gợi ý, điểm ≥ 85).
  - Không có hàng bốn ý bên dưới (đã bỏ ở bản 3); mục chỉ gồm tiêu đề, mô tả và minh hoạ hai nhánh.
  - Không viết rằng người học "xem được" hồ sơ phản xạ, vì giao diện xem chỉ số này chưa có.
- **Khung minh hoạ** ở mục ba bước luyện dựng bằng component (JpText, WordDiff, ScoreRing), không phải ảnh chụp. Khi giao diện thật xong có thể thay bằng ảnh chụp, nhưng giữ nguyên nội dung.
- **Bảng giá** phải đọc từ dữ liệu thật (`creditService`, `subscriptionPlanService`) chứ không chép số cứng như prototype. Prototype đang dùng giá khởi tạo trong code (50/150/350/1.000 Credit; Pro 199.000đ, Pro Max 349.000đ).
- **Không có mục học viên hay số liệu.** Khi có học viên thật mới thêm.

Cần nhóm kiểm tra trước khi đưa lên:

- Giá các gói trong DB có khớp không.
- Bốn tình huống trên bản đồ (khách sạn, quán ăn, nhà ga, phòng khám) và ví dụ cửa hàng tiện lợi là minh hoạ mình viết. Kiểm tra các kịch bản này có trong nội dung thật chưa, nếu chưa thì đổi sang tình huống đã có.
- Ba câu ở mục kính ngữ cần người dạy tiếng Nhật duyệt lại.
- Bản đồ ở mục Lộ trình tô theo vùng chỉ để minh hoạ; `ExploreChapter` hiện chưa có trường vùng.
- Câu trả lời "Học trên điện thoại được không?" đang khuyên dùng Chrome trên máy tính hoặc Android. Thử Shadowing trên iPhone thật rồi sửa câu này cho đúng.
- Tên chương "Lần đầu đến Nhật Bản" và các địa điểm phải khớp dữ liệu chương thật.
- Thêm `<title>`, mô tả và ảnh chia sẻ (Open Graph) cho `/`.

## 9e. Đăng nhập, Đăng ký, Xác minh email, Quên mật khẩu (`AuthLayout` và các view auth)

Prototype: trong `prototype/AppPrototype.dc.html`, các trang `login`, `register`, `verify`, `forgot` (khối `.auth`). Bản tương tác mở từ landing: "Bắt đầu miễn phí" sang Đăng ký, "Đăng nhập" sang Đăng nhập. "Đăng xuất" trong menu tài khoản và trong Hồ sơ quay về landing.

Chỉ đổi giao diện. Giữ nguyên logic trong `LoginView`, `RegisterView`, `EmailVerificationPendingView`, `ForgotPasswordView` và `AuthContext`: Google, kiểm tra mật khẩu tối thiểu 6 ký tự và khớp nhau, gửi lại email xác thực có đếm ngược, thông báo lỗi.

- **Bố cục chung:** chia hai phần, `data-theme="kham-pha"`.
  - Trái: nền `--paper-100`, bản đồ Nhật vẽ từ `PREFECTURES` (Kanto tô `--sora`), 4 ghim 宿 食 駅 医 như phần đầu landing (không còn tô Kanto hay đường đỏ son), ba con dấu minh hoạ コンビニ, 駅, 食堂, logo JCAP (bấm về landing). Câu ở góc dưới đổi theo trang: Đăng ký "Đường ngàn dặm cũng bắt đầu từ một câu nói", Đăng nhập "Hành trình của bạn vẫn đang chờ.", Quên mật khẩu "Lấy lại tài khoản, đi tiếp hành trình."
  - Phải: cột 560px, khung form rộng tối đa 400px, căn giữa.
- **Vừa một màn hình, không phải cuộn:** khung form tối đa 420px, khoảng cách 14px, ô nhập cao 44px. Ở trang Đăng ký, hai ô mật khẩu nằm cạnh nhau, gợi ý ghi chung bên dưới. Khi chiều cao cửa sổ ≤ 720px thì ẩn dòng mô tả dưới tiêu đề và giảm khoảng cách còn 10px. Nghiệm thu ở 1366×650 và 1280×600: không có thanh cuộn.
- **Ô nhập:** cao 44px, bo 12px, có icon ở đầu, nhãn ở trên, viền `--ai` và vòng `--ai-soft` khi focus. Ô mật khẩu có nút mắt hiện/ẩn, nhãn đổi giữa "Hiện mật khẩu" và "Ẩn mật khẩu". Dùng `TextField` của design system, truyền nút mắt vào `trailing`.
- **Nút Google:** viền mảnh, cao 48px, dùng logo Google sẵn có trong `LoginView` (prototype để icon tạm).
- **Đăng nhập:** tiêu đề "Chào mừng quay lại", nút Google, "hoặc", Email, Mật khẩu (link "Quên mật khẩu?" nằm cùng hàng nhãn), nút "Đăng nhập", dòng "Chưa có tài khoản? Đăng ký miễn phí". Sau khi xác minh email thì hiện khung xanh "Email đã được xác minh. Bạn có thể đăng nhập." Các thông báo lỗi và nút gửi lại email xác thực hiện có thì đặt ngay dưới tiêu đề, cùng kiểu khung.
- **Đăng ký:** tiêu đề "Tạo tài khoản", dòng "Miễn phí. Bắt đầu từ chương đầu tiên trên bản đồ.", nút Google, "hoặc đăng ký bằng email", Họ và tên, Email, Mật khẩu (gợi ý "Tối thiểu 6 ký tự."), Nhập lại mật khẩu, nút "Tạo tài khoản", dòng "Đã có tài khoản? Đăng nhập".
- **Kiểm tra email:** icon thư trong ô vuông `--ai-soft`, tiêu đề "Kiểm tra email của bạn", email in đậm, gợi ý xem thư mục Spam, nút "Gửi lại email xác thực" (khi đang đếm ngược thì vô hiệu và ghi số giây), nút "Quay lại đăng nhập". Khung đứt nét "Bản tương tác: giả lập…" chỉ có trong prototype, không làm.
- **Quên mật khẩu:** tiêu đề "Quên mật khẩu?", ô Email, nút "Gửi hướng dẫn đặt lại", khung xanh xác nhận đã gửi, nút "Quay lại đăng nhập".
- **Chuyển trang:** landing và auth mờ vào 280ms. Khi `prefers-reduced-motion` thì hiện ngay.
- **Điện thoại (≤ 760px):** ẩn phần hình bên trái, form chiếm toàn màn (lề 20px).


## 9f. Trang Kết quả (`/roleplay/results`, `?tab=shadowing`), vòng 3 (bản dùng)

Theo `design-handoff/BRIEF-ket-qua.md`. Prototype: `prototype/KetQua.dc.html` (bấm Play: đổi tab, lọc, phân trang, xem lại từng câu) và trang "Kết quả" trong `prototype/AppPrototype.dc.html`. Canvas: hàng "Kết quả vòng 3" có bản sáng, tối, 390px và trạng thái. Vòng 1 và vòng 2 (A, B) vẫn trên canvas để tham khảo, **không làm theo**.

**Ý chính:** gọn và dễ hiểu. Trang trả lời ba câu hỏi theo thứ tự: mình đã luyện đến đâu và nên làm gì tiếp, kỹ năng nào ổn và kỹ năng nào cần luyện, từng buổi ra sao. Không biểu đồ, không khối tối, không nhãn "đề xuất".

**Khung trang:** tiêu đề "Kết quả", mô tả, `SegmentedControl` hai tab (Hội thoại AI `forum`, Shadowing `record_voice_over`), giá trị lưu ở `?tab=`. Cột nội dung tối đa 1180px. Hai tab cùng nhịp: khối tóm tắt → tiêu đề "Các buổi đã luyện" + số buổi + bộ lọc → danh sách → phân trang.

**Tab Hội thoại AI**
1. **Khối tóm tắt** (nền `--ai-soft`, bo `--radius-xl`, đệm 22/24px): ô chữ Hán biểu trưng 56px nền `--paper-50`, câu "Bạn đã hoàn thành **12 buổi** Hội thoại AI. Buổi tiếp theo nên luyện: **{nextRecommendedScenarioTitle}**." (16/26px), dòng phụ "Gợi ý dựa trên các kỹ năng bên dưới." và nút primary "Luyện ngay". Không có `nextRecommendedScenarioTitle` thì chỉ giữ câu đầu, ẩn nút.
2. **"Kỹ năng của bạn"** (tiêu đề 20px, bên phải "Cập nhật sau mỗi buổi Hội thoại AI"): ba thẻ ngang nhau.
   - Phản xạ (`speakingReflexIndex`/100): "Bạn trả lời nhanh và tự nhiên đến đâu."
   - Trợ từ (`particleAccuracyRate`%): "Dùng đúng は, が, を, に, で trong câu nói."
   - Kính ngữ (`keigoCommandScore`%): "Nói lịch sự đúng mức với từng người."
   - Mỗi thẻ: tên 16px đậm, nhãn mức bên phải (≥ 80 "Tốt" `--score-good`, ≥ 60 "Khá" `--score-mid`, < 60 "Cần luyện thêm" `--score-low`, nền `*-soft`, bo tròn), số 40px font Lora, `ProgressBar` sm, câu giải thích 14px `--sumi-muted`.
   - Dưới ba thẻ, một dòng: "Bạn làm tốt:" + `Badge` success (`strengths`), "Nên chú ý:" + `Badge` warning (`targetFocusAreas`).
   - Số buổi (`totalSessionsCompleted`) đã nằm trong khối tóm tắt. `totalPracticeTurns` không hiện để trang gọn.
3. **"Các buổi đã luyện"** + `totalCount`, bên phải `SegmentedControl` sm Tất cả / Đạt chuẩn / Cần rèn luyện (có `count`). Danh sách là một tờ, mỗi dòng là một nút (→ `/roleplay/results/:id`):
   - ô chữ Hán 44px · tên tình huống 16px đậm, dưới là thời điểm thân thiện ("Hôm nay, 21:40", "Hôm qua, 20:15", ngày cũ hơn ghi "18/11, 22:02") + `JlptBadge` · bên phải "86 điểm" (18px đậm) và tên hạng (極 Xuất sắc, 優 Ưu tú, 良 Khá tốt, 可 Đạt chuẩn, 研 Cần rèn luyện thêm) · triện 40px (đạt: mực son, chưa đạt: ô nét đứt) · `chevron_right`.
   - 8 dòng mỗi trang, phân trang bằng `IconButton` + "Trang 1 trên 2".

**Tab Shadowing**
1. **Khối tóm tắt** một tờ: `ScoreRing` 72px + "Điểm trung bình", "Tính trên N buổi đã luyện" | số phút (Lora 40px) + "phút luyện tổng cộng", "N câu đã được chấm". Chưa có buổi thì không hiện khối (xem trạng thái).
2. **"Các buổi đã luyện"** + số buổi, bên phải ô tìm (`TextField` icon `search`) và `SegmentedControl` sm Tất cả / N5 / N4 / N3. Đã bỏ bộ lọc và hai cột "Giáo trình", "Bài học".
3. Mỗi dòng: tên bài (`dialogueTitle`), dòng phụ "Hôm qua, 21:05" + `JlptBadge` + "Vai A, {scenarioTitle}" · bên phải "84 điểm" + "Hạng A, rất tốt" (bản ghi cũ: "Bản ghi cũ") · nút ghost sm "Xem lại từng câu"/"Thu gọn" (icon `expand_more` xoay khi mở, `aria-expanded`) và secondary sm "Luyện lại". Thời lượng, số câu, độ khớp **không hiện trên dòng** để dòng gọn; chúng nằm trong phần mở.
4. Phần mở (nền dòng đổi `--paper-100`): một câu tóm tắt "6/6 câu đã chấm, khớp nội dung 92%, luyện 3 phút 20 giây" (bỏ phần nào không có dữ liệu), rồi mỗi câu một thẻ: `WordDiff` (chú thích chỉ ở câu đầu), "Bạn đã nói: …", nghĩa tiếng Việt, nhận xét (nền `--ai-soft`, icon `tips_and_updates`) khi có; bên phải nhãn điểm (Tốt/Khá/Cần sửa theo `--score-*`) và `AudioPlayer` chip "Nghe mẫu". Cuối là nút primary "Luyện lại cả bài".

**Trạng thái:** đang tải (`Skeleton` đặt đúng bố cục: tờ có 4 cột và 4 dòng), lỗi (`Alert` danger + nút "Thử lại"), học viên mới (`EmptyState` + nút "Chọn tình huống để luyện" / "Mở thư viện Shadowing", không hiện số 0), rỗng theo bộ lọc (câu giải thích đổi theo bộ lọc, nút "Xem tất cả" và "Bắt đầu một buổi Hội thoại AI"), tìm không ra (nút "Xoá bộ lọc").

**Điện thoại (≤ 760px):** thanh bên ẩn, có `AppHeader` trên và `BottomNav` dưới. Khối tóm tắt xếp dọc, nút "Luyện ngay" giãn hết chiều ngang. Ba thẻ kỹ năng xếp dọc. Dòng Hội thoại AI giữ ô chữ Hán, tên, điểm; ẩn triện và mũi tên. Dòng Shadowing: tên và điểm trên, hai nút chia đôi bên dưới. Ô tìm và bộ lọc JLPT xếp dọc, giãn hết chiều ngang.

**Chế độ tối:** `hoc-tap-dem` cộng các màu tối bổ sung: `--shu:#e2674f; --success:#6cc7a8; --success-soft:#173029; --warning:#e5ad55; --warning-soft:#3a2d16; --danger:#f2958a; --danger-soft:#3d1f1b; --info:#8cc3e8; --score-good:#6cc7bf; --score-good-soft:#163130; --score-mid:#e5ad55; --score-mid-soft:#3a2d16; --score-low:#f2958a; --score-low-soft:#3d1f1b; --n5:#9ccf8f; --n5-soft:#1f2e1c; --n4:#86c4dc; --n4-soft:#17303a; --n3:#c7a6ea; --n3-soft:#2c2338`. Triện bỏ `mix-blend-mode: multiply`.

**Font:** số lớn (điểm kỹ năng, số phút) dùng Lora 600 như landing; còn lại Be Vietnam Pro.

**Không làm:** biểu đồ, điểm Phát âm/Ngữ điệu cho Shadowing, nút xoá kết quả, các phần "Đề xuất" của vòng 1 và 2.

Cần kiểm tra: thứ tự đoán chữ Hán biểu trưng ("hỏi đường" xét trước "ga"); "Hôm nay/Hôm qua" tính theo giờ máy người dùng.

## 9g. Shadowing tại mốc: khung chat cạnh ngăn thông tin trên bản đồ (bản chốt)

Prototype: `prototype/ShadowingTaiMoc.dc.html` (bấm Play, rồi "Luyện Shadowing" ở thẻ mốc 1). Nút "Tình huống demo" ở góc dưới trái chỉ có trong prototype, **không làm** trong app. Brief gốc: `BRIEF-shadowing-tai-moc.md`; chỗ nào brief khác mục này thì làm theo mục này (bố cục đã đổi sau góp ý).

**Nguyên tắc**
- Bản đồ tỉnh và ngăn thông tin bên phải **giữ nguyên như hiện tại**. Không thêm tab, không đổi nội dung ngăn.
- Không đổi API, cách chấm, cách tính điểm buổi, điều kiện nhận con dấu. Dùng lại `shadowingService`, logic thu âm, gửi chấm, lưu buổi đang có trong `views/shadowing/LearnerShadowingPracticeView.tsx` (nên tách thành hook dùng chung, ví dụ `useShadowingSession`, rồi cho cả trang cũ lẫn khung mới cùng dùng).
- Chỉ dùng token. Màu bản đồ lấy từ `views/explore/exploreTheme.ts` (`T.sea`, `T.paper`, `T.card`, `REGION_STYLE.kanto`…), chữ và nút dùng token `kham-pha`.

**Bố cục (1440px)**
```
| dải bản đồ | trang ghi chú 380 | 14 | tab 34 | khung chat 540 | 12 | ngăn thông tin 440 | 16 |
```
- Ngăn thông tin: như cũ, `right:16px; top/bottom:16px; width:clamp(380px,30.5vw,440px)`.
- Khung chat: `width:clamp(420px,37.5vw,540px)`, cách ngăn thông tin 12px, cao bằng ngăn, `radius 18px`, nền `--paper-100` **trơn** (không chấm), bóng như ngăn thông tin.
- Mở khung chat: bản đồ trượt sang trái (`transform`, 450ms) để mốc đang luyện nằm trong dải bản đồ còn lại; khung chat trượt vào từ phải 56px + mờ dần, 320ms; đóng 220ms. Giảm chuyển động: chỉ mờ dần.
- Ở thẻ mốc trong ngăn thông tin, khi khung chat đang mở, nút "Luyện Shadowing" đổi thành ô viền đứt "Đang luyện ở khung bên cạnh". Ghim mốc trên bản đồ có nhãn "Đang luyện".
- Đóng khung giữa chừng: không hỏi (trừ khi có bản thu chưa gửi). Hiện thông báo trên bản đồ "Đã lưu. Lần sau bạn tiếp tục từ câu N." và nút ở thẻ mốc thành "Tiếp tục (câu N/3)".
- ≤760px: khung chat phủ màn; 5 tab ghi chú thành một hàng dưới tiêu đề; trang ghi chú mở dạng bottom sheet 72%.

**Tiêu đề khung chat**: chỉ tên bài "Thủ tục nhập cảnh" (18px, 700) + tên tiếng Nhật nhỏ màu `kanto-ink` chữ Mincho, nút đóng bên phải. Không có thanh nền, chỉ một đường kẻ mảnh thụt 26px hai bên.

**Hội thoại**
- Câu nhân vật: avatar tròn 44px nền `kanto-ink` chữ Mincho; bóng thoại nền `card` viền `line`.
- Câu của bạn: avatar "Bạn" nền `sumi`; bóng thoại nền `sumi` chữ trắng, luôn hiện **câu mẫu** (không thay bằng chữ nhận dạng). Điểm hiện thành viên nhỏ cạnh tên: "88 điểm" màu theo tier backend (green/yellow/red), hoặc "Chưa chấm được".
- Câu đang tới: viền đứt `--ai`, nhãn "Lượt của bạn".
- Dưới mỗi câu: "Nghe mẫu", "Dịch"; câu của bạn thêm nút micro để nói lại. Bấm câu đã chấm thì mở ghi chú Kết quả đúng câu đó.
- Chưa nói câu nào: thẻ mở đầu ở giữa khung (hai vai, câu mô tả bài `sourceDescription`, số câu của bạn, ngưỡng 60, `estimatedMinutes`).
- Khung thu âm ở đáy: viền đứt `line-strong`, các trạng thái giữ như mục 8 (sẵn sàng, đang thu, đã thu, đang chấm, có điểm, không chấm được do bản thu/hệ thống, chưa cấp micro). Câu nhân vật tự phát rồi chuyển lượt.

**Tab ghi chú (bên trái khung chat)**
- 5 tab: Bối cảnh 背景 (`--nami`), Cả bài 台本 (`--ai`), Từ vựng 単語 (`kanto-ink`), Ngữ pháp 文法 (`--n3`), Kết quả 結果 (`--shu`).
- Lúc thường: mỗi tab chỉ nhô 34px khỏi mép khung chat, hiện hai chữ Hán viết dọc (`writing-mode: vertical-rl`) màu của tab. Tab cao 64px, cách nhau 14px, bắt đầu từ top 96px.
- Rê chuột hoặc focus: chỉ tab đó trượt ra (rộng 132px) hiện thêm tên tiếng Việt và một vạch màu ở mép trái (`transform`, 200ms).
- Đang mở: tab tô màu của nó, chữ trắng, nhô thêm 14px để chạm vào trang ghi chú. Bấm lại để gấp. Mới vào phòng không mở sẵn trang nào.
- Tab Kết quả có chấm đỏ khi vừa có điểm mới mà trang Kết quả chưa mở.
- `button` có `aria-expanded`, `aria-controls`, `aria-label` là tên tiếng Việt.

**Trang ghi chú**: nền `card`, chỉ có một lề đỏ mảnh ở x=31px như trang sổ, cách cột tab 14px. Tiêu đề = chữ Hán màu tab + tên, gạch chân 2px màu tab. Nội dung dạng chữ, ngăn bằng đường kẻ mảnh, không bọc trong hộp.
- Bối cảnh: tên mốc + tên Nhật, `lesson.situation`, "Dùng khi" (`lesson.realUse`), câu mẫu dạng trích dẫn + `grammarNote`, hai vai trong bài, dòng "Bạn đóng vai … · Đổi vai".
- Cả bài: các câu của dialogue (vai, câu Nhật có furigana, nghĩa); câu của bạn đánh dấu bằng vạch `--ai` bên trái.
- Từ vựng, Ngữ pháp: lấy từ `dialogue.vocabularies` / `grammars`. Bài "Thủ tục nhập cảnh" hiện chưa có dữ liệu này; prototype lấy tạm từ các câu của bài. Khi thiếu dữ liệu thì hiện EmptyState, **không tự sinh**.
- Kết quả: giống mục "Chi tiết từng câu" của modal tổng kết hiện có: "Câu đã chấm x/N" kèm số khớp tốt / một phần / cần luyện lại, "Độ khớp nội dung %" có thanh và câu "Tính trên tất cả câu của vai bạn, câu chưa chấm tính 0.". Danh sách câu: Câu i/N, chip điểm hoặc "Chưa chấm", "thử n lần", câu mẫu, Nghe bạn / Nghe mẫu / Luyện lại câu; mở ra thì có `JapaneseSentenceDiffView`, chữ hệ thống nghe được, romaji, nghĩa.

**Tổng kết cuối khung chat** (thay cho modal hiện tại khi luyện tại mốc). Chỉ dùng số liệu backend trả về, đúng các trường của modal và `SessionSummaryPanel`:
1. Con dấu mốc (nếu nhận được), đóng cộp sau khi server xác nhận.
2. "Hoàn thành bài luyện!" (hoặc "Buổi luyện đã kết thúc" khi chưa chấm câu nào), dòng "Thủ tục nhập cảnh · JLPT N5 · Vai A (Người nhập cảnh)", trạng thái lưu lịch sử.
3. Một dòng về con dấu của mốc (đã nhận / còn thiếu bao nhiêu điểm / còn câu chưa chấm / còn bước Hiểu câu mẫu + nút "Tôi đã hiểu" / lưu lỗi + "Lưu lại").
4. Điểm buổi /100 + `sessionRankTitle`, Câu đã chấm, Độ khớp nội dung, Thời gian luyện (phút : giây).
5. Cảnh báo micro khi `gateStatus === 'needs_retry'`.
6. Câu nên luyện lại (`sentencesToRetry`), "Lỗi trong buổi" (`errorTypeCounts`, nhãn như `SessionSummaryPanel`), nút `AiSessionReview`.
7. Liên kết "Xem chi tiết từng câu" (mở ghi chú Kết quả). Nút: "Luyện lại bài này", "Đổi sang vai (B)", "Xong" (đóng khung chat, về bản đồ).

**Thanh cuộn** (ngăn thông tin, trang ghi chú, hội thoại): ẩn khi không rê chuột; khi rê chuột là nét 4px bo tròn màu `line-strong` 45%, rê lên nét thì sang `kanto-ink`; không mũi tên, không rãnh. Firefox: `scrollbar-width: thin`. Mép dưới ngăn thông tin và trang ghi chú mờ dần 28px.

**Không làm trong bước này**: bảng "Tình huống demo", Đến mốc tiếp theo, lưu Flashcard, các mục ghi "đề xuất" trong brief.

## 9h. Diễn đàn (`/community`, `CommunityForumView`)

Prototype: `prototype/DienDan.dc.html` (bấm Play để thử lọc kênh, tìm, thích, mở bài, bình luận, trả lời, đăng bài, xoá, xem ảnh). Brief: `BRIEF-dien-dan.md`. Chỗ nào brief khác mục này thì **làm theo mục này** (màu, vị trí nút đã đổi sau góp ý).

**Trước khi làm**
- Diễn đàn là code của AkaiZed (cả `CommunityForumView` lẫn `CommunityController`). Phải trao đổi với bạn ấy trước khi sửa.
- Chỉ đổi giao diện và cách hiển thị. Không đổi API `/api/community`, DTO hay quyền phía server.
- Xoá bài hiện xoá hẳn khỏi database, trái quy tắc SoftDelete. Đây là việc của backend, báo AkaiZed, **không sửa trong bước này**.

**Xem các trạng thái trong prototype**: sửa object state trong `constructor` cuối file:
- `role: 'admin'`: màn admin.
- `dark: true`: chế độ tối.
- `mode: 'loading'` hoặc `mode: 'error'`: đang tải, lỗi máy chủ.
- `open: 2`: mở sẵn một bài.
- `cmp: {open: true, …}`: mở khung soạn bài.

Mở file ở bề rộng 390px để xem bản điện thoại. Ảnh "trang ghi chú" trong prototype chỉ thay cho ảnh thật; trong app dùng `<img>` với `object-fit: cover`.

**Màu**
- Theme `kham-pha` (nền giấy ấm, mực chàm, nút chính `--ai` #26497b như landing), **không** dùng `hoc-tap` như brief ghi.
- Chế độ tối: `hoc-tap-dem`, và trong khu Diễn đàn đặt lại `--ai: var(--sora); --on-ai: var(--on-sora)` để điểm nhấn là màu cát, không phải xanh.
- Đặt `--ai-soft: color-mix(in srgb, var(--ai) 12%, var(--paper-50))` và `--focus: var(--ai)` trong khu Diễn đàn.
- Tỉ lệ: giấy 60, mực 30, điểm nhấn 10. Chàm cho thao tác (Đăng bài, đã thích, bài mới). Son `--shu` chỉ cho "Đã ghim" và mục đang chọn ở thanh bên.
- 5 kênh lấy từ bộ màu khắc gỗ `WOODBLOCK` trong `views/explore/exploreTheme.ts`. Import từ đó, **không chép mã hex mới**:

| Kênh | Vùng trong WOODBLOCK | Icon (Material Symbols Rounded) |
|---|---|---|
| `QA_JAPANESE` Hỏi đáp Tiếng Nhật | hokkaido (chàm) | `quiz` |
| `SPEAKING_TIPS` Kinh nghiệm Luyện nói | chugoku (xanh thông) | `record_voice_over` |
| `STUDY_BUDDY` Tìm bạn cùng học | kanto (đỏ gạch) | `diversity_3` |
| `RESOURCES` Tài liệu & JLPT | chubu (vàng đất) | `menu_book` |
| `LOUNGE` Góc Trò chuyện | kansai (tím mận) | `local_cafe` |

  - Sáng: chữ và icon màu `ink`, nền ô icon `color-mix(fill 55%, --paper-50)`.
  - Tối: chữ màu `fill`, nền `color-mix(ink 55%, --paper-50)`.
  - Kênh luôn đi kèm icon và tên, không phân biệt chỉ bằng màu.
- Avatar chữ cái và ô icon loại tệp dùng cùng bộ màu này: PDF kanto, Word hokkaido, ảnh chugoku. Riêng avatar của mình dùng `--sora`, avatar admin dùng `--ai`.

**Bố cục 1440px**
```
| thanh bên 240 | 40 | cột kênh 264 | 32 | cột bài (còn lại) | 40 |      (khối giữa tối đa 1100px, căn giữa)
```
- Đầu trang: "Diễn đàn" 28/38 700 + "掲示板" chữ Mincho 17px màu `--sumi-muted`. Dòng mô tả: "Hỏi đáp, mẹo luyện nói và bạn cùng học." **Không** có nút nào ở đầu trang.
- **Cột kênh** (sticky top 24px), mỗi kênh một hàng cao tối thiểu 44px:
  - Nội dung hàng: ô icon 28px bo 8, tên 14px 600 (cắt bằng …), số bài bên phải.
  - Kênh đang chọn: nền `--paper-50`, viền 1px `--line` + `--shadow-sm`, ô icon tô đặc màu kênh.
  - Mô tả kênh chỉ hiện dưới tên của kênh đang chọn (12/17 `--sumi-muted`). Kênh khác hiện mô tả qua `title`. "Tất cả" không có mô tả.
  - Dưới danh sách là liên kết "Hỗ trợ kỹ thuật" (icon `support_agent` + chữ, 13px 600, `--sumi-muted`, cao 36px, bo tròn). Rê chuột thì nền `--paper-200`; `title="Báo lỗi ứng dụng hoặc thanh toán"`. Dẫn sang `/feedback`, chỉ học viên thấy.
- **Ô đăng nhanh**: một viên bo tròn cao 56px.
  - Thành phần: nền `--paper-50`, viền 1px `--line` + `--shadow-sm`, avatar 32px, câu gợi ý "Bạn muốn hỏi hay chia sẻ điều gì?", nút `Button primary sm` "Đăng bài" (icon `edit_square`) bo tròn nằm trong viên.
  - Bấm chỗ nào cũng mở khung soạn bài. Đây là nút đăng bài duy nhất trên máy tính.
- **Hàng công cụ**: bên phải là `SegmentedControl sm` "Nổi bật / Mới nhất" và `IconButton` kính lúp.
  - `SegmentedControl` (icon `local_fire_department` / `schedule`): bỏ nền xám, các lựa chọn bo tròn, lựa chọn đang bật nền `--paper-50` viền `--line`.
  - `IconButton` kính lúp: ghost, tròn 36px, `aria-label="Tìm bài hoặc tác giả"`.
  - Không có chữ "Sắp xếp" hay tên danh sách.
  - Bấm kính lúp: ô tìm bo tròn cao 40px mở ra bên trái (mờ dần + giãn từ phải, 180ms), con trỏ vào sẵn. Câu gợi ý "Tìm bài hoặc tác giả", `aria-label` đầy đủ.
  - Có nút × để đóng (xoá từ khoá). Esc cũng đóng. Còn từ khoá thì ô luôn mở.
  - Đang tìm: hiện dòng "n bài khớp với “…”" (thêm "trong kênh X" nếu đang lọc).
- **Bài mới khi tự làm mới 8 giây**:
  - Không chèn thẳng vào danh sách. Giữ các bài mới trong một biến chờ, hiện nút nổi `--ai` "Có n bài thảo luận mới" (icon `arrow_upward`), sticky ở đầu cột bài.
  - Bấm nút thì mới chèn bài mới vào danh sách.
  - Bình luận mới của bài đang mở thì cập nhật luôn.

**Thẻ bài** (`--paper-50`, viền 1px `--line`, `--radius-lg`, đệm 16/20/8, cách nhau 12px; rê chuột viền `--line-strong`; đang mở thêm `--shadow-md`)
1. Đầu thẻ:
   - Avatar 40px. Ẩn danh: nền `--paper-200`, viền trong `--line-strong`, icon `person`.
   - Tên 14px 700 + `JlptBadge sm`, hoặc `Badge ai` "Admin" (icon `shield_person`).
   - Bài của mình thêm chữ nhỏ "(bạn)", hoặc "(bạn, đăng ẩn danh)" khi `isOwnPost` và ẩn danh.
   - Dòng dưới: thời gian · nhãn kênh (icon 16px + tên, màu kênh, 600).
   - Bên phải: `IconButton more_horiz` "Tuỳ chọn bài", chỉ hiện khi có quyền. Menu gồm "Ghim lên đầu" / "Bỏ ghim" (admin) và "Xoá bài" (tác giả hoặc admin, màu `--danger`).
2. Nhãn: `Badge shu` "Đã ghim" (icon `push_pin`), `Badge success` "Đã giải đáp" (icon `check_circle`, chỉ kênh Hỏi đáp).
3. Tiêu đề 17/26 700 là một `<button>` có `aria-expanded`. Nội dung rút gọn 2 dòng màu `--sumi-muted`; khi mở hiện đủ, `white-space: pre-line`, màu `--sumi`.
4. Ảnh: ô xem trước 132×96 bo 12, khi mở 260×190 (điện thoại 100%, tỉ lệ 4:3). Rê chuột hiện icon `zoom_in`. Bấm thì mở xem ảnh.
5. Tệp: hàng viền `--line` nền `--paper-100`, ô icon theo loại 36px, tên (cắt …), "PDF · 412 KB", `IconButton download`.
6. Hàng thao tác (nút tròn cao 36px, điện thoại 44px):
   - Thích: icon `thumb_up` + số. Đã thích thì màu `--ai`, nền `--ai-soft`, icon đặc. `aria-pressed`, `aria-label` "Thích bài này. n lượt thích".
   - Số bình luận (icon `chat_bubble`), bấm để mở bài.
   - "Đánh dấu đã giải đáp" màu `--success`: chỉ kênh Hỏi đáp, tác giả hoặc admin. Khi đã đánh dấu thì nền `--success-soft`.
   - Bên phải: "Xem bài" / "Thu gọn" + `expand_more` / `expand_less`.
   - **Không hiện lượt xem.**
7. Thứ tự: bài ghim luôn đầu. Nổi bật = thích × 2 + bình luận × 3; Mới nhất theo ngày đăng. Bài vừa đăng đứng ngay sau bài ghim.

**Bình luận** (trong thẻ đang mở, ngăn bằng đường kẻ `--line`)
- Tiêu đề "Bình luận" + số trong viên `--paper-200`. Chưa có thì hiện hộp `--paper-100` "Hãy là người đầu tiên chia sẻ ý kiến."
- Mỗi bình luận:
  - Avatar 32px, tên 700 + nhãn cấp, thời gian 12px.
  - Nội dung 15/24 `pre-line`, đính kèm, nút chữ "Trả lời" (icon `reply`).
  - Trả lời một cấp: thụt 44px, đường kẻ trái 2px `--line`. Trả lời một câu trả lời thì vẫn gắn vào bình luận gốc.
- Ô viết (nền `--paper-100` bo 14):
  - Dòng "Đang trả lời **@tên**" + nút × khi đang trả lời.
  - Ô nhiều dòng (`jc-input--multi`). Câu gợi ý đổi theo người đang trả lời.
  - Hàng dưới: `IconButton attach_file`, `Switch` "Bình luận ẩn danh" (không có với admin; khi bật thì avatar đổi sang ẩn danh), nút `Button primary sm` "Gửi" (khoá khi rỗng, `loading` khi đang gửi).
  - Gửi lỗi: hộp `--danger-soft` "Chưa gửi được bình luận. Nội dung bạn viết vẫn còn ở đây." + nút "Gửi lại". Không xoá nội dung.

**Khung soạn bài** (`Modal lg`; điện thoại phủ toàn màn, nút ở đáy xếp dọc)
- "Chọn kênh": 5 thẻ dạng `role="radio"` (2 cột, điện thoại 1 cột), mỗi thẻ có ô icon, tên, mô tả. Thẻ đang chọn: viền 2px màu kênh, nền màu kênh nhạt, dấu `check_circle`. Mặc định là kênh đang lọc, còn không thì Hỏi đáp.
- Tiêu đề (bắt buộc, `maxlength=290`, bộ đếm "n/290 ký tự" bên phải, trên 260 thì màu `--warning`). Nội dung (bắt buộc), câu gợi ý "Chép nguyên câu tiếng Nhật, ghi tên bài học và chỗ bạn chưa hiểu."
- Đính kèm:
  - Ô viền đứt "Thêm ảnh hoặc tệp" + dòng "Ảnh, PDF, TXT, DOC, DOCX. Mỗi tệp tối đa 5MB, chọn được nhiều tệp."
  - Mỗi tệp một hàng: ảnh có hình thu nhỏ 48px, tệp khác có ô icon. Trạng thái "Đang tải lên" kèm thanh chạy, "Đã tải lên" kèm dấu xanh, hoặc lỗi "Tệp 7,8 MB, lớn hơn 5MB. Hãy chọn tệp nhỏ hơn." (hàng viền và nền `--danger`).
  - Mỗi hàng có nút × để bỏ. **Bỏ `alert()`.**
- `Switch` "Đăng ẩn danh" + mô tả "Mọi người sẽ thấy “Thành viên ẩn danh #…”, không thấy tên và ảnh đại diện của bạn." Admin không có.
- Lỗi đăng: `Alert danger` "Chưa đăng được bài" ở cuối, giữ nguyên nội dung.
- Chân: dòng lý do bên trái ("Cần có tiêu đề và nội dung để đăng.", "Đợi tệp tải lên xong rồi đăng.", "Tệp lỗi sẽ không được đính kèm."), "Huỷ", "Đăng bài" (khoá khi thiếu hoặc đang tải tệp).
- Đăng xong: đóng hộp, bài nằm ngay sau bài ghim, `Toast` "Đã đăng bài thảo luận".

**Trạng thái khác**
- Đang tải lần đầu: 3 thẻ `Skeleton`.
- Lỗi máy chủ:
  - Khung `EmptyState` viền đứt, icon `cloud_off`, "Chưa tải được Diễn đàn", nút "Thử lại".
  - **Bỏ dữ liệu mẫu lưu trong trình duyệt.**
- Kênh rỗng: icon `forum`, "Chưa có bài thảo luận nào ở mục này", nút "Đăng bài thảo luận".
- Tìm không ra:
  - Icon `search_off`, "Không tìm thấy bài nào khớp với “…”".
  - Câu gợi ý đổi theo đang lọc kênh hay không.
  - Nút "Tìm ở tất cả kênh" (khi đang lọc kênh) và "Xoá từ khoá".
- Xoá bài: `Modal sm` tone danger, "Xoá bài thảo luận?", "Bài “…” cùng n bình luận sẽ bị xoá. Bạn không khôi phục lại được." (không có bình luận thì bỏ vế đó). Nút "Huỷ" / "Xoá bài". **Tác giả cũng thấy nút Xoá** (dựa vào `isOwnPost`), không chỉ admin.
- Xem ảnh: phủ `--scrim`, thanh trên nền `--paper-50` (tên tệp, "Esc để đóng", nút đóng), ảnh giữa màn bo 12 `--shadow-lg`, chú thích "Ảnh i/n trong bài “…”". Esc đóng, focus quay lại ô ảnh vừa bấm.
- Toast cho: đã đăng, đã xoá, đã ghim / bỏ ghim, đã đánh dấu / bỏ đánh dấu giải đáp.

**Điện thoại (≤760px)**
- Ẩn thanh bên. Thanh trên cao 56px: nút menu, logo JCAP, `IconButton support_agent` (học viên), avatar.
- Kênh thành hàng chip cuộn ngang. Chip đang chọn tô đặc màu kênh, chữ `--paper-50`. Mô tả kênh đang chọn hiện thành một dòng dưới hàng công cụ (ẩn khi xem Tất cả).
- Ẩn ô đăng nhanh. Thay bằng nút nổi "Đăng bài" (`--ai`, cao 56px, bo 18, góc dưới phải), ẩn khi đang mở một bài.
- Bình luận trả lời thụt ít hơn (8px + 14px).

**Component** (dựng mới trong `jcap-web/src/components/community/`, dùng lại component trong `components/jcap/`)
- `ChannelRail`: dùng `Icon`.
- `QuickComposer`: dùng `Button`.
- `ForumToolbar`: dùng `SegmentedControl` và `IconButton`; ô tìm dùng lớp `jc-input`.
- `PostCard`: dùng `Badge`, `JlptBadge`, `IconButton`, `Button`.
- `AttachmentList`, `ImagePreviewGrid`.
- `CommentThread`, `CommentComposer`: dùng `Switch`, `Button`, `IconButton`.
- `PostComposerModal`: dùng `Modal`, `TextField`, `Switch`, `Alert`.
- `DeletePostDialog`: dùng `Modal`.
- `ImageLightbox`.
- `NewPostsPill`.
- Trạng thái dùng `EmptyState`, `Skeleton`, `Toast`.

**Không làm**: thích bình luận, chọn câu trả lời hay nhất, lượt xem, trang riêng `/community/:id`, sửa bài, sửa/xoá bình luận, báo cáo, phân trang (mục 8 của brief), số người online, bảng xếp hạng.

## 9i. Hỗ trợ & Góp ý (`/feedback`, `LearnerFeedbackView`; `/admin/feedback`, `AdminFeedbackView`)

Prototype: `prototype/HoTro.dc.html`. Bấm Play để thử chọn phiếu, gửi tin kèm tệp, báo sự cố mới, gửi góp ý. Brief: `BRIEF-ho-tro.md`. Chỗ nào brief khác mục này thì **làm theo mục này** (bản đã tối giản sau góp ý).

**Trước khi làm**
- Phần này do AkaiZed viết toàn bộ, cả giao diện lẫn backend. Phải trao đổi với bạn ấy trước khi sửa.
- Chỉ đổi giao diện. Không đổi API `/api/feedback` và `/api/admin/feedback`, không đổi DTO, controller, service hay model.
- API tải tệp đính kèm dùng chung với Diễn đàn. Đây là việc của backend (trao đổi riêng với AkaiZed), **không sửa trong bước này**.

**Xem các trạng thái trong prototype.** Sửa object state trong `constructor` cuối file:

| Muốn xem | Đặt trong state |
|---|---|
| Màn admin | `role: 'admin'` |
| Phần Góp ý | `tab: 'fb'` |
| Chế độ tối | `dark: true` |
| Đang tải, lỗi tải | `mode: 'loading'`, `mode: 'error'` |
| Mở một phiếu | `sel: 2` (`sel: null` là chưa chọn phiếu) |
| Lọc theo trạng thái | `filter: 'CLOSED'` |
| Khung báo sự cố | `nw: {open: true, …}` |
| Bản điện thoại, màn nội dung phiếu | mở file ở 390px, đặt `mview: 'thread'` |

Ảnh "trang giấy" trong prototype chỉ thay cho ảnh thật. Trong app dùng `<img>` với `object-fit: cover`.

**Màu**
- Học viên: theme `kham-pha`. Chế độ tối dùng `hoc-tap-dem`, đặt lại `--ai`, `--ai-soft`, `--focus` giống Diễn đàn (mục 9h).
- Admin: theme `quan-tri`. Trong khu trang, đặt `--ai: color-mix(in srgb, var(--ai) 70%, var(--sumi))` để nút chính ra màu chàm đậm, không phải xanh sáng. `--ai-soft` cũng pha từ màu đó (10% trên `--paper-50`). Khai báo trên một phần tử con của phần tử có `data-theme`, để không tự tham chiếu vòng.
- Trạng thái luôn có icon kèm chữ, không chỉ màu:

| Trạng thái | Màu | Icon | Chữ |
|---|---|---|---|
| `PENDING` | `--warning` | `hourglass_top` | "Chờ Admin phản hồi". Ở danh sách học viên ghi "Chờ tiếp nhận" (icon `schedule`) hoặc "Admin đã xem" (icon `visibility`) theo `adminSeenAt` |
| `IN_PROGRESS` | `--ai` | `forum` | "Đang trò chuyện" |
| `CLOSED` | `--sumi-muted` | `check_circle` | "Đã đóng" |

- Loại sự cố chỉ dùng icon màu trung tính, không tô màu riêng:

| Loại | Icon |
|---|---|
| `PAYMENT_CREDIT` | `toll` |
| `SYSTEM_BUG` | `bug_report` |
| `SCENARIO_BUG` | `edit_note` |
| `AI_ASSESSMENT` | `graphic_eq` |
| `SUGGESTION` | `lightbulb` (tab Góp ý) |

**Bố cục 1440px**
```
| thanh bên 240 | 40 | danh sách 320 | 24 | nội dung phiếu (còn lại) | 40 |   (khối giữa tối đa 1230px; trang cao đúng 100vh, hai cột tự cuộn)
```
- **Đầu trang:** một dòng duy nhất.
  - Bên trái: "Hỗ trợ & Góp ý" 26/36 700, kèm "窓口" chữ Mincho 16px màu `--sumi-muted`. Admin ghi "Quản trị hỗ trợ" và không có chữ Hán.
  - Ngay cạnh tiêu đề là nút gạt dạng viên (nền `--paper-200`, phần đang chọn nền `--paper-50` + `--shadow-sm`), gồm "Sự cố n" và "Góp ý n". Dùng `role="tablist"`.
  - Admin có thêm hai `IconButton` bên phải: `refresh` "Tải lại" và `groups` "Quản lý Diễn đàn".
  - **Không** có dòng mô tả.
- **Cột danh sách:**
  - Học viên: trên cùng là nút "Báo sự cố mới" cao 44px, viền đứt 1.5px `--line-strong`, bo 14, icon `add`. Rê chuột thì viền liền màu `--ai`, nền `--ai-soft`.
  - Admin: thay nút đó bằng ô tìm bo tròn cao 40px, câu gợi ý "Tìm mã phiếu hoặc tiêu đề".
  - Lọc là một hàng chữ: "Tất cả n · Chờ n · Đang xử lý n · Đã đóng n" (13px, `role="radio"`). Mục đang chọn đậm, màu `--sumi`, gạch chân 2px. Không viền, không nền.
  - **Dòng phiếu** (bo 14, đệm 12):
    - Trái: ô icon loại 32px nền `--paper-200`. Khi dòng đang chọn thì ô icon nền `--ai-soft`, màu `--ai`.
    - Phải: tiêu đề 14/20 600 (tối đa 2 dòng). Dưới tiêu đề một dòng: [mã phiếu (chỉ admin)] + trạng thái có icon và màu + thời gian cập nhật.
    - Dòng đang chọn: nền `--paper-50`, viền 1px `--line` + `--shadow-sm`.
    - Admin: phiếu chưa có `adminSeenAt` có chấm `--shu` 8px ở góc phải, tiêu đề đậm hơn.
    - `aria-label` của dòng đọc đủ: tiêu đề, loại, trạng thái, thời gian.
  - Xếp theo ngày cập nhật, mới nhất trước. Khi mở trang thì tự chọn phiếu đầu danh sách.
- **Khung nội dung phiếu** (nền `--paper-50`, bo `--radius-xl`, viền 1px `--line` + `--shadow-sm`):
  - **Đầu phiếu:**
    - Tiêu đề 18/26 700.
    - Dưới tiêu đề một dòng 13px `--sumi-muted`: mã phiếu (viền mảnh `--line-strong`, bo 6, đậm, số `tabular-nums`), icon và tên loại, "Tạo …".
    - Góc phải: viên trạng thái (nền `--paper-100`, icon + chữ màu trạng thái).
    - Admin có thêm nút "Đóng phiếu" (`Button secondary sm`, icon `task_alt`) hoặc "Mở lại" (`Button primary sm`, icon `lock_open`).
  - **Luồng tin** (nền `--paper-100`):
    - Mở phiếu là thấy tin mới nhất. Dùng `flex-direction: column-reverse` cho khung cuộn.
    - Tin của mình nằm bên phải, nền `--ai-soft`, bo 16/4/16/16, chỉ có thời gian.
    - Tin của bên kia nằm bên trái, nền `--paper-50` viền `--line`, bo 4/16/16/16, có avatar 32px và tên. Học viên thấy "Ban Quản trị Hỗ trợ" với avatar `--ai` icon `support_agent`. Admin thấy "Học viên #ANON-…" với avatar ẩn danh icon `person`.
    - Đính kèm: ảnh xem trước 200×146 (bấm để phóng to), tệp là một hàng gồm icon loại, tên, dung lượng và `IconButton open_in_new` (mở ở tab mới).
    - Tin chỉ có tệp thì nội dung là "(Đính kèm tệp/ảnh)".
    - Các mốc hiện thành dòng nhỏ ở giữa, có đường kẻ hai bên: "Admin đã xem phiếu" (`adminSeenAt`), "Phiếu đã đóng" (ngày đóng), "Phiếu được mở lại".
  - **Ô trả lời:**
    - Một khung bo 22, viền trong 1px `--line-strong` (focus thì 2px `--ai`). Bên trong: `IconButton sm attach_file`, ô nhập tự giãn từ 1 dòng (tối đa 160px), `Button primary sm` "Gửi" bo tròn.
    - Câu gợi ý: học viên "Bổ sung thông tin cho Admin…", admin "Trả lời #ANON-…".
    - Tệp đã chọn hiện phía trên khung: hàng có trạng thái đang tải (thanh chạy), đã tải, hoặc lỗi ngay tại tệp ("Định dạng .mp4 chưa được hỗ trợ.", "Tệp 6,4 MB, lớn hơn 5MB. Hãy chọn tệp nhỏ hơn."), mỗi hàng có nút bỏ. **Bỏ `alert()`.**
    - Học viên: dưới khung có một dòng 12px "Bạn đang ẩn danh. Admin chỉ thấy mã #ANON-…" (icon `shield_person`), lấy đúng mã của phiếu đang mở.
    - "Gửi" khoá khi chưa có chữ và chưa có tệp đã tải, hoặc khi còn tệp đang tải, hoặc khi đang gửi.
    - Gửi lỗi: hộp `--danger-soft` "Chưa gửi được. Nội dung và tệp bạn chọn vẫn còn ở đây." + "Gửi lại".
  - **Phiếu đã đóng:** thay ô trả lời bằng một dòng gồm icon `task_alt` màu `--success` và chữ "Sự cố này đã được xử lý xong và đóng lại.", kèm nút "Báo sự cố mới". Admin thấy "Phiếu đã đóng. Mở lại để trả lời tiếp." + "Mở lại phiếu".
  - Admin mở một phiếu chưa xem thì gọi API đánh dấu đã xem. Học viên trả lời không đổi trạng thái. Admin trả lời phiếu `PENDING` thì phiếu sang `IN_PROGRESS`, đúng như server đang làm.
- **Tự tải lại mỗi 10 giây:** tin mới không làm mất chữ đang gõ.
  - Đang ở cuối luồng tin: thêm tin mới vào cuối.
  - Đã cuộn lên trên: hiện nút nổi `--ai` "Admin vừa trả lời" (icon `arrow_downward`) phía trên ô trả lời. Bấm thì cuộn xuống.
  - Không nhảy phiếu đang chọn.

**Khung "Báo sự cố mới"** (`Modal lg`; điện thoại phủ toàn màn, nút ở đáy xếp dọc)
- Loại sự cố: 4 thẻ `role="radio"` xếp 2 cột (điện thoại 1 cột), mỗi thẻ có ô icon, tên và dòng "Dùng cho" của brief. Mặc định "Gói học & Credit". Thẻ đang chọn có viền `--ai`, nền `--ai-soft`.
- Ngay dưới các thẻ có một dòng 13px: "Hỏi về ngữ pháp, từ vựng? **Hỏi tại Diễn đàn**". Đây là lối sang `/community`, thay cho nút ở đầu trang.
- Tiêu đề (bắt buộc, `maxlength=300`, bộ đếm "n/300 ký tự", trên 270 thì màu `--warning`). Mô tả chi tiết (bắt buộc), câu gợi ý "Điều gì đã xảy ra? Nếu có, ghi mã giao dịch hoặc tên bài học bị lỗi."
- Đính kèm:
  - Ô viền đứt "Thêm ảnh hoặc tệp", kèm dòng nhỏ "Ảnh, PDF, TXT, LOG, JSON, ZIP, DOC. Mỗi tệp tối đa 5MB."
  - Danh sách tệp như ở ô trả lời. Kiểm tra định dạng và dung lượng ngay khi chọn, trước khi tải lên.
- Một dòng ẩn danh 12px: "Ẩn danh: Admin chỉ thấy mã phiếu (dạng #ANON-1234), không thấy tên hay email của bạn."
- Lỗi gửi: `Alert danger` "Chưa gửi được yêu cầu", giữ nguyên nội dung.
- Chân hộp thoại:
  - Bên trái là dòng lý do: "Cần có tiêu đề và mô tả để gửi.", "Đợi tệp tải lên xong rồi gửi.", hoặc "Tệp lỗi sẽ không được gửi kèm."
  - Hai nút "Huỷ" và "Gửi yêu cầu".
- Gửi xong:
  - Đóng hộp thoại. Phiếu mới đứng đầu danh sách và được chọn, bộ lọc về "Tất cả".
  - Hiện `Toast` "Đã gửi phiếu #ANON-…. Admin sẽ trả lời trong phiếu này."

**Phần Góp ý**
- Học viên, hai cột:
  - **Trái:** thẻ "Gửi góp ý", gồm:
    - Dòng "Đội ngũ đọc mọi góp ý, nhưng không trả lời riêng."
    - "Chủ đề góp ý" (bắt buộc, 300 ký tự, có bộ đếm) và "Chi tiết đề xuất" (bắt buộc). Không có đính kèm.
    - Hàng cuối: chữ nhỏ "Ẩn danh" (icon `shield_person`) và nút "Gửi góp ý". Gửi xong thì xoá ô, hiện `Toast` "Góp ý đã được ghi nhận. Cảm ơn bạn!"
  - **Phải:** "Góp ý đã gửi n". Mỗi mục có chủ đề 700, 2 dòng đầu nội dung, thời gian và dấu "Đã ghi nhận" (icon `check_circle`, màu `--success`). Các mục ngăn bằng đường kẻ, không bọc thẻ.
  - Chưa gửi góp ý nào: "Chưa gửi góp ý nào. Góp ý đầu tiên của bạn sẽ hiện ở đây."
- Admin:
  - Lưới thẻ (`auto-fill`, tối thiểu 300px). Mỗi thẻ có mã ẩn danh, thời gian, chủ đề, toàn bộ nội dung (`pre-line`).
  - Chỉ đọc.

**Trạng thái khác**
- **Đang tải:** 4 dòng `jc-skel` ở danh sách, khung chờ ở cột phải. Không hiện dữ liệu cũ lẫn vào.
- **Lỗi tải:** `EmptyState` icon `cloud_off`, "Chưa tải được dữ liệu hỗ trợ", nút "Thử lại".
- **Học viên chưa có phiếu nào:** `EmptyState` icon `support_agent`, "Bạn chưa có phiếu hỗ trợ nào".
  - Câu giải thích trang dùng để làm gì, nhắc luôn chuyện ẩn danh.
  - Hai nút: "Báo sự cố mới" và "Hỏi bài tại Diễn đàn".
- **Lọc không ra:** trong cột danh sách ghi "Không có phiếu nào ở trạng thái này." (admin tìm thì "… khớp với “…”"), kèm nút "Xem tất cả phiếu".
- **Chưa chọn phiếu:** cột phải ghi "Chọn một phiếu để xem trao đổi".
- **Xem ảnh lớn:** giống Diễn đàn. Esc đóng, trả focus về ảnh vừa bấm.
- Không hiện tên, email, ảnh đại diện hay mã tài khoản của học viên ở bất kỳ đâu trên màn admin.

**Điện thoại (≤760px)**
- Thanh trên cao 56px (menu, logo, avatar). Đầu trang gồm tiêu đề và nút gạt, xuống dòng nếu cần. Hàng lọc cuộn ngang.
- Danh sách và nội dung phiếu là hai màn. Bấm một phiếu thì chuyển sang màn nội dung, đầu màn có `IconButton arrow_back` "Quay lại danh sách phiếu". Viên trạng thái xuống dòng dưới tiêu đề.
- Phần Góp ý xếp một cột: khung gửi trước, danh sách sau.

**Component** (`jcap-web/src/components/support/`; dùng lại `components/jcap/`)
- `SupportHeader`: dùng `Icon`, `IconButton`.
- `TicketList` và `TicketRow`: trạng thái là `TicketStatus`, một component nhỏ dùng chung cho dòng phiếu và đầu phiếu.
- `TicketThread`: gồm `MessageBubble` và `ThreadEvent`.
- `TicketReplyBox`: dùng `IconButton`, `Button`, `AttachmentPicker`.
- `AttachmentPicker`: kiểm tra định dạng và dung lượng, giữ trạng thái từng tệp, dùng chung với khung báo sự cố. Có thể dùng chung với Diễn đàn.
- `NewTicketModal`: dùng `Modal`, `TextField`, `Alert`.
- `FeedbackForm`, `FeedbackList`, `AdminFeedbackGrid`.
- `ImageLightbox`: lấy từ Diễn đàn nếu đã làm.
- Trạng thái dùng `EmptyState`, `Toast`, `jc-skel`.

**Không làm** (mục 10 của brief):
- Chấm đỏ hoặc số tin chưa đọc, thông báo email hoặc thông báo đẩy.
- Học viên tự đóng, sửa hay xoá phiếu.
- Gắn phiếu với giao dịch, buổi luyện hay bài học.
- Ưu tiên, người phụ trách, thời gian phản hồi dự kiến.
- Đánh giá hài lòng.
- Trạng thái cho góp ý.
- Tìm kiếm ở màn học viên, phân trang.

## 9j. Thư viện Shadowing: danh sách + kịch bản xem trước (`/shadowing`, `LearnerShadowingListView`)

Prototype: `prototype/ThuVienShadowing.dc.html`. Bấm Play để thử chọn mục, chọn bài, gạt vai, bật tắt furigana và nghĩa, tìm kiếm. Mục này **thay phần Shadowing của mục 7**. Phần Hội thoại AI ở mục 7 giữ nguyên.

**Nguyên tắc**
- Không đổi API, service hay cách lưu tiến độ. Dữ liệu lấy từ:
  - `shadowingService.getCatalog` (danh sách bài, lọc `keyword` và `jlptLevel` như hiện tại).
  - `shadowingService.getDetail` (kịch bản của bài đang chọn).
  - `shadowingStorageService`: `getProgress`, `getAllProgress`, `getLatestInProgress`, `isBookmarked`, `toggleBookmark`.
  - `shadowingService.getHistory`, ghép với lịch sử local như hiện tại, để lấy điểm cao nhất và số buổi.
- Đường dẫn vào phòng luyện giữ nguyên: `/shadowing/practice/:id?role=A|B`, thêm `&resume=true` khi tiếp tục và `&restart=true` khi luyện lại.
- Trang này **không dùng `RoleSelectionModal` nữa**. Vai được chọn ngay trong cột xem trước.
- Bỏ cột phải "Buổi luyện gần đây" và thẻ mẹo tai nghe. Mẹo nên chuyển vào bước kiểm tra micro của phòng luyện, làm ở một bước khác.
- Màu: theme `kham-pha` (tối `hoc-tap-dem`, đặt lại `--ai` như mục 9h). Điểm tốt nhất có icon và màu theo ngưỡng của `ScoreRing` (từ 80 `check_circle` `--score-good`, từ 50 `change_history` `--score-mid`, dưới 50 `cancel` `--score-low`).

**Bố cục 1440px:** trang cao đúng 100vh, ba cột tự cuộn riêng.
```
| tiêu đề "Shadowing シャドーイング"                         Lịch sử luyện · 104 buổi |
| dải Đang học dở (tên bài · câu đang dừng · Tiếp tục câu N), vạch tiến độ ở mép dưới |
| cột mục 232 | 20 | cột bài (còn lại) | 20 | cột xem trước 400–460                 |
```
- **Đầu trang:**
  - Bên trái: "Shadowing" 26/36 700, kèm "シャドーイング" chữ Mincho 15px `--sumi-muted`.
  - Bên phải: liên kết nhẹ "Lịch sử luyện · n buổi" (icon `history`), dẫn tới `/roleplay/results?tab=shadowing`. Chưa có buổi nào thì bỏ phần số.
  - Admin vẫn có nút "Quản lý Shadowing" như hiện tại.
- **Dải Đang học dở** (chỉ hiện khi có `getLatestInProgress`):
  - Thẻ `--paper-50` bo `--radius-xl`, gồm ba phần:
    - Trái: nhãn "Đang học dở · N5 · Vai B" (màu `--ai`, icon `pending`) và tên bài 17px 700.
    - Giữa: sau một đường kẻ dọc, dòng "Bạn dừng ở câu 2/8" và câu `currentSentenceText` 17px font JP.
    - Phải: `Button primary` bo tròn "Tiếp tục câu N".
  - Mép dưới thẻ là vạch 3px `--ai`, dài theo `completedSentenceCount / totalSentenceCount`.
- **Cột mục:**
  - **Học tiếp** (ô icon `play_circle`, nền `--ai-soft`; khi chọn thì tô `--ai`), dòng phụ "n bài đang dở".
  - Nhãn "Chủ đề", rồi mỗi `scenarioTitle` một hàng: vòng tiến độ 40px (số "x/y" bài xong ở giữa, cung `--success`; chưa xong bài nào thì không vẽ cung), tên, dòng phụ "N5, N4 · 1 đang học".
  - Một đường kẻ, rồi **Đã lưu** (ô icon `bookmark`) với dòng phụ "n bài".
  - Mục đang chọn: nền `--paper-50`, viền 1px `--line` + `--shadow-sm`.
  - Mở trang thì chọn sẵn Học tiếp, hoặc chủ đề đầu tiên nếu chưa có bài đang dở.
- **Cột bài** (thẻ `--paper-50` bo `--radius-xl`):
  - Đầu cột: tên mục 18px 700, nút chọn cấp "Mọi cấp ▾" (thả xuống Mọi cấp / N5 / N4 / N3) và `IconButton` kính lúp tròn.
  - Bấm kính lúp: ô tìm bo tròn cao 36px thay chỗ tên mục, câu gợi ý "Tìm bài trong mọi chủ đề", có nút × (Esc cũng đóng). Đang tìm thì tiêu đề cột là "Kết quả cho “…”", dòng phụ "n bài trong mọi chủ đề". Ẩn nút × mặc định của `type="search"`.
  - Dưới đầu cột là một dòng phụ 12px, ví dụ "5 bài · 2 đã xong · 1 đang học".
  - **Mỗi bài là một `button` một dòng** (`role="option"` trong `role="listbox"`), cao tối thiểu 60px, gồm:
    - Vòng trạng thái 28px: rỗng là chưa học; cung `--ai` theo `completedSentenceCount/totalSentences` là đang học; tô `--success` có dấu tích là đã xong.
    - Tên 15px 600 (cắt …).
    - Dòng phụ: "[chủ đề ·] N5 · 6 câu". Bài đang học ghi "Vai B · câu 2/8" màu `--ai`. Tên chủ đề chỉ hiện ở Học tiếp, Đã lưu và khi tìm.
    - Điểm tốt nhất, icon bookmark nhỏ nếu đã lưu, chevron.
  - Bài đang chọn có nền `--ai-soft`. **Không có nút nào trong dòng**: bấm dòng là chọn bài.
- **Cột xem trước** (thẻ `--paper-50` + `--shadow-md`):
  1. **Đầu cột:**
     - Tên chủ đề 12px, tên bài 20px 700.
     - Dòng gồm JlptBadge, "8 câu · khoảng 4 phút" (ước tính như hiện tại, `max(1, round(n × 0.45))`) và điểm tốt nhất.
     - `IconButton bookmark` để lưu hoặc bỏ lưu.
  2. **Vai của bạn:**
     - Nút gạt 2 lựa chọn (`role="radiogroup"`, nền `--paper-200`; lựa chọn đang bật nền `--paper-50` + `--shadow-sm`). Mỗi lựa chọn có chữ cái vai trong vòng tròn (tô `--ai` khi bật) và `speakerRoleA_Name` / `speakerRoleB_Name`.
     - Dưới nút gạt: "Bạn nói x/y câu. Vai còn lại do giọng mẫu đọc." (đếm `sentences` theo `speakerRole`).
     - Mặc định: bài đang học là vai đang luyện, bài khác là A.
     - Bài đang dở mà gạt sang vai kia: dòng này đổi màu `--warning` thành "Bạn đang luyện dở vai B. Đổi sang vai A sẽ bắt đầu lại từ câu 1."
  3. **Kịch bản:**
     - Thanh nhỏ "Kịch bản" với hai nút bật tắt Furigana và Nghĩa (viên nhỏ, bật thì nền `--sumi`).
     - Mỗi câu (`sentences` theo `orderIndex`) có: chữ cái vai, câu Nhật 17px dùng `JpText` có furigana, nghĩa 13px `--sumi-muted`, `IconButton volume_up` phát `nativeAudioUrl`.
     - Câu của vai bạn: nền `--paper-100`, chữ cái vai tô `--ai`. Câu của vai kia: chữ Nhật `--sumi-muted`.
     - Bài đang học (chưa đổi vai): câu `currentSentenceIndex` có nền `--ai-soft`, viền 1.5px `--ai` và nhãn "Bạn dừng ở câu này". Câu của bạn có chỉ số nhỏ hơn mang dấu tích `--success`.
     - Khi đang tải `getDetail`: 3 khung chờ `jc-skel`. Nên lưu tạm chi tiết các bài đã mở để chuyển qua lại không phải tải lại.
  4. **Chân cột** (dính đáy): một `Button primary` rộng hết cột, bo tròn, cao 48px.

| Trạng thái | Nút chính | Liên kết phụ bên dưới |
|---|---|---|
| Chưa học | "Bắt đầu với vai X" → `?role=X` | (không có) |
| Đang học, cùng vai | "Tiếp tục câu N" → `?role=X&resume=true` | "Luyện lại từ câu 1" → `&restart=true` |
| Đang học, đã gạt sang vai khác | "Luyện lại với vai Y" → `?role=Y&restart=true` | "Giữ vai X và tiếp tục câu N" (trả nút gạt về vai cũ) |
| Đã xong | "Luyện lại với vai X" → `?role=X&restart=true` | (không có) |

- **Chưa chọn bài:** cột xem trước hiện icon `record_voice_over` và câu "Chọn một bài để xem kịch bản".
- **Trạng thái khác:** giữ như hiện tại (đang tải, lỗi kèm "Thử lại"). Mục rỗng hiện chữ ngay trong cột bài: "Chưa lưu bài nào…", "Không có bài đang dở…", "Không có bài nào khớp…".

**Điện thoại (≤760px)**
- Cột mục thành hàng chip cuộn ngang. Chip đang chọn nền `--sumi`. Vòng tiến độ thu còn 30px, bỏ dòng phụ.
- Cột bài chiếm hết bề ngang. Bấm một bài thì cột xem trước phủ toàn màn, có `IconButton arrow_back` "Quay lại danh sách", nút chính dính đáy.
- Dải Đang học dở dính ở đáy màn danh sách: tên bài, nhãn và nút tròn 44px chỉ có icon play.

**Component** (`jcap-web/src/components/shadowing/`)
- `ShadowingContinueStrip`.
- `ShadowingSectionNav`: cột mục và hàng chip ở bản điện thoại.
- `ShadowingLessonList` + `ShadowingLessonRow`, dùng `JlptBadge`.
- `ShadowingLessonPreview`: gồm `RoleSwitch`, `ScriptLine` dùng `JpText` và `IconButton`, và `PreviewFooter` dùng `Button`.
- `LevelMenu`, `ExpandingSearch`.
- `RoleSelectionModal` vẫn giữ trong code nếu nơi khác còn dùng.

**Không làm:**
- Thêm trường dữ liệu hay API mới.
- Đổi cách tính điểm cao nhất.
- Thay ước tính thời gian bằng tổng `audioDurationMs` (có thể làm sau).

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
| 8 | Chế độ tối (9b) | Chuyển Sáng/Tối/Theo máy ở Cài đặt, mọi màn đọc rõ, không còn màu cứng |
| 9 | Sổ con dấu (9c) | Tab vùng, lật trang, Mục lục tìm/lọc, Tổng quan, đúng dữ liệu thật, không lộ tên mốc chưa đóng |
| 10 | Landing page (9d) | Khách vào `/` thấy landing, đã đăng nhập vào bản đồ; giá đọc từ dữ liệu thật; ổn ở 390px |
| 11 | Đăng nhập / Đăng ký (9e) | Đủ 4 màn, giữ logic auth cũ, ô mật khẩu hiện/ẩn, ổn ở 390px |
| 12 | Trang Kết quả (9f) | Hai tab, lọc JLPT, xem lại một buổi, đủ trạng thái tải/lỗi/rỗng |
| 13 | Shadowing tại mốc (9g) | Khung chat mở cạnh ngăn thông tin, bản đồ trượt; 5 tab ghi chú bên trái; đủ trạng thái khung thu âm; tổng kết đúng số liệu backend; ổn ở 1280 và 390px |
| 14 | Diễn đàn (9h) | Đã trao đổi với AkaiZed; lọc kênh, tìm, sắp xếp, thích, mở bài, bình luận và trả lời, đăng bài kèm tệp, xoá (cả tác giả), ghim (admin); đủ trạng thái tải/lỗi/rỗng/tìm không ra/gửi lỗi; không còn emoji, màu cứng, dữ liệu mẫu trong trình duyệt; ổn ở sáng, tối và 390px |
| 15 | Hỗ trợ & Góp ý (9i) | Đã trao đổi với AkaiZed; học viên gửi phiếu kèm tệp, trao đổi, gửi góp ý; admin tìm, tự đánh dấu đã xem, trả lời, đóng và mở lại; không lộ danh tính ở màn admin; tin mới không làm mất chữ đang gõ; đủ trạng thái tải/lỗi/rỗng/lọc không ra/gửi lỗi/tệp lỗi; không còn emoji, màu cứng, `alert()`; ổn ở sáng, tối và 390px |
| 16 | Thư viện Shadowing (9j) | Ba cột: mục / bài / kịch bản xem trước; dải Đang học dở; chọn vai trong cột xem trước, đổi vai khi đang dở có cảnh báo; nút chính đúng 4 trạng thái và đúng tham số `role`, `resume`, `restart`; kịch bản tải từ `getDetail`, nghe được giọng mẫu, bật tắt furigana và nghĩa; tìm thu thành icon; ổn ở sáng, tối và 390px |

Mỗi bước: chạy `npm run build` (typecheck) và `npm test`, chụp màn hình so với prototype, commit riêng.

## Cách đọc file prototype `.dc.html`

Đây là định dạng của công cụ thiết kế: HTML + CSS inline thật (đọc trực tiếp kích thước, màu, khoảng cách), `{{ten}}` là giá trị lấy từ hàm `renderVals()` trong thẻ `<script data-dc-script>` cuối file, `<sc-if>` là điều kiện hiển thị, `<sc-for>` là vòng lặp, `<x-import component-from-global-scope="JCAP.Button" …>` là component của design system (thuộc tính kebab-case = props). Trạng thái tương tác nằm trong `this.state` của class `Component`.
