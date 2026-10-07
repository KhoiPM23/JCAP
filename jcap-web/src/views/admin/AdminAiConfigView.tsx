import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { scenarioService } from '../../services/scenarioService';

export interface AiModelConfigItem {
  id: string;
  displayName: string;
  modelId: string;
  provider: 'Google Gemini' | 'GroqCloud' | 'OpenAI' | 'Anthropic Claude' | 'DeepSeek' | 'Custom API';
  endpoint: string;
  apiKey: string;
  description: string;
  temperature: number;
  maxTokens: number;
  isSystem: boolean; // true = Gemini & GroqCloud để cứng (không xóa)
  isActive: boolean; // trạng thái bật/tắt model trong danh mục
  updatedAt: string;
}

export const AI_MODELS_STORAGE_KEY = 'jcap_ai_models_catalog_v1';
export const ACTIVE_AI_MODEL_STORAGE_KEY = 'jcap_active_ai_model_v1';
export const AI_PROMPT_STORAGE_KEY = 'jcap_ai_system_prompt_v1';

export const HARDCODED_SYSTEM_MODELS: AiModelConfigItem[] = [
  {
    id: 'sys-gemini-flash-lite',
    displayName: 'Gemini 3.1 Flash Lite',
    modelId: 'gemini-3.1-flash-lite',
    provider: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    apiKey: 'AIzaSyD9_JCAP_Gemini_Hardcoded_Key_2026',
    description: 'Model Google Gemini tích hợp cứng trong hệ thống JCAP, tối ưu tốc độ phản hồi hội thoại Kaiwa và phân tích ngữ pháp JLPT N5-N3.',
    temperature: 0.7,
    maxTokens: 2048,
    isSystem: true,
    isActive: true,
    updatedAt: 'Cố định hệ thống',
  },
  {
    id: 'sys-groq-gpt-oss-120b',
    displayName: 'GroqCloud GPT-OSS 120B',
    modelId: 'openai/gpt-oss-120b',
    provider: 'GroqCloud',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: 'gsk_JCAP_Groq_Integrated_Key_2026',
    description: 'Model OpenAI GPT-OSS 120B chạy trên hạ tầng LPU của GroqCloud (tích hợp cứng), tốc độ sinh văn bản siêu nhanh và chấm nhiệm vụ chuẩn xác.',
    temperature: 0.6,
    maxTokens: 2048,
    isSystem: true,
    isActive: true,
    updatedAt: 'Cố định hệ thống',
  },
];

const INITIAL_MOCK_CUSTOM_MODELS: AiModelConfigItem[] = [
  {
    id: 'custom-llama-3-3-70b',
    displayName: 'Llama 3.3 70B Versatile',
    modelId: 'llama-3.3-70b-versatile',
    provider: 'GroqCloud',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: 'gsk_mock_llama70b_custom_key_99281a',
    description: 'Mô hình mã nguồn mở 70B đa ngôn ngữ dùng dự phòng khi lưu lượng truy cập cao.',
    temperature: 0.7,
    maxTokens: 2048,
    isSystem: false,
    isActive: true,
    updatedAt: '2026-09-30',
  },
];

const DEFAULT_SYSTEM_PROMPT = `Bạn là đối tác luyện hội thoại tiếng Nhật (AI Roleplay Partner) trên nền tảng JCAP.
- Luôn nhập vai đúng với nhân vật (AI Persona) và trình độ JLPT (N5, N4, N3) của kịch bản.
- Sử dụng từ vựng, ngữ pháp tự nhiên của người bản xứ, tạo cơ hội cho học viên hoàn thành từng nhiệm vụ (Mission) theo thứ tự.
- Đánh giá chính xác câu nói của học viên để trả về nhận xét ngữ pháp (Linguistic Feedback) và gợi ý cách diễn đạt tự nhiên hơn.`;

