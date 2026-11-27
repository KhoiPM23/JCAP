# Câu lệnh mẫu cho Claude Code (VS Code)

Dán lần lượt từng câu vào khung chat Claude Code. Gõ `@` để gắn file. Làm xong, kiểm tra, commit, rồi mới sang câu tiếp theo.

## Bước 0 · Một lần duy nhất: cho Claude Code biết quy tắc

> Đọc @design-handoff/CLAUDE-design-section.md và thêm nguyên văn phần đó vào cuối @CLAUDE.md. Không sửa gì khác.

## Bước 1 · Nền tảng

> Đọc @design-handoff/HANDOFF.md (mục 0 và 1), @design-handoff/tokens/tokens.css, @design-handoff/tokens/tailwind-config-snippet.html, @design-handoff/design-system/index.d.ts. Làm mục 1: đưa tokens.css và bundle.css vào jcap-web/src/styles, sửa index.html (font, icon Rounded, cấu hình Tailwind), port các component liệt kê ở mục 1 từ @design-handoff/design-system/bundle.js sang TSX trong jcap-web/src/components/jcap/. Lập kế hoạch trước và chờ tôi duyệt. Xong thì chạy npm run build trong jcap-web.

## Bước 2 · Thanh bên và khung trang

> Làm mục 2 trong @design-handoff/HANDOFF.md. Đối chiếu phần <aside class="side"> và CSS .side, .dh, .pill, .drop, .acct trong @design-handoff/prototype/AppPrototype.dc.html. Thay Header + Navbar trong MainLayout bằng thanh bên mới, giữ đủ các route hiện có trong src/router/index.tsx. Lập kế hoạch trước.

## Bước 3 · Gói & Credit, Hồ sơ, Cài đặt

> Làm mục 4 trong @design-handoff/HANDOFF.md cho SubscriptionQuotaView, dùng dữ liệu thật từ creditService và subscriptionPlanService. Đối chiếu trang pgPlan (lớp .um-*) trong prototype. Chỉ đổi giao diện.

> Làm mục 5 cho LearnerProfileView và SettingsView, đối chiếu trang pgProfile và pgSettings trong prototype. Giữ nguyên logic lưu cài đặt và đổi ảnh đại diện.

## Bước 4 · Thư viện Shadowing và Hội thoại AI

> Làm mục 7 cho LearnerShadowingListView (đối chiếu trang pgShadow, thanh lọc .shf-*) và ScenarioListView (trang pgRole). Bộ lọc phải lọc dữ liệu thật.

## Bước 5 · Phòng luyện Shadowing

> Làm mục 8 cho LearnerShadowingPracticeView, đối chiếu @design-handoff/prototype/ShadowingRoom.dc.html. Giữ nguyên RecordingBar, logic thu âm và kết quả chấm từ backend; chỉ dựng lại bố cục, bóng thoại và 5 trạng thái của khung thu âm.

## Bước 6 · Phòng Hội thoại AI

> Làm mục 9 cho RoleplayPracticeView, đối chiếu @design-handoff/prototype/ConversationRoom.dc.html. Giữ nguyên luồng RoleplaySession, trừ credit và gọi AI.

## Bước 7 · Bản đồ Hành trình làm trang chủ

> Làm mục 3: đưa bản đồ Hành trình lên route "/", đổi màu exploreTheme.ts sang token kham-pha, thêm cụm điều khiển, bảng chú giải, popover tỉnh khoá và chuỗi chuyển động vào/ra tỉnh như trong prototype (.mapfull, .natl, .zoomL, .ppanel, .legend). Giữ toàn bộ dữ liệu và logic bản đồ hiện có.

## Bước 8 · Chế độ tối

> Làm mục 9b trong @design-handoff/HANDOFF.md: thêm ThemeProvider, nối SegmentedControl "Chế độ màu" ở SettingsView (Sáng / Tối / Theo máy, lưu localStorage), đổi data-theme các khu vực sang hoc-tap-dem / phong-luyen-dem. Rà và thay các màu cứng còn sót (bg-white, text-slate-*, mã hex) bằng token. Đối chiếu khối CSS "Chế độ tối" trong prototype.

## Bước 9 · Sổ con dấu

