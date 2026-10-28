import React from 'react';
import type { Phrase } from '../../data/learnContent';
import type { ExploreSpot } from '../../types/explore';
import { STAMP_INK } from './ExploreStamp';
import { T } from './exploreTheme';
import { ChatIcon, MicIcon, PictogramIcon } from './exploreUi';
import { FuriganaText } from './furigana';
import type { SpotStamp } from './learnProgress';

/** Điểm đạt Shadowing mặc định (khớp AdminExploreSpotService.DefaultShadowingPass) */
const DEFAULT_PASS = 60;

type StepState = 'done' | 'current' | 'todo' | 'soon';

interface Step {
  key: string;
  label: string;
  sub?: string;
  state: StepState;
}

export interface SpotFocusCardProps {
  spot: ExploreSpot | undefined;
  pictogramId: string;
  nameVi: string;
  nameJp: string;
  /** Số thứ tự trên lộ trình (null = tỉnh không có lộ trình) */
  stopN: number | null;
  phrase?: Phrase;
  state: SpotStamp;
  furigana: boolean;
  /** Điện thoại: bỏ khung câu mẫu và dòng phụ dưới các bước cho gọn */
  compact: boolean;
  /** Đang chọn trên bản đồ (khác với chỉ là địa điểm "Tiếp theo") */
  active: boolean;
  isNext: boolean;
  ink: string;
  /** Bấm đầu thẻ: chọn / bỏ chọn trên bản đồ */
  onToggle: () => void;
  /** Mở ngăn bài học đầy đủ */
  onLearn: () => void;
  onShadowing: (dialogueId: number) => void;
  onRoleplay: (scenarioId: number) => void;
}

/**
 * Thẻ "đang học" ghim đầu danh sách địa điểm của tỉnh: câu sẽ học, 4 bước (Hiểu → Shadowing → Kiểm tra → Hội thoại AI)
 * và một nút làm bước tiếp theo. Kiểm tra chưa có module nên không bao giờ là bước hiện tại.
 */
