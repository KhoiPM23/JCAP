import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PrefectureShape } from '../../data/japanMap';
import { phraseKana } from '../../data/learnContent';
import { exploreService } from '../../services/exploreService';
import type { ExploreActivity, ExploreSpot } from '../../types/explore';
import { applySync, loadPrefecture, useAwardQueue } from './exploreStore';
import { SpotStampMark } from './ExploreStamp';
import { ChatIcon, ListenButton, MicIcon } from './exploreUi';
import { FuriganaText } from './furigana';
import { isStamped, stampOf } from './learnProgress';
import { useCanSpeakJa, speakJa } from './speak';

/** Điểm đạt Shadowing mặc định (khớp AdminExploreSpotService.DefaultShadowingPass) */
const DEFAULT_PASS = 60;

/**
 * Trang luyện Shadowing của bài, kèm đường quay về (?return=): bấm "Xong" ở đó thì về lại ngăn bài học của địa điểm này,
 * tỉnh được đồng bộ và con dấu "đóng cộp" ngay.
 */
export function shadowingPracticeUrl(dialogueId: number, prefSlug: string, spotIndex: number): string {
  const back = `/explore?tinh=${prefSlug}&dd=${spotIndex + 1}&hoc=1`;
  return `/shadowing/${dialogueId}/practice?return=${encodeURIComponent(back)}`;
}

export interface SpotLessonProps {
  spot: ExploreSpot;
  /** Vị trí của địa điểm trong danh sách của tỉnh (để quay về đúng chỗ sau khi luyện Shadowing) */
  spotIndex: number;
  pref: PrefectureShape;
  furigana: boolean;
  isWide: boolean;
  onClose: () => void;
}

/**
 * Học ở một mốc: ① Hiểu câu mẫu → ② Shadowing (đạt ngưỡng) = con dấu; ④ Hội thoại AI (tốn Credit) = dấu son.
 * Shadowing và Hội thoại AI mở ở trang sẵn có của hai module đó; quay lại bản đồ thì tỉnh được đồng bộ và server tự
 * cấp con dấu nếu phiên đạt (không cần trang kia báo về). Không bắt học theo thứ tự.
 */
