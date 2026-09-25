import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { scenarioService } from '../services/scenarioService';
import type { ScenarioDetails, ScenarioLevelConfiguration } from '../types/scenarioDetails';

const levelStyles: Record<ScenarioLevelConfiguration['jlptLevel'], string> = {
  N5: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  N4: 'border-blue-200 bg-blue-50 text-blue-700',
  N3: 'border-purple-200 bg-purple-50 text-purple-700',
};

export const ScenarioDetailsView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const scenarioId = (location.state as { scenarioId?: number } | null)?.scenarioId ?? 1;
  const [scenario, setScenario] = useState<ScenarioDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<ScenarioLevelConfiguration['jlptLevel']>('N5');
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadScenario = async () => {
      setIsLoading(true);
      setError(null);
      const result = await scenarioService.getDetails(scenarioId);

      if (!isMounted) return;

      if (result.success && result.data) {
        setScenario(result.data);
        const firstLevel = result.data.levelConfigurations[0]?.jlptLevel;
        if (firstLevel) setActiveLevel(firstLevel);
      } else {
        setError(result.message || 'Không thể tải dữ liệu scenario.');
      }

      setIsLoading(false);
    };

    void loadScenario();

    return () => {
      isMounted = false;
    };
  }, [scenarioId]);

  const selectedLevel = useMemo(
    () => scenario?.levelConfigurations.find((level) => level.jlptLevel === activeLevel) ?? scenario?.levelConfigurations[0],
    [activeLevel, scenario]
  );

  if (isLoading) {
    return <div className="rounded-2xl bg-white p-8 text-center text-sm text-[#71809A]">Đang tải scenario...</div>;
  }

  if (error || !scenario || !selectedLevel) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-sm text-red-700">
        {error || 'Không tìm thấy dữ liệu scenario.'}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6">
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-2xl border border-[#E6EDF5] bg-white shadow-sm">
            <div className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)] md:p-8">
              <img
                src={scenario.thumbnail || '/images/scenario-placeholder.svg'}
                alt={scenario.title}
                className="h-44 w-full rounded-xl object-cover md:h-full md:min-h-44"
              />
              <div className="flex flex-col justify-center">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">Practice scenario</p>
                <h1 className="text-2xl font-bold leading-tight text-[#071A44] md:text-3xl">
                  {scenario.title}
                </h1>
                <p className="mt-3 text-sm leading-6 text-[#71809A]">{scenario.description}</p>
              </div>
            </div>
          </section>

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
                    setIsStarted(false);
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
                <p className="text-xs font-bold uppercase tracking-wide text-[#71809A]">Bối cảnh</p>
                <p className="mt-2 text-sm leading-6 text-[#071A44]">{selectedLevel.description}</p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#71809A]">AI Persona</p>
                <p className="mt-2 text-sm font-semibold text-[#071A44]">{selectedLevel.aiPersona}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E6EDF5] bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#71809A]">Conversation missions</p>
                <h2 className="mt-1 text-xl font-bold text-[#071A44]">Nhiệm vụ hội thoại</h2>
              </div>
              <span className="rounded-full bg-[#EAF4FF] px-3 py-1 text-xs font-bold text-[#0878EE]">
                {selectedLevel.missions.length} nhiệm vụ
              </span>
            </div>

            <ol className="space-y-3">
              {selectedLevel.missions.map((mission) => (
                <li key={mission.id} className="flex gap-3 rounded-xl border border-[#E6EDF5] p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF4FF] text-xs font-bold text-[#0878EE]">
                    {mission.order}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#071A44]">{mission.content}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71809A]">Mục tiêu: {mission.completionCriteria.target}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-[#0878EE] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#71809A]">Selected level</p>
                <h2 className="mt-1 text-xl font-bold text-[#071A44]">JLPT {selectedLevel.jlptLevel}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${levelStyles[selectedLevel.jlptLevel]}`}>
                {selectedLevel.creditCost} credits
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#71809A]">{selectedLevel.title}</p>
            <Button type="button" className="mt-6 w-full" onClick={() => setIsStarted(true)}>
              Bắt đầu hội thoại
            </Button>
            {isStarted && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
                Dữ liệu scenario đã được tải thành công. Bước tạo session sẽ được nối vào đây.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-[#E6EDF5] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#071A44]">Từ vựng trọng tâm</h2>
              <span className="text-xs font-semibold text-[#71809A]">{selectedLevel.targetVocabularies.length} từ</span>
            </div>
            <div className="space-y-3">
              {selectedLevel.targetVocabularies.map((vocabulary) => (
                <div key={vocabulary.id} className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-bold text-[#071A44]">{vocabulary.word}</p>
                    <p className="text-xs text-[#71809A]">{vocabulary.reading}</p>
                  </div>
                  <p className="text-right text-xs text-[#71809A]">{vocabulary.meaning}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E6EDF5] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#071A44]">Ngữ pháp trọng tâm</h2>
              <span className="text-xs font-semibold text-[#71809A]">{selectedLevel.targetGrammars.length} mẫu câu</span>
            </div>
            <div className="space-y-3">
              {selectedLevel.targetGrammars.map((grammar) => (
                <div key={grammar.id} className="rounded-xl bg-[#F8FAFC] p-3">
                  <p className="text-sm font-bold text-[#0878EE]">{grammar.pattern}</p>
                  <p className="mt-1 text-xs text-[#71809A]">{grammar.meaning}</p>
                  {grammar.exampleSentence && <p className="mt-2 text-xs italic text-[#071A44]">{grammar.exampleSentence}</p>}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
