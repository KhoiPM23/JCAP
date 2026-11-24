import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import { shadowingStorageService } from '../../services/shadowingStorageService';
import type { ShadowingSentenceItem } from '../../types/shadowing';
import { voicevoxService } from '../../services/voicevoxService';
import { fromServerSession, isLegacyHistorySession, measuredScore, mergeHistory } from '../../utils/shadowingHistory';
import { sessionRankTitle } from '../../utils/shadowingSessionScores';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import type { ShadowingPracticeSession } from '../../types/shadowingProgress';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Lịch sử luyện Shadowing (điểm trung bình, tổng thời lượng, bảng các buổi luyện có chi tiết từng câu).
 * Hiển thị ở trang Kết quả, tab Shadowing; trước đây là tab "Lịch sử" trong thư viện Shadowing.
 */

const HISTORY_PAGE_SIZE = 5;
const getVoicevoxSpeakerId = (): number =>
  Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3;

// Ngưỡng chỉ dùng để TÔ MÀU điểm đã lưu; khớp ShadowingScoring (backend): 80 / 65. Tier thật được lưu cùng kết quả.
const scoreTier = (score: number): 'green' | 'yellow' | 'red' =>
  score >= 80 ? 'green' : score >= 65 ? 'yellow' : 'red';

const scorePillClass = (score: number): string => {
  const tier = scoreTier(score);
  if (tier === 'green') return 'bg-score-good-soft text-score-good border-line';
  if (tier === 'yellow') return 'bg-score-mid-soft text-score-mid border-line';
  return 'bg-score-low-soft text-score-low border-line';
};

