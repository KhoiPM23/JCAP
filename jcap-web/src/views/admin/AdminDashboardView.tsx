import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { scenarioService, type AiModelOption } from '../../services/scenarioService';
import { adminShadowingService } from '../../services/adminShadowingService';
import { creditService } from '../../services/creditService';
import type { ScenarioListItem } from '../../types/scenarioDetails';

const DEFAULT_MODEL_OPTIONS: AiModelOption[] = [
  {
    id: 'openai/gpt-oss-120b',
    displayName: 'OpenAI GPT-OSS 120B',
    provider: 'GroqCloud',
    badge: 'GroqCloud • Khuyên dùng',
    description: 'Mô hình 120B tốc độ cao trên hạ tầng GroqCloud, phản hồi hội thoại & tạo kịch bản chuẩn xác.',
    isConfigured: true,
  },
  {
    id: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B Versatile',
    provider: 'GroqCloud',
    badge: 'GroqCloud • Đa năng',
    description: 'Mô hình 70B của Meta trên GroqCloud, đối thoại tiếng Nhật tự nhiên & chấm nhiệm vụ mượt mà.',
    isConfigured: true,
  },
  {
    id: 'llama-3.1-8b-instant',
    displayName: 'Llama 3.1 8B Instant',
    provider: 'GroqCloud',
    badge: 'GroqCloud • Siêu tốc',
    description: 'Mô hình 8B gọn nhẹ với độ trễ cực thấp, phù hợp luyện phản xạ nhanh.',
    isConfigured: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash Lite',
    provider: 'Gemini',
    badge: 'Google AI',
    description: 'Mô hình Gemini 3.1 Flash Lite tối ưu tốc độ của Google AI Studio.',
    isConfigured: false,
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'Gemini',
    badge: 'Google AI',
    description: 'Mô hình Gemini 2.5 Flash cân bằng giữa tốc độ và phân tích ngữ pháp chuyên sâu.',
    isConfigured: false,
  },
  {
    id: 'simulator',
    displayName: 'JCAP Simulator (Offline)',
    provider: 'Simulator',
    badge: 'Nội bộ • Không tốn API',
    description: 'Chế độ giả lập kịch bản nội bộ, hoạt động tức thì không cần kết nối API bên ngoài.',
    isConfigured: true,
  },
];

