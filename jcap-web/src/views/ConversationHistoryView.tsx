import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { roleplayResultService } from '../services/roleplayResultService';
import { roleplayService } from '../services/roleplayService';
import type { LearnerIntelligenceProfileDto } from '../types/roleplay';
import { formatDateMedium } from '../utils/dateUtils';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import type {
  RoleplayResultHistoryResponse,
  RoleplayResultSummary,
} from '../types/roleplayResult';

type ResultFilter = 'all' | 'passed' | 'not-passed';

const PAGE_SIZE = 8;

const formatDate = (value: string) => formatDateMedium(value);

const getScoreRank = (score: number) => {
  if (score >= 90) return { kanji: '極', title: 'Xuất sắc · Kiệt xuất', badgeClass: 'bg-amber-100 text-amber-900 border-amber-300' };
  if (score >= 80) return { kanji: '優', title: 'Ưu tú · Thành thạo', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
  if (score >= 70) return { kanji: '良', title: 'Khá tốt · Thông suốt', badgeClass: 'bg-sky-100 text-sky-900 border-sky-300' };
  if (score >= 60) return { kanji: '可', title: 'Đạt chuẩn · Vừa vặn', badgeClass: 'bg-blue-100 text-blue-900 border-blue-200' };
  return { kanji: '研', title: 'Cần rèn luyện thêm', badgeClass: 'bg-rose-100 text-rose-900 border-rose-300' };
};

const getScenarioCrest = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes('ramen') || t.includes('ăn') || t.includes('mì') || t.includes('món') || t.includes('quán')) return { kanji: '食', theme: 'border-amber-600/40 bg-amber-50/80 text-amber-900' };
  if (t.includes('ga') || t.includes('tàu') || t.includes('bay') || t.includes('vé') || t.includes('sân bay')) return { kanji: '駅', theme: 'border-sky-600/40 bg-sky-50/80 text-sky-900' };
  if (t.includes('konbini') || t.includes('mua') || t.includes('chợ') || t.includes('tiện lợi') || t.includes('hàng')) return { kanji: '店', theme: 'border-emerald-600/40 bg-emerald-50/80 text-emerald-900' };
  if (t.includes('khách sạn') || t.includes('phòng') || t.includes('nhận')) return { kanji: '宿', theme: 'border-indigo-600/40 bg-indigo-50/80 text-indigo-900' };
  if (t.includes('đường') || t.includes('hỏi') || t.includes('băng qua')) return { kanji: '道', theme: 'border-teal-600/40 bg-teal-50/80 text-teal-900' };
  if (t.includes('bệnh') || t.includes('thuốc') || t.includes('khám')) return { kanji: '医', theme: 'border-rose-600/40 bg-rose-50/80 text-rose-900' };
  return { kanji: '会', theme: 'border-blue-600/40 bg-blue-50/80 text-blue-900' };
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
          {/* Biểu trưng chữ Hán (Scenario Kanji Monogram Crest) - Căn giữa trục tâm hoàn hảo */}
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 my-auto rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 shadow-2xs font-serif font-black select-none ${crest.theme}`}
            title="Biểu trưng bối cảnh hội thoại"
          >
            <span className="text-2xl sm:text-3xl leading-none">{crest.kanji}</span>
            <span className="text-[9px] font-sans font-bold uppercase tracking-tight opacity-80 mt-1">
              JLPT {result.jlptLevel}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold text-white font-mono shadow-2xs">
                JLPT {result.jlptLevel}
              </span>

              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border font-sans ${rank.badgeClass}`}>
                Hạng {rank.kanji} · {rank.title}
              </span>

              <span className="text-[11px] text-slate-400 font-medium">
                Hoàn thành {formatDate(result.completedAt)}
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-bold font-sans text-slate-900 group-hover:text-[var(--ai)] transition-colors line-clamp-1">
              {result.scenarioTitle}
            </h2>

            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Phiên đối thoại #{result.roleplaySessionId}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Cụm Dấu Triện Hanko & Điểm số - Đồng trục tuyệt đối */}
        <div className="flex items-center justify-between md:justify-end gap-4 sm:gap-5 pt-3 md:pt-0 border-t md:border-t-0 border-stone-100 my-auto">
          {/* Dấu Triện Hanko (Passed / Failed Red-Ink Seal) */}
          <div className="shrink-0 select-none my-auto flex items-center justify-center">
            {result.passStatus ? (
              <div
                className="w-13 h-13 sm:w-15 sm:h-15 rounded-full border-2 border-dashed border-rose-600 bg-rose-50/80 p-0.5 flex flex-col items-center justify-center text-rose-700 shadow-2xs rotate-[-5deg] transition-transform group-hover:scale-105 my-auto"
                title="Dấu triện công nhận: Đạt chuẩn đối thoại"
              >
                <div className="w-full h-full rounded-full border border-rose-500 flex flex-col items-center justify-center leading-none">
                  <span className="text-[9px] sm:text-[10px] font-serif font-black tracking-widest text-rose-800 leading-none">合格</span>
                  <span className="text-[8px] sm:text-[9px] font-sans font-black tracking-tight text-rose-700 uppercase mt-0.5 leading-none">ĐẠT</span>
                </div>
              </div>
            ) : (
              <div
                className="w-13 h-13 sm:w-15 sm:h-15 rounded-full border-2 border-dashed border-stone-400 bg-stone-50 p-0.5 flex flex-col items-center justify-center text-stone-600 shadow-2xs rotate-[4deg] transition-transform group-hover:scale-105 my-auto"
                title="Dấu triện tu luyện: Cần rèn thêm"
              >
                <div className="w-full h-full rounded-full border border-stone-300 flex flex-col items-center justify-center leading-none">
                  <span className="text-[9px] sm:text-[10px] font-serif font-black tracking-widest text-stone-700 leading-none">未達</span>
                  <span className="text-[7px] sm:text-[8px] font-sans font-bold tracking-tight text-stone-600 uppercase mt-0.5 leading-none">CẦN RÈN</span>
                </div>
              </div>
            )}
          </div>

          {/* Vòng điểm số & Nút xem */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-0.5">
                <strong className="text-3xl sm:text-4xl font-black font-sans tracking-tight text-slate-900 font-mono">
                  {result.overallScore}
                </strong>
                <span className="text-xs font-semibold text-slate-400">/100</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Tổng kết
              </span>
            </div>

            <Link
              to={`/roleplay/results/${result.id}`}
              onClick={() => ukiyoSound.playSubtleTap()}
              className="inline-flex h-10 sm:h-11 items-center justify-center rounded-xl bg-slate-900 px-4 sm:px-5 text-xs sm:text-sm font-bold text-white shadow-xs transition-all hover:bg-[var(--ai)] hover:shadow-sm active:scale-95 cursor-pointer shrink-0"
            >
              <span>Xem kết quả</span>
              <span aria-hidden="true" className="ml-1.5 transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
});

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
    ukiyoSound.playSubtleTap();
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div data-theme="phong-luyen" className="min-h-screen bg-[#F6F8FA] text-slate-800 px-4 py-8 md:px-8">
      <section className="mx-auto w-full max-w-5xl pb-10">
        {/* BANNER CHIẾN TÍCH ĐỐI THOẠI (RPG CHRONICLE HEADER) */}
        <header className="relative mb-8 overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#1E3A8A] px-7 py-9 text-white shadow-xl md:px-10 border border-slate-700/50">
          {/* Lớp nền sóng Seigaiha Nhật Bản */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#38BDF8_2px,transparent_3px)] bg-[size:24px_24px] pointer-events-none" />
          
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full border-[36px] border-sky-400/10 pointer-events-none" />
          <div className="absolute bottom-0 right-32 h-32 w-32 translate-y-1/2 rotate-12 rounded-3xl bg-indigo-500/15 pointer-events-none" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300 font-mono">
                  Nhật ký luyện tập · 会話の記録
                </span>
              </div>

              <h1 className="text-3xl font-black font-sans tracking-tight md:text-4xl text-white">
                Lịch sử hội thoại
              </h1>

              <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-slate-300">
                Lưu trữ toàn bộ các phiên hội thoại cùng AI. Xem lại đánh giá chi tiết, phân tích 6 trục năng lực và nhận xét để cải thiện phản xạ giao tiếp.
              </p>
            </div>

            {/* Triện triện cổ thư phong cách Nhật */}
            <div className="hidden lg:flex flex-col items-center justify-center p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs text-center shrink-0">
              <span className="text-2xl font-serif font-black text-amber-300 tracking-widest writing-vertical py-1">
                対話録
              </span>
              <span className="text-[9px] font-mono font-bold text-sky-200 uppercase tracking-tighter mt-1">
                KAIWA LOG
              </span>
            </div>
          </div>
        </header>

        {/* BẢNG 4 BẢN KHẮC NĂNG LỰC TỰ TRÍ (INTELLIGENCE INSCRIBED TABLETS) */}
        {profile && (
          <div className="mb-7 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* Tablet 1: Phiên hoàn thành */}
            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-indigo-400 hover:shadow-sm">
              <div className="absolute -right-2 -bottom-3 text-4xl font-serif font-black text-slate-100 select-none pointer-events-none">
                戦
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Phiên hoàn thành
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 block font-mono">
                {profile.totalSessionsCompleted}
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                {profile.totalPracticeTurns} lượt đối đáp thực chiến
              </span>
            </div>

            {/* Tablet 2: Phản xạ cất lời */}
            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-sky-400 hover:shadow-sm">
              <div className="absolute -right-2 -bottom-3 text-4xl font-serif font-black text-sky-50 select-none pointer-events-none">
                速
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Điểm phản xạ
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-[var(--ai)] mt-1 block font-mono">
                {Math.round(profile.speakingReflexIndex)}
                <span className="text-xs font-semibold text-slate-400 ml-0.5">/100</span>
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                Tốc độ bật lời tự nhiên
              </span>
            </div>

            {/* Tablet 3: Chuẩn trợ từ */}
            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-sm">
              <div className="absolute -right-2 -bottom-3 text-4xl font-serif font-black text-emerald-50 select-none pointer-events-none">
                格
              </div>
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

            {/* Tablet 4: Khí chất kính ngữ */}
            <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-xs transition hover:border-indigo-400 hover:shadow-sm">
              <div className="absolute -right-2 -bottom-3 text-4xl font-serif font-black text-indigo-50 select-none pointer-events-none">
                礼
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                Vững kính ngữ
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-indigo-800 mt-1 block font-mono">
                {Math.round(profile.keigoCommandScore)}%
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                Chuẩn thể lịch sự Teinei
              </span>
            </div>
          </div>
        )}

        {/* BỘ LỌC KẾT QUẢ */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold font-sans text-slate-900 flex items-center gap-2">
              <span>Danh sách kết quả</span>
              {history && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold font-mono">
                  {history.totalCount}
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
              ['not-passed', 'Cần rèn luyện'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeFilter(value)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                  filter === value
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
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
        ) : history && history.items.length > 0 ? (
          <div className="space-y-3.5">
            {history.items.map((result) => (
              <ResultRow key={result.id} result={result} />
            ))}
          </div>
        ) : (
          <div className="rounded-[32px] border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-xs">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-3xl font-serif text-amber-800 shadow-2xs">
              巻
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-sans">Chưa có kết quả trong danh mục này</h2>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              Hoàn thành các tình huống đàm thoại cùng AI Persona để ghi nhận thêm những ấn ký chiến tích mới.
            </p>
            <Link
              to="/scenarios"
              onClick={() => ukiyoSound.playSubtleTap()}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[var(--ai)] shadow-xs"
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
