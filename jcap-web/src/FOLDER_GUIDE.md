# Hướng Dẫn Cấu Trúc Thư Mục Frontend (JCAP Web)

Tài liệu này tóm tắt cách tổ chức mã nguồn trong thư mục `src/` nhằm giúp các thành viên trong nhóm dễ dàng nắm bắt, không bị nhầm lẫn giữa các màn hình chính (Views) và các thành phần nhỏ dùng lại (Mini-views/Layouts).

---

## 1. Sơ Đồ Cây Thư Mục

```
jcap-web/src/
├── layouts/               # [KHUNG SƯỜN GIAO DIỆN] - Tương đương các file _Layout.cshtml trong Razor
├── components/            # [CÁC MINI-VIEW DÙNG CHUNG] - Tương đương Partial Views (_Header, _Footer)
│   ├── layout/            # Mảnh ghép thuộc khung sườn (Header, Footer, Sidebar, Navbar...)
│   └── ui/                # Nút bấm nhỏ, nhãn dán, popup dùng lại nhiều nơi (Button, Badge, Modal...)
├── views/                 # [MÀN HÌNH CHÍNH] - Nơi chứa các trang nội dung chính (Login, Scenarios, Chat...)
├── assets/                # Hình ảnh, biểu tượng (icons), font chữ tĩnh
├── App.tsx                # Bộ não điều phối màn hình hiển thị (Traffic Controller)
└── main.tsx               # Điểm khởi đầu gắn React vào index.html
```

---

## 2. Chi Tiết Chức Năng Từng Thư Mục

### 🔹 `src/layouts/` (Khung sườn giao diện)
* **Tương đương bên MVC:** Các file `_Layout.cshtml` (có lệnh `@RenderBody()`).
* **Nhiệm vụ:** Chứa các bộ khung chuẩn để bọc ngoài màn hình.
  * Ví dụ `MainLayout.tsx`: Chứa sẵn thanh Header ở trên + Footer ở đáy + thanh tìm kiếm.
  * Ví dụ `AuthLayout.tsx`: Khung tối giản chỉ có logo JCAP ở giữa màn hình (cho Đăng nhập/Đăng ký).
* **Cơ chế React:** Dùng từ khóa `{children}` để nhét nội dung của màn hình con vào giữa Header và Footer.

---

### 🔹 `src/components/` (Các Mini-View tái sử dụng)
* **Tương đương bên MVC:** Các file Partial Views (`_Header.cshtml`, `_Footer.cshtml`, `_ButtonPartial.cshtml`).
* Được chia làm 2 nhóm rõ ràng:
  1. **`components/layout/`**: Các mảnh ghép gắn cố định vào khung:
     * `Header.tsx`: Thanh menu trên cùng (Logo, số dư Credit, Tên người dùng).
     * `Footer.tsx`: Chân trang (Thông tin bản quyền, liên hệ).
     * `Sidebar.tsx`: Menu bên trái (cho trang Admin sau này).
  2. **`components/ui/`**: Các chi tiết nhỏ lẻ tái sử dụng nhiều nơi:
     * `Button.tsx`: Nút bấm chuẩn màu thương hiệu JCAP.
     * `Badge.tsx`: Nhãn nhỏ hiển thị cấp độ `N5`, `N4`, `N3`.
     * `MicButton.tsx`: Nút micro tròn có hiệu ứng nhấp nháy khi thu âm.

---

### 🔹 `src/views/` (Màn hình chính)
* **Tương đương bên MVC:** Các thư mục `Views/Account/Index.cshtml`, `Views/Course/List.cshtml`.
* **Nhiệm vụ:** Chứa nội dung riêng biệt của từng trang web:
  * `LoginView.tsx`: Màn hình Đăng nhập & chọn cấp độ JLPT.
  * `ScenarioListView.tsx`: Màn hình duyệt danh sách tình huống luyện nói.
  * `RoleplayChatView.tsx`: Màn hình phòng hội thoại tương tác với AI.

---

## 3. So Sánh Nhanh: Razor MVC vs React Component

| Khái niệm | Razor MVC (.cshtml) | React Component (.tsx) |
| :--- | :--- | :--- |
| **Nhúng thanh Header** | `<partial name="_Header" />` | `<Header />` |
| **Khung sườn chung** | `_Layout.cshtml` gọi `@RenderBody()` | `MainLayout.tsx` bọc `{children}` |
| **Truyền dữ liệu vào** | `@model UserProfile` | `props` (ví dụ: `<Header credit={500} />`) |
| **Xử lý sự kiện click** | Viết thẻ `<form>` hoặc `onclick="func()"` | `onClick={() => doSomething()}` |

