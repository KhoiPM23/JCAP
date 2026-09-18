import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-[#E6EDF5] py-4 px-8 mt-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#71809A]">
        <div>
          &copy; {new Date().getFullYear()} JCAP. Đã đăng ký bản quyền.
        </div>
        <div className="text-xs text-[#71809A]">
          Nền tảng luyện hội thoại tiếng Nhật AI
        </div>
      </div>
    </footer>
  );
};

