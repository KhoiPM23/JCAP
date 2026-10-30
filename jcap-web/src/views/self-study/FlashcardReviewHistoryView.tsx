import React, { useState, useEffect, useMemo } from 'react';
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
  const [contentTypeFilter, setContentTypeFilter] = useState<'All' | 'Vocabulary' | 'Grammar' | 'Bookmark'>('All');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Selected session detail modal
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<FlashcardSessionHistoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage(null);
      const res = await flashcardService.getReviewHistory(
        currentPage,
        pageSize,
        contentTypeFilter === 'Bookmark' ? 'All' : contentTypeFilter
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
    let totalReviewed = 0;
    let totalGoodOrEasy = 0;

    historyItems.forEach((item) => {
      const reviewed = item.againCount + item.goodCount + item.easyCount || item.totalCards;
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
    <div className="min-h-screen bg-[#F4F9FE] py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ==================== 1. PAGE HEADER ==================== */}
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🗂️</span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#071A44] tracking-tight">
              Flashcard
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi lịch sử ôn tập, thời gian luyện tập và tỷ lệ ghi nhớ của bạn
          </p>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* ==================== 2. SUB-NAVIGATION TABS ==================== */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <Link
            to="/flashcards"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-2"
          >
            <span>🗂️</span>
            <span>Bộ thẻ theo Chủ đề</span>
          </Link>

          <button
            disabled
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-400 border border-slate-200 flex items-center gap-2 cursor-not-allowed opacity-75"
          >
            <span>🔖</span>
            <span>Đã lưu (Bookmark)</span>
            <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md ml-1">
              Sắp ra mắt
            </span>
          </button>

          <button
            className="px-4 py-2 rounded-xl text-sm font-bold bg-[#2563EB] text-white shadow-xs flex items-center gap-2"
          >
            <span>🕒</span>
            <span>Lịch sử ôn tập</span>
          </button>
        </div>

        {/* ==================== 3. 4 STAT OVERVIEW CARDS ==================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Tổng thẻ */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold border border-blue-100">
              🗂️
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng thẻ đã ôn</div>
              <div className="text-2xl font-black text-[#071A44] mt-0.5">
                {stats.totalReviewed} <span className="text-xs font-semibold text-slate-500">lượt</span>
              </div>
            </div>
          </div>

          {/* Card 2: Phiên hoàn thành */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold border border-purple-100">
              🎯
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phiên hoàn thành</div>
              <div className="text-2xl font-black text-purple-900 mt-0.5">
                {stats.totalSessions} <span className="text-xs font-semibold text-slate-500">phiên</span>
              </div>
            </div>
          </div>

          {/* Card 3: Tỷ lệ nhớ tốt */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold border border-emerald-100">
              📈
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tỷ lệ nhớ tốt (SRS)</div>
              <div className="text-2xl font-black text-emerald-700 mt-0.5">
                {stats.retentionRate}%
              </div>
            </div>
          </div>

          {/* Card 4: Chuỗi ôn tập */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold border border-amber-100">
              🔥
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Chuỗi ôn tập</div>
              <div className="text-2xl font-black text-amber-800 mt-0.5">
                {stats.streak} <span className="text-xs font-semibold text-slate-500">ngày</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== 4. FILTER BAR ==================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
            {/* Khoảng thời gian */}
            <div className="flex items-center gap-1.5">
              <span>THỜI GIAN:</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {(['7days', '30days', 'all'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeFilter(tf)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                      timeFilter === tf
                        ? 'bg-[#071A44] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
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
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {(['All', 'Vocabulary', 'Grammar'] as const).map((ct) => (
                  <button
                    key={ct}
                    onClick={() => setContentTypeFilter(ct)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                      contentTypeFilter === ct
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ct === 'All' ? 'Tất cả' : ct === 'Vocabulary' ? '📘 Từ vựng' : '🧩 Ngữ pháp'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 text-right">
            Hiển thị {historyItems.length} phiên ôn tập
          </div>
        </div>

        {/* ==================== 5. SESSION HISTORY LIST ==================== */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-[#2563EB] rounded-full animate-spin" />
            <p className="text-sm font-medium">Đang tải lịch sử phiên học...</p>
          </div>
        ) : historyItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <div className="text-4xl">🕒</div>
            <h3 className="text-base font-bold text-slate-700">Chưa có lịch sử ôn tập nào</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Hãy bắt đầu luyện tập một bộ thẻ để hệ thống ghi nhận lịch sử và tiến độ ghi nhớ SRS của bạn!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyItems.map((item) => {
              const isGrammar = item.contentType?.toLowerCase() === 'grammar';
              const total = item.againCount + item.goodCount + item.easyCount || item.totalCards;
              const durationMinutes = Math.floor(item.durationSeconds / 60);
              const durationSecs = item.durationSeconds % 60;

              return (
                <div
                  key={item.sessionId}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left: Icon, Title & Time */}
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ${
                        isGrammar ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                      }`}
                    >
                      {isGrammar ? '🧩' : '📘'}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-black text-[#071A44]">
                          {item.setTitle}
                        </h2>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                          {item.sourceType === 'Bookmark' ? 'Thẻ đã lưu' : 'Theo chủ đề'}
                        </span>
                        {item.isExtraPractice && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            ↻ Ôn tập thêm
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatVnDateTime(item.startedAt)} • Thời lượng:{' '}
                        <span className="font-semibold text-slate-700">
                          {durationMinutes > 0 ? `${durationMinutes}m ` : ''}
                          {durationSecs}s
                        </span>{' '}
                        • Quy mô:{' '}
                        <span className="font-bold text-[#2563EB]">{item.totalCards} thẻ</span>
                        {total > item.totalCards && !item.isExtraPractice && (
                          <span className="text-slate-400 font-medium ml-1">
                            ({total} lượt ôn)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Rating Breakdown Pills & Bar */}
                  <div className="space-y-1.5 lg:w-72">
                    {item.isExtraPractice ? (
                      <div className="text-xs font-semibold text-slate-500 bg-slate-50 py-2 px-3 rounded-xl border border-slate-200 text-center">
                        ↻ Duyệt tự do ({item.totalCards} thẻ) • Không tính SRS
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-red-700">🔴 {item.againCount}</span>
                          <span className="text-blue-700">🔵 {item.goodCount}</span>
                          <span className="text-emerald-700">🟢 {item.easyCount}</span>
                        </div>

                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                          <div
                            className="bg-red-500 h-full"
                            style={{ width: `${(item.againCount / Math.max(1, total)) * 100}%` }}
                          />
                          <div
                            className="bg-blue-500 h-full"
                            style={{ width: `${(item.goodCount / Math.max(1, total)) * 100}%` }}
                          />
                          <div
                            className="bg-emerald-500 h-full"
                            style={{ width: `${(item.easyCount / Math.max(1, total)) * 100}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: View Detail Button */}
                  <div>
                    <button
                      onClick={() => handleOpenDetail(item.sessionId)}
                      className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 w-full lg:w-auto"
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
        {selectedSessionId && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-[#071A44] flex items-center gap-2">
                  <span>📋</span>
                  <span>Chi tiết nhật ký phiên ôn tập #{selectedSessionId}</span>
                </h3>
                <button
                  onClick={handleCloseDetail}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              {loadingDetail ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <div className="w-8 h-8 border-3 border-blue-200 border-t-[#2563EB] rounded-full animate-spin" />
                  <p className="text-xs font-medium">Đang tải nhật ký từng thẻ...</p>
                </div>
              ) : sessionDetail ? (
                <div className="overflow-y-auto space-y-2 flex-1 pr-1">
                  <div className="text-xs text-slate-500 pb-2">
                    {sessionDetail.session.setTitle} •{' '}
                    {sessionDetail.session.isExtraPractice
                      ? `Ôn tập tự do (${groupedLogs.length} thẻ)`
                      : `Quy mô: ${groupedLogs.length} thẻ (${sessionDetail.logs.length} lượt đánh giá)`}
                  </div>

                  {groupedLogs.map((item) => (
                    <div
                      key={item.key}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#071A44] text-sm">{item.frontText}</span>
                          {item.againCount > 0 && !sessionDetail.session.isExtraPractice && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                              🔄 {item.againCount} lượt học lại
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 text-[11px] line-clamp-1">{item.meaning}</div>
                      </div>

                      <div className="flex items-center gap-3 text-right shrink-0">
                        <div className="text-[11px] text-slate-400">
                          {sessionDetail.session.isExtraPractice ? (
                            <span className="text-slate-500 font-medium">Ôn tự do</span>
                          ) : (
                            <>
                              {item.intervalBefore} ngày ➔{' '}
                              <span className="font-bold text-slate-700">{item.intervalAfter} ngày</span>
                            </>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                            sessionDetail.session.isExtraPractice
                              ? 'bg-blue-100 text-blue-800'
                              : item.finalRating === 'Again'
                              ? 'bg-red-100 text-red-800'
                              : item.finalRating === 'Good'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
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
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Không tìm thấy chi tiết phiên ôn tập này.
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 text-right">
                <button
                  onClick={handleCloseDetail}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