export const SpotLesson: React.FC<SpotLessonProps> = ({ spot, spotIndex, pref, furigana, isWide, onClose }) => {
  const navigate = useNavigate();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const canSpeak = useCanSpeakJa();
  const lesson = spot.lesson;
  const state = stampOf(spot.progress);
  const understood = state !== 'none';
  const stamped = isStamped(state);
  const red = state === 'red';
  const shadowing = lesson?.activities.find((a) => a.type === 'Shadowing');
  const roleplay = lesson?.activities.find((a) => a.type === 'Roleplay');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mở ngăn (kể cả khi vừa quay lại từ trang Shadowing): đồng bộ ngay để thấy con dấu mới
  useEffect(() => {
    loadPrefecture(spot.prefectureId, true);
    const t = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(t);
  }, [spot.prefectureId, spot.id]);

  // Vừa có dấu ở chính mốc này: con dấu trong ngăn "đóng cộp" (hiệu ứng ở đây thay cho thông báo nổi)
  const queue = useAwardQueue();
  const [pressKey, setPressKey] = useState(0);
  const lastSeen = useRef(0);
  useEffect(() => {
    const hit = queue.find(
      (e) => e.key > lastSeen.current && (e.awards.stampSpotIds.includes(spot.id) || e.awards.redStampSpotIds.includes(spot.id)),
    );
    if (!hit) return;
    lastSeen.current = hit.key;
    setPressKey(hit.key);
  }, [queue, spot.id]);

  const markUnderstood = async () => {
    setBusy(true);
    setError(null);
    const res = await exploreService.markUnderstood(spot.id);
    setBusy(false);
    if (res.success && res.data) applySync(res.data);
    else setError(res.message || 'Không lưu được. Hãy thử lại.');
  };

  const sentence = lesson?.sentence.map((seg) => (seg.reading ? ([seg.text, seg.reading] as [string, string]) : seg.text)) ?? [];
  const pass = shadowing?.passThreshold ?? DEFAULT_PASS;

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center lg:items-center bg-[rgba(8,20,44,0.38)] jm-reveal" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
        className={`jm-paper-panel jm-lesson flex flex-col overflow-hidden ${
          isWide ? 'w-[min(620px,calc(100%-2rem))] max-h-[calc(100%-2rem)] rounded-[10px]' : 'w-full max-h-[92%] rounded-t-[10px]'
        }`}
      >
        {/* Đầu ngăn: con dấu của mốc + tên */}
        <header className="relative flex items-center gap-4 border-b border-[var(--rule)] px-5 pb-4 pt-5">
          <SpotStampMark
            key={pressKey}
            iconId={spot.iconId}
            nameJp={spot.nameJp}
            sub={pref.nameJp}
            date={red ? spot.progress.redStampedAt : spot.progress.stampedAt}
            state={state}
            size={isWide ? 116 : 88}
            seed={spot.id}
            pressing={pressKey > 0}
            className="shrink-0"
          />
          <div className="min-w-0 pr-8">
            <p className="text-xs font-semibold text-[var(--ink-2)]">
              {pref.nameVi} · {lesson?.jlptLevel ?? 'N5'} · khoảng {lesson?.estimatedMinutes ?? 5} phút
            </p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="mt-0.5 text-xl font-bold leading-snug text-[var(--ink)] outline-none">
              {spot.nameVi}
            </h2>
            <p className="font-jp text-sm text-[var(--ink-2)]" lang="ja">
              {furigana && spot.nameKana ? (
                <ruby>
                  {spot.nameJp}
                  <rt>{spot.nameKana}</rt>
                </ruby>
              ) : (
                spot.nameJp
              )}
            </p>
            <StampStatus state={state} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bài học"
            className="jm-focus absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <ol className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
          {/* ① Hiểu */}
          <Step n={1} title="Hiểu câu mẫu" done={understood}>
            {lesson ? (
              <>
                <p className="text-sm text-[var(--ink-2)]">{lesson.situation}</p>
                <div className="mt-2 flex items-start gap-2 rounded-[6px] bg-[var(--card)] px-3 py-2.5">
                  <p className="jm-phrase font-jp min-w-0 flex-1 text-lg leading-loose text-[var(--ink)]" lang="ja">
                    <FuriganaText segments={sentence} show={furigana} />
                  </p>
                  {canSpeak && <ListenButton label="Nghe cả câu" onClick={() => speakJa(phraseKana(sentence))} />}
                </div>
                <p className="mt-1.5 text-sm font-medium text-[var(--ink)]">{lesson.meaning}</p>
                {lesson.grammarNote && <p className="mt-2 text-sm text-[var(--ink-2)]">Ngữ pháp: {lesson.grammarNote}</p>}
                {lesson.realUse && <p className="mt-1 text-sm text-[var(--ink-2)]">Dùng khi: {lesson.realUse}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={understood || busy}
                    onClick={markUnderstood}
                    className="jm-focus h-10 rounded-[6px] px-4 text-sm font-semibold transition-colors disabled:cursor-default"
                    style={
                      understood
                        ? { background: 'var(--paper-2)', color: 'var(--ink-2)' }
                        : { background: 'var(--primary)', color: '#fff' }
                    }
                  >
                    {understood ? 'Đã hiểu' : busy ? 'Đang lưu…' : 'Tôi đã hiểu'}
                  </button>
                  {error && (
                    <span role="alert" className="text-xs text-[var(--shu)]">
                      {error}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--ink-2)]">Nội dung bài học đang được chuẩn bị.</p>
            )}
          </Step>

          {/* ② Shadowing: điều kiện của con dấu */}
          <Step n={2} title="Luyện Shadowing" done={stamped}>
            {shadowing?.referenceId ? (
              <ActivityLaunch
                icon={<MicIcon className="h-4 w-4" />}
                title={shadowing.title}
                note={`Đọc theo cả bài, đạt từ ${pass} điểm. Làm xong, quay lại bản đồ để nhận con dấu.`}
                action={stamped ? 'Luyện lại' : 'Bắt đầu Shadowing'}
                onClick={() => navigate(shadowingPracticeUrl(shadowing.referenceId!, pref.slug, spotIndex))}
                primary={!stamped}
              />
            ) : (
              <p className="text-sm text-[var(--ink-2)]">Mốc này chưa có bài Shadowing.</p>
            )}
            {!understood && <p className="mt-2 text-xs text-[var(--ink-2)]">Con dấu cần cả bước 1 "Tôi đã hiểu".</p>}
          </Step>

          {/* ③ Kiểm tra: chưa có module */}
          <Step n={3} title="Kiểm tra nhanh" soon>
            <p className="text-sm text-[var(--muted)]">Sắp có. Chưa tính vào con dấu.</p>
          </Step>

          {/* ④ Hội thoại AI: tuỳ chọn, tốn Credit, cho dấu son */}
          {roleplay && <RoleplayStep roleplay={roleplay} stamped={stamped} red={red} onOpen={(id) => navigate(`/scenarios/${id}`)} />}
        </ol>
      </section>
      <style>{`
        .jm-lesson { box-shadow: inset 0 0 0 3px var(--paper), inset 0 0 0 4px var(--rule), var(--sh-3); }
        .jm-phrase rt { font-size: 0.55em; color: var(--ink-2); }
      `}</style>
    </div>
  );
};

