## Design system (UI học viên)

- Giao diện học viên làm theo `design-handoff/HANDOFF.md`; bản tương tác gốc là `design-handoff/prototype/AppPrototype.dc.html`. Khi tài liệu và prototype lệch nhau, theo prototype.
- Màu, font, bo góc, đổ bóng chỉ lấy từ token (`src/styles/tokens.css`, CSS variables; Tailwind map sẵn: `bg-paper-100`, `text-sumi`, `bg-ai`…). Không thêm mã màu hex mới hay `bg-[#...]`.
- Mỗi khu vực đặt một `data-theme` ở phần tử gốc: `hoc-tap` (trang học viên), `phong-luyen` (phòng Shadowing / Hội thoại AI), `kham-pha` (bản đồ Hành trình), `quan-tri` (admin).
- Dùng component trong `src/components/jcap/` (port từ `design-handoff/design-system/bundle.js`, props theo `index.d.ts` và `COMPONENTS.md`). Không tự vẽ lại nút, badge, thanh tiến độ… bằng Tailwind rời rạc.
- Icon: Material Symbols Rounded. Font: Be Vietnam Pro, Noto Sans JP, Noto Serif JP.
- Việc UI không đổi API, service, type hay logic chấm điểm. Mỗi bước: `npm run build` và `npm test` trong `jcap-web/` phải qua.
