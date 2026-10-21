import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roleplayResultService } from '../services/roleplayResultService';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils/dateUtils';
import type { RoleplayResultDetail } from '../types/roleplayResult';

const formatDate = (value: string) => formatDateTime(value, { dateStyle: 'long', timeStyle: 'short' });

const playJapaneseAudio = (text: string) => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }
};

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
  const [copyToast, setCopyToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [copiedAlternativeId, setCopiedAlternativeId] = useState<number | null>(null);

  const handleCopyText = (text: string, id: number, isAlt = false) => {
    void navigator.clipboard.writeText(text);
    if (isAlt) {
      setCopiedAlternativeId(id);
      setTimeout(() => setCopiedAlternativeId(null), 2000);
    } else {
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
    setToastMessage(`📋 Đã sao chép: "${text.length > 30 ? text.slice(0, 30) + '...' : text}"`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleCopySummary = async () => {
    if (!result) return;
    const text = [
      `🎯 KẾT QUẢ LUYỆN HỘI THOẠI JCAP`,
      `Kịch bản: ${result.scenarioTitle} (JLPT ${result.jlptLevel})`,
      `Tổng điểm: ${result.overallScore}/100 - ${result.passStatus ? 'ĐẠT' : 'CHƯA ĐẠT'}`,
      `• Ngữ pháp: ${result.grammarScore}/100`,
      `• Từ vựng: ${result.vocabularyScore}/100`,
      `• Kính ngữ & Văn phong: ${result.impressionScore}/100`,
      `• Nhiệm vụ hoàn thành: ${result.completedMissions.length} mục tiêu`,
      result.generalFeedbackText ? `\nNhận xét tổng quan:\n${result.generalFeedbackText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 3000);
    } catch {
      // fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

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
      {/* Toast Notification */}
      {(copyToast || toastMessage) && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-400 bg-[#071A44] px-4 py-3 text-xs font-semibold text-white shadow-xl animate-fade-in">
          <span>{toastMessage ? '⭐' : '✓'}</span>
          <span>{toastMessage || 'Đã sao chép báo cáo kết quả vào bộ nhớ tạm!'}</span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={isAdmin ? '/admin/scenarios' : '/roleplay/results'}
          className="inline-flex items-center text-sm font-bold text-[#52627A] transition hover:text-[#0878EE]"
        >
          ← {isAdmin ? 'Quay lại Quản lý kịch bản' : 'Quay lại lịch sử'}
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE7F4] bg-white px-3.5 py-2 text-xs font-bold text-[#071A44] shadow-2xs transition hover:bg-[#F4F9FE] hover:border-[#0878EE]"
            title="Sao chép tóm tắt kết quả vào bộ nhớ tạm"
          >
            <span>📋</span>
            <span>Sao chép tóm tắt</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE7F4] bg-white px-3.5 py-2 text-xs font-bold text-[#071A44] shadow-2xs transition hover:bg-[#F4F9FE] hover:border-[#0878EE]"
            title="In hoặc Lưu báo cáo dưới dạng PDF"
          >
            <span>🖨️</span>
            <span>In / PDF</span>
          </button>
        </div>
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
                {naturalAltText && (() => {
                  const alternatives = naturalAltText
                    .split(' | ')
                    .map((item) => item.trim())
                    .filter(Boolean);

                  return (
                    <div className="rounded-[24px] border border-[#0878EE]/30 bg-linear-to-r from-blue-50/80 to-indigo-50/60 p-5 shadow-xs">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0878EE]">
                          <span>🌸</span>
                          <span>Cách nói tự nhiên của người bản xứ</span>
                        </div>
                        <span className="text-[11px] font-semibold text-[#52627A]">
                          {alternatives.length} gợi ý diễn đạt
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {alternatives.map((alt, idx) => (
                          <div
                            key={idx}
                            className="group flex items-center justify-between gap-3 rounded-xl border border-blue-100/70 bg-white/90 p-3.5 shadow-2xs transition hover:border-[#0878EE]/40 hover:bg-white"
                          >
                            <p className="text-sm sm:text-base font-bold text-[#071A44] leading-relaxed break-words">
                              {alt}
                            </p>
                            <button
                              type="button"
                              onClick={() => playJapaneseAudio(alt)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#DCE7F4] bg-[#F4F9FE] text-xs text-[#0878EE] transition hover:bg-[#0878EE] hover:text-white"
                              title="Nghe phát âm bản xứ"
                            >
                              🔊
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <p className="text-[11px] leading-5 text-[#8B9BB4] italic">
                  * Nhận xét AI chỉ nhằm hỗ trợ học tập, rèn luyện phản xạ và không thay thế kết quả thi chứng chỉ JLPT chính thức.
                </p>
              </div>

              {/* Aside: Nhiệm vụ kịch bản (Đầy đủ cả Đạt & Chưa đạt) */}
              <aside className="h-fit rounded-[26px] border border-[#DCE7F4] bg-white p-6 sm:p-7 shadow-[0_12px_32px_rgba(7,26,68,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">Nhiệm vụ kịch bản</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <h2 className="text-2xl font-black text-[#071A44]">
                    {result.allMissions && result.allMissions.length > 0
                      ? `${result.completedMissions.length} / ${result.allMissions.length}`
                      : `${result.completedMissions.length}`}{' '}
                    mục tiêu
                  </h2>
                  <span
                    className={`text-xs font-bold ${
                      result.passStatus ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {result.passStatus ? '✓ Hoàn thành xuất sắc' : 'Chưa hoàn tất hết'}
                  </span>
                </div>

                {/* Thanh tiến độ */}
                {result.allMissions && result.allMissions.length > 0 && (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E6EDF5]">
                      <div
                        className="h-full bg-gradient-to-r from-[#0878EE] to-emerald-500 transition-all duration-500"
                        style={{
                          width: `${Math.round(
                            (result.completedMissions.length / result.allMissions.length) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <ul className="mt-5 space-y-3">
                  {result.allMissions && result.allMissions.length > 0 ? (
                    result.allMissions.map((mission) => (
                      <li
                        key={mission.missionId}
                        className={`flex gap-3 rounded-xl p-3.5 text-xs sm:text-sm font-semibold border transition ${
                          mission.isCompleted
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                            mission.isCompleted
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-300 text-slate-700'
                          }`}
                        >
                          {mission.isCompleted ? '✓' : mission.order}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="min-w-0 break-words leading-relaxed">
                              {mission.content}
                            </span>
                            <span
                              className={`shrink-0 text-[10px] font-bold ${
                                mission.isCompleted ? 'text-emerald-700' : 'text-slate-500'
                              }`}
                            >
                              {mission.isCompleted ? 'Đã đạt' : 'Chưa đạt'}
                            </span>
                          </div>
                          {mission.target && (
                            <p className="mt-1 text-[11px] font-normal text-[#71809A]">
                              Mục tiêu: {mission.target}
                            </p>
                          )}
                        </div>
                      </li>
                    ))
                  ) : result.completedMissions.length > 0 ? (
                    result.completedMissions.map((mission) => (
                      <li
                        key={mission.missionId}
                        className="flex gap-3 rounded-xl bg-emerald-50 p-3.5 text-xs sm:text-sm font-semibold text-emerald-900 border border-emerald-100"
                      >
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

        {/* ============================================================ */}
        {/* TARGET VOCABULARY & GRAMMAR REINFORCEMENT                    */}
        {/* ============================================================ */}
        {((result.targetVocabularies && result.targetVocabularies.length > 0) ||
          (result.targetGrammars && result.targetGrammars.length > 0)) && (
          <section className="mt-6 rounded-[26px] border border-[#DCE7F4] bg-white p-6 sm:p-7 shadow-[0_12px_32px_rgba(7,26,68,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDF3F9] pb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">
                <span>📚</span>
                <span>Củng cố kiến thức trọng tâm</span>
              </div>
              <span className="text-xs font-semibold text-[#71809A]">
                Nội dung đề xuất ôn tập từ kịch bản này
              </span>
            </div>

            {/* Từ vựng */}
            {result.targetVocabularies && result.targetVocabularies.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-bold text-[#071A44] mb-3 flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-100 text-[#0878EE] text-[11px] font-black">
                    A
                  </span>
                  <span>Từ vựng trọng tâm ({result.targetVocabularies.length} từ)</span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {result.targetVocabularies.map((vocab) => (
                    <div
                      key={vocab.id}
                      className="group flex flex-col justify-between rounded-2xl border border-[#EDF3F9] bg-[#F8FAFC] p-3.5 transition hover:border-[#B9D9FF] hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <ruby className="text-base font-black text-[#071A44]">
                            {vocab.word}
                            {vocab.reading && (
                              <rt className="text-[10px] text-[#0878EE] font-normal">{vocab.reading}</rt>
                            )}
                          </ruby>
                          <p className="mt-1 text-xs text-[#52627A] leading-relaxed font-medium">
                            {vocab.meaning}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyText(`${vocab.word}${vocab.reading ? ` (${vocab.reading})` : ''}: ${vocab.meaning}`, vocab.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#DCE7F4] bg-white text-xs text-[#52627A] transition hover:bg-[#F4F9FE] hover:text-[#0878EE]"
                            title="Sao chép từ vựng"
                          >
                            📋
                          </button>
                          <button
                            type="button"
                            onClick={() => playJapaneseAudio(vocab.word)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#DCE7F4] bg-white text-xs text-[#0878EE] transition hover:bg-[#0878EE] hover:text-white"
                            title="Nghe phát âm từ vựng"
                          >
                            🔊
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mẫu ngữ pháp */}
            {result.targetGrammars && result.targetGrammars.length > 0 && (
              <div className="mt-6 border-t border-[#EDF3F9] pt-5">
                <h3 className="text-sm font-bold text-[#071A44] mb-3 flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-black">
                    G
                  </span>
                  <span>Mẫu câu & Ngữ pháp áp dụng ({result.targetGrammars.length} mẫu)</span>
                </h3>
                <div className="space-y-2.5">
                  {result.targetGrammars.map((grammar) => (
                    <div
                      key={grammar.id}
                      className="rounded-xl border border-[#EDF3F9] bg-[#F8FAFC] p-3.5 text-xs text-[#071A44]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[#0878EE] text-sm">{grammar.pattern}</span>
                        <span className="font-medium text-[#52627A]">{grammar.meaning}</span>
                      </div>
                      {grammar.exampleSentence && (
                        <p className="mt-1.5 text-[#71809A] italic border-l-2 border-[#B9D9FF] pl-2.5">
                          Ví dụ: {grammar.exampleSentence}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* CONVERSATION TRANSCRIPT REVIEW (XEM LẠI ĐỐI THOẠI CHI TIẾT)  */}
        {/* ============================================================ */}
        {result.messages && result.messages.length > 0 && (
          <section className="mt-6 rounded-[26px] border border-[#DCE7F4] bg-white p-6 sm:p-7 shadow-[0_12px_32px_rgba(7,26,68,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDF3F9] pb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">
                <span>💬</span>
                <span>Chi tiết toàn bộ đoạn hội thoại</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#71809A]">
                  {result.messages.length} lượt nói
                </span>
                <button
                  type="button"
                  onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
                  className="rounded-lg border border-[#DCE7F4] bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#52627A] hover:bg-white transition"
                >
                  {isTranscriptOpen ? 'Thu gọn ▲' : 'Mở rộng ▼'}
                </button>
              </div>
            </div>

            {isTranscriptOpen && (
              <div className="mt-5 space-y-4">
                {result.messages.map((msg, index) => {
                  const isUser = msg.sender.toLowerCase() === 'user';
                  const feedback = msg.linguisticFeedback;
                  const status = feedback?.quickStatus || feedback?.status || 'good';

                  return (
                    <div
                      key={msg.id || index}
                      className={`flex items-start gap-3 rounded-2xl p-4 transition ${
                        isUser
                          ? 'border border-[#E6EDF5] bg-[#F8FAFC]'
                          : 'border border-blue-100 bg-blue-50/40'
                      }`}
                    >
                      {/* Avatar Icon */}
                      <div
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-bold text-white shadow-xs ${
                          isUser ? 'bg-[#071A44]' : 'bg-[#0878EE]'
                        }`}
                      >
                        {isUser ? 'Bạn' : 'AI'}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#52627A]">
                            {isUser ? 'Bạn đã nói' : 'AI phản hồi'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => playJapaneseAudio(msg.japaneseText)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#DCE7F4] bg-white px-2 py-1 text-[11px] font-semibold text-[#0878EE] transition hover:bg-[#0878EE] hover:text-white"
                              title="Nghe phát âm câu này"
                            >
                              <span>🔊</span>
                              <span>Nghe</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyText(msg.japaneseText, msg.id, false)}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                copiedMessageId === msg.id
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-[#DCE7F4] bg-white text-[#52627A] hover:bg-[#F4F9FE] hover:text-[#0878EE]'
                              }`}
                              title="Sao chép câu này"
                            >
                              <span>{copiedMessageId === msg.id ? '✓' : '📋'}</span>
                              <span>{copiedMessageId === msg.id ? 'Đã chép' : 'Chép'}</span>
                            </button>
                          </div>
                          {isUser && feedback && (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                status.toLowerCase() === 'success' || status.toLowerCase() === 'good'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : status.toLowerCase() === 'warning'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {status.toLowerCase() === 'success' || status.toLowerCase() === 'good'
                                ? '✓ Rất tốt'
                                : status.toLowerCase() === 'warning'
                                ? '! Cần chú ý'
                                : '✕ Cần sửa'}
                            </span>
                          )}
                        </div>

                        {/* Japanese Utterance (Hỗ trợ Furigana nếu có) */}
                        {msg.furiganaHtml ? (
                          <div
                            className="text-sm sm:text-base font-bold text-[#071A44] leading-relaxed break-words"
                            dangerouslySetInnerHTML={{ __html: msg.furiganaHtml }}
                          />
                        ) : (
                          <p className="text-sm sm:text-base font-bold text-[#071A44] leading-relaxed break-words">
                            {msg.japaneseText}
                          </p>
                        )}

                        {/* Vietnamese Meaning */}
                        {msg.vietnameseMeaning && (
                          <p className="text-xs text-[#52627A] leading-relaxed italic">
                            Dịch nghĩa: {msg.vietnameseMeaning}
                          </p>
                        )}

                        {/* User Feedback Detail */}
                        {isUser && feedback && (
                          <div className="mt-2 rounded-xl bg-white/90 p-3 border border-[#E6EDF5] text-xs space-y-1">
                            {feedback.summary && (
                              <p className="font-semibold text-[#071A44]">
                                💡 {feedback.summary}
                              </p>
                            )}
                            {feedback.naturalAlternative && (
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F1F5F9]">
                                <p className="text-emerald-800 font-bold text-xs">
                                  🌸 Diễn đạt bản xứ: {feedback.naturalAlternative}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => playJapaneseAudio(feedback.naturalAlternative!)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 transition hover:bg-emerald-100"
                                    title="Nghe phát âm chuẩn câu bản xứ"
                                  >
                                    <span>🔊</span>
                                    <span>Nghe câu mẫu</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(feedback.naturalAlternative!, msg.id, true)}
                                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                                      copiedAlternativeId === msg.id
                                        ? 'border-emerald-500 bg-emerald-600 text-white'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                    }`}
                                    title="Sao chép câu bản xứ vào bộ nhớ tạm"
                                  >
                                    <span>{copiedAlternativeId === msg.id ? '✓' : '📋'}</span>
                                    <span>{copiedAlternativeId === msg.id ? 'Đã chép' : 'Sao chép'}</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
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
