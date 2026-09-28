import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingDialogueItem } from '../../types/shadowing';
import { Button } from '../../components/ui/Button';

export const LearnerShadowingListView: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [keyword, setKeyword] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const res = await shadowingService.getCatalog({
      keyword: keyword.trim() || undefined,
      jlptLevel: selectedLevel,
    });

    if (res.success && res.data) {
      setItems(res.data);
    } else {
      setErrorMessage(res.message || 'Không thể tải danh sách bài học Shadowing.');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword, selectedLevel]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#071A44]">Thư viện Luyện nói Shadowing</h1>
          <p className="text-sm text-[#71809A] mt-1">
            Luyện tập phản xạ giao tiếp câu theo nhịp điệu phát âm chuẩn của người bản xứ.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#E6EDF5] shadow-xs flex flex-col md:flex-row md:items-center gap-4 justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#71809A]">
            🔍
          </span>
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 border border-[#E6EDF5] rounded-lg text-sm text-[#071A44] placeholder-[#71809A] focus:outline-none focus:border-[#0878EE] focus:ring-1 focus:ring-[#0878EE]"
            placeholder="Tìm kiếm bài thoại, kịch bản..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {/* JLPT Level Tabs */}
        <div className="flex items-center gap-1.5 bg-[#F4F9FE] p-1 rounded-lg border border-[#E6EDF5]">
          {['ALL', 'N5', 'N4', 'N3'].map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setSelectedLevel(lvl)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectedLevel === lvl
                  ? 'bg-white text-[#0878EE] shadow-xs font-bold'
                  : 'text-[#71809A] hover:text-[#071A44]'
              }`}
            >
              {lvl === 'ALL' ? 'Tất cả' : lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E6EDF5] p-6 animate-pulse space-y-4">
              <div className="h-5 bg-gray-200 rounded w-1/4"></div>
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center space-y-3">
          <p className="text-red-600 font-medium">{errorMessage}</p>
          <Button variant="secondary" size="sm" onClick={loadData}>
            Thử lại
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E6EDF5] p-12 text-center space-y-3">
          <span className="text-4xl">🎙️</span>
          <h3 className="text-lg font-semibold text-[#071A44]">Không tìm thấy bài hội thoại phù hợp</h3>
          <p className="text-sm text-[#71809A] max-w-sm mx-auto">
            Hãy thử tìm với từ khóa khác hoặc chuyển đổi cấp độ JLPT để khám phá thêm bài học.
          </p>
          {(keyword || selectedLevel !== 'ALL') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setKeyword('');
                setSelectedLevel('ALL');
              }}
            >
              Đặt lại bộ lọc
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-[#E6EDF5] shadow-xs hover:shadow-md transition-all p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      item.jlptLevel === 'N5'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.jlptLevel === 'N4'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    JLPT {item.jlptLevel}
                  </span>
                  <span className="text-xs text-[#71809A]">
                    {item.totalSentences} câu thoại
                  </span>
                </div>

                <p className="text-xs text-[#0878EE] font-semibold mb-1 truncate" title={item.scenarioTitle}>
                  📍 {item.scenarioTitle}
                </p>

                <h3 className="text-lg font-bold text-[#071A44] mb-2 leading-snug line-clamp-2">
                  {item.title}
                </h3>

                {item.sourceDescription && (
                  <p className="text-xs text-[#71809A] mb-4 line-clamp-2">
                    {item.sourceDescription}
                  </p>
                )}

                <div className="bg-[#F4F9FE] rounded-lg p-2.5 mb-6 text-xs text-[#071A44] border border-[#E6EDF5] space-y-1">
                  <p><span className="text-[#71809A]">Vai A:</span> <strong>{item.speakerRoleA_Name}</strong></p>
                  <p><span className="text-[#71809A]">Vai B:</span> <strong>{item.speakerRoleB_Name}</strong></p>
                </div>
              </div>

              <Button
                variant="primary"
                className="w-full"
                onClick={() => navigate(`/shadowing/${item.id}`)}
              >
                Xem chi tiết & Nghe thử ➔
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
