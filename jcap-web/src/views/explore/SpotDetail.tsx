import React, { useEffect, useState } from 'react';
import { phraseKana } from '../../data/learnContent';
import type { PrefectureShape } from '../../data/japanMap';
import { Button, Icon, IconButton, JlptBadge, JpText, Toast, type Jlpt } from '../../components/jcap';
import { exploreService } from '../../services/exploreService';
import { applySync, loadPrefecture } from './exploreStore';
import type { PanelSpot } from './panelSpot';
import { speakJa, useCanSpeakJa } from './speak';
import { shortName } from './spotAreas';
import { SpotSteps } from './SpotSteps';
import { currentStep, type StepKey } from './spotStepState';
import { StationBadge } from './StationBadge';

const TOAST_MS = 2600;

export interface SpotDetailProps {
  pref: PrefectureShape;
  spots: PanelSpot[];
  spot: PanelSpot;
  /** Tên khu vực của mốc, nếu mốc thuộc một khu vực */
  area: string | null;
  furigana: boolean;
  /** Mở sẵn bước Hiểu (đường dẫn cũ ?hoc=1) */
  openUnderstand: boolean;
  /** Đang luyện Shadowing của mốc này ở khung bên cạnh */
  practicing: boolean;
  /** Về danh sách mốc của tỉnh */
  onBack: () => void;
  onSelect: (index: number) => void;
  onShadowing: (index: number) => void;
  onRoleplay: (index: number, scenarioId: number) => void;
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

/** Tầng 2 của ngăn tỉnh: câu mẫu luôn hiện, các bước học và một nút chính ở chân ngăn */
export const SpotDetail: React.FC<SpotDetailProps> = ({
  pref,
  spots,
  spot,
  area,
  furigana,
  openUnderstand,
  practicing,
  onBack,
  onSelect,
  onShadowing,
  onRoleplay,
  headingId,
  headingRef,
}) => {
  const canSpeak = useCanSpeakJa();
  const { data, index, step, roleplay } = spot;
  const lesson = data.lesson;
  const current = currentStep(step);
  /** null = theo bước đang cần làm; người học bấm mở/đóng thì theo ý họ */
  const [opened, setOpened] = useState<StepKey | '' | null>(openUnderstand ? 'understand' : null);
  const open = opened ?? current ?? '';
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string; key: number } | null>(null);

