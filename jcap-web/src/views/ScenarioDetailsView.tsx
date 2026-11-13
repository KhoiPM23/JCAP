import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { scenarioService } from '../services/scenarioService';
import { roleplayService } from '../services/roleplayService';
import { scenarioVoiceService } from '../services/scenarioVoiceService';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import { cleanPedagogicMeaning } from '../utils/japaneseSanitizer';
import { useAuth } from '../contexts/AuthContext';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';
import { AlertCircleIcon, RefreshIcon, CompassIcon, VolumeIcon } from '../components/common/Icons';
import type { ScenarioDetails, ScenarioLevelConfiguration } from '../types/scenarioDetails';
import type { ActiveRoleplaySessionDto } from '../types/roleplay';

interface LevelStyleMeta {
  bg: string;
  text: string;
  border: string;
  ring: string;
  accent: string;
  badgeLabel: string;
  descLabel: string;
}

const levelMeta: Record<ScenarioLevelConfiguration['jlptLevel'], LevelStyleMeta> = {
  N5: {
    bg: 'bg-emerald-50/80',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    ring: 'ring-emerald-500',
    accent: 'var(--n5)',
    badgeLabel: 'JLPT N5',
    descLabel: 'Cơ bản (Beginner)',
  },
  N4: {
    bg: 'bg-sky-50/80',
    text: 'text-sky-800',
    border: 'border-sky-200',
    ring: 'ring-sky-500',
    accent: 'var(--n4)',
    badgeLabel: 'JLPT N4',
    descLabel: 'Sơ trung (Elementary)',
  },
  N3: {
    bg: 'bg-purple-50/80',
    text: 'text-purple-800',
    border: 'border-purple-200',
    ring: 'ring-purple-500',
    accent: 'var(--n3)',
    badgeLabel: 'JLPT N3',
    descLabel: 'Trung cấp (Intermediate)',
  },
};

// Thứ tự cấp độ JLPT từ thấp đến cao (cơ bản -> nâng cao)
const jlptRank: Record<string, number> = {
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
};

const sortLevelsByRank = (levels: ScenarioLevelConfiguration[]): ScenarioLevelConfiguration[] => {
  return [...levels].sort((a, b) => {
    const rankA = jlptRank[a.jlptLevel] ?? 99;
    const rankB = jlptRank[b.jlptLevel] ?? 99;
    return rankA - rankB;
  });
};

const checkHasActiveSession = (session?: ActiveRoleplaySessionDto | null): boolean => {
  if (!session) return false;
  return session.hasActiveSession === true;
};

