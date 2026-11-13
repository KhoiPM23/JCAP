import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Badge, Button, CreditBadge, EmptyState, Icon, JlptBadge, SegmentedControl, TextField } from '../components/jcap';
import { useLearnerAccount } from '../components/jcap/shell/useLearnerAccount';
import { useAuth } from '../contexts/AuthContext';
import { roleplayService } from '../services/roleplayService';
import { scenarioService } from '../services/scenarioService';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import { cleanPedagogicMeaning } from '../utils/japaneseSanitizer';
import type { ActiveRoleplaySessionDto } from '../types/roleplay';
import type { ScenarioDetails, ScenarioListItem, ScenarioLevelConfiguration, ScenarioTopic } from '../types/scenarioDetails';

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

const DEFAULT_TOPICS: ScenarioTopic[] = [
  { id: 1, code: 'DINING', name: 'Ẩm thực', scenarioCount: 2, isPrimary: true, icon: 'restaurant' },
  { id: 2, code: 'TRANSPORT', name: 'Di chuyển', scenarioCount: 1, isPrimary: true, icon: 'train' },
  { id: 3, code: 'DAILY_LIFE', name: 'Đời sống', scenarioCount: 0, isPrimary: true, icon: 'home' },
  { id: 4, code: 'SHOPPING', name: 'Mua sắm', scenarioCount: 1, isPrimary: false, icon: 'shopping_bag' },
  { id: 5, code: 'STUDY_WORK', name: 'Công sở', scenarioCount: 2, isPrimary: false, icon: 'work' },
];

/**
 * Thư viện Hội thoại AI (Master-Detail 2 cột chuẩn Gia Khôi+):
 * - Bộ lọc CategoryChips kết nối LearningTopics database (tập trung sâu 3 chủ đề trọng tâm: Ẩm thực, Di chuyển, Đời sống).
 * - Cột trái: Tìm kiếm, lọc trình độ & danh sách tình huống phân loại theo chủ đề.
 * - Cột phải: Sticky Preview Card xem trước persona, nhiệm vụ, từ vựng & ngữ pháp với nút bắt đầu / tiếp tục.
 */
