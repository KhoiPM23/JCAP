import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { flashcardService } from '../../services/flashcardService';
import type { FlashcardQuota, FlashcardSetSummary, FlashcardContentType } from '../../types/flashcard';

export const FlashcardSetsView: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [quota, setQuota] = useState<FlashcardQuota | null>(null);
  const [sets, setSets] = useState<FlashcardSetSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<'sets' | 'bookmarks' | 'history'>('sets');
  const [typeFilter, setTypeFilter] = useState<'All' | FlashcardContentType>('All');
  const [jlptFilter, setJlptFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // Tổng số thẻ đến hạn hôm nay trong tất cả bộ
  const totalDueToday = useMemo(() => {
    return safeSets.reduce((acc, curr) => acc + (curr?.dueCards || 0), 0);
  }, [safeSets]);

  return (
    <div className="min-h-screen bg-[#F4F9FE] py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ==================== 1. PAGE HEADER ==================== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🗂️</span>
              <h1 className="text-2xl sm:text-3xl font-black text-[#071A44] tracking-tight">
                Flashcard
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Ôn tập ngắt quãng (SRS SM-2) theo các chủ đề N5 – N3 và danh sách đánh dấu cá nhân
            </p>
          </div>

          {/* Công cụ giả lập kiểm thử SRS */}
          <div className="flex items-center flex-wrap gap-2 bg-white/90 p-1.5 rounded-2xl border border-slate-200 shadow-xs self-start sm:self-auto">
            <span className="text-xs font-bold text-slate-500 px-2 flex items-center gap-1">
              <span>🧪</span>
              <span className="hidden md:inline">Test SRS:</span>
            </span>
            <button
              onClick={() => handleSimulateDays(1)}
              disabled={simulating}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Lùi thời gian tiến độ của thẻ 1 ngày để kích hoạt các thẻ hẹn 1 ngày (hoặc Again) đến hạn ôn tập"
            >
              <span>⏩</span>
              <span>{simulating ? 'Đang tua...' : 'Giả lập qua 1 ngày'}</span>
            </button>
            <button
              onClick={() => handleSimulateDays(3)}
              disabled={simulating}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Lùi thời gian tiến độ của thẻ 3 ngày để kiểm tra các thẻ hẹn 3 ngày đến hạn ôn tập"
            >
              <span>⏩</span>
              <span>{simulating ? 'Đang tua...' : 'Giả lập qua 3 ngày'}</span>
            </button>
          </div>
        </div>

        {/* Toast thông báo lỗi / thành công */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600 font-bold ml-4 cursor-pointer">✕</button>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>✅ {successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-4 cursor-pointer">✕</button>
          </div>
        )}

        {/* ==================== 2. SUB-NAVIGATION TABS ==================== */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          {/* Tab 1: Bộ thẻ theo chủ đề (Active) */}
          <button
            onClick={() => setActiveTab('sets')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'sets'
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🗂️</span>
            <span>Bộ thẻ theo Chủ đề ({safeSets.length})</span>
          </button>

          {/* Tab 2: Bookmark (Đang bảo lưu để làm bước kế tiếp) */}
          <div className="relative group">
            <button
              disabled
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-400 border border-slate-200 flex items-center gap-2 cursor-not-allowed opacity-75"
              title="Tính năng Bookmark đang được phát triển ở bước tiếp theo"
            >
              <span>🔖</span>
              <span>Đã lưu (Bookmark)</span>
              <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md ml-1">
                Sắp ra mắt
              </span>
            </button>
          </div>

          {/* Tab 3: Lịch sử ôn tập */}
          <Link
            to="/flashcards/history"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-2"
          >
            <span>🕒</span>
            <span>Lịch sử ôn tập</span>
          </Link>
        </div>

        {/* ==================== 3. DAILY QUOTA & DUE REMINDER BANNER ==================== */}
        {quota ? (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Cột 1: Nhắc thẻ đến hạn */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-2xl shadow-xs border border-blue-100">
                🔥
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-blue-950">
                  {totalDueToday > 0
                    ? `Hôm nay bạn có ${totalDueToday} thẻ đến hạn cần ôn lại!`
                    : 'Tuyệt vời! Bạn đã hoàn thành hết thẻ đến hạn hôm nay!'}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Thẻ ôn lại luôn hoàn toàn miễn phí và không tính vào hạn mức thẻ mới.
                </p>
              </div>
            </div>

            {/* Cột 2: Thanh tiến độ hạn mức thẻ mới */}
            <div className="border-t md:border-t-0 md:border-l border-blue-200/80 pt-4 md:pt-0 md:pl-6 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                <span>HẠN MỨC THẺ MỚI HÔM NAY</span>
                <span className="text-[#2563EB]">
                  Đã học {quota.studiedNewCardsToday} / {quota.totalAllowedNewCardsToday} thẻ
                </span>
              </div>
              <div className="w-full bg-white h-2.5 rounded-full overflow-hidden border border-blue-100">
                <div
                  className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      (quota.studiedNewCardsToday / Math.max(1, quota.totalAllowedNewCardsToday)) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                Còn <span className="font-bold text-blue-700">{quota.remainingNewCardsToday} thẻ mới</span> miễn phí hôm nay
              </div>
            </div>

            {/* Cột 3: Nút Mở thêm thẻ mới bằng Credit thực sự */}
            <div className="border-t md:border-t-0 md:border-l border-blue-200/80 pt-4 md:pt-0 md:pl-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-left w-full sm:w-auto">
                <div className="text-xs text-slate-500">Số dư hiện có:</div>
                <div className="text-sm font-extrabold text-amber-700 flex items-center gap-1">
                  🪙 {quota.userCreditBalance} Credits
                </div>
              </div>
              <button
                onClick={handleUnlockExtra}
                disabled={unlocking}
                className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-blue-50 border border-blue-300 text-[#1D4ED8] rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <span>{unlocking ? 'Đang mở...' : '+ Mở thêm 10 thẻ mới'}</span>
                <span className="text-amber-600 font-extrabold">({quota.unlockCreditCost} Credits)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 flex items-center gap-2">
            <span className="text-base">ℹ️</span>
            <span>Đang kết nối hạn mức thẻ từ máy chủ backend...</span>
          </div>
        )}

        {/* ==================== 4. FILTER & SEARCH BAR ==================== */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
            {/* Filter Loại Bộ Thẻ */}
            <div className="flex items-center gap-1.5">
              <span>LOẠI:</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {(['All', 'Vocabulary', 'Grammar'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      typeFilter === t
                        ? 'bg-[#071A44] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
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
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {['All', 'N5', 'N4', 'N3'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setJlptFilter(lvl)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      jlptFilter === lvl
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
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
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm chủ đề bộ thẻ..."
              className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* ==================== 5. FLASHCARD SETS GRID ==================== */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-[#2563EB] rounded-full animate-spin" />
            <p className="text-sm font-medium">Đang tải danh sách bộ thẻ từ máy chủ...</p>
          </div>
        ) : filteredSets.length === 0 ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
              <div className="text-4xl">🗂️</div>
              <h3 className="text-base font-bold text-slate-800">
                Chưa có bộ thẻ Flashcard nào trong hệ thống
              </h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
                Hiện tại cơ sở dữ liệu chưa có danh mục Từ vựng hoặc Ngữ pháp độc lập nào được nạp vào. Khi quản trị viên nhập liệu hoặc import danh mục học tập (UC-33 → UC-51), các bộ thẻ chính thức sẽ tự động hiển thị tại đây.
              </p>
            </div>

            {/* Khối trải nghiệm Sandbox Demo */}
            <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 border border-blue-200/80 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧪</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-[#071A44]">
                        Bộ thẻ mẫu trải nghiệm (Sandbox Mode)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
                        KHÔNG LƯU DB
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Trải nghiệm ngay luồng học thẻ 3D, nghe audio TTS, đánh giá ngắt quãng SRS và xem màn hình tổng kết trên RAM.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2 thẻ mẫu: Từ vựng & Ngữ pháp */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Demo Từ vựng */}
                <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                          N5
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          📘 Từ vựng
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ✨ 5 thẻ mẫu
                      </span>
                    </div>

                    <h5 className="text-base font-black text-[#071A44] mt-3">
                      Từ vựng N5 – Chào hỏi & Giao tiếp cơ bản
                    </h5>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      Bộ thẻ mẫu 5 từ vựng nền tảng (こんにちは, ありがとう, すみません...) giúp bạn kiểm tra trọn vẹn flow học thẻ.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>Tiến độ mẫu: 0 / 5 thẻ (0%)</span>
                      <span className="text-[11px] text-slate-400">⚪ 5 thẻ mới</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full w-0" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => navigate('/flashcards/sets/demo/vocabulary')}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>📋</span>
                      <span>Xem thẻ</span>
                    </button>
                    <button
                      onClick={() => navigate('/flashcards/study/demo/vocabulary')}
                      className="px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>▶</span>
                      <span>Học thử</span>
                    </button>
                  </div>
                </div>

                {/* 2. Demo Ngữ pháp */}
                <div className="bg-white rounded-xl border border-purple-100 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                          N5
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          🧩 Ngữ pháp
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        ✨ 4 thẻ mẫu
                      </span>
                    </div>

                    <h5 className="text-base font-black text-[#071A44] mt-3">
                      Ngữ pháp N5 – Mẫu câu danh từ cơ bản
                    </h5>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      Bộ thẻ mẫu 4 mẫu câu khẳng định, phủ định và câu hỏi (〜は〜です, 〜ではありません...) để kiểm tra giao diện thẻ ngữ pháp.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>Tiến độ mẫu: 0 / 4 thẻ (0%)</span>
                      <span className="text-[11px] text-slate-400">⚪ 4 thẻ mới</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 rounded-full w-0" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => navigate('/flashcards/sets/demo/grammar')}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>📋</span>
                      <span>Xem thẻ</span>
                    </button>
                    <button
                      onClick={() => navigate('/flashcards/study/demo/grammar')}
                      className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
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

              return (
                <div
                  key={`${set.topicId}_${set.contentType}`}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-5"
                >
                  {/* Top: Badges & Status */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* JLPT Badge */}
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                          {set.jlptLevel}
                        </span>

                        {/* ContentType Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                            isGrammar
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isGrammar ? '🧩 Ngữ pháp' : '📘 Từ vựng'}
                        </span>
                      </div>

                      {/* State Badge */}
                      {hasDue && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                          🔥 {set.dueCards} thẻ đến hạn
                        </span>
                      )}
                      {isCompletedToday && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✅ Hoàn thành hôm nay
                        </span>
                      )}
                      {isBrandNew && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          ✨ Chưa học
                        </span>
                      )}
                    </div>

                    {/* Set Title & Description */}
                    <h2 className="text-lg font-black text-[#071A44] mt-3">
                      {set.setTitle}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {set.topicDescription || 'Bộ thẻ tự học hỗ trợ rèn luyện trí nhớ ngắt quãng theo chủ đề.'}
                    </p>
                  </div>

                  {/* Middle: Progress Bar */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>Tiến độ đã học: {set.learnedCards} / {set.totalCards} thẻ ({Math.round((set.learnedCards / Math.max(1, set.totalCards)) * 100)}%)</span>
                      <span className="text-[11px] text-slate-400">
                        {isCompletedToday && set.nextDueAt
                          ? `Đến hạn kế tiếp: ${new Date(set.nextDueAt).toLocaleDateString('vi-VN')}`
                          : `🟢 ${set.learnedCards - set.dueCards}  •  🟠 ${set.dueCards}  •  ⚪ ${set.newCards}`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isGrammar ? 'bg-purple-600' : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${(set.learnedCards / Math.max(1, set.totalCards)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Bottom: Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => navigate(`/flashcards/sets/${set.topicId}/${set.contentType.toLowerCase()}`)}
                      className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>📋</span>
                      <span>Xem danh sách thẻ</span>
                    </button>

                    {hasDue ? (
                      <button
                        onClick={() => navigate(`/flashcards/study/${set.topicId}/${set.contentType.toLowerCase()}`)}
                        className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>▶</span>
                        <span>Ôn tập ngay</span>
                      </button>
                    ) : isCompletedToday ? (
                      <button
                        onClick={() => navigate(`/flashcards/study/${set.topicId}/${set.contentType.toLowerCase()}?extraPractice=true`)}
                        className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs transition-all border border-blue-200 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>↻</span>
                        <span>Ôn thêm tự do</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/flashcards/study/${set.topicId}/${set.contentType.toLowerCase()}`)}
                        className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                {/* Thông tin số lượng hiển thị */}
                <div className="text-xs text-slate-500 font-medium">
                  Hiển thị <span className="font-bold text-slate-800">{(currentPage - 1) * PAGE_SIZE + 1}</span> – <span className="font-bold text-slate-800">{Math.min(currentPage * PAGE_SIZE, filteredSets.length)}</span> trên tổng số <span className="font-bold text-slate-800">{filteredSets.length}</span> bộ thẻ (Trang {currentPage}/{totalPages})
                </div>

                {/* Nút bấm chuyển trang */}
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button
                    onClick={() => {
                      setCurrentPage((prev) => Math.max(1, prev - 1));
                      window.scrollTo({ top: 380, behavior: 'smooth' });
                    }}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1"
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
                          <span key={'ellipsis-' + pageNum} className="px-1.5 text-slate-400 text-xs select-none">
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
                            ? 'bg-[#2563EB] text-white shadow-xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
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
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>Sau</span>
                    <span>▶</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
