import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { ShadowingProgress } from '../../types/shadowingProgress';

interface ContinueShadowingCardProps {
  progress: ShadowingProgress | null;
  showEmptyState?: boolean;
}

export const ContinueShadowingCard: React.FC<ContinueShadowingCardProps> = ({
  progress,
  showEmptyState = true,
}) => {
  const navigate = useNavigate();

  if (!progress || progress.status !== 'IN_PROGRESS') {
    if (!showEmptyState) return null;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-[#005ab6]">
              <span className="material-symbols-outlined text-[20px]">play_circle</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Tiếp tục học Shadowing
            </h2>
          </div>
          <Link
            to="/shadowing"
            className="text-xs font-semibold text-[#005ab6] hover:text-[#00458f] flex items-center gap-1 transition-colors"
          >
            <span>Xem tất cả bài tập</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center text-[#005ab6] shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[28px]">graphic_eq</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Luyện nói phản xạ Shadowing
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-lg leading-relaxed">
                Bạn chưa có bài học nào đang dở. Hãy bắt đầu một bài hội thoại từ thư viện để rèn ngữ điệu bản xứ và phản xạ chuẩn Tokyo!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/shadowing')}
            className="w-full sm:w-auto whitespace-nowrap px-6 py-3 rounded-xl bg-[#005ab6] hover:bg-[#00458f] text-white text-xs font-bold transition shadow-sm hover:shadow active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>Khám phá Thư viện</span>
          </button>
        </div>
      </section>
    );
  }

  const {
    dialogueId,
    dialogueTitle,
    subtitle,
    scenarioTitle,
    textbookTitle,
    chapterTitle,
    jlptLevel,
    role,
    currentSentenceIndex,
    currentSentenceText,
    completedSentenceCount,
    totalSentenceCount,
  } = progress;

  const safeTotal = totalSentenceCount > 0 ? totalSentenceCount : 1;
  const progressPercent = Math.min(
    100,
    Math.round((completedSentenceCount / safeTotal) * 100)
  );

  const handleContinue = () => {
    navigate(`/shadowing/practice/${dialogueId}?role=${role}&resume=true`);
  };

  const displaySubtitle = subtitle || scenarioTitle;

  return (
    <section className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-[#005ab6]">
            <span className="material-symbols-outlined text-[20px]">play_circle</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Tiếp tục học Shadowing
          </h2>
        </div>
        <Link
          to="/shadowing?tab=in-progress"
          className="text-xs font-semibold text-[#005ab6] hover:text-[#00458f] flex items-center gap-1 transition-colors"
        >
          <span>Xem tất cả bài tập</span>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </div>

      {/* Main Resume Card */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex-1 space-y-4 min-w-0">
            {/* Top Syllabus Context Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                JLPT {jlptLevel || 'N4'} · {chapterTitle || 'Hội thoại'}
              </span>
              {textbookTitle && (
                <span className="text-slate-400 text-xs font-medium">
                  {textbookTitle}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                Vai: <strong className="text-slate-900">{role}</strong>
              </span>
            </div>

            {/* Title & Subtitle */}
            <div>
              <h3 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight line-clamp-1">
                {dialogueTitle || `Bài thoại #${dialogueId}`}{' '}
                {displaySubtitle && (
                  <span className="text-sm font-normal text-slate-500">
                    ({displaySubtitle})
                  </span>
                )}
              </h3>
            </div>

            {/* Active Sentence Preview Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-slate-400 text-xs font-semibold">
                  Câu {currentSentenceIndex + 1}:
                </div>
                <div className="text-base md:text-lg font-medium text-slate-900">
                  {currentSentenceText || dialogueTitle || 'Chuẩn bị câu tiếp theo...'}
                </div>
              </div>
            </div>

            {/* Progress bar & percentage */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Tiến độ bài học</span>
                <span className="font-semibold text-slate-800">
                  {completedSentenceCount} / {totalSentenceCount} câu ({progressPercent}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#005ab6] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action CTA Button */}
          <div className="flex flex-col items-stretch lg:w-64 shrink-0">
            <button
              type="button"
              onClick={handleContinue}
              className="w-full h-14 px-6 rounded-xl bg-[#005ab6] hover:bg-[#00458f] text-white font-bold text-base flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer"
            >
              <span
                className="material-symbols-outlined text-[24px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                play_arrow
              </span>
              <span>Tiếp tục luyện tập</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