> Làm mục 9c trong @design-handoff/HANDOFF.md cho @jcap-web/src/views/explore/StampBookView.tsx, đối chiếu @design-handoff/prototype/StampBook.dc.html. Dùng lại SpotStampMark và PrefectureStampMark trong ExploreStamp.tsx, giữ nguyên useExploreJourney và exploreService.getStampBook. Chỉ đổi giao diện. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 10 · Landing page

> Làm mục 9d trong @design-handoff/HANDOFF.md (bản 3), đối chiếu @design-handoff/prototype/Landing.dc.html. Tạo LandingView cho khách chưa đăng nhập ở "/", người đã đăng nhập vẫn vào bản đồ. Thêm font Lora (500;600;700) vào link Google Fonts trong index.html cho tiêu đề phần đầu. Bản đồ ở phần đầu và mục Lộ trình vẽ từ PREFECTURES trong src/data/japanMap.ts. Đọc giá từ creditService và subscriptionPlanService, không chép số cứng. Không đưa lên trang quy tắc "đủ 70% con dấu mới mở chương". Kiểm tra router/index.tsx trước khi sửa vì có thể có code của người khác. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 11 · Đăng nhập và Đăng ký

> Làm mục 9e trong @design-handoff/HANDOFF.md cho LoginView, RegisterView, EmailVerificationPendingView, ForgotPasswordView và AuthLayout, đối chiếu khối .auth trong @design-handoff/prototype/AppPrototype.dc.html. Giữ nguyên toàn bộ logic auth và AuthContext, chỉ đổi giao diện. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 12 · Trang Kết quả

> Làm mục 9f (vòng 3) trong @design-handoff/HANDOFF.md, đối chiếu @design-handoff/prototype/KetQua.dc.html và @design-handoff/BRIEF-ket-qua.md. Sửa trang Kết quả (/roleplay/results, tab lưu ở ?tab=). Giữ nguyên API và cách lấy dữ liệu, chỉ đổi giao diện. Bỏ bộ lọc và hai cột "Giáo trình", "Bài học" của Shadowing, thay bằng lọc theo cấp JLPT. Thêm các màu tối trong mục 9f vào khối hoc-tap-dem. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 13 · Shadowing tại mốc (khung chat cạnh ngăn thông tin)

Làm thành 3 lượt, mỗi lượt một prompt, xong lượt nào thì chạy thử và commit lượt đó.

**13a · Tách logic và dựng vỏ**

> Đọc mục 9g trong @design-handoff/HANDOFF.md và mở @design-handoff/prototype/ShadowingTaiMoc.dc.html để đối chiếu. Bước này: (1) tách phần thu âm, gửi chấm, lưu buổi trong @jcap-web/src/views/shadowing/LearnerShadowingPracticeView.tsx thành một hook dùng chung, trang luyện cũ vẫn chạy như trước; (2) trên trang bản đồ tỉnh, khi bấm "Luyện Shadowing" ở thẻ mốc thì mở khung chat bên trái ngăn thông tin, bản đồ trượt sang trái, đóng thì trượt về. Ngăn thông tin giữ nguyên. Không đổi API hay cách tính điểm. Lập kế hoạch trước và chờ tôi duyệt.

**13b · Hội thoại, khung thu âm, tab ghi chú**

> Tiếp mục 9g: dựng phần hội thoại, khung thu âm và 5 tab ghi chú kiểu sổ tay bên trái khung chat (thu gọn còn chữ Hán dọc, rê chuột thì trượt ra, tab đang mở nối với trang ghi chú). Trang Kết quả làm giống "Chi tiết từng câu" của modal tổng kết hiện có. Từ vựng và Ngữ pháp lấy từ dữ liệu dialogue, thiếu thì hiện EmptyState, không tự sinh. Đối chiếu prototype, lập kế hoạch trước và chờ tôi duyệt.

**13c · Tổng kết và con dấu**

> Tiếp mục 9g: thay modal tổng kết bằng thẻ tổng kết cuối khung chat, chỉ dùng số liệu backend như modal và SessionSummaryPanel hiện có, thêm dòng con dấu của mốc và hiệu ứng đóng dấu sau khi server xác nhận. Thêm kiểu thanh cuộn mảnh như mục 9g. Chạy `npm run build` và `npm test`. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 14 · Diễn đàn

