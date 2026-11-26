import React, { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { REGIONS, type PrefectureShape } from '../../data/japanMap';
import type { ProvinceWord } from '../../data/learnContent';
import { Button, Icon, IconButton } from '../../components/jcap';
import { isStamped } from './learnProgress';
import type { PanelSpot } from './panelSpot';
import { ProvinceWordCard } from './ProvinceWordCard';
import { speakJa, useCanSpeakJa } from './speak';
import { shortName, STAMP_TEXT } from './spotAreas';
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
  furigana: boolean;
  /** Con dấu tỉnh đã cấp */
  prefStamp: 'none' | 'stamp' | 'red';
  /** Mốc nút "Học tiếp" mở (null nếu không có lộ trình hoặc đã đủ dấu) */
  nextIndex: number | null;
  /** Mốc đang được rê chuột trên bản đồ */
  highlight: number | null;
  onHover: (index: number | null) => void;
  /** Bấm một dòng mốc hoặc "Học tiếp": mở mốc đó */
  onOpen: (index: number) => void;
  /** Mốc vừa xem ở tầng 2: focus lại dòng của nó */
  restoreRow: number | null;
  /** Vị trí cuộn của danh sách, nhớ qua lúc xem một mốc */
  scrollMemory: React.RefObject<number>;
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
  furigana,
  prefStamp,
  nextIndex,
  highlight,
  onHover,
  onOpen,
  restoreRow,
  scrollMemory,
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
  const loading = !ready && (status === 'loading' || status === 'idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Vừa quay về danh sách: đặt lại vị trí cuộn trước khi vẽ (không nhảy), dòng vừa xem mà khuất thì đưa vào khung
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || restoreRow == null) return;
    box.scrollTop = scrollMemory.current;
    const row = box.querySelector<HTMLButtonElement>(`[data-spot="${restoreRow}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (top < 0 || top + row.offsetHeight > box.clientHeight) box.scrollTop += top - (box.clientHeight - row.offsetHeight) / 2;
    row.focus({ preventScroll: true });
    // Chỉ lúc vừa quay về danh sách
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="jm-pp-body">
        {/* Đứng yên: đường dẫn, tên và con dấu tỉnh, một từ ở tỉnh, vạch tiến độ */}
        <div className="jm-pp-head">
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
              {/* Con dấu tỉnh, hai góc trái gắn số: trên là con dấu (nền chàm như ghim đã có dấu), dưới là dấu son */}
              <div className="jm-pp-seal">
                <svg
                  viewBox="0 0 100 100"
                  width={72}
                  height={72}
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
                {ready && (
                  <span className="jm-pp-tally is-stamp" title={`${stampCount}/${spots.length} con dấu`}>
                    {`${stampCount}/${spots.length}`}
                    <span className="sr-only"> con dấu</span>
                  </span>
                )}
                {ready && redTotal > 0 && (
                  <span className="jm-pp-tally is-red" title={`${redCount}/${redTotal} dấu son`}>
                    {`${redCount}/${redTotal}`}
                    <span className="sr-only"> dấu son</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {word && <ProvinceWordCard key={pref.id} word={word} furigana={furigana} />}
          {ready && (
            <div className="jm-pp-prog" role="img" aria-label={`${stampCount} trên ${spots.length} mốc có con dấu`}>
              {spots.map((s) => (
                <i key={s.data.id} className={`is-${s.stamp}`} />
              ))}
            </div>
          )}
        </div>

        {/* Chỉ phần này cuộn */}
        <div ref={scrollRef} className="jm-pp-scroll jm-ppanel-scroll" onScroll={(e) => (scrollMemory.current = e.currentTarget.scrollTop)}>
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
            <ol className="jm-rail" aria-label={`Lộ trình ${spots.length} mốc`}>
              {spots.map((s) => {
                const meta = rowMeta(s.step);
                return (
                  <li key={s.data.id}>
                    <button
                      type="button"
                      className={`jm-row${highlight === s.index ? ' is-hi' : ''}`}
                      data-spot={s.index}
                      aria-label={`Mốc ${s.index + 1}: ${s.data.nameVi}, ${STAMP_TEXT[s.stamp]}${meta ? `, ${meta}` : ''}`}
                      onClick={() => onOpen(s.index)}
                      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(s.index)}
                      onPointerLeave={() => onHover(null)}
                      onFocus={(e) => e.currentTarget.matches(':focus-visible') && onHover(s.index)}
                      onBlur={() => onHover(null)}
                    >
                      <StationBadge state={s.stamp} pictogramId={s.data.iconId} />
                      <span className="jm-row-name">{s.data.nameVi}</span>
                      {meta && <span className="jm-row-meta">{meta}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
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
            Đang luyện
          </p>
        </div>
      ) : target ? (
        <div className="jm-pp-foot">
          <Button variant="primary" icon="play_arrow" block onClick={() => onOpen(target.index)}>
            {`Học tiếp: ${shortName(target.data.nameVi)}`}
          </Button>
          {stepHint(target.step) && <p className="jm-pp-hint">{stepHint(target.step)}</p>}
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