export const ShadowingHistoryPanel: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const learnerId = user?.id || user?.email || 'guest_learner';

  const [historyList, setHistoryList] = useState<ShadowingPracticeSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyTextbookFilter, setHistoryTextbookFilter] = useState<string>('ALL');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState<number>(1);
  // Cache câu thoại (bản dịch tiếng Việt, audio mẫu) theo dialogueId, tải khi mở chi tiết
  const [dialogueSentences, setDialogueSentences] = useState<Record<number, ShadowingSentenceItem[]>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  // Buổi luyện lưu ở backend + bản ghi cũ còn trong trình duyệt (trước khi lịch sử được lưu ở backend)
  useEffect(() => {
    let alive = true;
    (async () => {
      setIsLoading(true);
      const localHistory = shadowingStorageService.getHistoryList(learnerId);
      const serverRes = await shadowingService.getHistory();
      const serverHistory = serverRes.success && serverRes.data
        ? serverRes.data.map((record) => fromServerSession(record, learnerId))
        : [];
      if (!alive) return;
      setHistoryList(mergeHistory(serverHistory, localHistory));
      setIsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [learnerId]);

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

  return isLoading ? (
      <p className="m-0 text-sm text-sumi-muted" role="status">
        Đang tải lịch sử…
      </p>
    ) : (
    <div className="flex flex-col gap-6">
      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Metric 1: Điểm trung bình tích lũy */}
        <div className="p-5 rounded-xl bg-paper-50 border border-line shadow-xs flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-sumi-muted uppercase tracking-wider">
            Điểm trung bình tích lũy
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-sumi leading-none">
              {avgHistoryScore > 0 ? avgHistoryScore : '--'}
            </span>
            <span className="text-xs text-sumi-muted font-medium">/100</span>
          </div>
        </div>

        {/* Metric 2: Tổng thời lượng luyện tập */}
        <div className="p-5 rounded-xl bg-paper-50 border border-line shadow-xs flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-sumi-muted uppercase tracking-wider">
            Tổng thời lượng luyện tập
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-sumi leading-none">
              {totalHistoryMinutes}
            </span>
            <span className="text-xs text-sumi-muted font-medium">phút</span>
          </div>
        </div>
      </div>

      {/* History Search & Filter Bar */}
      <div className="bg-paper-50 p-4 rounded-xl border border-line shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sumi-faint text-[20px]">
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
            className="w-full pl-10 pr-4 py-2 bg-paper-100 border border-line rounded-xl text-xs focus:bg-paper-50 focus:outline-none focus:ring-2 focus:ring-ai text-sumi transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-sumi-muted">Giáo trình:</span>
          <select
            value={historyTextbookFilter}
            onChange={(e) => {
              setHistoryTextbookFilter(e.target.value);
              setHistoryPage(1);
            }}
            className="bg-paper-100 border border-line text-sumi text-xs font-medium px-3 py-2 rounded-xl focus:outline-none cursor-pointer"
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
        <div className="bg-paper-50 rounded-xl border border-line p-12 text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-sumi-faint">
            history_toggle_off
          </span>
          <h3 className="text-base font-bold text-sumi">
            {historyList.length === 0
              ? 'Chưa có lịch sử luyện tập nào'
              : 'Không tìm thấy kết quả phù hợp'}
          </h3>
          <p className="text-xs text-sumi-muted max-w-sm mx-auto">
            {historyList.length === 0
              ? 'Hãy chọn một bài hội thoại từ Thư viện và hoàn thành lượt luyện để lưu kết quả chấm điểm.'
              : 'Hãy thử tìm kiếm với từ khóa khác hoặc bỏ lọc giáo trình.'}
          </p>
          {historyList.length === 0 && (
            <button
              type="button"
              onClick={() => navigate('/shadowing')}
              className="px-4 py-2 rounded-xl bg-ai text-on-ai text-xs font-bold hover:bg-ai-hover transition shadow-xs cursor-pointer"
            >
              Khám phá bài học ngay
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-paper-50 border border-line shadow-xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-paper-100 text-sumi-muted text-[11px] uppercase tracking-wider border-b border-line">
                  <th className="py-3 px-5 font-bold w-24" scope="col">Ngày hoàn thành</th>
                  <th className="py-3 px-3 font-bold" scope="col">Giáo trình</th>
                  <th className="py-3 px-3 font-bold" scope="col">Bài học</th>
                  <th className="py-3 px-3 font-bold" scope="col">Tên bài thoại & ngữ cảnh</th>
                  <th className="py-3 px-3 font-bold" scope="col">Vai luyện</th>
                  <th className="py-3 px-3 font-bold" scope="col">Điểm tổng kết</th>
                  <th className="py-3 px-3 font-bold" scope="col">Thời lượng</th>
                  <th className="py-3 px-5 text-right font-bold" scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody className="text-xs text-sumi">
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
                      <tr className="border-b border-line hover:bg-paper-100 transition-colors">
                        <td
                          className={`py-3.5 px-5 whitespace-nowrap ${
                            isExpanded ? 'shadow-[inset_3px_0_0_var(--ai)]' : ''
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-sumi">{formattedDate}</span>
                            <span className="text-[11px] text-sumi-faint">{formattedTime}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-paper-200 text-sumi border border-line">
                            {session.textbookTitle || '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-ai-soft text-ai border border-line">
                            {session.chapterTitle || '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex flex-col max-w-xs">
                            <span className="font-bold text-sumi truncate">
                              {session.dialogueTitle}
                            </span>
                            {session.scenarioTitle && (
                              <span className="text-[11px] text-sumi-muted truncate">
                                {session.scenarioTitle}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-paper-200 text-sumi border border-line">
                            Vai {session.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${scorePillClass(
                              session.averageScore
                            )}`}
                          >
                            {session.averageScore} / 100
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap text-sumi-muted">
                          {hasDuration ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : '—'}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleHistoryDetail(session)}
                              className="px-3 py-1.5 rounded-lg bg-ai hover:bg-ai-hover text-on-ai text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isExpanded ? 'Đóng' : 'Chi tiết'}</span>
                              <span className="material-symbols-outlined text-[14px]">
                                {isExpanded ? 'expand_less' : 'expand_more'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRestartFromHistory(session)}
                              className="px-3 py-1.5 rounded-lg bg-ai hover:bg-ai-hover text-on-ai text-xs font-bold transition flex items-center gap-1 cursor-pointer"
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
                        <tr className="bg-paper-100 border-b border-line">
                          <td colSpan={8} className="p-5">
                            <div className="bg-paper-50 rounded-xl border border-line p-5 flex flex-col gap-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="font-bold text-sumi">Kết quả buổi luyện</span>
                                  {isLegacy && (
                                    <span
                                      className="px-1.5 py-0.5 rounded bg-paper-200 text-sumi-muted border border-line normal-case tracking-normal"
                                      title="Bản ghi tạo trước khi có phiên bản chấm điểm hiện tại. Điểm lưu loát/ngữ điệu của bản ghi này có thể là ước lượng, không phải số đo thực."
                                    >
                                      Bản ghi cũ
                                    </span>
                                  )}
                                </div>
                                {/* Chỉ số liệu thật đã lưu: độ khớp nội dung (lưu loát, ngữ điệu chưa được chấm nên không hiển thị) */}
                                <dl className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-sumi-muted">
                                  <div className="flex items-center gap-1">
                                    <dt>Độ khớp nội dung</dt>
                                    <dd className="font-bold text-ai">{contentScore != null ? `${contentScore}%` : '—'}</dd>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <dt>Câu đã chấm</dt>
                                    <dd className="font-bold text-sumi">
                                      {session.sentenceScores.length}/{session.totalSentences || session.sentenceScores.length}
                                    </dd>
                                  </div>
                                  {!isLegacy && (
                                    <dd className="font-bold text-sumi">{sessionRankTitle(session.averageScore)}</dd>
                                  )}
                                </dl>
                              </div>

                              <span className="text-xs font-bold text-sumi-muted">Chi tiết từng câu</span>

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
                                      className="p-3.5 rounded-xl border border-line bg-paper-50 flex flex-col gap-2.5"
                                    >
                                      <div className="flex items-start gap-3">
                                        <span className="text-[11px] font-bold text-sumi-faint pt-0.5">
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
                                            <p className="text-sm font-bold text-sumi leading-snug">Câu {sIdx + 1}</p>
                                          )}
                                          {translation && (
                                            <p className="text-[11px] text-sumi-muted mt-0.5">
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
                                      <div className="flex items-center justify-between border-t border-line pt-2">
                                        <div className="flex items-center gap-3 text-[11px] font-semibold">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handlePlaySample(japaneseText, sampleUrl)
                                            }
                                            disabled={!japaneseText && !sampleUrl}
                                            className="flex items-center gap-1 text-ai hover:underline disabled:text-sumi-faint disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">volume_up</span>
                                            Nghe mẫu
                                          </button>
                                          {userUrl && (
                                            <button
                                              type="button"
                                              onClick={() => playAudio(userUrl)}
                                              className="flex items-center gap-1 text-sumi-muted hover:underline cursor-pointer"
                                            >
                                              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">mic</span>
                                              Nghe bạn
                                            </button>
                                          )}
                                        </div>
                                        <span className="flex items-center gap-1 text-[11px] text-sumi-faint">
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
                                  className="px-4 py-2 rounded-full bg-ai hover:bg-ai-hover text-on-ai text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-t border-line bg-paper-100 text-[11px] text-sumi-muted">
            <span>
              Hiển thị {pagedHistory.length} trong tổng số {filteredHistory.length} phiên luyện tập đã ghi nhận.
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHistoryPage(currentHistoryPage - 1)}
                disabled={currentHistoryPage <= 1}
                className="px-3 py-1 rounded-md border border-line bg-paper-50 text-sumi-muted font-semibold disabled:text-sumi-faint disabled:cursor-not-allowed cursor-pointer"
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
                      ? 'bg-ai text-on-ai'
                      : 'border border-line bg-paper-50 text-sumi-muted'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setHistoryPage(currentHistoryPage + 1)}
                disabled={currentHistoryPage >= totalHistoryPages}
                className="px-3 py-1 rounded-md border border-line bg-paper-50 text-sumi-muted font-semibold disabled:text-sumi-faint disabled:cursor-not-allowed cursor-pointer"
              >
                Sau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
};
