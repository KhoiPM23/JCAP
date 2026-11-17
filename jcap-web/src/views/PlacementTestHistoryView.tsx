import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { placementTestService } from '../services/placementTestService';
import { formatDateTime } from '../utils/dateUtils';
import type {
  PlacementTestHistoryItemDto,
  PlacementTestHistoryDetailDto,
} from '../types/placementTest';

export const PlacementTestHistoryView: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<PlacementTestHistoryItemDto[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PlacementTestHistoryDetailDto | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [retaking, setRetaking] = useState<boolean>(false);

  // Load history sessions list
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      setLoadingList(true);
      setError(null);
      const res = await placementTestService.getHistoryList();
      if (!isMounted) return;
      if (res.success && res.data) {
        setSessions(res.data);
        if (res.data.length > 0) {
          setSelectedSessionId(res.data[0].sessionId);
        }
      } else {
        setError(res.message || 'Không thể tải lịch sử kiểm tra xếp lớp.');
      }
      setLoadingList(false);
    };
    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load session detail when selectedSessionId changes
  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      return;
    }
    let isMounted = true;
    const fetchDetail = async () => {
      setLoadingDetail(true);
      const res = await placementTestService.getHistoryDetail(selectedSessionId);
      if (!isMounted) return;
      if (res.success && res.data) {
        setDetail(res.data);
      }
      setLoadingDetail(false);
    };
    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedSessionId]);

  // Retake test (starts a fresh session and redirects)
  const handleRetake = async () => {
    if (retaking) return;
    setRetaking(true);
    try {
      const res = await placementTestService.startOrResume(true);
      if (res.success) {
        navigate('/placement-test');
      } else {
        alert(res.message || 'Không thể khởi tạo bài kiểm tra mới.');
      }
    } catch {
      alert('Đã có lỗi xảy ra khi bắt đầu phiên mới.');
    } finally {
      setRetaking(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    return formatDateTime(isoString);
  };

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6 bg-transparent px-4 pb-16 pt-4">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <button
            type="button"
            onClick={() => navigate('/scenarios')}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sumi-faint)] hover:text-[var(--ai)] transition cursor-pointer"
          >
            <span>←</span> Quay lại Thư viện Kịch bản
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl font-black tracking-tight text-[var(--sumi)] font-sans sm:text-3xl">
              Lịch sử Đánh giá Xếp lớp (Placement Test)
            </h1>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">
              {sessions.length} phiên đã lưu
            </span>
            <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-extrabold text-amber-900">
              🧪 MÔI TRƯỜNG KIỂM THỬ NỘI BỘ
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--sumi-muted)]">
            Xem lại chi tiết từng lượt nói, bằng chứng Can-do và căn cứ AI xếp hạng trình độ N5–N3.
            <span className="ml-1 text-xs font-semibold text-amber-800">(Dữ liệu phục vụ kiểm thử đối soát kỹ thuật, không phải bản deploy chính thức cho học viên)</span>
          </p>
        </div>

        {/* Retake Bypass Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRetake}
            disabled={retaking}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--ai)] px-4 py-2.5 text-sm font-bold text-[var(--on-ai)] shadow-sm hover:bg-[var(--ai-hover)] transition cursor-pointer disabled:opacity-50"
            title="Bắt đầu một phiên Placement Test mới để kiểm thử tiếp"
          >
            <span>✨</span>
            <span>{retaking ? 'Đang khởi tạo…' : 'Làm bài kiểm tra mới (Retake)'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Sessions List, Right Session Detail */}
      {loadingList ? (
        <div className="py-24 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[var(--ai)] border-t-transparent" />
          <p className="mt-3 text-sm text-[var(--sumi-muted)]">Đang tải lịch sử các phiên đánh giá…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p className="font-semibold">{error}</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-12 text-center shadow-xs">
          <span className="text-4xl">🏨</span>
          <h3 className="mt-3 text-lg font-bold text-[var(--sumi)]">Chưa có phiên kiểm tra xếp lớp nào</h3>
          <p className="mt-1 text-sm text-[var(--sumi-muted)]">
            Bạn chưa hoàn thành bài Placement Test nào hoặc phiên kiểm tra chưa được lưu.
          </p>
          <button
            type="button"
            onClick={handleRetake}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--ai)] px-5 py-2.5 text-sm font-bold text-[var(--on-ai)] hover:bg-[var(--ai-hover)] transition cursor-pointer"
          >
            Bắt đầu làm bài kiểm tra ngay
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Sessions List (4 cols) */}
          <div className="flex flex-col gap-3 lg:col-span-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
              Danh sách các lần thực hiện ({sessions.length})
            </h2>
            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[820px] pr-1">
              {sessions.map((s) => {
                const isSelected = s.sessionId === selectedSessionId;
                const isN3 = s.initialEstimatedLevel === 'N3';
                const isN4 = s.initialEstimatedLevel === 'N4';
                return (
                  <button
                    key={s.sessionId}
                    type="button"
                    onClick={() => setSelectedSessionId(s.sessionId)}
                    className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-[var(--ai)] bg-[var(--ai-soft)] shadow-md ring-2 ring-[var(--ai)]/30'
                        : 'border-[var(--line)] bg-[var(--paper-50)] hover:border-[var(--line-strong)] hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--sumi-faint)]">
                        Phiên #{s.sessionId}
                      </span>
                      <span className="text-xs text-[var(--sumi-muted)]">
                        {formatDate(s.completedAt || s.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg px-2.5 py-1 text-sm font-black ${
                            isN3
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : isN4
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                        >
                          {s.initialEstimatedLevel}
                        </span>
                        <span className="text-xs font-bold text-[var(--sumi-muted)]">
                          Độ tin cậy: {s.initialConfidenceTier}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xl font-black text-[var(--sumi)] font-mono">
                          {s.overallScore}
                        </span>
                        <span className="text-xs text-[var(--sumi-muted)]">/100</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[var(--sumi-faint)] border-t border-[var(--line)]/50 pt-2 mt-1">
                      <span>{s.totalTurns} lượt đối thoại</span>
                      <span className="font-semibold text-emerald-700">
                        {s.fulfilledEventsCount}/5 sự kiện hoàn thành
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed Breakdown & Evidence Inspector (8 cols) */}
          <div className="flex flex-col gap-6 lg:col-span-8">
            {loadingDetail ? (
              <div className="flex h-96 items-center justify-center rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]">
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[var(--ai)] border-t-transparent" />
                  <p className="mt-3 text-sm text-[var(--sumi-muted)]">Đang tải bằng chứng chi tiết của phiên #{selectedSessionId}…</p>
                </div>
              </div>
            ) : !detail ? (
              <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-12 text-center text-sm text-[var(--sumi-muted)]">
                Chọn một phiên bên trái để xem chi tiết bằng chứng đánh giá.
              </div>
            ) : (
              <>
                {/* 1. Header Evaluation Card */}
                <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                          Kết luận xếp lớp phiên #{detail.sessionId}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">
                          {detail.status === 'Completed' ? 'Hoàn thành trọn vẹn' : detail.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-4xl font-black text-[var(--sumi)] font-sans sm:text-5xl">
                          JLPT {detail.initialEstimatedLevel}
                        </span>
                        <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-300">
                          Độ tin cậy: {detail.initialConfidenceTier}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--sumi-muted)]">
                        Thời gian hoàn thành: {formatDate(detail.completedAt || detail.createdAt)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-200)]/40 p-4 text-center min-w-[140px]">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                        Điểm tổng thể
                      </span>
                      <div className="mt-1 flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-black text-[var(--sumi)] font-mono">
                          {detail.overallScore}
                        </span>
                        <span className="text-sm font-semibold text-[var(--sumi-faint)]">/100</span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Rubric Cards */}
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                      <div className="text-xs font-semibold text-blue-900">Hoàn thành nhiệm vụ (35%)</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl font-black text-blue-900 font-mono">{detail.taskFulfillmentScore}</span>
                        <span className="text-[11px] font-bold text-blue-700">/100</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, detail.taskFulfillmentScore)}%` }} />
                      </div>
                    </div>

                    <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3">
                      <div className="text-xs font-semibold text-purple-900">Độ chuẩn ngữ pháp (25%)</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl font-black text-purple-900 font-mono">{detail.grammarAccuracyScore}</span>
                        <span className="text-[11px] font-bold text-purple-700">/100</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-purple-200">
                        <div className="h-full bg-purple-600 rounded-full" style={{ width: `${Math.min(100, detail.grammarAccuracyScore)}%` }} />
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                      <div className="text-xs font-semibold text-amber-900">Độ rộng từ vựng (20%)</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl font-black text-amber-900 font-mono">{detail.vocabularyRangeScore}</span>
                        <span className="text-[11px] font-bold text-amber-700">/100</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
                        <div className="h-full bg-amber-600 rounded-full" style={{ width: `${Math.min(100, detail.vocabularyRangeScore)}%` }} />
                      </div>
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <div className="text-xs font-semibold text-emerald-900">Lịch thiệp xã hội (20%)</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl font-black text-emerald-900 font-mono">{detail.pragmaticsScore}</span>
                        <span className="text-[11px] font-bold text-emerald-700">/100</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200">
                        <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, detail.pragmaticsScore)}%` }} />
                      </div>
                    </div>
                  </div>

                  {detail.summaryFeedback && (
                    <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper-100)] p-3.5 text-xs text-[var(--sumi)] leading-relaxed">
                      <span className="font-bold text-[var(--ai)]">💡 Nhận xét tổng kết: </span>
                      {detail.summaryFeedback}
                    </div>
                  )}
                </div>

                {/* 2. Dekiru Nihongo Can-do Roadmap (5 Events) */}
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                    <h3 className="text-base font-bold text-[var(--sumi)] flex items-center gap-2">
                      <span>🎯</span> Lộ trình 5 Sự kiện Can-do (Dekiru Nihongo)
                    </h3>
                    <span className="text-xs text-[var(--sumi-muted)]">
                      {detail.eventSummaries.length}/5 sự kiện đã ghi nhận
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {detail.eventSummaries.map((evt) => (
                      <div
                        key={evt.eventCode}
                        className="flex flex-col justify-between rounded-2xl border border-[var(--line)] bg-[var(--paper-100)] p-4 text-xs"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-[var(--ai)]">{evt.eventCode}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 font-bold ${
                                evt.highestDemonstratedBand === 'N3'
                                  ? 'bg-purple-100 text-purple-800'
                                  : evt.highestDemonstratedBand === 'N4'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              Đạt {evt.highestDemonstratedBand}
                            </span>
                          </div>
                          <p className="mt-1.5 font-bold text-[var(--sumi)] leading-snug">
                            {evt.communicativeGoal}
                          </p>
                          {evt.summaryExplanation && (
                            <p className="mt-1 text-[11px] text-[var(--sumi-muted)] leading-relaxed">
                              {evt.summaryExplanation}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-[var(--line)]/50 pt-2 text-[11px] text-[var(--sumi-faint)]">
                          <span>Trạng thái: <strong className="text-emerald-700">{evt.outcomeStatus}</strong></span>
                          <span>Hỗ trợ: {evt.scaffoldingStepsNeeded} bước</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Turn-by-Turn Evidence Inspector (Thanh tra bằng chứng từng câu nói) */}
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-4">
                    <div>
                      <h3 className="text-base font-bold text-[var(--sumi)] flex items-center gap-2">
                        <span>🔍</span> Thanh tra Bằng chứng & Nhận xét Từng Lượt nói (Turn Evidence Inspector)
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--sumi-muted)]">
                        Chi tiết từng phát ngôn, căn cứ xếp hạng N5/N4/N3 và nhận xét của AI.
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--paper-200)] px-3 py-1 text-xs font-bold text-[var(--sumi)]">
                      {detail.turnEvidences.length} lượt đánh giá
                    </span>
                  </div>

                  <div className="mt-5 flex flex-col gap-4">
                    {detail.messageHistory.map((msg, idx) => {
                      const isAi = msg.sender === 'Ai';
                      // Find corresponding evidence if it is user message
                      const userTurnIndex = Math.floor(idx / 2) + 1;
                      const evidence = !isAi
                        ? detail.turnEvidences.find((e) => e.turnIndex === userTurnIndex) ||
                          detail.turnEvidences[Math.floor(idx / 2)]
                        : null;

                      return (
                        <div
                          key={msg.id || idx}
                          className={`flex flex-col gap-2 rounded-2xl border p-4 ${
                            isAi
                              ? 'border-blue-100 bg-blue-50/40'
                              : 'border-[var(--line)] bg-[var(--paper-100)]'
                          }`}
                        >
                          {/* Message Header */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-xs font-bold">
                              <span>{isAi ? '🏨 Lễ tân (Yamada)' : '👤 Bạn (Tanaka)'}</span>
                              {evidence && (
                                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-black text-blue-800">
                                  {evidence.eventCode}
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-[var(--sumi-faint)]">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>

                          {/* Message Body (Japanese + Furigana) */}
                          <div className="text-base font-medium text-[var(--sumi)] leading-relaxed">
                            {msg.furiganaHtml ? (
                              <span dangerouslySetInnerHTML={{ __html: msg.furiganaHtml }} />
                            ) : (
                              <span>{msg.japaneseText}</span>
                            )}
                          </div>

                          {msg.vietnameseMeaning && (
                            <div className="text-xs text-[var(--sumi-muted)] italic">
                              "{msg.vietnameseMeaning}"
                            </div>
                          )}

                          {/* EVIDENCE CARD (Only for Learner turns) */}
                          {evidence && (
                            <div className="mt-2 rounded-xl border border-[var(--ai)]/30 bg-white p-3.5 shadow-2xs">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]/60 pb-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold text-[var(--sumi-faint)]">
                                    Đánh giá câu nói:
                                  </span>
                                  <span
                                    className={`rounded-md px-2.5 py-0.5 text-xs font-black ${
                                      evidence.demonstratedBand === 'N3'
                                        ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                        : evidence.demonstratedBand === 'N4'
                                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                        : 'bg-blue-100 text-blue-900 border border-blue-200'
                                    }`}
                                  >
                                    Đạt chuẩn {evidence.demonstratedBand}
                                  </span>
                                  <span className="rounded-md bg-[var(--paper-200)] px-2 py-0.5 text-[11px] font-bold text-[var(--sumi)]">
                                    Ý định: {evidence.detectedIntent}
                                  </span>
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 font-mono">
                                    Mức hỏi AI: {evidence.promptDifficultyBand}
                                  </span>
                                  {evidence.scaffoldingStepUsed > 0 && (
                                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 font-bold">
                                      Trợ giúp: Bước {evidence.scaffoldingStepUsed}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
                                  <span
                                    className="rounded-md border border-[var(--ai)]/30 bg-[var(--ai-soft)] px-2 py-0.5 text-[var(--ai)] font-black"
                                    title="Điểm trung bình tổng hợp lượt nói (35% Task + 25% Gram + 20% Vocab + 20% Prag)"
                                  >
                                    TB lượt:{' '}
                                    {evidence.overallTurnScore ??
                                      Math.round(
                                        0.35 * evidence.taskFulfillmentScore +
                                          0.25 * evidence.grammarAccuracyScore +
                                          0.2 * evidence.vocabularyRangeScore +
                                          0.2 * evidence.pragmaticsScore
                                      )}
                                    /100
                                  </span>
                                  <span title="Hoàn thành">Task: {evidence.taskFulfillmentScore}</span>
                                  <span>•</span>
                                  <span title="Ngữ pháp">Gram: {evidence.grammarAccuracyScore}</span>
                                  <span>•</span>
                                  <span title="Từ vựng">Vocab: {evidence.vocabularyRangeScore}</span>
                                  <span>•</span>
                                  <span title="Lịch thiệp">Prag: {evidence.pragmaticsScore}</span>
                                </div>
                              </div>

                              {/* AI Evidence Note & Reasoning */}
                              {evidence.evidenceNote && (
                                <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-[var(--ai-soft)]/50 p-2.5 text-xs text-[var(--sumi)]">
                                  <span className="text-base flex-none">📝</span>
                                  <div>
                                    <strong className="text-[var(--ai)]">Căn cứ đánh giá của AI: </strong>
                                    <span>{evidence.evidenceNote}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Disclaimer */}
                {detail.disclaimer && (
                  <p className="text-center text-xs text-[var(--sumi-faint)] italic px-4">
                    {detail.disclaimer}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
