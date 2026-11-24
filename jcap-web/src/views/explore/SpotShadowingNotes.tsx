import React from 'react';
import { Button, EmptyState, Icon, IconButton } from '../../components/jcap';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import { displayRoleName, type ShadowingSession } from '../../hooks/useShadowingSession';
import type { ExploreSpot } from '../../types/explore';
import { FuriganaText } from './furigana';
import { NOTE_TABS, SentenceText, bestScoreOf, toneOf, type NoteTab } from './spotShadowingShared';

interface NotesProps {
  session: ShadowingSession;
  spot: ExploreSpot;
  note: NoteTab | null;
  furigana: boolean;
  /** Chấm đỏ ở tab Kết quả: vừa có điểm mới mà trang Kết quả chưa mở */
  resultDot: boolean;
  /** Câu đang mở chi tiết ở trang Kết quả */
  openIds: Set<number>;
  onToggleOpen: (sentenceId: number) => void;
  onNote: (tab: NoteTab | null) => void;
  /** Đổi vai (có hỏi lại nếu đang có bản thu chưa gửi) */
  onSwapRole: () => void;
  /** Kết thúc buổi luyện sớm (có hỏi lại khi còn câu chưa chấm) */
  onEnd: () => void;
  onRestart: () => void;
  /** Luyện lại một câu: nhảy tới câu đó trong hội thoại */
  onRedo: (index: number) => void;
}

/**
 * Tab sổ tay bên trái khung chat: lúc thường chỉ nhô hai chữ Hán dọc, rê chuột thì trượt ra, tab đang mở nối với trang ghi chú.
 * Nội dung chỉ lấy từ dữ liệu thật của bài và của mốc; thiếu thì hiện trạng thái trống, không tự sinh.
 */
export const SpotShadowingNotes: React.FC<NotesProps> = (props) => {
  const { note, resultDot, onNote } = props;
  const current = NOTE_TABS.find((t) => t.key === note);
  return (
    <>
      <nav className="ssc-tabs" aria-label="Ghi chú của bài hội thoại">
        {NOTE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`ssc-tab t-${t.key} ${note === t.key ? 'on' : ''}`}
            aria-expanded={note === t.key}
            aria-controls="ssc-note-page"
            aria-label={t.label}
            onClick={() => onNote(note === t.key ? null : t.key)}
          >
            <span className="k" lang="ja" aria-hidden="true">
              {t.jp}
            </span>
            <span className="l" aria-hidden="true">
              {t.label}
            </span>
            {t.key === 'res' && resultDot && <i className="nd" aria-label="có kết quả mới" />}
          </button>
        ))}
      </nav>

      {current && (
        <section className={`ssc-page ${current.key}`} id="ssc-note-page" aria-labelledby="ssc-note-title">
          <div className="ssc-grip" aria-hidden="true">
            <i />
          </div>
          <header className="ssc-ph">
            <span className="ssc-ph-jp" lang="ja" aria-hidden="true">
              {current.jp}
            </span>
            <h2 id="ssc-note-title">{current.label}</h2>
            <IconButton icon="close" label="Gấp trang ghi chú" size="sm" onClick={() => onNote(null)} />
          </header>
          <div className="ssc-pb">
            {current.key === 'ctx' && <ContextPage {...props} />}
            {current.key === 'script' && <ScriptPage {...props} />}
            {current.key === 'vocab' && <VocabPage {...props} />}
            {current.key === 'gram' && <GrammarPage {...props} />}
            {current.key === 'res' && <ResultPage {...props} />}
          </div>
        </section>
      )}
    </>
  );
};

const roleNames = (s: ShadowingSession) => {
  const d = s.dialogue!;
  const a = displayRoleName(d.speakerRoleA_Name);
  const b = displayRoleName(d.speakerRoleB_Name);
  return { a, b, me: s.userRole === 'A' ? a : b, other: s.userRole === 'A' ? b : a };
};

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?';

