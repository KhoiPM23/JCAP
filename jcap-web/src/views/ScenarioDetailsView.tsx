import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { scenarioService } from '../services/scenarioService';
import { roleplayService } from '../services/roleplayService';
import type { ScenarioDetails, ScenarioLevelConfiguration } from '../types/scenarioDetails';
import type { ActiveRoleplaySessionDto } from '../types/roleplay';

const levelStyles: Record<ScenarioLevelConfiguration['jlptLevel'], string> = {
  N5: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  N4: 'border-blue-200 bg-blue-50 text-blue-700',
  N3: 'border-purple-200 bg-purple-50 text-purple-700',
};

export const ScenarioDetailsView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ scenarioId?: string }>();

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
        const firstLevel = scenarioRes.data.levelConfigurations[0]?.jlptLevel;
        if (firstLevel) setActiveLevel(firstLevel);
      } else {
        setError(scenarioRes.message || 'Không thể tải dữ liệu kịch bản.');
      }

      if (sessionRes.success && sessionRes.data) {
        setActiveSession(sessionRes.data);
        // Nếu đang có session dở dang, có thể tự động chọn tab level đó cho tiện
        if (sessionRes.data.hasActiveSession && sessionRes.data.level) {
          const matchLevel = sessionRes.data.level as ScenarioLevelConfiguration['jlptLevel'];
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

  const selectedLevel = useMemo(
    () =>
      scenario?.levelConfigurations.find((level) => level.jlptLevel === activeLevel) ??
      scenario?.levelConfigurations[0],
    [activeLevel, scenario]
  );

  const handleStartPractice = async (forceRestart: boolean = false) => {
    if (!selectedLevel) return;

    if (forceRestart) {
      const confirmRestart = window.confirm(
        'Bạn có chắc chắn muốn bỏ phiên đang dang dở và bắt đầu một phiên luyện tập hoàn toàn mới không? (Credit phiên mới sẽ được tính theo quy định)'
      );
      if (!confirmRestart) return;
    }

    setIsStarting(true);
    setStartError(null);

    const result = await roleplayService.startSession(scenarioId, selectedLevel.jlptLevel, forceRestart);

    if (result.success && result.data) {
      const targetSessionId = result.data.sessionId || result.data.id;
      navigate(`/scenarios/practice/${targetSessionId}`);
    } else {
      setStartError(result.message || 'Không thể bắt đầu phiên luyện tập. Vui lòng thử lại.');
      setIsStarting(false);
    }
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
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#71809A]">Choose your level</p>
                <h2 className="mt-1 text-xl font-bold text-[#071A44]">Nội dung luyện tập</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${levelStyles[selectedLevel.jlptLevel]}`}>
                JLPT {selectedLevel.jlptLevel}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-[#E6EDF5] pb-5" role="tablist" aria-label="Chọn cấp độ JLPT">
              {scenario.levelConfigurations.map((level) => (
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
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#71809A]">Conversation missions</p>
                <h2 className="mt-1 text-xl font-bold text-[#071A44]">Nhiệm vụ cần hoàn thành</h2>
              </div>
              <span className="rounded-full bg-[#EAF4FF] px-3 py-1 text-xs font-bold text-[#0878EE]">
                {selectedLevel.missions.length} nhiệm vụ
              </span>
            </div>

            <ol className="space-y-3">
              {selectedLevel.missions.map((mission) => (
                <li key={mission.id} className="flex gap-3 rounded-xl border border-[#E6EDF5] p-4 transition hover:border-[#B9D9FF]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF4FF] text-xs font-bold text-[#0878EE]">
                    {mission.order}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#071A44]">{mission.content}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71809A]">Mục tiêu hoàn thành: {mission.completionCriteria.target}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right Sidebar: Resume Box & Start Actions & Cheatsheet */}
        <aside className="space-y-6">
          {/* Resume Box: Hiển thị nếu đang có phiên dang dở */}
          {activeSession?.hasActiveSession && activeSession.activeSessionId && (
            <section className="rounded-2xl border-2 border-[#0878EE] bg-[#F4F9FE] p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0878EE] text-base text-white">
                  ⏱️
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#071A44]">Phiên luyện tập đang dang dở</h3>
                  <p className="text-xs text-[#71809A]">Bạn có thể tiếp tục tiến trình trước đó</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-white p-3.5 space-y-2 border border-[#B9D9FF]/50 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#71809A]">Cấp độ:</span>
                  <span className="font-bold text-[#0878EE]">JLPT {activeSession.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71809A]">Tiến độ nhiệm vụ:</span>
                  <span className="font-bold text-emerald-600">
                    {activeSession.completedMissionsCount ?? 0} / {activeSession.totalMissionsCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71809A]">Số lượt thoại:</span>
                  <span className="font-medium text-[#071A44]">{activeSession.messageCount ?? 0} lượt</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Button
                  type="button"
                  className="w-full bg-[#0878EE] hover:bg-[#0768D0] text-white font-bold py-2.5 rounded-xl shadow transition"
                  onClick={() => navigate(`/scenarios/practice/${activeSession.activeSessionId}`)}
                >
                  Tiếp tục luyện tập →
                </Button>
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={() => handleStartPractice(true)}
                  className="w-full text-center text-xs font-semibold text-[#71809A] hover:text-red-600 py-1.5 transition"
                >
                  Hoặc bắt đầu phiên mới (bỏ dở phiên cũ)
                </button>
              </div>
            </section>
          )}

          {/* Action Box: Bắt đầu hội thoại */}
          <section className="rounded-2xl border border-[#0878EE] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#71809A]">Selected level</p>
                <h2 className="mt-1 text-xl font-bold text-[#071A44]">JLPT {selectedLevel.jlptLevel}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${levelStyles[selectedLevel.jlptLevel]}`}>
                🪙 {selectedLevel.creditCost} credits
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#71809A]">{selectedLevel.title}</p>

            {startError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <p className="font-semibold">Không thể bắt đầu:</p>
                <p className="mt-0.5">{startError}</p>
                {startError.includes('credit') && (
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
              onClick={() => handleStartPractice(false)}
            >
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  Đang khởi tạo phòng hội thoại...
                </span>
              ) : activeSession?.hasActiveSession ? (
                'Bắt đầu phiên mới với cấp độ này'
              ) : (
                'Bắt đầu hội thoại'
              )}
            </Button>
            <p className="mt-2 text-center text-[11px] text-[#71809A]">
              * Hệ thống sẽ trừ {selectedLevel.creditCost} credits khi phiên hội thoại bắt đầu.
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
    </div>
  );
};
