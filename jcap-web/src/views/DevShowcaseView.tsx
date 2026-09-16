import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Toast, type ToastType } from '../components/ui/Toast';
import { Header } from '../components/layout/Header';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import type { User } from '../types/auth';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export const DevShowcaseView: React.FC = () => {
  // Navigation tabs for showcase
  const [activeTab, setActiveTab] = useState<'components' | 'layout' | 'layouts-sim'>('components');

  // Modal demo state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Toast demo state
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Navbar demo active path
  const [navbarActivePath, setNavbarActivePath] = useState('/scenarios');

  // Sample user for Header presentation (matching existing User contract)
  const sampleUser: User = {
    id: 'dev-user-001',
    email: 'minhkhoi.learner@fpt.edu.vn',
    fullName: 'Phan Minh Khôi',
    role: 'Learner',
    level: 'N3',
  };

  const addToast = (message: string, type: ToastType) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F4F9FE] text-[#071A44] font-sans pb-16">
      {/* Dev Environment Notice Banner */}
      <div className="bg-amber-500 text-white px-6 py-2.5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-medium">
        <div className="flex items-center gap-2">
          <span className="bg-amber-700 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide">
            Dev Preview Only
          </span>
          <span>
            Trang kiểm tra trực quan <strong>Shared Layout Foundation (Sprint 1)</strong> — Không dùng cho production flow.
          </span>
        </div>
        <div className="text-amber-100 text-[11px]">
          Target Route: <code>/dev/ui-foundation</code>
        </div>
      </div>

      {/* Showcase Control Bar */}
      <div className="bg-white border-b border-[#E6EDF5] sticky top-0 z-50 px-8 py-3 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-[#0878EE]">JCAP UI Foundation Showcase</h1>
          <p className="text-xs text-[#71809A]">
            Kiểm tra độc lập Button, Input, Modal, Toast, Header, Navbar, Footer, MainLayout, AuthLayout
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 bg-[#F4F9FE] p-1 rounded-lg border border-[#E6EDF5]">
          <button
            type="button"
            onClick={() => setActiveTab('components')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'components' ? 'bg-[#0878EE] text-white shadow-sm' : 'text-[#71809A] hover:text-[#071A44]'
            }`}
          >
            1. UI Components (Button, Input, Modal, Toast)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('layout')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'layout' ? 'bg-[#0878EE] text-white shadow-sm' : 'text-[#71809A] hover:text-[#071A44]'
            }`}
          >
            2. Layout Components (Header, Navbar, Footer)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('layouts-sim')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'layouts-sim' ? 'bg-[#0878EE] text-white shadow-sm' : 'text-[#71809A] hover:text-[#071A44]'
            }`}
          >
            3. Layouts Simulation (MainLayout, AuthLayout)
          </button>
        </div>
      </div>

      {/* Main Showcase Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ============================================================ */}
        {/* TAB 1: UI COMPONENTS */}
        {/* ============================================================ */}
        {activeTab === 'components' && (
          <div className="space-y-10">
            {/* BUTTON SECTION */}
            <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm">
              <div className="border-b border-[#E6EDF5] pb-3 mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#071A44]">1. Button Component</h2>
                  <p className="text-xs text-[#71809A]">
                    Variants: <code>primary</code> (#0878EE), <code>secondary</code> (White/Border), <code>danger</code> (#D92D20). Radius: 8px.
                  </p>
                </div>
                <span className="text-xs bg-blue-50 text-[#0878EE] px-2.5 py-1 rounded-full font-medium">
                  3 Variants • 3 Sizes • States
                </span>
              </div>

              {/* Variants Demo */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-[#071A44] mb-3">Variants (Kích thước chuẩn md)</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <Button variant="primary">Primary Button</Button>
                  <Button variant="secondary">Secondary Button</Button>
                  <Button variant="danger">Danger Button</Button>
                </div>
              </div>

              {/* Sizes Demo */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-[#071A44] mb-3">Kích thước (sm / md / lg)</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <Button variant="primary" size="sm">Small (sm)</Button>
                  <Button variant="primary" size="md">Medium (md)</Button>
                  <Button variant="primary" size="lg">Large (lg)</Button>
                </div>
              </div>

              {/* States Demo */}
              <div>
                <h3 className="text-sm font-semibold text-[#071A44] mb-3">Trạng thái (Loading & Disabled)</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <Button variant="primary" isLoading>Đang xử lý...</Button>
                  <Button variant="primary" disabled>Primary Vô hiệu hóa</Button>
                  <Button variant="secondary" disabled>Secondary Vô hiệu hóa</Button>
                  <Button variant="danger" disabled>Danger Vô hiệu hóa</Button>
                </div>
              </div>
            </section>

            {/* INPUT SECTION */}
            <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm">
              <div className="border-b border-[#E6EDF5] pb-3 mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#071A44]">2. Input Component</h2>
                  <p className="text-xs text-[#71809A]">
                    Hỗ trợ label, placeholder, helperText, trạng thái lỗi (error), focus ring, radius: 8px.
                  </p>
                </div>
                <span className="text-xs bg-blue-50 text-[#0878EE] px-2.5 py-1 rounded-full font-medium">
                  Default • Focus • Error • Disabled
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Default Input */}
                <div>
                  <Input
                    label="Họ và tên (Default)"
                    placeholder="Nhập họ và tên học viên..."
                    helperText="Tên sẽ được hiển thị trên hồ sơ và chứng nhận."
                  />
                </div>

                {/* Input with Pre-filled Value */}
                <div>
                  <Input
                    label="Địa chỉ Email (Focused / Filled)"
                    defaultValue="learner@fpt.edu.vn"
                    helperText="Email dùng để đăng nhập và nhận thông báo luyện tập."
                  />
                </div>

                {/* Input with Error */}
                <div>
                  <Input
                    label="Mật khẩu (Trạng thái Lỗi)"
                    type="password"
                    defaultValue="123"
                    error="Mật khẩu phải có ít nhất 8 ký tự bao gồm chữ và số."
                  />
                </div>

                {/* Disabled Input */}
                <div>
                  <Input
                    label="Mã học viên (Vô hiệu hóa - Disabled)"
                    defaultValue="JCAP-2026-N3-0941"
                    disabled
                    helperText="Mã định danh hệ thống không thể chỉnh sửa."
                  />
                </div>
              </div>
            </section>

            {/* MODAL & TOAST SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* MODAL DEMO */}
              <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="border-b border-[#E6EDF5] pb-3 mb-4">
                    <h2 className="text-lg font-bold text-[#071A44]">3. Modal Component</h2>
                    <p className="text-xs text-[#71809A]">
                      Minimal confirmation modal, backdrop làm mờ, radius 12px, dùng shared Button.
                    </p>
                  </div>
                  <p className="text-sm text-[#71809A] mb-6 leading-relaxed">
                    Bấm nút bên dưới để mở hộp thoại xác nhận. Modal khóa cuộn trang tự động và hỗ trợ nút đóng, phím hoặc bấm ngoài màn hình.
                  </p>
                </div>

                <div>
                  <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                    Mở Hộp Thoại Xác Nhận (Modal)
                  </Button>
                </div>
              </section>

              {/* TOAST DEMO */}
              <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm">
                <div className="border-b border-[#E6EDF5] pb-3 mb-4">
                  <h2 className="text-lg font-bold text-[#071A44]">4. Toast Notification</h2>
                  <p className="text-xs text-[#71809A]">
                    Thông báo góc màn hình với 2 type: <code>success</code> và <code>error</code>.
                  </p>
                </div>
                <p className="text-sm text-[#71809A] mb-4">
                  Bấm để kích hoạt thông báo mẫu (tự động biến mất sau 3 giây hoặc bấm dấu x để đóng):
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => addToast('Lưu thông tin hồ sơ thành công!', 'success')}
                  >
                    Bật Toast Thành Công
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => addToast('Không thể kết nối đến máy chủ. Vui lòng thử lại!', 'error')}
                  >
                    Bật Toast Lỗi
                  </Button>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: LAYOUT COMPONENTS (Header, Navbar, Footer standalone) */}
        {/* ============================================================ */}
        {activeTab === 'layout' && (
          <div className="space-y-10">
            {/* HEADER DEMO */}
            <section className="bg-white rounded-xl border border-[#E6EDF5] overflow-hidden shadow-sm">
              <div className="p-6 border-b border-[#E6EDF5]">
                <h2 className="text-lg font-bold text-[#071A44]">1. Header Component (Chiều cao 64px)</h2>
                <p className="text-xs text-[#71809A] mt-1">
                  Hiển thị logo JCAP, ô tìm kiếm bài học, nút thông báo và phần tài khoản người dùng (Email / Tên / Cấp độ JLPT).
                  <br />
                  <span className="text-blue-600 font-medium">Ghi chú kiến trúc:</span> KHÔNG mock CreditBalance business data (tuân thủ chặt chẽ contract hiện tại).
                </p>
              </div>

              {/* Sub-demo A: Header with User presentation */}
              <div className="bg-[#F4F9FE] p-4 border-b border-[#E6EDF5]">
                <span className="text-xs font-bold text-[#71809A] uppercase tracking-wider block mb-2">
                  A. Trực quan Header khi có tài khoản đăng nhập (Account / Avatar presentation):
                </span>
                <div className="border border-[#E6EDF5] rounded-lg overflow-hidden shadow-sm">
                  <Header user={sampleUser} onLogout={() => alert('Đăng xuất thành công (Demo callback)')} />
                </div>
              </div>

              {/* Sub-demo B: Header without User */}
              <div className="bg-[#F4F9FE] p-4">
                <span className="text-xs font-bold text-[#71809A] uppercase tracking-wider block mb-2">
                  B. Trực quan Header ở trạng thái khách (Chưa có phiên đăng nhập):
                </span>
                <div className="border border-[#E6EDF5] rounded-lg overflow-hidden shadow-sm">
                  <Header user={null} />
                </div>
              </div>
            </section>

            {/* NAVBAR DEMO */}
            <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm">
              <div className="border-b border-[#E6EDF5] pb-3 mb-6">
                <h2 className="text-lg font-bold text-[#071A44]">2. Navbar Component (Chiều rộng 174px, Chiều cao NavItem 42px)</h2>
                <p className="text-xs text-[#71809A]">
                  Đúng thứ tự chuẩn xác của Learner Navigation: Trang chủ → Học tập → Lịch học → Phân tích → Hồ sơ → Cài đặt → Trợ giúp → Đăng xuất.
                </p>
              </div>

              <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* The standalone rendered Navbar */}
                <div className="border border-[#E6EDF5] rounded-xl overflow-hidden bg-white shadow-sm">
                  <Navbar 
                    activePath={navbarActivePath} 
                    onLogout={() => {
                      setNavbarActivePath('/logout');
                      alert('Thao tác Đăng xuất từ Navbar (Demo callback)');
                    }} 
                  />
                </div>

                {/* Control Panel to test Active State */}
                <div className="flex-1 bg-[#F4F9FE] p-6 rounded-xl border border-[#E6EDF5]">
                  <h3 className="text-sm font-bold text-[#071A44] mb-2">Kiểm tra Active State của Navbar:</h3>
                  <p className="text-xs text-[#71809A] mb-4">
                    Bấm vào các nút bên dưới để đổi mục đang được kích hoạt (Active highlight #0878EE, chữ trắng):
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { name: '1. Trang chủ', path: '/' },
                      { name: '2. Học tập', path: '/scenarios' },
                      { name: '3. Lịch học', path: '/schedule' },
                      { name: '4. Phân tích', path: '/analytics' },
                      { name: '5. Hồ sơ', path: '/profile' },
                      { name: '6. Cài đặt', path: '/settings' },
                      { name: '7. Trợ giúp', path: '/help' },
                      { name: '8. Đăng xuất', path: '/logout' },
                    ].map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => setNavbarActivePath(item.path)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors ${
                          navbarActivePath === item.path
                            ? 'bg-[#0878EE] text-white border-[#0878EE]'
                            : 'bg-white text-[#071A44] border-[#E6EDF5] hover:bg-blue-50'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-white rounded-lg border border-[#E6EDF5] text-xs space-y-1.5 text-[#71809A]">
                    <div className="font-semibold text-[#071A44]">Quy chuẩn kích thước đã đối soát:</div>
                    <div>• Chiều rộng sidebar: <code>174px</code></div>
                    <div>• Chiều cao mỗi dòng mục: <code>42px</code></div>
                    <div>• Bán kính bo góc (Border Radius): <code>8px</code> (rounded-lg)</div>
                    <div>• Màu active: <code>#0878EE</code>, Chữ: <code>#FFFFFF</code></div>
                    <div>• Real vector SVG icons tương ứng từng chức năng</div>
                  </div>
                </div>
              </div>
            </section>

            {/* FOOTER DEMO */}
            <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm">
              <div className="border-b border-[#E6EDF5] pb-3 mb-4">
                <h2 className="text-lg font-bold text-[#071A44]">3. Footer Component</h2>
                <p className="text-xs text-[#71809A]">
                  Đúng design system, không tự chế thêm business links giả định.
                </p>
              </div>

              <div className="border border-[#E6EDF5] rounded-xl overflow-hidden shadow-sm">
                <Footer />
              </div>
            </section>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: COMPLETE LAYOUTS SIMULATION */}
        {/* ============================================================ */}
        {activeTab === 'layouts-sim' && (
          <div className="space-y-10">
            {/* MAIN LAYOUT SIMULATION */}
            <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm">
              <div className="border-b border-[#E6EDF5] pb-3 mb-4">
                <h2 className="text-lg font-bold text-[#071A44]">Mô phỏng cấu trúc MainLayout</h2>
                <p className="text-xs text-[#71809A]">
                  Khung cấu trúc chuẩn gồm Fixed Header (64px) + Sticky Sidebar (174px) + Dynamic Content Area (bg #F4F9FE) + Footer.
                </p>
              </div>

              {/* Simulation Frame */}
              <div className="border-2 border-dashed border-[#0878EE]/30 rounded-xl overflow-hidden bg-[#F4F9FE]">
                {/* Mini Header */}
                <Header user={sampleUser} onLogout={() => alert('Đăng xuất')} />

                {/* Mini Body */}
                <div className="flex min-h-[380px]">
                  {/* Mini Navbar */}
                  <Navbar activePath="/scenarios" />

                  {/* Simulated Content Area */}
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div className="bg-white p-6 rounded-xl border border-[#E6EDF5] shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-[#071A44]">Vùng nội dung ứng dụng (Outlet)</h3>
                        <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
                          MainLayout Container
                        </span>
                      </div>
                      <p className="text-sm text-[#71809A] leading-relaxed mb-4">
                        Đây là khu vực hiển thị các trang nghiệp vụ như Danh sách kịch bản hội thoại (`/scenarios`), Phòng luyện Kaiwa Roleplay (`/chat`), hoặc Hồ sơ học viên (`/profile`).
                      </p>
                      <div className="flex gap-3">
                        <Button variant="primary" size="sm">Hành động chính</Button>
                        <Button variant="secondary" size="sm">Hành động phụ</Button>
                      </div>
                    </div>

                    <div className="mt-6">
                      <Footer />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* AUTH LAYOUT SIMULATION */}
            <section className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-sm">
              <div className="border-b border-[#E6EDF5] pb-3 mb-4">
                <h2 className="text-lg font-bold text-[#071A44]">Mô phỏng cấu trúc AuthLayout</h2>
                <p className="text-xs text-[#71809A]">
                  Khung giao diện đăng nhập / đăng ký tối giản: Branding JCAP trên cùng, thẻ căn giữa màn hình (max-w-md, radius 12px), footer bản quyền dưới chân.
                </p>
              </div>

              {/* Mini AuthLayout container */}
              <div className="relative min-h-[420px] bg-[#F4F9FE] border border-[#E6EDF5] rounded-xl flex flex-col justify-center items-center p-6">
                <div className="absolute top-4 left-6 text-2xl font-bold text-[#0878EE]">
                  JCAP
                </div>

                <div className="w-full max-w-sm bg-white rounded-xl shadow-md border border-[#E6EDF5] p-6 text-center">
                  <h3 className="text-base font-bold text-[#071A44] mb-1">Mô phỏng Thẻ Xác Thực (Auth Card)</h3>
                  <p className="text-xs text-[#71809A] mb-4">Vùng hiển thị biểu mẫu Đăng nhập hoặc Đăng ký</p>
                  
                  <div className="space-y-3 text-left">
                    <Input label="Email" placeholder="learner@fpt.edu.vn" />
                    <Input label="Mật khẩu" type="password" placeholder="••••••••" />
                    <Button variant="primary" className="w-full mt-2">Đăng nhập</Button>
                  </div>
                </div>

                <div className="absolute bottom-3 text-center text-xs text-[#71809A]">
                  &copy; {new Date().getFullYear()} Japanese Conversation AI Platform.
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL INSTANCE */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Xác nhận hoàn thành buổi luyện tập"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Hủy bỏ
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setIsModalOpen(false);
                addToast('Đã xác nhận hoàn thành kịch bản luyện tập!', 'success');
              }}
            >
              Xác nhận kết thúc
            </Button>
          </>
        }
      >
        <div className="text-sm text-[#71809A] space-y-3">
          <p>
            Bạn có chắc chắn muốn kết thúc phiên hội thoại mô phỏng với nhân vật AI không?
          </p>
          <p className="text-xs bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-200">
            <strong>Lưu ý:</strong> Dữ liệu ghi âm và kết quả chấm điểm phát âm sẽ được hệ thống phân tích và lưu trữ vào tiến độ học tập của bạn.
          </p>
        </div>
      </Modal>

      {/* TOAST NOTIFICATION CONTAINER (Fixed Top-Right) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col items-end pointer-events-none">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={removeToast}
          />
        ))}
      </div>
    </div>
  );
};