const StampStatus: React.FC<{ state: ReturnType<typeof stampOf> }> = ({ state }) => {
  const text =
    state === 'red' ? 'Đã có dấu son' : state === 'stamp' ? 'Đã có con dấu' : state === 'understood' ? 'Đã hiểu · còn Shadowing' : 'Chưa có con dấu';
  const color = state === 'red' ? 'var(--shu)' : state === 'stamp' ? 'var(--ink)' : 'var(--ink-2)';
  return (
    <p className="mt-1.5 text-xs font-semibold" style={{ color }}>
      {text}
    </p>
  );
};

const Step: React.FC<{ n: number; title: string; done?: boolean; soon?: boolean; children: React.ReactNode }> = ({ n, title, done, soon, children }) => (
  <li className={`rounded-[8px] border p-3.5 ${soon ? 'border-dashed border-[var(--ghost)]' : 'border-[var(--rule)] bg-[var(--paper)]'}`}>
    <div className="mb-2 flex items-center gap-2">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={done ? { background: 'var(--ink)', color: 'var(--paper)' } : { border: '1.5px solid var(--ghost)', color: 'var(--ink-2)' }}
        aria-hidden="true"
      >
        {done ? '✓' : n}
      </span>
      <h3 className="text-sm font-bold text-[var(--ink)]">
        {title}
        {done && <span className="sr-only"> (đã xong)</span>}
      </h3>
    </div>
    {children}
  </li>
);

const ActivityLaunch: React.FC<{
  icon: React.ReactNode;
  title?: string | null;
  note: string;
  action: string;
  onClick: () => void;
  primary: boolean;
  disabled?: boolean;
}> = ({ icon, title, note, action, onClick, primary, disabled }) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="min-w-0 flex-1 basis-56">
      {title && (
        <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
          {icon}
          {title}
        </div>
      )}
      <p className="mt-0.5 text-xs text-[var(--ink-2)]">{note}</p>
    </div>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="jm-focus h-10 shrink-0 rounded-[6px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={
        primary
          ? { background: 'var(--primary)', color: '#fff' }
          : { background: 'var(--primary-soft)', color: 'var(--primary-ink)' }
      }
    >
      {action}
    </button>
  </div>
);

const RoleplayStep: React.FC<{ roleplay: ExploreActivity; stamped: boolean; red: boolean; onOpen: (scenarioId: number) => void }> = ({
  roleplay,
  stamped,
  red,
  onOpen,
}) => (
  <Step n={4} title="Hội thoại AI (tuỳ chọn)" done={red}>
    {roleplay.scenarioId ? (
      <ActivityLaunch
        icon={<ChatIcon className="h-4 w-4" />}
        title={roleplay.title}
        note={`${roleplay.creditCost ?? 0} Credit · ${roleplay.jlptLevel ?? ''}. Hoàn thành hội thoại (đủ nhiệm vụ) để có dấu son${
          stamped ? '' : ', sau khi đã có con dấu'
        }.`}
        action={red ? 'Hội thoại lại' : 'Mở kịch bản'}
        onClick={() => onOpen(roleplay.scenarioId!)}
        primary={stamped && !red}
      />
    ) : (
      <p className="text-sm text-[var(--ink-2)]">Kịch bản chưa sẵn sàng.</p>
    )}
  </Step>
);
