import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { scenarioService } from '../services/scenarioService';
import { roleplayService } from '../services/roleplayService';
import { useAuth } from '../contexts/AuthContext';
import type { ScenarioDetails, ScenarioLevelConfiguration } from '../types/scenarioDetails';
import type { ActiveRoleplaySessionDto } from '../types/roleplay';

const levelStyles: Record<ScenarioLevelConfiguration['jlptLevel'], string> = {
  N5: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  N4: 'border-blue-200 bg-blue-50 text-blue-700',
  N3: 'border-purple-200 bg-purple-50 text-purple-700',
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

  // Danh sách cấp độ được sắp xếp tăng dần theo độ khó (N5 -> N4 -> N3 -> N2 -> N1)
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
      <div className="mx-auto w-full max-w-[1200px] py-16 text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-[#0878EE]/20 border-t-[#0878EE]" />
        <p className="mt-4 text-sm font-semibold text-[#71809A]">Đang tải thông tin kịch bản...</p>
      </div>
    );
  }

  if (error || !scenario || !selectedLevel) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-4 py-8">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-sm text-red-700">
          {error || 'Không tìm thấy dữ liệu kịch bản.'}
        </div>
        <div className="text-center">
          <Button type="button" onClick={() => navigate('/scenarios')}>
            Quay lại Thư viện kịch bản
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6">
      {/* Top navigation & Tag */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/scenarios')}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E6EDF5] bg-white px-4 py-2 text-sm font-semibold text-[#71809A] transition hover:border-[#0878EE] hover:text-[#0878EE]"
        >
          <span aria-hidden="true">←</span>
          Quay lại thư viện
        </button>
        <span className="rounded-full border border-[#B9D9FF] bg-[#EAF4FF] px-3 py-1 text-xs font-semibold text-[#0878EE]">
          {scenario.scenarioCode}
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Main Content Column */}
        <div className="min-w-0 space-y-6">
          {/* Banner Hero */}
          <section className="overflow-hidden rounded-2xl border border-[#E6EDF5] bg-white shadow-sm">
            <div className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)] md:p-8">
              <img
                src={scenario.thumbnail || '/images/scenario-placeholder.svg'}
                alt={scenario.title}
                className="h-44 w-full rounded-xl object-cover md:h-full md:min-h-44"
              />
              <div className="flex flex-col justify-center">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">
                  Kịch bản hội thoại AI
                </p>
                <h1 className="text-2xl font-bold leading-tight text-[#071A44] md:text-3xl">
                  {scenario.title}
                </h1>
                <p className="mt-3 text-sm leading-6 text-[#71809A]">{scenario.description}</p>
              </div>
            </div>
          </section>

          {/* Level Selector & Context */}
          <section className="rounded-2xl border border-[#E6EDF5] bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#071A44]">Lựa chọn cấp độ luyện tập</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${levelStyles[selectedLevel.jlptLevel]}`}>
                JLPT {selectedLevel.jlptLevel}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-[#E6EDF5] pb-5" role="tablist" aria-label="Chọn cấp độ JLPT">
              {sortedLevelConfigurations.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  role="tab"
                  aria-selected={activeLevel === level.jlptLevel}
                  onClick={() => {
                    setActiveLevel(level.jlptLevel);
                    setStartError(null);
                  }}
                  className={`rounded-lg px-5 py-2 text-sm font-bold transition ${
                    activeLevel === level.jlptLevel
                      ? 'bg-[#0878EE] text-white shadow-sm'
                      : 'bg-[#F8FAFC] text-[#71809A] hover:bg-[#EAF4FF] hover:text-[#0878EE]'
                  }`}
                >
                  {level.jlptLevel}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-[#F8FAFC] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#71809A]">Bối cảnh kịch bản</p>
                <p className="mt-2 text-sm leading-6 text-[#071A44]">{selectedLevel.description}</p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#71809A]">Nhân vật AI đối thoại</p>
                <p className="mt-2 text-sm font-semibold text-[#071A44]">{selectedLevel.aiPersona}</p>
              </div>
            </div>
          </section>

          {/* Missions List */}
          <section className="rounded-2xl border border-[#E6EDF5] bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#071A44]">Nhiệm vụ cần hoàn thành</h2>
              </div>
              <span className="rounded-full bg-[#EAF4FF] px-3 py-1 text-xs font-bold text-[#0878EE]">
                {selectedLevel.missions.length} nhiệm vụ
              </span>
            </div>

            <ol className="space-y-3">
              {selectedLevel.missions.map((mission) => (
                <li key={mission.id} className="flex items-center gap-3 rounded-xl border border-[#E6EDF5] p-4 transition hover:border-[#B9D9FF]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF4FF] text-xs font-bold text-[#0878EE]">
                    {mission.order}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#071A44]">{mission.content}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right Sidebar: Resume Box & Start Actions & Cheatsheet */}
        <aside className="space-y-6">
          {/* Resume Box: Hiển thị nếu đang có phiên dang dở */}
          {hasActiveSession && activeSessionId && (
            <section className="rounded-2xl border border-[#0878EE] bg-white p-6 shadow-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">
                  Phiên luyện tập dang dở
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#071A44]">
                  JLPT {activeSessionLevel}
                </h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#71809A]">
                Bạn có thể tiếp tục tiến trình trước đó mà không mất dữ liệu.
              </p>

              <div className="mt-4 rounded-xl bg-[#F8FAFC] p-3.5 space-y-2 border border-[#E6EDF5] text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#71809A]">Cấp độ:</span>
                  <span className="font-bold text-[#0878EE]">JLPT {activeSessionLevel}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#71809A]">Tiến độ nhiệm vụ:</span>
                  <span className="font-bold text-emerald-600">
                    {activeSession?.completedMissionsCount ?? 0} / {activeSession?.totalMissionsCount ?? 0} hoàn thành
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#71809A]">Số lượt thoại:</span>
                  <span className="font-medium text-[#071A44]">{activeSession?.messageCount ?? 0} lượt</span>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => navigate(`/scenarios/practice/${activeSessionId}`)}
                >
                  Tiếp tục luyện tập →
                </Button>
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={() => handleStartPractice(true, activeSessionLevel)}
                  className="w-full text-center text-xs font-semibold text-[#71809A] hover:text-red-600 py-1.5 transition"
                >
                  Hoặc làm lại từ đầu (JLPT {activeSessionLevel})
                </button>
              </div>
            </section>
          )}

          {/* Action Box: Bắt đầu hội thoại */}
          <section className="rounded-2xl border border-[#0878EE] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#71809A]">Cấp độ lựa chọn</p>
                <h2 className="mt-1 text-xl font-bold text-[#071A44]">JLPT {selectedLevel.jlptLevel}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${levelStyles[selectedLevel.jlptLevel]}`}>
                {isAdmin ? '🛡️ Miễn phí (Admin)' : `🪙 ${selectedLevel.creditCost} credits`}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#71809A]">{selectedLevel.title}</p>

            {startError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <p className="font-semibold">Không thể bắt đầu:</p>
                <p className="mt-0.5">{startError}</p>
                {startError.includes('credit') && !isAdmin && (
                  <Link
                    to="/credits"
                    className="mt-2 inline-block font-bold text-[#0878EE] hover:underline"
                  >
                    Nạp thêm Credits tại đây →
                  </Link>
                )}
              </div>
            )}

            <Button
              type="button"
              className="mt-6 w-full"
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
                  Đang khởi tạo phòng hội thoại...
                </span>
              ) : isSelectedLevelActive ? (
                `Tiếp tục luyện tập (JLPT ${selectedLevel.jlptLevel}) →`
              ) : hasActiveSession ? (
                `Bắt đầu phiên mới (JLPT ${selectedLevel.jlptLevel})`
              ) : (
                'Bắt đầu hội thoại'
              )}
            </Button>
            <p className="mt-2 text-center text-[11px] text-[#71809A]">
              {isAdmin
                ? '✨ Chế độ Quản trị viên: Không bị trừ credit khi trải nghiệm và kiểm thử kịch bản.'
                : `* Hệ thống sẽ trừ ${selectedLevel.creditCost} credits khi phiên hội thoại bắt đầu.`}
            </p>
          </section>

          {/* Target Vocabularies */}
          <section className="rounded-2xl border border-[#E6EDF5] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#071A44]">Từ vựng trọng tâm</h2>
              <span className="text-xs font-semibold text-[#71809A]">
                {selectedLevel.targetVocabularies.length} từ
              </span>
            </div>
            <div className="space-y-3">
              {selectedLevel.targetVocabularies.map((vocabulary) => (
                <div
                  key={vocabulary.id}
                  className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-bold text-[#071A44]">{vocabulary.word}</p>
                    <p className="text-xs text-[#71809A]">{vocabulary.reading}</p>
                  </div>
                  <p className="text-right text-xs text-[#71809A]">{vocabulary.meaning}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Target Grammars */}
          <section className="rounded-2xl border border-[#E6EDF5] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#071A44]">Ngữ pháp trọng tâm</h2>
              <span className="text-xs font-semibold text-[#71809A]">
                {selectedLevel.targetGrammars.length} mẫu câu
              </span>
            </div>
            <div className="space-y-3">
              {selectedLevel.targetGrammars.map((grammar) => (
                <div key={grammar.id} className="rounded-xl bg-[#F8FAFC] p-3">
                  <p className="text-sm font-bold text-[#0878EE]">{grammar.pattern}</p>
                  <p className="mt-1 text-xs text-[#71809A]">{grammar.meaning}</p>
                  {grammar.exampleSentence && (
                    <p className="mt-2 text-xs italic text-[#071A44]">{grammar.exampleSentence}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* Modal xác nhận bắt đầu lại / chuyển đổi cấp độ */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => !isStarting && setConfirmModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                  confirmModal.isSwitchingLevel
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-blue-100 text-[#0878EE]'
                }`}
              >
                {confirmModal.isSwitchingLevel ? '⚠️' : '🔄'}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#071A44]">
                  {confirmModal.isSwitchingLevel
                    ? 'Chuyển sang cấp độ mới?'
                    : isAdmin
                    ? 'Làm lại từ đầu phiên kiểm thử?'
                    : 'Làm lại từ đầu phiên luyện tập?'}
                </h3>
                <p className="text-xs text-[#71809A]">
                  Kịch bản: {scenario?.title}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#F8FAFC] p-3 text-xs space-y-1.5 border border-[#E6EDF5]">
              {confirmModal.isSwitchingLevel ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[#71809A]">Phiên đang dở dang:</span>
                    <span className="font-semibold text-amber-700">
                      JLPT {activeSessionLevel} ({activeSession?.completedMissionsCount ?? 0}/{activeSession?.totalMissionsCount ?? 0} nhiệm vụ)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#71809A]">Cấp độ mới sẽ bắt đầu:</span>
                    <span className="font-bold text-[#0878EE]">JLPT {confirmModal.targetLevel}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#71809A]">Chi phí credit:</span>
                    <span className="font-medium text-[#071A44]">
                      {isAdmin
                        ? '🛡️ Miễn phí (Admin)'
                        : `🪙 ${targetLevelConfig?.creditCost ?? 0} credits`}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[#71809A]">Cấp độ:</span>
                    <span className="font-bold text-[#0878EE]">JLPT {confirmModal.targetLevel}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#71809A]">Tiến độ sẽ làm lại:</span>
                    <span className="font-bold text-amber-700">
                      {activeSession?.completedMissionsCount ?? 0} / {activeSession?.totalMissionsCount ?? 0} nhiệm vụ đã xong
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#71809A]">Số lượt hội thoại:</span>
                    <span className="font-medium text-[#071A44]">
                      {activeSession?.messageCount ?? 0} lượt
                    </span>
                  </div>
                </>
              )}
            </div>

            <p className="text-xs text-[#71809A] leading-relaxed">
              {confirmModal.isSwitchingLevel ? (
                <>
                  Bạn đang có phiên {isAdmin ? 'kiểm thử' : 'luyện tập'} dở dang ở cấp độ <strong>JLPT {activeSessionLevel}</strong>. Nếu bắt đầu phiên mới ở cấp độ <strong>JLPT {confirmModal.targetLevel}</strong>, phiên dở dang cũ sẽ bị bỏ dở{!isAdmin && ' và credit phiên mới sẽ được tính theo quy định'}.
                </>
              ) : (
                <>
                  Làm lại từ đầu sẽ <strong>hủy toàn bộ tiến trình hội thoại</strong> và nhiệm vụ của phiên dở dang hiện tại. Bạn có chắc chắn muốn tiếp tục không?
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={isStarting}
                className="rounded-xl border border-[#E6EDF5] bg-white px-4 py-2 text-xs font-semibold text-[#71809A] hover:bg-[#F8FAFC] transition disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => executeStartSession(confirmModal.targetLevel, true)}
                disabled={isStarting}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-50 ${
                  confirmModal.isSwitchingLevel
                    ? 'bg-[#0878EE] hover:bg-[#0768D0]'
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
