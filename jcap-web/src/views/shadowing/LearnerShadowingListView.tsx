import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingDialogueItem } from '../../types/shadowing';
import { Button } from '../../components/ui/Button';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { useAuth } from '../../contexts/AuthContext';

export const LearnerShadowingListView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [keyword, setKeyword] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');

  // Role selection modal for quick start practice
  const [selectedDialogueForRole, setSelectedDialogueForRole] = useState<ShadowingDialogueItem | null>(null);

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

  const handleStartPractice = (selectedRole: 'A' | 'B') => {
    if (!selectedDialogueForRole) return;
    const dialogueId = selectedDialogueForRole.id;
    setSelectedDialogueForRole(null);
    navigate(`/shadowing/practice/${dialogueId}?role=${selectedRole}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎙️</span>
            <span className="text-xs font-bold text-[#0878EE] uppercase tracking-wider">
              Luyện phát âm & Phản xạ tiếng Nhật
            </span>
          </div>
          <h1 className="text-2xl font-black text-[#071A44] tracking-tight">
            Thư viện Luyện nói Shadowing
          </h1>
          <p className="text-sm text-[#71809A] mt-1">
            Các bài học hội thoại thực tế được biên soạn giúp bạn luyện ngữ điệu, ngắt câu và phản xạ cùng người bản xứ.
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/shadowing')}
            className="flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>⚙️</span> Quản lý Shadowing (Admin)
          </Button>
        )}
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
            placeholder="Tìm kiếm bài thoại, kịch bản ngữ cảnh..."
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
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                selectedLevel === lvl
                  ? 'bg-white text-[#0878EE] shadow-xs font-bold'
                  : 'text-[#71809A] hover:text-[#071A44]'
              }`}
            >
              {lvl === 'ALL' ? 'Tất cả trình độ' : `JLPT ${lvl}`}
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
          <h3 className="text-lg font-semibold text-[#071A44]">Chưa có bài học Shadowing phù hợp</h3>
          <p className="text-sm text-[#71809A] max-w-md mx-auto">
            {keyword || selectedLevel !== 'ALL'
              ? 'Hãy thử tìm với từ khóa khác hoặc chuyển đổi cấp độ JLPT để khám phá thêm bài học.'
              : 'Hiện chưa có bài học nào trong hệ thống. Các bài học do Admin tạo sẽ tự động xuất hiện tại đây.'}
          </p>
          {(keyword || selectedLevel !== 'ALL') ? (
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
          ) : isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/shadowing')}
            >
              Đến trang Quản lý Shadowing để tạo bài mới
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-[#E6EDF5] shadow-xs hover:shadow-md transition-all p-6 flex flex-col justify-between"
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
                  <span className="text-xs text-[#71809A] font-medium">
                    {item.totalSentences} câu đối đáp
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

                <div className="bg-[#F4F9FE] rounded-xl p-3 mb-6 text-xs text-[#071A44] border border-[#E6EDF5] space-y-1.5">
                  <p className="truncate"><span className="text-[#71809A]">Vai A:</span> <strong>{item.speakerRoleA_Name}</strong></p>
                  <p className="truncate"><span className="text-[#71809A]">Vai B:</span> <strong>{item.speakerRoleB_Name}</strong></p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#F0F4F8]">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/shadowing/dialogues/${item.id}`)}
                >
                  Xem chi tiết
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedDialogueForRole(item)}
                >
                  Luyện tập 
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role Selection Modal for quick practice launch */}
      {selectedDialogueForRole && (
        <RoleSelectionModal
          isOpen={true}
          onClose={() => setSelectedDialogueForRole(null)}
          dialogueId={selectedDialogueForRole.id}
          dialogueTitle={selectedDialogueForRole.title}
          roleAName={selectedDialogueForRole.speakerRoleA_Name}
          roleBName={selectedDialogueForRole.speakerRoleB_Name}
          onConfirm={handleStartPractice}
        />
      )}
    </div>
  );
};

