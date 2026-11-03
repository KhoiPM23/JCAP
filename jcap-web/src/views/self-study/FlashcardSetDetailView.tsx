import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { flashcardService } from '../../services/flashcardService';
import { getDemoSetDetail } from './demoFlashcardData';
import type { FlashcardSetDetail, FlashcardCardItem } from '../../types/flashcard';

export const FlashcardSetDetailView: React.FC = () => {
  const { topicId, contentType } = useParams<{ topicId: string; contentType: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<FlashcardSetDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'All' | 'Due' | 'Learning' | 'New' | 'Bookmarked'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 7;

  const isDemo = topicId === 'demo' || topicId === '0';
  const currentTopicId = topicId && !isDemo ? parseInt(topicId, 10) : 101;
  const currentContentType = contentType?.toLowerCase() === 'grammar' ? 'Grammar' : 'Vocabulary';
  const isGrammar = currentContentType === 'Grammar';
  const hasDue = (detail?.summary?.dueCards ?? 0) > 0;
  const isCompletedToday = !hasDue && (detail?.summary?.learnedCards ?? 0) === (detail?.summary?.totalCards ?? 0) && (detail?.summary?.totalCards ?? 0) > 0;
  const isPartiallyLearned = !hasDue && !isCompletedToday && (detail?.summary?.learnedCards ?? 0) > 0;

  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      setErrorMessage(null);

      // Chế độ Sandbox Demo: nạp dữ liệu mẫu từ RAM, không gọi API backend
      if (isDemo) {
        setDetail(getDemoSetDetail(currentContentType));
        setLoading(false);
        return;
      }

      const res = await flashcardService.getSetDetail(currentTopicId, currentContentType);
      if (res.success && res.data) {
        setDetail(res.data);
      } else {
        setErrorMessage(res.message || 'Không thể tải thông tin chi tiết bộ thẻ.');
      }
      setLoading(false);
    };

    loadDetail();
  }, [currentTopicId, currentContentType, isDemo]);

  // Audio Playback simulation or speech synthesis
  const handlePlayAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Toggle Bookmark item (Đồng bộ Backend SQL Server qua API /api/bookmarks/toggle)
  const handleToggleBookmark = async (item: FlashcardCardItem) => {
    if (!detail) return;
    const prevStatus = item.isBookmarked;
    // Optimistic UI Update
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: prev.cards.map((c) =>
          c.itemId === item.itemId && c.itemType === item.itemType
            ? { ...c, isBookmarked: !prevStatus }
            : c
        ),
      };
    });

    const res = await flashcardService.toggleBookmark(item.itemType, item.itemId);
    if (!res.success) {
      // Rollback on failure
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map((c) =>
            c.itemId === item.itemId && c.itemType === item.itemType
              ? { ...c, isBookmarked: prevStatus }
              : c
          ),
        };
      });
    } else if (res.data) {
      // Sync confirmed state from server
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map((c) =>
            c.itemId === item.itemId && c.itemType === item.itemType
              ? { ...c, isBookmarked: res.data!.isBookmarked }
              : c
          ),
        };
      });
    }
  };

  // Lọc thẻ
  const filteredCards = useMemo(() => {
    if (!detail || !Array.isArray(detail.cards)) return [];
    let list = detail.cards;

    // Filter by SRS Status
    if (statusFilter === 'Due') {
      list = list.filter((c) => c.srsState === 'Due');
    } else if (statusFilter === 'Learning') {
      list = list.filter((c) => c.srsState === 'Learning');
    } else if (statusFilter === 'New') {
      list = list.filter((c) => c.srsState === 'New');
    } else if (statusFilter === 'Bookmarked') {
      list = list.filter((c) => c.isBookmarked);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.frontText.toLowerCase().includes(q) ||
          (c.readingOrFormation && c.readingOrFormation.toLowerCase().includes(q)) ||
          c.meaning.toLowerCase().includes(q) ||
          (c.exampleSentence && c.exampleSentence.toLowerCase().includes(q))
      );
    }

    return list;
  }, [detail, statusFilter, searchQuery]);

  // Phân trang
  const totalFiltered = filteredCards.length;
  const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
  const paginatedCards = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCards.slice(start, start + pageSize);
  }, [filteredCards, currentPage, pageSize]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 bg-transparent pb-12 font-sans">

        {/* ==================== BREADCRUMB ==================== */}
        <div>
          <Link
            to="/flashcards"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ai hover:text-ai-hover transition-colors"
          >
            <span>←</span>
            <span>Quay lại danh sách bộ thẻ</span>
          </Link>
        </div>

        {errorMessage && (
          <div className="bg-danger-soft border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm">
            ⚠️ {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-sumi-muted space-y-3">
            <div className="w-10 h-10 border-4 border-line border-t-ai rounded-full animate-spin" />
            <p className="text-sm font-medium">Đang tải danh sách thẻ...</p>
          </div>
        ) : !detail ? (
          <div className="bg-paper-50 rounded-2xl border border-line p-8 text-center text-sumi-muted text-sm">
            Không tìm thấy bộ thẻ yêu cầu.
          </div>
        ) : (
          <>
            {/* ==================== HERO SUMMARY CARD ==================== */}
            <div className="bg-paper-50 rounded-2xl border border-line p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                {/* Badges */}
                <div className="flex items-center gap-2">
                  {isDemo && (
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-ai-soft text-ai border border-ai/30">
                      🧪 SANDBOX DEMO
                    </span>
                  )}
                  <span className={`px-2.5 py-0.5 rounded-md text-xs font-extrabold border border-line ${
                    detail.summary.jlptLevel === 'N5' ? 'bg-n5-soft text-n5' : detail.summary.jlptLevel === 'N4' ? 'bg-n4-soft text-n4' : 'bg-n3-soft text-n3'
                  }`}>
                    {detail.summary.jlptLevel}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                      isGrammar
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                        : 'bg-paper-200 text-sumi border border-line'
                    }`}
                  >
                    {isGrammar ? '🧩 Ngữ pháp' : '📘 Từ vựng'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-paper-200 text-sumi-muted border border-line">
                    {detail.summary.totalCards} {isGrammar ? 'mẫu câu' : 'từ vựng'}
                  </span>
                </div>

                <h1 className="text-2xl font-black text-sumi">
                  Chủ đề: {detail.summary.topicTitle}
                </h1>
                <p className="text-xs text-sumi-muted">
                  {detail.summary.topicDescription ||
                    'Tổng hợp các từ vựng và ngữ pháp thiết yếu theo chủ đề giúp rèn luyện trí nhớ ngắt quãng.'}
                </p>
              </div>

              {/* Right: 3 Mini Stats & Action */}
              <div className="flex flex-col sm:flex-row lg:flex-col items-stretch gap-3 lg:w-80">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-warning-soft border border-warning/30 rounded-xl p-2">
                    <div className="text-[10px] font-bold text-warning uppercase">Đến hạn</div>
                    <div className="text-base font-black text-warning">{detail.summary.dueCards}</div>
                  </div>
                  <div className="bg-success-soft border border-success/30 rounded-xl p-2">
                    <div className="text-[10px] font-bold text-success uppercase">Đã nhớ</div>
                    <div className="text-base font-black text-success">{detail.summary.learnedCards}</div>
                  </div>
                  <div className="bg-paper-200 border border-line rounded-xl p-2">
                    <div className="text-[10px] font-bold text-sumi-muted uppercase">Chưa học</div>
                    <div className="text-base font-black text-sumi">{detail.summary.newCards}</div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    navigate(`/flashcards/study/${isDemo ? 'demo' : currentTopicId}/${currentContentType.toLowerCase()}${isCompletedToday ? '?extraPractice=true' : ''}`)
                  }
                  className={`w-full py-3 px-4 rounded-xl text-on-ai font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
                    isGrammar
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-ai hover:bg-ai-hover'
                  }`}
                >
                  <span>{isCompletedToday ? '↻' : '▶'}</span>
                  <span>{hasDue ? 'Ôn tập ngay' : isCompletedToday ? 'Ôn thêm tự do' : isPartiallyLearned ? 'Tiếp tục ôn' : `Bắt đầu học bộ ${isGrammar ? 'ngữ pháp' : 'từ vựng'} này`}</span>
                </button>
              </div>
            </div>

            {/* ==================== FILTER & SEARCH BAR ==================== */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-paper-50 p-3.5 rounded-2xl border border-line shadow-xs">
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => { setStatusFilter('All'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'All'
                      ? 'bg-ai text-on-ai shadow-xs'
                      : 'bg-paper-100 text-sumi-muted hover:bg-paper-200 hover:text-sumi border border-line'
                  }`}
                >
                  Tất cả ({detail.cards.length})
                </button>
                <button
                  onClick={() => { setStatusFilter('Due'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'Due'
                      ? 'bg-warning text-white shadow-xs'
                      : 'bg-paper-100 text-warning border border-warning/30 hover:bg-warning-soft'
                  }`}
                >
                  🔥 Đến hạn ({detail.summary.dueCards})
                </button>
                <button
                  onClick={() => { setStatusFilter('Learning'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'Learning'
                      ? 'bg-success text-white shadow-xs'
                      : 'bg-paper-100 text-success border border-success/30 hover:bg-success-soft'
                  }`}
                >
                  🟢 Đã nhớ ({detail.summary.learnedCards})
                </button>
                <button
                  onClick={() => { setStatusFilter('New'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'New'
                      ? 'bg-sumi text-paper-50 shadow-xs'
                      : 'bg-paper-100 text-sumi-muted border border-line hover:bg-paper-200'
                  }`}
                >
                  ⚪ Chưa học ({detail.summary.newCards})
                </button>
                <button
                  onClick={() => { setStatusFilter('Bookmarked'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'Bookmarked'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-paper-100 text-warning border border-warning/30 hover:bg-warning-soft'
                  }`}
                >
                  🔖 Đã lưu ({detail.cards.filter((c) => c.isBookmarked).length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <span className="absolute left-3 top-2 text-sumi-faint text-xs">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder={isGrammar ? 'Tìm mẫu câu, công thức, nghĩa...' : 'Tìm từ vựng, hiragana, nghĩa...'}
                  className="w-full pl-8 pr-3 py-1.5 bg-paper-100 border border-line rounded-xl text-xs text-sumi placeholder:text-sumi-faint focus:outline-hidden focus:ring-2 focus:ring-ai focus:bg-paper-50 transition-all"
                />
              </div>
            </div>

            {/* ==================== CARD LIST TABLE ==================== */}
            <div className="bg-paper-50 rounded-2xl border border-line shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-paper-100 border-b border-line text-[11px] font-bold text-sumi-muted uppercase tracking-wider">
                      <th className="py-3 px-4 w-12 text-center">STT</th>
                      <th className="py-3 px-4 min-w-[180px]">
                        {isGrammar ? 'MẪU CÂU NGỮ PHÁP (PATTERN)' : 'TỪ VỰNG & CÁCH ĐỌC'}
                      </th>
                      <th className="py-3 px-4 min-w-[160px]">
                        {isGrammar ? 'CÁCH KẾT HỢP (FORMATION)' : 'TỪ LOẠI'}
                      </th>
                      <th className="py-3 px-4 min-w-[260px]">
                        {isGrammar ? 'Ý NGHĨA & VÍ DỤ MINH HỌA' : 'Ý NGHĨA TIẾNG VIỆT'}
                      </th>
                      <th className="py-3 px-4 min-w-[160px]">TRẠNG THÁI ÔN TẬP (SRS)</th>
                      <th className="py-3 px-4 w-24 text-right">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs text-sumi">
                    {paginatedCards.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-sumi-muted">
                          Không có thẻ nào phù hợp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      paginatedCards.map((card, idx) => {
                        const globalIndex = (currentPage - 1) * pageSize + idx + 1;
                        const formattedIndex = globalIndex < 10 ? `0${globalIndex}` : globalIndex;

                        return (
                          <tr key={card.itemId} className="hover:bg-paper-100/60 transition-colors">
                            {/* STT */}
                            <td className="py-4 px-4 text-center font-bold text-sumi-faint">
                              {formattedIndex}
                            </td>

                            {/* Cột 1: Từ vựng / Mẫu câu */}
                            <td className="py-4 px-4">
                              {isGrammar ? (
                                <span className="font-extrabold text-purple-600 dark:text-purple-400 text-sm">
                                  {card.frontText}
                                </span>
                              ) : (
                                <div>
                                  <div className="font-black text-sumi text-base">
                                    {card.frontText}
                                  </div>
                                  {card.readingOrFormation && (
                                    <div className="text-[11px] text-sumi-muted font-medium">
                                      {card.readingOrFormation}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Cột 2: Cách kết hợp / Từ loại */}
                            <td className="py-4 px-4">
                              {isGrammar ? (
                                <span className="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold border border-purple-500/20 inline-block">
                                  {card.readingOrFormation || '—'}
                                </span>
                              ) : (
                                <span className="text-sumi-muted font-medium">
                                  {card.partOfSpeech || 'Từ vựng'}
                                </span>
                              )}
                            </td>

                            {/* Cột 3: Ý nghĩa / Ví dụ */}
                            <td className="py-4 px-4">
                              {isGrammar ? (
                                <div className="space-y-1">
                                  <div className="font-bold text-sumi">{card.meaning}</div>
                                  {card.exampleSentence && (
                                    <div className="text-[11px] text-sumi-muted italic">
                                      VD: {card.exampleSentence}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-sumi">{card.meaning}</div>
                                  {card.explanation && (
                                    <div className="text-[11px] text-sumi-muted line-clamp-1">
                                      {card.explanation}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Cột 4: Trạng thái SRS */}
                            <td className="py-4 px-4">
                              {card.srsState === 'Due' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-warning-soft text-warning border border-warning/30">
                                  🔥 Đến hạn hôm nay
                                </span>
                              ) : card.srsState === 'Learning' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-success-soft text-success border border-success/30">
                                  🟢 Đã nhớ {card.nextReviewAt && `(Ôn lại: ${new Date(card.nextReviewAt).toLocaleDateString('vi-VN')})`}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-paper-200 text-sumi-muted border border-line">
                                  ⚪ Chưa học
                                </span>
                              )}
                            </td>

                            {/* Cột 5: Thao tác */}
                            <td className="py-4 px-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                {/* Phát âm */}
                                <button
                                  onClick={() => handlePlayAudio(card.frontText)}
                                  className="w-7 h-7 rounded-lg bg-paper-100 hover:bg-paper-200 text-sumi flex items-center justify-center transition-colors text-xs border border-line cursor-pointer"
                                  title="Nghe phát âm"
                                >
                                  🔊
                                </button>
                                {/* Bookmark */}
                                <button
                                  onClick={() => handleToggleBookmark(card)}
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-xs cursor-pointer ${
                                    card.isBookmarked
                                      ? 'bg-warning-soft text-warning border border-warning/30'
                                      : 'bg-paper-100 hover:bg-paper-200 text-sumi-faint border border-line'
                                  }`}
                                  title={card.isBookmarked ? 'Bỏ lưu' : 'Đánh dấu lưu thẻ'}
                                >
                                  🔖
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ==================== TABLE FOOTER & PAGINATION ==================== */}
              <div className="p-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-sumi-muted">
                <div>
                  Hiển thị {paginatedCards.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{' '}
                  {Math.min(currentPage * pageSize, totalFiltered)} trong tổng số {totalFiltered} thẻ
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-md border border-line bg-paper-100 hover:bg-paper-200 text-sumi disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      ❮
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-7 h-7 rounded-md font-bold transition-all cursor-pointer ${
                          currentPage === p
                            ? isGrammar
                              ? 'bg-purple-600 text-white'
                              : 'bg-ai text-on-ai'
                            : 'border border-line bg-paper-100 hover:bg-paper-200 text-sumi'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-md border border-line bg-paper-100 hover:bg-paper-200 text-sumi disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      ❯
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
    </div>
  );
};