export const SpotFocusCard: React.FC<SpotFocusCardProps> = ({
  spot,
  pictogramId,
  nameVi,
  nameJp,
  stopN,
  phrase,
  state,
  furigana,
  compact,
  active,
  isNext,
  ink,
  onToggle,
  onLearn,
  onShadowing,
  onRoleplay,
}) => {
  const activities = spot?.lesson?.activities ?? [];
  const shadowing = activities.find((a) => a.type === 'Shadowing');
  const roleplay = activities.find((a) => a.type === 'Roleplay' && a.scenarioId);
  const understood = state !== 'none';
  const stamped = state === 'stamp' || state === 'red';
  const red = state === 'red';

  // Bước hiện tại = bước đầu tiên chưa xong (bỏ qua Kiểm tra vì chưa có)
  const current = !understood ? 'understand' : !stamped ? 'shadowing' : roleplay && !red ? 'roleplay' : null;
  const stepOf = (key: string, done: boolean): StepState => (done ? 'done' : current === key ? 'current' : 'todo');
  const steps: Step[] = [
    { key: 'understand', label: 'Hiểu', state: stepOf('understand', understood) },
    { key: 'shadowing', label: 'Shadowing', sub: `Đạt từ ${shadowing?.passThreshold ?? DEFAULT_PASS}`, state: stepOf('shadowing', stamped) },
    { key: 'quiz', label: 'Kiểm tra', state: 'soon' },
    ...(roleplay ? [{ key: 'roleplay', label: 'Hội thoại AI', sub: 'Nhận dấu son', state: stepOf('roleplay', red) }] : []),
  ];
  const currentIndex = steps.findIndex((s) => s.state === 'current');

  const cta =
    current === 'understand'
      ? { label: 'Bắt đầu: hiểu câu mẫu', icon: null, run: onLearn }
      : current === 'shadowing' && shadowing?.referenceId
        ? { label: 'Luyện Shadowing', icon: <MicIcon className="h-4 w-4" />, run: () => onShadowing(shadowing.referenceId!) }
        : current === 'roleplay' && roleplay?.scenarioId
          ? {
              label: `Hội thoại AI · ${roleplay.creditCost ?? 0} Credit`,
              icon: <ChatIcon className="h-4 w-4" />,
              run: () => onRoleplay(roleplay.scenarioId!),
            }
          : { label: 'Xem lại bài học', icon: null, run: onLearn };

  return (
    <div
      className="jm-reveal rounded-[10px] border bg-[var(--card)] p-3.5"
      style={{ borderColor: isNext && !active ? T.shu : ink, boxShadow: `0 0 0 1px ${isNext && !active ? T.shu : ink}` }}
    >
      {/* Đầu thẻ: bấm để chọn / bỏ chọn trên bản đồ */}
      <button type="button" onClick={onToggle} aria-pressed={active} className="jm-focus flex w-full items-center gap-3 rounded-[6px] text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: ink }}>
          <PictogramIcon id={pictogramId} color="var(--paper)" className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug text-[var(--ink)]">
            {stopN != null && `${stopN}. `}
            {nameVi}
          </span>
          <span className="font-jp block text-[13px] text-[var(--ink-2)]">{nameJp}</span>
        </span>
        <span className="shrink-0 self-start text-sm font-bold" style={{ color: current ? T.shu : STAMP_INK }}>
          {current ? `${currentIndex + 1}/${steps.length}` : red ? 'Dấu son' : 'Đã có dấu'}
        </span>
      </button>

      {/* Câu sẽ học */}
      {phrase && !compact && (
        <div className="mt-3 rounded-[6px] bg-[var(--paper-2)] px-3 py-2.5">
          <div className="text-[11px] font-bold text-[var(--ink-2)]">Câu bạn sẽ học</div>
          <p className="jm-phrase font-jp mt-0.5 text-[15px] leading-loose text-[var(--ink)]" lang="ja">
            <FuriganaText segments={phrase.s} show={furigana} />
          </p>
          <p className="text-[13px] leading-snug text-[var(--ink-2)]">{phrase.vi}</p>
        </div>
      )}

      {/* Các bước: bấm một bước để mở bài học đầy đủ */}
      <ol className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Các bước học">
        {steps.map((s, i) => (
          <li key={s.key} className="flex flex-col items-start">
            <div className="flex w-full items-center">
              <button
                type="button"
                onClick={onLearn}
                aria-label={`Mở bài học: ${s.label}${s.state === 'done' ? ' (đã xong)' : s.state === 'soon' ? ' (sắp có)' : ''}`}
                className="jm-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={stepStyle(s.state)}
              >
                {s.state === 'done' ? <CheckIcon /> : s.state === 'soon' ? <LockMini /> : i + 1}
              </button>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="mx-1 h-[2px] flex-1 rounded-full"
                  style={{ background: s.state === 'done' ? STAMP_INK : T.rule }}
                />
              )}
            </div>
            <span className={`mt-1 text-[12.5px] font-semibold leading-tight ${s.state === 'soon' ? 'text-[var(--ink-2)]' : 'text-[var(--ink)]'}`}>
              {s.label}
            </span>
            {!compact && s.sub && <span className="text-[11.5px] leading-tight text-[var(--ink-2)]">{s.sub}</span>}
            {!compact && s.state === 'soon' && (
              <span className="mt-0.5 rounded-[4px] bg-[var(--paper-2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink-2)]">Sắp có</span>
            )}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={cta.run}
        className="jm-focus mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[8px] text-sm font-semibold text-white transition-[filter] hover:brightness-110"
        style={{ background: STAMP_INK }}
      >
        {cta.icon}
        {cta.label}
      </button>
    </div>
  );
};

function stepStyle(state: StepState): React.CSSProperties {
  switch (state) {
    case 'done':
      return { background: STAMP_INK, color: T.paper };
    case 'current':
      return { background: T.card, color: STAMP_INK, border: `2px solid ${STAMP_INK}`, boxShadow: `0 0 0 3px ${T.paper2}` };
    case 'soon':
      return { background: T.paper2, color: T.ink2, border: `1.5px dashed ${T.ghost}` };
    default:
      return { background: T.card, color: T.ink2, border: `1.5px solid ${T.ghost}` };
  }
}

const CheckIcon: React.FC = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
  </svg>
);

const LockMini: React.FC = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="2" />
    <path strokeLinecap="round" strokeWidth="2" d="M8 11V8a4 4 0 118 0v3" />
  </svg>
);
