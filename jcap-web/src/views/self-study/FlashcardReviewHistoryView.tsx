import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { flashcardService } from '../../services/flashcardService';
import type { FlashcardSessionHistoryItem, FlashcardSessionHistoryDetail } from '../../types/flashcard';

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

export const FlashcardReviewHistoryView: React.FC = () => {
  const [historyItems, setHistoryItems] = useState<FlashcardSessionHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [timeFilter, setTimeFilter] = useState<'7days' | '30days' | 'all'>('7days');
  const [contentTypeFilter, setContentTypeFilter] = useState<'All' | 'Vocabulary' | 'Grammar' | 'Mixed'>('All');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Selected session detail modal
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<FlashcardSessionHistoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Đóng modal khi nhấn phím Esc
  useEffect(() => {
    if (!selectedSessionId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSessionId]);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage(null);
      const res = await flashcardService.getReviewHistory(
        currentPage,
        pageSize,
        contentTypeFilter
      );

      if (res.success && res.data) {
        setHistoryItems(Array.isArray(res.data.items) ? res.data.items : (Array.isArray(res.data) ? (res.data as any) : []));
      } else {
        setHistoryItems([]);
        setErrorMessage(res.message || 'Không thể tải lịch sử ôn tập.');
      }
      setLoading(false);
    };

    loadHistory();
  }, [timeFilter, contentTypeFilter, currentPage]);

  // Open modal detail
  const handleOpenDetail = async (sessionId: number) => {
    setSelectedSessionId(sessionId);
    setLoadingDetail(true);
    const res = await flashcardService.getSessionHistoryDetail(sessionId);
    if (res.success && res.data) {
      setSessionDetail(res.data);
    }
    setLoadingDetail(false);
  };

  const handleCloseDetail = () => {
    setSelectedSessionId(null);
    setSessionDetail(null);
  };

  // Tính toán các chỉ số thống kê từ danh sách phiên học thật từ API
  const stats = useMemo(() => {
    const totalSessions = historyItems.length;
    let completedSessions = 0;
    let totalReviewed = 0;
    let totalGoodOrEasy = 0;

    historyItems.forEach((item) => {
      if (!item.isIncomplete) {
        completedSessions += 1;
      }
      const reviewed = item.reviewedCardsCount ?? (item.againCount + item.goodCount + item.easyCount || item.totalCards);
      totalReviewed += reviewed;
      totalGoodOrEasy += (item.goodCount + item.easyCount);
    });

    const retentionRate = totalReviewed > 0 ? Math.round((totalGoodOrEasy / totalReviewed) * 100) : 0;

    const distinctDays = new Set(
      historyItems.map((item) => {
        const utcStr = item.startedAt.endsWith('Z') || item.startedAt.includes('+') ? item.startedAt : `${item.startedAt}Z`;
        return new Date(utcStr).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      })
    );
    const streak = distinctDays.size;

    return {
      totalReviewed,
      totalSessions,
      completedSessions,
      retentionRate,
      streak,
    };
  }, [historyItems]);

  // Gom nhóm các lượt đánh giá theo từng thẻ duy nhất trong phiên (loại bỏ trùng lặp khi bấm Học lại nhiều lần)
  const groupedLogs = useMemo(() => {
    if (!sessionDetail?.logs) return [];
    const map = new Map<string, {
      key: string;
      itemId: number;
      itemType: string;
      frontText: string;
      meaning: string;
      finalRating: string;
      againCount: number;
      intervalBefore: number;
      intervalAfter: number;
      reviewedAt: string;
    }>();

    sessionDetail.logs.forEach((log) => {
      const key = `${log.itemType}_${log.itemId}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          itemId: log.itemId,
          itemType: log.itemType,
          frontText: log.frontText,
          meaning: log.meaning,
          finalRating: log.rating,
          againCount: log.rating === 'Again' ? 1 : 0,
          intervalBefore: log.intervalBefore,
          intervalAfter: log.intervalAfter,
          reviewedAt: log.reviewedAt,
        });
      } else {
        if (log.rating === 'Again') {
          existing.againCount += 1;
        }
        existing.finalRating = log.rating;
        existing.intervalAfter = log.intervalAfter;
        existing.reviewedAt = log.reviewedAt;
      }
    });

    return Array.from(map.values());
  }, [sessionDetail]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 bg-transparent pb-12 font-sans">

        {/* ==================== 1. PAGE HEADER ==================== */}
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🗂️</span>
            <h1 className="text-2xl sm:text-3xl font-black text-sumi tracking-tight">
              Flashcard
            </h1>
          </div>
          <p className="text-sm text-sumi-muted mt-1">
            Theo dõi lịch sử ôn tập, thời gian luyện tập và tỷ lệ ghi nhớ của bạn
          </p>
        </div>

        {errorMessage && (
          <div className="bg-danger-soft border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* ==================== 2. SUB-NAVIGATION TABS ==================== */}
        <div className="flex items-center gap-2 border-b border-line pb-2 overflow-x-auto">
          <Link
            to="/flashcards"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-paper-50 text-sumi-muted hover:bg-paper-100 hover:text-sumi border border-line transition-all flex items-center gap-2"
          >
            <span>🗂️</span>
            <span>Bộ thẻ theo Chủ đề</span>
          </Link>

          <Link
            to="/flashcards/bookmarks"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-paper-50 text-sumi-muted hover:bg-paper-100 hover:text-sumi border border-line transition-all flex items-center gap-2"
          >
            <span>🔖</span>
            <span>Đã lưu (Bookmark)</span>
          </Link>

          <button
            className="px-4 py-2 rounded-xl text-sm font-bold bg-ai text-on-ai shadow-xs flex items-center gap-2"
          >
            <span>🕒</span>
            <span>Lịch sử ôn tập</span>
          </button>
        </div>

        {/* ==================== 3. 4 STAT OVERVIEW CARDS ==================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Tổng thẻ */}
          <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-ai-soft text-ai flex items-center justify-center text-xl font-bold border border-ai/30">
              🗂️
            </div>
            <div>
              <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Tổng thẻ đã ôn</div>
              <div className="text-2xl font-black text-sumi mt-0.5">
                {stats.totalReviewed} <span className="text-xs font-semibold text-sumi-muted">lượt</span>
              </div>
            </div>
          </div>

          {/* Card 2: Phiên hoàn thành */}
          <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl font-bold border border-purple-500/20">
              🎯
            </div>
            <div>
              <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Phiên hoàn thành</div>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-0.5">
                {stats.completedSessions} <span className="text-xs font-semibold text-sumi-muted">/ {stats.totalSessions} phiên</span>
              </div>
            </div>
          </div>

          {/* Card 3: Tỷ lệ nhớ tốt */}
          <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-success-soft text-success flex items-center justify-center text-xl font-bold border border-success/30">
              📈
            </div>
            <div>
              <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Tỷ lệ nhớ tốt (SRS)</div>
              <div className="text-2xl font-black text-success mt-0.5">
                {stats.retentionRate}%
              </div>
            </div>
          </div>

          {/* Card 4: Chuỗi ôn tập */}
          <div className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-warning-soft text-warning flex items-center justify-center text-xl font-bold border border-warning/30">
              🔥
            </div>
            <div>
              <div className="text-[11px] font-bold text-sumi-muted uppercase tracking-wider">Chuỗi ôn tập</div>
              <div className="text-2xl font-black text-warning mt-0.5">
                {stats.streak} <span className="text-xs font-semibold text-sumi-muted">ngày</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== 4. FILTER BAR ==================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-paper-50 p-3.5 rounded-2xl border border-line shadow-xs">
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-sumi-muted">
            {/* Khoảng thời gian */}
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

            {/* Loại nội dung */}
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
            Hiển thị {historyItems.length} phiên ôn tập
          </div>
        </div>

        {/* ==================== 5. SESSION HISTORY LIST ==================== */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-sumi-muted space-y-3">
            <div className="w-10 h-10 border-4 border-line border-t-ai rounded-full animate-spin" />
            <p className="text-sm font-medium">Đang tải lịch sử phiên học...</p>
          </div>
        ) : historyItems.length === 0 ? (
          <div className="bg-paper-50 rounded-2xl border border-line p-12 text-center space-y-3">
            <div className="text-4xl">🕒</div>
            <h3 className="text-base font-bold text-sumi">Chưa có lịch sử ôn tập nào</h3>
            <p className="text-xs text-sumi-muted max-w-md mx-auto">
              Hãy bắt đầu luyện tập một bộ thẻ để hệ thống ghi nhận lịch sử và tiến độ ghi nhớ SRS của bạn!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyItems.map((item) => {
              const isDueReview = item.sourceType === 'DueReview';
              const isGrammar = item.contentType?.toLowerCase() === 'grammar';
              const isMixed = item.contentType?.toLowerCase() === 'mixed';
              const total = item.againCount + item.goodCount + item.easyCount || item.totalCards;
              const durationMinutes = Math.floor(item.durationSeconds / 60);
              const durationSecs = item.durationSeconds % 60;
              const reviewedCards = item.reviewedCardsCount ?? (item.isIncomplete ? Math.max(0, item.totalCards - (item.unreviewedCardsCount ?? 0)) : item.totalCards);
              const unreviewedCount = item.unreviewedCardsCount ?? (item.isIncomplete ? Math.max(0, item.totalCards - reviewedCards) : 0);

              return (
                <div
                  key={item.sessionId}
                  className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left: Icon, Title & Time */}
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ${
                        isDueReview
                          ? 'bg-warning-soft text-warning border border-warning/30'
                          : isGrammar
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          : isMixed
                          ? 'bg-ai-soft text-ai border border-ai/30'
                          : 'bg-paper-200 text-sumi border border-line'
                      }`}
                    >
                      {isDueReview ? '⚡' : isGrammar ? '🧩' : isMixed ? '🔀' : '📘'}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-black text-sumi">
                          {item.setTitle}
                        </h2>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border border-line ${
                            isDueReview
                              ? 'bg-warning-soft text-warning'
                              : 'bg-paper-200 text-sumi-muted'
                          }`}
                        >
                          {isDueReview ? '⚡ Thẻ đến hạn' : item.sourceType === 'Bookmark' ? 'Thẻ đã lưu' : 'Theo chủ đề'}
                        </span>
                        {isMixed && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-ai-soft text-ai border border-ai/30">
                            Hỗn hợp
                          </span>
                        )}
                        {item.isIncomplete ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-warning-soft text-warning border border-warning/30 flex items-center gap-1">
                            <span>⏳</span>
                            <span>Chưa hoàn thành</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-success-soft text-success border border-success/30 flex items-center gap-1">
                            <span>✓</span>
                            <span>Đã hoàn thành</span>
                          </span>
                        )}
                        {item.isExtraPractice && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-ai-soft text-ai border border-ai/30">
                            ↻ Ôn tập thêm
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-sumi-muted">
                        {item.isIncomplete ? (
                          <span className="font-bold text-warning">
                            Lần ôn gần nhất: {formatVnDateTime(item.lastActivityAt || item.startedAt)}
                          </span>
                        ) : (
                          <span>{formatVnDateTime(item.startedAt)}</span>
                        )}{' '}
                        • Thời lượng:{' '}
                        <span className="font-semibold text-sumi">
                          {durationMinutes > 0 ? `${durationMinutes}m ` : ''}
                          {durationSecs}s
                        </span>{' '}
                        • Quy mô:{' '}
                        {item.isIncomplete ? (
                          <span>
                            Đã ôn: <span className="font-bold text-ai">{reviewedCards}/{item.totalCards} thẻ</span>
                            {unreviewedCount > 0 && (
                              <span className="text-warning font-extrabold ml-1.5 bg-warning-soft px-1.5 py-0.5 rounded border border-warning/30">
                                (Còn {unreviewedCount} thẻ chưa ôn)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="font-bold text-ai">{item.totalCards} thẻ</span>
                        )}
                        {total > item.totalCards && !item.isExtraPractice && (
                          <span className="text-sumi-faint font-medium ml-1">
                            ({total} lượt ôn)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Rating Breakdown Pills & Bar */}
                  <div className="space-y-1.5 lg:w-72">
                    {item.isExtraPractice ? (
                      <div className="text-xs font-semibold text-sumi-muted bg-paper-100 py-2 px-3 rounded-xl border border-line text-center">
                        ↻ Duyệt tự do ({item.totalCards} thẻ) • Không tính SRS
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-danger">🔴 {item.againCount}</span>
                          <span className="text-ai">🔵 {item.goodCount}</span>
                          <span className="text-success">🟢 {item.easyCount}</span>
                        </div>

                        <div className="w-full bg-paper-200 h-2 rounded-full overflow-hidden flex">
                          <div
                            className="bg-danger h-full"
                            style={{ width: `${(item.againCount / Math.max(1, total)) * 100}%` }}
                          />
                          <div
                            className="bg-ai h-full"
                            style={{ width: `${(item.goodCount / Math.max(1, total)) * 100}%` }}
                          />
                          <div
                            className="bg-success h-full"
                            style={{ width: `${(item.easyCount / Math.max(1, total)) * 100}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 w-full lg:w-auto">
                    {item.isIncomplete && (
                      <Link
                        to={
                          item.sourceType === 'DueReview'
                            ? `/flashcards/study/due/${item.contentType?.toLowerCase() || 'mixed'}${item.isExtraPractice ? '?extraPractice=true' : ''}`
                            : item.topicId
                            ? `/flashcards/study/${item.topicId}/${item.contentType?.toLowerCase() || 'vocabulary'}${item.isExtraPractice ? '?extraPractice=true' : ''}`
                            : '/flashcards'
                        }
                        className="px-3.5 py-2 bg-ai hover:bg-ai-hover text-on-ai rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                        title="Tiếp tục phiên ôn tập chưa hoàn thành"
                      >
                        <span>▶</span>
                        <span>Tiếp tục ôn</span>
                      </Link>
                    )}
                    <button
                      onClick={() => handleOpenDetail(item.sessionId)}
                      className="px-4 py-2 bg-paper-100 hover:bg-paper-200 border border-line text-sumi rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 flex-1 lg:flex-initial cursor-pointer"
                    >
                      <span>👁️</span>
                      <span>Xem chi tiết thẻ</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ==================== 6. MODAL XEM CHI TIẾT PHIÊN LỊCH SỬ ==================== */}
        {selectedSessionId &&
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
                  <span>📋</span>
                  <span>Chi tiết nhật ký phiên ôn tập #{selectedSessionId}</span>
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
                  <p className="text-xs font-medium">Đang tải nhật ký từng thẻ...</p>
                </div>
              ) : sessionDetail ? (
                <div className="overflow-y-auto space-y-3 flex-1 pr-1">
                  <div className="text-xs text-sumi-muted">
                    {sessionDetail.session.setTitle} •{' '}
                    {sessionDetail.session.isExtraPractice
                      ? `Ôn tập tự do (${groupedLogs.length} thẻ)`
                      : sessionDetail.session.isIncomplete
                      ? `Đã ôn ${sessionDetail.session.reviewedCardsCount ?? groupedLogs.length}/${sessionDetail.session.totalCards} thẻ (${sessionDetail.logs.length} lượt đánh giá)`
                      : `Quy mô: ${sessionDetail.session.totalCards} thẻ (${sessionDetail.logs.length} lượt đánh giá)`}
                  </div>

                  {sessionDetail.session.isIncomplete && (
                    <div className="p-3 bg-warning-soft border border-warning/30 rounded-xl text-xs text-warning flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⏳</span>
                        <span className="font-extrabold">Phiên ôn tập đang tạm dừng (Chưa hoàn thành)</span>
                      </div>
                      <div className="font-bold text-warning">
                        Đã ôn: {sessionDetail.session.reviewedCardsCount ?? groupedLogs.length}/{sessionDetail.session.totalCards} thẻ • Còn {sessionDetail.session.unreviewedCardsCount ?? Math.max(0, sessionDetail.session.totalCards - (sessionDetail.session.reviewedCardsCount ?? groupedLogs.length))} thẻ chưa ôn
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {groupedLogs.map((item) => (
                      <div
                        key={item.key}
                        className="p-3 bg-paper-100/60 rounded-xl border border-line flex items-center justify-between text-xs gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sumi text-sm">{item.frontText}</span>
                            {item.againCount > 0 && !sessionDetail.session.isExtraPractice && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-warning-soft text-warning border border-warning/30">
                                🔄 {item.againCount} lượt học lại
                              </span>
                            )}
                          </div>
                          <div className="text-sumi-muted text-[11px] line-clamp-1">{item.meaning}</div>
                        </div>

                        <div className="flex items-center gap-3 text-right shrink-0">
                          <div className="text-[11px] text-sumi-muted">
                            {sessionDetail.session.isExtraPractice ? (
                              <span className="text-sumi-muted font-medium">Ôn tự do</span>
                            ) : (
                              <>
                                {item.intervalBefore} ngày ➔{' '}
                                <span className="font-bold text-sumi">{item.intervalAfter} ngày</span>
                              </>
                            )}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                              sessionDetail.session.isExtraPractice
                                ? 'bg-ai-soft text-ai border border-ai/30'
                                : item.finalRating === 'Again'
                                ? 'bg-danger-soft text-danger border border-danger/30'
                                : item.finalRating === 'Good'
                                ? 'bg-ai-soft text-ai border border-ai/30'
                                : 'bg-success-soft text-success border border-success/30'
                            }`}
                          >
                            {sessionDetail.session.isExtraPractice
                              ? 'Đã duyệt'
                              : item.finalRating === 'Again'
                              ? 'Học lại'
                              : item.finalRating === 'Good'
                              ? 'Tốt'
                              : 'Dễ'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-sumi-muted">
                  Không tìm thấy chi tiết phiên ôn tập này.
                </div>
              )}

              <div className="pt-2 border-t border-line flex items-center justify-between">
                {sessionDetail && sessionDetail.session.isIncomplete ? (
                  <Link
                    to={
                      sessionDetail.session.sourceType === 'DueReview'
                        ? `/flashcards/study/due/${sessionDetail.session.contentType?.toLowerCase() || 'mixed'}${sessionDetail.session.isExtraPractice ? '?extraPractice=true' : ''}`
                        : sessionDetail.session.topicId
                        ? `/flashcards/study/${sessionDetail.session.topicId}/${sessionDetail.session.contentType?.toLowerCase() || 'vocabulary'}${sessionDetail.session.isExtraPractice ? '?extraPractice=true' : ''}`
                        : '/flashcards'
                    }
                    className="px-4 py-2 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <span>▶</span>
                    <span>Tiếp tục ôn tập phiên này</span>
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