// ---------- Bối cảnh ----------
const ContextPage: React.FC<NotesProps> = ({ session, spot, furigana, onSwapRole }) => {
  const lesson = spot.lesson;
  const names = roleNames(session);
  const sentence = lesson?.sentence.map((seg) => (seg.reading ? ([seg.text, seg.reading] as [string, string]) : seg.text)) ?? [];
  return (
    <section className="nt" aria-label="Bối cảnh">
      <div className="nt-place">
        <Icon name="location_on" size={22} />
        <div>
          <b>{spot.nameVi}</b>
          <span lang="ja">{spot.nameJp}</span>
        </div>
      </div>
      {lesson?.situation && <p>{lesson.situation}</p>}
      {lesson?.realUse && (
        <div className="nt-sec">
          <p className="nt-l">Dùng khi</p>
          <p>{lesson.realUse}</p>
        </div>
      )}
      {lesson && sentence.length > 0 && (
        <div className="nt-sec">
          <p className="nt-l">Câu mẫu của mốc</p>
          <div className="nt-quote">
            <span className="jp" lang="ja">
              <FuriganaText segments={sentence} show={furigana} />
            </span>
            <span>{lesson.meaning}</span>
            {lesson.grammarNote && <small>{lesson.grammarNote}</small>}
          </div>
        </div>
      )}
      <div className="nt-sec">
        <p className="nt-l">Hai vai trong bài</p>
        <ul className="nt-roles">
          <li>
            <span className="ssc-av sm" aria-hidden="true">
              {initial(names.a)}
            </span>
            {names.a}
          </li>
          <li>
            <span className="ssc-av sm" aria-hidden="true">
              {initial(names.b)}
            </span>
            {names.b}
          </li>
        </ul>
      </div>
      <div className="nt-role">
        <span>
          Bạn đóng vai <b>{names.me}</b>
        </span>
        <button type="button" className="nt-link" onClick={onSwapRole}>
          <Icon name="swap_horiz" size={18} />
          Đổi vai
        </button>
      </div>
    </section>
  );
};

