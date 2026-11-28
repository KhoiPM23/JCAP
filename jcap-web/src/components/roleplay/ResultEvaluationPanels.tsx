import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon, CheckIcon } from "../common/Icons";

export const getGaugeRank = (s: number) => {
  if (s >= 90) return { title: "XUẤT SẮC", color: "text-amber-300" };
  if (s >= 80) return { title: "THÀNH THẠO", color: "text-emerald-300" };
  if (s >= 70) return { title: "KHÁ TỐT", color: "text-sky-300" };
  if (s >= 60) return { title: "ĐẠT CHUẨN", color: "text-blue-200" };
  return { title: "CHƯA ĐẠT", color: "text-rose-300" };
};

export const AnimatedScoreGauge = ({ score }: { score: number }) => {
  // Điểm số không chạy từ 0 mà hiệu chỉnh từ khoảng cận đích (e.g. 70% điểm thực tế)
  const startScore = useMemo(() => {
    if (score <= 15) return 0;
    return Math.max(5, Math.floor(score * 0.7));
  }, [score]);
  const [displayScore, setDisplayScore] = useState(startScore);
  const [fillPercent, setFillPercent] = useState(0);
  const rankInfo = useMemo(() => getGaugeRank(score), [score]);

  // Xác định hệ 3 màu động theo tiêu chuẩn: Đạt chuẩn (>= 75: Xanh ngọc), Trung bình (50-74: Vàng hổ phách), Thấp (< 50: Đỏ son)
  const colorTier = useMemo(() => {
    if (score >= 75) {
      return {
        gradStart: "#34d399", // Emerald 400
        gradEnd: "#10b981",   // Emerald 500
        glowRgba: "rgba(16, 185, 129, 0.65)",
        ambientRadial: "radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(6, 182, 212, 0.15) 100%)",
      };
    }
    if (score >= 50) {
      return {
        gradStart: "#fbbf24", // Amber 400
        gradEnd: "#f59e0b",   // Amber 500
        glowRgba: "rgba(245, 158, 11, 0.65)",
        ambientRadial: "radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, rgba(217, 119, 6, 0.15) 100%)",
      };
    }
    return {
      gradStart: "#f87171", // Rose 400
      gradEnd: "#ef4444",   // Red 500
      glowRgba: "rgba(239, 68, 68, 0.65)",
      ambientRadial: "radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, rgba(185, 28, 28, 0.15) 100%)",
    };
  }, [score]);

  useEffect(() => {
    const duration = 1500;
    const startTime = performance.now();
    const scoreSpan = score - startScore;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth Ease-Out Deceleration: Lướt nhanh ở đoạn đầu rồi hãm phanh êm ái khi gần chạm mốc
      const easeProgress = 1 - Math.pow(1 - progress, 3.5);

      setFillPercent(easeProgress * score);
      setDisplayScore(Math.round(startScore + easeProgress * scoreSpan));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [score, startScore]);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (fillPercent / 100) * circumference;

  return (
    <div className="relative grid h-36 w-36 sm:h-44 sm:w-44 place-items-center rounded-full p-2 select-none shrink-0">
      <div
        className="absolute inset-2 rounded-full opacity-35 blur-xl transition-all duration-700 pointer-events-none"
        style={{ background: colorTier.ambientRadial }}
      />

      <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 128 128">
        <defs>
          <linearGradient
            id="scoreRingGradDynamic"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={colorTier.gradStart} />
            <stop offset="100%" stopColor={colorTier.gradEnd} />
          </linearGradient>
        </defs>

        <circle
          cx="64"
          cy="64"
          r={radius}
          stroke="rgba(255, 255, 255, 0.18)"
          strokeWidth="9"
          fill="none"
        />

        <circle
          cx="64"
          cy="64"
          r={radius}
          stroke="url(#scoreRingGradDynamic)"
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
            filter: `drop-shadow(0 0 10px ${colorTier.glowRgba})`,
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl sm:text-5xl font-black font-sans tracking-tight text-white drop-shadow-sm font-mono">
          {displayScore}
        </span>

        <span className={`text-[10px] sm:text-[11px] font-sans font-extrabold tracking-wider mt-0.5 ${rankInfo.color}`}>
          {rankInfo.title}
        </span>
      </div>
    </div>
  );
};

/** Khối Năng lực Đối thoại & Đa giác 6 Kỹ năng Hợp nhất (Unified Hexagonal Evaluation Panel) */
export const UnifiedHexagonEvaluationPanel: React.FC<{
  grammar: number;
  vocabulary: number;
  impression: number;
  fluency: number | null;
  clarity: number | null;
  autonomy: number;
  hasActualVoice: boolean;
  averageResponseLatencySeconds?: number | null;
  averageSpeechPace?: number | null;
}> = ({
  grammar,
  vocabulary,
  impression,
  fluency,
  clarity,
  autonomy,
  hasActualVoice,
  averageResponseLatencySeconds,
  averageSpeechPace,
}) => {
  const getStatusHex = (score: number, exempt?: boolean) =>
    exempt ? '#64748b' : score >= 75 ? '#059669' : score >= 50 ? '#D97706' : '#DC2626';

  const axes = useMemo(() => [
    {
      id: 'grammar',
      label: 'Ngữ pháp',
      score: grammar,
      accentHex: getStatusHex(grammar),
      shortStatus: grammar >= 80 ? 'Đúng chuẩn trợ từ' : 'Lưu ý trợ từ',
      diagnostic: grammar >= 80
        ? 'Cấu trúc câu hoàn chỉnh, phối hợp chính xác giữa trợ từ và thể khẳng định/phủ định.'
        : 'Có một số lượt nhầm lẫn trợ từ không gian hoặc chia thể động từ chưa trọn vẹn.',
      drillHint: 'Xem lại các mẫu ngữ pháp cần củng cố ở danh sách bên dưới.',
    },
    {
      id: 'vocabulary',
      label: 'Từ vựng',
      score: vocabulary,
      accentHex: getStatusHex(vocabulary),
      shortStatus: vocabulary >= 80 ? 'Vốn từ phong phú' : 'Mở rộng vốn từ',
      diagnostic: vocabulary >= 80
        ? 'Vốn từ vựng tình huống vững vàng, ứng biến linh hoạt theo diễn biến của kịch bản.'
        : 'Bạn còn lặp lại một số từ đơn giản hoặc mất thời gian tìm từ thay thế.',
      drillHint: 'Lưu các từ vựng cần ôn vào Flashcards để rèn luyện ghi nhớ.',
    },
    {
      id: 'impression',
      label: 'Văn phong',
      score: impression,
      accentHex: getStatusHex(impression),
      shortStatus: impression >= 80 ? 'Lịch sự chuẩn mực' : 'Cần trau chuốt',
      diagnostic: impression >= 80
        ? 'Giữ vững sắc thái lịch sự (です・ます) phù hợp với vai vế đối thoại.'
        : 'Đôi lúc có sự đan xen giữa thể thông thường và thể lịch sự trong cùng bối cảnh.',
      drillHint: 'Chú ý cách xưng hô và thể câu lịch sự với nhân vật đối thoại.',
    },
    {
      id: 'fluency',
      label: 'Phản xạ',
      score: hasActualVoice && fluency != null ? fluency : 85,
      accentHex: getStatusHex(hasActualVoice && fluency != null ? fluency : 85, !hasActualVoice),
      exempt: !hasActualVoice,
      shortStatus: !hasActualVoice
        ? 'Miễn trừ (Gõ phím)'
        : (averageResponseLatencySeconds
            ? `~${averageResponseLatencySeconds.toFixed(1)}s · ${
                averageResponseLatencySeconds <= 3.5
                  ? 'Nhanh nhẹn'
                  : averageResponseLatencySeconds <= 7.0
                    ? 'Ổn định'
                    : 'Ngập ngừng lâu'
              }`
            : 'Nhịp đối đáp ổn định'),
      diagnostic: !hasActualVoice
        ? 'Phiên này bạn nhập câu trả lời bằng bàn phím nên hệ thống miễn trừ tính điểm phản xạ âm thanh.'
        : ((averageResponseLatencySeconds && averageResponseLatencySeconds <= 3.5)
            ? 'Bắt nhịp câu hỏi của nhân vật rất nhanh, giữ được luồng đàm thoại tự nhiên.'
            : (averageResponseLatencySeconds && averageResponseLatencySeconds <= 7.0)
              ? 'Thời gian phản hồi ổn định. Có thể dùng câu đệm ngắn để vào nhịp nhanh hơn.'
              : 'Thời gian suy nghĩ khởi lời còn ngập ngừng khá lâu. Hãy bật ngay câu đệm ngắn (はい、すみません) để giữ nhịp.'),
      drillHint: 'Tập phản xạ câu đệm (はい、そうですね) ngay khi nhân vật vừa dứt lời.',
    },
    {
      id: 'clarity',
      label: 'Độ rõ âm',
      score: hasActualVoice && clarity != null ? clarity : 85,
      accentHex: getStatusHex(hasActualVoice && clarity != null ? clarity : 85, !hasActualVoice),
      exempt: !hasActualVoice,
      shortStatus: !hasActualVoice
        ? 'Miễn trừ (Gõ phím)'
        : (averageSpeechPace
            ? (averageSpeechPace < 2.5 ? 'Chậm' : averageSpeechPace <= 5.0 ? 'Vừa phải' : 'Nhanh')
            : 'Phát âm rõ ràng'),
      diagnostic: !hasActualVoice
        ? 'Phiên này bạn nhập câu trả lời bằng bàn phím nên hệ thống miễn trừ tính điểm độ rõ âm qua micro.'
        : ((clarity != null && clarity >= 80)
            ? 'Micro bắt âm rất rõ ràng, âm lượng và khẩu hình phát âm tiếng Nhật đạt chuẩn tốt.'
            : 'Một số âm cuối câu hoặc âm ngắt, trường âm còn hơi nhỏ khiến nhận diện chưa tối ưu.'),
      drillHint: 'Luyện Shadowing các câu thoại ngắn để rèn độ mở khẩu hình và giữ hơi đều.',
    },
    {
      id: 'autonomy',
      label: 'Tự chủ',
      score: autonomy,
      accentHex: getStatusHex(autonomy),
      shortStatus: autonomy >= 95 ? 'Độc lập hoàn toàn' : 'Có dùng gợi ý',
      diagnostic: autonomy >= 95
        ? 'Xuất sắc! Bạn hoàn thành toàn bộ cuộc đối thoại bằng phản xạ tự nhiên, không cần mở câu gợi ý.'
        : 'Bạn có mở xem gợi ý đối thoại trong phiên để hoàn thành mốc giao tiếp cốt lõi.',
      drillHint: 'Ở các lượt luyện lại, hãy thử thách bản thân nói tự nhiên trước khi mở gợi ý.',
    },
  ], [grammar, vocabulary, impression, fluency, clarity, autonomy, hasActualVoice, averageResponseLatencySeconds, averageSpeechPace]);

  const [selectedAxis, setSelectedAxis] = useState<string>(() => {
    const sorted = [...axes].sort((a, b) => (a.exempt ? 999 : a.score) - (b.exempt ? 999 : b.score));
    return sorted[0]?.id || 'grammar';
  });

  const active = axes.find((a) => a.id === selectedAxis) || axes[0];

  const cx = 175;
  const cy = 150;
  const maxR = 96;

  const gridRings = [0.25, 0.5, 0.75, 1.0].map((scale) => {
    return axes.map((_, i) => {
      const angle = (i * 60 - 90) * (Math.PI / 180);
      return `${cx + maxR * scale * Math.cos(angle)},${cy + maxR * scale * Math.sin(angle)}`;
    }).join(' ');
  });

  const benchmarkPoly = axes.map((_, i) => {
    const angle = (i * 60 - 90) * (Math.PI / 180);
    return `${cx + maxR * 0.8 * Math.cos(angle)},${cy + maxR * 0.8 * Math.sin(angle)}`;
  }).join(' ');

  const learnerPoly = axes.map((axis, i) => {
    const angle = (i * 60 - 90) * (Math.PI / 180);
    const score = Math.max(15, Math.min(100, axis.score));
    const r = (score / 100) * maxR;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--line-strong)] bg-[var(--paper-50)] p-5 sm:p-7 shadow-xs washi-parchment">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4 mb-6">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-bold text-[var(--ai)] uppercase tracking-wider bg-[var(--ai-soft)] px-3 py-1 rounded-full border border-[var(--ai)]/20 shadow-2xs">
            NĂNG LỰC ĐỐI THOẠI
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold text-[var(--sumi-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500/30 border border-sky-500" />
            <span>Bạn</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-b-2 border-dashed border-amber-500" />
            <span>Chuẩn 80đ</span>
          </span>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="relative mx-auto w-full max-w-[320px] aspect-[350/300] select-none">
            <svg viewBox="0 0 350 300" className="w-full h-full overflow-visible">
              <defs>
                <radialGradient id="rpgVictoryRadarGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.18" />
                </radialGradient>
              </defs>

              {gridRings.map((pts, idx) => (
                <polygon
                  key={idx}
                  points={pts}
                  fill={idx % 2 === 0 ? 'rgba(241, 245, 249, 0.45)' : 'none'}
                  stroke="#cbd5e1"
                  strokeWidth={idx === 3 ? '1.5' : '0.8'}
                  strokeDasharray={idx < 3 ? '3 3' : undefined}
                />
              ))}

              {axes.map((axis, i) => {
                const angle = (i * 60 - 90) * (Math.PI / 180);
                const isSel = selectedAxis === axis.id;
                return (
                  <line
                    key={`spoke-${axis.id}`}
                    x1={cx}
                    y1={cy}
                    x2={cx + maxR * Math.cos(angle)}
                    y2={cy + maxR * Math.sin(angle)}
                    stroke={isSel ? axis.accentHex : '#94a3b8'}
                    strokeWidth={isSel ? '2' : '0.8'}
                    strokeDasharray="2 2"
                  />
                );
              })}

              <polygon
                points={benchmarkPoly}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.2"
                strokeDasharray="4 4"
                opacity="0.8"
              />

              <polygon
                points={learnerPoly}
                fill="url(#rpgVictoryRadarGrad)"
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />

              <circle cx={cx} cy={cy} r="3" fill="#64748b" />

              {axes.map((axis, i) => {
                const angle = (i * 60 - 90) * (Math.PI / 180);
                const score = Math.max(15, Math.min(100, axis.score));
                const r = (score / 100) * maxR;
                const nodeX = cx + r * Math.cos(angle);
                const nodeY = cy + r * Math.sin(angle);
                const labelX = cx + (maxR + 28) * Math.cos(angle);
                const labelY = cy + (maxR + 28) * Math.sin(angle);
                const isSel = selectedAxis === axis.id;

                return (
                  <g
                    key={`vertex-${axis.id}`}
                    className="cursor-pointer"
                    onClick={() => setSelectedAxis(axis.id)}
                  >
                    {isSel && (
                      <circle cx={nodeX} cy={nodeY} r="12" fill={axis.accentHex} opacity="0.3" className="animate-pulse" />
                    )}
                    <circle
                      cx={nodeX}
                      cy={nodeY}
                      r={isSel ? '6' : '4'}
                      fill={isSel ? '#ffffff' : axis.accentHex}
                      stroke={isSel ? axis.accentHex : '#ffffff'}
                      strokeWidth="2.5"
                    />
                    <text
                      x={labelX}
                      y={labelY - 5}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="font-sans font-bold text-[10px] transition-colors duration-200"
                      fill={isSel ? axis.accentHex : 'var(--sumi)'}
                    >
                      {axis.label}
                    </text>
                    <text
                      x={labelX}
                      y={labelY + 8}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="font-mono font-bold text-[10px] transition-colors duration-200"
                      fill={isSel ? axis.accentHex : 'var(--sumi-muted)'}
                    >
                      {axis.exempt ? '--' : `${axis.score}`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-white/95 p-4 shadow-2xs transition-all duration-300">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--line)]/70">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: active.accentHex }}
                />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-muted)] whitespace-nowrap">
                    Kỹ năng đang xem
                  </div>
                  <h4 className="text-sm font-bold text-[var(--sumi)] leading-tight whitespace-nowrap">
                    {active.label} ({active.exempt ? 'Miễn trừ' : `${active.score}/100`})
                  </h4>
                </div>
              </div>

              <span
                className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs whitespace-nowrap shrink-0"
                style={{
                  color: active.accentHex,
                  backgroundColor: `${active.accentHex}15`,
                  borderColor: `${active.accentHex}40`,
                }}
              >
                {active.shortStatus}
              </span>
            </div>

            <p className="mt-2.5 text-xs text-[var(--sumi)] leading-relaxed">
              {active.diagnostic}
            </p>

            <div className="mt-2.5 rounded-xl bg-[var(--paper-100)] border border-[var(--line)]/60 p-2 text-[11px] text-[var(--sumi-muted)] flex items-start gap-1.5">
              <span className="font-bold text-[var(--sumi)] shrink-0">Gợi ý:</span>
              <span>{active.drillHint}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-[var(--sumi)] uppercase tracking-wider font-sans">
              Chi tiết Kỹ năng Thực chiến
            </span>
            <span className="text-[11px] text-[var(--sumi-muted)] italic">
              * Chọn thẻ hoặc đỉnh đa giác để xem chi tiết
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {axes.map((axis) => {
              const isSel = selectedAxis === axis.id;
              const isNumber = typeof axis.score === 'number' && !axis.exempt;
              const fillPct = isNumber ? Math.min(Math.max(axis.score, 0), 100) : 0;

              return (
                <button
                  key={axis.id}
                  type="button"
                  onClick={() => setSelectedAxis(axis.id)}
                  className={`group relative overflow-hidden flex flex-col justify-between rounded-2xl p-3.5 sm:p-4 text-left transition-all duration-200 cursor-pointer tactile-press min-h-[120px] ${
                    isSel
                      ? 'border-2 border-[var(--ai)] bg-sky-50/70 shadow-sm ring-2 ring-[var(--ai)]/20'
                      : 'border border-stone-200/90 bg-white hover:border-[var(--ai)]/50 hover:bg-slate-50/70 shadow-2xs'
                  }`}
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110"
                          style={{ backgroundColor: axis.accentHex }}
                        />
                        <span className="text-xs font-bold text-slate-800 font-sans whitespace-nowrap">
                          {axis.label}
                        </span>
                        {isSel && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--ai)] animate-pulse shrink-0" title="Đang xem" />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-mono font-black text-slate-900">
                          {isNumber ? `${axis.score}/100` : 'Miễn trừ'}
                        </span>
                      </div>
                    </div>

                    <p className="mt-1 text-[11px] font-medium text-slate-600 truncate leading-tight" title={axis.shortStatus}>
                      {axis.shortStatus}
                    </p>
                  </div>

                  <div className="relative z-10 pt-2.5 mt-auto">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 p-0.25 border border-slate-200/80 shadow-inner">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${fillPct}%`,
                          backgroundColor: axis.accentHex,
                        }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-6 pt-4 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--sumi-muted)]">
        <div className="flex items-center gap-2">
          <CheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Kết quả đối thoại vừa được ghi nhận và đồng bộ vào <strong>Hồ sơ Năng lực</strong> của bạn.</span>
        </div>
        <Link
          to="/profile/competency"
          className="inline-flex items-center gap-1.5 text-[var(--ai)] hover:text-[var(--ai-hover)] font-bold transition hover:underline"
        >
          <span>Xem Hồ sơ Năng lực</span>
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
