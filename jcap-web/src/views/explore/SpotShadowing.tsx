import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, Icon, IconButton, MicButton, ScoreRing } from '../../components/jcap';
import type { PrefectureShape } from '../../data/japanMap';
import { displayRoleName, isSystemBusyCode, useShadowingSession } from '../../hooks/useShadowingSession';
import type { ExploreSpot } from '../../types/explore';
import { describeDeviceStatus } from '../../utils/audioDevice';
import { buildWordFeedback } from '../../utils/wordFeedback';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import FluencyPanel from '../../components/shadowing/FluencyPanel';
import { SpotShadowingNotes } from './SpotShadowingNotes';
import { SpotShadowingSummary } from './SpotShadowingSummary';
import {
  SentenceText,
  bestScoreOf,
  forgetResume,
  rememberResume,
  rememberRole,
  roleOf,
  toneOf,
  type NoteTab,
} from './spotShadowingShared';
import './spotShadowing.css';

/** Thời gian chạy hiệu ứng đóng khung (khớp .ssc.is-out) */
const EXIT_MS = 220;

export interface SpotShadowingProps {
  spot: ExploreSpot;
  pref: PrefectureShape;
  dialogueId: number;
  /** Điểm đạt Shadowing của mốc */
  pass: number;
  /** Màu mực của vùng (REGION_STYLE[...].ink) */
  regionInk: string;
  furigana: boolean;
  /** Đóng xong (sau hiệu ứng): kèm thông báo hiện trên bản đồ, nếu có */
  onClosed: (toast: string | null) => void;
}

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?';

/**
 * Shadowing tại mốc (HANDOFF 9g): khung chat mở bên trái ngăn thông tin tỉnh, bản đồ vẫn ở phía sau.
 * Toàn bộ thu âm, gửi chấm, lưu buổi dùng chung hook với trang luyện cũ; không đổi API hay cách tính điểm.
 */
