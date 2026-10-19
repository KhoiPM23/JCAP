import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import { shadowingStorageService } from '../../services/shadowingStorageService';
import type { ShadowingDialogueItem, ShadowingSentenceItem } from '../../types/shadowing';
import { voicevoxService } from '../../services/voicevoxService';
import { fromServerSession, isLegacyHistorySession, measuredScore, mergeHistory } from '../../utils/shadowingHistory';
import { sessionRankTitle } from '../../utils/shadowingSessionScores';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import type { ShadowingPracticeSession } from '../../types/shadowingProgress';
import { Button } from '../../components/ui/Button';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { useAuth } from '../../contexts/AuthContext';

type ShadowingTab = 'all' | 'in-progress' | 'completed' | 'not-started' | 'bookmarks' | 'history';

const HISTORY_PAGE_SIZE = 5;
const getVoicevoxSpeakerId = (): number =>
  Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3;

// Ngưỡng chỉ dùng để TÔ MÀU điểm đã lưu; khớp ShadowingScoring (backend): 80 / 65. Tier thật được lưu cùng kết quả.
const scoreTier = (score: number): 'green' | 'yellow' | 'red' =>
  score >= 80 ? 'green' : score >= 65 ? 'yellow' : 'red';

const scorePillClass = (score: number): string => {
  const tier = scoreTier(score);
  if (tier === 'green') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (tier === 'yellow') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
};

