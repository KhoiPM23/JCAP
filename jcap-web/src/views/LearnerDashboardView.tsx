import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { shadowingStorageService } from '../services/shadowingStorageService';
import type { ShadowingProgress } from '../types/shadowingProgress';
import { ContinueShadowingCard } from '../components/shadowing/ContinueShadowingCard';

export const LearnerDashboardView: React.FC = () => {
  const { user, userLevel } = useAuth();
  const navigate = useNavigate();

  const learnerId = user?.id || user?.email || 'guest_learner';
  const [latestInProgress, setLatestInProgress] = useState<ShadowingProgress | null>(null);

  const loadData = () => {
    const latest = shadowingStorageService.getLatestInProgress(learnerId);
    setLatestInProgress(latest);
  };

  useEffect(() => {
    loadData();
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleFocus);
    };
  }, [learnerId]);

  const displayName = user?.fullName || user?.email?.split('@')[0] || 'Học viên';

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* 1. Welcome Greeting Header & Streak */}
      <div className="bg-gradient-to-r from-[#071A44] via-[#0D2D72] to-[#005ab6] rounded-3xl p-7 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold text-white/90">
              <span>🇯🇵</span>
              <span>Lộ trình Luyện phản xạ Tiếng Nhật</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-300 font-bold">JLPT {userLevel || 'N4'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Xin chào, {displayName}! 👋
            </h1>
            <p className="text-white/80 text-sm max-w-xl">
              Chào mừng bạn quay lại với JCAP. Cùng luyện phát âm chuẩn người bản xứ và phản xạ hội thoại thực tế mỗi ngày!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Streak Counter Pill */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 backdrop-blur-md text-white font-semibold text-xs border border-white/20">
              <span className="text-amber-300 text-base">🔥</span>
              <span>Chuỗi 5 ngày liên tiếp</span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/shadowing')}
              className="px-5 py-2.5 rounded-xl bg-white text-[#071A44] hover:bg-slate-100 font-bold text-xs transition shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-[#005ab6]">graphic_eq</span>
              <span>Thư viện Shadowing</span>
            </button>
          </div>
        </div>

        {/* Decorative background element */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      </div>

      {/* 2. Main Hero Resume Section: "Tiếp tục học Shadowing" */}
      <ContinueShadowingCard progress={latestInProgress} showEmptyState={true} />

      {/* 3. Daily Recommended Pathways (Lộ trình học đề xuất hôm nay) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#005ab6]">alt_route</span>
            <span>Lộ trình học đề xuất hôm nay</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">Cá nhân hóa theo tiến độ</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Bài tiếp theo */}
          <div
            onClick={() => navigate('/shadowing')}
            className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                  Bài tiếp theo
                </span>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span> ~6 phút
                </span>
              </div>
              <div className="text-lg font-bold text-slate-900 pt-1 group-hover:text-[#005ab6] transition-colors">
                大学の食堂で
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Tại nhà ăn trường đại học
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-400 text-xs font-medium">8 câu thoại · 12 mora</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#005ab6] group-hover:bg-[#005ab6] group-hover:text-white flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </div>
            </div>
          </div>

          {/* Card 2: Ngữ pháp & AI Roleplay */}
          <div
            onClick={() => navigate('/scenarios')}
            className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-semibold">
                  Ngữ pháp ứng dụng
                </span>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span> ~4 phút
                </span>
              </div>
              <div className="text-lg font-bold text-slate-900 pt-1 group-hover:text-amber-600 transition-colors">
                〜てもいいですか
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Mẫu câu xin phép và nhượng bộ trong giao tiếp
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-400 text-xs font-medium">5 tình huống đàm thoại</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </div>
            </div>
          </div>

          {/* Card 3: Phản xạ âm */}
          <div
            onClick={() => navigate('/shadowing')}
            className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 cursor-pointer group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-[#005ab6] text-xs font-semibold">
                  Phản xạ cao độ
                </span>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span> ~3 phút
                </span>
              </div>
              <div className="text-lg font-bold text-slate-900 pt-1 group-hover:text-[#005ab6] transition-colors">
                雨 vs 飴
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Phân biệt cao độ pitch accent từ đồng âm
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-400 text-xs font-medium">Pitch Accent Mini-drill</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#005ab6] group-hover:bg-[#005ab6] group-hover:text-white flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