export function loadAllAiModels(): AiModelConfigItem[] {
  try {
    const raw = localStorage.getItem(AI_MODELS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AiModelConfigItem[];
      if (Array.isArray(parsed)) {
        const customOnly = parsed.filter((m) => !m.isSystem);
        const sysOverrides = new Map(parsed.filter((m) => m.isSystem).map((m) => [m.id, m]));
        const mergedSys = HARDCODED_SYSTEM_MODELS.map((sys) => {
          const override = sysOverrides.get(sys.id);
          return override
            ? {
                ...sys,
                temperature: override.temperature ?? sys.temperature,
                maxTokens: override.maxTokens ?? sys.maxTokens,
                description: override.description || sys.description,
              }
            : sys;
        });
        return [...mergedSys, ...customOnly];
      }
    }
  } catch {
    // ignore storage errors
  }
  return [...HARDCODED_SYSTEM_MODELS, ...INITIAL_MOCK_CUSTOM_MODELS];
}

export function getActiveAiModelInfo(): AiModelConfigItem {
  const models = loadAllAiModels();
  try {
    const saved = localStorage.getItem(ACTIVE_AI_MODEL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const found = models.find((m) => m.id === parsed.id || m.modelId === parsed.modelId);
      if (found) {
        return found;
      }
    }
  } catch {
    // ignore
  }
  return models[0];
}

const maskApiKey = (key: string): string => {
  if (!key) return 'Chưa cấu hình';
  if (key.length <= 12) return '••••••••••••';
  return `${key.slice(0, 7)}••••••••••••••••••••${key.slice(-4)}`;
};