export const LearnerShadowingListView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const learnerId = user?.id || user?.email || 'guest_learner';

  // Sub-tabs from URL query param (?tab=...)
  const activeTab = (searchParams.get('tab') as ShadowingTab) || 'all';

  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [historyList, setHistoryList] = useState<ShadowingPracticeSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [keyword, setKeyword] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');

  // History filtering
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyTextbookFilter, setHistoryTextbookFilter] = useState<string>('ALL');

  // Local storage state triggers
  const [storageVersion, setStorageVersion] = useState<number>(0);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState<number>(1);
  // Cache câu thoại (bản dịch tiếng Việt, audio mẫu) theo dialogueId, tải khi mở chi tiết
  const [dialogueSentences, setDialogueSentences] = useState<Record<number, ShadowingSentenceItem[]>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  // Role selection modal for starting or restarting practice
  const [selectedDialogueForRole, setSelectedDialogueForRole] = useState<{
    dialogue: ShadowingDialogueItem;
    isRestart: boolean;
  } | null>(null);

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

    // Lịch sử: buổi luyện lưu ở backend + bản ghi cũ còn trong trình duyệt (trước khi lịch sử được lưu ở backend)
    const localHistory = shadowingStorageService.getHistoryList(learnerId);
    const serverRes = await shadowingService.getHistory();
    const serverHistory = serverRes.success && serverRes.data
      ? serverRes.data.map((record) => fromServerSession(record, learnerId))
      : [];
    setHistoryList(mergeHistory(serverHistory, localHistory));

    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 200);
    return () => clearTimeout(timer);
  }, [keyword, selectedLevel, learnerId, storageVersion]);

  // Tab switching
  const handleTabChange = (tab: ShadowingTab) => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === 'all') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', tab);
    }
    setSearchParams(newParams);
  };

  // Bookmark toggle
  const handleToggleBookmark = (dialogueId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    shadowingStorageService.toggleBookmark(learnerId, dialogueId);
    setStorageVersion((v) => v + 1);
  };

  // Start fresh or restart with role selection
  const handleOpenRoleModal = (dialogue: ShadowingDialogueItem, isRestart: boolean) => {
    setSelectedDialogueForRole({ dialogue, isRestart });
  };

  const handleConfirmRole = (selectedRole: 'A' | 'B') => {
    if (!selectedDialogueForRole) return;
    const { dialogue, isRestart } = selectedDialogueForRole;
    setSelectedDialogueForRole(null);
    const query = `?role=${selectedRole}${isRestart ? '&restart=true' : ''}`;
    navigate(`/shadowing/practice/${dialogue.id}${query}`);
  };

  // Resume directly without role modal
  const handleResumePractice = (dialogue: ShadowingDialogueItem, role: 'A' | 'B') => {
    navigate(`/shadowing/practice/${dialogue.id}?role=${role}&resume=true`);
  };

  // Counts for tabs
  const allProgress = shadowingStorageService.getAllProgress(learnerId);
  const inProgressCount = allProgress.filter((p) => p.status === 'IN_PROGRESS').length;
  const completedCount = allProgress.filter((p) => p.status === 'COMPLETED').length;
  const bookmarkedCount = shadowingStorageService.getBookmarks(learnerId).length;
  const historyCount = historyList.length;

  const notStartedCount = items.filter((item) => {
    const p = shadowingStorageService.getProgress(learnerId, item.id);
    return !p || p.status === 'NOT_STARTED';
  }).length;

  // Filter items based on active tab
  const getFilteredItems = () => {
    if (activeTab === 'in-progress') {
      return items.filter((item) => {
        const p = shadowingStorageService.getProgress(learnerId, item.id);
        return p?.status === 'IN_PROGRESS';
      });
    }
    if (activeTab === 'completed') {
      return items.filter((item) => {
        const p = shadowingStorageService.getProgress(learnerId, item.id);
        return p?.status === 'COMPLETED';
      });
    }
    if (activeTab === 'not-started') {
      return items.filter((item) => {
        const p = shadowingStorageService.getProgress(learnerId, item.id);
        return !p || p.status === 'NOT_STARTED';
      });
    }
    if (activeTab === 'bookmarks') {
      return items.filter((item) =>
        shadowingStorageService.isBookmarked(learnerId, item.id)
      );
    }
    return items;
  };

  const displayedItems = getFilteredItems();

  // History stats computation
  const avgHistoryScore =
    historyList.length > 0
      ? Math.round(
          (historyList.reduce((sum, h) => sum + (h.averageScore || 0), 0) /
            historyList.length) *
            10
        ) / 10
      : 0;

  // Chỉ cộng thời lượng thực đã lưu; bản ghi thiếu thời lượng không bị gán giá trị mặc định.
  const totalHistoryMinutes = Math.round(
    historyList.reduce((sum, h) => sum + (h.durationSeconds ?? 0), 0) / 60
  );

  const filteredHistory = historyList.filter((session) => {
    const matchesSearch =
      !historySearch.trim() ||
      session.dialogueTitle.toLowerCase().includes(historySearch.toLowerCase()) ||
      (session.scenarioTitle &&
        session.scenarioTitle.toLowerCase().includes(historySearch.toLowerCase()));
    const matchesTextbook =
      historyTextbookFilter === 'ALL' ||
      (session.textbookTitle && session.textbookTitle === historyTextbookFilter);
    return matchesSearch && matchesTextbook;
  });

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);
  const pagedHistory = filteredHistory.slice(
    (currentHistoryPage - 1) * HISTORY_PAGE_SIZE,
    currentHistoryPage * HISTORY_PAGE_SIZE
  );

  const handleToggleHistoryDetail = async (session: ShadowingPracticeSession) => {
    if (expandedHistoryId === session.id) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(session.id);
    if (dialogueSentences[session.dialogueId]) return;
    const res = await shadowingService.getDetail(session.dialogueId);
    if (res.success && res.data) {
      const sentences = res.data.sentences;
      setDialogueSentences((prev) => ({ ...prev, [session.dialogueId]: sentences }));
    }
  };

  const handleRestartFromHistory = (session: ShadowingPracticeSession) => {
    navigate(`/shadowing/practice/${session.dialogueId}?role=${session.role}&restart=true`);
  };

  const playAudio = (url: string) => {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => undefined);
  };

  const handlePlaySample = async (text?: string, url?: string | null) => {
    if (url) {
      playAudio(url);
      return;
    }
    if (!text) return;
    try {
      playAudio(await voicevoxService.getAudioUrl(text, getVoicevoxSpeakerId()));
    } catch {
      // Không phát được audio mẫu: bỏ qua, người học vẫn xem được điểm
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎙️</span>
            <span className="text-xs font-bold text-[#005ab6] uppercase tracking-wider">
              Luyện phát âm & Phản xạ tiếng Nhật
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Thư viện Luyện nói Shadowing
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Luyện nhại theo câu thoại người bản xứ, cải thiện ngữ điệu, ngắt câu và phản xạ giao tiếp tự nhiên chuẩn Tokyo.
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/shadowing')}
            className="flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <span>⚙️</span> Quản lý Shadowing (Admin)
          </Button>
        )}
      </div>

      {/* 2. Sub-navigation Tabs (Matching Mockup Tabs) */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/70 shadow-xs">
        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-white text-[#005ab6] shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>Tất cả bài học</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[11px] ${
              activeTab === 'all' ? 'bg-blue-100 text-[#005ab6]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {items.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('in-progress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'in-progress'
              ? 'bg-white text-[#005ab6] shadow-xs'
              : 'text-slate-600 hover:text-[#005ab6] hover:bg-white/60'
          }`}
        >
          <span>Đang học</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
              activeTab === 'in-progress'
                ? 'bg-blue-100 text-[#005ab6]'
                : inProgressCount > 0
                ? 'bg-blue-50 text-[#005ab6]'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {inProgressCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('completed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'completed'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'
          }`}
        >
          <span>Đã hoàn thành</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
              activeTab === 'completed'
                ? 'bg-emerald-100 text-emerald-800'
                : completedCount > 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {completedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('not-started')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'not-started'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>Chưa bắt đầu</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[11px] ${
              activeTab === 'not-started' ? 'bg-slate-200 text-slate-800' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {notStartedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('bookmarks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'bookmarks'
              ? 'bg-white text-purple-700 shadow-xs'
              : 'text-slate-600 hover:text-purple-700 hover:bg-white/60'
          }`}
        >
          <span className="material-symbols-outlined text-[16px] text-purple-600" style={{ fontVariationSettings: "'FILL' 1" }}>
            bookmark
          </span>
          <span>Đã lưu</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
              activeTab === 'bookmarks'
                ? 'bg-purple-100 text-purple-800'
                : bookmarkedCount > 0
                ? 'bg-purple-50 text-purple-700'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {bookmarkedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'history'
              ? 'bg-white text-[#005ab6] shadow-xs'
              : 'text-slate-600 hover:text-[#005ab6] hover:bg-white/60'
          }`}
        >
          <span className="material-symbols-outlined text-[16px] text-[#005ab6]">
            history
          </span>
          <span>Lịch sử luyện tập</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
              activeTab === 'history'
                ? 'bg-blue-100 text-[#005ab6]'
                : historyCount > 0
                ? 'bg-blue-50 text-[#005ab6]'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {historyCount}
          </span>
        </button>
      </div>

      {/* 3. Filter Toolbar (Ẩn khi ở tab History) */}
      {activeTab !== 'history' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center gap-4 justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo tiêu đề, chủ đề bài học..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#005ab6]/20 text-slate-900 transition"
            />
          </div>

          {/* Level Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs font-semibold text-slate-500 mr-1">Trình độ:</span>
            {['ALL', 'N5', 'N4', 'N3'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  selectedLevel === lvl
                    ? 'bg-[#005ab6] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {lvl === 'ALL' ? 'Tất cả' : `JLPT ${lvl}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Main Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
          <div className="inline-block animate-spin text-2xl mb-2">⏳</div>
          <p className="text-xs font-medium">Đang tải dữ liệu bài học Shadowing...</p>
        </div>
      ) : errorMessage ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 space-y-2">
          <p className="text-sm font-bold">⚠️ Có lỗi xảy ra</p>
          <p className="text-xs">{errorMessage}</p>
          <Button variant="secondary" size="sm" onClick={loadData}>
            Thử lại
          </Button>
        </div>
      ) : activeTab === 'history' ? (
        /* ================= HISTORY TAB VIEW (TABLE & METRICS) ================= */
        <div className="flex flex-col gap-6 bg-[#F4F9FE] rounded-2xl px-8 pt-2.5 pb-8">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Metric 1: Điểm trung bình tích lũy */}
            <div className="p-5 rounded-xl bg-white border border-slate-200/80 shadow-xs flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Điểm trung bình tích lũy
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 leading-none">
                  {avgHistoryScore > 0 ? avgHistoryScore : '--'}
                </span>
                <span className="text-xs text-slate-500 font-medium">/100</span>
              </div>
            </div>

            {/* Metric 2: Tổng thời lượng luyện tập */}
            <div className="p-5 rounded-xl bg-white border border-slate-200/80 shadow-xs flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Tổng thời lượng luyện tập
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 leading-none">
                  {totalHistoryMinutes}
                </span>
                <span className="text-xs text-slate-500 font-medium">phút</span>
              </div>
            </div>
          </div>

          {/* History Search & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                search
              </span>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryPage(1);
                }}
                placeholder="Tìm theo tên hội thoại, bài học, từ khóa..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#005ab6]/20 text-slate-900 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Giáo trình:</span>
              <select
                value={historyTextbookFilter}
                onChange={(e) => {
                  setHistoryTextbookFilter(e.target.value);
                  setHistoryPage(1);
                }}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium px-3 py-2 rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="ALL">Tất cả giáo trình</option>
                <option value="みんなの日本語 II">みんなの日本語 II</option>
                <option value="みんなの日本語 I">みんなの日本語 I</option>
                <option value="Shadowing: Nihongo wo Hanasou">Shadowing: Nihongo wo Hanasou</option>
              </select>
            </div>
          </div>

          {/* History Data Table */}
          {filteredHistory.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center space-y-3">
              <span className="material-symbols-outlined text-4xl text-slate-300">
                history_toggle_off
              </span>
              <h3 className="text-base font-bold text-slate-800">
                {historyList.length === 0
                  ? 'Chưa có lịch sử luyện tập nào'
                  : 'Không tìm thấy kết quả phù hợp'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {historyList.length === 0
                  ? 'Hãy chọn một bài hội thoại từ Thư viện và hoàn thành lượt luyện để lưu kết quả chấm điểm.'
                  : 'Hãy thử tìm kiếm với từ khóa khác hoặc bỏ lọc giáo trình.'}
              </p>
              {historyList.length === 0 && (
                <button
                  type="button"
                  onClick={() => handleTabChange('all')}
                  className="px-4 py-2 rounded-xl bg-[#005ab6] text-white text-xs font-bold hover:bg-[#00458f] transition shadow-xs cursor-pointer"
                >
                  Khám phá bài học ngay
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200/80">
                      <th className="py-3 px-5 font-bold w-24" scope="col">Ngày hoàn thành</th>
                      <th className="py-3 px-4 font-bold" scope="col">Giáo trình</th>
                      <th className="py-3 px-4 font-bold" scope="col">Bài học</th>
                      <th className="py-3 px-4 font-bold" scope="col">Tên bài thoại & ngữ cảnh</th>
                      <th className="py-3 px-4 font-bold" scope="col">Vai luyện</th>
                      <th className="py-3 px-4 font-bold" scope="col">Điểm tổng kết</th>
                      <th className="py-3 px-4 font-bold" scope="col">Thời lượng</th>
                      <th className="py-3 px-5 text-right font-bold" scope="col">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs text-slate-800">
                    {pagedHistory.map((session) => {
                      const isExpanded = expandedHistoryId === session.id;
                      const dateObj = new Date(session.completedAt || session.startedAt);
                      const formattedDate = dateObj.toLocaleDateString('vi-VN');
                      const formattedTime = dateObj.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const durationSec = session.durationSeconds;
                      const hasDuration = typeof durationSec === 'number';
                      const minutes = hasDuration ? Math.floor(durationSec / 60) : 0;
                      const seconds = hasDuration ? durationSec % 60 : 0;
                      const isLegacy = isLegacyHistorySession(session);
                      const contentScore = measuredScore(session.contentMatchScore ?? session.accuracyScore);
                      const detailSentences = dialogueSentences[session.dialogueId];

                      return (
                        <React.Fragment key={session.id}>
                          <tr className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors">
                            <td
                              className={`py-3.5 px-5 whitespace-nowrap ${
                                isExpanded ? 'shadow-[inset_3px_0_0_#005ab6]' : ''
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-900">{formattedDate}</span>
                                <span className="text-[11px] text-slate-400">{formattedTime}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {session.textbookTitle || '—'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-[#005ab6] border border-blue-100">
                                {session.chapterTitle || '—'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col max-w-xs">
                                <span className="font-bold text-slate-900 truncate">
                                  {session.dialogueTitle}
                                </span>
                                {session.scenarioTitle && (
                                  <span className="text-[11px] text-slate-500 truncate">
                                    {session.scenarioTitle}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                Vai {session.role}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${scorePillClass(
                                  session.averageScore
                                )}`}
                              >
                                {session.averageScore} / 100
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                              {hasDuration ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : '—'}
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleHistoryDetail(session)}
                                  className="px-3 py-1.5 rounded-lg bg-[#005ab6] hover:bg-[#00458f] text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{isExpanded ? 'Đóng' : 'Chi tiết'}</span>
                                  <span className="material-symbols-outlined text-[14px]">
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRestartFromHistory(session)}
                                  className="px-3 py-1.5 rounded-lg bg-[#005ab6] hover:bg-[#00458f] text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                  title="Luyện lại bài này"
                                >
                                  <span className="material-symbols-outlined text-[14px]">replay</span>
                                  <span>Luyện lại</span>
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded: Đánh giá đa chiều + chi tiết điểm từng câu */}
                          {isExpanded && (
                            <tr className="bg-slate-50/60 border-b border-slate-200">
                              <td colSpan={8} className="p-5">
                                <div className="bg-white rounded-xl border border-slate-200/80 p-5 flex flex-col gap-4">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="font-bold text-slate-800">Kết quả buổi luyện</span>
                                      {isLegacy && (
                                        <span
                                          className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 normal-case tracking-normal"
                                          title="Bản ghi tạo trước khi có phiên bản chấm điểm hiện tại. Điểm lưu loát/ngữ điệu của bản ghi này có thể là ước lượng, không phải số đo thực."
                                        >
                                          Bản ghi cũ
                                        </span>
                                      )}
                                    </div>
                                    {/* Chỉ số liệu thật đã lưu: độ khớp nội dung (lưu loát, ngữ điệu chưa được chấm nên không hiển thị) */}
                                    <dl className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-500">
                                      <div className="flex items-center gap-1">
                                        <dt>Độ khớp nội dung</dt>
                                        <dd className="font-bold text-[#005ab6]">{contentScore != null ? `${contentScore}%` : '—'}</dd>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <dt>Câu đã chấm</dt>
                                        <dd className="font-bold text-slate-800">
                                          {session.sentenceScores.length}/{session.totalSentences || session.sentenceScores.length}
                                        </dd>
                                      </div>
                                      {!isLegacy && (
                                        <dd className="font-bold text-slate-800">{sessionRankTitle(session.averageScore)}</dd>
                                      )}
                                    </dl>
                                  </div>

                                  <span className="text-xs font-bold text-slate-500">Chi tiết từng câu</span>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {session.sentenceScores.map((score, sIdx) => {
                                      const result = session.sentenceResults?.[sIdx];
                                      const detail =
                                        detailSentences?.find((s) => s.id === result?.sentenceId) ??
                                        detailSentences?.[sIdx];
                                      const japaneseText = result?.targetText || detail?.japaneseText;
                                      const translation = detail?.vietnameseTranslation;
                                      const recognizedText: string | undefined = result?.recognizedText;
                                      const tier: 'green' | 'yellow' | 'red' | null = result?.evaluationTier ?? null;
                                      const sampleUrl = result?.targetAudioUrl || detail?.nativeAudioUrl;
                                      const userUrl = result?.audioBlobUrl;

                                      return (
                                        <div
                                          key={sIdx}
                                          className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col gap-2.5"
                                        >
                                          <div className="flex items-start gap-3">
                                            <span className="text-[11px] font-bold text-slate-400 pt-0.5">
                                              {sIdx + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                              {japaneseText ? (
                                                <JapaneseSentenceDiffView
                                                  diffTokens={result?.diffTokens}
                                                  targetText={japaneseText}
                                                  spokenText={recognizedText}
                                                  size="sm"
                                                />
                                              ) : (
                                                <p className="text-sm font-bold text-slate-900 leading-snug">Câu {sIdx + 1}</p>
                                              )}
                                              {translation && (
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                  {translation}
                                                </p>
                                              )}
                                            </div>
                                            <span
                                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${scorePillClass(
                                                score
                                              )}`}
                                            >
                                              {score} điểm
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                                            <div className="flex items-center gap-3 text-[11px] font-semibold">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handlePlaySample(japaneseText, sampleUrl)
                                                }
                                                disabled={!japaneseText && !sampleUrl}
                                                className="flex items-center gap-1 text-[#005ab6] hover:underline disabled:text-slate-300 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                                              >
                                                <span className="material-symbols-outlined text-[14px]">volume_up</span>
                                                Nghe mẫu
                                              </button>
                                              {userUrl && (
                                                <button
                                                  type="button"
                                                  onClick={() => playAudio(userUrl)}
                                                  className="flex items-center gap-1 text-slate-600 hover:underline cursor-pointer"
                                                >
                                                  <span className="material-symbols-outlined text-[14px]" aria-hidden="true">mic</span>
                                                  Nghe bạn
                                                </button>
                                              )}
                                            </div>
                                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                              {tier && (
                                                <span className="material-symbols-outlined text-[14px]">
                                                  {tier === 'green' ? 'check' : 'priority_high'}
                                                </span>
                                              )}
                                              {tier === 'green'
                                                ? 'Khớp tốt'
                                                : tier === 'yellow'
                                                ? 'Khớp một phần'
                                                : tier === 'red'
                                                ? 'Chưa khớp'
                                                : ''}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleRestartFromHistory(session)}
                                      className="px-4 py-2 rounded-full bg-[#005ab6] hover:bg-[#00458f] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">replay</span>
                                      Luyện tập lại toàn bài này
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer: tổng số phiên + phân trang */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-t border-slate-200/80 bg-slate-50/60 text-[11px] text-slate-500">
                <span>
                  Hiển thị {pagedHistory.length} trong tổng số {filteredHistory.length} phiên luyện tập đã ghi nhận.
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHistoryPage(currentHistoryPage - 1)}
                    disabled={currentHistoryPage <= 1}
                    className="px-3 py-1 rounded-md border border-slate-200 bg-white text-slate-600 font-semibold disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Trước
                  </button>
                  {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setHistoryPage(page)}
                      className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                        page === currentHistoryPage
                          ? 'bg-[#005ab6] text-white'
                          : 'border border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setHistoryPage(currentHistoryPage + 1)}
                    disabled={currentHistoryPage >= totalHistoryPages}
                    className="px-3 py-1 rounded-md border border-slate-200 bg-white text-slate-600 font-semibold disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Sau
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : displayedItems.length === 0 ? (
        /* ================= EMPTY STATE ================= */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-slate-300">
            {activeTab === 'in-progress'
              ? 'sync'
              : activeTab === 'completed'
              ? 'emoji_events'
              : activeTab === 'bookmarks'
              ? 'bookmark'
              : 'graphic_eq'}
          </span>
          <h3 className="text-base font-bold text-slate-800">
            {activeTab === 'in-progress'
              ? 'Không có bài học nào đang dở'
              : activeTab === 'completed'
              ? 'Chưa có bài học nào được hoàn thành'
              : activeTab === 'bookmarks'
              ? 'Chưa có bài học nào được đánh dấu'
              : 'Chưa có bài học Shadowing phù hợp'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {activeTab === 'in-progress'
              ? 'Hãy chọn một bài học từ thư viện và bắt đầu luyện tập.'
              : activeTab === 'completed'
              ? 'Luyện tập và hoàn tất toàn bộ câu thoại của một bài để ghi nhận tại đây.'
              : activeTab === 'bookmarks'
              ? 'Bấm vào biểu tượng bookmark trên góc thẻ bài học để lưu lại danh sách bài yêu thích.'
              : keyword || selectedLevel !== 'ALL'
              ? 'Hãy thử tìm với từ khóa khác hoặc chuyển đổi cấp độ JLPT để khám phá thêm.'
              : 'Hiện chưa có bài học nào trong hệ thống.'}
          </p>
          {activeTab !== 'all' && (
            <button
              type="button"
              onClick={() => handleTabChange('all')}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
            >
              Xem tất cả bài học
            </button>
          )}
        </div>
      ) : (
        /* ================= DIALOGUES CARD GRID (Matching Mockup 1 & 4) ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedItems.map((item, index) => {
            const progress = shadowingStorageService.getProgress(learnerId, item.id);
            const isBookmarked = shadowingStorageService.isBookmarked(learnerId, item.id);
            const isCompleted = progress?.status === 'COMPLETED';
            const isInProgress = progress?.status === 'IN_PROGRESS';
            const codePill = `HT ${String(index + 1).padStart(2, '0')}`;

            // Safe completion percent
            const completedCount = progress?.completedSentenceCount || 0;
            const totalCount = item.totalSentences || 1;
            const progressPercent = Math.min(
              100,
              Math.round((completedCount / totalCount) * 100)
            );

            // Estimated duration
            const estMinutes = Math.max(1, Math.round(item.totalSentences * 0.45));

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 transform hover:-translate-y-1"
              >
                <div>
                  {/* Top Header: HT 01 Code, Status Badge & Bookmark Icon */}
                  <div className="flex items-center justify-between gap-2 mb-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold tracking-wider text-slate-400 uppercase">
                        {codePill}
                      </span>

                      {/* Status pill */}
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Đã hoàn thành
                        </span>
                      ) : isInProgress ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-[#005ab6] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#005ab6] animate-pulse"></span>
                          Đang học
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          Chưa bắt đầu
                        </span>
                      )}
                    </div>

                    {/* Bookmark Toggle Icon */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleBookmark(item.id, e)}
                      className={`p-1 rounded-lg transition-colors cursor-pointer ${
                        isBookmarked
                          ? 'text-purple-600 hover:bg-purple-50'
                          : 'text-slate-300 hover:text-purple-600 hover:bg-slate-100'
                      }`}
                      title={isBookmarked ? 'Bỏ lưu bài học' : 'Lưu bài học'}
                    >
                      <span
                        className="material-symbols-outlined text-[20px]"
                        style={{
                          fontVariationSettings: isBookmarked ? "'FILL' 1" : "'FILL' 0",
                        }}
                      >
                        bookmark
                      </span>
                    </button>
                  </div>

                  {/* Japanese Title */}
                  <h2 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-[#005ab6] transition-colors line-clamp-1">
                    {item.title}
                  </h2>

                  {/* Subtitle / Scenario Context */}
                  <p className="text-xs text-slate-500 font-medium mt-1 mb-2 line-clamp-1">
                    {item.scenarioTitle || 'Giao tiếp tình huống'} · {item.totalSentences} câu
                  </p>

                  {/* Syllabus / Level Badges */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-[#005ab6] border border-blue-100">
                      JLPT {item.jlptLevel}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Bài {item.scenarioId || '01'}
                    </span>
                  </div>
                </div>

                {/* Footer Progress & Action Section */}
                <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 font-medium">
                        {isCompleted
                          ? `Đã hoàn thành: ${item.totalSentences}/${item.totalSentences} câu`
                          : isInProgress
                          ? `Tiến độ: ${completedCount}/${item.totalSentences} câu`
                          : `Chưa học: 0/${item.totalSentences} câu`}
                      </span>
                      <span className={`font-semibold ${isCompleted ? 'text-emerald-600' : 'text-[#005ab6]'}`}>
                        {isCompleted ? '100%' : `${progressPercent}%`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-[#005ab6]'
                        }`}
                        style={{ width: `${isCompleted ? 100 : progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Duration & Primary Action Button */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-slate-400 text-xs font-medium">
                      <span className="material-symbols-outlined text-[15px]">schedule</span>
                      <span>~{estMinutes}m 15s</span>
                    </div>

                    {isCompleted ? (
                      <button
                        type="button"
                        onClick={() => handleOpenRoleModal(item, true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                      >
                        <span>Luyện lại</span>
                        <span className="material-symbols-outlined text-[16px]">replay</span>
                      </button>
                    ) : isInProgress ? (
                      <button
                        type="button"
                        onClick={() => handleResumePractice(item, progress.role)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#005ab6] hover:bg-[#00458f] text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                      >
                        <span>Tiếp tục</span>
                        <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenRoleModal(item, false)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#005ab6] hover:bg-[#00458f] text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                      >
                        <span>Bắt đầu</span>
                        <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Role Selection Modal */}
      {selectedDialogueForRole && (
        <RoleSelectionModal
          isOpen={true}
          onClose={() => setSelectedDialogueForRole(null)}
          dialogueId={selectedDialogueForRole.dialogue.id}
          dialogueTitle={selectedDialogueForRole.dialogue.title}
          roleAName={selectedDialogueForRole.dialogue.speakerRoleA_Name}
          roleBName={selectedDialogueForRole.dialogue.speakerRoleB_Name}
          onConfirm={handleConfirmRole}
        />
      )}
    </div>
  );
};

