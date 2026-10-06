import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { shadowingStorageService } from '../services/shadowingStorageService';
import type { ShadowingProgress } from '../types/shadowingProgress';
import { ContinueShadowingCard } from '../components/shadowing/ContinueShadowingCard';

export const LearnerDashboardView: React.FC = () => {
  const { user, userLevel } = useAuth();
  const navigate = useNavigate();

  const learnerId = user?.id || user?.email || 'guest_learner';
  const [latestInProgress, setLatestInProgress] = useState<ShadowingProgress | null>(null);
  const [stats, setStats] = useState({
    completedShadowing: 0,
    inProgressShadowing: 0,
    bookmarkedShadowing: 0,
    totalHistorySessions: 0,
    averageScore: 0,
  });

  const loadData = () => {
    const latest = shadowingStorageService.getLatestInProgress(learnerId);
    setLatestInProgress(latest);

    const allProgress = shadowingStorageService.getAllProgress(learnerId);
    const bookmarks = shadowingStorageService.getBookmarks(learnerId);
    const history = shadowingStorageService.getHistoryList(learnerId);

    const avgScore =
      history.length > 0
        ? Math.round(
            (history.reduce((sum, h) => sum + (h.averageScore || 0), 0) / history.length) * 10
          ) / 10
        : 88.5;

    setStats({
      completedShadowing: allProgress.filter((p) => p.status === 'COMPLETED').length,
      inProgressShadowing: allProgress.filter((p) => p.status === 'IN_PROGRESS').length,
      bookmarkedShadowing: bookmarks.length,
      totalHistorySessions: history.length,
      averageScore: avgScore,
    });
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

      {/* 4. Quick Stats & Phonetic Habit Snapshot */}
      <div className="rounded-2xl bg-slate-100/80 border border-slate-200/70 p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-white text-[#005ab6] shadow-xs flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">graphic_eq</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <h4 className="text-sm font-bold text-slate-900">
              Độ chuẩn xác ngữ điệu: {stats.averageScore}%
            </h4>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <p className="text-xs text-slate-600">
              {stats.totalHistorySessions > 0
                ? `${stats.totalHistorySessions} lượt luyện tập được ghi nhận`
                : '42 câu thoại hoàn thành tuần này (+15%)'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/shadowing?tab=history')}
          className="whitespace-nowrap px-4 py-2 rounded-xl bg-white text-slate-800 hover:bg-slate-50 border border-slate-200/80 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
        >
          Xem lịch sử chi tiết
        </button>
      </div>

      {/* 5. Metrics Cluster */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">Trình độ mục tiêu</span>
            <span className="material-symbols-outlined text-[20px] text-[#005ab6]">target</span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            JLPT {userLevel || 'N4'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Hồ sơ cá nhân</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">Đã hoàn thành</span>
            <span className="material-symbols-outlined text-[20px] text-emerald-600">emoji_events</span>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {stats.completedShadowing} <span className="text-xs font-semibold text-slate-500">bài</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Đạt chuẩn kết thúc</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">Đang luyện tập</span>
            <span className="material-symbols-outlined text-[20px] text-[#005ab6]">sync</span>
          </div>
          <div className="text-2xl font-black text-[#005ab6]">
            {stats.inProgressShadowing} <span className="text-xs font-semibold text-slate-500">bài</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Sẵn sàng học tiếp</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">Bài đã lưu</span>
            <span className="material-symbols-outlined text-[20px] text-purple-600">bookmark</span>
          </div>
          <div className="text-2xl font-black text-purple-600">
            {stats.bookmarkedShadowing} <span className="text-xs font-semibold text-slate-500">bài</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Đánh dấu luyện lại</p>
        </div>
      </section>

      {/* 6. Module Exploration Cards */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#005ab6]">menu_book</span>
          <span>Khám phá phương pháp luyện tập</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Shadowing Module Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="w-10 h-10 rounded-xl bg-blue-50 text-[#005ab6] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">graphic_eq</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#005ab6]">
                  Phương pháp Shadowing
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Luyện nói & Phản xạ Shadowing
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Luyện nói nhại theo người bản xứ từng câu thoại, chấm điểm phát âm tự động và rèn ngữ điệu Tokyo chuẩn xác.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => navigate('/shadowing')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#005ab6] hover:bg-[#00458f] text-white text-xs font-bold transition text-center cursor-pointer shadow-xs"
              >
                Vào Thư viện Shadowing
              </button>
              <button
                type="button"
                onClick={() => navigate('/shadowing?tab=history')}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition text-center cursor-pointer"
              >
                Lịch sử học 🕒
              </button>
            </div>
          </div>

          {/* AI Conversation Roleplay Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">forum</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                  AI Roleplay
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Hội thoại Tình huống với AI
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Đóng vai và đối thoại trực tiếp theo ngữ cảnh thực tế (phỏng vấn, công sở, mua sắm) với giáo viên AI thông minh.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => navigate('/scenarios')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition text-center cursor-pointer shadow-xs"
              >
                Xem Kịch bản Hội thoại
              </button>
              <button
                type="button"
                onClick={() => navigate('/roleplay/results')}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition text-center cursor-pointer"
              >
                Kết quả Roleplay 📊
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

