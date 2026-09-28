import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roleplayResultService } from '../services/roleplayResultService';
import type { RoleplayResultDetail } from '../types/roleplayResult';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));

const ScoreCard = ({ label, score, accent }: { label: string; score: number; accent: string }) => (
  <div className="rounded-2xl border border-[#DCE7F4] bg-white p-5 shadow-[0_10px_28px_rgba(7,26,68,0.05)]">
    <div className="mb-4 flex items-center justify-between">
      <span className="text-sm font-bold text-[#52627A]">{label}</span>
      <strong className="text-2xl font-black text-[#071A44]">{score}</strong>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-[#EDF3F9]">
      <div className={`h-full rounded-full ${accent}`} style={{ width: `${score}%` }} />
    </div>
  </div>
);

export const ConversationResultDetailView: React.FC = () => {
  const { resultId } = useParams();
  const parsedResultId = Number(resultId);
  const [result, setResult] = useState<RoleplayResultDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const loadResult = async () => {
      if (!Number.isInteger(parsedResultId) || parsedResultId <= 0) {
        setError('Mã kết quả không hợp lệ.');
        setIsLoading(false);
        return;
      }

      const response = await roleplayResultService.getDetail(parsedResultId);
      if (!isCurrent) return;

      if (!response.success || !response.data) {
        setError(response.message || 'Không thể tải kết quả luyện tập.');
      } else {
        setResult(response.data);
      }
      setIsLoading(false);
    };

    void loadResult();
    return () => {
      isCurrent = false;
    };
  }, [parsedResultId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="h-64 animate-pulse rounded-[28px] bg-white" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border border-red-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-[#071A44]">Không thể mở kết quả</h1>
        <p className="mt-3 text-sm leading-6 text-red-700">{error}</p>
        <Link
          to="/roleplay/results"
          className="mt-6 inline-flex rounded-xl bg-[#071A44] px-5 py-2.5 text-sm font-bold text-white"
        >
          Quay lại lịch sử
        </Link>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl pb-10">
      <Link
        to="/roleplay/results"
        className="mb-5 inline-flex items-center text-sm font-bold text-[#52627A] transition hover:text-[#0878EE]"
      >
        ← Quay lại lịch sử
      </Link>

      <header className="relative overflow-hidden rounded-[30px] bg-[#071A44] px-7 py-8 text-white shadow-[0_24px_60px_rgba(7,26,68,0.2)] md:px-10 md:py-10">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(8,120,238,0.45),transparent_65%)]" />
        <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100">
                JLPT {result.jlptLevel}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  result.passStatus
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : 'bg-orange-400/20 text-orange-200'
                }`}
              >
                {result.passStatus ? 'ĐẠT' : 'CHƯA ĐẠT'}
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7FC2FF]">
              UC-21 · Kết quả hội thoại
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {result.scenarioTitle}
            </h1>
            <p className="mt-3 text-sm text-blue-100">Hoàn thành {formatDate(result.completedAt)}</p>
          </div>

          <div
            className="grid h-36 w-36 place-items-center rounded-full p-3"
            style={{
              background: `conic-gradient(#38BDF8 ${result.overallScore}%, rgba(255,255,255,0.12) 0)`,
            }}
            aria-label={`Điểm tổng ${result.overallScore} trên 100`}
          >
            <div className="grid h-full w-full place-items-center rounded-full bg-[#071A44] text-center">
              <div>
                <strong className="block text-4xl font-black">{result.overallScore}</strong>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-200">Tổng điểm</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <ScoreCard label="Ngữ pháp" score={result.grammarScore} accent="bg-[#0878EE]" />
        <ScoreCard label="Từ vựng" score={result.vocabularyScore} accent="bg-emerald-500" />
        <ScoreCard label="Ấn tượng giao tiếp" score={result.impressionScore} accent="bg-amber-500" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[26px] border border-[#DCE7F4] bg-white p-7 shadow-[0_12px_32px_rgba(7,26,68,0.05)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">Nhận xét tổng quan</p>
          <h2 className="mt-2 text-2xl font-black text-[#071A44]">Điều bạn đang làm tốt</h2>
          <p className="mt-4 leading-7 text-[#52627A]">{result.generalFeedbackText}</p>
          <p className="mt-6 border-t border-[#E6EDF5] pt-5 text-xs leading-5 text-[#8B9BB4]">
            Nhận xét AI chỉ nhằm hỗ trợ học tập và không phải kết quả chứng nhận JLPT chính thức.
          </p>
        </article>

        <aside className="rounded-[26px] border border-[#DCE7F4] bg-white p-7 shadow-[0_12px_32px_rgba(7,26,68,0.05)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Mission đã đạt</p>
          <h2 className="mt-2 text-2xl font-black text-[#071A44]">
            {result.completedMissions.length} mục tiêu
          </h2>
          <ul className="mt-5 space-y-3">
            {result.completedMissions.length > 0 ? (
              result.completedMissions.map((mission) => (
                <li key={mission.missionId} className="flex gap-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs text-white">
                    ✓
                  </span>
                  <span className="leading-6">{mission.title}</span>
                </li>
              ))
            ) : (
              <li className="rounded-xl bg-[#F4F9FE] p-4 text-sm leading-6 text-[#71809A]">
                Phiên này chưa ghi nhận mission hoàn thành.
              </li>
            )}
          </ul>
        </aside>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          to="/scenarios"
          className="rounded-xl bg-[#0878EE] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-600"
        >
          Luyện tình huống khác
        </Link>
        <Link
          to="/roleplay/results"
          className="rounded-xl border border-[#DCE7F4] bg-white px-5 py-2.5 text-sm font-bold text-[#071A44] transition hover:bg-[#F4F9FE]"
        >
          Xem toàn bộ lịch sử
        </Link>
      </div>
    </section>
  );
};
