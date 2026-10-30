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

## Mẹo khi làm

- Thấy lệch so với thiết kế: chụp màn hình trang đang chạy và bản tương tác, dán cả hai vào chat, nói rõ chỗ lệch.
- Claude Code đòi sửa quá nhiều file một lúc: bảo nó chia nhỏ, mỗi lần một view.
- Sau mỗi bước: `git add -A && git commit -m "UI: <tên bước>"` để dễ quay lại.
