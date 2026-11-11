import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { Icon } from '../../components/jcap/Icon';
import { flashcardService } from '../../services/flashcardService';
import type { FlashcardQuota, FlashcardSetSummary, FlashcardContentType, BookmarkItem } from '../../types/flashcard';

export const FlashcardSetsView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [quota, setQuota] = useState<FlashcardQuota | null>(null);
  const [sets, setSets] = useState<FlashcardSetSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Phát âm từ vựng / câu mẫu
  const playJapaneseSpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  };

  // Toggle/Bỏ bookmark trực tiếp từ tab Bookmark
  const handleRemoveBookmark = async (item: BookmarkItem) => {
    const res = await flashcardService.toggleBookmark(item.itemType, item.itemId);
    if (res.success) {
      setBookmarks((prev) => prev.filter((b) => !(b.itemType === item.itemType && b.itemId === item.itemId)));
    }
  };

  // Filters
  const [searchParams] = useSearchParams();
  const isBookmarkRoute = location.pathname.endsWith('/bookmarks') || searchParams.get('tab') === 'bookmarks';
  const initialJlpt = searchParams.get('level') || 'All';
  const [activeTab, setActiveTab] = useState<'sets' | 'bookmarks' | 'history'>(isBookmarkRoute ? 'bookmarks' : 'sets');

  useEffect(() => {
    const isBookmark = location.pathname.endsWith('/bookmarks') || searchParams.get('tab') === 'bookmarks';
    setActiveTab(isBookmark ? 'bookmarks' : 'sets');
    if (isBookmark && !searchParams.get('level')) {
      setJlptFilter('All');
    }
  }, [location.pathname, searchParams]);
  const [typeFilter, setTypeFilter] = useState<'All' | FlashcardContentType>('All');
  const [jlptFilter, setJlptFilter] = useState<string>(initialJlpt);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDueModalOpen, setIsDueModalOpen] = useState<boolean>(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState<boolean>(false);

  // Đóng modal khi nhấn phím Esc
  useEffect(() => {
    if (!isDueModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDueModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDueModalOpen]);

  // Tải dữ liệu thật từ API
  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    const [quotaRes, setsRes] = await Promise.all([
      flashcardService.getDailyQuota(),
      flashcardService.getSets(typeFilter, jlptFilter),
    ]);

    if (quotaRes.success && quotaRes.data) {
      setQuota(quotaRes.data);
    } else {
      setQuota(null);
      if (quotaRes.message) {
        setErrorMessage(quotaRes.message);
      }
    }

    if (setsRes.success && Array.isArray(setsRes.data)) {
      setSets(setsRes.data);
    } else {
      setSets([]);
      if (setsRes.message) {
        setErrorMessage(setsRes.message);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();

    const handleProfileUpdated = (e: any) => {
      if (typeof e.detail?.creditBalance === 'number') {
        setQuota((prev) => (prev ? { ...prev, userCreditBalance: e.detail.creditBalance } : null));
      }
    };

    window.addEventListener('jcap_profile_updated', handleProfileUpdated);

    return () => {
      window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
    };
  }, [typeFilter, jlptFilter]);

  const loadBookmarks = async () => {
    setBookmarksLoading(true);
    const res = await flashcardService.getBookmarks(typeFilter, jlptFilter, searchQuery);
    let apiItems: BookmarkItem[] = [];
    if (res.success && res.data && Array.isArray(res.data.items)) {
      apiItems = res.data.items;
    }

    // Đọc thêm từ localStorage "jcap_saved_flashcards" để đồng bộ tức thì các từ vừa lưu từ kịch bản / radar
    let localItems: BookmarkItem[] = [];
    try {
      const raw = localStorage.getItem('jcap_saved_flashcards');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localItems = parsed.map((it: any, idx: number) => ({
            bookmarkId: 90000 + idx,
            itemType: (it.type === 'grammar' || it.itemType === 'grammar' || it.pattern) ? 'Grammar' : 'Vocabulary',
            itemId: it.id || (idx + 1),
            frontText: it.word || it.pattern || it.frontText || '',
            readingOrFormation: it.reading || it.formation || it.readingOrFormation || '',
            meaning: it.meaning || '',
            partOfSpeech: it.partOfSpeech || 'Danh từ',
            explanation: it.explanation || '',
            exampleSentence: it.exampleSentence || '',
            jlptLevel: it.jlptLevel || 'N4',
            isAvailable: true,
            srsState: 'New',
            intervalDays: 0,
            bookmarkedAt: it.savedAt || new Date().toISOString(),
          }));
        }
      }
    } catch {}

    // Merge: không trùng lặp các từ đã có trong apiItems
    const mergedMap = new Map<string, BookmarkItem>();
    apiItems.forEach((item) => {
      const key = `${item.itemType}:${item.frontText}`.trim();
      mergedMap.set(key, item);
    });
    localItems.forEach((item) => {
      const key = `${item.itemType}:${item.frontText}`.trim();
      if (!mergedMap.has(key)) {
        mergedMap.set(key, item);
      }
    });

    let allMerged = Array.from(mergedMap.values());
    if (typeFilter && typeFilter !== 'All') {
      allMerged = allMerged.filter((it) => it.itemType.toLowerCase() === typeFilter.toLowerCase());
    }
    if (jlptFilter && jlptFilter !== 'All') {
      allMerged = allMerged.filter((it) => (it.jlptLevel || 'N4').toUpperCase() === jlptFilter.toUpperCase());
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      allMerged = allMerged.filter(
        (it) =>
          it.frontText.toLowerCase().includes(q) ||
          it.meaning.toLowerCase().includes(q) ||
          (it.readingOrFormation && it.readingOrFormation.toLowerCase().includes(q))
      );
    }

    setBookmarks(allMerged);
    setBookmarksLoading(false);
  };

  useEffect(() => {
    loadBookmarks();
  }, []);

  useEffect(() => {
    if (activeTab === 'bookmarks') {
      loadBookmarks();
    }
  }, [activeTab, typeFilter, jlptFilter, searchQuery]);

  // Mở thêm 10 thẻ mới bằng Credits thực sự qua API
  const handleUnlockExtra = async () => {
    setUnlocking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await flashcardService.unlockExtraNewCards();
    if (res.success && res.data) {
      setQuota(res.data);
      setSuccessMessage('Mở thêm 10 thẻ mới hôm nay thành công (-5 Credits)!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } else {
      setErrorMessage(res.message || 'Không thể mở thêm thẻ mới.');
    }
    setUnlocking(false);
  };

  // Giả lập thời gian trôi qua để kiểm thử SRS
  const handleSimulateDays = async (days: number) => {
    setSimulating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await flashcardService.simulateDays(days);
    if (res.success) {
      setSuccessMessage(res.message || `Đã giả lập tua nhanh ${days} ngày.`);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } else {
      setErrorMessage(res.message || `Không thể giả lập qua ${days} ngày.`);
    }
    setSimulating(false);
  };

  // Xóa toàn bộ tiến độ và lịch sử Flashcard để kiểm thử lại từ đầu
  const handleResetProgress = async () => {
    const confirmed = window.confirm(
      'Bạn có chắc chắn muốn xóa toàn bộ tiến độ học và lịch sử phiên Flashcard của bạn không? Toàn bộ thẻ sẽ trở về trạng thái mới (New) để kiểm thử lại từ đầu.'
    );
    if (!confirmed) return;

    setResetting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await flashcardService.resetProgress();
    if (res.success) {
      setSuccessMessage(res.message || 'Đã đặt lại toàn bộ tiến độ và lịch sử Flashcard!');
      await loadData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } else {
      setErrorMessage(res.message || 'Không thể đặt lại tiến độ.');
    }
    setResetting(false);
  };

  // An toàn với mảng dữ liệu (Defensive array)
  const safeSets = useMemo(() => (Array.isArray(sets) ? sets : []), [sets]);

  // Lọc bộ thẻ theo từ khóa tìm kiếm
  const filteredSets = useMemo(() => {
    if (!searchQuery.trim()) return safeSets;
    const q = searchQuery.toLowerCase().trim();
    return safeSets.filter(
      (s) =>
        (s.setTitle && s.setTitle.toLowerCase().includes(q)) ||
        (s.topicTitle && s.topicTitle.toLowerCase().includes(q)) ||
        (s.topicDescription && s.topicDescription.toLowerCase().includes(q))
    );
  }, [safeSets, searchQuery]);

  // Phân trang danh sách bộ thẻ (10 bộ mỗi trang)
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset về trang 1 khi đổi bộ lọc hoặc từ khóa tìm kiếm
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, jlptFilter, searchQuery]);

  // Tổng số trang
  const totalPages = Math.max(1, Math.ceil(filteredSets.length / PAGE_SIZE));

  // Tự động điều chỉnh trang nếu vượt quá tổng số trang hợp lệ
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Danh sách bộ thẻ hiển thị trên trang hiện tại
  const paginatedSets = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredSets.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredSets, currentPage]);

  // Tổng số thẻ đến hạn hôm nay (ưu tiên số liệu độc nhất từ backend, không bị nhân đôi theo số chủ đề)
  const totalDueToday = useMemo(() => {
    if (typeof quota?.totalDueCardsToday === 'number') {
      return quota.totalDueCardsToday;
    }
    return safeSets.reduce((acc, curr) => acc + (curr?.dueCards || 0), 0);
  }, [quota, safeSets]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 bg-transparent pb-12 font-sans">

        {/* ==================== 1. PAGE HEADER ==================== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🗂️</span>
              <h1 className="text-2xl sm:text-3xl font-black text-sumi tracking-tight">
                Flashcard
              </h1>
            </div>
            <p className="text-sm text-sumi-muted mt-1">
              Ôn tập ngắt quãng (SRS SM-2) theo các chủ đề N5 – N3 và danh sách đánh dấu cá nhân
            </p>
          </div>

          {/* Công cụ giả lập kiểm thử SRS */}
          <div className="flex items-center flex-wrap gap-2 bg-paper-50 p-1.5 rounded-2xl border border-line shadow-xs self-start sm:self-auto">
            <span className="text-xs font-bold text-sumi-muted px-2 flex items-center gap-1">
              <span>🧪</span>
              <span className="hidden md:inline">Test SRS:</span>
            </span>
            <button
              onClick={() => handleSimulateDays(1)}
              disabled={simulating}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-warning-soft hover:opacity-90 text-warning border border-warning/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Lùi thời gian tiến độ của thẻ 1 ngày để kích hoạt các thẻ hẹn 1 ngày (hoặc Again) đến hạn ôn tập"
            >
              <span>⏩</span>
              <span>{simulating ? 'Đang tua...' : 'Giả lập qua 1 ngày'}</span>
            </button>
            <button
              onClick={() => handleSimulateDays(3)}
              disabled={simulating}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-ai-soft hover:opacity-90 text-ai border border-ai/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Lùi thời gian tiến độ của thẻ 3 ngày để kiểm tra các thẻ hẹn 3 ngày đến hạn ôn tập"
            >
              <span>⏩</span>
              <span>{simulating ? 'Đang tua...' : 'Giả lập qua 3 ngày'}</span>
            </button>
            <button
              onClick={handleResetProgress}
              disabled={resetting || simulating}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-danger-soft hover:opacity-90 text-danger border border-danger/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Xóa toàn bộ tiến độ và lịch sử Flashcard của tài khoản để test lại từ đầu"
            >
              <span>🗑️</span>
              <span>{resetting ? 'Đang reset...' : 'Reset tiến độ test'}</span>
            </button>
          </div>
        </div>

        {/* Toast thông báo lỗi / thành công */}
        {errorMessage && (
          <div className="bg-danger-soft border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-danger hover:opacity-80 font-bold ml-4 cursor-pointer">✕</button>
          </div>
        )}
        {successMessage && (
          <div className="bg-success-soft border border-success/30 text-success px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>✅ {successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-success hover:opacity-80 font-bold ml-4 cursor-pointer">✕</button>
          </div>
        )}

        {/* ==================== 2. SUB-NAVIGATION TABS ==================== */}
        <div className="flex items-center gap-2 border-b border-line pb-2 overflow-x-auto">
          {/* Tab 1: Bộ thẻ theo chủ đề */}
          <Link
            to="/flashcards"
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'sets'
                ? 'bg-ai text-on-ai shadow-xs'
                : 'bg-paper-50 text-sumi-muted hover:bg-paper-100 hover:text-sumi border border-line'
            }`}
          >
            <span>🗂️</span>
            <span>Bộ thẻ theo Chủ đề ({safeSets.length})</span>
          </Link>

          {/* Tab 2: Bookmark (Đã kích hoạt với API SQL Server & Dark Mode) */}
          <Link
            to="/flashcards/bookmarks"
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'bookmarks'
                ? 'bg-ai text-on-ai shadow-xs'
                : 'bg-paper-50 text-sumi-muted hover:bg-paper-100 hover:text-sumi border border-line'
            }`}
          >
            <span>🔖</span>
            <span>Đã lưu (Bookmark) ({bookmarks.length})</span>
          </Link>

          {/* Tab 3: Lịch sử ôn tập */}
          <Link
            to="/flashcards/history"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-paper-50 text-sumi-muted hover:bg-paper-100 hover:text-sumi border border-line transition-all flex items-center gap-2"
          >
            <span>🕒</span>
            <span>Lịch sử ôn tập</span>
          </Link>
        </div>

        {/* ==================== 3. DAILY QUOTA & DUE REMINDER BANNER ==================== */}
        {quota ? (
          <div className="bg-paper-50 border border-line rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Cột 1: Nhắc thẻ đến hạn */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-paper-100 flex items-center justify-center text-2xl shadow-xs border border-line">
                🔥
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-sumi">
                  {totalDueToday > 0
                    ? `Hôm nay bạn có ${totalDueToday} thẻ đến hạn cần ôn lại!`
                    : 'Tuyệt vời! Bạn đã hoàn thành hết thẻ đến hạn hôm nay!'}
                </h3>
                <p className="text-xs text-sumi-muted mt-0.5">
                  Thẻ ôn lại luôn hoàn toàn miễn phí và không tính vào hạn mức thẻ mới.
                </p>
                {totalDueToday > 0 && (
                  <button
                    onClick={() => setIsDueModalOpen(true)}
                    className="mt-2.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs rounded-xl shadow-xs hover:shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>⚡</span>
                    <span>Ôn tập tất cả đến hạn ({totalDueToday} thẻ)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cột 2: Thanh tiến độ hạn mức thẻ mới */}
            <div className="border-t md:border-t-0 md:border-l border-line pt-4 md:pt-0 md:pl-6 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-sumi">
                <span className="text-sumi-muted">HẠN MỨC THẺ MỚI HÔM NAY</span>
                <span className="text-ai">
                  Đã học {quota.studiedNewCardsToday} / {quota.totalAllowedNewCardsToday} thẻ
                </span>
              </div>
              <div className="w-full bg-paper-200 h-2.5 rounded-full overflow-hidden border border-line">
                <div
                  className="bg-ai h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      (quota.studiedNewCardsToday / Math.max(1, quota.totalAllowedNewCardsToday)) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-sumi-muted pt-0.5">
                <span>
                  Còn <span className="font-bold text-ai">{quota.remainingNewCardsToday} thẻ mới</span> miễn phí hôm nay
                </span>
                <button
                  onClick={handleUnlockExtra}
                  disabled={unlocking}
                  className="px-2.5 py-1 bg-paper-100 hover:bg-paper-200 border border-line text-sumi rounded-lg text-[11px] font-bold transition-all shadow-2xs hover:shadow-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  title="Mở thêm 10 thẻ mới bằng Credit"
                >
                  <span>{unlocking ? 'Đang mở...' : '+ 10 thẻ'}</span>
                  <span className="text-warning font-extrabold">({quota.unlockCreditCost} 🪙)</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-paper-50 border border-line rounded-2xl p-4 text-xs text-sumi-muted flex items-center gap-2">
            <span className="text-base">ℹ️</span>
            <span>Đang kết nối hạn mức thẻ từ máy chủ backend...</span>
          </div>
        )}

        {/* ==================== 4. FILTER & SEARCH BAR ==================== */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-paper-50 p-4 rounded-2xl border border-line shadow-xs">
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-sumi-muted">
            {/* Filter Loại Bộ Thẻ */}
            <div className="flex items-center gap-1.5">
              <span>LOẠI:</span>
              <div className="inline-flex rounded-lg border border-line p-0.5 bg-paper-100">
                {(['All', 'Vocabulary', 'Grammar'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      typeFilter === t
                        ? 'bg-ai text-on-ai shadow-xs'
                        : 'text-sumi-muted hover:text-sumi'
                    }`}
                  >
                    {t === 'All' ? 'Tất cả' : t === 'Vocabulary' ? '📘 Từ vựng' : '🧩 Ngữ pháp'}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Trình độ JLPT */}
            <div className="flex items-center gap-1.5">
              <span>JLPT:</span>
              <div className="inline-flex rounded-lg border border-line p-0.5 bg-paper-100">
                {['All', 'N5', 'N4', 'N3'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setJlptFilter(lvl)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      jlptFilter === lvl
                        ? 'bg-ai text-on-ai shadow-xs'
                        : 'text-sumi-muted hover:text-sumi'
                    }`}
                  >
                    {lvl === 'All' ? 'Tất cả' : lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full lg:w-72">
            <span className="absolute left-3 top-2.5 text-sumi-faint text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm chủ đề bộ thẻ..."
              className="w-full pl-8 pr-4 py-2 bg-paper-100 border border-line rounded-xl text-xs text-sumi placeholder:text-sumi-faint focus:outline-hidden focus:ring-2 focus:ring-ai focus:bg-paper-50 transition-all"
            />
          </div>
        </div>

        {/* ==================== 5. BOOKMARKS TAB VIEW vs SETS GRID ==================== */}
        {activeTab === 'bookmarks' ? (
          <div className="space-y-6">
            {/* Header thanh điều khiển luyện tập Bookmark */}
            <div className="bg-warning-soft/30 border border-warning/30 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-paper-50 border border-warning/30 flex items-center justify-center text-amber-700 font-serif font-black text-xl shadow-xs">
                  記
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-sumi">
                      Kho thẻ cá nhân đã lưu
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning-soft text-warning border border-warning/30">
                      {bookmarks.length} thẻ
                    </span>
                  </div>
                  <p className="text-xs text-sumi-muted mt-1">
                    Các từ vựng và cấu trúc ngữ pháp bạn đã đánh dấu từ kịch bản hội thoại và các bộ thẻ để tự rèn luyện.
                  </p>
                </div>
              </div>

              {bookmarks.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 shrink-0 md:ml-auto">
                <button
                  type="button"
                  onClick={() => navigate('/flashcards/test/bookmarks/mixed?source=bookmark')}
                  className="md:ml-auto px-4 py-3 rounded-xl bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300 font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Icon name="quiz" size={16} />
                  <span>Kiểm tra ({bookmarks.length} thẻ)</span>
                </button>
                <button
                  onClick={() => navigate('/flashcards/study/0/Mixed?source=bookmark')}
                  className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Icon name="play_arrow" size={16} />
                  <span>Luyện tập ngay ({bookmarks.length} thẻ)</span>
                  <span>→</span>
                </button>
              </div>
              )}

            </div>

            {/* Danh sách thẻ Bookmarks */}
            {bookmarksLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-sumi-muted space-y-3">
                <div className="w-10 h-10 border-4 border-warning/40 border-t-amber-600 rounded-full animate-spin" />
                <p className="text-sm font-medium">Đang tải thẻ đã lưu từ cơ sở dữ liệu...</p>
              </div>
            ) : bookmarks.length === 0 ? (
              <div className="bg-paper-50 rounded-2xl border border-line p-12 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 text-2xl font-serif font-black">
                  栞
                </div>
                <h3 className="text-base font-bold text-sumi">
                  Bạn chưa lưu thẻ flashcard nào
                </h3>
                <p className="text-xs text-sumi-muted max-w-md mx-auto leading-relaxed">
                  Khi thực hành đàm thoại trong kịch bản (Scenario) hoặc xem kết quả phân tích ngôn ngữ, hãy nhấn vào biểu tượng lưu để lưu các từ vựng & ngữ pháp trọng tâm vào đây.
                </p>
                <div className="pt-2">
                  <Link
                    to="/flashcards"
                    className="inline-block px-4 py-2 bg-ai-soft text-ai hover:opacity-90 font-bold rounded-xl text-xs transition border border-ai/20 cursor-pointer"
                  >
                    Khám phá bộ thẻ theo chủ đề →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bookmarks.map((item) => (
                  <div
                    key={`${item.itemType}_${item.itemId}`}
                    className="bg-paper-50 rounded-2xl border border-line p-5 shadow-xs hover:border-warning/50 hover:shadow-md transition-all flex flex-col justify-between space-y-3 text-sumi"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-paper-100 text-sumi border border-line">
                            {item.jlptLevel || 'N5'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              item.itemType === 'Grammar'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                : 'bg-ai-soft text-ai border border-ai/20'
                            }`}
                          >
                            {item.itemType === 'Grammar' ? '🧩 Ngữ pháp' : '📘 Từ vựng'}
                          </span>
                        </div>

                        {/* SRS State Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.srsState === 'Due'
                              ? 'bg-warning-soft text-warning border border-warning/30 animate-pulse'
                              : item.srsState === 'Learning'
                              ? 'bg-ai-soft text-ai border border-ai/20'
                              : 'bg-success-soft text-success border border-success/30'
                          }`}
                        >
                          {item.srsState === 'Due'
                            ? '🔥 Đến hạn'
                            : item.srsState === 'Learning'
                            ? `📖 Lặp lại (${item.intervalDays}d)`
                            : '✨ Mới'}
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <h4 className="text-lg font-black text-sumi font-serif">
                            {item.frontText}
                          </h4>
                          {item.readingOrFormation && (
                            <span className="text-xs text-ai font-medium font-mono">
                              {item.readingOrFormation}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-sumi mt-1 leading-relaxed">
                          {item.meaning}
                        </p>
                        {item.exampleSentence && (
                          <p className="text-[11px] text-sumi-muted italic mt-2 border-l-2 border-line pl-2">
                            {item.exampleSentence}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-line">
                      <button
                        type="button"
                        onClick={() => playJapaneseSpeech(item.frontText)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-sumi-muted hover:bg-paper-100 hover:text-sumi transition cursor-pointer border border-line"
                        title="Nghe phát âm"
                      >
                        <span>🔊</span>
                        <span>Nghe</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveBookmark(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-danger hover:bg-danger-soft border border-transparent hover:border-danger/30 transition cursor-pointer"
                        title="Bỏ lưu khỏi bookmark"
                      >
                        <span>✕</span>
                        <span>Bỏ lưu</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ==================== 5. FLASHCARD SETS GRID ==================== */
          loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-sumi-muted space-y-3">
              <div className="w-10 h-10 border-4 border-line border-t-ai rounded-full animate-spin" />
            <p className="text-sm font-medium">Đang tải danh sách bộ thẻ từ máy chủ...</p>
          </div>
        ) : filteredSets.length === 0 ? (
          <div className="space-y-6">
            <div className="bg-paper-50 rounded-2xl border border-line p-8 text-center space-y-3">
              <div className="text-4xl">🗂️</div>
              <h3 className="text-base font-bold text-sumi">
                Chưa có bộ thẻ Flashcard nào trong hệ thống
              </h3>
              <p className="text-xs text-sumi-muted max-w-lg mx-auto leading-relaxed">
                Hiện tại cơ sở dữ liệu chưa có danh mục Từ vựng hoặc Ngữ pháp độc lập nào được nạp vào. Khi quản trị viên nhập liệu hoặc import danh mục học tập (UC-33 → UC-51), các bộ thẻ chính thức sẽ tự động hiển thị tại đây.
              </p>
            </div>

            {/* Khối trải nghiệm Sandbox Demo */}
            <div className="bg-paper-50 border border-line rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧪</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-sumi">
                        Bộ thẻ mẫu trải nghiệm (Sandbox Mode)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-ai-soft text-ai border border-ai/30">
                        KHÔNG LƯU DB
                      </span>
                    </div>
                    <p className="text-[11px] text-sumi-muted mt-0.5">
                      Trải nghiệm ngay luồng học thẻ 3D, nghe audio TTS, đánh giá ngắt quãng SRS và xem màn hình tổng kết trên RAM.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2 thẻ mẫu: Từ vựng & Ngữ pháp */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Demo Từ vựng */}
                <div className="bg-paper-100/60 rounded-xl border border-line p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-n5-soft text-n5 border border-line">
                          N5
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-paper-200 text-sumi border border-line">
                          📘 Từ vựng
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-success-soft text-success border border-success/30">
                        ✨ 5 thẻ mẫu
                      </span>
                    </div>

                    <h5 className="text-base font-black text-sumi mt-3">
                      Từ vựng N5 – Chào hỏi & Giao tiếp cơ bản
                    </h5>
                    <p className="text-xs text-sumi-muted mt-1 line-clamp-2">
                      Bộ thẻ mẫu 5 từ vựng nền tảng (こんにちは, ありがとう, すみません...) giúp bạn kiểm tra trọn vẹn flow học thẻ.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-line">
                    <div className="flex items-center justify-between text-xs font-semibold text-sumi-muted">
                      <span>Tiến độ mẫu: 0 / 5 thẻ (0%)</span>
                      <span className="text-[11px] text-sumi-faint">⚪ 5 thẻ mới</span>
                    </div>
                    <div className="w-full bg-paper-200 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full w-0" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => navigate('/flashcards/sets/demo/vocabulary')}
                      className="px-3 py-2 bg-paper-200 hover:bg-paper-300 text-sumi font-bold rounded-xl text-xs transition-colors border border-line flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>📋</span>
                      <span>Xem thẻ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/flashcards/test/demo/vocabulary')}
                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-colors border border-indigo-200 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>📝</span>
                      <span>Kiểm tra</span>
                    </button>
                    <button
                      onClick={() => navigate('/flashcards/study/demo/vocabulary')}
                      className="px-3 py-2 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>▶</span>
                      <span>Học thử</span>
                    </button>
                  </div>
                </div>

                {/* 2. Demo Ngữ pháp */}
                <div className="bg-paper-100/60 rounded-xl border border-line p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-n5-soft text-n5 border border-line">
                          N5
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          🧩 Ngữ pháp
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        ✨ 4 thẻ mẫu
                      </span>
                    </div>

                    <h5 className="text-base font-black text-sumi mt-3">
                      Ngữ pháp N5 – Mẫu câu danh từ cơ bản
                    </h5>
                    <p className="text-xs text-sumi-muted mt-1 line-clamp-2">
                      Bộ thẻ mẫu 4 mẫu câu khẳng định, phủ định và câu hỏi (〜は〜です, 〜ではありません...) để kiểm tra giao diện thẻ ngữ pháp.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-line">
                    <div className="flex items-center justify-between text-xs font-semibold text-sumi-muted">
                      <span>Tiến độ mẫu: 0 / 4 thẻ (0%)</span>
                      <span className="text-[11px] text-sumi-faint">⚪ 4 thẻ mới</span>
                    </div>
                    <div className="w-full bg-paper-200 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 dark:bg-purple-500 rounded-full w-0" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => navigate('/flashcards/sets/demo/grammar')}
                      className="px-3 py-2 bg-paper-200 hover:bg-paper-300 text-sumi font-bold rounded-xl text-xs transition-colors border border-line flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>📋</span>
                      <span>Xem thẻ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/flashcards/test/demo/grammar')}
                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-colors border border-indigo-200 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>📝</span>
                      <span>Kiểm tra</span>
                    </button>
                    <button
                      onClick={() => navigate('/flashcards/study/demo/grammar')}
                      className="px-3 py-2 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>▶</span>
                      <span>Học thử</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {paginatedSets.map((set) => {
              const isGrammar = set.contentType === 'Grammar';
              const hasDue = set.dueCards > 0;
              const isCompletedToday = !hasDue && set.learnedCards === set.totalCards && set.totalCards > 0;
              const isBrandNew = set.learnedCards === 0;
              const isPartiallyLearned = !hasDue && !isCompletedToday && set.learnedCards > 0;

              return (
                <div
                  key={`${set.topicId}_${set.contentType}`}
                  className="bg-paper-50 rounded-2xl border border-line p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-5"
                >
                  {/* Top: Badges & Status */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* JLPT Badge */}
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-extrabold border border-line ${
                          set.jlptLevel === 'N5' ? 'bg-n5-soft text-n5' : set.jlptLevel === 'N4' ? 'bg-n4-soft text-n4' : 'bg-n3-soft text-n3'
                        }`}>
                          {set.jlptLevel}
                        </span>

                        {/* ContentType Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                            isGrammar
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : 'bg-paper-200 text-sumi border border-line'
                          }`}
                        >
                          {isGrammar ? '🧩 Ngữ pháp' : '📘 Từ vựng'}
                        </span>
                      </div>

                      {/* State Badge */}
                      {hasDue && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-warning-soft text-warning border border-warning/30 animate-pulse">
                          🔥 {set.dueCards} thẻ đến hạn
                        </span>
                      )}
                      {isPartiallyLearned && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-ai-soft text-ai border border-ai/30">
                          📖 Đang học
                        </span>
                      )}
                      {isCompletedToday && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-success-soft text-success border border-success/30">
                          ✅ Hoàn thành hôm nay
                        </span>
                      )}
                      {isBrandNew && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-paper-200 text-sumi-muted border border-line">
                          ✨ Chưa học
                        </span>
                      )}
                    </div>

                    {/* Set Title & Description */}
                    <h2 className="text-lg font-black text-sumi mt-3">
                      {set.setTitle}
                    </h2>
                    <p className="text-xs text-sumi-muted mt-1 line-clamp-2">
                      {set.topicDescription || 'Bộ thẻ tự học hỗ trợ rèn luyện trí nhớ ngắt quãng theo chủ đề.'}
                    </p>
                  </div>

                  {/* Middle: Progress Bar */}
                  <div className="space-y-1.5 pt-2 border-t border-line">
                    <div className="flex items-center justify-between text-xs font-semibold text-sumi-muted">
                      <span>Tiến độ đã học: {set.learnedCards} / {set.totalCards} thẻ ({Math.round((set.learnedCards / Math.max(1, set.totalCards)) * 100)}%)</span>
                      <span className="text-[11px] text-sumi-faint">
                        {isCompletedToday && set.nextDueAt
                          ? `Đến hạn kế tiếp: ${new Date(set.nextDueAt).toLocaleDateString('vi-VN')}`
                          : `🟢 ${set.learnedCards - set.dueCards}  •  🟠 ${set.dueCards}  •  ⚪ ${set.newCards}`}
                      </span>
                    </div>
                    <div className="w-full bg-paper-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isGrammar ? 'bg-purple-600 dark:bg-purple-500' : 'bg-success'
                        }`}
                        style={{
                          width: `${(set.learnedCards / Math.max(1, set.totalCards)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Bottom: Action Buttons */}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      onClick={() => navigate(`/flashcards/sets/${set.topicId}/${set.contentType.toLowerCase()}`)}
                      className="px-4 py-2.5 bg-paper-100 hover:bg-paper-200 text-sumi font-bold rounded-xl text-xs transition-colors border border-line flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>📋</span>
                      <span>Xem thẻ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate(`/flashcards/test/${set.topicId}/${set.contentType.toLowerCase()}`)}
                      className="px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-colors border border-indigo-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>📝</span>
                      <span>Kiểm tra</span>
                    </button>

                    {hasDue ? (
                      <button
                        onClick={() => navigate(`/flashcards/study/${set.topicId}/${set.contentType.toLowerCase()}`)}
                        className="px-4 py-2.5 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>▶</span>
                        <span>Ôn tập ngay</span>
                      </button>
                    ) : isCompletedToday ? (
                      <button
                        onClick={() => navigate(`/flashcards/study/${set.topicId}/${set.contentType.toLowerCase()}?extraPractice=true`)}
                        className="px-4 py-2.5 bg-ai-soft hover:bg-ai-soft/80 text-ai font-bold rounded-xl text-xs transition-all border border-ai/30 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>↻</span>
                        <span>Ôn thêm tự do</span>
                      </button>
                    ) : set.learnedCards > 0 ? (
                      <button
                        onClick={() => navigate(`/flashcards/study/${set.topicId}/${set.contentType.toLowerCase()}`)}
                        className="px-4 py-2.5 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>▶</span>
                        <span>Tiếp tục ôn</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/flashcards/study/${set.topicId}/${set.contentType.toLowerCase()}`)}
                        className="px-4 py-2.5 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>▶</span>
                        <span>Bắt đầu học</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>

            {/* Thanh điều hướng phân trang (10 bộ thẻ / trang) */}
            {filteredSets.length > PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-paper-50 p-4 rounded-2xl border border-line shadow-xs">
                {/* Thông tin số lượng hiển thị */}
                <div className="text-xs text-sumi-muted font-medium">
                  Hiển thị <span className="font-bold text-sumi">{(currentPage - 1) * PAGE_SIZE + 1}</span> – <span className="font-bold text-sumi">{Math.min(currentPage * PAGE_SIZE, filteredSets.length)}</span> trên tổng số <span className="font-bold text-sumi">{filteredSets.length}</span> bộ thẻ (Trang {currentPage}/{totalPages})
                </div>

                {/* Nút bấm chuyển trang */}
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button
                    onClick={() => {
                      setCurrentPage((prev) => Math.max(1, prev - 1));
                      window.scrollTo({ top: 380, behavior: 'smooth' });
                    }}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-line bg-paper-100 hover:bg-paper-200 text-sumi disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>◀</span>
                    <span>Trước</span>
                  </button>

                  {/* Danh sách các số trang */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    // Logic thu gọn số trang nếu tổng số trang > 7
                    if (
                      totalPages > 7 &&
                      pageNum !== 1 &&
                      pageNum !== totalPages &&
                      Math.abs(pageNum - currentPage) > 1
                    ) {
                      if (pageNum === 2 || pageNum === totalPages - 1) {
                        return (
                          <span key={'ellipsis-' + pageNum} className="px-1.5 text-sumi-faint text-xs select-none">
                            ...
                          </span>
                        );
                      }
                      return null;
                    }

                    const isActive = pageNum === currentPage;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => {
                          setCurrentPage(pageNum);
                          window.scrollTo({ top: 380, behavior: 'smooth' });
                        }}
                        className={'w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ' + (
                          isActive
                            ? 'bg-ai text-on-ai shadow-xs'
                            : 'bg-paper-100 hover:bg-paper-200 text-sumi border border-line'
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => {
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                      window.scrollTo({ top: 380, behavior: 'smooth' });
                    }}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-line bg-paper-100 hover:bg-paper-200 text-sumi disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>Sau</span>
                    <span>▶</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ==================== MODAL CHỌN CHẾ ĐỘ ÔN THẺ ĐẾN HẠN ==================== */}
      {isDueModalOpen &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsDueModalOpen(false);
            }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-paper-50 rounded-3xl border border-line max-w-md w-full shadow-2xl p-6 space-y-5 my-auto"
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔥</span>
                  <div>
                    <h3 className="text-base font-black text-sumi">
                      Ôn tập tất cả thẻ đến hạn
                    </h3>
                    <p className="text-xs text-sumi-muted">
                      Tổng cộng {totalDueToday} thẻ đã đến hạn cần ôn lại hôm nay
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDueModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-paper-100 hover:bg-paper-200 text-sumi-muted hover:text-sumi font-bold flex items-center justify-center transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-sumi-muted">
                  Chọn chế độ ôn tập bạn muốn bắt đầu:
                </p>

                {/* Chế độ 1: Từ vựng */}
                <button
                  onClick={() => {
                    setIsDueModalOpen(false);
                    navigate('/flashcards/study/due/vocabulary');
                  }}
                  disabled={!quota || (quota.dueVocabularyCount ?? 0) === 0}
                  className="w-full p-4 rounded-2xl border border-line bg-ai-soft/30 hover:bg-ai-soft/60 transition-all text-left flex items-center justify-between group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📘</span>
                    <div>
                      <div className="text-sm font-black text-sumi group-hover:text-ai">
                        Chỉ ôn Từ vựng
                      </div>
                      <div className="text-xs text-sumi-muted">
                        Tập trung rèn luyện trí nhớ từ mới
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-ai-soft text-ai border border-ai/30">
                    {quota?.dueVocabularyCount ?? 0} thẻ
                  </span>
                </button>

                {/* Chế độ 2: Ngữ pháp */}
                <button
                  onClick={() => {
                    setIsDueModalOpen(false);
                    navigate('/flashcards/study/due/grammar');
                  }}
                  disabled={!quota || (quota.dueGrammarCount ?? 0) === 0}
                  className="w-full p-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 transition-all text-left flex items-center justify-between group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🧩</span>
                    <div>
                      <div className="text-sm font-black text-sumi group-hover:text-purple-400">
                        Chỉ ôn Ngữ pháp
                      </div>
                      <div className="text-xs text-sumi-muted">
                        Ôn tập các mẫu câu và ngữ pháp
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-purple-500/20 text-purple-700 dark:text-purple-300">
                    {quota?.dueGrammarCount ?? 0} thẻ
                  </span>
                </button>

                {/* Chế độ 3: Hỗn hợp */}
                <button
                  onClick={() => {
                    setIsDueModalOpen(false);
                    navigate('/flashcards/study/due/mixed');
                  }}
                  disabled={totalDueToday === 0}
                  className="w-full p-4 rounded-2xl border-2 border-warning/40 bg-warning-soft/30 hover:bg-warning-soft/60 transition-all text-left flex items-center justify-between group cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <div className="text-sm font-black text-sumi flex items-center gap-1.5">
                        <span>Hỗn hợp (Toàn bộ)</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-warning-soft text-warning border border-warning/30">
                          Khuyên dùng
                        </span>
                      </div>
                      <div className="text-xs text-sumi-muted">
                        Gom cả Từ vựng và Ngữ pháp vào cùng một phiên
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-xl text-xs font-black bg-warning text-white shadow-2xs">
                    {totalDueToday} thẻ
                  </span>
                </button>
              </div>

              <div className="pt-2 border-t border-line flex justify-end">
                <button
                  onClick={() => setIsDueModalOpen(false)}
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
