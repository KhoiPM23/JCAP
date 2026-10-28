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

  // Toggle Bookmark item
  const handleToggleBookmark = (item: FlashcardCardItem) => {
    if (!detail) return;
    setDetail({
      ...detail,
      cards: detail.cards.map((c) =>
        c.itemId === item.itemId && c.itemType === item.itemType
          ? { ...c, isBookmarked: !c.isBookmarked }
          : c
      ),
    });
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
    <div className="min-h-screen bg-[#F4F9FE] py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ==================== BREADCRUMB ==================== */}
        <div>
          <Link
            to="/flashcards"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:text-blue-800 transition-colors"
          >
            <span>←</span>
            <span>Quay lại danh sách bộ thẻ</span>
          </Link>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            ⚠️ {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-[#2563EB] rounded-full animate-spin" />
            <p className="text-sm font-medium">Đang tải danh sách thẻ...</p>
          </div>
        ) : !detail ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
            Không tìm thấy bộ thẻ yêu cầu.
          </div>
        ) : (
          <>
            {/* ==================== HERO SUMMARY CARD ==================== */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                {/* Badges */}
                <div className="flex items-center gap-2">
                  {isDemo && (
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
                      🧪 SANDBOX DEMO
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                    {detail.summary.jlptLevel}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                      isGrammar
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {isGrammar ? '🧩 Ngữ pháp' : '📘 Từ vựng'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700">
                    {detail.summary.totalCards} {isGrammar ? 'mẫu câu' : 'từ vựng'}
                  </span>
                </div>

                <h1 className="text-2xl font-black text-[#071A44]">
                  Chủ đề: {detail.summary.topicTitle}
                </h1>
                <p className="text-xs text-slate-500">
                  {detail.summary.topicDescription ||
                    'Tổng hợp các từ vựng và ngữ pháp thiết yếu theo chủ đề giúp rèn luyện trí nhớ ngắt quãng.'}
                </p>
              </div>

              {/* Right: 3 Mini Stats & Action */}
              <div className="flex flex-col sm:flex-row lg:flex-col items-stretch gap-3 lg:w-80">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                    <div className="text-[10px] font-bold text-amber-700 uppercase">Đến hạn</div>
                    <div className="text-base font-black text-amber-900">{detail.summary.dueCards}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                    <div className="text-[10px] font-bold text-emerald-700 uppercase">Đã nhớ</div>
                    <div className="text-base font-black text-emerald-900">{detail.summary.learnedCards}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Chưa học</div>
                    <div className="text-base font-black text-slate-700">{detail.summary.newCards}</div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    navigate(`/flashcards/study/${isDemo ? 'demo' : currentTopicId}/${currentContentType.toLowerCase()}`)
                  }
                  className={`w-full py-3 px-4 rounded-xl text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 ${
                    isGrammar
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                  }`}
                >
                  <span>▶</span>
                  <span>Bắt đầu học bộ {isGrammar ? 'ngữ pháp' : 'từ vựng'} này</span>
                </button>
              </div>
            </div>

            {/* ==================== FILTER & SEARCH BAR ==================== */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => { setStatusFilter('All'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'All'
                      ? 'bg-[#071A44] text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Tất cả ({detail.cards.length})
                </button>
                <button
                  onClick={() => { setStatusFilter('Due'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'Due'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  🔥 Đến hạn ({detail.summary.dueCards})
                </button>
                <button
                  onClick={() => { setStatusFilter('Learning'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'Learning'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  🟢 Đã nhớ ({detail.summary.learnedCards})
                </button>
                <button
                  onClick={() => { setStatusFilter('New'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'New'
                      ? 'bg-slate-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ⚪ Chưa học ({detail.summary.newCards})
                </button>
                <button
                  onClick={() => { setStatusFilter('Bookmarked'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'Bookmarked'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-white text-amber-600 border border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  🔖 Đã lưu ({detail.cards.filter((c) => c.isBookmarked).length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <span className="absolute left-3 top-2 text-slate-400 text-xs">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder={isGrammar ? 'Tìm mẫu câu, công thức, nghĩa...' : 'Tìm từ vựng, hiragana, nghĩa...'}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* ==================== CARD LIST TABLE ==================== */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
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
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {paginatedCards.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Không có thẻ nào phù hợp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      paginatedCards.map((card, idx) => {
                        const globalIndex = (currentPage - 1) * pageSize + idx + 1;
                        const formattedIndex = globalIndex < 10 ? `0${globalIndex}` : globalIndex;

                        return (
                          <tr key={card.itemId} className="hover:bg-slate-50/80 transition-colors">
                            {/* STT */}
                            <td className="py-4 px-4 text-center font-bold text-slate-400">
                              {formattedIndex}
                            </td>

                            {/* Cột 1: Từ vựng / Mẫu câu */}
                            <td className="py-4 px-4">
                              {isGrammar ? (
                                <span className="font-extrabold text-purple-950 text-sm">
                                  {card.frontText}
                                </span>
                              ) : (
                                <div>
                                  <div className="font-black text-[#071A44] text-base">
                                    {card.frontText}
                                  </div>
                                  {card.readingOrFormation && (
                                    <div className="text-[11px] text-slate-500 font-medium">
                                      {card.readingOrFormation}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Cột 2: Cách kết hợp / Từ loại */}
                            <td className="py-4 px-4">
                              {isGrammar ? (
                                <span className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-800 text-[11px] font-bold border border-purple-100 inline-block">
                                  {card.readingOrFormation || '—'}
                                </span>
                              ) : (
                                <span className="text-slate-600 font-medium">
                                  {card.partOfSpeech || 'Từ vựng'}
                                </span>
                              )}
                            </td>

                            {/* Cột 3: Ý nghĩa / Ví dụ */}
                            <td className="py-4 px-4">
                              {isGrammar ? (
                                <div className="space-y-1">
                                  <div className="font-bold text-slate-900">{card.meaning}</div>
                                  {card.exampleSentence && (
                                    <div className="text-[11px] text-slate-500 italic">
                                      VD: {card.exampleSentence}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-900">{card.meaning}</div>
                                  {card.explanation && (
                                    <div className="text-[11px] text-slate-500 line-clamp-1">
                                      {card.explanation}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Cột 4: Trạng thái SRS */}
                            <td className="py-4 px-4">
                              {card.srsState === 'Due' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  🔥 Đến hạn hôm nay
                                </span>
                              ) : card.srsState === 'Learning' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  🟢 Đã nhớ {card.nextReviewAt && `(Ôn lại: ${new Date(card.nextReviewAt).toLocaleDateString('vi-VN')})`}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
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
                                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors text-xs"
                                  title="Nghe phát âm"
                                >
                                  🔊
                                </button>
                                {/* Bookmark */}
                                <button
                                  onClick={() => handleToggleBookmark(card)}
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-xs ${
                                    card.isBookmarked
                                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
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
              <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                <div>
                  Hiển thị {paginatedCards.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{' '}
                  {Math.min(currentPage * pageSize, totalFiltered)} trong tổng số {totalFiltered} thẻ
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                    >
                      ❮
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-7 h-7 rounded-md font-bold transition-all ${
                          currentPage === p
                            ? isGrammar
                              ? 'bg-purple-600 text-white'
                              : 'bg-[#2563EB] text-white'
                            : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
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
    </div>
  );
};
