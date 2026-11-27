import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { roleplayResultService } from '../services/roleplayResultService';
import { roleplayService } from '../services/roleplayService';
import type { LearnerIntelligenceProfileDto } from '../types/roleplay';
import { formatDateMedium } from '../utils/dateUtils';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import { ResultHankoStamp } from '../components/common/ResultHankoStamp';
import type {
  RoleplayResultHistoryResponse,
  RoleplayResultSummary,
} from '../types/roleplayResult';

type ResultFilter = 'all' | 'passed' | 'not-passed';
type JlptFilter = 'all' | 'N5' | 'N4' | 'N3';

const PAGE_SIZE = 8;

const formatDate = (value: string) => formatDateMedium(value);

const getScoreRank = (score: number) => {
  if (score >= 90) return { title: 'Xuất sắc', badgeClass: 'bg-amber-100 text-amber-900 border-amber-300' };
  if (score >= 80) return { title: 'Thành thạo', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
  if (score >= 70) return { title: 'Khá tốt', badgeClass: 'bg-sky-100 text-sky-900 border-sky-300' };
  if (score >= 60) return { title: 'Đạt chuẩn', badgeClass: 'bg-blue-100 text-blue-900 border-blue-200' };
  return { title: 'Chưa đạt', badgeClass: 'bg-rose-100 text-rose-900 border-rose-300' };
};

const getScenarioCrest = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes('giúp') || t.includes('cụ già') || t.includes('băng qua')) return { topicLabel: 'Hỗ trợ', theme: 'border-teal-600/40 bg-teal-50/80 text-teal-900' };
  if (t.includes('baito') || t.includes('phỏng vấn') || t.includes('công sở') || t.includes('làm thêm')) return { topicLabel: 'Công sở', theme: 'border-indigo-600/40 bg-indigo-50/80 text-indigo-900' };
  if (t.includes('ramen') || t.includes('cà phê') || t.includes('quán ăn') || t.includes('món ăn') || t.includes('gọi món') || t.includes('đặt món') || /\b(?:mì|uống)\b/i.test(t)) return { topicLabel: 'Ẩm thực', theme: 'border-amber-600/40 bg-amber-50/80 text-amber-900' };
  if (t.includes('ga ') || t.includes('nhà ga') || t.includes('tàu') || t.includes('bay') || t.includes('vé') || t.includes('sân bay')) return { topicLabel: 'Di chuyển', theme: 'border-sky-600/40 bg-sky-50/80 text-sky-900' };
  if (t.includes('konbini') || t.includes('mua sắm') || t.includes('cửa hàng tiện lợi') || t.includes('siêu thị')) return { topicLabel: 'Đời sống', theme: 'border-emerald-600/40 bg-emerald-50/80 text-emerald-900' };
  if (t.includes('khách sạn') || t.includes('đặt phòng') || t.includes('nhận phòng')) return { topicLabel: 'Khách sạn', theme: 'border-indigo-600/40 bg-indigo-50/80 text-indigo-900' };
  if (t.includes('hỏi đường') || t.includes('chỉ đường')) return { topicLabel: 'Chỉ đường', theme: 'border-teal-600/40 bg-teal-50/80 text-teal-900' };
  if (t.includes('bệnh') || t.includes('thuốc') || t.includes('khám')) return { topicLabel: 'Y tế', theme: 'border-rose-600/40 bg-rose-50/80 text-rose-900' };
  return { topicLabel: 'Hội thoại', theme: 'border-blue-600/40 bg-blue-50/80 text-blue-900' };
};