export const ScenarioDetailsView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ scenarioId?: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // Ưu tiên param trong URL > state > fallback 1
  const rawId = params.scenarioId || (location.state as { scenarioId?: number } | null)?.scenarioId;
  const scenarioId = Number(rawId) > 0 ? Number(rawId) : 1;

  const [searchParams] = useSearchParams();
  const rawReturnUrl = searchParams.get('return');
  const returnUrl = rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//')
    ? rawReturnUrl
    : ((location.state as any)?.returnUrl ?? null);

  const [scenario, setScenario] = useState<ScenarioDetails | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveRoleplaySessionDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<ScenarioLevelConfiguration['jlptLevel']>('N5');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    targetLevel: string;
    isSwitchingLevel: boolean;
  } | null>(null);

  // Tab switch giữa từ vựng và ngữ pháp trọng tâm
  const [cheatsheetTab, setCheatsheetTab] = useState<'vocab' | 'grammar'>('vocab');
  const isBlindRequested = searchParams.get('mode') === 'blind' || searchParams.get('blind') === 'true';

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      const [scenarioRes, sessionRes] = await Promise.all([
        scenarioService.getDetails(scenarioId),
        roleplayService.getActiveSession(scenarioId),
      ]);

      if (!isMounted) return;

      if (scenarioRes.success && scenarioRes.data) {
        setScenario(scenarioRes.data);
        const sorted = sortLevelsByRank(scenarioRes.data.levelConfigurations);
        const lowestLevel = sorted[0]?.jlptLevel;
        if (lowestLevel) setActiveLevel(lowestLevel);
      } else {
        setError(scenarioRes.message || 'Không thể tải dữ liệu kịch bản.');
      }

      if (sessionRes.success && sessionRes.data) {
        setActiveSession(sessionRes.data);
        const hasActive = checkHasActiveSession(sessionRes.data);
        const sessionLevel = sessionRes.data.level || sessionRes.data.jlptLevel;
        // Nếu đang có session dở dang, tự động chọn tab level đó cho tiện
        if (hasActive && sessionLevel) {
          const matchLevel = sessionLevel as ScenarioLevelConfiguration['jlptLevel'];
          if (['N5', 'N4', 'N3'].includes(matchLevel)) {
            setActiveLevel(matchLevel);
          }
        }
      }

      setIsLoading(false);
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [scenarioId]);

  const hasActiveSession = checkHasActiveSession(activeSession);
  const activeSessionId = activeSession?.activeSessionId || activeSession?.sessionId;
  const activeSessionLevel = activeSession?.level || activeSession?.jlptLevel;

  // Danh sách cấp độ được sắp xếp tăng dần theo độ khó (N5 -> N4 -> N3)
  const sortedLevelConfigurations = useMemo(() => {
    if (!scenario?.levelConfigurations) return [];
    return sortLevelsByRank(scenario.levelConfigurations);
  }, [scenario?.levelConfigurations]);

  const selectedLevel = useMemo(
    () =>
      sortedLevelConfigurations.find((level) => level.jlptLevel === activeLevel) ??
      sortedLevelConfigurations[0],
    [activeLevel, sortedLevelConfigurations]
  );

  const isSelectedLevelActive = Boolean(
    hasActiveSession && selectedLevel && selectedLevel.jlptLevel === activeSessionLevel
  );

  const targetLevelConfig = useMemo(() => {
    if (!confirmModal?.targetLevel) return null;
    return scenario?.levelConfigurations.find(
      (level) => level.jlptLevel === confirmModal.targetLevel
    );
  }, [confirmModal?.targetLevel, scenario?.levelConfigurations]);

  const executeStartSession = async (levelToStart: string, forceRestart: boolean) => {
    setIsStarting(true);
    setStartError(null);

    const result = await roleplayService.startSession(scenarioId, levelToStart, forceRestart);

    if (result.success && result.data) {
      setConfirmModal(null);
      const targetSessionId = result.data.sessionId || result.data.id;
      const blindSuffix = isBlindRequested ? "?mode=blind" : "";
      const returnParam = returnUrl ? `${blindSuffix ? "&" : "?"}return=${encodeURIComponent(returnUrl)}` : "";
      navigate(`/scenarios/practice/${targetSessionId}${blindSuffix}${returnParam}`);
    } else {
      setConfirmModal(null);
      setStartError(result.message || 'Không thể bắt đầu phiên luyện tập. Vui lòng thử lại.');
      setIsStarting(false);
    }
  };

  const handleStartPractice = async (forceRestart: boolean = false, targetLevel?: string) => {
    const levelToStart = targetLevel || selectedLevel?.jlptLevel;
    if (!levelToStart) return;

    if (forceRestart) {
      setConfirmModal({
        targetLevel: levelToStart,
        isSwitchingLevel: Boolean(activeSessionLevel && activeSessionLevel !== levelToStart),
      });
      return;
    }

    await executeStartSession(levelToStart, false);
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] bg-transparent px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="relative flex items-center justify-center">
          <div className="h-14 w-14 rounded-full border-4 border-[var(--line)] border-t-[var(--ai)] animate-spin" />
          <span className="absolute text-xs font-sans font-bold text-[var(--ai)]">AI</span>
        </div>
        <p className="mt-5 text-sm font-sans font-bold tracking-wide text-[var(--sumi)]">
          Đang nạp dữ liệu kịch bản hội thoại...
        </p>
        <p className="mt-1 text-xs text-[var(--sumi-faint)]">
          Chuẩn bị bối cảnh, nhiệm vụ thực chiến và nhân vật đàm thoại
        </p>
      </div>
    );
  }

  if (error || !scenario || !selectedLevel) {
    return (
      <div className="min-h-[60vh] bg-transparent px-4 py-16">
        <div className="mx-auto w-full max-w-xl rounded-3xl border border-red-200 bg-[var(--paper-50)] p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600">
            <AlertCircleIcon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="mt-4 text-lg font-bold font-sans text-[var(--sumi)]">
            Không thể tải thông tin kịch bản
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[var(--sumi-muted)]">
            {error || 'Kịch bản yêu cầu không tồn tại hoặc đã được chuyển vào kho lưu trữ.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button type="button" onClick={() => navigate(returnUrl || '/scenarios')} className="shadow-xs">
              ← {returnUrl ? 'Quay lại Bản đồ Khám phá' : 'Quay lại Thư viện kịch bản'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentMeta = levelMeta[selectedLevel.jlptLevel] || levelMeta.N5;
  const minMinutes = Math.max(5, (selectedLevel.missions?.length ?? 3) * 2);
  const maxMinutes = Math.max(10, (selectedLevel.missions?.length ?? 3) * 3);

  return (
    <div className="relative mx-auto flex w-full max-w-[1160px] flex-col gap-4 bg-transparent pb-10 select-none text-[var(--sumi)]">
      {/* Top Breadcrumb Bar — tinh gọn, không vạch ngăn thừa */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(returnUrl || '/scenarios')}
            className="group inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--sumi-muted)] transition-all hover:border-[var(--ai)] hover:text-[var(--ai)] shadow-2xs active:scale-95 cursor-pointer"
          >
            <span className="transition-transform group-hover:-translate-x-0.5" aria-hidden="true">←</span>
            <span>{returnUrl ? 'Bản đồ Khám phá' : 'Thư viện tình huống'}</span>
          </button>
          <span className="text-xs text-[var(--sumi-faint)]">/</span>
          <span className="text-xs font-semibold text-[var(--sumi-muted)] truncate max-w-[220px] sm:max-w-sm">
            {scenario.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-[var(--line)] bg-white/90 px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--ai)]">
            {scenario.scenarioCode || `SCN-${String(scenario.id).padStart(3, '0')}`}
          </span>

          {isAdmin && (
            <Link
              to={`/admin/scenarios/edit/${scenario.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 active:scale-95"
              title="Mở trong hệ thống CMS Quản trị"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Chỉnh sửa CMS</span>
            </Link>
          )}
        </div>
      </div>

      {/* Main 2-Column Responsive Layout — giữ 2 cột từ lg (1024px+) cho laptop & desktop */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">

        {/* Left Column: 2 khối liền mạch (Overview+Setup + Missions), bỏ box-in-box thừa */}
        <div className="min-w-0 space-y-4">

          {/* Khối 1: Hero & Thiết lập cấp độ Hợp nhất (Zero trùng lặp, liền mạch 1 bề mặt) */}
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white/95 shadow-xs">
            {/* Phần 1A: Scenario Identity Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 p-4 sm:p-5">
              <div className="relative group overflow-hidden rounded-xl border border-[var(--line)]/80 bg-[var(--paper-100)] w-full sm:w-32 md:w-36 aspect-[16/9] sm:aspect-square shrink-0">
                <img
                  src={scenario.thumbnail || '/images/scenario-placeholder.svg'}
                  alt={scenario.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/images/scenario-placeholder.svg';
                  }}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ai)]">
                  Hội thoại AI phản xạ · Thực chiến
                </span>

                <h1 className="mt-1 text-xl sm:text-2xl font-extrabold font-sans text-[var(--sumi)] leading-snug tracking-tight">
                  {scenario.title}
                </h1>

                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--sumi-muted)] line-clamp-3">
                  {scenario.description}
                </p>
              </div>
            </div>

            {/* Phần 1B: Bộ chọn cấp độ tích hợp (1 vị trí duy nhất, không lặp lại) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)]/70 bg-[var(--paper-50)]/70 px-4 sm:px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--sumi)]">Cấp độ luyện tập:</span>
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${currentMeta.bg} ${currentMeta.text} ${currentMeta.border}`}>
                  {currentMeta.descLabel}
                </span>
              </div>

              <div
                className="inline-flex items-center gap-1 rounded-xl bg-[var(--paper-100)] p-1 border border-[var(--line)]/80"
                role="tablist"
                aria-label="Chọn cấp độ JLPT"
              >
                {sortedLevelConfigurations.map((level) => {
                  const isSelected = activeLevel === level.jlptLevel;
                  const isLevelInProgress = hasActiveSession && activeSessionLevel === level.jlptLevel;
                  const meta = levelMeta[level.jlptLevel] || levelMeta.N5;
                  return (
                    <button
                      key={level.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => {
                        ukiyoSound.playSubtleTap();
                        setActiveLevel(level.jlptLevel);
                        setStartError(null);
                      }}
                      className={`relative inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                        isSelected
                          ? `bg-white ${meta.text} shadow-2xs ring-1 ring-[var(--line)]`
                          : 'text-[var(--sumi-muted)] hover:text-[var(--sumi)]'
                      }`}
                    >
                      <span>JLPT {level.jlptLevel}</span>
                      {isLevelInProgress && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-amber-500"
                          title="Đang có phiên dở dang ở cấp độ này"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phần 1C: Nhân vật & Bối cảnh chia ngăn mảnh trên cùng bề mặt (bỏ box lồng box) */}
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--line)]/70 border-t border-[var(--line)]/70">
              {/* Người đối thoại AI */}
              <div className="p-4 sm:px-5 sm:py-4 flex items-start gap-3">
                <LivingAvatar
                  size="sm"
                  avatarState="idle"
                  personaName={selectedLevel.aiPersona}
                  scenarioTitle={scenario.title}
                  hideLabel
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                    Người đối thoại
                  </p>
                  <h3 className="text-[13px] font-bold font-sans text-[var(--sumi)] leading-snug mt-0.5">
                    {selectedLevel.aiPersona}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--sumi-muted)]">
                    Phản hồi tự nhiên theo ngữ cảnh văn hóa Nhật, điều chỉnh nhịp thoại theo câu trả lời của bạn.
                  </p>
                </div>
              </div>

              {/* Bối cảnh giao tiếp */}
              <div className="p-4 sm:px-5 sm:py-4 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200/80 mt-0.5">
                  <CompassIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                    Bối cảnh tình huống
                  </p>
                  <h3 className="text-[13px] font-bold font-sans text-[var(--sumi)] leading-snug mt-0.5 break-words" title={selectedLevel.title}>
                    {selectedLevel.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--sumi-muted)] break-words">
                    {selectedLevel.description}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Khối 2: Nhiệm vụ cần hoàn thành — Checklist liền mạch dễ quét */}
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white/95 shadow-xs">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--line)]/70">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold font-sans text-[var(--sumi)]">
                  Nhiệm vụ cần hoàn thành
                </h2>
                <span className="hidden sm:inline text-xs text-[var(--sumi-faint)]">
                  · Hoàn thành lần lượt trong hội thoại
                </span>
              </div>
              <span className="rounded-lg bg-[var(--ai-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--ai)] shrink-0">
                {selectedLevel.missions.length} mục tiêu
              </span>
            </div>

            <div className="divide-y divide-[var(--line)]/60">
              {selectedLevel.missions.map((mission, idx) => (
                <div
                  key={mission.id}
                  className="group flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors hover:bg-[var(--paper-50)]/80"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--paper-100)] font-mono text-[11px] font-bold text-[var(--sumi-muted)] border border-[var(--line)] group-hover:border-[var(--ai)]/50 group-hover:text-[var(--ai)] group-hover:bg-[var(--ai-soft)] transition-colors">
                    {String(mission.order || idx + 1).padStart(2, '0')}
                  </span>

                  <p className="min-w-0 flex-1 text-[13px] sm:text-sm font-medium text-[var(--sumi)] leading-snug">
                    {mission.content}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Launchpad & Preparation Reference — cân nhịp với cột trái */}
        <aside className="space-y-4 lg:sticky lg:top-5 self-start">

          {/* Main Action Launchpad */}
          <section className="rounded-2xl border border-[var(--line)] bg-white/95 p-4 sm:p-5 shadow-xs space-y-3.5">
            {/* Resume Notice nhỏ gọn nếu có phiên dở ở cấp khác */}
            {hasActiveSession && activeSessionId && !isSelectedLevelActive && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="font-semibold text-amber-900 truncate">
                    Đang dở phiên JLPT {activeSessionLevel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (activeSessionLevel === 'N5' || activeSessionLevel === 'N4' || activeSessionLevel === 'N3') {
                      setActiveLevel(activeSessionLevel);
                    }
                  }}
                  className="font-bold text-amber-800 hover:text-amber-950 underline shrink-0 cursor-pointer"
                >
                  Mở →
                </button>
              </div>
            )}

            {/* Header Launchpad */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                  Thiết lập phiên thoại
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-lg font-extrabold font-sans text-[var(--sumi)]">
                    JLPT {selectedLevel.jlptLevel}
                  </h3>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                    isSelectedLevelActive
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : `${currentMeta.bg} ${currentMeta.text} ${currentMeta.border}`
                  }`}>
                    {isSelectedLevelActive ? 'Đang dở dang' : currentMeta.descLabel.split(' (')[0]}
                  </span>
                </div>
              </div>

              <span className="text-[11px] font-semibold text-[var(--sumi-muted)] bg-[var(--paper-100)] border border-[var(--line)] rounded-lg px-2 py-1">
                {minMinutes}–{maxMinutes} phút
              </span>
            </div>

            {/* Progress Breakdown khi có phiên đang dở ở cấp độ này */}
            {isSelectedLevelActive && activeSession && (
              <div className="rounded-xl bg-[var(--paper-50)] p-3 space-y-1.5 border border-[var(--line)]/80 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--sumi-muted)] font-medium">Tiến độ phiên hiện tại</span>
                  <span className="font-bold text-emerald-700">
                    {activeSession.completedMissionsCount ?? 0}/{activeSession.totalMissionsCount ?? 0} nhiệm vụ · {activeSession.messageCount ?? 0} lượt
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--paper-200)] overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${activeSession.totalMissionsCount
                        ? Math.min(100, Math.round(((activeSession.completedMissionsCount ?? 0) / activeSession.totalMissionsCount) * 100))
                        : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Quick Session Specs — gọn 2 dòng nhẹ nhàng thay vì bảng rườm rà */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center rounded-md bg-[var(--paper-100)] px-2 py-1 font-medium text-[var(--sumi-muted)]">
                Đối thoại rảnh tay
              </span>
              <span className="inline-flex items-center rounded-md bg-emerald-50/80 px-2 py-1 font-medium text-emerald-800">
                Chấm điểm tự động sau phiên
              </span>
            </div>

            {startError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Không thể khởi tạo phòng:</span>
                </p>
                <p className="leading-relaxed">{startError}</p>
                {startError.includes('credit') && !isAdmin && (
                  <Link
                    to="/credits"
                    className="inline-block pt-0.5 font-bold text-[var(--ai)] hover:underline"
                  >
                    Nạp thêm Credits tại đây →
                  </Link>
                )}
              </div>
            )}

            {/* Primary CTA — dùng màu chàm chuẩn JCAP var(--ai) thay xanh chói rời rạc */}
            <div className="space-y-1.5 pt-0.5">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                disabled={isStarting}
                onClick={() => {
                  ukiyoSound.playTaikoThud();
                  if (isSelectedLevelActive) {
                    const returnParam = returnUrl ? `?return=${encodeURIComponent(returnUrl)}` : '';
                    navigate(`/scenarios/practice/${activeSessionId}${returnParam}`);
                  } else if (hasActiveSession) {
                    handleStartPractice(true, selectedLevel.jlptLevel);
                  } else {
                    handleStartPractice(false, selectedLevel.jlptLevel);
                  }
                }}
              >
                {isStarting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Đang thiết lập phòng thoại...</span>
                  </>
                ) : isSelectedLevelActive ? (
                  <span>Tiếp tục phiên này (JLPT {selectedLevel.jlptLevel}) →</span>
                ) : hasActiveSession ? (
                  <span>Bắt đầu phiên mới (JLPT {selectedLevel.jlptLevel}) →</span>
                ) : (
                  <span>Bắt đầu hội thoại (JLPT {selectedLevel.jlptLevel}) →</span>
                )}
              </button>

              {isSelectedLevelActive && (
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={() => handleStartPractice(true, selectedLevel.jlptLevel)}
                  className="w-full text-center text-xs font-semibold text-[var(--sumi-faint)] hover:text-red-600 py-1 transition active:scale-95 cursor-pointer"
                >
                  Làm lại từ đầu (JLPT {selectedLevel.jlptLevel})
                </button>
              )}

              <p className="text-center text-[11px] text-[var(--sumi-faint)] pt-0.5">
                {isAdmin
                  ? 'Chế độ Quản trị · Không trừ credit'
                  : isSelectedLevelActive
                    ? 'Tiếp tục phiên không trừ thêm phí mở phòng'
                    : 'Tính credit tự động theo lượt thoại thực tế'}
              </p>
            </div>
          </section>

          {/* Kiến thức trọng tâm — Gọn theo danh sách mảnh (list-divided), bỏ card lồng card */}
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white/95 shadow-xs">
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--line)]/70 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold font-sans text-[var(--sumi)]">
                  Kiến thức trọng tâm
                </h3>
                <span className="text-[11px] font-semibold text-[var(--sumi-faint)]">
                  Chuẩn bị nhanh
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--paper-100)] p-1 border border-[var(--line)]/80 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    setCheatsheetTab('vocab');
                  }}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                    cheatsheetTab === 'vocab'
                      ? 'bg-white text-[var(--ai)] shadow-2xs'
                      : 'text-[var(--sumi-muted)] hover:text-[var(--sumi)]'
                  }`}
                >
                  Từ vựng ({selectedLevel.targetVocabularies.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    setCheatsheetTab('grammar');
                  }}
                  className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                    cheatsheetTab === 'grammar'
                      ? 'bg-white text-[var(--ai)] shadow-2xs'
                      : 'text-[var(--sumi-muted)] hover:text-[var(--sumi)]'
                  }`}
                >
                  Ngữ pháp ({selectedLevel.targetGrammars.length})
                </button>
              </div>
            </div>

            {/* Tab Content: Vocabularies */}
            {cheatsheetTab === 'vocab' && (
              <div className="divide-y divide-[var(--line)]/60 max-h-[340px] overflow-y-auto px-4 sm:px-5">
                {selectedLevel.targetVocabularies.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[var(--sumi-faint)]">
                    Chưa có từ vựng chỉ định cho cấp độ này.
                  </p>
                ) : (
                  selectedLevel.targetVocabularies.map((vocab) => {
                    const posMatch = vocab.meaning.match(/\[(.*?)\]/);
                    const parts = vocab.meaning.split('•').map((p) => p.trim());
                    const mainMeaning = cleanPedagogicMeaning(vocab.meaning);
                    const example = parts.length > 2 ? parts.slice(2).join(' • ') : null;

                    return (
                      <div key={vocab.id} className="py-3 first:pt-3.5 last:pb-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <ruby className="text-[15px] font-bold text-[var(--sumi)] font-jp">
                                {vocab.word}
                                {vocab.reading && <rt className="text-[10px] text-[var(--ai)] font-normal">{vocab.reading}</rt>}
                              </ruby>
                              {posMatch && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--paper-100)] text-[var(--sumi-muted)]">
                                  {posMatch[1]}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-[var(--sumi)] font-medium leading-snug">
                              {mainMeaning}
                            </p>
                            {example && (
                              <p className="mt-1 text-[11px] text-[var(--sumi-muted)] font-jp leading-snug">
                                {example}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => void scenarioVoiceService.playAiSpeech(vocab.word, 2)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--paper-50)] text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-90 cursor-pointer mt-0.5"
                            title="Nghe phát âm chuẩn Tokyo"
                            aria-label={`Nghe phát âm ${vocab.word}`}
                          >
                            <VolumeIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab Content: Grammars */}
            {cheatsheetTab === 'grammar' && (
              <div className="divide-y divide-[var(--line)]/60 max-h-[340px] overflow-y-auto px-4 sm:px-5">
                {selectedLevel.targetGrammars.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[var(--sumi-faint)]">
                    Chưa có cấu trúc ngữ pháp chỉ định cho cấp độ này.
                  </p>
                ) : (
                  selectedLevel.targetGrammars.map((grammar) => {
                    const formulaMatch = grammar.meaning.match(/\[(.*?)\]/);
                    const cleanMeaning = cleanPedagogicMeaning(grammar.meaning);

                    return (
                      <div key={grammar.id} className="py-3 first:pt-3.5 last:pb-3.5 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap justify-between">
                          <p className="font-bold font-mono text-xs text-[var(--ai)]">
                            {grammar.pattern}
                          </p>
                          {formulaMatch && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--ai-soft)] text-[var(--ai)] font-medium">
                              {formulaMatch[1]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--sumi-muted)] font-medium leading-snug">
                          {cleanMeaning}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        </aside>
      </div>

        {/* Confirmation Modal for Resetting / Switching Level */}
        {confirmModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in"
            onClick={() => !isStarting && setConfirmModal(null)}
          >
            <div
              className="w-full max-w-md rounded-3xl bg-[var(--paper-50)] p-6 shadow-2xl border border-[var(--line)] space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${confirmModal.isSwitchingLevel
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-[var(--ai)]'
                    }`}
                >
                  {confirmModal.isSwitchingLevel ? (
                    <svg className="w-5 h-5 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H4" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h16" />
                    </svg>
                  ) : (
                    <RefreshIcon className="w-5 h-5 text-[var(--ai)]" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold font-sans text-[var(--sumi)]">
                    {confirmModal.isSwitchingLevel
                      ? 'Chuyển sang cấp độ mới?'
                      : isAdmin
                        ? 'Làm lại phiên kiểm thử?'
                        : 'Làm lại từ đầu phiên luyện tập?'}
                  </h3>
                  <p className="text-xs text-[var(--sumi-faint)] truncate max-w-xs">
                    Kịch bản: {scenario.title}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--paper-100)] p-4 text-xs space-y-2 border border-[var(--line)]">
                {confirmModal.isSwitchingLevel ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sumi-faint)]">Phiên đang dở dang:</span>
                      <span className="font-semibold text-amber-700">
                        JLPT {activeSessionLevel} ({activeSession?.completedMissionsCount ?? 0}/{activeSession?.totalMissionsCount ?? 0} nhiệm vụ)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sumi-faint)]">Cấp độ mới sẽ bắt đầu:</span>
                      <span className="font-bold text-[var(--ai)]">JLPT {confirmModal.targetLevel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sumi-faint)]">Chi phí lượt thoại:</span>
                      <span className="font-medium text-[var(--sumi)]">
                        {isAdmin
                          ? 'Miễn phí (Admin)'
                          : `Trừ theo lượt thoại thực tế`}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sumi-faint)]">Cấp độ:</span>
                      <span className="font-bold text-[var(--ai)]">JLPT {confirmModal.targetLevel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sumi-faint)]">Tiến độ sẽ đặt lại:</span>
                      <span className="font-bold text-amber-700">
                        {activeSession?.completedMissionsCount ?? 0} / {activeSession?.totalMissionsCount ?? 0} nhiệm vụ đã xong
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--sumi-faint)]">Số lượt thoại:</span>
                      <span className="font-medium text-[var(--sumi)]">
                        {activeSession?.messageCount ?? 0} lượt
                      </span>
                    </div>
                  </>
                )}
              </div>

              <p className="text-xs text-[var(--sumi-muted)] leading-relaxed">
                {confirmModal.isSwitchingLevel ? (
                  <>
                    Bạn đang có phiên {isAdmin ? 'kiểm thử' : 'luyện tập'} dở dang ở cấp độ <strong>JLPT {activeSessionLevel}</strong>. Nếu bắt đầu ở <strong>JLPT {confirmModal.targetLevel}</strong>, phiên cũ sẽ kết thúc{!isAdmin && ' và bắt đầu tính credit theo lượt phiên mới'}.
                  </>
                ) : (
                  <>
                    Làm lại từ đầu sẽ <strong>đặt lại tiến trình nhiệm vụ</strong> của phiên hiện tại. Bạn có chắc chắn muốn bắt đầu lại không?
                  </>
                )}
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  disabled={isStarting}
                  className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] px-4 py-2 text-xs font-semibold text-[var(--sumi-muted)] hover:bg-[var(--paper-100)] transition disabled:opacity-50 active:scale-95"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => executeStartSession(confirmModal.targetLevel, true)}
                  disabled={isStarting}
                  className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 active:scale-95 ${confirmModal.isSwitchingLevel
                      ? 'bg-[var(--ai)] hover:bg-[var(--ai-hover)]'
                      : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                >
                  {isStarting ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      Đang khởi tạo...
                    </span>
                  ) : confirmModal.isSwitchingLevel ? (
                    `Bắt đầu JLPT ${confirmModal.targetLevel}`
                  ) : (
                    'Xác nhận làm lại'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