// ---------- Cả bài ----------
const ScriptPage: React.FC<NotesProps> = ({ session, furigana }) => {
  const d = session.dialogue!;
  return (
    <section className="nt" aria-label="Cả bài">
      <ol className="nt-script">
        {d.sentences.map((s) => {
          const me = s.speakerRole === session.userRole;
          return (
            <li key={s.id} className={me ? 'me' : undefined}>
              <div className="w">
                <span className="rn">
                  {displayRoleName(s.speakerRole === 'A' ? d.speakerRoleA_Name : d.speakerRoleB_Name)}
                  {me && ' (bạn)'}
                </span>
                <SentenceText className="jp" text={s.japaneseText} segments={session.furiganaMap.get(s.id)} show={furigana} />
                <span className="vi">{s.vietnameseTranslation}</span>
              </div>
              <button
                type="button"
                className="nt-ic"
                aria-label="Nghe câu này"
                onClick={() => session.playAudio(s.nativeAudioUrl ?? undefined, s.japaneseText, undefined, undefined, s.id)}
              >
                <Icon name={session.loadingAudioSentenceId === s.id ? 'progress_activity' : 'volume_up'} spin={session.loadingAudioSentenceId === s.id} size={19} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

// ---------- Từ vựng ----------
const VocabPage: React.FC<NotesProps> = ({ session }) => {
  const words = session.dialogue?.targetVocabularies ?? [];
  if (words.length === 0)
    return (
      <EmptyState icon="menu_book" title="Bài này chưa có danh sách từ vựng" compact>
        Từ vựng trọng tâm sẽ hiện ở đây khi bài được bổ sung.
      </EmptyState>
    );
  return (
    <section className="nt" aria-label="Từ vựng">
      <ul className="nt-words">
        {words.map((w, i) => (
          <li key={w.id ?? i}>
            <div className="hd">
              <span className="jp" lang="ja">
                {w.word}
              </span>
              {w.reading && w.reading !== w.word && (
                <span className="rd" lang="ja">
                  {w.reading}
                </span>
              )}
              {w.wordClass && <span className="t">{w.wordClass}</span>}
              <button type="button" className="nt-ic" aria-label={`Nghe từ ${w.word}`} onClick={() => session.playAudio(undefined, w.reading || w.word)}>
                <Icon name="volume_up" size={19} />
              </button>
            </div>
            <b>{w.meaning}</b>
            {w.exampleSentence && (
              <span className="ex" lang="ja">
                {w.exampleSentence}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

// ---------- Ngữ pháp ----------
const GrammarPage: React.FC<NotesProps> = ({ session, spot }) => {
  const grammars = session.dialogue?.targetGrammars ?? [];
  const note = spot.lesson?.grammarNote;
  if (grammars.length === 0 && !note)
    return (
      <EmptyState icon="schema" title="Bài này chưa có danh sách ngữ pháp" compact>
        Mẫu ngữ pháp trọng tâm sẽ hiện ở đây khi bài được bổ sung.
      </EmptyState>
    );
  return (
    <section className="nt" aria-label="Ngữ pháp">
      {note && (
        <div className="nt-sec first">
          <p className="nt-l">Ngữ pháp của câu mẫu</p>
          <div className="nt-quote">
            <span>{note}</span>
          </div>
        </div>
      )}
      {grammars.length > 0 && (
        <ul className="nt-words">
          {grammars.map((g, i) => (
            <li key={g.id ?? i}>
              <div className="hd">
                <span className="jp" lang="ja">
                  {g.pattern}
                </span>
                {g.exampleSentence && (
                  <button type="button" className="nt-ic" aria-label="Nghe câu ví dụ" onClick={() => session.playAudio(undefined, g.exampleSentence!)}>
                    <Icon name="volume_up" size={19} />
                  </button>
                )}
              </div>
              <b>{g.meaning}</b>
              {g.exampleSentence && (
                <span className="ex" lang="ja">
                  {g.exampleSentence}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {grammars.length === 0 && (
        <p className="rs-note">Bài hội thoại chưa có danh sách mẫu ngữ pháp riêng.</p>
      )}
    </section>
  );
};

// ---------- Kết quả: giống "Chi tiết từng câu" của tổng kết ----------
const ResultPage: React.FC<NotesProps> = ({ session, openIds, onToggleOpen, onEnd, onRestart, onRedo }) => {
  const d = session.dialogue!;
  const mine = d.sentences.filter((s) => s.speakerRole === session.userRole);
  const n = mine.length;
  const scores = mine.map((s) => bestScoreOf(session, s.id));
  const scored = scores.filter((x): x is number => x != null);
  const good = scored.filter((x) => toneOf(x) === 'good').length;
  const mid = scored.filter((x) => toneOf(x) === 'mid').length;
  const low = scored.length - good - mid;
  // Độ khớp nội dung: số của backend sau khi lưu; trước đó tính trên các câu có chi tiết trong buổi này (câu chưa chấm tính 0).
  // Câu chấm ở lần luyện trước (tiếp tục phiên) không có độ khớp ở client: chưa hiện số cho tới khi lưu buổi.
  const localOnly = mine.every((s) => bestScoreOf(session, s.id) == null || session.sentenceResults.has(s.id));
  const match =
    session.serverSummary?.contentAccuracy ??
    (localOnly && n > 0
      ? Math.round(mine.reduce((acc, s) => acc + (session.sentenceResults.get(s.id)?.contentMatchScore ?? 0), 0) / n)
      : null);
  const completed = session.practiceState === 'completed';

  return (
    <section className="nt" aria-label="Kết quả">
      <div className="rs-top">
        <div>
          <span className="nt-l">Câu đã chấm</span>
          <p className="rs-big">
            <b>{scored.length}</b>
            <span>/{n}</span>
          </p>
          <ul className="rs-tiers">
            <li>
              <i className="dot good" />
              {good} khớp tốt
            </li>
            <li>
              <i className="dot mid" />
              {mid} khớp một phần
            </li>
            <li>
              <i className="dot low" />
              {low} cần luyện lại
            </li>
          </ul>
        </div>
        <div>
          <span className="nt-l">Độ khớp nội dung</span>
          <p className="rs-big ai">
            <b>{match ?? '–'}</b>
            {match != null && <span>%</span>}
          </p>
          {match != null && (
            <div className="rs-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.max(0, match))}%` }} />
            </div>
          )}
          <small className="rs-note">
            {match != null ? 'Tính trên tất cả câu của vai bạn, câu chưa chấm tính 0.' : 'Có số sau khi lưu buổi luyện.'}
          </small>
        </div>
      </div>

      <div className="nt-sec">
        <p className="nt-l">Chi tiết từng câu</p>
        <ol className="rs-list">
          {mine.map((s, i) => {
            const score = scores[i];
            const res = session.sentenceResults.get(s.id);
            const attempts = res?.attemptsCount ?? session.sentenceAttemptsMap.get(s.id) ?? 0;
            const open = openIds.has(s.id);
            const index = d.sentences.findIndex((x) => x.id === s.id);
            const hasRec = session.recordedAudioUrls.has(s.id);
            return (
              <li key={s.id} className={open ? 'sel' : undefined}>
                <button type="button" className="rs-row" aria-expanded={open} aria-controls={`rs-d-${s.id}`} onClick={() => onToggleOpen(s.id)}>
                  <Icon name="expand_more" size={20} />
                  <span className="n">{`Câu ${i + 1}/${n}`}</span>
                  <span className={`rs-chip ${score == null ? 'na' : toneOf(score)}`}>{score == null ? 'Chưa chấm' : `${score} điểm`}</span>
                  {attempts > 1 && <span className="att">{`thử ${attempts} lần`}</span>}
                </button>
                <p className="rs-jp" lang="ja">
                  {s.japaneseText}
                </p>
                <div className="rs-btns">
                  {hasRec && (
                    <button type="button" className="ssc-t sm" onClick={() => session.playUserRecording(s.id)}>
                      <Icon name="mic" size={18} />
                      {session.playingUserAudioSentenceId === s.id ? 'Dừng' : 'Nghe bạn'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ssc-t sm"
                    onClick={() => session.playAudio(s.nativeAudioUrl ?? undefined, s.japaneseText, undefined, undefined, s.id)}
                  >
                    <Icon name={session.loadingAudioSentenceId === s.id ? 'progress_activity' : 'volume_up'} spin={session.loadingAudioSentenceId === s.id} size={18} />
                    Nghe mẫu
                  </button>
                  {!completed && (
                    <button type="button" className="nt-link" onClick={() => onRedo(index)}>
                      <Icon name="replay" size={18} />
                      Luyện lại câu
                    </button>
                  )}
                </div>
                {open && (
                  <div className="rs-detail" id={`rs-d-${s.id}`}>
                    {res ? (
                      <>
                        <JapaneseSentenceDiffView diffTokens={res.diffTokens} targetText={s.japaneseText} spokenText={res.recognizedText} size="sm" />
                        {res.recognizedText && (
                          <p className="rs-said">
                            <span>Hệ thống nghe được</span>
                            <span lang="ja">{res.recognizedText}</span>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="rs-said">
                        <span>
                          {score != null
                            ? `Đã chấm ở lần luyện trước: ${score} điểm. Chi tiết từng từ có trong trang Kết quả.`
                            : 'Câu này chưa được chấm.'}
                        </span>
                      </p>
                    )}
                    {s.romajiText && <p className="rs-ro">{s.romajiText}</p>}
                    {s.vietnameseTranslation && <p className="rs-vi">{s.vietnameseTranslation}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {!completed && (
        <div className="rs-acts">
          <Button variant="secondary" size="sm" onClick={onEnd}>
            {scored.length > 0 ? 'Kết thúc buổi luyện' : 'Về bản đồ'}
          </Button>
          {(scored.length > 0 || session.currentSentenceIndex > 0) && (
            <Button variant="ghost" size="sm" onClick={onRestart}>
              Làm lại từ đầu
            </Button>
          )}
        </div>
      )}
    </section>
  );
};