const ResultRow = React.memo(({ result }: { result: RoleplayResultSummary }) => {
  const rank = getScoreRank(result.overallScore);
  const crest = getScenarioCrest(result.scenarioTitle);

  return (
    <article className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-stone-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-[var(--ai)]/50 hover:shadow-md">
      {/* Nền gợn sóng Seigaiha mờ khi di chuột */}
      <div className="absolute right-0 top-0 bottom-0 w-48 opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity duration-500 bg-[radial-gradient(circle_at_center,var(--ai)_2px,transparent_3px)] bg-[size:16px_16px]" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Cụm huy hiệu kịch bản & Thông tin - Căn giữa hoàn hảo */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Biểu trưng trình độ & chủ đề */}
          <div
            className={`w-16 h-14 sm:w-[72px] sm:h-16 my-auto rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 shadow-2xs font-sans select-none px-1 ${crest.theme}`}
            title={`Chủ đề ${crest.topicLabel} · ${result.jlptLevel}`}
          >
            <span className="text-lg sm:text-xl font-black font-mono leading-none">{result.jlptLevel}</span>
            <span className="text-[9px] font-sans font-bold uppercase tracking-tight opacity-85 mt-1 truncate max-w-full text-center">
              {crest.topicLabel}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border font-sans ${rank.badgeClass}`}>
                {rank.title}
              </span>

              <span className="text-[11px] text-slate-400 font-medium">
                Hoàn thành {formatDate(result.completedAt)}
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-bold font-sans text-slate-900 group-hover:text-[var(--ai)] transition-colors line-clamp-1">
              {result.scenarioTitle}
            </h2>

            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
              <span>Phiên đối thoại #{result.roleplaySessionId}</span>
            </div>
          </div>
        </div>

        {/* Cụm Dấu Triện Hanko & Điểm số - Căn giữa trục tâm đồng nhất */}
        <div className="jx-result-card-actions flex items-center justify-between md:justify-end gap-3 sm:gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-stone-100 self-center">
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Dấu Triện Hanko (Passed / Failed Ink Seal) - Đồng bộ chuẩn Wabi-Sabi */}
            <ResultHankoStamp passed={result.passStatus} size="sm" />

            {/* Điểm số đồng trục */}
            <div className="flex flex-col justify-center text-right">
              <div className="flex items-baseline justify-end gap-0.5 leading-none">
                <strong className="text-3xl sm:text-4xl font-black font-sans tracking-tight text-slate-900 font-mono leading-none">
                  {result.overallScore}
                </strong>
                <span className="text-xs font-semibold text-slate-400 leading-none">/100</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-1">
                Tổng kết
              </span>
            </div>
          </div>

          <Link
            to={`/roleplay/results/${result.id}`}
            onClick={() => ukiyoSound.playSubtleTap()}
            className="inline-flex h-10 sm:h-11 items-center justify-center rounded-xl bg-[var(--ai)] px-4 sm:px-5 text-xs sm:text-sm font-bold text-white shadow-xs transition-all hover:bg-[var(--ai-hover)] hover:shadow-sm active:scale-95 cursor-pointer shrink-0"
          >
            <span>Xem kết quả</span>
            <span aria-hidden="true" className="ml-1.5 transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
});

ResultRow.displayName = 'ResultRow';

export const ConversationHistoryView: React.FC = () => {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [jlptFilter, setJlptFilter] = useState<JlptFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState<RoleplayResultHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LearnerIntelligenceProfileDto | null>(null);

  const filteredItems = useMemo(() => {
    const items = history?.items ?? [];
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (jlptFilter !== 'all' && item.jlptLevel?.toUpperCase() !== jlptFilter) {
        return false;
      }
      if (normalizedQuery) {
        const matchTitle = item.scenarioTitle?.toLowerCase().includes(normalizedQuery);
        const matchSession = `#${item.roleplaySessionId}`.includes(normalizedQuery) || String(item.roleplaySessionId).includes(normalizedQuery);
        const matchJlpt = item.jlptLevel?.toLowerCase().includes(normalizedQuery);
        return Boolean(matchTitle || matchSession || matchJlpt);
      }
      return true;
    });
  }, [history?.items, jlptFilter, searchQuery]);

  const hasClientFilters = jlptFilter !== 'all' || searchQuery.trim().length > 0;

  useEffect(() => {
    let isCurrent = true;
    void roleplayService.getIntelligenceProfile().then((res) => {
      if (isCurrent && res.success && res.data) {
        setProfile(res.data);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const passStatus = filter === 'all' ? undefined : filter === 'passed';

    const loadHistory = async () => {
      setIsLoading(true);
      setError(null);
      const response = await roleplayResultService.getHistory(page, PAGE_SIZE, passStatus);

      if (!isCurrent) return;
      if (!response.success || !response.data) {
        setHistory(null);
        setError(response.message || 'Không thể tải lịch sử luyện tập.');
      } else {
        setHistory(response.data);
      }
      setIsLoading(false);
    };

    void loadHistory();
    return () => {
      isCurrent = false;
    };
  }, [filter, page]);

  const changeFilter = (nextFilter: ResultFilter) => {
    ukiyoSound.playSubtleTap();
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="jx-touch-page relative bg-transparent text-slate-800 pb-6">
      <section className="mx-auto w-full max-w-5xl pb-6">
        {/* BANNER CHIẾN TÍCH ĐỐI THOẠI (RPG CHRONICLE HEADER) */}
        <header className="relative mb-8 overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#1E3A8A] px-7 py-9 text-white shadow-xl md:px-10 border border-slate-700/50">
          {/* Lớp nền sóng Seigaiha Nhật Bản */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#38BDF8_2px,transparent_3px)] bg-[size:24px_24px] pointer-events-none" />
          
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full border-[36px] border-sky-400/10 pointer-events-none" />
          <div className="absolute bottom-0 right-32 h-32 w-32 translate-y-1/2 rotate-12 rounded-3xl bg-indigo-500/15 pointer-events-none" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300 font-mono">
                  Nhật ký luyện tập
                </span>
              </div>

              <h1 className="text-3xl font-black font-sans tracking-tight md:text-4xl text-white">
                Lịch sử hội thoại
              </h1>

              <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-slate-300">
                Lưu trữ các phiên hội thoại đã hoàn thành để xem lại điểm số, nhận xét và điểm cần cải thiện.
              </p>
            </div>
          </div>
        </header>

        {/* TÓM TẮT 4 CHỈ SỐ NĂNG LỰC CHÍNH */}
        {profile && (
          <div className="mb-7 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-indigo-400 hover:shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Phiên hoàn thành
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 block font-mono">
                {profile.totalSessionsCompleted}
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                {profile.totalPracticeTurns} lượt đối thoại
              </span>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-sky-400 hover:shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Điểm phản xạ
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-[var(--ai)] mt-1 block font-mono">
                {Math.round(profile.speakingReflexIndex)}
                <span className="text-xs font-semibold text-slate-400 ml-0.5">/100</span>
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                Độ phản xạ tự nhiên
              </span>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Chuẩn trợ từ
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-emerald-700 mt-1 block font-mono">
                {Math.round(profile.particleAccuracyRate)}%
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                Vững は / が / を / に / で
              </span>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-indigo-400 hover:shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Vững kính ngữ
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-indigo-800 mt-1 block font-mono">
                {Math.round(profile.keigoCommandScore)}%
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                Thể lịch sự và kính ngữ
              </span>
            </div>
          </div>
        )}

        {/* BỘ LỌC KẾT QUẢ */}
        <div className="mb-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold font-sans text-slate-900 flex items-center gap-2">
                <span>Danh sách kết quả</span>
                {history && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold font-mono">
                    {hasClientFilters ? `${filteredItems.length}/${history.items.length}` : history.totalCount}
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Chọn một phiên hội thoại để xem chi tiết đánh giá và nhận xét từ AI.
              </p>
            </div>

            <div className="inline-flex w-fit rounded-2xl border border-stone-200 bg-white p-1 shadow-2xs">
              {([
                ['all', 'Tất cả'],
                ['passed', 'Đạt chuẩn'],
                ['not-passed', 'Chưa đạt'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeFilter(value)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                    filter === value
                      ? 'bg-[var(--ai)] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tình huống hoặc #phiên..."
                aria-label="Tìm tình huống hoặc mã phiên"
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-[var(--ai)] focus:outline-none shadow-2xs"
              />
            </div>

            <div className="jx-mobile-wrap inline-flex w-fit items-center gap-1 rounded-2xl border border-stone-200 bg-white p-1 shadow-2xs">
              {(['all', 'N5', 'N4', 'N3'] as const).map((lv) => (
                <button
                  key={lv}
                  type="button"
                  aria-pressed={jlptFilter === lv}
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    setJlptFilter(lv);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    jlptFilter === lv
                      ? 'bg-[var(--ai)] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'
                  }`}
                >
                  {lv === 'all' ? 'Tất cả JLPT' : lv}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* DANH SÁCH CUỘN THƯ KẾT QUẢ */}
        {isLoading ? (
          <div className="space-y-3.5" aria-label="Đang nạp biên bản chiến tích">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-3xl bg-white border border-stone-200/60 shadow-2xs" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-800">
            {error}
          </div>
        ) : history && filteredItems.length > 0 ? (
          <div className="space-y-3.5">
            {filteredItems.map((result) => (
              <ResultRow key={result.id} result={result} />
            ))}
          </div>
        ) : history && history.items.length > 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center shadow-xs">
            <h2 className="text-base font-bold text-slate-900 font-sans">Không tìm thấy phiên phù hợp bộ lọc hiện tại</h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Thử đổi từ khóa tìm kiếm hoặc cấp độ JLPT để xem các phiên đối thoại trong trang này.
            </p>
            <button
              type="button"
              onClick={() => {
                ukiyoSound.playSubtleTap();
                setSearchQuery('');
                setJlptFilter('all');
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] px-4 py-2 text-xs font-bold text-white transition shadow-xs cursor-pointer"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div className="rounded-[32px] border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-xs">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ai-soft)] border border-[var(--ai)]/20 text-[var(--ai)] shadow-2xs">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-sans">Chưa có kết quả trong danh mục này</h2>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              Hoàn thành các tình huống hội thoại cùng nhân vật AI để lưu lại kết quả tại đây.
            </p>
            <Link
              to="/scenarios"
              onClick={() => ukiyoSound.playSubtleTap()}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[var(--ai)] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[var(--ai-hover)] shadow-xs"
            >
              <span>Vào thư viện tình huống</span>
              <span>→</span>
            </Link>
          </div>
        )}

        {/* PHÂN TRANG CHIẾN TÍCH */}
        {history && history.totalPages > 1 ? (
          <nav className="mt-8 flex items-center justify-between" aria-label="Phân trang kết quả">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                ukiyoSound.playSubtleTap();
                setPage((current) => Math.max(1, current - 1));
              }}
              className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-stone-50 transition cursor-pointer shadow-2xs"
            >
              ← Trang trước
            </button>
            <span className="text-xs font-semibold text-slate-500 font-mono">
              Trang {history.page} / {history.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= history.totalPages}
              onClick={() => {
                ukiyoSound.playSubtleTap();
                setPage((current) => current + 1);
              }}
              className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-stone-50 transition cursor-pointer shadow-2xs"
            >
              Trang sau →
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
};
