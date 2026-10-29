import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { scenarioService } from '../services/scenarioService';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';
import type { ScenarioListItem } from '../types/scenarioDetails';

export interface Scenario {
  id: number;
  title: string;
  japaneseTitle?: string;
  level: string;
  category?: string;
  aiRole?: string;
  description: string;
  tasksCount?: number;
  thumbnail?: string;
  scenarioCode?: string;
  supportedJLPTLevels: string[];
}

interface ScenarioListViewProps {
  userEmail?: string;
  userLevel?: string;
  onSelectScenario: (scenario: Scenario) => void;
  onLogout?: () => void;
}

export const ScenarioListView: React.FC<ScenarioListViewProps> = ({
  onSelectScenario,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('query') || searchParams.get('search') || '';

  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchScenarios = async () => {
      setLoading(true);
      setError(null);

      const response = await scenarioService.getScenarios();
      if (!isMounted) return;

      if (response.success && response.data) {
        setScenarios(response.data);
        if (response.data.length > 0) {
          setSelectedScenarioId(response.data[0].id);
        }
      } else {
        setError(response.message || 'Không thể tải danh sách tình huống.');
      }
      setLoading(false);
    };

    void fetchScenarios();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    const newParams = new URLSearchParams(searchParams);
    if (val.trim()) {
      newParams.set('query', val.trim());
    } else {
      newParams.delete('query');
      newParams.delete('search');
    }
    setSearchParams(newParams, { replace: true });
  };

  const filteredScenarios = scenarios
    .filter((scenario) => {
      if (filterLevel !== 'ALL' && !scenario.supportedJLPTLevels?.includes(filterLevel)) {
        return false;
      }
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        (scenario.title && scenario.title.toLowerCase().includes(term)) ||
        (scenario.description && scenario.description.toLowerCase().includes(term)) ||
        (scenario.scenarioCode && scenario.scenarioCode.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => a.id - b.id);

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) || filteredScenarios[0] || null;

  const handleStart = (item: ScenarioListItem) => {
    ukiyoSound.playTaikoThud();
    const mapped: Scenario = {
      id: item.id,
      title: item.title,
      description: item.description,
      thumbnail: item.thumbnail,
      scenarioCode: item.scenarioCode,
      level: item.supportedJLPTLevels?.[0] || 'N5',
      supportedJLPTLevels: item.supportedJLPTLevels || ['N5'],
    };
    onSelectScenario(mapped);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-6 select-none font-sans">
      {/* Banner thông báo chế độ xem trước dành riêng cho Admin */}
      {user?.role === 'Admin' && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-900 px-4 py-2.5 rounded-2xl text-xs font-medium mb-6">
          <div className="flex items-center gap-2">
            <span className="bg-[var(--ai)] text-white font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">
              Chế độ xem trước
            </span>
            <span>Bạn đang xem thư viện kịch bản với giao diện của Học viên.</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/scenarios')}
            className="text-[var(--ai)] hover:text-blue-900 font-bold underline transition cursor-pointer"
          >
            &larr; Quay lại Quản lý Kịch bản
          </button>
        </div>
      )}

      {/* Tiêu đề trang & Giới thiệu */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--sumi)] tracking-tight">
            Thư viện Kịch bản Hội thoại AI
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
            Nhập vai giao tiếp thực tế với các NPC thông minh. Hệ thống tự động phân tích phản xạ, chuẩn hoá phát âm và
            chấm điểm theo chuẩn JLPT.
          </p>
        </div>
      </div>

      {/* Toolbar Tìm kiếm & Bộ lọc Cấp độ JLPT */}
      <div className="bg-white p-4 rounded-2xl border border-[var(--line)] shadow-xs flex flex-col md:flex-row md:items-center gap-4 justify-between mb-8">
        {/* Ô Tìm kiếm */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <span className="material-symbols-outlined text-lg">search</span>
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Tìm theo mã, tên kịch bản hoặc từ khóa..."
            className="w-full pl-10 pr-9 py-2 bg-[var(--paper-100)] border border-[var(--line)] rounded-xl text-xs md:text-sm text-[var(--sumi)] placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--ai)]/20 focus:border-[var(--ai)] transition"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Nút lọc trình độ JLPT */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-bold text-[var(--sumi-muted)] mr-1 whitespace-nowrap">Trình độ:</span>
          {['ALL', 'N5', 'N4', 'N3'].map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => {
                ukiyoSound.playSubtleTap();
                setFilterLevel(lvl);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                filterLevel === lvl
                  ? 'bg-[var(--ai)] text-white shadow-xs'
                  : 'bg-[var(--paper-200)] text-[var(--sumi-muted)] hover:bg-slate-200'
              }`}
            >
              {lvl === 'ALL' ? 'Tất cả' : `JLPT ${lvl}`}
            </button>
          ))}
        </div>
      </div>

      {/* Trạng thái Loading */}
      {loading && (
        <div className="flex justify-center items-center py-24">
          <div className="w-9 h-9 border-3 border-[var(--ai)]/20 border-t-[var(--ai)] rounded-full animate-spin" />
          <span className="ml-3 text-xs md:text-sm text-[var(--sumi-muted)] font-medium">
            Đang tải danh sách kịch bản...
          </span>
        </div>
      )}

      {/* Trạng thái Lỗi */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs md:text-sm mb-6">
          ⚠️ {error}
        </div>
      )}

      {/* Bố cục 2 Cột: Danh sách Kịch bản (Trái) & Bảng Xem Trước Nhanh (Phải) */}
      {!loading && !error && filteredScenarios.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Cột Trái: Danh sách Thẻ Kịch bản (Chiếm 2 cột trên màn lớn) */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredScenarios.map((item) => {
              const isSelected = selectedScenario?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    setSelectedScenarioId(item.id);
                  }}
                  className={`bg-white rounded-2xl p-5 border transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-[var(--ai)] ring-2 ring-[var(--ai)]/20 shadow-md'
                      : 'border-[var(--line)] shadow-xs hover:border-[var(--line-strong)] hover:shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {item.supportedJLPTLevels?.map((lvl) => (
                          <span
                            key={lvl}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              lvl === 'N5'
                                ? 'bg-[var(--n5-soft)] text-[var(--n5)]'
                                : lvl === 'N4'
                                ? 'bg-[var(--n4-soft)] text-[var(--n4)]'
                                : 'bg-[var(--n3-soft)] text-[var(--n3)]'
                            }`}
                          >
                            JLPT {lvl}
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--sumi-muted)] bg-[var(--paper-200)] px-2 py-0.5 rounded">
                        {item.scenarioCode || `SCN_${item.id}`}
                      </span>
                    </div>

                    <h3 className="font-bold text-[var(--sumi)] text-base leading-snug line-clamp-1">{item.title}</h3>
                    <p className="text-xs text-[var(--sumi-muted)] line-clamp-2 my-2.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between mt-2">
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Sẵn sàng luyện tập</span>
                    </span>
                    <span className="text-xs font-bold text-[var(--ai)] flex items-center gap-0.5">
                      <span>Chọn</span>
                      <span>➔</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cột Phải: Bảng Xem Trước Nhanh (Sticky Inspector Card) */}
          {selectedScenario && (
            <div className="bg-white rounded-3xl p-6 border border-[var(--line)] shadow-lg sticky top-20 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--sumi-muted)] uppercase tracking-wider">
                  Xem trước kịch bản
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--ai-soft)] text-[var(--ai)]">
                  {selectedScenario.scenarioCode || `SCN_${selectedScenario.id}`}
                </span>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100">
                <LivingAvatar
                  size="md"
                  avatarState="idle"
                  personaName={selectedScenario.title}
                  scenarioTitle={selectedScenario.title}
                  hideLabel
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-[var(--sumi)] leading-snug line-clamp-1">{selectedScenario.title}</h2>
                  <p className="text-xs text-[var(--sumi-muted)] mt-1 line-clamp-2 leading-relaxed">{selectedScenario.description}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--paper-100)] border border-[var(--line)] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--sumi-muted)]">Cấp độ hỗ trợ:</span>
                  <span className="font-bold text-[var(--sumi)]">
                    {selectedScenario.supportedJLPTLevels?.join(', ') || 'N5'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--sumi-muted)]">Nhân vật đối thoại:</span>
                  <span className="font-bold text-[var(--ai)]">AI Persona</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--sumi-muted)]">Chế độ âm thanh:</span>
                  <span className="font-bold text-emerald-700">VOICEVOX Tokyo + Whisper</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleStart(selectedScenario)}
                className="w-full py-3.5 rounded-2xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white text-xs md:text-sm font-bold shadow-md transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Vào phòng Luyện nói</span>
                <span>➔</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
