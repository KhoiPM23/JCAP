import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '../../components/jcap';
import { exploreService } from '../../services/exploreService';
import type { ExploreStampedSpot } from '../../types/explore';
import { PrefectureSpread, PREFECTURE_BY_ID, type TurnNav } from './StampSpread';
import { StampOverview } from './StampOverview';
import { StampToc } from './StampToc';
import { buildPages, learningPage, regionByKey, regionLocked, regionTabTarget, STAMP_REGIONS, unlockCondition, type StampRegionKey } from './stampBook';
import { useExploreJourney } from './exploreStore';
import '../../styles/stampbook.css';

/**
 * Sổ con dấu (design-handoff mục 9c): hành trình của người học dưới dạng một cuốn sổ, con dấu phân loại theo vùng và tỉnh.
 * Chỉ đọc: con dấu do server cấp khi học (đồng bộ tỉnh trên bản đồ), trang này chỉ hiện lại. Mỗi lần hiện một tỉnh dạng trang
 * đôi, lật bằng nút hoặc phím ← →; tab vùng ở mép sổ và Mục lục để nhảy nhanh. Tên mốc chưa đóng dấu không hiện ở đây (chỉ có ô trống).
 */

export const StampBookView: React.FC = () => {
  const navigate = useNavigate();
  const journey = useExploreJourney();
  const [stamps, setStamps] = useState<ExploreStampedSpot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [motion, setMotion] = useState<'' | 'fwd' | 'back'>('');
  const [tocOpen, setTocOpen] = useState(false);
  const [ovOpen, setOvOpen] = useState(false);
  const ovBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await exploreService.getStampBook();
    if (res.success && res.data) setStamps(res.data.stamps);
    else setError(res.message || 'Không tải được sổ con dấu.');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const data = journey.data;
  const prefectures = useMemo(() => data?.prefectures ?? [], [data]);
  const pages = useMemo(() => buildPages(prefectures, (id) => PREFECTURE_BY_ID.get(id)?.region), [prefectures]);
  const learning = data ? learningPage(pages, data.chapters) : 0;

  const byPrefecture = useMemo(() => {
    const map = new Map<number, ExploreStampedSpot[]>();
    for (const s of stamps ?? []) map.set(s.prefectureId, [...(map.get(s.prefectureId) ?? []), s]);
    return map;
  }, [stamps]);

  const pageCount = pages.length;
  const cur = pageCount === 0 ? 0 : Math.min(page ?? learning, pageCount - 1);
  const curPage = pages[cur];
  const region: StampRegionKey = curPage?.region ?? pages[learning]?.region ?? 'kanto';

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(pageCount - 1, i));
      setMotion(next > cur ? 'fwd' : next < cur ? 'back' : '');
      setPage(next);
    },
    [cur, pageCount],
  );

  // Phím ← → lật trang (không khi đang gõ hoặc đang mở Mục lục)
  useEffect(() => {
    if (pageCount === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (tocOpen || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') go(cur - 1);
      else if (e.key === 'ArrowRight') go(cur + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, cur, pageCount, tocOpen]);

  // Esc đóng bảng Tổng quan và trả focus về nút
  useEffect(() => {
    if (!ovOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOvOpen(false);
      ovBtnRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ovOpen]);

  const loading = !error && (!stamps || (!data && journey.status !== 'error'));
  const failed = error ?? (journey.status === 'error' ? journey.message ?? 'Không tải được hành trình.' : null);
  const ready = !failed && !!stamps && !!data;
  const goMap = () => navigate('/');
  const openTinh = (slug: string) => navigate(`/explore?tinh=${slug}`);

  const turn = (i: number): TurnNav | null => {
    const target = pages[i];
    if (!target) return null;
    const name = PREFECTURE_BY_ID.get(target.prefecture.id)?.nameVi ?? '';
    return { label: name, aria: `Lật ${i > cur ? 'sang' : 'về'} ${name}`, onClick: () => go(i) };
  };

  const regionPages = pages.map((p, i) => ({ p, i })).filter((x) => x.p.region === region);
  const posInRegion = regionPages.findIndex((x) => x.i === cur) + 1;

  return (
    <div className="sb-col">
      <header className="sb-top">
        <div className="flex flex-1 items-center gap-3">
          <span className="sb-seal" lang="ja" aria-hidden="true">
            旅
          </span>
          <h1 className="m-0 whitespace-nowrap text-[26px] font-bold leading-[34px] text-sumi">Sổ con dấu</h1>
        </div>
        {ready && pageCount > 0 && cur !== learning && (
          <Button variant="ghost" size="sm" icon="bookmark" onClick={() => go(learning)}>
            Về tỉnh đang học
          </Button>
        )}
        {ready && (
          <>
            <button
              ref={ovBtnRef}
              type="button"
              className={`sb-btn${ovOpen ? ' on' : ''}`}
              aria-expanded={ovOpen}
              aria-controls="stamp-overview"
              onClick={() => setOvOpen((v) => !v)}
            >
              <Icon name="info" size={20} />
              Tổng quan
              <Icon name={ovOpen ? 'expand_less' : 'expand_more'} size={18} />
            </button>
            <button type="button" className="sb-btn" onClick={() => setTocOpen(true)} aria-haspopup="dialog">
              <Icon name="toc" size={20} />
              Mục lục
            </button>
            {ovOpen && (
              <>
                <div className="sb-ovscrim" onClick={() => setOvOpen(false)} aria-hidden="true" />
                <StampOverview
                  stamps={stamps}
                  chapters={data.chapters}
                  pages={pages}
                  prefectures={prefectures}
                  region={region}
                  onOpenMap={goMap}
                />
              </>
            )}
          </>
        )}
      </header>

      {failed && (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-jc-md border border-line bg-danger-soft px-4 py-3">
          <span className="text-sm text-danger">{failed}</span>
          <Button
            size="sm"
            onClick={() => {
              load();
              journey.retry();
            }}
          >
            Thử lại
          </Button>
        </div>
      )}

      {loading && !failed && <Skeleton />}

      {ready && pageCount === 0 && (
        <p className="mt-6 rounded-jc-lg border border-line bg-paper-50 px-5 py-6 text-sm leading-[22px] text-sumi-muted">
          Chưa có tỉnh nào mở. Khi có tỉnh, con dấu của bạn sẽ hiện ở đây.
        </p>
      )}

      {ready && pageCount > 0 && curPage && (
        <>
          <div className="sb-bookwrap" data-theme="kham-pha">
            <div className="sb-tabs" role="group" aria-label="Chọn vùng">
              {STAMP_REGIONS.map((r) => {
                const target = regionTabTarget(pages, r.key, learning);
                const locked = regionLocked(pages, r.key);
                const on = r.key === region;
                const label = `Vùng ${r.name}${target === null ? ', chưa có tỉnh' : locked ? ', chưa mở' : ''}`;
                return (
                  <button
                    key={r.key}
                    type="button"
                    className={`sb-tab${on ? ' on' : ''}${locked ? ' lk' : ''}`}
                    aria-pressed={on}
                    aria-label={label}
                    title={label}
                    disabled={target === null}
                    onClick={() => target !== null && go(target)}
                  >
                    <span className="k" lang="ja">
                      {r.kanji}
                    </span>
                    {locked && <Icon name="lock" size={15} />}
                  </button>
                );
              })}
            </div>

            <div className="sb-book">
              <PrefectureSpread
                key={curPage.prefecture.id}
                page={curPage}
                spots={byPrefecture.get(curPage.prefecture.id) ?? []}
                condition={unlockCondition(curPage.prefecture, data.chapters)}
                isLearning={cur === learning}
                motion={motion}
                prev={turn(cur - 1)}
                next={turn(cur + 1)}
                onOpen={openTinh}
              />
            </div>
          </div>

          <div className="sb-under">
            <div className="sb-dots" role="group" aria-label={`Các tỉnh vùng ${regionByKey(region).name}`}>
              {regionPages.map(({ p, i }) => {
                const name = PREFECTURE_BY_ID.get(p.prefecture.id)?.nameVi ?? '';
                return (
                  <button
                    key={p.prefecture.id}
                    type="button"
                    className={`sb-pd${i === cur ? ' on' : ''}${p.prefecture.stampCount > 0 ? ' got' : ''}${p.prefecture.isLocked ? ' lk' : ''}`}
                    aria-label={name}
                    aria-current={i === cur ? 'page' : undefined}
                    title={name}
                    onClick={() => go(i)}
                  />
                );
              })}
            </div>
            <span className="text-xs leading-4 text-sumi-muted">
              {regionByKey(region).name} · tỉnh {posInRegion} trên {regionPages.length} · {cur + 1} / {pageCount}
            </span>
          </div>
        </>
      )}

      {ready && tocOpen && (
        <StampToc
          pages={pages}
          current={cur}
          learning={learning}
          region={region}
          onPick={(i) => {
            go(i);
            setTocOpen(false);
          }}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  );
};

/** Đang tải: khung cuốn sổ xám nhạt kèm hai khối giấy */
const Skeleton: React.FC = () => (
  <div className="sb-bookwrap" aria-busy="true" aria-label="Đang tải sổ con dấu">
    <div className="sb-skl" style={{ height: 620, borderRadius: '12px 22px 22px 12px' }}>
      <div className="grid h-full grid-cols-1 gap-3 p-3 md:grid-cols-2">
        <div className="rounded-[10px] bg-paper-100" />
        <div className="rounded-[10px] bg-paper-100" />
      </div>
    </div>
  </div>
);