export const ScenarioListView: React.FC<ScenarioListViewProps> = ({ onSelectScenario }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { credit } = useLearnerAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('query') || searchParams.get('search') || '';
  const initialTopic = searchParams.get('topic') || 'ALL';

  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [topics, setTopics] = useState<ScenarioTopic[]>(DEFAULT_TOPICS);
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterTopic, setFilterTopic] = useState<string>(initialTopic);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // Lắng nghe scroll để kích hoạt trạng thái ghim sát đỉnh khi thanh công cụ chạm mép trên viewport
  useEffect(() => {
    const scrollContainer = document.querySelector('.jx-page') || window;
    const handleScroll = () => {
      const rect = toolbarRef.current?.getBoundingClientRect();
      if (rect) {
        setIsScrolled(rect.top <= 4);
      } else {
        const top = (scrollContainer as HTMLElement).scrollTop ?? window.scrollY;
        setIsScrolled(top > 120);
      }
    };
    handleScroll();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchScenariosAndTopics = async () => {
      setLoading(true);
      setError(null);
      const [scnRes, topicRes] = await Promise.all([
        scenarioService.getScenarios(),
        scenarioService.getTopics(),
      ]);
      if (!isMounted) return;
      if (scnRes.success && scnRes.data) setScenarios(scnRes.data);
      else setError(scnRes.message || 'Không thể tải danh sách tình huống.');

      if (topicRes.success && topicRes.data && topicRes.data.length > 0) {
        setTopics(topicRes.data);
      }
      setLoading(false);
    };
    fetchScenariosAndTopics();
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

  const handleTopicChange = (code: string) => {
    setFilterTopic(code);
    const newParams = new URLSearchParams(searchParams);
    if (code !== 'ALL') newParams.set('topic', code);
    else newParams.delete('topic');
    setSearchParams(newParams, { replace: true });
  };

  // Đồng bộ hoá khi URL searchParams thay đổi (ví dụ: chuyển từ profile Adaptive Trial sang)
  useEffect(() => {
    const t = searchParams.get('topic');
    if (t && t !== filterTopic) {
      setFilterTopic(t);
    }
  }, [searchParams]);

  // Tính số lượng tình huống cho từng chủ đề
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: scenarios.length };
    scenarios.forEach((s) => {
      const code = s.topicCode || 'DAILY_LIFE';
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [scenarios]);

  // Lọc theo trình độ hỗ trợ, chủ đề CategoryChips và từ khoá
  const filteredScenarios = useMemo(
    () =>
      scenarios
        .filter((scenario) => {
          if (filterLevel !== 'ALL' && !scenario.supportedJLPTLevels?.includes(filterLevel)) return false;
          const itemTopic = scenario.topicCode || 'DAILY_LIFE';
          if (filterTopic !== 'ALL' && itemTopic !== filterTopic) return false;
          const term = searchTerm.trim().toLowerCase();
          if (!term) return true;
          return (
            scenario.title?.toLowerCase().includes(term) ||
            scenario.description?.toLowerCase().includes(term) ||
            scenario.scenarioCode?.toLowerCase().includes(term) ||
            scenario.topicName?.toLowerCase().includes(term)
          );
        })
        .sort((a, b) => a.id - b.id),
    [scenarios, filterLevel, filterTopic, searchTerm],
  );

  // Chọn sẵn tình huống đầu tiên của danh sách đang lọc, hoặc xoá chọn khi danh sách trống
  useEffect(() => {
    if (filteredScenarios.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!filteredScenarios.some((s) => s.id === selectedId)) {
      setSelectedId(filteredScenarios[0].id);
    }
  }, [filteredScenarios, selectedId]);

  const toScenario = (item: ScenarioListItem): Scenario => ({
    id: item.id,
    title: item.title,
    description: item.description,
    thumbnail: item.thumbnail,
    scenarioCode: item.scenarioCode,
    supportedJLPTLevels: item.supportedJLPTLevels,
    level: item.supportedJLPTLevels?.[0] || 'N5',
    category: item.topicName,
  });

  return (
    <div className="relative mx-auto flex max-w-[1180px] flex-col gap-6 bg-transparent pb-12">
      {/* Nền sóng biển Seigaiha thanh nhã tinh tế (Stamp Book & Roadmap Aesthetic) */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl seigaiha-subtle opacity-35" />

      {user?.role === 'Admin' && (
        <div className="flex items-center justify-between gap-3 rounded-jc-md bg-info-soft px-4 py-2.5 text-[13px]">
          <span>Bạn đang xem thư viện kịch bản với giao diện của học viên.</span>
          <Button variant="ghost" size="sm" icon="arrow_back" onClick={() => navigate('/admin/scenarios')}>
            Quay lại Quản lý Kịch bản
          </Button>
        </div>
      )}

      {/* Header Giới thiệu Thanh nhã */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--ai)]/10 px-2.5 py-0.5 text-[11px] font-bold text-[var(--ai)] uppercase tracking-wider font-mono">
            Bảng nhiệm vụ hội thoại · 任務板
          </span>
          <span className="text-xs font-serif text-sumi-muted tracking-widest hidden sm:inline">
            場面対話 · 実践演習
          </span>
        </div>
        <h1 className="m-0 text-[28px] font-bold leading-[38px] text-sumi font-serif">Hội thoại AI</h1>
        <p className="m-0 text-[14px] leading-6 text-sumi-muted">
          Chọn một tình huống nhiệm vụ, nhập vai đối thoại tự nhiên cùng AI. Rèn luyện từ vựng, ngữ pháp và hoàn thành mục tiêu giao tiếp thực tế.
        </p>
      </div>

      {/* Dynamic Sticky Command Toolbar - Nền đặc var(--paper-50) che kín hoàn toàn nội dung cuộn bên dưới */}
      <div
        ref={toolbarRef}
        className={`sticky top-0 z-30 transition-all duration-200 flex flex-col gap-2.5 bg-paper-50 ${
          isScrolled
            ? '-mx-4 px-5 py-2.5 rounded-t-none rounded-b-2xl border-x border-b border-line shadow-md'
            : '-mx-2 px-3.5 py-2.5 rounded-2xl border border-line shadow-2xs'
        }`}
      >
        {/* Hàng 1: Ô tìm kiếm (Search Bar) linh hoạt & Bộ chọn trình độ JLPT */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[240px] max-w-[520px]">
            <TextField
              icon="search"
              placeholder="Tìm nhiệm vụ, VD: gọi món, sân bay, ramen..."
              aria-label="Tìm tình huống"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              trailing={
                searchTerm ? (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="text-sumi-muted hover:text-sumi p-1 rounded-full hover:bg-paper-200 transition-colors cursor-pointer"
                    aria-label="Xoá tìm kiếm"
                  >
                    <Icon name="close" size={16} />
                  </button>
                ) : undefined
              }
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-sumi-muted hidden sm:inline">Trình độ</span>
            <SegmentedControl
              ariaLabel="Trình độ"
              size="sm"
              value={filterLevel}
              onChange={(lvl) => {
                ukiyoSound.playSubtleTap();
                setFilterLevel(lvl);
              }}
              options={[
                { value: 'ALL', label: 'Tất cả' },
                { value: 'N5', label: 'N5' },
                { value: 'N4', label: 'N4' },
                { value: 'N3', label: 'N3' },
              ]}
            />
          </div>
        </div>

        {/* Hàng 2: CategoryChips Filter - Cuộn ngang mượt mà */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5" role="tablist" aria-label="Bộ lọc chủ đề tình huống">
          <button
            type="button"
            role="tab"
            aria-selected={filterTopic === 'ALL'}
            onClick={() => {
              ukiyoSound.playSubtleTap();
              handleTopicChange('ALL');
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all tactile-press shrink-0 ${
              filterTopic === 'ALL'
                ? 'bg-ai text-white shadow-xs'
                : 'border border-line bg-paper-50 text-sumi hover:bg-paper-100 hover:border-line-strong'
            }`}
          >
            <Icon name="apps" size={16} />
            <span>Tất cả</span>
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                filterTopic === 'ALL' ? 'bg-white/20 text-white' : 'bg-paper-200 text-sumi-muted'
              }`}
            >
              {topicCounts['ALL'] || scenarios.length}
            </span>
          </button>

          {topics.map((t) => {
            const active = filterTopic === t.code;
            const count = topicCounts[t.code] ?? t.scenarioCount ?? 0;
            return (
              <button
                key={t.code}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  ukiyoSound.playSubtleTap();
                  handleTopicChange(t.code);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all tactile-press shrink-0 ${
                  active
                    ? 'bg-ai text-white shadow-xs'
                    : 'border border-line bg-paper-50 text-sumi hover:bg-paper-100 hover:border-line-strong'
                }`}
              >
                <Icon name={t.icon || 'bookmark'} size={16} />
                <span>{t.name}</span>
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                    active ? 'bg-white/20 text-white' : 'bg-paper-200 text-sumi-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-2.5">
          {loading ? (
            <p className="m-0 text-sm text-sumi-muted" role="status">
              Đang tải danh sách nhiệm vụ…
            </p>
          ) : error ? (
            <EmptyState icon="error" title="Không tải được danh sách tình huống">
              {error}
            </EmptyState>
          ) : filteredScenarios.length === 0 ? (
            <EmptyState icon="search_off" title="Chưa có nhiệm vụ ở bộ lọc này">
              Thử xoá từ khoá hoặc đổi trình độ.
            </EmptyState>
          ) : (
            <>
              <h2 className="m-0 flex items-center justify-between text-base font-semibold leading-6">
                <span className="flex items-center gap-2">
                  <span>Bản đồ Nhiệm vụ</span>
                  <span className="text-[13px] font-medium text-sumi-muted">({filteredScenarios.length})</span>
                </span>
                <span className="text-xs font-serif text-sumi-muted">任務一覧</span>
              </h2>
              {filteredScenarios.map((s) => {
                const selected = s.id === selectedId;
                const levels = [...(s.supportedJLPTLevels || [])].sort((a, b) => (LEVEL_RANK[a] ?? 9) - (LEVEL_RANK[b] ?? 9));
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      ukiyoSound.playWoodblockSnap();
                      setSelectedId(s.id);
                    }}
                    aria-pressed={selected}
                    className={`quest-card tactile-press flex w-full items-center gap-4 rounded-jc-xl p-4 text-left transition-all ${
                      selected
                        ? 'border-2 border-[var(--ai)] bg-[var(--ai-soft)] shadow-md ring-1 ring-[var(--ai)]/30'
                        : 'border border-[var(--line)] bg-[var(--paper-50)] hover:border-[var(--ai)]/60 hover:bg-[var(--paper-100)]'
                    }`}
                  >
                    <span className="relative inline-flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-xl bg-nami-soft text-nami shadow-2xs border border-line">
                      {s.thumbnail ? (
                        <img src={s.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon name="forum" size={26} />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-grow flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-sumi leading-tight line-clamp-1">{s.title}</span>
                        {selected && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ai)] bg-white px-2 py-0.5 rounded-full border border-[var(--ai)]/30 shrink-0 font-mono">
                            Đang chọn
                          </span>
                        )}
                      </div>
                      <span className="line-clamp-2 text-xs leading-5 text-sumi-muted">{s.description}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {levels.map((l) => (
                          <JlptBadge key={l} level={l as Level} size="sm" />
                        ))}
                        {s.topicName && (
                          <span className="inline-flex items-center gap-1 rounded-jc-sm bg-paper-100 px-2 py-0.5 text-[11px] font-medium text-sumi-muted border border-line">
                            <Icon name={(topics.find((t) => t.code === s.topicCode)?.icon as string) || 'bookmark'} size={12} />
                            <span>{s.topicName}</span>
                          </span>
                        )}
                        {s.scenarioCode && <span className="text-[12px] font-mono leading-5 text-sumi-faint">{s.scenarioCode}</span>}
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

/** Thẻ từ vựng & gợi ý ngữ cảnh với hover peek xem nghĩa nhanh */
const InventoryPropBadge: React.FC<{
  type: 'vocab' | 'grammar';
  wordOrPattern: string;
  reading?: string;
  meaning: string;
  example?: string;
}> = ({ type, wordOrPattern, reading, meaning, example }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [popoverPos, setPopoverPos] = useState<'top' | 'bottom'>('top');
  const [popoverAlign, setPopoverAlign] = useState<'center' | 'left' | 'right'>('center');
  const badgeRef = useRef<HTMLDivElement>(null);

  const cleanMeaning = cleanPedagogicMeaning(meaning);

  const updatePopoverPos = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      if (rect.top < 200) setPopoverPos('bottom');
      else setPopoverPos('top');

      // Kiểm tra tràn mép ngang trong aside preview và cửa sổ
      const asideEl = badgeRef.current.closest('aside');
      if (asideEl) {
        const asideRect = asideEl.getBoundingClientRect();
        if (rect.right + 120 > asideRect.right) {
          setPopoverAlign('right');
        } else if (rect.left - 120 < asideRect.left) {
          setPopoverAlign('left');
        } else {
          setPopoverAlign('center');
        }
      } else {
        if (rect.right > window.innerWidth - 140) {
          setPopoverAlign('right');
        } else if (rect.left < 140) {
          setPopoverAlign('left');
        } else {
          setPopoverAlign('center');
        }
      }
    }
  };

  return (
    <div
      ref={badgeRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        updatePopoverPos();
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => {
        updatePopoverPos();
        setIsHovered(true);
      }}
      onBlur={() => setIsHovered(false)}
      onClick={() => {
        ukiyoSound.playSubtleTap();
        updatePopoverPos();
        setIsHovered((prev) => !prev);
      }}
      tabIndex={0}
      role="button"
      aria-label={`${type === 'vocab' ? 'Từ vựng' : 'Ngữ pháp'}: ${wordOrPattern} - ${cleanMeaning}`}
    >
      <div
        className={`inventory-prop tactile-press text-xs ${
          type === 'vocab'
            ? 'bg-nami-soft/70 border-nami/30 hover:border-nami text-nami'
            : 'bg-ai-soft/70 border-ai/30 hover:border-ai text-ai'
        }`}
      >
        <span
          className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded ${
            type === 'vocab' ? 'bg-nami/15 text-nami' : 'bg-ai/15 text-ai'
          }`}
        >
          {type === 'vocab' ? '語' : '文'}
        </span>
        <span className="font-japanese font-semibold tracking-wide">
          {reading && reading !== wordOrPattern ? (
            <ruby>
              {wordOrPattern}
              <rt className="text-[9px] text-sumi-muted">{reading}</rt>
            </ruby>
          ) : (
            wordOrPattern
          )}
        </span>
      </div>

      {/* Hover Peek Popover */}
      {isHovered && (
        <div
          className={`absolute z-50 w-64 rounded-xl border border-[var(--line-strong)] bg-white/95 backdrop-blur-xs p-3 text-left shadow-lg pointer-events-none transition-all duration-150 ease-out animate-modal-pop ${
            popoverPos === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${
            popoverAlign === 'right'
              ? 'right-0 translate-x-0'
              : popoverAlign === 'left'
              ? 'left-0 translate-x-0'
              : 'left-1/2 -translate-x-1/2'
          }`}
          style={{ boxShadow: '0 8px 24px rgba(35, 33, 30, 0.16)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-1.5 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sumi-muted">
              {type === 'vocab' ? 'Từ vựng (単語)' : 'Ngữ pháp (文法)'}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                type === 'vocab' ? 'bg-nami-soft text-nami' : 'bg-ai-soft text-ai'
              }`}
            >
              {type === 'vocab' ? 'VOCAB' : 'GRAMMAR'}
            </span>
          </div>
          <div className="text-sm font-bold font-japanese text-slate-900 mb-1">
            {reading && reading !== wordOrPattern ? `${wordOrPattern}（${reading}）` : wordOrPattern}
          </div>
          <div className="text-xs text-slate-700 leading-snug font-sans">
            {cleanMeaning}
          </div>
          {example && (
            <div className="mt-2 rounded-lg bg-[var(--paper-100)] p-2 text-[11px] text-slate-800 font-japanese border-l-2 border-[var(--ai)]">
              {example}
            </div>
          )}
        </div>
      )}
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
  /** Thu gọn mặc định Từ vựng & Ngữ pháp trọng tâm để tối ưu chiều dọc */
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [isGrammarOpen, setIsGrammarOpen] = useState(false);

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
  const hasMeaningfulProgress = (active?.messageCount ?? 0) > 2 || (active?.completedMissionsCount ?? 0) > 0;
  const progressText = active?.totalMissionsCount ? `${active.completedMissionsCount ?? 0}/${active.totalMissionsCount}` : undefined;
  const cost = cfg?.creditCost ?? 0;

  const start = async (forceRestart: boolean) => {
    if (!cfg) return;
    ukiyoSound.playTaikoThud();
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
    <aside
      aria-label="Xem trước tình huống"
      className="relative flex max-w-[420px] flex-[1_1_380px] flex-col max-h-[calc(100vh-140px)] rounded-jc-xl border border-line bg-paper-50 shadow-jc-md lg:sticky lg:top-[124px] z-20 washi-parchment overflow-hidden transition-all duration-200"
    >
      {/* Watermark thư pháp chìm ở góc dưới */}
      <div className="sb-wm text-5xl opacity-40 select-none pointer-events-none">臨戦</div>

      {/* Header Cover Banner Nghệ thuật - Chân ảnh mờ dần hòa mượt vào nền giấy Washi tới tiêu đề */}
      <div className="relative h-[136px] w-full shrink-0 overflow-hidden">
        {details?.thumbnail ? (
          <img
            src={details.thumbnail}
            alt=""
            className="h-full w-full object-cover object-center"
            style={{
              maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 1) 36%, rgba(0, 0, 0, 0.65) 66%, rgba(0, 0, 0, 0.18) 88%, rgba(0, 0, 0, 0) 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 1) 36%, rgba(0, 0, 0, 0.65) 66%, rgba(0, 0, 0, 0.18) 88%, rgba(0, 0, 0, 0) 100%)',
            }}
          />
        ) : (
          <div
            className="h-full w-full jc-seigaiha bg-ai-soft"
            style={{
              maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 1) 36%, rgba(0, 0, 0, 0.65) 66%, rgba(0, 0, 0, 0.18) 88%, rgba(0, 0, 0, 0) 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 1) 36%, rgba(0, 0, 0, 0.65) 66%, rgba(0, 0, 0, 0.18) 88%, rgba(0, 0, 0, 0) 100%)',
            }}
          />
        )}

        {/* Nút xem toàn bộ chi tiết kịch bản ghim góc trên bên phải */}
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onOpenDetails();
          }}
          className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-white/95 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-ai hover:bg-white hover:shadow-xs transition-all border border-line/80 tactile-press shadow-2xs cursor-pointer z-10"
          title="Xem toàn bộ cấu hình, từ vựng, ngữ pháp và cốt truyện"
        >
          <span>Chi tiết</span>
          <Icon name="arrow_forward" size={12} />
        </button>
      </div>

      {/* Thân nội dung Công thái học - Co giãn vừa khít với min-h-0, nối tiếp vùng mờ chân ảnh */}
      <div className="relative z-10 flex flex-1 min-h-0 flex-col gap-2.5 px-3.5 pb-3.5 pt-0 overflow-y-auto overscroll-contain scrollbar-thin">
        {loading ? (
          <p className="m-0 text-sm text-sumi-muted" role="status">
            Đang tải dữ liệu nhiệm vụ…
          </p>
        ) : !details || !cfg ? (
          <p className="m-0 text-sm text-sumi-muted">Tình huống này chưa có cấp độ nào để luyện.</p>
        ) : (
          <>
            {/* Tiêu đề & Mô tả */}
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 text-[15px] font-bold leading-snug text-sumi font-serif">{cfg.title || details.title}</h2>
              <p className="m-0 text-[11px] leading-relaxed text-sumi-muted line-clamp-1">{cfg.description || details.description}</p>
            </div>

            {/* Cấp độ thử thách (SegmentedControl mỏng nhẹ) */}
            {levels.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sumi-muted">Cấp độ:</span>
                <SegmentedControl
                  ariaLabel="Cấp độ luyện"
                  size="sm"
                  value={cfg.jlptLevel}
                  onChange={(v) => {
                    ukiyoSound.playSubtleTap();
                    setLevel(v as Level);
                    setConfirmRestart(false);
                  }}
                  options={levels.map((l) => ({ value: l.jlptLevel, label: l.jlptLevel }))}
                />
              </div>
            )}

            {/* Stepper Mốc nhiệm vụ Micro-Compact */}
            {cfg.missions?.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sumi-muted flex items-center gap-1">
                    <Icon name="flag" size={12} />
                    <span>Mục tiêu nhiệm vụ ({cfg.missions.length})</span>
                  </span>
                  <span className="text-[9px] font-serif text-sumi-muted">任務目標</span>
                </div>
                <div className="flex flex-col gap-1 relative">
                  {[...cfg.missions]
                    .sort((a, b) => a.order - b.order)
                    .map((m, idx, arr) => {
                      const isCompleted = Boolean(active && (active.completedMissionsCount ?? 0) > idx);
                      const hasNext = idx < arr.length - 1;
                      return (
                        <div
                          key={m.id}
                          onClick={() => ukiyoSound.playWoodblockSnap()}
                          className={`group relative flex items-start gap-2 rounded-md px-2 py-1 transition-all cursor-pointer tactile-press ${
                            isCompleted
                              ? 'bg-emerald-50/80 border border-emerald-200'
                              : 'bg-paper-100 border border-line hover:border-line-strong'
                          }`}
                        >
                          {hasNext && (
                            <div
                              className={`absolute left-[15px] top-[22px] bottom-[-6px] w-0 border-l border-dashed pointer-events-none z-0 ${
                                isCompleted ? 'border-emerald-400' : 'border-line-strong'
                              }`}
                            />
                          )}
                          <div
                            className={`relative z-10 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-transform group-hover:scale-105 ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : 'border border-line-strong bg-paper-50 text-sumi-muted'
                            }`}
                          >
                            {isCompleted ? '✓' : m.order}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`m-0 text-[11px] leading-tight font-sans ${
                                isCompleted ? 'text-emerald-900 font-bold' : 'text-sumi'
                              }`}
                            >
                              {m.content}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Hàng 2 Nút Toggle Thu Gọn Từ Vựng & Ngữ Pháp Siêu Tiết Kiệm Không Gian */}
            {(cfg.targetVocabularies?.length > 0 || cfg.targetGrammars?.length > 0) && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  {cfg.targetVocabularies?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        ukiyoSound.playSubtleTap();
                        setIsVocabOpen((prev) => !prev);
                        if (!isVocabOpen) setIsGrammarOpen(false);
                      }}
                      className={`flex-1 flex items-center justify-between rounded-md border px-2 py-1 text-[11px] transition-colors tactile-press cursor-pointer ${
                        isVocabOpen
                          ? 'bg-nami-soft/80 border-nami/40 text-nami font-bold'
                          : 'bg-paper-100 border-line text-sumi-muted hover:text-sumi'
                      }`}
                      aria-expanded={isVocabOpen}
                    >
                      <span className="flex items-center gap-1">
                        <Icon name="translate" size={12} />
                        <span>Từ vựng ({cfg.targetVocabularies.length})</span>
                      </span>
                      <span className={`material-symbols-outlined text-xs transition-transform duration-200 ${isVocabOpen ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </button>
                  )}

                  {cfg.targetGrammars?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        ukiyoSound.playSubtleTap();
                        setIsGrammarOpen((prev) => !prev);
                        if (!isGrammarOpen) setIsVocabOpen(false);
                      }}
                      className={`flex-1 flex items-center justify-between rounded-md border px-2 py-1 text-[11px] transition-colors tactile-press cursor-pointer ${
                        isGrammarOpen
                          ? 'bg-ai-soft/80 border-ai/40 text-ai font-bold'
                          : 'bg-paper-100 border-line text-sumi-muted hover:text-sumi'
                      }`}
                      aria-expanded={isGrammarOpen}
                    >
                      <span className="flex items-center gap-1">
                        <Icon name="menu_book" size={12} />
                        <span>Ngữ pháp ({cfg.targetGrammars.length})</span>
                      </span>
                      <span className={`material-symbols-outlined text-xs transition-transform duration-200 ${isGrammarOpen ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </button>
                  )}
                </div>

                {/* Danh sách Từ vựng mở rộng */}
                {isVocabOpen && cfg.targetVocabularies?.length > 0 && (
                  <div className="flex flex-wrap gap-1 p-2 rounded-lg border border-nami/20 bg-nami-soft/30 animate-fade-in">
                    {cfg.targetVocabularies.map((v) => (
                      <InventoryPropBadge
                        key={`v-${v.id}`}
                        type="vocab"
                        wordOrPattern={v.word}
                        reading={v.reading}
                        meaning={v.meaning}
                      />
                    ))}
                  </div>
                )}

                {/* Danh sách Ngữ pháp mở rộng */}
                {isGrammarOpen && cfg.targetGrammars?.length > 0 && (
                  <div className="flex flex-wrap gap-1 p-2 rounded-lg border border-ai/20 bg-ai-soft/30 animate-fade-in">
                    {cfg.targetGrammars.map((g) => (
                      <InventoryPropBadge
                        key={`g-${g.id}`}
                        type="grammar"
                        wordOrPattern={g.pattern}
                        meaning={g.meaning}
                        example={g.exampleSentence}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Text link gọn gàng mở kho học liệu chủ đề */}
            {details.topicCode && (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    navigate(`/learning/topics?topic=${details.topicCode}`);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-ai hover:underline transition-colors cursor-pointer"
                >
                  <Icon name="menu_book" size={12} />
                  <span>Kho học liệu: {details.topicName || details.topicCode}</span>
                  <Icon name="arrow_forward" size={11} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky Bottom Action Footer - Cố định ở đáy, Nút Bắt đầu LUÔN TRONG TẦM MẮT, không cần cuộn! */}
      {details && cfg && (
        <div className="shrink-0 border-t border-line bg-paper-50 p-3 flex flex-col gap-2 z-20">
          {resumeHere ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <Icon name="check_circle" size={14} />
                <span>Phiên đang dở · Miễn phí tiếp tục</span>
              </span>
              <Badge tone="success">Tiếp tục</Badge>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sumi-muted">{`Chi phí cấp ${cfg.jlptLevel}:`}</span>
              <div className="flex items-center gap-2">
                <CreditBadge amount={cost} variant="cost" low={credit < cost} />
                <span className="text-[11px] text-sumi-faint font-mono">
                  (còn {Math.max(0, credit - cost).toLocaleString('vi-VN')})
                </span>
              </div>
            </div>
          )}

          {startError && (
            <p role="alert" className="m-0 text-xs text-danger">
              {startError}
            </p>
          )}

          {resumeHere ? (
            <div className="flex flex-col gap-1.5">
              <Button
                variant="primary"
                size="md"
                block
                icon="play_arrow"
                onClick={() => navigate(`/scenarios/practice/${activeId}`)}
              >
                {active?.completedMissionsCount && active.completedMissionsCount > 0
                  ? `Tiếp tục (${active.completedMissionsCount}/${active.totalMissionsCount ?? cfg.missions.length})`
                  : 'Tiếp tục hội thoại'}
              </Button>
              {hasMeaningfulProgress && (
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  icon="restart_alt"
                  loading={starting}
                  onClick={() => (confirmRestart ? start(true) : setConfirmRestart(true))}
                >
                  {confirmRestart ? 'Bấm lần nữa để xác nhận làm lại' : 'Làm lại từ đầu'}
                </Button>
              )}
            </div>
          ) : hasActive ? (
            <div className="flex flex-col gap-1.5">
              <Badge tone="warning" icon="pending">
                {`Bạn đang dở cấp ${activeLevel}${progressText ? ` (${progressText})` : ''}`}
              </Badge>
              <Button
                variant="primary"
                size="md"
                block
                icon="forum"
                loading={starting}
                onClick={() => (confirmRestart ? start(true) : setConfirmRestart(true))}
              >
                {confirmRestart ? `Bấm lần nữa: kết thúc phiên cũ, bắt đầu ${cfg.jlptLevel}` : `Bắt đầu cấp ${cfg.jlptLevel}`}
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="md" block icon="forum" loading={starting} onClick={() => start(false)}>
              Bắt đầu hội thoại
            </Button>
          )}
        </div>
      )}
    </aside>
  );
};
