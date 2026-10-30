import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Badge, Button, CreditBadge, EmptyState, Icon, JlptBadge, JpText, SegmentedControl, TextField } from '../components/jcap';
import { useLearnerAccount } from '../components/jcap/shell/useLearnerAccount';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';
import { useAuth } from '../contexts/AuthContext';
import { roleplayService } from '../services/roleplayService';
import { scenarioService } from '../services/scenarioService';
import type { ActiveRoleplaySessionDto } from '../types/roleplay';
import type { ScenarioDetails, ScenarioListItem, ScenarioLevelConfiguration } from '../types/scenarioDetails';

export interface Scenario {
  id: number;
  title: string;
  japaneseTitle?: string;
  level: string;
  category?: string;
  aiRole?: string;
  description: string;
  tasksCount?: number;
  thumbnail?: string;
  scenarioCode?: string;
  supportedJLPTLevels: string[];
}

interface ScenarioListViewProps {
  userEmail?: string;
  userLevel?: string;
  onSelectScenario: (scenario: Scenario) => void;
  onLogout?: () => void;
}

const LEVEL_RANK: Record<string, number> = { N5: 1, N4: 2, N3: 3 };
type Level = ScenarioLevelConfiguration['jlptLevel'];

/**
 * Thư viện Hội thoại AI (design-handoff mục 7): bên trái tìm kiếm, lọc trình độ và danh sách tình huống; bên phải panel
 * xem trước tình huống đang chọn (nhân vật, cấp độ, nhiệm vụ, từ sẽ gặp, chi phí) với nút bắt đầu / tiếp tục.
 * Bắt đầu phiên dùng đúng các lời gọi của trang chi tiết (getDetails, getActiveSession, startSession).
 */