  // Mở mốc (kể cả khi vừa quay lại từ trang Shadowing hay Hội thoại AI): đồng bộ ngay để thấy con dấu mới
  useEffect(() => {
    loadPrefecture(pref.id, true);
    const t = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(t);
    // Chỉ lúc vừa mở mốc (lúc rời đi ref được đổi, không được chạy lại)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const markUnderstood = async () => {
    setBusy(true);
    const res = await exploreService.markUnderstood(data.id);
    setBusy(false);
    if (res.success && res.data) {
      applySync(res.data);
      setOpened(null);
      setToast({ ok: true, text: 'Đã lưu: bạn đã hiểu câu mẫu', key: Date.now() });
    } else setToast({ ok: false, text: res.message || 'Không lưu được. Hãy thử lại.', key: Date.now() });
  };

  const sentence = lesson?.sentence.map((seg) => (seg.reading ? ([seg.text, seg.reading] as [string, string]) : seg.text)) ?? [];
  const markup = lesson?.sentence.map((seg) => (seg.reading ? `{${seg.text}|${seg.reading}}` : seg.text)).join('') ?? '';
  const prev = spots[index - 1];
  const next = spots[index + 1];
  const nextLabel = next ? 'Sang mốc tiếp theo' : `Về ${pref.nameVi}`;
  const goNext = () => (next ? onSelect(next.index) : onBack());

  return (
    <>
      <div className="jm-sd-bar">
        <button type="button" className="jm-sd-back" onClick={onBack}>
          <Icon name="arrow_back" size={20} />
          {pref.nameVi}
        </button>
        <span className="jm-sd-pos-group">
          <IconButton
            icon="chevron_left"
            size="sm"
            label={prev ? `Mốc trước: ${prev.data.nameVi}` : 'Không có mốc trước'}
            disabled={!prev}
            onClick={() => prev && onSelect(prev.index)}
          />
          <span className="jm-sd-pos" aria-live="polite">{`${index + 1}/${spots.length}`}</span>
          <IconButton
            icon="chevron_right"
            size="sm"
            label={next ? `Mốc sau: ${next.data.nameVi}` : 'Không có mốc sau'}
            disabled={!next}
            onClick={() => next && onSelect(next.index)}
          />
        </span>
      </div>

      <div className="jm-pp-scroll jm-ppanel-scroll">
        <div className="jm-sd-head">
          {area && <p className="jm-sd-area">{area}</p>}
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="jm-sd-title">
            <StationBadge state={spot.stamp} pictogramId={data.iconId} size={30} />
            <span>{area ? shortName(data.nameVi) : data.nameVi}</span>
          </h2>
          <p className="jm-sd-jp" lang="ja" title={data.nameKana ?? undefined}>
            {data.nameJp}
          </p>
          {lesson && (
            <p className="jm-sd-meta">
              <JlptBadge level={lesson.jlptLevel as Jlpt} size="sm" />
              <span>{`khoảng ${lesson.estimatedMinutes} phút`}</span>
            </p>
          )}
        </div>

        {lesson ? (
          <>
            <div className="jm-sd-sentence">
              <div className="jm-sd-card">
                <JpText as="p" text={markup} furigana={furigana} />
                {canSpeak && <IconButton icon="volume_up" label="Nghe câu mẫu" size="sm" onClick={() => speakJa(phraseKana(sentence))} />}
              </div>
              {lesson.meaning && <p className="jm-sd-meaning">{lesson.meaning}</p>}
            </div>
            <SpotSteps
              spot={spot}
              open={open}
              onToggle={(key) => setOpened(open === key ? '' : key)}
              practicing={practicing}
              onShadowing={() => onShadowing(index)}
              onRoleplay={(id) => onRoleplay(index, id)}
            />
          </>
        ) : (
          <p className="jm-pp-empty">Nội dung bài học đang được chuẩn bị.</p>
        )}
      </div>

      <div className="jm-pp-foot">
        {toast && (
          <div key={toast.key} className="jm-pp-toast">
            <Toast tone={toast.ok ? 'success' : 'danger'} title={toast.text} onClose={() => setToast(null)} />
          </div>
        )}
        {practicing ? (
          <p className="jm-pp-practicing">
            <Icon name="forum" size={18} />
            Đang luyện
          </p>
        ) : current === 'understand' ? (
          <Button key="understand" variant="primary" icon="check" block loading={busy} onClick={markUnderstood}>
            {busy ? 'Đang lưu…' : 'Tôi đã hiểu câu này'}
          </Button>
        ) : current === 'shadowing' ? (
          <Button key="shadowing" variant="primary" icon="mic" block onClick={() => onShadowing(index)}>
            {step.resume ? `Tiếp tục Shadowing · câu ${step.resume.index + 1}/${step.resume.total}` : 'Luyện Shadowing'}
          </Button>
        ) : current === 'roleplay' && roleplay?.scenarioId ? (
          <div className="jm-pp-two">
            <Button variant="secondary" icon="forum" block onClick={() => onRoleplay(index, roleplay.scenarioId!)}>
              {`Hội thoại AI · ${roleplay.creditCost ?? 0} Credit`}
            </Button>
            <Button variant="primary" block onClick={goNext}>
              {nextLabel}
            </Button>
          </div>
        ) : (
          <Button key="next" variant="primary" icon="arrow_forward" block onClick={goNext}>
            {nextLabel}
          </Button>
        )}
      </div>
    </>
  );
};
