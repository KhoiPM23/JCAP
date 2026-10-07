import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { scenarioService } from '../../services/scenarioService';
import { adminShadowingService } from '../../services/adminShadowingService';
import { creditService } from '../../services/creditService';
import type { ScenarioListItem } from '../../types/scenarioDetails';
import { getActiveAiModelInfo, ACTIVE_AI_MODEL_STORAGE_KEY } from './AdminAiConfigView';

export const AdminDashboardView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [scenarioCount, setScenarioCount] = useState<number>(0);
  const [shadowingCount, setShadowingCount] = useState<number>(0);
  const [packageCount, setPackageCount] = useState<number>(0);
  const [recentScenarios, setRecentScenarios] = useState<ScenarioListItem[]>([]);
  const [aiModelName, setAiModelName] = useState<string>(() => getActiveAiModelInfo().displayName);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const [scenariosRes, shadowingRes, packagesRes, aiStatusRes] = await Promise.all([
          scenarioService.getAdminScenarios().catch(() => ({ success: false, data: [] as ScenarioListItem[] })),
          adminShadowingService.getCatalog().catch(() => ({ success: false, data: [] as any[] })),
          creditService.getPackages().catch(() => ({ success: false, data: [] as any[] })),
          scenarioService.getAiStatus().catch(() => ({ success: false, data: undefined })),
        ]);

        if (scenariosRes.success && scenariosRes.data) {
          setScenarioCount(scenariosRes.data.length);
          setRecentScenarios(scenariosRes.data.slice(0, 5));
        }

        if (shadowingRes.success && shadowingRes.data) {
          setShadowingCount(shadowingRes.data.length);
        }

        if (packagesRes.success && packagesRes.data) {
          setPackageCount(packagesRes.data.length);
        }

        const localSaved = localStorage.getItem(ACTIVE_AI_MODEL_STORAGE_KEY);
        if (localSaved) {
          setAiModelName(getActiveAiModelInfo().displayName);
        } else if (aiStatusRes.success && aiStatusRes.data?.displayName) {
          setAiModelName(aiStatusRes.data.displayName);
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();

    const handleModelChanged = () => {
      setAiModelName(getActiveAiModelInfo().displayName);
    };
    window.addEventListener('jcap_ai_model_changed', handleModelChanged);
    return () => window.removeEventListener('jcap_ai_model_changed', handleModelChanged);
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden border border-slate-700/50">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-xs">
              <span>🛡️</span> Cổng Quản Trị Hệ Thống JCAP
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Xin chào, {user?.fullName || 'Quản trị viên'}!
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Chào mừng bạn đến với trang Tổng quan Quản trị. Quản lý kịch bản hội thoại AI, bài luyện phát âm Shadowing và thiết lập gói nạp credit cho toàn bộ nền tảng.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/scenarios')}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2"
            >
              <span>💬</span> Kịch bản Hội thoại
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/shadowing')}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2"
            >
              <span>🎧</span> Quản lý Shadowing
            </button>
          </div>
        </div>

        {/* Decorative circle glow */}
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Stat 1: Kịch bản */}
        <Link
          to="/admin/scenarios"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-400 hover:shadow-md transition-all flex items-center justify-between group"
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kịch bản Hội thoại</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {isLoading ? '...' : scenarioCount}
            </div>
            <span className="text-xs text-blue-600 font-medium mt-1 inline-block group-hover:underline">
              Quản lý chi tiết →
            </span>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            💬
          </div>
        </Link>

        {/* Stat 2: Shadowing */}
        <Link
          to="/admin/shadowing"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-400 hover:shadow-md transition-all flex items-center justify-between group"
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bài luyện Shadowing</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {isLoading ? '...' : shadowingCount}
            </div>
            <span className="text-xs text-purple-600 font-medium mt-1 inline-block group-hover:underline">
              Quản lý giáo trình →
            </span>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            🎧
          </div>
        </Link>

        {/* Stat 3: Gói Credit */}
        <Link
          to="/admin/credits/packages"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-amber-400 hover:shadow-md transition-all flex items-center justify-between group"
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gói nạp Credit</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {isLoading ? '...' : packageCount}
            </div>
            <span className="text-xs text-amber-600 font-medium mt-1 inline-block group-hover:underline">
              Bảng giá & Gói nạp →
            </span>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            🪙
          </div>
        </Link>

        {/* Stat 4: Trạng thái AI */}
        <Link
          to="/admin/ai-config"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all flex items-center justify-between group"
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Roleplay Service</span>
            <div className="text-base font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Sẵn sàng
              <span className="text-xs font-medium text-slate-400">• {aiModelName}</span>
            </div>
            <span className="text-xs text-emerald-600 font-medium mt-1 inline-block group-hover:underline">
              Quản lý model AI →
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            🤖
          </div>
        </Link>
      </div>

      {/* Quick Navigation / Features Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span>⚡</span> Lối Tắt Quản Trị Hệ Thống
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/admin/scenarios"
            className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-blue-50/50 hover:border-blue-200 transition-all flex items-start gap-3.5 group"
          >
            <div className="p-2.5 bg-white text-blue-600 rounded-lg border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform">
              💬
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                Kịch bản Hội thoại
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Xem danh mục, tạo mới kịch bản tình huống Kaiwa và cập nhật persona hội thoại AI.
              </p>
            </div>
          </Link>

          <Link
            to="/admin/shadowing"
            className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-purple-50/50 hover:border-purple-200 transition-all flex items-start gap-3.5 group"
          >
            <div className="p-2.5 bg-white text-purple-600 rounded-lg border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform">
              🎧
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                Quản lý Shadowing
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Quản lý thư viện giáo trình Minna, TRY! N4, câu thoại bản xứ và cấu hình phát âm.
              </p>
            </div>
          </Link>

          <Link
            to="/admin/credits/packages"
            className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-amber-50/50 hover:border-amber-200 transition-all flex items-start gap-3.5 group"
          >
            <div className="p-2.5 bg-white text-amber-600 rounded-lg border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform">
              🪙
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                Gói Nạp & Bảng Giá Credit
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Điều chỉnh các gói nạp credit, thiết lập giá tiền VND, kích hoạt hoặc ẩn gói nạp.
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Scenarios Table Preview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Danh Mục Kịch Bản Gần Đây</h2>
            <p className="text-xs text-slate-500 mt-0.5">Các tình huống hội thoại hiện có trong hệ thống JCAP</p>
          </div>
          <Link
            to="/admin/scenarios"
            className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
          >
            Xem toàn bộ ({scenarioCount}) →
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Đang tải dữ liệu kịch bản...
          </div>
        ) : recentScenarios.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Chưa có kịch bản nào được tạo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-6">ID & Mã</th>
                  <th className="py-3 px-6">Tiêu Đề</th>
                  <th className="py-3 px-6 text-center">Trạng Thái</th>
                  <th className="py-3 px-6 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentScenarios.map((sc) => (
                  <tr key={sc.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-6 font-mono text-xs text-slate-500">
                      #{sc.id} <span className="text-slate-400">({sc.scenarioCode || '—'})</span>
                    </td>
                    <td className="py-3.5 px-6 font-medium text-slate-900">
                      {sc.title}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ● Hoạt động
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => navigate('/admin/scenarios')}
                        className="text-xs text-blue-600 font-semibold hover:underline"
                      >
                        Quản lý →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboardView;