Diễn đàn là code của AkaiZed. Trao đổi với bạn ấy trước, rồi mới dán các prompt dưới đây. Làm thành 3 lượt, xong lượt nào thì chạy thử và commit lượt đó.

**14a · Khung trang, cột kênh, danh sách bài**

> Đọc mục 9h trong @design-handoff/HANDOFF.md và @design-handoff/BRIEF-dien-dan.md, mở @design-handoff/prototype/DienDan.dc.html để đối chiếu (chỗ nào brief khác mục 9h thì theo 9h). Tìm CommunityForumView và communityService trong jcap-web. Bước này: đổi khu Diễn đàn sang theme kham-pha (tối dùng hoc-tap-dem, đặt lại --ai như mục 9h); dựng đầu trang, ChannelRail (màu kênh import từ WOODBLOCK trong views/explore/exploreTheme.ts, không thêm mã hex), QuickComposer, ForumToolbar (sắp xếp + kính lúp mở ô tìm), PostCard ở dạng thu gọn, nút "Có n bài thảo luận mới" cho lần tự làm mới 8 giây. Thay toàn bộ emoji bằng Material Symbols Rounded, bỏ màu cứng, bỏ dữ liệu mẫu lưu trong trình duyệt và thay bằng trạng thái lỗi có nút Thử lại. Không đổi API, DTO hay controller. Lập kế hoạch trước và chờ tôi duyệt.

**14b · Bài mở rộng, bình luận, quyền**

> Tiếp mục 9h: bài mở rộng tại chỗ (nội dung đủ, ảnh, tệp), ImageLightbox (Esc đóng, trả focus), CommentThread trả lời một cấp với dòng "Đang trả lời @tên", CommentComposer (đính kèm, công tắc ẩn danh, gửi lỗi giữ nội dung). Menu Tuỳ chọn bài: Ghim/Bỏ ghim cho admin, Xoá cho tác giả (isOwnPost) hoặc admin, có DeletePostDialog. "Đánh dấu đã giải đáp" chỉ ở kênh Hỏi đáp, cho tác giả hoặc admin. Không hiện lượt xem. Không sửa cách xoá ở backend (để AkaiZed xử lý SoftDelete). Lập kế hoạch trước và chờ tôi duyệt.

**14c · Khung soạn bài, trạng thái, điện thoại**

> Tiếp mục 9h: PostComposerModal (chọn kênh dạng thẻ có mô tả, đếm ký tự tiêu đề 290, danh sách tệp với trạng thái đang tải / đã tải / quá 5MB ngay tại tệp, bỏ alert(), công tắc Đăng ẩn danh không có với admin, dòng lý do khi nút Đăng bài khoá, Toast "Đã đăng bài thảo luận"). Các trạng thái tải, kênh rỗng, tìm không ra. Bản điện thoại ≤760px: thanh trên, chip kênh cuộn ngang, nút nổi Đăng bài, khung soạn phủ toàn màn. Kiểm tra sáng và tối. Chạy `npm run build` và `npm test`. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 15 · Hỗ trợ & Góp ý

Phần này cũng là code của AkaiZed. Trao đổi với bạn ấy trước. Làm thành 3 lượt, xong lượt nào thì chạy thử và commit lượt đó.

**15a · Màn học viên: danh sách và nội dung phiếu**

> Đọc mục 9i trong @design-handoff/HANDOFF.md và @design-handoff/BRIEF-ho-tro.md, mở @design-handoff/prototype/HoTro.dc.html để đối chiếu (chỗ nào brief khác mục 9i thì theo 9i). Sửa @jcap-web/src/views/LearnerFeedbackView.tsx: đổi sang theme kham-pha (tối hoc-tap-dem như Diễn đàn), dựng SupportHeader (tiêu đề + nút gạt Sự cố / Góp ý), TicketList (nút Báo sự cố mới viền đứt, lọc dạng chữ, dòng phiếu gọn), TicketThread (tin của mình bên phải, mốc Admin đã xem / đã đóng), TicketReplyBox (một khung chung, dòng "Bạn đang ẩn danh" có mã thật, AttachmentPicker báo lỗi ngay tại tệp, bỏ alert()). Tự tải lại 10 giây không làm mất chữ đang gõ. Thay emoji bằng Material Symbols Rounded, bỏ màu cứng. Không đổi API, DTO, controller. Lập kế hoạch trước và chờ tôi duyệt.

