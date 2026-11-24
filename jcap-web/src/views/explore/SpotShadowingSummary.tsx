import React, { useEffect, useState } from 'react';
import { Button, Icon } from '../../components/jcap';
import SessionSummaryPanel from '../../components/shadowing/SessionSummaryPanel';
import type { PrefectureShape } from '../../data/japanMap';
import { displayRoleName, type ShadowingSession } from '../../hooks/useShadowingSession';
import { exploreService } from '../../services/exploreService';
import type { ExploreSpot, ExploreSyncResult } from '../../types/explore';
import { sessionRankTitle, summarizeSessionScores } from '../../utils/shadowingSessionScores';
import { SpotStampMark } from './ExploreStamp';
import { applySync } from './exploreStore';
import { stampOf, type SpotStamp } from './learnProgress';
import { toneOf } from './spotShadowingShared';

interface SummaryProps {
  session: ShadowingSession;
  spot: ExploreSpot;
  pref: PrefectureShape;
  /** Điểm đạt Shadowing của mốc */
  pass: number;
  onOpenResults: () => void;
  onRetryAll: () => void;
  onSwapRole: () => void;
  onDone: () => void;
}

type StampCheck =
  | { status: 'idle' | 'syncing' | 'error' }
  | { status: 'ok'; state: SpotStamp; stampedAt: string | null; justStamped: boolean; justRed: boolean };

/**
 * Thẻ tổng kết cuối khung chat (thay modal tổng kết khi luyện tại mốc). Chỉ dùng số backend trả về như modal cũ và
 * SessionSummaryPanel; con dấu chỉ "đóng cộp" sau khi server đồng bộ tỉnh và xác nhận.
 */
