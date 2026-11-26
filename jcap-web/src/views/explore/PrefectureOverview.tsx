import React from 'react';
import { useNavigate } from 'react-router-dom';
import { REGIONS, type PrefectureShape } from '../../data/japanMap';
import { PICTOGRAM_CREDIT } from '../../data/japanPictograms';
import type { ProvinceWord } from '../../data/learnContent';
import { Button, Icon, IconButton } from '../../components/jcap';
import { isStamped } from './learnProgress';
import type { PanelSpot } from './panelSpot';
import { BOUNDARY_CREDIT } from './prefectureDetail';
import { ProvinceWordButton } from './ProvinceWordButton';
import { speakJa, useCanSpeakJa } from './speak';
import { shortName, spotAreas, STAMP_TEXT, stationState } from './spotAreas';
import { rowMeta, stepHint } from './spotStepState';
import { StationBadge } from './StationBadge';

const OCTAGON = 'M30 3H70L97 30V70L70 97H30L3 70V30Z';

export interface PrefectureOverviewProps {
  pref: PrefectureShape;
  spots: PanelSpot[];
  /** Trạng thái tải danh sách mốc */
  status: 'idle' | 'loading' | 'ok' | 'error';
  onRetry: () => void;
  word: ProvinceWord | null;
  /** Con dấu tỉnh đã cấp */
  prefStamp: 'none' | 'stamp' | 'red';
  /** Mốc "Tiếp theo" (null nếu không có lộ trình hoặc đã đủ dấu) */
  nextIndex: number | null;
  /** Mốc đang được rê chuột trên bản đồ */
  highlight: number | null;
  onHover: (index: number | null) => void;
  /** Bấm một dòng mốc */
  onOpen: (index: number) => void;
  /** Bấm "Học tiếp" */
  onContinue: (index: number) => void;
  /** Đang luyện Shadowing ở khung bên cạnh */
  practicing: boolean;
  onClose: () => void;
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

/** Tầng 1 của ngăn tỉnh: tên tỉnh, tiến độ, lộ trình theo thứ tự cố định và nút "Học tiếp" ở chân ngăn */
export const PrefectureOverview: React.FC<PrefectureOverviewProps> = ({
  pref,
  spots,
  status,
  onRetry,
  word,
  prefStamp,
  nextIndex,
  highlight,
  onHover,
  onOpen,
  onContinue,
  practicing,
  onClose,
  headingId,
  headingRef,
}) => {
  const navigate = useNavigate();
  const canSpeak = useCanSpeakJa();
  const region = REGIONS.find((r) => r.id === pref.region);
  const stampCount = spots.filter((s) => isStamped(s.stamp)).length;
  const redCount = spots.filter((s) => s.stamp === 'red').length;
  // Dấu son chỉ có ở mốc có Hội thoại AI
  const redTotal = spots.filter((s) => s.roleplay).length;
  const ready = spots.length > 0;
  const allDone = ready && stampCount === spots.length;
  // Tỉnh một mốc không có lộ trình nên không có "Tiếp theo": lấy mốc chưa có dấu
  const target = allDone ? undefined : (spots[nextIndex ?? -1] ?? spots.find((s) => !isStamped(s.stamp)));
  const areas = spotAreas(spots.map((s) => s.data.nameVi));
  const loading = !ready && (status === 'loading' || status === 'idle');

  return (
    <>
      <div className="jm-pp-scroll jm-ppanel-scroll">
        <div className="jm-pp-top">
          <nav className="jm-pp-crumb" aria-label="Vị trí">
            <button type="button" className="jm-pp-home" onClick={onClose}>
              Nhật Bản
            </button>
            <span aria-hidden="true">/</span>
            <span className="jm-pp-region">
              {region?.nameVi} <span lang="ja">{region?.nameJp}</span>
            </span>
          </nav>
          <IconButton icon="close" label="Đóng, về toàn quốc" size="sm" onClick={onClose} />
        </div>

        <div className="jm-pp-pref">
          <div className="jm-pp-names">
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="jm-pp-jp" lang="ja">
              {pref.nameJp.replace(/[都府県]$/, '')}
            </h2>
            <p className="jm-pp-vi">
              {pref.nameVi}
              {canSpeak && <IconButton icon="volume_up" label="Nghe tên tỉnh" size="sm" onClick={() => speakJa(pref.nameJp)} />}
            </p>
          </div>
          <div className="jm-pp-side">
            {word && <ProvinceWordButton word={word} prefName={pref.nameVi} />}
            <svg
              viewBox="0 0 100 100"
              width={46}
              height={46}
              className={`jm-pp-oct is-${prefStamp}`}
              role="img"
              aria-label={
                prefStamp === 'red'
                  ? `Con dấu ${pref.nameVi}: dấu son`
                  : prefStamp === 'stamp'
                    ? `Con dấu ${pref.nameVi}: đã có`
                    : `Con dấu ${pref.nameVi}: chưa có, cần con dấu của mọi địa điểm`
              }
            >
              <path d={OCTAGON} fill="none" stroke="currentColor" strokeWidth={4} strokeLinejoin="round" />
              <svg x={20} y={20} width={60} height={60} viewBox={squareViewBox(pref.main)} preserveAspectRatio="xMidYMid meet">
                <path d={pref.d} fillRule="evenodd" fill="currentColor" />
              </svg>
            </svg>
          </div>
        </div>

        {loading && (
          <div className="jm-pp-sk" aria-busy="true" aria-label={`Đang tải các mốc của ${pref.nameVi}`}>
            <i className="jc-skel sk-bar" />
            {[58, 70, 46, 64, 70, 58, 46].map((w, i) => (
              <div key={i} className="sk-row">
                <i className="jc-skel sk-n" />
                <i className="jc-skel sk-t" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        )}

        {!ready && status === 'error' && (
          <div className="jm-pp-err" role="alert">
            <Icon name="cloud_off" size={26} />
            <p>
              <b>{`Chưa tải được các mốc của ${pref.nameVi}.`}</b>
              Kiểm tra mạng rồi thử lại.
            </p>
            <Button variant="secondary" icon="refresh" onClick={onRetry}>
              Thử lại
            </Button>
          </div>
        )}

        {!ready && status === 'ok' && <p className="jm-pp-empty">{`${pref.nameVi} chưa có mốc học nào.`}</p>}

        {ready && (
          <>
            <div className="jm-pp-prog" role="img" aria-label={`${stampCount} trên ${spots.length} mốc có con dấu`}>
              {spots.map((s) => (
                <i key={s.data.id} className={`is-${s.stamp}`} />
              ))}
            </div>
            <p className="jm-pp-count">
              <b>{`${stampCount}/${spots.length}`}</b> con dấu
              {redTotal > 0 && <span>{`Dấu son ${redCount}/${redTotal}`}</span>}
            </p>

            <ol className={`jm-rail${areas[0]?.members[0] === 0 ? ' has-area' : ''}`} aria-label={`Lộ trình ${spots.length} mốc`}>
              {spots.map((s) => {
                const area = areas.find((a) => a.members.includes(s.index));
                const isNext = s.index === nextIndex;
                const meta = rowMeta(s.step, isNext);
                return (
                  <React.Fragment key={s.data.id}>
                    {area && area.members[0] === s.index && (
                      <li className="jm-rail-area" aria-hidden="true">
                        <span>{area.name}</span>
                        <span>{`${area.members.filter((i) => isStamped(spots[i].stamp)).length}/${area.members.length}`}</span>
                      </li>
                    )}
                    <li>
                      <button
                        type="button"
                        className={`jm-row${isNext ? ' is-next' : ''}${highlight === s.index ? ' is-hi' : ''}`}
                        data-spot={s.index}
                        aria-label={`Mốc ${s.index + 1}: ${s.data.nameVi}, ${STAMP_TEXT[s.stamp]}${meta ? `, ${meta.text}` : ''}`}
                        onClick={() => onOpen(s.index)}
                        onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(s.index)}
                        onPointerLeave={() => onHover(null)}
                        onFocus={(e) => e.currentTarget.matches(':focus-visible') && onHover(s.index)}
                        onBlur={() => onHover(null)}
                      >
                        <StationBadge state={stationState(s.stamp, isNext)} pictogramId={s.data.iconId} />
                        <span className="jm-row-name">{area ? shortName(s.data.nameVi) : s.data.nameVi}</span>
                        {meta && <span className={`jm-row-meta is-${meta.tone}`}>{meta.text}</span>}
                      </button>
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>
          </>
        )}

        <p className="jm-pp-credit">
          Nguồn:{' '}
          <a href={PICTOGRAM_CREDIT.url} target="_blank" rel="noopener noreferrer" title={PICTOGRAM_CREDIT.text}>
            {PICTOGRAM_CREDIT.short}
          </a>
          {' · '}
          <a href={BOUNDARY_CREDIT.url} target="_blank" rel="noopener noreferrer" title={BOUNDARY_CREDIT.text}>
            {BOUNDARY_CREDIT.short}
          </a>
        </p>
      </div>

      {loading && (
        <div className="jm-pp-foot jm-pp-sk" aria-hidden="true">
          <i className="jc-skel sk-btn" />
        </div>
      )}
      {practicing ? (
        <div className="jm-pp-foot">
          <p className="jm-pp-practicing">
            <Icon name="forum" size={18} />
            Đang luyện ở khung bên cạnh
          </p>
        </div>
      ) : target ? (
        <div className="jm-pp-foot">
          <Button variant="primary" icon="play_arrow" block onClick={() => onContinue(target.index)}>
            {`Học tiếp: ${shortName(target.data.nameVi)}`}
          </Button>
          <p className="jm-pp-hint">
            {[stepHint(target.step), target.data.lesson ? `khoảng ${target.data.lesson.estimatedMinutes} phút` : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
      ) : (
        allDone && (
          <div className="jm-pp-foot">
            <p className="jm-pp-done">
              <Icon name="workspace_premium" size={20} />
              {redTotal > 0 && redCount === redTotal
                ? `Đủ ${spots.length} con dấu và ${redTotal} dấu son`
                : `Đủ ${spots.length} con dấu của ${pref.nameVi}`}
            </p>
            <Button variant="secondary" icon="menu_book" block onClick={() => navigate('/stamps')}>
              Xem sổ con dấu
            </Button>
          </div>
        )
      )}
    </>
  );
};

/** Khung vuông bao phần đất chính của tỉnh, để hình tỉnh nằm giữa con dấu */
function squareViewBox([x, y, w, h]: [number, number, number, number]): string {
  const side = Math.max(w, h);
  return `${x + w / 2 - side / 2} ${y + h / 2 - side / 2} ${side} ${side}`;
}