export const ScenarioListView: React.FC<ScenarioListViewProps> = ({ onSelectScenario }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { credit } = useLearnerAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('query') || searchParams.get('search') || '';

  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchScenarios = async () => {
      setLoading(true);
      setError(null);
      const response = await scenarioService.getScenarios();
      if (!isMounted) return;
      if (response.success && response.data) setScenarios(response.data);
      else setError(response.message || 'Không thể tải danh sách tình huống.');
      setLoading(false);
    };
    fetchScenarios();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    const newParams = new URLSearchParams(searchParams);
    if (val.trim()) newParams.set('query', val.trim());
    else {
      newParams.delete('query');
      newParams.delete('search');
    }
    setSearchParams(newParams, { replace: true });
  };

  // Lọc theo trình độ hỗ trợ và từ khoá, sắp theo id tăng dần
  const filteredScenarios = useMemo(
    () =>
      scenarios
        .filter((scenario) => {
          if (filterLevel !== 'ALL' && !scenario.supportedJLPTLevels?.includes(filterLevel)) return false;
          const term = searchTerm.trim().toLowerCase();
          if (!term) return true;
          return (
            scenario.title?.toLowerCase().includes(term) ||
            scenario.description?.toLowerCase().includes(term) ||
            scenario.scenarioCode?.toLowerCase().includes(term)
          );
        })
        .sort((a, b) => a.id - b.id),
    [scenarios, filterLevel, searchTerm],
  );

  // Chọn sẵn tình huống đầu tiên của danh sách đang lọc
  useEffect(() => {
    if (filteredScenarios.length === 0) return;
    if (!filteredScenarios.some((s) => s.id === selectedId)) setSelectedId(filteredScenarios[0].id);
  }, [filteredScenarios, selectedId]);

  const toScenario = (item: ScenarioListItem): Scenario => ({
    id: item.id,
    title: item.title,
    description: item.description,
    thumbnail: item.thumbnail,
    scenarioCode: item.scenarioCode,
    supportedJLPTLevels: item.supportedJLPTLevels,
    level: item.supportedJLPTLevels?.[0] || 'N5',
  });

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 bg-transparent pb-12">
      {user?.role === 'Admin' && (
        <div className="flex items-center justify-between gap-3 rounded-jc-md bg-info-soft px-4 py-2.5 text-[13px]">
          <span>Bạn đang xem thư viện kịch bản với giao diện của học viên.</span>
          <Button variant="ghost" size="sm" icon="arrow_back" onClick={() => navigate('/admin/scenarios')}>
            Quay lại Quản lý Kịch bản
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-[38px]">Hội thoại AI</h1>
          <p className="m-0 text-[15px] leading-6 text-sumi-muted">Chọn một tình huống, nhập vai và nói chuyện với nhân vật AI. Mỗi lượt nói được nhận xét ngay.</p>
        </div>
        <div className="w-[320px] max-w-full">
          <TextField
            icon="search"
            placeholder="Tìm tình huống, VD: gọi món, sân bay"
            aria-label="Tìm tình huống"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <span className="text-[13px] leading-5 text-sumi-muted">Trình độ</span>
        <SegmentedControl
          ariaLabel="Trình độ"
          size="sm"
          value={filterLevel}
          onChange={setFilterLevel}
          options={[
            { value: 'ALL', label: 'Tất cả' },
            { value: 'N5', label: 'N5' },
            { value: 'N4', label: 'N4' },
            { value: 'N3', label: 'N3' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-2.5">
          {loading ? (
            <p className="m-0 text-sm text-sumi-muted" role="status">
              Đang tải danh sách tình huống…
            </p>
          ) : error ? (
            <EmptyState icon="error" title="Không tải được danh sách tình huống">
              {error}
            </EmptyState>
          ) : filteredScenarios.length === 0 ? (
            <EmptyState icon="search_off" title="Chưa có tình huống ở bộ lọc này">
              Thử xoá từ khoá hoặc đổi trình độ.
            </EmptyState>
          ) : (
            <>
              <h2 className="m-0 flex items-center gap-2 text-base font-semibold leading-6">
                Tình huống <span className="text-[13px] font-medium text-sumi-muted">{filteredScenarios.length}</span>
              </h2>
              {filteredScenarios.map((s) => {
                const selected = s.id === selectedId;
                const levels = [...(s.supportedJLPTLevels || [])].sort((a, b) => (LEVEL_RANK[a] ?? 9) - (LEVEL_RANK[b] ?? 9));
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-pressed={selected}
                    className="flex w-full items-center gap-4 rounded-jc-lg px-4 py-3.5 text-left text-sumi transition-colors hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                    style={{ border: selected ? '2px solid var(--ai)' : '1px solid var(--line)', background: selected ? 'var(--ai-soft)' : 'var(--paper-50)' }}
                  >
                    <span className="inline-flex h-[52px] w-[52px] flex-none items-center justify-center overflow-hidden rounded-[14px] bg-nami-soft text-nami">
                      {s.thumbnail ? <img src={s.thumbnail} alt="" className="h-full w-full object-cover" /> : <Icon name="forum" size={28} />}
                    </span>
                    <span className="flex min-w-0 flex-grow flex-col gap-1">
                      <span className="text-base font-semibold leading-6">{s.title}</span>
                      <span className="line-clamp-2 text-sm leading-5 text-sumi-muted">{s.description}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {levels.map((l) => (
                          <JlptBadge key={l} level={l as Level} size="sm" />
                        ))}
                        {s.scenarioCode && <span className="text-[13px] leading-5 text-sumi-muted">{s.scenarioCode}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {selectedId != null && (
          <ScenarioPreview
            key={selectedId}
            scenarioId={selectedId}
            credit={credit}
            onOpenDetails={() => {
              const item = scenarios.find((x) => x.id === selectedId);
              if (item) onSelectScenario(toScenario(item));
            }}
          />
        )}
      </div>
    </div>
  );
};

/** Panel xem trước tình huống đang chọn, có nút bắt đầu / tiếp tục / làm lại */
const ScenarioPreview: React.FC<{ scenarioId: number; credit: number; onOpenDetails: () => void }> = ({ scenarioId, credit, onOpenDetails }) => {
  const navigate = useNavigate();
  const [details, setDetails] = useState<ScenarioDetails | null>(null);
  const [active, setActive] = useState<ActiveRoleplaySessionDto | null>(null);
  const [level, setLevel] = useState<Level>('N5');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  /** Đang hỏi xác nhận làm lại / đổi cấp (bấm lần hai để làm) */
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([scenarioService.getDetails(scenarioId), roleplayService.getActiveSession(scenarioId)]).then(([d, s]) => {
      if (!alive) return;
      if (d.success && d.data) {
        setDetails(d.data);
        const lowest = [...d.data.levelConfigurations].sort((a, b) => (LEVEL_RANK[a.jlptLevel] ?? 9) - (LEVEL_RANK[b.jlptLevel] ?? 9))[0];
        if (lowest) setLevel(lowest.jlptLevel);
      }
      if (s.success && s.data) {
        setActive(s.data);
        const lv = (s.data.level || s.data.jlptLevel) as Level | undefined;
        const has = s.data.hasActiveSession ?? Boolean(s.data.sessionId || s.data.activeSessionId);
        if (has && lv && LEVEL_RANK[lv]) setLevel(lv);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [scenarioId]);

  const levels = useMemo(
    () => [...(details?.levelConfigurations ?? [])].sort((a, b) => (LEVEL_RANK[a.jlptLevel] ?? 9) - (LEVEL_RANK[b.jlptLevel] ?? 9)),
    [details],
  );
  const cfg = levels.find((l) => l.jlptLevel === level) ?? levels[0];
  const hasActive = Boolean(active && (active.hasActiveSession ?? Boolean(active.sessionId || active.activeSessionId)));
  const activeId = active?.activeSessionId || active?.sessionId;
  const activeLevel = active?.level || active?.jlptLevel;
  const resumeHere = hasActive && activeLevel === cfg?.jlptLevel;
  const progressText = active?.totalMissionsCount ? `${active.completedMissionsCount ?? 0}/${active.totalMissionsCount}` : undefined;
  const cost = cfg?.creditCost ?? 0;

  const start = async (forceRestart: boolean) => {
    if (!cfg) return;
    setStarting(true);
    setStartError(null);
    const result = await roleplayService.startSession(scenarioId, cfg.jlptLevel, forceRestart);
    if (result.success && result.data) {
      navigate(`/scenarios/practice/${result.data.sessionId || result.data.id}`);
    } else {
      setStartError(result.message || 'Không thể bắt đầu phiên luyện tập. Vui lòng thử lại.');
      setStarting(false);
      setConfirmRestart(false);
    }
  };

  return (
    <aside aria-label="Xem trước tình huống" className="flex max-w-[420px] flex-[1_1_380px] flex-col overflow-hidden rounded-jc-xl border border-line bg-paper-50 shadow-jc-md lg:sticky lg:top-0">
      <div className="relative h-28 bg-ai-soft">
        <div className="jc-seigaiha" />
        <span className="absolute -bottom-[26px] left-6 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] bg-paper-50 text-ai shadow-jc-md">
          {details?.thumbnail ? <img src={details.thumbnail} alt="" className="h-full w-full object-cover" /> : <Icon name="forum" size={32} />}
        </span>
      </div>
      <div className="flex flex-col gap-5 px-6 pb-6 pt-10">
        {loading ? (
          <p className="m-0 text-sm text-sumi-muted" role="status">
            Đang tải tình huống…
          </p>
        ) : !details || !cfg ? (
          <p className="m-0 text-sm text-sumi-muted">Tình huống này chưa có cấp độ nào để luyện.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h2 className="m-0 text-[22px] font-bold leading-[30px]">{cfg.title || details.title}</h2>
              <p className="m-0 text-sm leading-[22px] text-sumi-muted">{cfg.description || details.description}</p>
            </div>

            {cfg.aiPersona && (
              <div className="flex items-center gap-3 rounded-jc-md bg-paper-100 px-3.5 py-3">
                <LivingAvatar size="sm" avatarState="idle" personaName={cfg.aiPersona} scenarioTitle={details.title} hideLabel />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold leading-5">{`Bạn nói chuyện với ${cfg.aiPersona}`}</span>
                  {hasActive && progressText && <span className="text-[13px] leading-5 text-sumi-muted">{`Phiên đang dở ở cấp ${activeLevel}: ${progressText} nhiệm vụ`}</span>}
                </span>
              </div>
            )}

            {levels.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold leading-5">Chọn cấp độ</span>
                <SegmentedControl
                  ariaLabel="Cấp độ luyện"
                  block
                  value={cfg.jlptLevel}
                  onChange={(v) => {
                    setLevel(v as Level);
                    setConfirmRestart(false);
                  }}
                  options={levels.map((l) => ({ value: l.jlptLevel, label: l.jlptLevel }))}
                />
              </div>
            )}

            {cfg.missions?.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold leading-5">Nhiệm vụ trong phiên</span>
                <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-[22px]">
                  {[...cfg.missions]
                    .sort((a, b) => a.order - b.order)
                    .map((m) => (
                      <li key={m.id}>{m.content}</li>
                    ))}
                </ol>
              </div>
            )}

            {cfg.targetVocabularies?.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold leading-5">Từ sẽ gặp</span>
                <div className="flex flex-wrap gap-1.5">
                  {cfg.targetVocabularies.map((v) => (
                    <span key={v.id} className="rounded-jc-sm bg-nami-soft px-2.5 py-0.5" title={v.meaning}>
                      <JpText text={v.reading && v.reading !== v.word ? `{${v.word}|${v.reading}}` : v.word} size="sm" />
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="flex flex-col">
                <span className="text-sm font-semibold leading-5">{`Chi phí cấp ${cfg.jlptLevel}`}</span>
                <span className="text-[13px] leading-5 text-sumi-muted">
                  {resumeHere ? 'Tiếp tục phiên đang dở không trừ thêm Credit' : `Còn ${Math.max(0, credit - cost).toLocaleString('vi-VN')} Credit sau khi bắt đầu`}
                </span>
              </span>
              <CreditBadge amount={cost} variant="cost" low={credit < cost} />
            </div>

            {startError && (
              <p role="alert" className="m-0 text-[13px] text-danger">
                {startError}
              </p>
            )}

            {resumeHere ? (
              <div className="flex flex-col gap-2">
                <Button variant="primary" size="lg" block icon="play_arrow" onClick={() => navigate(`/scenarios/practice/${activeId}`)}>
                  {progressText ? `Tiếp tục (${progressText})` : 'Tiếp tục'}
                </Button>
                <Button variant="ghost" block icon="restart_alt" loading={starting} onClick={() => (confirmRestart ? start(true) : setConfirmRestart(true))}>
                  {confirmRestart ? 'Bấm lần nữa để làm lại từ đầu' : 'Làm lại từ đầu'}
                </Button>
              </div>
            ) : hasActive ? (
              <div className="flex flex-col gap-2">
                <Badge tone="warning" icon="pending">{`Bạn đang dở cấp ${activeLevel}${progressText ? ` (${progressText})` : ''}`}</Badge>
                <Button variant="primary" size="lg" block icon="forum" loading={starting} onClick={() => (confirmRestart ? start(true) : setConfirmRestart(true))}>
                  {confirmRestart ? `Bấm lần nữa: kết thúc phiên cũ, bắt đầu ${cfg.jlptLevel}` : `Bắt đầu cấp ${cfg.jlptLevel}`}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg" block icon="forum" loading={starting} onClick={() => start(false)}>
                Bắt đầu hội thoại
              </Button>
            )}
            <button type="button" onClick={onOpenDetails} className="self-center text-sm font-semibold text-ai hover:underline">
              Xem chi tiết tình huống
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
