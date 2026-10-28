# design-handoff

Gói bàn giao giao diện mới của JCAP cho Claude Code.

| File | Dùng để |
|---|---|
| `HANDOFF.md` | Mô tả từng màn, map vào view/route trong `jcap-web`, thứ tự làm |
| `PROMPTS.md` | Câu lệnh mẫu để dán vào Claude Code theo từng bước |
| `CLAUDE-design-section.md` | Đoạn quy tắc thêm vào `CLAUDE.md` của repo |
| `tokens/tokens.css` | Token màu, chữ, khoảng cách + 6 direction (`data-theme`) |
| `tokens/tokens.json` | Cùng token ở dạng dữ liệu |
| `tokens/tailwind-config-snippet.html` | Cấu hình Tailwind CDN trỏ vào token, font và icon |
| `design-system/` | README hệ thống, `COMPONENTS.md` (mô tả từng component), `bundle.js` / `bundle.css` / `index.d.ts` (mã tham chiếu để port sang TSX) |
| `prototype/` | File gốc của bản tương tác: `AppPrototype.dc.html` (toàn bộ app), `ShadowingRoom.dc.html`, `ConversationRoom.dc.html` |
| `assets/jcap-logo-mark.svg` | Logo dùng trong thanh bên |

Bản tương tác để xem trực quan: canvas "JCAP – Bản tương tác" trên claude.ai (bấm Play).
