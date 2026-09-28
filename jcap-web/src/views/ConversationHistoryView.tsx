import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { roleplayResultService } from '../services/roleplayResultService';
import type {
  RoleplayResultHistoryResponse,
  RoleplayResultSummary,
} from '../types/roleplayResult';

type ResultFilter = 'all' | 'passed' | 'not-passed';

const PAGE_SIZE = 8;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const ResultRow = React.memo(({ result }: { result: RoleplayResultSummary }) => (
  <article className="group grid gap-5 rounded-2xl border border-[#DCE7F4] bg-white p-5 shadow-[0_10px_30px_rgba(7,26,68,0.05)] transition hover:-translate-y-0.5 hover:border-[#9EC8F7] hover:shadow-[0_18px_42px_rgba(7,26,68,0.09)] md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#EAF4FF] px-2.5 py-1 text-xs font-bold text-[#0878EE]">
          JLPT {result.jlptLevel}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            result.passStatus
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-orange-50 text-orange-700'
          }`}
        >
          {result.passStatus ? 'Đạt' : 'Chưa đạt'}
        </span>
      </div>
      <h2 className="truncate text-lg font-bold text-[#071A44]">{result.scenarioTitle}</h2>
      <p className="mt-1 text-sm text-[#71809A]">Hoàn thành {formatDate(result.completedAt)}</p>
    </div>

    <div className="flex items-baseline gap-1 md:justify-center">
      <strong className="text-3xl font-black tracking-tight text-[#071A44]">
        {result.overallScore}
      </strong>
      <span className="text-sm font-semibold text-[#8B9BB4]">/100</span>
    </div>

    <Link
      to={`/roleplay/results/${result.id}`}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-[#071A44] px-4 text-sm font-bold text-white transition group-hover:bg-[#0878EE] focus:outline-none focus:ring-2 focus:ring-[#0878EE] focus:ring-offset-2"
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
    <section className="mx-auto w-full max-w-5xl pb-10">
      <header className="relative mb-8 overflow-hidden rounded-[28px] bg-[#071A44] px-7 py-8 text-white shadow-[0_22px_55px_rgba(7,26,68,0.18)] md:px-10">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-white/5" />
        <div className="absolute bottom-0 right-28 h-24 w-24 translate-y-1/2 rotate-12 rounded-3xl bg-[#0878EE]/25" />
        <div className="relative max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#7FC2FF]">
            UC-20 · Lịch sử hội thoại
          </p>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Hành trình Kaiwa của bạn</h1>
          <p className="mt-3 text-sm leading-6 text-blue-100">
            Xem lại kết quả từng tình huống, theo dõi điểm số và mở phần nhận xét để biết
            điều nên cải thiện trong lần luyện tiếp theo.
          </p>
        </div>
      </header>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#071A44]">Các phiên đã hoàn thành</h2>
          <p className="mt-1 text-sm text-[#71809A]">
            {history ? `${history.totalCount} kết quả phù hợp` : 'Đang tổng hợp kết quả'}
          </p>
        </div>

        <div className="inline-flex w-fit rounded-xl border border-[#DCE7F4] bg-white p-1 shadow-sm">
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
                  ? 'bg-[#0878EE] text-white shadow-sm'
                  : 'text-[#71809A] hover:bg-[#F4F9FE] hover:text-[#071A44]'
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
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-white shadow-sm" />
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
        <div className="rounded-[28px] border border-dashed border-[#B9CBE0] bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF4FF] text-2xl">
            会
          </div>
          <h2 className="text-xl font-bold text-[#071A44]">Chưa có kết quả phù hợp</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#71809A]">
            Hoàn thành một phiên luyện hội thoại để kết quả và nhận xét xuất hiện tại đây.
          </p>
          <Link
            to="/scenarios"
            className="mt-6 inline-flex rounded-xl bg-[#0878EE] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-600"
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
            className="rounded-xl border border-[#DCE7F4] bg-white px-4 py-2 text-sm font-bold text-[#071A44] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Trang trước
          </button>
          <span className="text-sm font-semibold text-[#71809A]">
            Trang {history.page}/{history.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= history.totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-xl border border-[#DCE7F4] bg-white px-4 py-2 text-sm font-bold text-[#071A44] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Trang sau →
          </button>
        </nav>
      ) : null}
    </section>
  );
};