export const AdminDashboardView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [scenarioCount, setScenarioCount] = useState<number>(0);
  const [shadowingCount, setShadowingCount] = useState<number>(0);
  const [packageCount, setPackageCount] = useState<number>(0);
  const [recentScenarios, setRecentScenarios] = useState<ScenarioListItem[]>([]);
  const [aiModelId, setAiModelId] = useState<string>('openai/gpt-oss-120b');
  const [aiModelName, setAiModelName] = useState<string>('OpenAI GPT-OSS 120B');
  const [aiMode, setAiMode] = useState<string>('Live AI');
  const [availableModels, setAvailableModels] = useState<AiModelOption[]>(DEFAULT_MODEL_OPTIONS);
  const [isModelModalOpen, setIsModelModalOpen] = useState<boolean>(false);
  const [isSwitchingModel, setIsSwitchingModel] = useState<boolean>(false);
  const [switchBannerMsg, setSwitchBannerMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const [scenariosRes, shadowingRes, packagesRes, aiStatusRes] = await Promise.all([
          scenarioService.getAdminScenarios().catch(() => ({ success: false, data: [] as ScenarioListItem[] })),
          adminShadowingService.getCatalog().catch(() => ({ success: false, data: [] as any[] })),
          creditService.getPackages().catch(() => ({ success: false, data: [] as any[] })),
          scenarioService.getAiStatus().catch(() => ({ success: false, data: null })),
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

        if (aiStatusRes.success && aiStatusRes.data) {
          if (aiStatusRes.data.modelId) setAiModelId(aiStatusRes.data.modelId);
          if (aiStatusRes.data.displayName) setAiModelName(aiStatusRes.data.displayName);
          if (aiStatusRes.data.mode) setAiMode(aiStatusRes.data.mode);
          if (aiStatusRes.data.availableModels && aiStatusRes.data.availableModels.length > 0) {
            setAvailableModels(aiStatusRes.data.availableModels);
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleSelectModel = async (option: AiModelOption) => {
    if (isSwitchingModel) return;
    setIsSwitchingModel(true);
    try {
      const res = await scenarioService.switchAiModel(option.id);
      if (res.success && res.data) {
        setAiModelId(res.data.modelId || option.id);
        setAiModelName(res.data.displayName || option.displayName);
        setAiMode(res.data.mode || (option.isConfigured ? 'Live AI' : 'Simulator'));
        if (res.data.availableModels && res.data.availableModels.length > 0) {
          setAvailableModels(res.data.availableModels);
        }
        setSwitchBannerMsg(`Đã chuyển sang mô hình "${res.data.displayName || option.displayName}" cho toàn hệ thống!`);
      } else {
        // Fallback update in UI if backend hasn't been restarted yet
        setAiModelId(option.id);
        setAiModelName(option.displayName);
        setAiMode(option.provider === 'Simulator' || !option.isConfigured ? 'Simulator' : 'Live AI');
        setSwitchBannerMsg(`Đã chọn mô hình "${option.displayName}".`);
      }
      setIsModelModalOpen(false);
      setTimeout(() => setSwitchBannerMsg(null), 4000);
    } catch {
      setAiModelId(option.id);
      setAiModelName(option.displayName);
      setIsModelModalOpen(false);
    } finally {
      setIsSwitchingModel(false);
    }
  };

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

      {switchBannerMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{switchBannerMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSwitchBannerMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

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

        {/* Stat 4: Trạng thái AI (Bấm vào để chọn/đổi Model AI động) */}
        <button
          type="button"
          onClick={() => setIsModelModalOpen(true)}
          title="Nhấn để chuyển đổi mô hình AI Roleplay"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all flex items-center justify-between group text-left cursor-pointer"
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Roleplay Service</span>
            <div className="text-base font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Sẵn sàng
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                {aiMode}
              </span>
            </div>
            <span className="text-xs text-slate-500 mt-1 flex items-center gap-1 group-hover:text-emerald-700 font-medium">
              {aiModelName}
              <span className="text-[11px] text-emerald-600 opacity-80 group-hover:translate-x-0.5 transition-transform">
                ▾ Đổi model
              </span>
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            🤖
          </div>
        </button>
      </div>

      {/* Modal chọn chuyển đổi Model AI động */}
      {isModelModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsModelModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#071A44] flex items-center gap-2">
                  <span>🤖</span> Chuyển đổi Model AI Roleplay & Kịch bản
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Chọn mô hình AI xử lý hội thoại Kaiwa thực tế và tạo gợi ý nội dung kịch bản. Thay đổi có hiệu lực ngay lập tức.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {availableModels.map((item) => {
                const isSelected = item.id.toLowerCase() === aiModelId.toLowerCase();
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isSwitchingModel}
                    onClick={() => handleSelectModel(item)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'border-[#0878EE] bg-blue-50/50 ring-2 ring-[#0878EE]/20'
                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[#071A44]">{item.displayName}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            item.provider === 'GroqCloud'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : item.provider === 'Gemini'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {item.badge}
                        </span>
                        {item.isConfigured ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            ● Live API Sẵn sàng
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            ⚡ Tự động Fallback Simulator (Chưa có API Key)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                      <div className="text-[11px] font-mono text-slate-400">Model ID: {item.id}</div>
                    </div>

                    <div className="pt-1">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0878EE] text-white text-xs font-bold shadow-2xs">
                          ✓ Đang dùng
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white text-xs font-semibold transition-colors">
                          Chọn
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>💡 Phạm vi áp dụng: Phòng luyện hội thoại (`/scenarios/practice`) & Tạo kịch bản AI (`/admin/scenarios`)</span>
              <button
                type="button"
                onClick={() => setIsModelModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

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
