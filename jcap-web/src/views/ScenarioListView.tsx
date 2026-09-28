import React, { useEffect, useState } from 'react';
import { scenarioService } from '../services/scenarioService';
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
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
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
      } else {
        setError(response.message || 'Không thể tải danh sách tình huống.');
      }
      setLoading(false);
    };

    fetchScenarios();
    return () => {
      isMounted = false;
    };
  }, []);

  // Lọc kịch bản theo level hỗ trợ
  const filteredScenarios = scenarios.filter((scenario) => {
    if (filterLevel === 'ALL') return true;
    return scenario.supportedJLPTLevels?.includes(filterLevel);
  });

  return (
    <div className="w-full">
      {/* Tiêu đề trang & Bộ lọc theo Level */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#071A44]">Thư viện Tình huống Luyện nói</h1>
          <p className="text-slate-500 text-sm mt-1">
            Chọn một kịch bản từ cơ sở dữ liệu để bắt đầu hội thoại tương tác với AI Persona.
          </p>
        </div>

        {/* Bộ lọc theo Level */}
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          {['ALL', 'N5', 'N4', 'N3'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterLevel === lvl
                  ? 'bg-red-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lvl === 'ALL' ? 'Tất cả' : lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Trạng thái Loading */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600"></div>
          <span className="ml-3 text-sm text-slate-600 font-medium">Đang tải danh sách kịch bản từ cơ sở dữ liệu...</span>
        </div>
      )}

      {/* Trạng thái Lỗi */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-6">
          ⚠️ {error}
        </div>
      )}

      {/* Trạng thái Rỗng */}
      {!loading && !error && filteredScenarios.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 text-sm">Chưa có kịch bản đàm thoại nào ở trình độ đã chọn.</p>
        </div>
      )}

      {/* Danh sách các Thẻ Tình huống (Cards) */}
      {!loading && !error && filteredScenarios.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScenarios.map((item) => {
            const displayLevel = item.supportedJLPTLevels?.length > 0
              ? item.supportedJLPTLevels.join(' / ')
              : 'N5';

            const mappedScenario: Scenario = {
              id: item.id,
              title: item.title,
              description: item.description,
              thumbnail: item.thumbnail,
              scenarioCode: item.scenarioCode,
              level: item.supportedJLPTLevels?.[0] || 'N5',
              supportedJLPTLevels: item.supportedJLPTLevels || ['N5'],
            };

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {item.supportedJLPTLevels?.map((lvl) => (
                        <span
                          key={lvl}
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            lvl === 'N5'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : lvl === 'N4'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}
                        >
                          JLPT {lvl}
                        </span>
                      ))}
                    </div>
                    {item.scenarioCode && (
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.scenarioCode}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-[#071A44] text-lg leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-3 my-3 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="bg-slate-50 rounded-xl p-2.5 text-xs text-slate-600 mb-6 border border-slate-100 flex items-center justify-between">
                    <span>Cấp độ mở: <strong>{displayLevel}</strong></span>
                    <span className="text-emerald-600 font-semibold">● Đang mở</span>
                  </div>
                </div>

                <button
                  onClick={() => onSelectScenario(mappedScenario)}
                  className="w-full py-2.5 bg-slate-900 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition shadow active:scale-98"
                >
                  Bắt đầu Luyện nói ➔
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