export const SpotShadowingSummary: React.FC<SummaryProps> = ({ session, spot, pref, pass, onOpenResults, onRetryAll, onSwapRole, onDone }) => {
  const d = session.dialogue!;
  const mine = d.sentences.filter((s) => s.speakerRole === session.userRole);
  const local = summarizeSessionScores(
    mine.map((s) => s.id),
    session.sentenceResults,
  );
  const scoredCount = session.serverSummary?.evaluatedSentenceCount ?? local.practicedSentences;
  const match = session.serverSummary?.contentAccuracy ?? local.contentMatch;
  const overall = session.serverOverall ?? local.overall;
  const hasScored = scoredCount > 0;
  const saveState = session.historySaveState;
  const learnerName = displayRoleName(session.userRole === 'A' ? d.speakerRoleA_Name : d.speakerRoleB_Name);
  const otherRole = session.userRole === 'A' ? 'B' : 'A';
  const duration = session.sessionDurationSeconds;

  // Sau khi buổi luyện đã lưu: đồng bộ tỉnh để server xét và cấp con dấu, rồi mới hiện con dấu
  const [check, setCheck] = useState<StampCheck>({ status: 'idle' });
  const [understoodBusy, setUnderstoodBusy] = useState(false);
  const readSync = (data: ExploreSyncResult) => {
    applySync(data);
    const sp = data.prefecture.spots.find((x) => x.id === spot.id);
    setCheck({
      status: 'ok',
      state: stampOf(sp?.progress),
      stampedAt: sp?.progress.stampedAt ?? null,
      justStamped: data.awards.stampSpotIds.includes(spot.id),
      justRed: data.awards.redStampSpotIds.includes(spot.id),
    });
  };
  const syncStamp = async () => {
    setCheck({ status: 'syncing' });
    const res = await exploreService.syncPrefecture(pref.id);
    if (res.success && res.data) readSync(res.data);
    else setCheck({ status: 'error' });
  };
  useEffect(() => {
    if (saveState === 'saved') syncStamp();
    else setCheck({ status: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState]);

  const markUnderstood = async () => {
    setUnderstoodBusy(true);
    const res = await exploreService.markUnderstood(spot.id);
    setUnderstoodBusy(false);
    if (res.success && res.data) readSync(res.data);
    else setCheck({ status: 'error' });
  };

  const stamped = check.status === 'ok' && (check.state === 'stamp' || check.state === 'red');

  // Dòng về con dấu của mốc
  let line: { tone: 'ok' | 'no' | 'err'; icon: string; text: string; action?: React.ReactNode } | null = null;
  if (saveState === 'failed') {
    line = {
      tone: 'err',
      icon: 'cloud_off',
      text: session.historySaveMessage || 'Chưa lưu được buổi luyện vào lịch sử.',
      action: (
        <Button variant="primary" size="sm" icon="refresh" onClick={() => session.handleFinishDialogue()}>
          Lưu lại
        </Button>
      ),
    };
  } else if (!hasScored && saveState === 'idle') {
    line = { tone: 'no', icon: 'info', text: 'Chưa có câu nào được chấm nên chưa xét con dấu.' };
  } else if (check.status === 'error') {
    line = {
      tone: 'err',
      icon: 'sync_problem',
      text: 'Chưa kiểm tra được con dấu.',
      action: (
        <Button variant="primary" size="sm" icon="refresh" onClick={syncStamp}>
          Thử lại
        </Button>
      ),
    };
  } else if (check.status === 'ok') {
    if (stamped) {
      const text = check.justStamped
        ? check.justRed
          ? 'Bạn vừa nhận con dấu và dấu son của mốc này.'
          : 'Bạn vừa nhận con dấu của mốc này.'
        : 'Bạn đã có con dấu của mốc này.';
      line = { tone: 'ok', icon: 'verified', text };
    } else if (check.state === 'none') {
      line = {
        tone: 'no',
        icon: 'lightbulb',
        text: 'Còn bước Hiểu câu mẫu để nhận con dấu.',
        action: (
          <Button variant="primary" size="sm" icon="check" loading={understoodBusy} onClick={markUnderstood}>
            Tôi đã hiểu
          </Button>
        ),
      };
    } else if (session.serverSummary && session.serverSummary.evaluatedSentenceCount < session.serverSummary.learnerSentenceCount) {
      const left = session.serverSummary.learnerSentenceCount - session.serverSummary.evaluatedSentenceCount;
      line = { tone: 'no', icon: 'pending', text: `Còn ${left} câu chưa chấm. Con dấu cần chấm đủ mọi câu của vai bạn.` };
    } else if (overall < pass) {
      line = { tone: 'no', icon: 'trending_up', text: `Còn thiếu ${pass - overall} điểm để nhận con dấu (cần ${pass}).` };
    } else {
      line = { tone: 'no', icon: 'info', text: 'Chưa nhận được con dấu ở lần này.' };
    }
  }

  const busy = saveState === 'saving' || check.status === 'syncing';

  return (
    <section className="ce" aria-live="polite" aria-label="Tổng kết buổi luyện">
      {stamped && check.status === 'ok' && (
        <div className="ce-stamp-art">
          <SpotStampMark
            iconId={spot.iconId}
            nameJp={spot.nameJp}
            sub={pref.nameJp}
            date={check.stampedAt}
            state={check.state}
            size={120}
            seed={spot.id}
            pressing={check.justStamped}
          />
        </div>
      )}

      <header className="ce-h">
        <h2>{hasScored ? 'Hoàn thành bài luyện!' : 'Buổi luyện đã kết thúc'}</h2>
        <p className="ce-sub">{`${d.title} · JLPT ${d.jlptLevel} · Vai ${session.userRole} (${learnerName})`}</p>
        <p role="status" className={`ce-save ${saveState === 'saved' ? 'ok' : saveState === 'failed' ? 'fail' : ''}`}>
          {saveState === 'saving' && 'Đang lưu buổi luyện vào lịch sử...'}
          {saveState === 'saved' && 'Đã lưu buổi luyện vào lịch sử.'}
        </p>
      </header>

      {busy ? (
        <p className="ce-line no">
          <span className="ssc-spin" aria-hidden="true" />
          {saveState === 'saving' ? 'Đang lưu buổi luyện...' : 'Đang kiểm tra con dấu của mốc...'}
        </p>
      ) : (
        line && (
          <div className={`ce-line ${line.tone}`}>
            <Icon name={line.icon} size={20} />
            <span>{line.text}</span>
            {line.action}
          </div>
        )
      )}

      {hasScored ? (
        <div className="ce-score">
          <div className="ce-main">
            <p className={`ce-num ${toneOf(overall)}`}>
              <b>{overall}</b>
              <span>/ 100 điểm</span>
            </p>
            <p className="ce-rank">{sessionRankTitle(overall)}</p>
          </div>
          <dl className="ce-stats">
            <div>
              <dt>Câu đã chấm</dt>
              <dd>
                <b>{scoredCount}</b>/{mine.length}
              </dd>
              <dd className="tiers" aria-label={`${local.greenCount} khớp tốt, ${local.yellowCount} khớp một phần, ${local.redCount} cần luyện lại`}>
                <i className="dot good" />
                {local.greenCount}
                <i className="dot mid" />
                {local.yellowCount}
                <i className="dot low" />
                {local.redCount}
              </dd>
            </div>
            <div>
              <dt>Độ khớp nội dung</dt>
              <dd>
                <b>{match}</b>%
              </dd>
            </div>
            <div>
              <dt>Thời gian luyện</dt>
              <dd>
                <b>{`${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`}</b>
              </dd>
              <dd className="ce-note">phút : giây</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="ce-none">
          <b>Chưa có câu nào được chấm điểm</b>
          <span>Bấm Luyện lại bài này, ghi âm từng câu của vai bạn rồi gửi để nhận điểm và lưu vào lịch sử.</span>
        </div>
      )}

      {local.gateStatus === 'needs_retry' && (
        <p className="ce-warn">
          <Icon name="mic_external_off" size={18} />
          Tín hiệu micro hơi nhỏ hoặc có tạp âm ở một số câu. Dùng tai nghe có micro sẽ cho kết quả ổn định hơn.
        </p>
      )}

      {session.serverSummary && (
        <div className="ce-panel">
          <SessionSummaryPanel summary={session.serverSummary} sessionId={session.completedSessionId} />
        </div>
      )}

      <button type="button" className="ce-link" onClick={onOpenResults}>
        Xem chi tiết từng câu
      </button>

      <div className="ce-acts">
        <Button variant="secondary" size="sm" onClick={onRetryAll}>
          Luyện lại bài này
        </Button>
        <Button variant="ghost" size="sm" onClick={onSwapRole}>
          {`Đổi sang vai (${otherRole})`}
        </Button>
        <span className="ssc-sp" />
        <Button variant="primary" size="sm" onClick={onDone}>
          Xong
        </Button>
      </div>
    </section>
  );
};
