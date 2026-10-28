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
import { Button as JButton, EmptyState, Icon, IconButton, JlptBadge, JpText, ProgressBar, ScoreRing } from '../../components/jcap';

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

  // Bài đang học dở gần nhất (khối "Đang học dở" đầu trang)
  const continueProgress = shadowingStorageService.getLatestInProgress(learnerId);
  const continueItem = continueProgress ? items.find((i) => i.id === continueProgress.dialogueId) : undefined;

  // Điểm cao nhất của từng bài (từ lịch sử đã lưu)
  const bestScore = new Map<number, number>();
  historyList.forEach((h) => {
    const sc = h.averageScore ?? 0;
    if (sc > (bestScore.get(h.dialogueId) ?? -1)) bestScore.set(h.dialogueId, sc);
  });

  // Nhóm bài theo kịch bản (tình huống)
  const groups: Array<{ name: string; lessons: ShadowingDialogueItem[] }> = [];
  displayedItems.forEach((item) => {
    const name = item.scenarioTitle || 'Giao tiếp tình huống';
    const g = groups.find((x) => x.name === name);
    if (g) g.lessons.push(item);
    else groups.push({ name, lessons: [item] });
  });

  const tabs: Array<{ id: ShadowingTab; label: string; count: number }> = [
    { id: 'all', label: 'Tất cả', count: items.length },
    { id: 'in-progress', label: 'Đang học', count: inProgressCount },
    { id: 'not-started', label: 'Chưa học', count: notStartedCount },
    { id: 'bookmarks', label: 'Đã lưu', count: bookmarkedCount },
  ];

  const startLesson = (item: ShadowingDialogueItem) => {
    const progress = shadowingStorageService.getProgress(learnerId, item.id);
    if (progress?.status === 'IN_PROGRESS') handleResumePractice(item, progress.role);
    else handleOpenRoleModal(item, progress?.status === 'COMPLETED');
  };

  return (
    <div data-theme="hoc-tap" className="mx-auto flex max-w-[1180px] flex-col gap-7 bg-transparent pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-[38px]">{activeTab === 'history' ? 'Lịch sử luyện Shadowing' : 'Shadowing'}</h1>
          <p className="m-0 text-[15px] leading-6 text-sumi-muted">
            Nghe câu của người bản xứ rồi nói theo. Hệ thống chấm từng âm và chỉ ra chỗ cần sửa.
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'history' && (
            <JButton variant="secondary" icon="arrow_back" onClick={() => handleTabChange('all')}>
              Về thư viện
            </JButton>
          )}
          {isAdmin && (
            <JButton variant="ghost" icon="settings" onClick={() => navigate('/admin/shadowing')}>
              Quản lý Shadowing (Admin)
            </JButton>
          )}
        </div>
      </div>

      {activeTab === 'history' ? (
        isLoading ? (
          <p className="m-0 text-sm text-sumi-muted" role="status">
            Đang tải lịch sử…
          </p>
        ) : (
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
        )
      ) : (
        <>
          {/* Đang học dở */}
          {continueProgress && (
            <section aria-label="Bài đang học" className="flex flex-wrap items-center gap-6 rounded-jc-xl bg-nami-soft px-7 py-6">
              <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nami">
                  <Icon name="pending" size={18} />
                  <span>Đang học dở</span>
                </div>
                <h2 className="m-0 text-[22px] font-bold leading-[30px]">{continueProgress.dialogueTitle || continueItem?.title}</h2>
                <p className="m-0 text-sm leading-[22px] text-sumi-muted">
                  {[continueProgress.subtitle || continueProgress.scenarioTitle, continueProgress.jlptLevel, `Vai ${continueProgress.role}`]
                    .filter(Boolean)
                    .join(' · ')}
                  {`. Bạn dừng ở câu ${continueProgress.currentSentenceIndex + 1}:`}
                </p>
                {continueProgress.currentSentenceText && (
                  <div className="rounded-jc-md bg-paper-50 px-3.5 py-2.5">
                    <JpText text={continueProgress.currentSentenceText} size="md" as="p" />
                  </div>
                )}
              </div>
              <div className="flex flex-[0_1_260px] flex-col gap-3.5">
                <ProgressBar
                  value={continueProgress.completedSentenceCount}
                  max={continueProgress.totalSentenceCount || 1}
                  label={`${continueProgress.completedSentenceCount}/${continueProgress.totalSentenceCount} câu`}
                  showValue
                  size="lg"
                />
                <JButton
                  variant="primary"
                  size="lg"
                  block
                  icon="play_arrow"
                  onClick={() => navigate(`/shadowing/practice/${continueProgress.dialogueId}?role=${continueProgress.role}&resume=true`)}
                >
                  {`Tiếp tục từ câu ${continueProgress.currentSentenceIndex + 1}`}
                </JButton>
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-start gap-7">
            <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
              {/* Thanh lọc một hàng: trạng thái · cấp độ · tìm kiếm */}
              <div className="jx-shf" role="toolbar" aria-label="Lọc bài học">
                <div className="jx-shf-tabs" role="tablist" aria-label="Trạng thái">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === t.id}
                      className={`jx-shf-tab ${activeTab === t.id ? 'on' : ''}`}
                      onClick={() => handleTabChange(t.id)}
                    >
                      {t.label}
                      <span className="jx-shf-n">{t.count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex-auto" />
                <div className="jx-shf-lv" role="group" aria-label="Trình độ">
                  {['ALL', 'N5', 'N4', 'N3'].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      aria-pressed={selectedLevel === lv}
                      className={`jx-shf-chip lv-${lv} ${selectedLevel === lv ? 'on' : ''}`}
                      onClick={() => setSelectedLevel(selectedLevel === lv && lv !== 'ALL' ? 'ALL' : lv)}
                    >
                      {lv === 'ALL' ? 'Mọi cấp' : lv}
                    </button>
                  ))}
                </div>
                <span className="jx-shf-sep" aria-hidden="true" />
                <div className={`jx-shf-search ${keyword ? 'has-q' : ''}`}>
                  <label htmlFor="shf-q" title="Tìm bài học">
                    <Icon name="search" size={20} />
                  </label>
                  <input id="shf-q" type="search" placeholder="Tìm bài học" aria-label="Tìm bài học" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                </div>
              </div>

              {isLoading ? (
                <p className="m-0 text-sm text-sumi-muted" role="status">
                  Đang tải bài học Shadowing…
                </p>
              ) : errorMessage ? (
                <EmptyState icon="error" title="Có lỗi xảy ra" compact action={<JButton variant="secondary" onClick={loadData}>Thử lại</JButton>}>
                  {errorMessage}
                </EmptyState>
              ) : groups.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title={
                    activeTab === 'in-progress'
                      ? 'Không có bài nào đang học dở'
                      : activeTab === 'bookmarks'
                        ? 'Chưa lưu bài nào'
                        : activeTab === 'completed'
                          ? 'Chưa có bài nào học xong'
                          : 'Không có bài nào khớp bộ lọc'
                  }
                  compact
                  action={
                    activeTab !== 'all' || keyword || selectedLevel !== 'ALL' ? (
                      <JButton
                        variant="secondary"
                        onClick={() => {
                          setKeyword('');
                          setSelectedLevel('ALL');
                          handleTabChange('all');
                        }}
                      >
                        Xem tất cả bài học
                      </JButton>
                    ) : undefined
                  }
                />
              ) : (
                groups.map((g) => {
                  const done = g.lessons.filter((l) => shadowingStorageService.getProgress(learnerId, l.id)?.status === 'COMPLETED').length;
                  return (
                    <section key={g.name} className="flex flex-col overflow-hidden rounded-jc-lg border border-line bg-paper-50">
                      <div className="flex items-center gap-3 bg-paper-200 px-[18px] py-3.5">
                        <Icon name="forum" size={22} style={{ color: 'var(--nami)' }} />
                        <h2 className="m-0 flex-grow text-base font-semibold leading-6">{g.name}</h2>
                        <span className="text-[13px] leading-5 text-sumi-muted">{`${done}/${g.lessons.length} bài xong`}</span>
                      </div>
                      {g.lessons.map((item) => {
                        const progress = shadowingStorageService.getProgress(learnerId, item.id);
                        const isCompleted = progress?.status === 'COMPLETED';
                        const isInProgress = progress?.status === 'IN_PROGRESS';
                        const saved = shadowingStorageService.isBookmarked(learnerId, item.id);
                        const best = bestScore.get(item.id);
                        const estMinutes = Math.max(1, Math.round(item.totalSentences * 0.45));
                        return (
                          <div key={item.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5">
                            <Icon
                              name={isCompleted ? 'check_circle' : isInProgress ? 'pending' : 'radio_button_unchecked'}
                              size={22}
                              fill={isCompleted}
                              style={{ color: isCompleted ? 'var(--success)' : isInProgress ? 'var(--ai)' : 'var(--sumi-faint)' }}
                              label={isCompleted ? 'Đã xong' : isInProgress ? 'Đang học' : 'Chưa học'}
                            />
                            <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[3px]">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[15px] font-semibold leading-[22px]">{item.title}</span>
                                <JlptBadge level={item.jlptLevel as 'N5' | 'N4' | 'N3'} size="sm" />
                              </span>
                              <span className="text-[13px] leading-5 text-sumi-muted">
                                {`${item.totalSentences} câu · khoảng ${estMinutes} phút`}
                                {isInProgress && progress ? ` · đang ở câu ${progress.currentSentenceIndex + 1}/${item.totalSentences}` : ''}
                              </span>
                            </div>
                            {best !== undefined && (
                              <span className="flex min-w-[72px] flex-col items-end">
                                <span className="text-lg font-bold leading-6 tabular-nums">{Math.round(best)}</span>
                                <span className="text-xs leading-4 text-sumi-muted">điểm cao nhất</span>
                              </span>
                            )}
                            <IconButton
                              icon="bookmark"
                              label={saved ? 'Bỏ lưu bài học' : 'Lưu bài học'}
                              active={saved}
                              size="sm"
                              onClick={(e) => handleToggleBookmark(item.id, e)}
                            />
                            <JButton
                              variant={isInProgress ? 'primary' : 'secondary'}
                              size="sm"
                              icon={isCompleted ? 'replay' : 'play_arrow'}
                              onClick={() => startLesson(item)}
                            >
                              {isCompleted ? 'Luyện lại' : isInProgress ? 'Tiếp tục' : 'Bắt đầu'}
                            </JButton>
                          </div>
                        );
                      })}
                    </section>
                  );
                })
              )}
            </div>

            {/* Cột phải: buổi luyện gần đây + mẹo */}
            <aside aria-label="Lịch sử và mẹo" className="flex max-w-[340px] flex-[1_1_280px] flex-col gap-4">
              <section className="flex flex-col gap-3.5 rounded-jc-lg border border-line bg-paper-50 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="m-0 text-base font-semibold leading-6">Buổi luyện gần đây</h2>
                  <span className="text-[13px] text-sumi-muted">{`${historyCount} buổi`}</span>
                </div>
                {historyList.length === 0 ? (
                  <p className="m-0 text-sm text-sumi-muted">Chưa có buổi luyện nào được lưu.</p>
                ) : (
                  historyList.slice(0, 3).map((h) => (
                    <div key={h.id} className="flex items-center gap-3">
                      <ScoreRing value={Math.round(h.averageScore ?? 0)} size={44} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold leading-5">{h.dialogueTitle}</span>
                        <span className="text-[13px] leading-5 text-sumi-muted">
                          {[h.completedAt ? new Date(h.completedAt).toLocaleDateString('vi-VN') : null, h.role ? `Vai ${h.role}` : null].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <JButton variant="secondary" block icon="history" onClick={() => handleTabChange('history')}>
                  Xem toàn bộ lịch sử
                </JButton>
              </section>
              <section className="flex gap-3 rounded-jc-lg bg-sora-soft px-[18px] py-4">
                <Icon name="headphones" size={22} />
                <p className="m-0 text-sm leading-[22px]">Đeo tai nghe có micro khi luyện: giọng mẫu không lọt vào bản thu nên điểm chấm chính xác hơn.</p>
              </section>
            </aside>
          </div>
        </>
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
