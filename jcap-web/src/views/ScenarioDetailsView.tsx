import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { scenarioService } from '../services/scenarioService';
import { roleplayService } from '../services/roleplayService';
import { useAuth } from '../contexts/AuthContext';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';
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

export const ScenarioDetailsView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ scenarioId?: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // Ưu tiên param trong URL > state > fallback 1
  const rawId = params.scenarioId || (location.state as { scenarioId?: number } | null)?.scenarioId;
  const scenarioId = Number(rawId) > 0 ? Number(rawId) : 1;

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
        const sorted = [...scenarioRes.data.levelConfigurations].sort((a, b) => {
          const rankA = jlptRank[a.jlptLevel] ?? 99;
          const rankB = jlptRank[b.jlptLevel] ?? 99;
          return rankA - rankB;
        });
        const lowestLevel = sorted[0]?.jlptLevel;
        if (lowestLevel) setActiveLevel(lowestLevel);
      } else {
        setError(scenarioRes.message || 'Không thể tải dữ liệu kịch bản.');
      }

      if (sessionRes.success && sessionRes.data) {
        setActiveSession(sessionRes.data);
        const hasActive = sessionRes.data.hasActiveSession ?? Boolean(sessionRes.data.sessionId || sessionRes.data.activeSessionId);
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

  const hasActiveSession = Boolean(
    activeSession &&
      (activeSession.hasActiveSession ?? Boolean(activeSession.sessionId || activeSession.activeSessionId))
  );
  const activeSessionId = activeSession?.activeSessionId || activeSession?.sessionId;
  const activeSessionLevel = activeSession?.level || activeSession?.jlptLevel;

  // Danh sách cấp độ được sắp xếp tăng dần theo độ khó (N5 -> N4 -> N3)
  const sortedLevelConfigurations = useMemo(() => {
    if (!scenario?.levelConfigurations) return [];
    return [...scenario.levelConfigurations].sort((a, b) => {
      const rankA = jlptRank[a.jlptLevel] ?? 99;
      const rankB = jlptRank[b.jlptLevel] ?? 99;
      return rankA - rankB;
    });
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
      navigate(`/scenarios/practice/${targetSessionId}`);
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
      <div data-theme="phong-luyen" className="min-h-screen bg-[var(--paper-100)] px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="relative flex items-center justify-center">
          <div className="h-14 w-14 rounded-full border-4 border-[var(--line)] border-t-[var(--ai)] animate-spin" />
          <span className="absolute text-xs font-sans font-bold text-[var(--ai)]">AI</span>
        </div>
        <p className="mt-5 text-sm font-sans font-bold tracking-wide text-[var(--sumi)]">
          Đang nạp dữ liệu kịch bản hội thoại...
        </p>
        <p className="mt-1 text-xs text-[var(--sumi-faint)]">
          Chuẩn bị bối cảnh, nhiệm vụ thực chiến và nhân vật VOICEVOX
        </p>
      </div>
    );
  }

  if (error || !scenario || !selectedLevel) {
    return (
      <div data-theme="phong-luyen" className="min-h-screen bg-[var(--paper-100)] px-4 py-16">
        <div className="mx-auto w-full max-w-xl rounded-3xl border border-red-200 bg-[var(--paper-50)] p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600">
            
          </div>
          <h2 className="mt-4 text-lg font-bold font-sans text-[var(--sumi)]">
            Không thể tải thông tin kịch bản
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[var(--sumi-muted)]">
            {error || 'Kịch bản yêu cầu không tồn tại hoặc đã được chuyển vào kho lưu trữ.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button type="button" onClick={() => navigate('/scenarios')} className="shadow-xs">
              ← Quay lại Thư viện kịch bản
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentMeta = levelMeta[selectedLevel.jlptLevel] || levelMeta.N5;

  return (
    <div data-theme="phong-luyen" className="min-h-screen bg-[var(--paper-100)] text-[var(--sumi)] px-4 py-6 md:px-8 select-none">
      <div className="mx-auto w-full max-w-[1240px] space-y-6">

        {/* Top Header & Breadcrumb Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)]/60 pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/scenarios')}
              className="group inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper-50)] px-3.5 py-2 text-xs font-semibold text-[var(--sumi-muted)] transition-all hover:border-[var(--ai)] hover:text-[var(--ai)] hover:shadow-xs active:scale-95"
            >
              <span className="transition-transform group-hover:-translate-x-0.5" aria-hidden="true">←</span>
              <span>Thư viện tình huống</span>
            </button>
            <span className="text-xs text-[var(--sumi-faint)]">/</span>
            <span className="text-xs font-bold text-[var(--sumi)] truncate max-w-[200px] sm:max-w-xs">
              {scenario.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Scenario Code Badge */}
            <span className="rounded-full border border-[var(--line)] bg-[var(--paper-50)] px-3 py-1 font-mono text-[11px] font-bold text-[var(--ai)] shadow-xs">
              {scenario.scenarioCode || `SCN-${String(scenario.id).padStart(3, '0')}`}
            </span>

            {/* Quick Admin CMS Edit Link */}
            {isAdmin && (
              <Link
                to={`/admin/scenarios/edit/${scenario.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 shadow-xs active:scale-95"
                title="Mở trong hệ thống CMS Quản trị"
              >
                                <span>Chỉnh sửa CMS</span>
              </Link>
            )}
          </div>
        </div>

        {/* Main 2-Column Responsive Layout */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px] items-start">

          {/* Left Column: Hero & Level Selector & Missions */}
          <div className="min-w-0 space-y-6">

            {/* Scenario Identity Hero Card */}
            <section className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] shadow-sm p-5 md:p-7">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 md:gap-7">
                {/* Thumbnail Container */}
                <div className="relative group overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper-100)] w-full sm:w-48 md:w-56 aspect-[4/3] sm:aspect-square shrink-0">
                  <img
                    src={scenario.thumbnail || '/images/scenario-placeholder.svg'}
                    alt={scenario.title}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/images/scenario-placeholder.svg';
                    }}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-2.5 left-2.5 rounded-md bg-[var(--sumi)]/80 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Thực chiến AI
                  </div>
                </div>

                {/* Info Text */}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ai)]">
                      Hội thoại tình huống 2 chiều
                    </span>
                    <span className="text-[var(--sumi-faint)]">•</span>
                    <span className="text-[11px] font-semibold text-[var(--sumi-faint)]">
                      Giọng đọc VOICEVOX
                    </span>
                  </div>

                  <h1 className="text-2xl md:text-3xl font-black font-sans text-[var(--sumi)] leading-snug">
                    {scenario.title}
                  </h1>

                  <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[var(--sumi-muted)]">
                    {scenario.description}
                  </p>

                  {/* Level Quick Badges */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--line)]/50">
                    <span className="text-xs font-semibold text-[var(--sumi-faint)]">
                      Cấp độ hỗ trợ:
                    </span>
                    {sortedLevelConfigurations.map((lvl) => {
                      const meta = levelMeta[lvl.jlptLevel] || levelMeta.N5;
                      const isCurrent = lvl.jlptLevel === activeLevel;
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setActiveLevel(lvl.jlptLevel)}
                          className={`rounded-lg px-2.5 py-0.5 text-xs font-bold transition-all ${
                            isCurrent
                              ? `${meta.bg} ${meta.text} border ${meta.border} shadow-xs ring-1 ${meta.ring}`
                              : 'bg-[var(--paper-100)] text-[var(--sumi-faint)] hover:text-[var(--sumi)]'
                          }`}
                        >
                          {lvl.jlptLevel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Level Selector & Context Dossier */}
            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-sm md:p-8 space-y-6">
              {/* Level Tab Switcher */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg md:text-xl font-bold font-sans text-[var(--sumi)]">
                      Chọn cấp độ luyện tập
                    </h2>
                    <p className="text-xs text-[var(--sumi-faint)] mt-0.5">
                      Độ khó, từ vựng và nhân vật AI sẽ thích ứng theo cấp độ JLPT bạn chọn
                    </p>
                  </div>

                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${currentMeta.bg} ${currentMeta.text} ${currentMeta.border}`}>
                    {currentMeta.badgeLabel} — {currentMeta.descLabel}
                  </span>
                </div>

                <div
                  className="grid grid-cols-3 gap-2.5 p-1 rounded-2xl bg-[var(--paper-100)] border border-[var(--line)]"
                  role="tablist"
                  aria-label="Chọn cấp độ JLPT"
                >
                  {sortedLevelConfigurations.map((level) => {
                    const isSelected = activeLevel === level.jlptLevel;
                    const meta = levelMeta[level.jlptLevel] || levelMeta.N5;
                    return (
                      <button
                        key={level.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => {
                          setActiveLevel(level.jlptLevel);
                          setStartError(null);
                        }}
                        className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl transition-all ${
                          isSelected
                            ? 'bg-[var(--paper-50)] shadow-xs border border-[var(--line)]'
                            : 'text-[var(--sumi-muted)] hover:bg-[var(--paper-50)]/60'
                        }`}
                      >
                        <span className={`text-sm font-black font-sans ${isSelected ? meta.text : 'text-[var(--sumi)]'}`}>
                          {level.jlptLevel}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--sumi-faint)] mt-0.5">
                          {isAdmin ? 'Miễn phí' : `${level.creditCost} credits`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Persona & Context Dossier Cards */}
              <div className="grid gap-4 md:grid-cols-2 pt-2">
                {/* AI Persona Dossier */}
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-100)]/60 p-5 space-y-2">
                  <div className="flex items-center gap-3">
                    <LivingAvatar
                      size="sm"
                      avatarState="idle"
                      personaName={selectedLevel.aiPersona}
                      scenarioTitle={scenario.title}
                      hideLabel
                    />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                        Nhân vật AI đối thoại
                      </p>
                      <h3 className="text-sm font-bold font-sans text-[var(--sumi)]">
                        {selectedLevel.aiPersona}
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--sumi-muted)] pt-1">
                    Nhập vai tự nhiên theo văn hóa Nhật, hỗ trợ nhận diện giọng nói tức thì (Whisper STT) và ngắt lời (Barge-in).
                  </p>
                </div>

                {/* Scenario Context */}
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-100)]/60 p-5 space-y-2">
                  <div className="flex items-center gap-2">
                                        <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                        Bối cảnh giao tiếp
                      </p>
                      <h3 className="text-sm font-bold font-sans text-[var(--sumi)] truncate">
                        {selectedLevel.title}
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--sumi-muted)] pt-1 line-clamp-3">
                    {selectedLevel.description}
                  </p>
                </div>
              </div>
            </section>

            {/* Missions List */}
            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-sm md:p-8 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg md:text-xl font-bold font-sans text-[var(--sumi)]">
                    Nhiệm vụ cần hoàn thành
                  </h2>
                  <p className="text-xs text-[var(--sumi-faint)] mt-0.5">
                    Hội thoại với AI để lần lượt đạt các mục tiêu thực tế sau
                  </p>
                </div>
                <span className="rounded-full bg-[var(--ai-soft)] px-3 py-1 text-xs font-bold text-[var(--ai)]">
                  {selectedLevel.missions.length} nhiệm vụ
                </span>
              </div>

              <div className="space-y-3">
                {selectedLevel.missions.map((mission, idx) => (
                  <div
                    key={mission.id}
                    className="group relative flex items-start gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] p-4 transition-all hover:border-[var(--line-strong)] hover:shadow-xs"
                  >
                    {/* Hanko-style Number Badge */}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--paper-100)] font-sans text-xs font-black text-[var(--sumi)] border border-[var(--line)] group-hover:border-[var(--ai)] group-hover:text-[var(--ai)] group-hover:bg-[var(--ai-soft)] transition-colors">
                      {String(mission.order || idx + 1).padStart(2, '0')}
                    </span>

                    {/* Mission Details */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--sumi)] leading-snug">
                        {mission.content}
                      </p>

                      {/* Intent Criteria tag if available */}
                      {mission.completionCriteria?.intent && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--paper-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sumi-faint)]">
                            <span className="text-[var(--ai)]">Ý đồ:</span>
                            <span>{mission.completionCriteria.intent}</span>
                          </span>
                          {mission.completionCriteria.target && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--paper-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sumi-faint)]">
                              <span>Mục tiêu: {mission.completionCriteria.target}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Sticky Action Box & Cheatsheet */}
          <aside className="space-y-6 xl:sticky xl:top-6 self-start">

            {/* Resume Card (Hiển thị nổi bật khi có phiên dở dang) */}
            {hasActiveSession && activeSessionId && (
              <section className="relative overflow-hidden rounded-3xl border-2 border-[var(--ai)] bg-[var(--ai-soft)]/40 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ai)]">
                      Phiên đang dở dang
                    </span>
                  </div>
                  <span className="rounded-full bg-[var(--paper-50)] border border-[var(--line)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--ai)]">
                    JLPT {activeSessionLevel}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-[var(--sumi-muted)]">
                  Bạn có một lượt đàm thoại chưa hoàn thành. Hãy tiếp tục để không làm gián đoạn tiến trình.
                </p>

                {/* Progress breakdown */}
                <div className="mt-4 rounded-2xl bg-[var(--paper-50)] p-3.5 space-y-2 border border-[var(--line)] text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--sumi-faint)]">Tiến độ nhiệm vụ:</span>
                    <span className="font-bold text-emerald-700">
                      {activeSession?.completedMissionsCount ?? 0} / {activeSession?.totalMissionsCount ?? 0} hoàn thành
                    </span>
                  </div>

                  {/* Progress Mini-bar */}
                  <div className="h-1.5 w-full rounded-full bg-[var(--paper-200)] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          activeSession?.totalMissionsCount
                            ? Math.min(100, Math.round(((activeSession.completedMissionsCount ?? 0) / activeSession.totalMissionsCount) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="flex justify-between items-center pt-1 text-[11px]">
                    <span className="text-[var(--sumi-faint)]">Lượt hội thoại:</span>
                    <span className="font-medium text-[var(--sumi)]">{activeSession?.messageCount ?? 0} lượt</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Button
                    type="button"
                    className="w-full shadow-xs active:scale-[0.98]"
                    onClick={() => navigate(`/scenarios/practice/${activeSessionId}`)}
                  >
                    Tiếp tục phiên này →
                  </Button>
                  <button
                    type="button"
                    disabled={isStarting}
                    onClick={() => handleStartPractice(true, activeSessionLevel)}
                    className="w-full text-center text-xs font-semibold text-[var(--sumi-faint)] hover:text-red-600 py-1 transition active:scale-95"
                  >
                    Hoặc làm lại từ đầu (JLPT {activeSessionLevel})
                  </button>
                </div>
              </section>
            )}

            {/* Main Action Box: Bắt đầu đàm thoại */}
            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--line)]/60">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                    Cấp độ đang chọn
                  </p>
                  <h3 className="text-xl font-bold font-sans text-[var(--sumi)]">
                    JLPT {selectedLevel.jlptLevel}
                  </h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${currentMeta.bg} ${currentMeta.text} ${currentMeta.border}`}>
                  {isAdmin ? 'Miễn phí (Admin)' : `${selectedLevel.creditCost} credits`}
                </span>
              </div>

              <div className="space-y-2 text-xs text-[var(--sumi-muted)]">
                <div className="flex items-center justify-between">
                  <span>Thời lượng khuyến nghị:</span>
                  <span className="font-semibold text-[var(--sumi)]">5 - 10 phút</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Chế độ đối thoại:</span>
                  <span className="font-semibold text-[var(--sumi)]">2 chiều (Hands-Free Call)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Nhận xét phát âm & phản xạ:</span>
                  <span className="font-semibold text-emerald-700">Tự động sau phiên</span>
                </div>
              </div>

              {startError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                                        <span>Không thể khởi tạo phòng:</span>
                  </p>
                  <p className="leading-relaxed">{startError}</p>
                  {startError.includes('credit') && !isAdmin && (
                    <Link
                      to="/credits"
                      className="inline-block pt-1 font-bold text-[var(--ai)] hover:underline"
                    >
                      Nạp thêm Credits tại đây →
                    </Link>
                  )}
                </div>
              )}

              <Button
                type="button"
                className="w-full text-sm font-bold shadow-sm active:scale-[0.98]"
                disabled={isStarting}
                onClick={() => {
                  if (isSelectedLevelActive) {
                    navigate(`/scenarios/practice/${activeSessionId}`);
                  } else if (hasActiveSession) {
                    handleStartPractice(true, selectedLevel.jlptLevel);
                  } else {
                    handleStartPractice(false, selectedLevel.jlptLevel);
                  }
                }}
              >
                {isStarting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Đang thiết lập phòng thoại...
                  </span>
                ) : isSelectedLevelActive ? (
                  `Tiếp tục luyện tập (JLPT ${selectedLevel.jlptLevel}) →`
                ) : hasActiveSession ? (
                  `Bắt đầu phiên mới (JLPT ${selectedLevel.jlptLevel})`
                ) : (
                  `Bắt đầu hội thoại ngay (JLPT ${selectedLevel.jlptLevel}) →`
                )}
              </Button>

              <p className="text-center text-[11px] leading-relaxed text-[var(--sumi-faint)]">
                {isAdmin
                  ? 'Chế độ Quản trị: Kiểm thử toàn quyền mà không tốn credit tài khoản.'
                  : `* Hệ thống sẽ trừ ${selectedLevel.creditCost} credits vào số dư khi phòng bắt đầu.`}
              </p>
            </section>

            {/* Target Cheatsheet: Vocabularies & Grammars (Tabbed) */}
            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold font-sans text-[var(--sumi)]">
                  Kiến thức trọng tâm
                </h3>
                <span className="text-[11px] text-[var(--sumi-faint)]">JLPT {selectedLevel.jlptLevel}</span>
              </div>

              {/* Tab Selector for Cheatsheet */}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--paper-100)] p-1 border border-[var(--line)] text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setCheatsheetTab('vocab')}
                  className={`py-1.5 px-2 rounded-lg transition-all ${
                    cheatsheetTab === 'vocab'
                      ? 'bg-[var(--paper-50)] text-[var(--ai)] shadow-xs'
                      : 'text-[var(--sumi-faint)] hover:text-[var(--sumi)]'
                  }`}
                >
                  Từ vựng ({selectedLevel.targetVocabularies.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCheatsheetTab('grammar')}
                  className={`py-1.5 px-2 rounded-lg transition-all ${
                    cheatsheetTab === 'grammar'
                      ? 'bg-[var(--paper-50)] text-[var(--ai)] shadow-xs'
                      : 'text-[var(--sumi-faint)] hover:text-[var(--sumi)]'
                  }`}
                >
                  Ngữ pháp ({selectedLevel.targetGrammars.length})
                </button>
              </div>

              {/* Tab Content: Vocabularies */}
              {cheatsheetTab === 'vocab' && (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {selectedLevel.targetVocabularies.length === 0 ? (
                    <p className="py-4 text-center text-xs text-[var(--sumi-faint)]">
                      Chưa có từ vựng chỉ định cho cấp độ này.
                    </p>
                  ) : (
                    selectedLevel.targetVocabularies.map((vocab) => (
                      <div
                        key={vocab.id}
                        className="rounded-xl border border-[var(--line)]/60 bg-[var(--paper-100)]/40 p-3 hover:bg-[var(--paper-100)] transition-colors"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-bold text-sm text-[var(--sumi)]">
                            {vocab.word}
                          </span>
                          {vocab.reading && (
                            <span className="text-[11px] font-medium text-[var(--ai)]">
                              {vocab.reading}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[var(--sumi-muted)]">
                          {vocab.meaning}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab Content: Grammars */}
              {cheatsheetTab === 'grammar' && (
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {selectedLevel.targetGrammars.length === 0 ? (
                    <p className="py-4 text-center text-xs text-[var(--sumi-faint)]">
                      Chưa có cấu trúc ngữ pháp chỉ định cho cấp độ này.
                    </p>
                  ) : (
                    selectedLevel.targetGrammars.map((grammar) => (
                      <div
                        key={grammar.id}
                        className="rounded-xl border border-[var(--line)]/60 bg-[var(--paper-100)]/40 p-3 space-y-1 hover:bg-[var(--paper-100)] transition-colors"
                      >
                        <p className="font-bold font-mono text-xs text-[var(--ai)]">
                          {grammar.pattern}
                        </p>
                        <p className="text-xs text-[var(--sumi-muted)]">
                          {grammar.meaning}
                        </p>
                        {grammar.exampleSentence && (
                          <div className="mt-1.5 rounded-lg bg-[var(--paper-50)] p-2 text-[11px] italic text-[var(--sumi)] border border-[var(--line)]/40">
                            <span className="not-italic text-[10px] font-bold text-[var(--sumi-faint)] block">
                              Ví dụ mẫu:
                            </span>
                            {grammar.exampleSentence}
                          </div>
                        )}
                      </div>
                    ))
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
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${
                    confirmModal.isSwitchingLevel
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-[var(--ai)]'
                  }`}
                >
                  {confirmModal.isSwitchingLevel ? '' : ''}
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
                          : `${targetLevelConfig?.creditCost ?? 0} credits`}
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
                    Bạn đang có phiên {isAdmin ? 'kiểm thử' : 'luyện tập'} dở dang ở cấp độ <strong>JLPT {activeSessionLevel}</strong>. Nếu bắt đầu ở <strong>JLPT {confirmModal.targetLevel}</strong>, phiên cũ sẽ kết thúc{!isAdmin && ' và tính credit phiên mới'}.
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
                  className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 active:scale-95 ${
                    confirmModal.isSwitchingLevel
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
    </div>
  );
};
