import React, { useId } from 'react';
import { Button, Icon } from '../../components/jcap';
import { isStamped } from './learnProgress';
import type { PanelSpot } from './panelSpot';
import { currentStep, type StepKey } from './spotStepState';

/** Điểm đạt Shadowing mặc định (khớp AdminExploreSpotService.DefaultShadowingPass) */
const DEFAULT_PASS = 60;

export interface SpotStepsProps {
  spot: PanelSpot;
  /** Bước đang mở ('' = đóng hết) */
  open: StepKey | '';
  onToggle: (key: StepKey) => void;
  /** Đang luyện Shadowing ở khung bên cạnh: không hiện nút mở hoạt động */
  practicing: boolean;
  onShadowing: () => void;
  onRoleplay: (scenarioId: number) => void;
}

interface Step {
  key: StepKey;
  title: string;
  meta: string;
  tone?: 'ok' | 'progress' | 'red';
  done: boolean;
  /** Mốc không có hoạt động này */
  missing?: boolean;
  body: React.ReactNode;
}

/** Các bước học của một mốc, xếp dọc, mỗi lần mở một bước */
export const SpotSteps: React.FC<SpotStepsProps> = ({ spot, open, onToggle, practicing, onShadowing, onRoleplay }) => {
  const baseId = useId();
  const { data, stamp, shadowing, roleplay, step } = spot;
  const lesson = data.lesson;
  if (!lesson) return null;

  const current = currentStep(step);
  const understood = stamp !== 'none';
  const stamped = isStamped(stamp);
  const red = stamp === 'red';
  const resume = stamped ? null : step.resume;
  const pass = shadowing?.passThreshold ?? DEFAULT_PASS;
  const credit = roleplay?.creditCost ?? 0;

  // Bài không đặt ngưỡng điểm thì không ghi chú gì về điều kiện đạt
  const passNote = pass > 0 ? `Nói hết cả bài, đạt từ ${pass} điểm.` : '';
  const shadowingNote = stamped
    ? 'Bạn đã đạt bài này.'
    : [resume ? `Bạn dừng ở câu ${resume.index + 1}/${resume.total}.` : '', passNote].filter(Boolean).join(' ');

  const steps: Step[] = [
    {
      key: 'understand',
      title: 'Hiểu câu mẫu',
      meta: understood ? 'Đã hiểu' : '',
      tone: 'ok',
      done: understood,
      body: (
        <>
          <p className="jm-step-text">{lesson.situation}</p>
          {(lesson.grammarNote || lesson.realUse) && (
            <dl className="jm-step-facts">
              {lesson.grammarNote && (
                <>
                  <dt>Ngữ pháp</dt>
                  <dd>{lesson.grammarNote}</dd>
                </>
              )}
              {lesson.realUse && (
                <>
                  <dt>Dùng khi</dt>
                  <dd>{lesson.realUse}</dd>
                </>
              )}
            </dl>
          )}
        </>
      ),
    },
    {
      key: 'shadowing',
      title: 'Shadowing',
      meta: !shadowing ? 'Chưa có bài' : stamped ? 'Đã đạt' : resume ? `Câu ${resume.index + 1}/${resume.total}` : '',
      tone: stamped ? 'ok' : 'progress',
      done: !!shadowing && stamped,
      missing: !shadowing,
      body: shadowing ? (
        <>
          {shadowing.title && (
            <p className="jm-step-activity">
              <Icon name="graphic_eq" size={18} />
              {shadowing.title}
            </p>
          )}
          {resume && (
            <span className="jm-step-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.min(1, resume.index / Math.max(1, resume.total))})` }} />
            </span>
          )}
          <p className="jm-step-text">{shadowingNote}</p>
          {current !== 'shadowing' && !practicing && (
            <Button size="sm" icon="mic" className="jm-step-btn" onClick={onShadowing}>
              {stamped ? 'Luyện lại' : resume ? `Tiếp tục câu ${resume.index + 1}` : 'Luyện ngay'}
            </Button>
          )}
        </>
      ) : (
        <p className="jm-step-text">Mốc này chưa có bài Shadowing nên chưa nhận được con dấu.</p>
      ),
    },
    ...(roleplay
      ? [
          {
            key: 'roleplay' as const,
            title: 'Hội thoại AI',
            meta: red ? 'Có dấu son' : 'Tuỳ chọn',
            tone: red ? ('red' as const) : undefined,
            done: red,
            body: roleplay.scenarioId ? (
              <>
                {roleplay.title && (
                  <p className="jm-step-activity">
                    <Icon name="forum" size={18} />
                    {roleplay.title}
                  </p>
                )}
                <p className="jm-step-text">
                  {red
                    ? 'Bạn đã có dấu son ở mốc này.'
                    : stamped
                      ? `Tốn ${credit} Credit. Hoàn thành hội thoại để có dấu son.`
                      : 'Dấu son chỉ được cấp khi mốc đã có con dấu.'}
                </p>
                {current !== 'roleplay' && !practicing && (
                  <Button size="sm" icon="forum" className="jm-step-btn" onClick={() => onRoleplay(roleplay.scenarioId!)}>
                    {`Hội thoại AI · ${credit} Credit`}
                  </Button>
                )}
              </>
            ) : (
              <p className="jm-step-text">Kịch bản chưa sẵn sàng.</p>
            ),
          },
        ]
      : []),
  ];

  return (
    <ol className="jm-steps" aria-label="Các bước học">
      {steps.map((s, i) => {
        const expanded = open === s.key;
        const cls = [s.done && 'is-done', s.done && s.tone === 'red' && 'is-red', s.key === current && 'is-current', s.missing && 'is-missing'];
        return (
          <li key={s.key} className={`jm-step ${cls.filter(Boolean).join(' ')}`}>
            <button
              type="button"
              className="jm-step-head"
              aria-expanded={expanded}
              aria-controls={`${baseId}-${s.key}`}
              onClick={() => onToggle(s.key)}
            >
              <span className="jm-step-dot" aria-hidden="true">
                {s.done ? <Icon name="check" size={18} /> : i + 1}
              </span>
              <span className="jm-step-title">
                {s.title}
                {s.done && <span className="sr-only"> (đã xong)</span>}
              </span>
              {s.meta && <span className={`jm-step-meta${s.tone && s.meta !== 'Chưa có bài' ? ` is-${s.tone}` : ''}`}>{s.meta}</span>}
              <Icon name="expand_more" size={20} className="jm-step-chev" />
            </button>
            {/* Luôn dựng sẵn để đóng mở mượt; đang đóng thì không nhận focus */}
            <div className={`jm-step-panel${expanded ? ' is-open' : ''}`} id={`${baseId}-${s.key}`} inert={!expanded}>
              <div className="jm-step-inner">
                <div className="jm-step-body">{s.body}</div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
