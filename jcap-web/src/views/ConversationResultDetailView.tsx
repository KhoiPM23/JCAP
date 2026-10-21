import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roleplayResultService } from '../services/roleplayResultService';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils/dateUtils';
import type { RoleplayResultDetail } from '../types/roleplayResult';

const formatDate = (value: string) => formatDateTime(value, { dateStyle: 'long', timeStyle: 'short' });

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
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const parsedResultId = Number(resultId);
  const [result, setResult] = useState<RoleplayResultDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const loadResult = async () => {
      setIsLoading(true);
      setResult(null);
      setError(null);
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

  if (isLoading || (result && result.id !== parsedResultId)) {
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
          to={isAdmin ? '/admin/scenarios' : '/roleplay/results'}
          className="mt-6 inline-flex rounded-xl bg-[#071A44] px-5 py-2.5 text-sm font-bold text-white"
        >
          {isAdmin ? 'Quay lại Quản lý kịch bản' : 'Quay lại lịch sử'}
        </Link>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl pb-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={isAdmin ? '/admin/scenarios' : '/roleplay/results'}
          className="inline-flex items-center text-sm font-bold text-[#52627A] transition hover:text-[#0878EE]"
        >
          ← {isAdmin ? 'Quay lại Quản lý kịch bản' : 'Quay lại lịch sử'}
        </Link>
      </div>

      <div key={result.id} className="rounded-[30px] bg-[#F4F9FE] p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#52627A]">
          <span className="text-base font-black text-[#0878EE]">JCAP</span>
          <span>Kết quả #{result.id} · Thời gian Việt Nam (UTC+7)</span>
        </div>
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
                Kết quả hội thoại
              </p>
              <h1 className="mt-3 break-words text-3xl font-black tracking-tight md:text-4xl">
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
          <ScoreCard label="Ngữ pháp & Cấu trúc" score={result.grammarScore} accent="bg-[#0878EE]" />
          <ScoreCard label="Vốn từ vựng" score={result.vocabularyScore} accent="bg-emerald-500" />
          <ScoreCard label="Kính ngữ & Văn phong" score={result.impressionScore} accent="bg-amber-500" />
        </div>

        {/* Structured AI Feedback Section */}
        {(() => {
          const rawText = result.generalFeedbackText || '';
          
          // Regex extract các phần phản hồi đã được chuẩn hóa
          const strengthsMatch = rawText.match(/Điểm làm tốt:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Điểm cần cải thiện:|Cách diễn đạt tự nhiên hơn:|Nhận xét theo lượt:|$))/i);
          const improvementsMatch = rawText.match(/Điểm cần cải thiện:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Cách diễn đạt tự nhiên hơn:|Nhận xét theo lượt:|Điểm làm tốt:|$))/i);
          const naturalAltMatch = rawText.match(/Cách diễn đạt tự nhiên hơn:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Nhận xét theo lượt:|Điểm làm tốt:|Điểm cần cải thiện:|$))/i);
          const turnsMatch = rawText.match(/Nhận xét theo lượt:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Điểm làm tốt:|Điểm cần cải thiện:|Cách diễn đạt tự nhiên hơn:|$))/i);

          const strengthsText = strengthsMatch ? strengthsMatch[1].trim() : null;
          const improvementsText = improvementsMatch ? improvementsMatch[1].trim() : null;
          const naturalAltText = naturalAltMatch ? naturalAltMatch[1].trim() : null;
          const turnsText = turnsMatch ? turnsMatch[1].trim() : null;

          // Phần text nhận xét tổng quát (câu đầu tiên trước các tiêu đề phân loại)
          const firstSection = rawText.split(/(?:Nhận xét theo lượt:|Điểm làm tốt:|Điểm cần cải thiện:|Cách diễn đạt tự nhiên hơn:)/i)[0]?.trim() || rawText;

          return (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-5">
                {/* Tổng quan */}
                <article className="rounded-[26px] border border-[#DCE7F4] bg-white p-6 sm:p-7 shadow-[0_12px_32px_rgba(7,26,68,0.05)]">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">
                    <span>💡</span>
                    <span>Đánh giá từ AI Persona</span>
                  </div>
                  <h2 className="mt-2 text-xl sm:text-2xl font-black text-[#071A44]">Nhận xét tổng quan</h2>
                  <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#52627A] whitespace-pre-wrap break-words">
                    {firstSection}
                  </p>

                  {/* Nhận xét theo từng lượt nói (nếu có) */}
                  {turnsText && (
                    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-[#071A44]">
                      <div className="font-bold text-[#0878EE] flex items-center gap-1.5 mb-1">
                        <span>💬</span>
                        <span>Chi tiết các lượt nói</span>
                      </div>
                      <p className="leading-relaxed text-[#52627A]">{turnsText}</p>
                    </div>
                  )}
                </article>

                {/* Điểm làm tốt & Điểm cần cải thiện (2 cột hoặc thẻ) */}
                {(strengthsText || improvementsText) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {strengthsText && (
                      <div className="rounded-[22px] border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white text-[10px]">✓</span>
                          <span>Điểm làm tốt</span>
                        </div>
                        <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-emerald-950 font-medium break-words">
                          {strengthsText}
                        </p>
                      </div>
                    )}

                    {improvementsText && (
                      <div className="rounded-[22px] border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-white text-[10px]">!</span>
                          <span>Cần cải thiện</span>
                        </div>
                        <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-amber-950 font-medium break-words">
                          {improvementsText}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Gợi ý diễn đạt tự nhiên hơn (Native Phrasing Recommendation) */}
                {naturalAltText && (
                  <div className="rounded-[24px] border border-[#0878EE]/30 bg-linear-to-r from-blue-50/80 to-indigo-50/60 p-5 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0878EE]">
                      <span>🌸</span>
                      <span>Cách nói tự nhiên của người bản xứ</span>
                    </div>
                    <div className="mt-2 rounded-xl bg-white/80 p-3.5 border border-blue-100/60">
                      <p className="text-base font-bold text-[#071A44] leading-relaxed break-words">
                        {naturalAltText}
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-[11px] leading-5 text-[#8B9BB4] italic">
                  * Nhận xét AI chỉ nhằm hỗ trợ học tập, rèn luyện phản xạ và không thay thế kết quả thi chứng chỉ JLPT chính thức.
                </p>
              </div>

              {/* Aside: Nhiệm vụ hoàn thành */}
              <aside className="h-fit rounded-[26px] border border-[#DCE7F4] bg-white p-6 sm:p-7 shadow-[0_12px_32px_rgba(7,26,68,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Nhiệm vụ kịch bản</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <h2 className="text-2xl font-black text-[#071A44]">
                    {result.completedMissions.length} mục tiêu
                  </h2>
                  <span className="text-xs font-semibold text-[#52627A]">
                    {result.passStatus ? 'Đã hoàn thành xuất sắc' : 'Chưa hoàn tất hết'}
                  </span>
                </div>
                <ul className="mt-5 space-y-3">
                  {result.completedMissions.length > 0 ? (
                    result.completedMissions.map((mission) => (
                      <li key={mission.missionId} className="flex gap-3 rounded-xl bg-emerald-50 p-3.5 text-xs sm:text-sm font-semibold text-emerald-900 border border-emerald-100">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">
                          ✓
                        </span>
                        <span className="min-w-0 break-words leading-relaxed">{mission.title}</span>
                      </li>
                    ))
                  ) : (
                    <li className="rounded-xl bg-[#F4F9FE] p-4 text-xs sm:text-sm leading-relaxed text-[#71809A]">
                      Phiên này chưa ghi nhận nhiệm vụ hoàn thành.
                    </li>
                  )}
                </ul>
              </aside>
            </div>
          );
        })()}
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        {isAdmin && (
          <Link
            to="/admin/scenarios"
            className="rounded-xl bg-[#071A44] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Quay về Quản lý Kịch bản (Admin)
          </Link>
        )}
        <Link
          to="/scenarios"
          className="rounded-xl bg-[#0878EE] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-600"
        >
          {isAdmin ? 'Kiểm thử kịch bản khác' : 'Luyện tình huống khác'}
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
