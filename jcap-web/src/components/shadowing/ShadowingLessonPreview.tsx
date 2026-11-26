import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Icon, IconButton, JpText } from '../jcap';
import { displayRoleName } from '../../hooks/useShadowingSession';
import { shadowingService } from '../../services/shadowingService';
import { voicevoxService } from '../../services/voicevoxService';
import type { FuriganaSegment, ShadowingDialogueDetail, ShadowingDialogueItem, ShadowingSentenceItem } from '../../types/shadowing';
import type { ShadowingProgress } from '../../types/shadowingProgress';
import { matchingFurigana } from '../../utils/furigana';
import { getPracticePrefs } from '../../utils/practicePrefs';
import { lessonState, previewAction, scoreTone, type Role } from './library';

interface Loaded {
  detail: ShadowingDialogueDetail;
  furigana: Map<number, FuriganaSegment[]>;
}

/** Lưu tạm bài đã mở trong phiên: chuyển qua lại không phải tải lại */
const cache = new Map<number, Loaded>();

function useDialogue(id: number) {
  const [data, setData] = useState<Loaded | null>(() => cache.get(id) ?? null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const cached = cache.get(id);
    setData(cached ?? null);
    setError('');
    if (cached) return;
    let cancelled = false;
    // Furigana tải không được thì vẫn hiện chữ thường
    Promise.all([shadowingService.getDetail(id), shadowingService.getFurigana(id).catch(() => new Map<number, FuriganaSegment[]>())]).then(
      ([res, furigana]) => {
        if (cancelled) return;
        if (res.success && res.data) {
          const loaded = { detail: res.data, furigana };
          cache.set(id, loaded);
          setData(loaded);
        } else {
          setError(res.message || 'Không tải được kịch bản.');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);
  return { data, error, retry: () => setAttempt((a) => a + 1) };
}

/** Nghe một câu: file có sẵn của bài, không có thì giọng VOICEVOX, cuối cùng là giọng trình duyệt */
function useSentenceAudio() {
  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const turn = useRef(0);
  const stop = useCallback(() => {
    turn.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setPlaying(null);
  }, []);
  useEffect(() => stop, [stop]);

  const play = async (s: ShadowingSentenceItem) => {
    if (playing === s.id) return stop();
    stop();
    const mine = turn.current;
    setPlaying(s.id);
    const done = () => mine === turn.current && setPlaying(null);
    const speak = () => {
      if (!window.speechSynthesis) return done();
      const u = new SpeechSynthesisUtterance(s.japaneseText);
      u.lang = 'ja-JP';
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    };
    try {
      const native = s.nativeAudioUrl;
      const url = native && (native.startsWith('http') || native.startsWith('/audio'))
        ? native
        : await voicevoxService.getAudioUrl(s.japaneseText, Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3);
      if (mine !== turn.current) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = done;
      audio.onerror = speak;
      await audio.play();
    } catch {
      if (mine === turn.current) speak();
    }
  };
  return { playing, play };
}

/** Câu có furigana viết theo cú pháp của JpText: {漢字|かんじ} */
const rubyText = (text: string, segments?: FuriganaSegment[]) =>
  matchingFurigana(text, segments)
    ?.map((s) => (s.reading ? `{${s.text}|${s.reading}}` : s.text))
    .join('') ?? text;

export const ShadowingLessonPreview: React.FC<{
  item: ShadowingDialogueItem;
  progress: ShadowingProgress | null;
  best?: number;
  saved: boolean;
  /** Trang giữ trạng thái này để đổi bài không phải bật lại */
  furigana: boolean;
  onToggleFurigana: () => void;
  onToggleSave: () => void;
  onStart: (url: string) => void;
  /** Điện thoại: quay lại danh sách */
  onBack: () => void;
}> = ({ item, progress, best, saved, furigana, onToggleFurigana, onToggleSave, onStart, onBack }) => {
  const state = lessonState(progress);
  // Bài đang học chọn sẵn vai đang luyện, bài khác chọn A
  const [role, setRole] = useState<Role>(state === 'progress' && progress ? progress.role : 'A');
  const [meaning, setMeaning] = useState<boolean>(() => getPracticePrefs().translation);
  const { data, error, retry } = useDialogue(item.id);
  const audio = useSentenceAudio();

  const sentences = data ? [...data.detail.sentences].sort((a, b) => a.orderIndex - b.orderIndex) : [];
  const sameRole = state === 'progress' && progress?.role === role;
  const current = sameRole && progress ? progress.currentSentenceIndex : -1;
  const action = previewAction(item.id, role, progress);

  // Mở bài đang học: cuộn tới câu đang dừng
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('.cur');
    // .script là phần tử mốc (position: relative) nên offsetTop của dòng đã tính từ đầu danh sách
    if (list) list.scrollTop = row ? Math.max(0, row.offsetTop - 40) : 0;
  }, [data, current]);

  const score = best === undefined ? null : Math.round(best);

  return (
    <section className="shl-pv" aria-label={`Xem trước bài ${item.title}`}>
      <header className="head">
        <span className="back">
          <IconButton icon="arrow_back" label="Quay lại danh sách" onClick={onBack} />
        </span>
        <div className="tx">
          <h2>{item.title}</h2>
          {score !== null && (
            <p className="meta">
              <span className={`best ${scoreTone(score)}`}>
                tốt nhất <b>{score}</b>
              </span>
            </p>
          )}
        </div>
        <IconButton icon="bookmark" label={saved ? 'Bỏ lưu bài học' : 'Lưu bài học'} active={saved} onClick={onToggleSave} />
      </header>

      <div className="role">
        <div className="seg" role="radiogroup" aria-label="Vai của bạn">
          {(['A', 'B'] as const).map((r) => {
            const name = displayRoleName(r === 'A' ? item.speakerRoleA_Name : item.speakerRoleB_Name);
            return (
              <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                <span className="k" aria-hidden="true">
                  {r}
                </span>
                <span className="n" title={name}>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
        {action.note && <p className="note warn">{action.note}</p>}
      </div>

      <div className="bar">
        <p className="cap">Kịch bản</p>
        <button type="button" className="tg" aria-pressed={furigana} onClick={onToggleFurigana}>
          Furigana
        </button>
        <button type="button" className="tg" aria-pressed={meaning} onClick={() => setMeaning((v) => !v)}>
          Nghĩa
        </button>
      </div>

      {error ? (
        <div className="script-state" role="alert">
          <p>{error}</p>
          <Button variant="secondary" size="sm" icon="refresh" onClick={retry}>
            Thử lại
          </Button>
        </div>
      ) : !data ? (
        <div className="script-state skel" aria-busy="true" aria-label="Đang tải kịch bản">
          {[0, 1, 2].map((i) => (
            <span key={i} className="jc-skel" />
          ))}
        </div>
      ) : (
        <ol className="script" ref={listRef}>
          {sentences.map((s, i) => {
            const mine = s.speakerRole === role;
            return (
              <li key={s.id} className={`${mine ? 'mine' : 'other'} ${i === current ? 'cur' : ''}`}>
                <span className="who" aria-label={`Vai ${s.speakerRole}`}>
                  {s.speakerRole}
                </span>
                <div className="tx">
                  {i === current && <span className="now">Bạn dừng ở câu này</span>}
                  <JpText as="p" text={rubyText(s.japaneseText, data.furigana.get(s.id))} furigana={furigana} />
                  {meaning && <p className="vi">{s.vietnameseTranslation}</p>}
                </div>
                <span className="tail">
                  {mine && current >= 0 && i < current && <Icon name="check" size={18} className="ok" label="Đã nói" />}
                  <IconButton
                    icon={audio.playing === s.id ? 'stop_circle' : 'volume_up'}
                    label={audio.playing === s.id ? 'Dừng phát' : 'Nghe câu này'}
                    size="sm"
                    onClick={() => void audio.play(s)}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <footer className="foot">
        <Button variant="primary" block icon={action.icon} onClick={() => onStart(action.url)}>
          {action.label}
        </Button>
        {action.alt && (
          <button type="button" className="alt" onClick={() => (action.alt!.role ? setRole(action.alt!.role) : onStart(action.alt!.url!))}>
            {action.alt.label}
          </button>
        )}
      </footer>
    </section>
  );
};
