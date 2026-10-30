import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { roleplayResultService } from '../services/roleplayResultService';
import { roleplayService } from '../services/roleplayService';
import type { LearnerIntelligenceProfileDto } from '../types/roleplay';
import { formatDateMedium } from '../utils/dateUtils';
import type {
  RoleplayResultHistoryResponse,
  RoleplayResultSummary,
} from '../types/roleplayResult';

type ResultFilter = 'all' | 'passed' | 'not-passed';

const PAGE_SIZE = 8;

const formatDate = (value: string) => formatDateMedium(value);

const ResultRow = React.memo(({ result }: { result: RoleplayResultSummary }) => (
  <article className="group grid gap-5 rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--ai)] hover:shadow-md md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--ai-soft)] px-2.5 py-1 text-xs font-bold text-[var(--ai)]">
          JLPT {result.jlptLevel}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold font-sans ${
            result.passStatus
              ? 'border border-[var(--shu)]/30 bg-[var(--shu-soft)] text-[var(--shu)]'
              : 'border border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {result.passStatus ? '合格 ĐẠT' : '未達成 CHƯA ĐẠT'}
        </span>
      </div>
      <h2 className="truncate text-lg font-bold font-sans text-[var(--sumi)]">{result.scenarioTitle}</h2>
      <p className="mt-1 text-sm text-[var(--sumi-faint)]">Hoàn thành {formatDate(result.completedAt)}</p>
    </div>

    <div className="flex items-baseline gap-1 md:justify-center">
      <strong className="text-3xl font-black tracking-tight text-[var(--sumi)]">
        {result.overallScore}
      </strong>
      <span className="text-sm font-semibold text-[var(--sumi-faint)]">/100</span>
    </div>

    <Link
      to={`/roleplay/results/${result.id}`}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--ai)] px-4 text-sm font-bold text-[var(--on-ai)] transition hover:bg-[var(--ai-hover)] shadow-xs"
    >
      Xem chi tiết
      <span aria-hidden="true" className="ml-2">→</span>
    </Link>
  </article>
));

ResultRow.displayName = 'ResultRow';

export const ConversationHistoryView: React.FC = () => {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [history, setHistory] = useState<RoleplayResultHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LearnerIntelligenceProfileDto | null>(null);

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
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div data-theme="phong-luyen" className="min-h-screen bg-[var(--paper-100)] text-[var(--sumi)] px-4 py-8 md:px-8">
      <section className="mx-auto w-full max-w-5xl pb-10">
      <header className="relative mb-8 overflow-hidden rounded-[28px] bg-gradient-to-r from-[var(--ai)] to-[var(--ai-hover)] px-7 py-8 text-white shadow-md md:px-10">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-white/5" />
        <div className="absolute bottom-0 right-28 h-24 w-24 translate-y-1/2 rotate-12 rounded-3xl bg-[var(--ai)]/25" />
        <div className="relative max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#7FC2FF]">
            Lịch sử hội thoại
          </p>
          <h1 className="text-3xl font-black font-sans tracking-tight md:text-4xl">Hành trình Kaiwa của bạn</h1>
          <p className="mt-3 text-sm leading-6 text-blue-100">
            Xem lại kết quả từng tình huống, theo dõi điểm số và mở phần nhận xét để biết
            điều nên cải thiện trong lần luyện tiếp theo.
          </p>
        </div>
      </header>

      {/* Communicative Intelligence Growth Dashboard */}
      {profile && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] p-4 shadow-xs">
            <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider block">Phiên hoàn thành</span>
            <strong className="text-2xl font-black text-[var(--sumi)] mt-1 block">{profile.totalSessionsCompleted}</strong>
            <span className="text-[10px] text-slate-400 font-medium">({profile.totalPracticeTurns} lượt đối đáp)</span>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] p-4 shadow-xs">
            <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider block">⚡ Điểm phản xạ</span>
            <strong className="text-2xl font-black text-[var(--ai)] mt-1 block">{Math.round(profile.speakingReflexIndex)}/100</strong>
            <span className="text-[10px] text-slate-400 font-medium">Tốc độ cất lời trung bình</span>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] p-4 shadow-xs">
            <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider block">Chuẩn trợ từ</span>
            <strong className="text-2xl font-black text-emerald-700 mt-1 block">{Math.round(profile.particleAccuracyRate)}%</strong>
            <span className="text-[10px] text-slate-400 font-medium">Chính xác は/が/を/に/で</span>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] p-4 shadow-xs">
            <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider block">Vững kính ngữ</span>
            <strong className="text-2xl font-black text-indigo-700 mt-1 block">{Math.round(profile.keigoCommandScore)}%</strong>
            <span className="text-[10px] text-slate-400 font-medium">Làm chủ thể lịch sự</span>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--sumi)]">Các phiên đã hoàn thành</h2>
          <p className="mt-1 text-sm text-[var(--sumi-faint)]">
            {history ? `${history.totalCount} kết quả phù hợp` : 'Đang tổng hợp kết quả'}
          </p>
        </div>

        <div className="inline-flex w-fit rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-1 shadow-sm">
          {([
            ['all', 'Tất cả'],
            ['passed', 'Đạt'],
            ['not-passed', 'Chưa đạt'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => changeFilter(value)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                filter === value
                  ? 'bg-[var(--ai)] text-white shadow-sm'
                  : 'text-[var(--sumi-faint)] hover:bg-[var(--paper-100)] hover:text-[var(--sumi)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4" aria-label="Đang tải lịch sử">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-[var(--paper-50)] shadow-sm" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : history && history.items.length > 0 ? (
        <div className="space-y-4">
          {history.items.map((result) => (
            <ResultRow key={result.id} result={result} />
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-[var(--line)] bg-[var(--paper-50)] px-6 py-14 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ai-soft)] text-2xl">
            会
          </div>
          <h2 className="text-xl font-bold text-[var(--sumi)]">Chưa có kết quả phù hợp</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--sumi-faint)]">
            Hoàn thành một phiên luyện hội thoại để kết quả và nhận xét xuất hiện tại đây.
          </p>
          <Link
            to="/scenarios"
            className="mt-6 inline-flex rounded-xl bg-[var(--ai)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-600"
          >
            Chọn tình huống luyện tập
          </Link>
        </div>
      )}

      {history && history.totalPages > 1 ? (
        <nav className="mt-7 flex items-center justify-between" aria-label="Phân trang kết quả">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] px-4 py-2 text-sm font-bold text-[var(--sumi)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Trang trước
          </button>
          <span className="text-sm font-semibold text-[var(--sumi-faint)]">
            Trang {history.page}/{history.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= history.totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] px-4 py-2 text-sm font-bold text-[var(--sumi)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Trang sau →
          </button>
        </nav>
      ) : null}
      </section>
    </div>
  );
};
