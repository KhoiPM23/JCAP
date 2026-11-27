import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { flashcardQuizService } from '../../services/flashcardQuizService';
import type {
  FlashcardQuizHistoryItem,
  FlashcardQuizHistoryDetail,
} from '../../types/flashcardQuiz';

const formatVnDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  return new Date(utcStr).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDuration = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const buildRetakeUrl = (item: FlashcardQuizHistoryItem): string => {
  const ct = item.contentType?.toLowerCase() === 'grammar' ? 'grammar' : 'vocabulary';
  if (item.sourceType === 'Bookmark' || !item.topicId) {
    return `/flashcards/test/bookmarks/${ct}?source=bookmark`;
  }
  return `/flashcards/test/${item.topicId}/${ct}`;
};

const getQuestionTypeLabel = (type: string): string => {
  switch (type) {
    case 'true_false':
      return '⚖️ Đúng / Sai';
    case 'multiple_choice':
      return '🎯 Trắc nghiệm';
    case 'matching':
      return '🔗 Ghép thẻ';
    case 'written':
      return '✍️ Tự luận';
    default:
      return '📝 Câu hỏi';
  }
};

export const FlashcardQuizHistoryView: React.FC = () => {
  const [historyItems, setHistoryItems] = useState<FlashcardQuizHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [timeFilter, setTimeFilter] = useState<'7days' | '30days' | 'all'>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<'All' | 'Vocabulary' | 'Grammar' | 'Mixed'>('All');

  // Detail modal
  const [selectedAttemptId, setSelectedAttemptId] = useState<number | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<FlashcardQuizHistoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedAttemptId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAttemptId]);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage(null);
      const res = await flashcardQuizService.getHistory(contentTypeFilter);
      if (res.success && Array.isArray(res.data)) {
        setHistoryItems(res.data);
      } else {
        setHistoryItems([]);
        setErrorMessage(res.message || 'Không thể tải lịch sử tự đánh giá.');
      }
      setLoading(false);
    };
    void loadHistory();
  }, [contentTypeFilter]);

  const filteredItems = useMemo(() => {
    if (timeFilter === 'all') return historyItems;
    const now = Date.now();
    const cutoffMs = timeFilter === '7days' ? 7 * 86400 * 1000 : 30 * 86400 * 1000;
    return historyItems.filter((item) => {
      const utcStr = item.completedAt.endsWith('Z') || item.completedAt.includes('+')
        ? item.completedAt
        : `${item.completedAt}Z`;
      return now - new Date(utcStr).getTime() <= cutoffMs;
    });
  }, [historyItems, timeFilter]);

  const stats = useMemo(() => {
    const totalAttempts = filteredItems.length;
    let totalQuestions = 0;
    let totalCorrect = 0;
    let highestScore = 0;

    filteredItems.forEach((item) => {
      totalQuestions += item.totalQuestions;
      totalCorrect += item.correctCount;
      if (item.scorePercent > highestScore) highestScore = item.scorePercent;
    });

    const avgScore = totalAttempts > 0
      ? Math.round(filteredItems.reduce((sum, x) => sum + x.scorePercent, 0) / totalAttempts)
      : 0;
    const accuracyRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    return { totalAttempts, totalQuestions, avgScore, accuracyRate, highestScore };
  }, [filteredItems]);

  const handleOpenDetail = async (attemptId: number) => {
    setSelectedAttemptId(attemptId);
    setLoadingDetail(true);
    const res = await flashcardQuizService.getHistoryDetail(attemptId);
    if (res.success && res.data) {
      setAttemptDetail(res.data);
    }
    setLoadingDetail(false);
  };

  const handleCloseDetail = () => {
    setSelectedAttemptId(null);
    setAttemptDetail(null);
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 bg-transparent pb-12 font-sans">
      {/* ==================== 1. HEADER ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link
            to="/flashcards"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ai hover:text-ai-hover transition-colors mb-2"
          >
            <span>←</span>
            <span>Quay lại Bộ thẻ Flashcard</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-sumi tracking-tight">
            Lịch sử Tự đánh giá (Quizlet Test)
          </h1>
          <p className="text-sm text-sumi-muted mt-1">
            Theo dõi điểm số, thời gian hoàn thành và chi tiết từng câu trả lời trong các bài kiểm tra tự đánh giá của bạn
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-danger-soft border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* ==================== 2. 4 STAT OVERVIEW CARDS ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-ai-soft text-ai flex items-center justify-center text-xl font-bold border border-ai/30">
            📝
          </div>
          <div>
            <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Số bài đã làm</div>
            <div className="text-2xl font-black text-sumi mt-0.5">
              {stats.totalAttempts} <span className="text-xs font-semibold text-sumi-muted">bài</span>
            </div>
          </div>
        </div>

        <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl font-bold border border-purple-500/20">
            🎯
          </div>
          <div>
            <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Điểm trung bình</div>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-0.5">
              {stats.avgScore}%
            </div>
          </div>
        </div>

        <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-success-soft text-success flex items-center justify-center text-xl font-bold border border-success/30">
            📈
          </div>
          <div>
            <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Tỷ lệ trả lời đúng</div>
            <div className="text-2xl font-black text-success mt-0.5">
              {stats.accuracyRate}%
            </div>
          </div>
        </div>

        <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-warning-soft text-warning flex items-center justify-center text-xl font-bold border border-warning/30">
            🏆
          </div>
          <div>
            <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Điểm cao nhất</div>
            <div className="text-2xl font-black text-warning mt-0.5">
              {stats.highestScore}% <span className="text-xs font-semibold text-sumi-muted">({stats.totalQuestions} câu)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 3. FILTER BAR ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-paper-50 p-3.5 rounded-2xl border border-line shadow-xs">
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-sumi-muted">
          <div className="flex items-center gap-1.5">
            <span>THỜI GIAN:</span>
            <div className="inline-flex rounded-lg border border-line p-0.5 bg-paper-100">
              {(['7days', '30days', 'all'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeFilter(tf)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    timeFilter === tf
                      ? 'bg-ai text-on-ai shadow-xs'
                      : 'text-sumi-muted hover:text-sumi'
                  }`}
                >
                  {tf === '7days' ? '7 ngày qua' : tf === '30days' ? '30 ngày qua' : 'Tất cả'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span>NỘI DUNG:</span>
            <div className="inline-flex rounded-lg border border-line p-0.5 bg-paper-100">
              {(['All', 'Vocabulary', 'Grammar', 'Mixed'] as const).map((ct) => (
                <button
                  key={ct}
                  onClick={() => setContentTypeFilter(ct)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    contentTypeFilter === ct
                      ? 'bg-ai text-on-ai shadow-xs'
                      : 'text-sumi-muted hover:text-sumi'
                  }`}
                >
                  {ct === 'All' ? 'Tất cả' : ct === 'Vocabulary' ? '📘 Từ vựng' : ct === 'Grammar' ? '🧩 Ngữ pháp' : '⚡ Hỗn hợp'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-xs text-sumi-muted text-right">
          Hiển thị {filteredItems.length} bài tự đánh giá
        </div>
      </div>

      {/* ==================== 4. ATTEMPT LIST ==================== */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-sumi-muted space-y-3">
          <div className="w-10 h-10 border-4 border-line border-t-ai rounded-full animate-spin" />
          <p className="text-sm font-medium">Đang tải lịch sử tự đánh giá...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-paper-50 rounded-2xl border border-line p-12 text-center space-y-3">
          <div className="text-4xl">📝</div>
          <h3 className="text-base font-bold text-sumi">Chưa có kết quả tự đánh giá nào</h3>
          <p className="text-xs text-sumi-muted max-w-md mx-auto">
            Hãy vào một bộ thẻ và chọn &quot;Kiểm tra nhanh (Quizlet Test)&quot; để tự đánh giá kiến thức — kết quả sẽ tự động được lưu tại đây!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isGrammar = item.contentType?.toLowerCase() === 'grammar';
            const isMixed = item.contentType?.toLowerCase() === 'mixed';
            const total = Math.max(1, item.totalQuestions);

            return (
              <div
                key={item.attemptId}
                className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left */}
                <div className="flex items-start gap-4">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ${
                      isGrammar
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                        : isMixed
                        ? 'bg-ai-soft text-ai border border-ai/30'
                        : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                    }`}
                  >
                    {isGrammar ? '🧩' : isMixed ? '🔀' : '📝'}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-black text-sumi">{item.setTitle}</h2>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-paper-200 text-sumi-muted border border-line">
                        {item.sourceType === 'Bookmark' ? '🔖 Thẻ đã lưu' : '📚 Theo chủ đề'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                          item.scorePercent >= 80
                            ? 'bg-success-soft text-success border-success/30'
                            : item.scorePercent >= 50
                            ? 'bg-warning-soft text-warning border-warning/30'
                            : 'bg-danger-soft text-danger border-danger/30'
                        }`}
                      >
                        Điểm: {item.scorePercent}%
                      </span>
                    </div>

                    <div className="text-xs text-sumi-muted">
                      <span>{formatVnDateTime(item.completedAt)}</span> • Thời lượng:{' '}
                      <span className="font-semibold text-sumi">{formatDuration(item.durationSeconds)}</span> • Quy mô:{' '}
                      <span className="font-bold text-ai">{item.totalQuestions} câu</span>
                    </div>
                  </div>
                </div>

                {/* Middle: Breakdown */}
                <div className="space-y-1.5 lg:w-72">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-success">✓ {item.correctCount} đúng</span>
                    <span className="text-danger">✕ {item.wrongCount} sai</span>
                    <span className="text-sumi-muted">⚪ {item.skippedCount} bỏ qua</span>
                  </div>
                  <div className="w-full bg-paper-200 h-2 rounded-full overflow-hidden flex">
                    <div
                      className="bg-success h-full"
                      style={{ width: `${(item.correctCount / total) * 100}%` }}
                    />
                    <div
                      className="bg-danger h-full"
                      style={{ width: `${(item.wrongCount / total) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 w-full lg:w-auto">
                  <Link
                    to={buildRetakeUrl(item)}
                    className="px-3.5 py-2 bg-ai hover:bg-ai-hover text-on-ai rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0"
                  >
                    <span>🔄</span>
                    <span>Làm lại</span>
                  </Link>
                  <button
                    onClick={() => void handleOpenDetail(item.attemptId)}
                    className="px-4 py-2 bg-paper-100 hover:bg-paper-200 border border-line text-sumi rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 flex-1 lg:flex-initial cursor-pointer"
                  >
                    <span>👁️</span>
                    <span>Xem chi tiết</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== 5. DETAIL MODAL ==================== */}
      {selectedAttemptId &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseDetail();
            }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-paper-50 rounded-3xl border border-line max-w-2xl w-full shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col my-auto text-sumi"
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-base font-black text-sumi flex items-center gap-2">
                  <span>📝</span>
                  <span>Chi tiết bài tự đánh giá #{selectedAttemptId}</span>
                </h3>
                <button
                  onClick={handleCloseDetail}
                  className="w-8 h-8 rounded-full bg-paper-100 hover:bg-paper-200 text-sumi-muted hover:text-sumi font-bold flex items-center justify-center transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {loadingDetail ? (
                <div className="py-12 flex flex-col items-center justify-center text-sumi-muted space-y-2">
                  <div className="w-8 h-8 border-3 border-line border-t-ai rounded-full animate-spin" />
                  <p className="text-xs font-medium">Đang tải chi tiết từng câu hỏi...</p>
                </div>
              ) : attemptDetail ? (
                <div className="overflow-y-auto space-y-3 flex-1 pr-1">
                  <div className="text-xs text-sumi-muted">
                    {attemptDetail.attempt.setTitle} • Điểm:{' '}
                    <strong className="text-sumi">{attemptDetail.attempt.scorePercent}%</strong> (
                    {attemptDetail.attempt.correctCount}/{attemptDetail.attempt.totalQuestions} câu đúng •{' '}
                    {formatDuration(attemptDetail.attempt.durationSeconds)})
                  </div>

                  <div className="space-y-2">
                    {attemptDetail.items.map((item) => (
                      <div
                        key={item.itemLogId}
                        className="p-3.5 bg-paper-100/60 rounded-xl border border-line space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sumi">
                              Câu {item.questionIndex}: {item.frontText}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-paper-200 text-sumi-muted border border-line">
                              {getQuestionTypeLabel(item.questionType)}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase shrink-0 ${
                              item.isCorrect
                                ? 'bg-success-soft text-success border border-success/30'
                                : item.isSkipped
                                ? 'bg-paper-200 text-sumi-muted border border-line'
                                : 'bg-danger-soft text-danger border border-danger/30'
                            }`}
                          >
                            {item.isCorrect ? '✓ Đúng' : item.isSkipped ? '⚪ Bỏ qua' : '✕ Sai'}
                          </span>
                        </div>

                        <div className="text-sumi-muted text-[11px]">{item.meaning}</div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div className="bg-paper-50 border border-line rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] font-bold text-sumi-faint uppercase block">
                              Bạn trả lời
                            </span>
                            <span className="font-bold text-sumi">
                              {item.isSkipped || !item.userAnswer
                                ? '(Bỏ qua)'
                                : item.questionType === 'true_false'
                                ? item.userAnswer === 'TRUE'
                                  ? 'Đúng (True)'
                                  : 'Sai (False)'
                                : item.userAnswer}
                            </span>
                          </div>
                          <div className="bg-paper-50 border border-line rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] font-bold text-sumi-faint uppercase block">
                              Đáp án đúng
                            </span>
                            <span className="font-bold text-success">
                              {item.questionType === 'true_false'
                                ? item.correctAnswer === 'TRUE'
                                  ? 'Đúng (True)'
                                  : 'Sai (False)'
                                : item.correctAnswer}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-sumi-muted">
                  Không tìm thấy chi tiết bài tự đánh giá này.
                </div>
              )}

              <div className="pt-2 border-t border-line flex items-center justify-between">
                {attemptDetail ? (
                  <Link
                    to={buildRetakeUrl(attemptDetail.attempt)}
                    className="px-4 py-2 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <span>🔄</span>
                    <span>Làm lại bài kiểm tra</span>
                  </Link>
                ) : (
                  <div />
                )}
                <button
                  onClick={handleCloseDetail}
                  className="px-4 py-2 bg-paper-100 hover:bg-paper-200 text-sumi font-bold rounded-xl text-xs border border-line transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
