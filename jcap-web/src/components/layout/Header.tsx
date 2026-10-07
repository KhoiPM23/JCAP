import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { creditService } from '../../services/creditService';
import type { User } from '../../types/auth';
import {
  getActiveAiModelInfo,
  loadAllAiModels,
  ACTIVE_AI_MODEL_STORAGE_KEY,
  type AiModelConfigItem,
} from '../../views/admin/AdminAiConfigView';

export interface HeaderProps {
  user?: User | null;
  onLogout?: () => void;
}

interface AiApiCallLog {
  id: string;
  actionName: string;
  endpoint: string;
  modelName: string;
  modelId: string;
  provider: string;
  status: 'pending' | 'success' | 'error';
  httpStatus?: number;
  latencyMs?: number;
  timestamp: string;
}

const AI_CALL_LOGS_STORAGE_KEY = 'jcap_ai_api_call_logs_v1';

const loadSavedAiLogs = (): AiApiCallLog[] => {
  try {
    const raw = sessionStorage.getItem(AI_CALL_LOGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

const saveAiLogs = (logs: AiApiCallLog[]) => {
  try {
    sessionStorage.setItem(AI_CALL_LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 8)));
  } catch {}
};

// Tự động nhận diện các đường dẫn API sử dụng AI trong hệ thống JCAP
const classifyAiEndpoint = (url: string, method: string): string | null => {
  const lower = url.toLowerCase();
  if (lower.includes('/api/admin/scenarios/generate-level-content')) {
    return 'AI Gợi ý Nội dung Kịch bản';
  }
  if (lower.includes('/api/roleplay/sessions') && lower.endsWith('/messages')) {
    return 'AI Phản hồi Hội thoại & Chấm Mission';
  }
  if (lower.includes('/api/roleplay/sessions') && lower.endsWith('/hint')) {
    return 'AI Sinh Gợi ý (On-demand Hint)';
  }
  if (lower.includes('/api/roleplay/sessions') && method.toUpperCase() === 'POST' && !lower.includes('/complete')) {
    return 'AI Khởi tạo Câu chào Mở đầu';
  }
  if (lower.includes('/api/admin/scenarios/ai-status')) {
    return 'Kiểm tra Trạng thái Kết nối AI';
  }
  return null;
};

// Cài đặt trình lắng nghe fetch toàn cục 1 lần duy nhất để theo dõi thời gian thực khi AI đang call API
let isFetchMonitorInstalled = false;
const installGlobalAiFetchMonitor = () => {
  if (isFetchMonitorInstalled || typeof window === 'undefined') return;
  isFetchMonitorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET';
    const aiAction = classifyAiEndpoint(urlStr, method);

    if (!aiAction) {
      return originalFetch(input, init);
    }

    const activeModel = getActiveAiModelInfo();
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowTime = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const startTime = performance.now();

    const pendingEntry: AiApiCallLog = {
      id: callId,
      actionName: aiAction,
      endpoint: `${method.toUpperCase()} ${urlStr.replace(window.location.origin, '')}`,
      modelName: activeModel.displayName,
      modelId: activeModel.modelId,
      provider: activeModel.provider,
      status: 'pending',
      timestamp: nowTime,
    };

    window.dispatchEvent(new CustomEvent('jcap_ai_call_update', { detail: { type: 'start', entry: pendingEntry } }));

    try {
      const response = await originalFetch(input, init);
      const latency = Math.max(1, Math.round(performance.now() - startTime));
      const doneEntry: AiApiCallLog = {
        ...pendingEntry,
        status: response.ok ? 'success' : 'error',
        httpStatus: response.status,
        latencyMs: latency,
      };
      const existing = loadSavedAiLogs().filter((l) => l.id !== callId);
      saveAiLogs([doneEntry, ...existing]);
      window.dispatchEvent(new CustomEvent('jcap_ai_call_update', { detail: { type: 'end', entry: doneEntry } }));
      return response;
    } catch (err) {
      const latency = Math.max(1, Math.round(performance.now() - startTime));
      const errEntry: AiApiCallLog = {
        ...pendingEntry,
        status: 'error',
        httpStatus: 0,
        latencyMs: latency,
      };
      const existing = loadSavedAiLogs().filter((l) => l.id !== callId);
      saveAiLogs([errEntry, ...existing]);
      window.dispatchEvent(new CustomEvent('jcap_ai_call_update', { detail: { type: 'end', entry: errEntry } }));
      throw err;
    }
  };
};