**15b · Báo sự cố mới, Góp ý, trạng thái, điện thoại**

> Tiếp mục 9i: NewTicketModal (4 loại có mô tả, dòng "Hỏi tại Diễn đàn", đếm ký tự 300, AttachmentPicker, dòng lý do khi nút khoá, gửi xong chọn phiếu mới và hiện Toast), phần Góp ý hai cột, các trạng thái tải / lỗi / chưa có phiếu / lọc không ra / chưa chọn phiếu / gửi lỗi, xem ảnh lớn. Bản điện thoại ≤760px: danh sách và nội dung phiếu là hai màn có nút quay lại. Kiểm tra sáng và tối. Lập kế hoạch trước và chờ tôi duyệt.

**15c · Màn admin**

> Tiếp mục 9i cho @jcap-web/src/views/admin/AdminFeedbackView.tsx: theme quan-tri với --ai pha đậm như mục 9i, dùng lại TicketList / TicketThread / TicketReplyBox ở chế độ admin (ô tìm mã hoặc tiêu đề, chấm "Chưa xem", người gửi chỉ hiện "Học viên #ANON-…", nút Đóng phiếu / Mở lại, phiếu đóng phải mở lại mới trả lời), tab Góp ý dạng lưới chỉ đọc, nút Tải lại và Quản lý Diễn đàn. Rà lại để chắc chắn không hiện tên, email, ảnh hay mã tài khoản học viên ở đâu. Chạy `npm run build` và `npm test`. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 16 · Thư viện Shadowing (danh sách + kịch bản)

Làm thành 2 lượt. Xong lượt nào thì chạy thử và commit lượt đó.

**16a · Bố cục, cột mục, cột bài, dải Đang học dở**

> Đọc mục 9j trong @design-handoff/HANDOFF.md, mở @design-handoff/prototype/ThuVienShadowing.dc.html để đối chiếu. Sửa @jcap-web/src/views/shadowing/LearnerShadowingListView.tsx: đổi sang theme kham-pha, trang cao 100vh với ba cột tự cuộn; dựng ShadowingContinueStrip (dùng getLatestInProgress và currentSentenceText), ShadowingSectionNav (Học tiếp, các chủ đề theo scenarioTitle có vòng tiến độ, Đã lưu), cột bài dạng listbox một dòng mỗi bài (không còn nút trong dòng), LevelMenu và ô tìm thu thành icon. Bỏ cột "Buổi luyện gần đây" và thẻ mẹo tai nghe, giữ liên kết "Lịch sử luyện · n buổi". Giữ nguyên shadowingService, shadowingStorageService và cách tính điểm cao nhất. Lập kế hoạch trước và chờ tôi duyệt.

**16b · Cột kịch bản xem trước và điện thoại**

> Tiếp mục 9j: dựng ShadowingLessonPreview. Gọi shadowingService.getDetail khi chọn bài (có khung chờ, lưu tạm kết quả), hiện kịch bản theo orderIndex với JpText, nghe nativeAudioUrl, bật tắt Furigana và Nghĩa, tô câu theo vai, đánh dấu câu đang dừng và câu đã nói. RoleSwitch thay cho RoleSelectionModal ở trang này, có cảnh báo khi đổi vai lúc đang dở. Nút chính theo bảng 4 trạng thái trong mục 9j, đường dẫn `/shadowing/practice/:id?role=…` kèm `resume` hoặc `restart` như hiện tại. Bản điện thoại ≤760px: chip mục cuộn ngang, cột xem trước phủ toàn màn có nút quay lại, dải tiếp tục dính đáy. Kiểm tra sáng và tối, chạy `npm run build` và `npm test`. Lập kế hoạch trước và chờ tôi duyệt.

## Bước 17 · Bản đồ tỉnh và ngăn tỉnh 2 tầng