export const AdminAiConfigView: React.FC = () => {
  const navigate = useNavigate();

  const [models, setModels] = useState<AiModelConfigItem[]>(() => loadAllAiModels());
  const [activeModelId, setActiveModelId] = useState<string>(() => getActiveAiModelInfo().id);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('ALL');
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // System Prompt state (mock configuration)
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    return localStorage.getItem(AI_PROMPT_STORAGE_KEY) || DEFAULT_SYSTEM_PROMPT;
  });

  // Modal CRUD state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<AiModelConfigItem | null>(null);
  const [formState, setFormState] = useState<{
    displayName: string;
    modelId: string;
    provider: AiModelConfigItem['provider'];
    endpoint: string;
    apiKey: string;
    description: string;
    temperature: number;
    maxTokens: number;
    isActive: boolean;
  }>({
    displayName: '',
    modelId: '',
    provider: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    description: '',
    temperature: 0.7,
    maxTokens: 2048,
    isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const syncState = () => {
      setModels(loadAllAiModels());
      setActiveModelId(getActiveAiModelInfo().id);
    };
    window.addEventListener('jcap_ai_model_changed', syncState);

    // Sync initial active model from backend if not yet saved in localStorage
    const saved = localStorage.getItem(ACTIVE_AI_MODEL_STORAGE_KEY);
    if (!saved) {
      scenarioService.getAiStatus().then((res) => {
        if (res.success && res.data?.modelId) {
          const matched = models.find(
            (m) => m.modelId.toLowerCase() === res.data!.modelId.toLowerCase()
          );
          if (matched) {
            setActiveModelId(matched.id);
            localStorage.setItem(
              ACTIVE_AI_MODEL_STORAGE_KEY,
              JSON.stringify({
                id: matched.id,
                modelId: matched.modelId,
                displayName: matched.displayName,
                provider: matched.provider,
              })
            );
            window.dispatchEvent(new Event('jcap_ai_model_changed'));
          }
        }
      }).catch(() => {});
    }

    return () => window.removeEventListener('jcap_ai_model_changed', syncState);
  }, []);

  const saveModelsToStorage = (nextModels: AiModelConfigItem[]) => {
    setModels(nextModels);
    localStorage.setItem(AI_MODELS_STORAGE_KEY, JSON.stringify(nextModels));
    window.dispatchEvent(new Event('jcap_ai_model_changed'));
  };

  const showNotice = (text: string, type: 'success' | 'info' = 'success') => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const handleSetActiveModel = (item: AiModelConfigItem) => {
    if (!item.isActive) {
      showNotice(`Vui lòng bật trạng thái hoạt động cho model "${item.displayName}" trước khi chọn sử dụng.`, 'info');
      return;
    }
    setActiveModelId(item.id);
    localStorage.setItem(
      ACTIVE_AI_MODEL_STORAGE_KEY,
      JSON.stringify({
        id: item.id,
        modelId: item.modelId,
        displayName: item.displayName,
        provider: item.provider,
      })
    );
    window.dispatchEvent(new Event('jcap_ai_model_changed'));
    showNotice(`Đã chuyển sang sử dụng model "${item.displayName}" (${item.modelId}) cho hệ thống Roleplay!`);
  };

  const handleToggleKeyVisibility = (id: string) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormError(null);
    setFormState({
      displayName: '',
      modelId: '',
      provider: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      description: '',
      temperature: 0.7,
      maxTokens: 2048,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: AiModelConfigItem) => {
    setEditingItem(item);
    setFormError(null);
    setFormState({
      displayName: item.displayName,
      modelId: item.modelId,
      provider: item.provider,
      endpoint: item.endpoint,
      apiKey: item.apiKey,
      description: item.description,
      temperature: item.temperature,
      maxTokens: item.maxTokens,
      isActive: item.isActive,
    });
    setIsModalOpen(true);
  };

  const handleProviderPresetChange = (provider: AiModelConfigItem['provider']) => {
    let defaultEndpoint = formState.endpoint;
    if (provider === 'OpenAI') defaultEndpoint = 'https://api.openai.com/v1/chat/completions';
    else if (provider === 'GroqCloud') defaultEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
    else if (provider === 'Google Gemini') defaultEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
    else if (provider === 'Anthropic Claude') defaultEndpoint = 'https://api.anthropic.com/v1/messages';
    else if (provider === 'DeepSeek') defaultEndpoint = 'https://api.deepseek.com/v1/chat/completions';

    setFormState((prev) => ({
      ...prev,
      provider,
      endpoint: defaultEndpoint,
    }));
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.displayName.trim() || !formState.modelId.trim()) {
      setFormError('Vui lòng nhập đầy đủ Tên hiển thị và Mã Model ID.');
      return;
    }
    if (!formState.apiKey.trim()) {
      setFormError('Vui lòng nhập API Key cho Model.');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    if (editingItem) {
      const updatedList = models.map((m) => {
        if (m.id !== editingItem.id) return m;
        // Nếu là 2 model cứng hệ thống, chỉ cho phép cập nhật mô tả & tham số sinh (giữ nguyên provider/modelId/apiKey cứng)
        if (m.isSystem) {
          return {
            ...m,
            description: formState.description.trim() || m.description,
            temperature: formState.temperature,
            maxTokens: formState.maxTokens,
          };
        }
        return {
          ...m,
          displayName: formState.displayName.trim(),
          modelId: formState.modelId.trim(),
          provider: formState.provider,
          endpoint: formState.endpoint.trim(),
          apiKey: formState.apiKey.trim(),
          description: formState.description.trim(),
          temperature: formState.temperature,
          maxTokens: formState.maxTokens,
          isActive: formState.isActive,
          updatedAt: today,
        };
      });

      saveModelsToStorage(updatedList);

      // Nếu đang sửa đúng model đang active thì đồng bộ lại tên hiển thị
      if (editingItem.id === activeModelId) {
        const updatedActive = updatedList.find((m) => m.id === activeModelId);
        if (updatedActive) {
          localStorage.setItem(
            ACTIVE_AI_MODEL_STORAGE_KEY,
            JSON.stringify({
              id: updatedActive.id,
              modelId: updatedActive.modelId,
              displayName: updatedActive.displayName,
              provider: updatedActive.provider,
            })
          );
        }
      }

      setIsModalOpen(false);
      showNotice(`Đã cập nhật cấu hình model "${formState.displayName.trim()}" thành công!`);
    } else {
      const newItem: AiModelConfigItem = {
        id: `custom-${Date.now()}`,
        displayName: formState.displayName.trim(),
        modelId: formState.modelId.trim(),
        provider: formState.provider,
        endpoint: formState.endpoint.trim() || 'https://api.openai.com/v1/chat/completions',
        apiKey: formState.apiKey.trim(),
        description: formState.description.trim() || `Mô hình ${formState.displayName.trim()} do Admin thêm mới.`,
        temperature: formState.temperature,
        maxTokens: formState.maxTokens,
        isSystem: false,
        isActive: formState.isActive,
        updatedAt: today,
      };

      const nextList = [...models, newItem];
      saveModelsToStorage(nextList);
      setIsModalOpen(false);
      showNotice(`Đã thêm mới API Model "${newItem.displayName}" vào danh mục!`);
    }
  };

  const handleToggleModelActive = (item: AiModelConfigItem) => {
    if (item.isSystem) {
      showNotice('Hai model mặc định của hệ thống (Gemini & GroqCloud) luôn được duy trì ở trạng thái sẵn sàng.', 'info');
      return;
    }
    const nextActive = !item.isActive;
    const nextList = models.map((m) => (m.id === item.id ? { ...m, isActive: nextActive } : m));
    saveModelsToStorage(nextList);

    if (!nextActive && activeModelId === item.id) {
      const fallback = HARDCODED_SYSTEM_MODELS[0];
      setActiveModelId(fallback.id);
      localStorage.setItem(
        ACTIVE_AI_MODEL_STORAGE_KEY,
        JSON.stringify({
          id: fallback.id,
          modelId: fallback.modelId,
          displayName: fallback.displayName,
          provider: fallback.provider,
        })
      );
      showNotice(`Đã tạm ngưng "${item.displayName}" và tự động chuyển về model cứng "${fallback.displayName}".`, 'info');
    } else {
      showNotice(`Đã ${nextActive ? 'kích hoạt' : 'tạm ngưng'} model "${item.displayName}".`);
    }
  };

  const handleDeleteModel = (item: AiModelConfigItem) => {
    if (item.isSystem) {
      showNotice('Không thể xóa 2 model cố định của hệ thống (Gemini & GroqCloud).', 'info');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa API Model "${item.displayName}" (${item.modelId})?`)) {
      return;
    }

    const nextList = models.filter((m) => m.id !== item.id);
    saveModelsToStorage(nextList);

    if (activeModelId === item.id) {
      const fallback = HARDCODED_SYSTEM_MODELS[0];
      setActiveModelId(fallback.id);
      localStorage.setItem(
        ACTIVE_AI_MODEL_STORAGE_KEY,
        JSON.stringify({
          id: fallback.id,
          modelId: fallback.modelId,
          displayName: fallback.displayName,
          provider: fallback.provider,
        })
      );
    }

    showNotice(`Đã xóa model "${item.displayName}" khỏi danh sách.`);
  };

  const handleSavePrompt = () => {
    localStorage.setItem(AI_PROMPT_STORAGE_KEY, systemPrompt);
    showNotice('Đã lưu cấu hình System Prompt mặc định cho AI Roleplay!');
  };

  const handleResetPrompt = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    localStorage.setItem(AI_PROMPT_STORAGE_KEY, DEFAULT_SYSTEM_PROMPT);
    showNotice('Đã khôi phục System Prompt về mặc định của hệ thống.', 'info');
  };

  const activeModelObj = models.find((m) => m.id === activeModelId) || models[0];

  const filteredModels = models.filter((m) => {
    const matchesProvider = providerFilter === 'ALL' || m.provider === providerFilter;
    if (!matchesProvider) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      m.displayName.toLowerCase().includes(q) ||
      m.modelId.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold mb-2">
            <span>🤖</span> Trung Tâm Điều Khiển AI & Prompt (JCAP AI Hub)
          </div>
          <h1 className="text-2xl font-bold text-[#071A44]">⚙️ Cấu hình Model AI & System Prompt</h1>
          <p className="text-slate-500 text-sm mt-1">
            Quản lý các kết nối API Model AI đang hoạt động (cố định Gemini & GroqCloud) và thêm mới các Model AI mở rộng cho phòng luyện hội thoại.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold transition cursor-pointer"
          >
            ← Về Tổng quan
          </button>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-5 py-2.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <span>➕</span> Thêm API Model AI
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {bannerMessage && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between border shadow-2xs ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{bannerMessage.type === 'success' ? '✅' : 'ℹ️'}</span>
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-xs font-bold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Banner: Active Model & System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 bg-gradient-to-r from-[#071A44] via-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Model AI Đang Điều Phối Chính (Active Engine)
            </span>
            <div className="text-xl sm:text-2xl font-black flex flex-wrap items-center gap-2.5">
              <span>{activeModelObj.displayName}</span>
              <span className="text-xs font-mono font-semibold bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg text-blue-200">
                {activeModelObj.modelId}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
              Nhà cung cấp: <strong className="text-white">{activeModelObj.provider}</strong> • Temperature:{' '}
              <strong className="text-white">{activeModelObj.temperature}</strong> • Max Tokens:{' '}
              <strong className="text-white">{activeModelObj.maxTokens}</strong>
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
              ● Live API Sẵn sàng
            </span>
            <span className="text-[11px] text-slate-400">
              {activeModelObj.isSystem ? '🔒 Model Cố định Hệ thống' : '🛠️ Model Mở rộng (Custom)'}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng quan Danh mục AI</span>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xl font-black text-[#071A44]">
                  {models.filter((m) => m.isSystem).length}
                </div>
                <div className="text-xs text-slate-500 font-medium">Model Cứng (Core)</div>
              </div>
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="text-xl font-black text-[#0878EE]">
                  {models.filter((m) => !m.isSystem).length}
                </div>
                <div className="text-xs text-slate-600 font-medium">Model Mở rộng</div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            * Gemini & GroqCloud được ghim cố định để đảm bảo hệ thống luôn có kết nối chuẩn.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Tìm kiếm theo tên model, mã modelId hoặc nhà cung cấp..."
          className="w-full sm:max-w-md px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE] focus:bg-white transition"
        />

        <div className="flex items-center gap-2 overflow-x-auto">
          {(['ALL', 'Google Gemini', 'GroqCloud', 'OpenAI', 'Anthropic Claude', 'DeepSeek', 'Custom API'] as const).map(
            (prov) => (
              <button
                key={prov}
                type="button"
                onClick={() => setProviderFilter(prov)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  providerFilter === prov
                    ? 'bg-[#0878EE] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {prov === 'ALL' ? 'Tất cả' : prov}
              </button>
            )
          )}
        </div>
      </div>

      {/* AI Models List / Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredModels.map((item) => {
          const isCurrentActive = item.id === activeModelId;
          const isKeyShown = !!revealedKeys[item.id];

          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border p-6 transition-all flex flex-col justify-between gap-4 ${
                isCurrentActive
                  ? 'border-[#0878EE] ring-2 ring-[#0878EE]/15 shadow-md'
                  : 'border-slate-200 shadow-xs hover:border-slate-300'
              }`}
            >
              <div className="space-y-3">
                {/* Top row badges */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                        item.provider === 'GroqCloud'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : item.provider === 'Google Gemini'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : item.provider === 'OpenAI'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}
                    >
                      {item.provider}
                    </span>

                    {item.isSystem ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                        🔒 Cố định (Hardcoded)
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        🛠️ Tùy chỉnh (Mock API)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isCurrentActive ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0878EE] text-white text-xs font-bold shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                        Đang sử dụng chính
                      </span>
                    ) : item.isActive ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                        ● Sẵn sàng
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold">
                        ○ Tạm ngưng
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Model ID */}
                <div>
                  <h3 className="text-lg font-bold text-[#071A44] flex items-center gap-2">
                    {item.displayName}
                  </h3>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">
                    Model ID: <span className="font-semibold text-slate-700">{item.modelId}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>

                {/* Technical details box */}
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 font-medium shrink-0">Endpoint:</span>
                    <span className="font-mono text-slate-700 truncate max-w-[280px] sm:max-w-[360px]" title={item.endpoint}>
                      {item.endpoint}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 font-medium shrink-0">API Key:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-700">
                        {isKeyShown ? item.apiKey : maskApiKey(item.apiKey)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleKeyVisibility(item.id)}
                        className="text-[11px] font-bold text-[#0878EE] hover:underline cursor-pointer"
                      >
                        {isKeyShown ? 'Ẩn' : 'Hiện'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-[11px] text-slate-500">
                    <span>Temperature: <strong>{item.temperature}</strong></span>
                    <span>Max Tokens: <strong>{item.maxTokens}</strong></span>
                    <span>Cập nhật: <strong>{item.updatedAt}</strong></span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  {!isCurrentActive ? (
                    <button
                      type="button"
                      onClick={() => handleSetActiveModel(item)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
                    >
                      ⚡ Chọn làm Model đang dùng
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-[#0878EE] flex items-center gap-1">
                      ✓ Đang điều phối hội thoại Roleplay
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(item)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                  >
                    ✏️ {item.isSystem ? 'Cấu hình tham số' : 'Sửa'}
                  </button>

                  {!item.isSystem && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleModelActive(item)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          item.isActive
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {item.isActive ? '⏸️ Tạm ngưng' : '▶️ Bật'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteModel(item)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition cursor-pointer"
                      >
                        🗑️ Xóa
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* System Prompt Configuration Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-[#071A44] flex items-center gap-2">
              <span>📝</span> Cấu hình System Prompt Mặc định (Roleplay & Đánh giá Ngữ pháp)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chỉ dẫn hệ thống gốc được nạp kèm vào mọi phiên luyện hội thoại trước khi ghép bối cảnh (Scenario) và trình độ JLPT.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetPrompt}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              ↺ Khôi phục mặc định
            </button>
            <button
              type="button"
              onClick={handleSavePrompt}
              className="px-4 py-2 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              💾 Lưu Prompt
            </button>
          </div>
        </div>

        <textarea
          rows={5}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0878EE] focus:bg-white transition"
        />
      </div>

      {/* Modal Add / Edit AI Model */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#071A44]">
                  {editingItem
                    ? editingItem.isSystem
                      ? `🔒 Tinh chỉnh tham số Model Cứng: ${editingItem.displayName}`
                      : `✏️ Chỉnh sửa API Model: ${editingItem.displayName}`
                    : '➕ Thêm mới API Model AI (Mock)'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingItem?.isSystem
                    ? 'Model Gemini & GroqCloud được bảo vệ cố định. Bạn có thể tinh chỉnh mô tả, Temperature và Max Tokens.'
                    : 'Khai báo thông tin kết nối API cho Model AI mới để sẵn sàng tích hợp vào hệ thống.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs font-medium">
                  ⚠️ {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nhà cung cấp (Provider)</label>
                  <select
                    disabled={!!editingItem?.isSystem}
                    value={formState.provider}
                    onChange={(e) => handleProviderPresetChange(e.target.value as AiModelConfigItem['provider'])}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                  >
                    <option value="OpenAI">OpenAI</option>
                    <option value="GroqCloud">GroqCloud</option>
                    <option value="Google Gemini">Google Gemini</option>
                    <option value="Anthropic Claude">Anthropic Claude</option>
                    <option value="DeepSeek">DeepSeek</option>
                    <option value="Custom API">Custom API</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tên hiển thị Model *</label>
                  <input
                    type="text"
                    disabled={!!editingItem?.isSystem}
                    value={formState.displayName}
                    onChange={(e) => setFormState({ ...formState, displayName: e.target.value })}
                    placeholder="VD: Claude 3.7 Sonnet / GPT-4o"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã định danh (Model ID) *</label>
                  <input
                    type="text"
                    disabled={!!editingItem?.isSystem}
                    value={formState.modelId}
                    onChange={(e) => setFormState({ ...formState, modelId: e.target.value })}
                    placeholder="VD: gpt-4o-mini / claude-3-7-sonnet"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">API Key *</label>
                  <input
                    type="text"
                    disabled={!!editingItem?.isSystem}
                    value={formState.apiKey}
                    onChange={(e) => setFormState({ ...formState, apiKey: e.target.value })}
                    placeholder="Nhập API Key (sk-... / gsk_...)"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">API Endpoint URL</label>
                <input
                  type="text"
                  disabled={!!editingItem?.isSystem}
                  value={formState.endpoint}
                  onChange={(e) => setFormState({ ...formState, endpoint: e.target.value })}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Temperature ({formState.temperature})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={formState.temperature}
                    onChange={(e) =>
                      setFormState({ ...formState, temperature: parseFloat(e.target.value) || 0.7 })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Max Tokens</label>
                  <input
                    type="number"
                    step="128"
                    min="256"
                    max="16384"
                    value={formState.maxTokens}
                    onChange={(e) =>
                      setFormState({ ...formState, maxTokens: parseInt(e.target.value, 10) || 2048 })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả / Ghi chú vận hành</label>
                <textarea
                  rows={2}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Mô tả ưu điểm hoặc mục đích sử dụng của model này..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
                />
              </div>

              {!editingItem?.isSystem && (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.isActive}
                    onChange={(e) => setFormState({ ...formState, isActive: e.target.checked })}
                    className="rounded text-[#0878EE] focus:ring-[#0878EE]"
                  />
                  Kích hoạt sẵn sàng sử dụng ngay sau khi lưu
                </label>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  {editingItem ? 'Lưu thay đổi' : 'Thêm Model AI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAiConfigView;