export const Header: React.FC<HeaderProps> = ({ user: propUser, onLogout }) => {
  const { user: authUser, logout } = useAuth();
  const [currentUser, setCurrentUser] = React.useState<User | null>(propUser !== undefined ? propUser : authUser);
  const handleLogout = onLogout || logout;

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const currentQuery = searchParams.get('query') || searchParams.get('search') || '';
  const [searchTerm, setSearchTerm] = React.useState(currentQuery);

  // State cho nút kiểm tra Model AI & Trạng thái Call API cạnh logo JCAP
  const [activeAiModel, setActiveAiModel] = React.useState<AiModelConfigItem>(() => getActiveAiModelInfo());
  const [availableAiModels, setAvailableAiModels] = React.useState<AiModelConfigItem[]>(() =>
    loadAllAiModels().filter((m) => m.isActive)
  );
  const [isAiMonitorOpen, setIsAiMonitorOpen] = React.useState<boolean>(false);
  const [activeCallEntry, setActiveCallEntry] = React.useState<AiApiCallLog | null>(null);
  const [aiCallLogs, setAiCallLogs] = React.useState<AiApiCallLog[]>(() => loadSavedAiLogs());
  const [isTestingPing, setIsTestingPing] = React.useState<boolean>(false);
  const aiMonitorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    installGlobalAiFetchMonitor();

    const syncAiModel = () => {
      setActiveAiModel(getActiveAiModelInfo());
      setAvailableAiModels(loadAllAiModels().filter((m) => m.isActive));
    };

    const handleCallUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ type: 'start' | 'end'; entry: AiApiCallLog }>;
      if (!custom.detail) return;
      if (custom.detail.type === 'start') {
        setActiveCallEntry(custom.detail.entry);
      } else {
        setActiveCallEntry(null);
        setAiCallLogs(loadSavedAiLogs());
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (aiMonitorRef.current && !aiMonitorRef.current.contains(e.target as Node)) {
        setIsAiMonitorOpen(false);
      }
    };

    window.addEventListener('jcap_ai_model_changed', syncAiModel);
    window.addEventListener('storage', syncAiModel);
    window.addEventListener('jcap_ai_call_update', handleCallUpdate);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('jcap_ai_model_changed', syncAiModel);
      window.removeEventListener('storage', syncAiModel);
      window.removeEventListener('jcap_ai_call_update', handleCallUpdate);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleQuickSwitchModel = (model: AiModelConfigItem) => {
    localStorage.setItem(
      ACTIVE_AI_MODEL_STORAGE_KEY,
      JSON.stringify({
        id: model.id,
        modelId: model.modelId,
        displayName: model.displayName,
        provider: model.provider,
      })
    );
    setActiveAiModel(model);
    window.dispatchEvent(new Event('jcap_ai_model_changed'));
  };

  const handleTestAiApiCall = async () => {
    if (isTestingPing) return;
    setIsTestingPing(true);
    const token = localStorage.getItem('jcap_token');
    try {
      await fetch('/api/admin/scenarios/ai-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      // Nếu lỗi mạng vẫn được fetch monitor ghi nhận
    } finally {
      setIsTestingPing(false);
    }
  };

  React.useEffect(() => {
    setSearchTerm(currentQuery);
  }, [currentQuery]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (location.pathname === '/scenarios' || location.pathname === '/') {
      const trimmed = value.trim();
      const newParams = new URLSearchParams(searchParams);
      if (trimmed.length > 0) {
        newParams.set('query', trimmed);
      } else {
        newParams.delete('query');
        newParams.delete('search');
      }
      setSearchParams(newParams, { replace: true });
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchTerm.trim();
    if (trimmed.length === 0) {
      // clear search
      if (location.pathname !== '/scenarios') {
        navigate('/scenarios');
      } else {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('query');
        newParams.delete('search');
        setSearchParams(newParams, { replace: true });
      }
      return;
    }
    if (location.pathname !== '/scenarios') {
      navigate(`/scenarios?query=${encodeURIComponent(trimmed)}`);
    } else {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('query', trimmed);
      setSearchParams(newParams, { replace: true });
    }
  };

  // Đồng bộ propUser hoặc authUser vào currentUser
  React.useEffect(() => {
    if (propUser !== undefined) {
      setCurrentUser(propUser);
      return;
    }
    if (authUser) {
      setCurrentUser((prev) => {
        if (!prev) return authUser;
        return {
          ...authUser,
          creditBalance: typeof prev.creditBalance === 'number' && prev.creditBalance > 0
            ? prev.creditBalance
            : (authUser.creditBalance ?? prev.creditBalance),
        };
      });
    } else {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        try {
          setCurrentUser(JSON.parse(saved));
        } catch {
          setCurrentUser(null);
        }
      }
    }
  }, [authUser, propUser]);

  // Luôn chủ động đồng bộ số dư credit từ máy chủ khi Header mount (chỉ dành cho Learner)
  React.useEffect(() => {
    const token = localStorage.getItem('jcap_token');
    const userRole = propUser?.role || currentUser?.role || authUser?.role;
    if (token && userRole !== 'Admin') {
      creditService.getHistory(1, 1).then((res) => {
        if (res.success && res.data && typeof res.data.currentCreditBalance === 'number') {
          creditService.updateLocalCreditBalance(res.data.currentCreditBalance);
          setCurrentUser((prev) => ({
            ...(prev || authUser || {}),
            creditBalance: res.data!.currentCreditBalance,
          } as User));
        }
      }).catch(() => {});
    }
  }, [propUser?.role, currentUser?.role, authUser?.role]);

  React.useEffect(() => {
    const handleProfileUpdated = (event: any) => {
      const detail = event.detail;
      if (detail) {
        setCurrentUser((prev) => ({
          ...(prev || authUser || {}),
          id: detail.id || prev?.id || authUser?.id || '',
          email: detail.email || prev?.email || authUser?.email || '',
          role: detail.role || prev?.role || authUser?.role || 'Learner',
          fullName: detail.fullName !== undefined ? detail.fullName : (prev?.fullName || authUser?.fullName),
          level: detail.jlptLevel || detail.level || prev?.level || authUser?.level,
          avatarUrl: detail.profilePictureUrl || detail.avatarUrl || prev?.avatarUrl || authUser?.avatarUrl,
          creditBalance: typeof detail.creditBalance === 'number' ? detail.creditBalance : (prev?.creditBalance ?? authUser?.creditBalance),
        }));
      }
    };

    window.addEventListener('jcap_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
  }, [authUser]);

  // Tính số dư credit thực tế hiển thị
  const displayCredit = React.useMemo(() => {
    if (typeof currentUser?.creditBalance === 'number') {
      return currentUser.creditBalance;
    }
    if (typeof authUser?.creditBalance === 'number') {
      return authUser.creditBalance;
    }
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (typeof u.creditBalance === 'number') return u.creditBalance;
      }
    } catch {}
    return 0;
  }, [currentUser?.creditBalance, authUser?.creditBalance]);

  const user = propUser !== undefined ? propUser : (currentUser || authUser);
  const isAdminArea = user?.role === 'Admin' && !location.pathname.startsWith('/scenarios');

  return (
    <header className="h-[64px] bg-white border-b border-[#E6EDF5] flex items-center justify-between px-8 sticky top-0 z-40">
      {/* Left: Logo/Brand + Nút kiểm tra Model AI & Call API */}
      <div className="flex items-center gap-3 relative" ref={aiMonitorRef}>
        <Link to={user?.role === 'Admin' ? "/admin/dashboard" : "/"} className="text-2xl font-bold text-[#0878EE] tracking-tight">
          JCAP
        </Link>

        {/* Nút kiểm tra Model AI đang hoạt động & trạng thái Call API */}
        <button
          type="button"
          onClick={() => setIsAiMonitorOpen((prev) => !prev)}
          title="Nhấn để kiểm tra Model AI nào đang hoạt động và theo dõi trạng thái Call API"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
            activeCallEntry
              ? 'bg-blue-50 border-[#0878EE] text-[#0878EE] ring-2 ring-[#0878EE]/20'
              : 'bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-200 text-emerald-800'
          }`}
        >
          {activeCallEntry ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#0878EE] border-t-transparent animate-spin" />
              <span className="truncate max-w-[180px] sm:max-w-[240px]">
                ⚡ Đang Call API: {activeAiModel.displayName}
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>🤖</span>
              <span className="truncate max-w-[140px] sm:max-w-[200px]">{activeAiModel.displayName}</span>
              <span className="text-[10px] opacity-70">▾</span>
            </>
          )}
        </button>

        {/* Popover chi tiết Model AI & Nhật ký Call API */}
        {isAiMonitorOpen && (
          <div className="absolute left-0 top-12 w-[360px] sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 space-y-3.5 text-left">
            {/* Header Popover */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#071A44] flex items-center gap-1.5">
                  <span>📡</span> Trạng thái AI Engine & Call API
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Theo dõi thời gian thực model nào đang xử lý request AI
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAiMonitorOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Thông tin Model đang active */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Model Đang Hoạt Động Chính
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-blue-200 border border-white/15">
                  {activeAiModel.provider}
                </span>
              </div>

              <div className="text-sm font-black flex items-center justify-between gap-2">
                <span>{activeAiModel.displayName}</span>
                <span className="text-[11px] font-mono font-normal text-slate-300 bg-black/25 px-2 py-0.5 rounded">
                  {activeAiModel.modelId}
                </span>
              </div>

              <div className="text-[11px] text-slate-300 font-mono truncate" title={activeAiModel.endpoint}>
                Endpoint: {activeAiModel.endpoint}
              </div>

              <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[11px]">
                <span>
                  Trạng thái:{' '}
                  {activeCallEntry ? (
                    <strong className="text-amber-300">⚡ Đang gọi ({activeCallEntry.actionName})</strong>
                  ) : (
                    <strong className="text-emerald-300">🟢 Sẵn sàng (Idle)</strong>
                  )}
                </span>
                <button
                  type="button"
                  disabled={isTestingPing}
                  onClick={handleTestAiApiCall}
                  className="px-2.5 py-1 rounded-lg bg-[#0878EE] hover:bg-blue-600 text-white font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                >
                  {isTestingPing ? 'Đang ping...' : '🔄 Test Call API'}
                </button>
              </div>
            </div>

            {/* Đổi nhanh Model AI */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                <span>Chuyển nhanh Model đang dùng:</span>
                <span className="text-[10px] text-slate-400">{availableAiModels.length} model khả dụng</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableAiModels.map((m) => {
                  const isSelected = m.id === activeAiModel.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleQuickSwitchModel(m)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? 'bg-[#0878EE] text-white border-[#0878EE]'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '○'}</span>
                      <span>{m.displayName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nhật ký Call API gần nhất */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600">Nhật ký Call API AI gần đây:</span>
                {aiCallLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      saveAiLogs([]);
                      setAiCallLogs([]);
                    }}
                    className="text-[10px] text-slate-400 hover:text-red-600 font-semibold cursor-pointer"
                  >
                    Xóa log
                  </button>
                )}
              </div>

              {aiCallLogs.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center text-[11px] text-slate-400">
                  Chưa có lượt gọi API AI nào trong phiên này. Hãy bấm <strong>"🔄 Test Call API"</strong> hoặc sử dụng tính năng AI để xem log trực tiếp.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {aiCallLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[#071A44] truncate">{log.actionName}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          Model: <strong className="text-slate-700">{log.modelName}</strong> ({log.modelId})
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">{log.endpoint}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] ${
                            log.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-600 border border-red-200'
                          }`}
                        >
                          {log.status === 'success' ? `${log.httpStatus || 200} OK` : 'Lỗi'}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {log.latencyMs} ms • {log.timestamp}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Link tới trang Cấu hình AI & Prompt */}
            {user?.role === 'Admin' && (
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsAiMonitorOpen(false);
                    navigate('/admin/ai-config');
                  }}
                  className="text-xs font-bold text-[#0878EE] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  ⚙️ Mở trang Quản lý Model AI & Prompt →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Search */}
      {isAdminArea ? (
        <div className="flex-1" />
      ) : (
      <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-[#71809A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-[#E6EDF5] rounded-lg leading-5 bg-gray-50 placeholder-[#71809A] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0878EE] focus:border-[#0878EE] sm:text-sm transition-colors"
            placeholder="Tìm kiếm khóa học, bài học..."
          />
        </div>
      </form>
      )}

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Notifications */}
        <button 
          type="button"
          className="text-[#71809A] hover:text-[#0878EE] transition-colors relative p-1 rounded-full hover:bg-blue-50"
          aria-label="Thông báo"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {/* Notification badge dot */}
          <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-[#D92D20] ring-2 ring-white"></span>
        </button>

        {/* User Account Info & Credit Badge */}
        {user && (
          <div className="flex items-center gap-3 border-l border-[#E6EDF5] pl-6">
            {/* Credit Balance Badge (Chỉ hiển thị cho Learner, Admin không dùng credit) */}
            {user.role !== 'Admin' && (
              <Link
                to="/credits"
                className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs group"
                title="Nhấn để nạp thêm credit"
              >
                <span className="text-amber-600 group-hover:scale-110 transition-transform">🪙</span>
                <span>{displayCredit}</span>
                <span className="hidden sm:inline text-amber-700 font-medium">Credits</span>
              </Link>
            )}

            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-medium text-[#071A44]">{user.fullName || user.email}</span>
              {user.role === 'Admin' ? (
                <span className="text-xs text-red-600 font-bold bg-red-50 px-2.5 py-0.5 rounded-full mt-0.5 border border-red-200">
                  Quản trị viên
                </span>
              ) : user.level ? (
                <span className="text-xs text-[#0878EE] font-medium bg-blue-50 px-2 py-0.5 rounded-full mt-0.5">
                  JLPT {user.level}
                </span>
              ) : null}
            </div>
            
            {/* Avatar Dropdown */}
            <div className="relative group cursor-pointer">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName || user.email}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-transparent group-hover:ring-[#0878EE] transition-all"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div 
                  className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-[#0878EE] font-bold ring-2 ring-transparent group-hover:ring-[#0878EE] transition-all"
                >
                  {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                </div>
              )}
              
              {/* Dropdown menu */}
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl py-1.5 border border-[#E6EDF5] hidden group-hover:block z-50">
                <div className="px-4 py-2 border-b border-gray-100 sm:hidden">
                  <p className="text-xs font-semibold text-[#071A44] truncate">{user.fullName || user.email}</p>
                  {user.role === 'Admin' ? (
                    <span className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full mt-0.5 border border-red-200 inline-block">
                      Quản trị viên
                    </span>
                  ) : (
                    <p className="text-[11px] text-amber-600 font-bold mt-0.5">🪙 {displayCredit} Credits</p>
                  )}
                </div>
                <Link to="/profile" className="flex items-center gap-2 px-4 py-2 text-xs text-[#071A44] hover:bg-slate-50 transition-colors">
                  <span>👤</span> Hồ sơ cá nhân
                </Link>
                {user.role !== 'Admin' && (
                  <>
                    <Link to="/credits" className="flex items-center gap-2 px-4 py-2 text-xs text-[#0878EE] font-medium hover:bg-blue-50 transition-colors">
                      <span>🪙</span> Nạp thêm Credit
                    </Link>
                    <Link to="/credits/history" className="flex items-center gap-2 px-4 py-2 text-xs text-[#071A44] hover:bg-slate-50 transition-colors">
                      <span>📋</span> Lịch sử giao dịch
                    </Link>
                  </>
                )}
                <div className="border-t border-gray-100 my-1"></div>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 text-xs text-[#D92D20] hover:bg-red-50 transition-colors"
                >
                  <span>🚪</span> Đăng xuất
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