export const SpotShadowing: React.FC<SpotShadowingProps> = ({ spot, pref, dialogueId, pass, regionInk, furigana, onClosed }) => {
  const [note, setNote] = useState<NoteTab | null>(null);
  const [resultDot, setResultDot] = useState(false);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'leave' | 'restart' | 'role' | 'end' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  /** Đánh giá câu vừa chấm (so từng từ, chỗ cần chỉnh, lưu loát) ngay trong khung thu âm; người học có thể thu gọn */
  const [showEval, setShowEval] = useState(true);
  const roleBeforeSwap = useRef<'A' | 'B' | null>(null);

  const session = useShadowingSession({
    dialogueId,
    initialRole: roleOf(dialogueId),
    onFinish: () => setNote((n) => (n === 'res' ? n : null)),
    onRoleChange: (role) => {
      rememberRole(dialogueId, role);
      setMaxReached(0);
      setOpenIds(new Set());
      setSelectedId(null);
      setResultDot(false);
      const old = roleBeforeSwap.current;
      roleBeforeSwap.current = null;
      if (old && old !== role) setToast(`Đã đổi sang vai ${role}. Tiến độ của vai ${old} vẫn được giữ.`);
    },
  });
  const {
    dialogue,
    isLoading,
    errorMessage,
    userRole,
    practiceState,
    currentSentenceIndex,
    currentSentence,
    isOpponentPausedForResume,
    isPlayingAudio,
    hasMicrophone,
    micError,
    micNotice,
    progressSyncError,
    submitError,
    currentScore,
    currentEvaluationStatus,
    currentGateDetail,
    currentErrorCode,
    currentDiffTokens,
    currentRecognizedText,
    currentFluencyMetrics,
    canResendTake,
    sentenceAttemptsMap,
    sentenceStates,
    recordedAudioUrls,
    playingUserAudioSentenceId,
    serverProgress,
  } = session;

  // Câu xa nhất đã tới: nói lại một câu cũ thì các câu sau vẫn còn trong hội thoại
  const [maxReached, setMaxReached] = useState(0);
  useEffect(() => {
    setMaxReached((m) => Math.max(m, currentSentenceIndex));
  }, [currentSentenceIndex]);

  // Rời khung bằng bất kỳ đường nào (nút đóng, Back của trình duyệt): nhớ vị trí đang dở cho nhãn "Tiếp tục (câu N/T)"
  const exitInfoRef = useRef<{ index: number; total: number; started: boolean; completed: boolean } | null>(null);
  exitInfoRef.current = dialogue
    ? {
        index: currentSentenceIndex,
        total: dialogue.sentences.length,
        started: currentSentenceIndex > 0 || session.sentenceResults.size > 0,
        completed: practiceState === 'completed',
      }
    : null;
  useEffect(
    () => () => {
      const info = exitInfoRef.current;
      if (!info) return;
      if (info.completed) forgetResume(dialogueId);
      else if (info.started) rememberResume(dialogueId, info.index, info.total);
    },
    [dialogueId],
  );

  // Thông báo nhỏ trong khung tự ẩn
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Vừa có điểm mới mà trang Kết quả chưa mở: chấm đỏ trên tab Kết quả
  const scoredNow = practiceState === 'evaluated' && (currentEvaluationStatus === 'completed' || currentEvaluationStatus === 'partial');
  useEffect(() => {
    if (scoredNow && note !== 'res') setResultDot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoredNow, currentSentenceIndex]);
  useEffect(() => {
    if (note === 'res') setResultDot(false);
  }, [note]);

  // Đồng hồ khi đang thu
  const [recSeconds, setRecSeconds] = useState(0);
  useEffect(() => {
    if (practiceState !== 'listening') return;
    setRecSeconds(0);
    const started = Date.now();
    const t = window.setInterval(() => setRecSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(t);
  }, [practiceState]);

  // Tiếp tục phiên dở: ghi lại vị trí lúc mở để hiện dòng "Tiếp tục từ câu N"
  const [resumeFrom, setResumeFrom] = useState<number | null>(null);
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (resumeChecked.current || isLoading || !dialogue) return;
    resumeChecked.current = true;
    if (serverProgress && !serverProgress.created && currentSentenceIndex > 0) setResumeFrom(currentSentenceIndex + 1);
  }, [isLoading, dialogue, serverProgress, currentSentenceIndex]);

  // Câu mới hoặc trạng thái mới: cuộn hội thoại xuống cuối
  const convRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = convRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [currentSentenceIndex, practiceState, dialogue]);

  const hasUnsentTake = practiceState === 'listening' || practiceState === 'recorded';

  // ---------- đóng khung ----------
  const finishClose = () => {
    const info = exitInfoRef.current;
    const message = info && !info.completed && info.started ? `Đã lưu. Lần sau bạn tiếp tục từ câu ${info.index + 1}.` : null;
    session.stopAllAudio();
    setLeaving(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => onClosed(message), reduce ? 150 : EXIT_MS);
  };
  const requestClose = () => {
    if (leaving) return;
    if (hasUnsentTake) setDialog('leave');
    else finishClose();
  };
  const leaveAnyway = () => {
    if (practiceState === 'listening') session.cancelRecording();
    else if (practiceState === 'recorded') session.discardRecordedTake();
    setDialog(null);
    finishClose();
  };

  // Esc: đóng hộp xác nhận, gấp trang ghi chú, rồi mới đóng khung (chặn để bản đồ không lùi cấp cùng lúc)
  const escRef = useRef(() => {});
  escRef.current = () => {
    if (dialog) setDialog(null);
    else if (note) setNote(null);
    else requestClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      escRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ---------- đổi vai, làm lại, kết thúc ----------
  const doSwapRole = () => {
    setDialog(null);
    roleBeforeSwap.current = userRole;
    session.handleConfirmRoleChange(userRole === 'A' ? 'B' : 'A');
  };
  const askSwapRole = () => (hasUnsentTake ? setDialog('role') : doSwapRole());
  const doRestart = () => {
    setDialog(null);
    session.handleConfirmRoleChange(userRole);
  };
  const mine = dialogue ? dialogue.sentences.filter((s) => s.speakerRole === userRole) : [];
  const scoredCount = mine.filter((s) => bestScoreOf(session, s.id) != null).length;
  const askEnd = () => {
    if (scoredCount === 0) {
      requestClose();
      return;
    }
    if (scoredCount < mine.length || hasUnsentTake) setDialog('end');
    else session.handleFinishDialogue();
  };
  const endNow = () => {
    setDialog(null);
    if (practiceState === 'listening') session.cancelRecording();
    else if (practiceState === 'recorded') session.discardRecordedTake();
    session.handleFinishDialogue();
  };

  const openResultOf = (sentenceId: number) => {
    setSelectedId(sentenceId);
    setOpenIds((prev) => new Set(prev).add(sentenceId));
    setNote('res');
  };
  const toggleOpen = (id: number) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const redo = (index: number) => {
    session.goToSentence(index);
    if (window.matchMedia('(max-width: 1279px)').matches) setNote(null);
  };

  // ---------- nội dung ----------
  const title = dialogue?.title ?? spot.lesson?.activities.find((a) => a.type === 'Shadowing')?.title ?? spot.nameVi;
  const opponentName = dialogue ? displayRoleName(userRole === 'A' ? dialogue.speakerRoleB_Name : dialogue.speakerRoleA_Name) : '';
  const learnerName = dialogue ? displayRoleName(userRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name) : '';
  const sentences = dialogue?.sentences ?? [];
  const completed = practiceState === 'completed';
  const visible = completed ? sentences : sentences.slice(0, Math.max(currentSentenceIndex, maxReached) + 1);
  const isLearnerTurn = !!currentSentence && currentSentence.speakerRole === userRole;
  const hasNextLearnerSentence = sentences.slice(currentSentenceIndex + 1).some((s) => s.speakerRole === userRole);
  const isLastSentence = currentSentenceIndex >= sentences.length - 1;
  const noProgressYet = currentSentenceIndex === 0 && scoredCount === 0 && !completed;

  const listen = (s: { id: number; nativeAudioUrl?: string | null; japaneseText: string }) =>
    session.playAudio(s.nativeAudioUrl ?? undefined, s.japaneseText, undefined, undefined, s.id);

  return (
    <div className={`ssc ${leaving ? 'is-out' : 'is-in'}`} style={{ '--region-ink': regionInk } as React.CSSProperties}>
      {dialogue && (
        <SpotShadowingNotes
          session={session}
          spot={spot}
          note={note}
          furigana={furigana}
          resultDot={resultDot}
          openIds={openIds}
          onToggleOpen={toggleOpen}
          onNote={setNote}
          onSwapRole={askSwapRole}
          onEnd={askEnd}
          onRestart={() => setDialog('restart')}
          onRedo={redo}
        />
      )}

      <section className="ssc-frame" role="dialog" aria-labelledby="ssc-title">
        <header className="ssc-top">
          <div className="ssc-title">
            <h2 id="ssc-title">{title}</h2>
            <span lang="ja">{spot.nameJp}</span>
          </div>
          <IconButton icon="close" label="Đóng khung luyện" onClick={requestClose} />
        </header>

        <div className="ssc-main">
          {isLoading ? (
            <div className="ssc-state" role="status">
              <span className="ssc-spin" aria-hidden="true" />
              Đang chuẩn bị bài luyện...
            </div>
          ) : errorMessage || !dialogue ? (
            <div className="ssc-state">
              <EmptyState icon="cloud_off" title={`Không tải được bài ${title}`}>
                {errorMessage ?? 'Kiểm tra kết nối mạng rồi thử lại.'} Tiến độ của bạn không bị mất.
              </EmptyState>
              <Button variant="secondary" onClick={requestClose}>
                Về bản đồ
              </Button>
            </div>
          ) : (
            <>
              <div className="ssc-conv" ref={convRef}>
                <div className="ssc-col">
                  {noProgressYet && (
                    <div className="ssc-cover">
                      <div className="ssc-cover-roles">
                        <span className="ssc-cover-p">
                          <span className="ssc-av me" aria-hidden="true" style={{ margin: 0, width: 44, height: 44 }}>
                            Bạn
                          </span>
                          <b>{learnerName}</b>
                          <small>{`Vai ${userRole} của bạn`}</small>
                        </span>
                        <span className="ssc-cover-dash" aria-hidden="true" />
                        <span className="ssc-cover-p">
                          <span className="ssc-av" aria-hidden="true" style={{ margin: 0, width: 44, height: 44, fontSize: 18 }}>
                            {initial(opponentName)}
                          </span>
                          <b>{opponentName}</b>
                          <small>Nhân vật</small>
                        </span>
                      </div>
                      {(dialogue.sourceDescription || spot.lesson?.situation) && (
                        <p className="ssc-cover-say">{dialogue.sourceDescription || spot.lesson?.situation}</p>
                      )}
                      <ul className="ssc-cover-meta">
                        <li>
                          <b>{mine.length}</b> câu của bạn
                        </li>
                        {pass > 0 && (
                          <li>
                            <b>{pass}</b> điểm để nhận con dấu
                          </li>
                        )}
                        {spot.lesson?.estimatedMinutes ? (
                          <li>
                            <b>{spot.lesson.estimatedMinutes}</b> phút
                          </li>
                        ) : null}
                      </ul>
                      <p className="ssc-cover-tip">Bối cảnh, cả bài, từ vựng và ngữ pháp nằm ở các tab bên trái.</p>
                    </div>
                  )}

                  {resumeFrom != null && (
                    <p className="ssc-resume">
                      <Icon name="history" size={18} />
                      {`Tiếp tục từ câu ${resumeFrom}`}
                    </p>
                  )}

                  {visible.map((s, idx) => {
                    const me = s.speakerRole === userRole;
                    const isCurrent = !completed && idx === currentSentenceIndex;
                    if (!me) {
                      const talking = isCurrent && practiceState === 'opponent-speaking' && !isOpponentPausedForResume && isPlayingAudio;
                      return (
                        <div key={s.id} className={`ssc-ln ai ${talking ? 'talking' : ''}`}>
                          <span className="ssc-av" aria-hidden="true">
                            {initial(opponentName)}
                          </span>
                          <div className="ssc-c">
                            <div className="ssc-name">
                              <span>{opponentName}</span>
                            </div>
                            <div className="ssc-b">
                              <SentenceText className="ssc-jp" text={s.japaneseText} segments={session.furiganaMap.get(s.id)} show={furigana} />
                              {session.isTranslationShown(s.id) && <span className="ssc-vi">{s.vietnameseTranslation}</span>}
                            </div>
                            <div className="ssc-tools">
                              <button type="button" className="ssc-t" onClick={() => listen(s)}>
                                <Icon name={session.loadingAudioSentenceId === s.id ? 'progress_activity' : 'volume_up'} spin={session.loadingAudioSentenceId === s.id} size={18} />
                                Nghe mẫu
                              </button>
                              <button type="button" className="ssc-t" aria-pressed={session.isTranslationShown(s.id)} onClick={() => session.toggleTranslation(s.id)}>
                                <Icon name="translate" size={18} />
                                {session.isTranslationShown(s.id) ? 'Ẩn nghĩa' : 'Dịch'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const entry = sentenceStates.get(s.id);
                    const activeScored = isCurrent && scoredNow;
                    const score = activeScored ? currentScore : bestScoreOf(session, s.id);
                    const pending = isCurrent && !activeScored && entry?.state !== 'EVALUATION_FAILED' && practiceState !== 'evaluated';
                    let pill: React.ReactNode = null;
                    if (entry?.state === 'RECORDED') pill = <span className="ssc-pill wait">Chưa gửi</span>;
                    else if (entry?.state === 'EVALUATING') pill = <span className="ssc-pill busy">Đang chấm</span>;
                    else if (score != null) pill = <span className={`ssc-pill ${toneOf(score)}`}>{`${score} điểm`}</span>;
                    else if (entry?.state === 'EVALUATION_FAILED') pill = <span className="ssc-pill na">Chưa chấm được</span>;
                    const canOpen = score != null || entry?.state === 'EVALUATION_FAILED';
                    return (
                      <div key={s.id} className={`ssc-ln me ${pending ? 'pending' : ''} ${selectedId === s.id && note === 'res' ? 'sel' : ''}`}>
                        <span className="ssc-av" aria-hidden="true">
                          Bạn
                        </span>
                        <div className="ssc-c">
                          <div className="ssc-name">
                            <span>{pending ? 'Lượt của bạn' : learnerName}</span>
                            {pill}
                          </div>
                          {canOpen ? (
                            <button
                              type="button"
                              className="ssc-b can-open"
                              onClick={() => openResultOf(s.id)}
                              aria-label={`Xem kết quả câu: ${s.japaneseText}`}
                            >
                              <SentenceText className="ssc-jp" text={s.japaneseText} segments={session.furiganaMap.get(s.id)} show={furigana} />
                              {session.isTranslationShown(s.id) && <span className="ssc-vi">{s.vietnameseTranslation}</span>}
                            </button>
                          ) : (
                            <div className="ssc-b">
                              <SentenceText className="ssc-jp" text={s.japaneseText} segments={session.furiganaMap.get(s.id)} show={furigana} />
                              {session.isTranslationShown(s.id) && <span className="ssc-vi">{s.vietnameseTranslation}</span>}
                            </div>
                          )}
                          <div className="ssc-tools">
                            {!isCurrent && !completed && (
                              <button type="button" className="ssc-t ic" aria-label="Nói lại câu này" onClick={() => session.goToSentence(idx)}>
                                <Icon name="mic" size={18} />
                              </button>
                            )}
                            <button type="button" className="ssc-t" onClick={() => listen(s)}>
                              <Icon name={session.loadingAudioSentenceId === s.id ? 'progress_activity' : 'volume_up'} spin={session.loadingAudioSentenceId === s.id} size={18} />
                              Nghe mẫu
                            </button>
                            <button type="button" className="ssc-t" aria-pressed={session.isTranslationShown(s.id)} onClick={() => session.toggleTranslation(s.id)}>
                              <Icon name="translate" size={18} />
                              {session.isTranslationShown(s.id) ? 'Ẩn nghĩa' : 'Dịch'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {completed && (
                    <SpotShadowingSummary
                      session={session}
                      spot={spot}
                      pref={pref}
                      pass={pass}
                      onOpenResults={() => setNote('res')}
                      onRetryAll={doRestart}
                      onSwapRole={doSwapRole}
                      onDone={requestClose}
                    />
                  )}
                </div>
              </div>

              {!completed && currentSentence && (
                <div className="ssc-dock">
                  <div className="ssc-dk" aria-live="polite">
                    {!isLearnerTurn ? (
                      isOpponentPausedForResume ? (
                        <div className="ssc-dk-row">
                          <Button variant="primary" icon="volume_up" onClick={session.handlePlayResumedOpponentSentence}>
                            {`Nghe ${opponentName}`}
                          </Button>
                          <span className="ssc-sp" />
                          {hasNextLearnerSentence && (
                            <Button variant="ghost" icon="skip_next" onClick={session.handleSkipOpponentSpeech}>
                              Sang lượt của bạn
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="ssc-dk-row">
                          <span className="ssc-wave" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                          </span>
                          <span className="ssc-dk-who">
                            <b>{opponentName}</b> đang nói
                          </span>
                          <span className="ssc-sp" />
                          {hasNextLearnerSentence && (
                            <Button variant="ghost" size="sm" icon="skip_next" onClick={session.handleSkipOpponentSpeech}>
                              Sang lượt của bạn
                            </Button>
                          )}
                        </div>
                      )
                    ) : hasMicrophone === false ? (
                      <div className="ssc-dk-fail">
                        <div className="msg">
                          <span className="ic">
                            <Icon name="mic_off" size={22} />
                          </span>
                          <div>
                            <b>Chưa có micro</b>
                            <span>{describeDeviceStatus('audioinput', 'NOT_FOUND')} Bạn vẫn đọc và nghe được bài.</span>
                          </div>
                        </div>
                        <div className="acts">
                          <span className="ssc-sp" />
                          <Button variant="secondary" size="sm" icon="volume_up" onClick={() => listen(currentSentence)}>
                            Nghe mẫu
                          </Button>
                          <Button variant="primary" size="sm" icon="refresh" onClick={session.startRecording}>
                            Thử lại
                          </Button>
                        </div>
                      </div>
                    ) : practiceState === 'listening' ? (
                      <div className="ssc-dk-rec">
                        <span className="t" aria-label={`Đã thu ${recSeconds} giây`}>
                          {`0:${String(recSeconds).padStart(2, '0')}`}
                        </span>
                        <span className="ssc-wave rec" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                        <Button variant="ghost" onClick={session.cancelRecording}>
                          Huỷ
                        </Button>
                        <Button variant="primary" icon="stop" onClick={session.finishRecording}>
                          Dừng
                        </Button>
                      </div>
                    ) : practiceState === 'recorded' ? (
                      <>
                        <div className="ssc-dk-row">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={playingUserAudioSentenceId === -1 ? 'stop_circle' : 'play_arrow'}
                            onClick={() => {
                              if (playingUserAudioSentenceId === -1) {
                                session.userAudioPlayerRef.current?.pause();
                                session.setPlayingUserAudioSentenceId(null);
                              } else session.playPendingTake();
                            }}
                          >
                            Nghe lại
                          </Button>
                          <Button variant="ghost" size="sm" icon="mic" onClick={session.startRecording}>
                            Thu lại
                          </Button>
                          <Button variant="ghost" size="sm" icon="delete" onClick={session.discardRecordedTake}>
                            Bỏ
                          </Button>
                          <span className="ssc-sp" />
                          <Button variant="primary" icon="send" onClick={session.submitPendingTake}>
                            {submitError ? 'Gửi lại' : 'Gửi chấm'}
                          </Button>
                        </div>
                        {submitError && <p className="ssc-dk-err">{submitError}</p>}
                      </>
                    ) : practiceState === 'analyzing' ? (
                      <div className="ssc-dk-scoring" role="status">
                        <span className="ssc-spin" aria-hidden="true" />
                        Đang chấm câu của bạn…
                      </div>
                    ) : practiceState === 'evaluated' && scoredNow ? (
                      <div className="ssc-dk-scored">
                        <ScoreRing value={currentScore} size={52} />
                        <div className="s">
                          <b>{`Câu của bạn: ${currentScore} điểm`}</b>
                          <span>
                            {toneOf(currentScore) === 'good' ? 'Khớp tốt' : toneOf(currentScore) === 'mid' ? 'Khớp một phần' : 'Cần luyện lại'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ssc-dk-toggle"
                          aria-expanded={showEval}
                          aria-controls="ssc-dk-eval"
                          onClick={() => setShowEval((v) => !v)}
                        >
                          {showEval ? 'Thu gọn đánh giá' : 'Xem đánh giá'}
                          <Icon name="expand_more" size={18} />
                        </button>
                        {showEval && (
                          <div className="ssc-dk-eval" id="ssc-dk-eval" tabIndex={0} role="region" aria-label="Đánh giá câu vừa nói">
                            <JapaneseSentenceDiffView
                              diffTokens={currentDiffTokens}
                              targetText={currentSentence.japaneseText}
                              spokenText={currentRecognizedText}
                              size="sm"
                            />
                            {/* Danh sách "Cần chỉnh" đã nằm trong JapaneseSentenceDiffView; ở đây chỉ báo khi đọc đúng hết */}
                            {buildWordFeedback(currentDiffTokens).length === 0 && (
                              <p className="ssc-dk-good">
                                <Icon name="check_circle" size={18} />
                                Bạn đọc đúng mọi từ trong câu.
                              </p>
                            )}
                            <FluencyPanel fluency={currentFluencyMetrics} />
                          </div>
                        )}
                        <div className="acts">
                          {recordedAudioUrls.has(currentSentence.id) && (
                            <Button variant="secondary" size="sm" icon="mic" onClick={() => session.playUserRecording(currentSentence.id)}>
                              {playingUserAudioSentenceId === currentSentence.id ? 'Dừng' : 'Nghe lại'}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" icon="replay" onClick={session.handleRetryCurrentSentence}>
                            Luyện lại câu
                          </Button>
                          <Button variant="primary" size="sm" icon={isLastSentence ? 'flag' : 'arrow_forward'} onClick={session.handleNextSentence}>
                            {isLastSentence ? 'Xem tổng kết' : 'Câu tiếp'}
                          </Button>
                        </div>
                      </div>
                    ) : practiceState === 'evaluated' ? (
                      isSystemBusyCode(currentErrorCode) ? (
                        <div className="ssc-dk-fail">
                          <div className="msg">
                            <span className="ic sys">
                              <Icon name="hourglass_top" size={22} />
                            </span>
                            <div>
                              <b>Hệ thống đang bận</b>
                              <span>{currentGateDetail || 'Hệ thống đang bận chấm cho nhiều người. Hãy gửi lại sau vài giây.'}</span>
                            </div>
                          </div>
                          <div className="acts">
                            <Button variant="ghost" size="sm" onClick={session.handleNextSentence}>
                              Bỏ qua câu
                            </Button>
                            <span className="ssc-sp" />
                            <Button variant="secondary" size="sm" icon="mic" onClick={session.startRecording}>
                              Thu âm lại
                            </Button>
                            {canResendTake && (
                              <Button variant="primary" size="sm" icon="send" onClick={session.resendLastTake}>
                                Gửi lại
                              </Button>
                            )}
                          </div>
                          <p className="ssc-dk-note">Câu bỏ qua tính 0 điểm. Muốn nhận con dấu, cần chấm đủ mọi câu.</p>
                        </div>
                      ) : (
                        <div className="ssc-dk-fail">
                          <div className="msg">
                            <span className="ic">
                              <Icon name="mic_off" size={22} />
                            </span>
                            <div>
                              <b>
                                Chưa chấm được câu này
                                <Badge tone="neutral">{`Lần thử ${sentenceAttemptsMap.get(currentSentence.id) ?? 1}`}</Badge>
                              </b>
                              <span>{`${currentGateDetail || 'Chưa thể đánh giá bản ghi này.'} Lần thử này không tính điểm và không trừ gì.`}</span>
                            </div>
                          </div>
                          <div className="acts">
                            {recordedAudioUrls.has(currentSentence.id) && (
                              <Button variant="secondary" size="sm" icon="play_arrow" onClick={() => session.playUserRecording(currentSentence.id)}>
                                Nghe lại bản thu
                              </Button>
                            )}
                            <span className="ssc-sp" />
                            <Button variant="ghost" size="sm" onClick={session.handleNextSentence}>
                              Bỏ qua câu
                            </Button>
                            <Button variant="primary" size="sm" icon="mic" onClick={session.startRecording}>
                              Thu âm lại
                            </Button>
                          </div>
                          <p className="ssc-dk-note">Câu bỏ qua tính 0 điểm. Muốn nhận con dấu, cần chấm đủ mọi câu.</p>
                        </div>
                      )
                    ) : (
                      <div className="ssc-dk-mic">
                        <MicButton state="idle" label="Bấm để thu âm" hideLabel size="md" onClick={session.startRecording} />
                      </div>
                    )}

                    {micError && isLearnerTurn && hasMicrophone !== false && (
                      <p className="ssc-dk-warn" role="alert">
                        <Icon name="mic_off" size={18} />
                        <span>{micError}</span>
                        <span className="ssc-sp" />
                        <button type="button" onClick={() => session.setMicError(null)} aria-label="Đóng thông báo">
                          <Icon name="close" size={16} />
                        </button>
                      </p>
                    )}
                    {micNotice && (
                      <p className="ssc-dk-warn" role="status">
                        <Icon name="info" size={18} />
                        <span>{micNotice}</span>
                        <span className="ssc-sp" />
                        <button type="button" onClick={() => session.setMicNotice(null)} aria-label="Đóng thông báo">
                          <Icon name="close" size={16} />
                        </button>
                      </p>
                    )}
                    {progressSyncError && (
                      <p className="ssc-dk-warn" role="status">
                        <Icon name="cloud_off" size={18} />
                        <span>Chưa đồng bộ được tiến độ. Bạn vẫn luyện được; con dấu được xét khi lưu buổi luyện ở cuối.</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {dialog && (
          <div className="ssc-scrim">
            <div className="ssc-dlg" role="alertdialog" aria-modal="true" aria-labelledby="ssc-dlg-title">
              {dialog === 'leave' && (
                <>
                  <h2 id="ssc-dlg-title">Rời phòng luyện?</h2>
                  <p>Bản thu của câu này chưa được gửi và sẽ bị bỏ. Các câu đã chấm vẫn được lưu.</p>
                  <div className="acts">
                    <Button variant="ghost" onClick={leaveAnyway}>
                      Bỏ và rời phòng
                    </Button>
                    <Button variant="primary" onClick={() => setDialog(null)}>
                      Ở lại
                    </Button>
                  </div>
                </>
              )}
              {dialog === 'role' && (
                <>
                  <h2 id="ssc-dlg-title">Đổi vai bây giờ?</h2>
                  <p>Bản thu của câu này chưa được gửi và sẽ bị bỏ. Tiến độ của vai hiện tại vẫn được giữ.</p>
                  <div className="acts">
                    <Button variant="ghost" onClick={() => setDialog(null)}>
                      Huỷ
                    </Button>
                    <Button variant="primary" onClick={doSwapRole}>
                      Đổi vai
                    </Button>
                  </div>
                </>
              )}
              {dialog === 'restart' && (
                <>
                  <h2 id="ssc-dlg-title">Làm lại từ đầu?</h2>
                  <p>Bắt đầu lại từ câu 1. Điểm các câu đã nói lần này không tính vào lần mới.</p>
                  <div className="acts">
                    <Button variant="ghost" onClick={() => setDialog(null)}>
                      Huỷ
                    </Button>
                    <Button variant="primary" onClick={doRestart}>
                      Bắt đầu lại
                    </Button>
                  </div>
                </>
              )}
              {dialog === 'end' && (
                <>
                  <h2 id="ssc-dlg-title">Kết thúc buổi luyện?</h2>
                  <p>
                    {scoredCount < mine.length
                      ? `Còn ${mine.length - scoredCount} câu chưa chấm, tính 0 điểm. Muốn nhận con dấu, cần chấm đủ mọi câu.`
                      : 'Bản thu của câu này chưa được gửi và sẽ bị bỏ.'}
                  </p>
                  <div className="acts">
                    <Button variant="ghost" onClick={endNow}>
                      Vẫn kết thúc
                    </Button>
                    <Button variant="primary" onClick={() => setDialog(null)}>
                      Luyện tiếp
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {toast && (
          <p className="ssc-toast" role="status">
            <Icon name="swap_horiz" size={20} />
            <span>{toast}</span>
          </p>
        )}
      </section>
    </div>
  );
};