Làm thành 3 lượt. Xong lượt nào thì chạy thử và commit lượt đó.

**17a · Ghim, thẻ tên, tên khu vực, lộ trình, nút điều khiển**

> Đọc mục 9k (phần A) trong @design-handoff/HANDOFF.md, mở @design-handoff/prototype/BanDoTinh.dc.html và @design-handoff/prototype/BanDoTinh-NhomGhim.dc.html để đối chiếu. Trong @jcap-web/src/views/explore/JapanMap.tsx khi đang xem một tỉnh: thay PinFrame + pictogram + dấu tích + huy hiệu số bằng component StationBadge (ô số 34px, 5 trạng thái theo stampOf và nextSpotIndex); bỏ nhãn tên dưới mọi ghim, chip "Tiếp theo", jm-next-ring, jm-ripple; dựng SpotNameCard chỉ hiện ở mốc tiếp theo, mốc đang mở, ghim đang rê chuột/focus (dùng layoutLabels để chọn phía); thêm AreaLabel từ hàm thuần spotAreas (gom mốc liền nhau cùng tiền tố trước " · ", có unit test); đổi kiểu RouteLayer (nét card 3px, đoạn đã có dấu màu --ai); dựng lại bong bóng nhóm ghim thành ClusterStack; ẩn nút + và − khi đang xem tỉnh; cập nhật chú giải. Giữ nguyên ZoneCircles, ranh giới quận, camera, logic nhóm/xoè ghim, nextSpotIndex. Lập kế hoạch trước và chờ tôi duyệt.

**17b · Ngăn tỉnh tầng 1 (Tổng quan)**

> Tiếp mục 9k phần B: thay nội dung PrefecturePanel trong @jcap-web/src/views/explore/JapanMapView.tsx bằng PrefectureOverview: đường dẫn "Nhật Bản / Kanto" (bỏ jm-backbar), tên tỉnh, ProvinceWordButton (khung nổi khi rê chuột/focus/chạm) cạnh con dấu tỉnh, vạch tiến độ 9 đoạn, danh sách lộ trình cố định theo thứ tự (StationBadge 26px, dòng khu vực, chữ phụ theo bảng trong 9k), chân ngăn dính đáy với "Học tiếp: …" và dòng gợi ý, trạng thái đủ dấu, đang tải, lỗi. Rê chuột lên dòng thì ghim tương ứng sáng lên và ngược lại. Không đổi exploreStore, exploreService. Lập kế hoạch trước và chờ tôi duyệt.

**17c · Tầng 2 (Chi tiết mốc) và điện thoại**

> Tiếp mục 9k phần C và D: dựng SpotDetail trong cùng ngăn (thanh "← Chiba" và mốc trước/sau, đầu mốc, câu mẫu luôn hiện với JpText và speakJa, SpotSteps dạng accordion với bước hiện tại mở sẵn, nút chính ở chân ngăn theo bảng trong 9k). "Tôi đã hiểu câu này" gọi exploreService.markUnderstood rồi applySync, có loading và Toast; Shadowing gọi openPractice (khung chat 9g); Hội thoại AI điều hướng như RoleplayStep hiện có. Bấm ghim hoặc dòng mở tầng 2 (URL ?tinh=…&dd=…; &hoc=1 cũ mở tầng 2 với bước Hiểu). Esc: tầng 2 → tầng 1 → toàn quốc. Ngừng dùng SpotCard, SpotFocusCard, modal SpotLesson ở trang này. Bản ≤760px: bottom sheet 70%, không hiện thẻ tên trên bản đồ, reserveBottom theo chiều cao sheet. Chạy `npm run build` và `npm test`, chụp màn hình 1440 và 390 so với prototype. Lập kế hoạch trước và chờ tôi duyệt.

## Mẹo khi làm

- Thấy lệch so với thiết kế: chụp màn hình trang đang chạy và bản tương tác, dán cả hai vào chat, nói rõ chỗ lệch.
- Claude Code đòi sửa quá nhiều file một lúc: bảo nó chia nhỏ, mỗi lần một view.
- Sau mỗi bước: `git add -A && git commit -m "UI: <tên bước>"` để dễ quay lại.
