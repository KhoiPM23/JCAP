import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconButton } from '../../components/jcap';
import { PREFECTURE_BY_ID } from './StampSpread';
import { matchesFilter, matchesQuery, STAMP_REGIONS, TOC_FILTERS, type BookPage, type StampRegionKey, type TocFilter } from './stampBook';

/**
 * Ngăn kéo Mục lục: tìm theo tên tỉnh/vùng, lọc Tất cả / Đã mở / Có dấu / Chưa mở, danh sách tỉnh theo vùng gập/mở được.
 * Có lớp phủ, khoá focus trong ngăn kéo, Esc để đóng. Bấm một tỉnh là nhảy tới trang đó và đóng ngăn kéo.
 */

interface Props {
  pages: BookPage[];
  /** Chỉ số trang đang mở và trang tỉnh đang học (theo `pages`) */
  current: number;
  learning: number;
  region: StampRegionKey;
  onPick: (pageIndex: number) => void;
  onClose: () => void;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const StampToc: React.FC<Props> = ({ pages, current, learning, region, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<TocFilter>('all');
  const [expanded, setExpanded] = useState<Partial<Record<StampRegionKey, boolean>>>({});
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Mở ngăn kéo: focus vào ô tìm; đóng: trả focus về nơi đã mở
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const prefName = (id: number) => {
    const p = PREFECTURE_BY_ID.get(id);
    return p ? `${p.nameVi} ${p.nameJp}` : '';
  };

  const filtering = q.trim() !== '' || filter !== 'all';
  const counts = useMemo(() => TOC_FILTERS.map((f) => ({ ...f, n: pages.filter((p) => matchesFilter(p.prefecture, f.key)).length })), [pages]);
  const unlockedCount = pages.filter((p) => !p.prefecture.isLocked).length;

  const groups = STAMP_REGIONS.map((r) => {
    const all = pages.map((page, i) => ({ page, i })).filter((x) => x.page.region === r.key);
    const list = all.filter((x) => matchesFilter(x.page.prefecture, filter) && matchesQuery(x.page, q, prefName));
    const opened = all.filter((x) => !x.page.prefecture.isLocked).length;
    const stamps = all.reduce((n, x) => n + x.page.prefecture.stampCount, 0);
    const isOpen = filtering ? list.length > 0 : (expanded[r.key] ?? r.key === region);
    return { r, all, list, opened, stamps, isOpen };
  }).filter((g) => g.all.length > 0 && (!filtering || g.list.length > 0));

  const regionCount = new Set(pages.map((p) => p.region)).size;

  return createPortal(
    <>
      <div className="sb-scrim" onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} className="sb-tocp" role="dialog" aria-modal="true" aria-labelledby="stamp-toc-h" data-theme="kham-pha" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-5 pb-3 pl-6 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id="stamp-toc-h" className="m-0 text-xl font-bold leading-7">
              Mục lục
            </h2>
            <span className="text-[13px] text-sumi-muted">
              {pages.length} tỉnh · {regionCount} vùng · bạn đã mở {unlockedCount} tỉnh
            </span>
          </div>
          <IconButton icon="close" label="Đóng mục lục" onClick={onClose} />
        </div>
        <div className="flex flex-col gap-2.5 border-b border-line pb-3.5 pl-6 pr-5">
          <label className="sb-srch">
            <Icon name="search" size={20} className="text-sumi-muted" />
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm tỉnh hoặc vùng, ví dụ: Kyoto"
              aria-label="Tìm tỉnh hoặc vùng"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc">
            {counts.map((f) => (
              <button key={f.key} type="button" className={`sb-fc${filter === f.key ? ' on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
                <span className="fn">{f.n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sb-toclist">
          {groups.map(({ r, all, list, opened, stamps, isOpen }) => (
            <section key={r.key} className="sb-treg" aria-label={r.name}>
              <button type="button" className="sb-treg-h" aria-expanded={isOpen} onClick={() => setExpanded((e) => ({ ...e, [r.key]: !isOpen }))}>
                <span className="sb-rk" lang="ja">
                  {r.kanji}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold leading-[22px]">{r.name}</span>
                  <span className="text-xs leading-[18px] text-sumi-muted">
                    {opened ? `${opened}/${all.length} tỉnh đã mở · ${stamps} con dấu` : `${all.length} tỉnh · Chưa mở`}
                  </span>
                </span>
                <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={20} />
              </button>
              {isOpen && (
                <div className="sb-tch">
                  {list.map(({ page, i }) => {
                    const p = page.prefecture;
                    const shape = PREFECTURE_BY_ID.get(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`sb-tc${i === current ? ' on' : ''}${p.isLocked ? ' lk' : ''}`}
                        aria-current={i === current ? 'page' : undefined}
                        onClick={() => onPick(i)}
                      >
                        <span className="tt">
                          <span className="t1">
                            {shape?.nameVi} <span lang="ja" className="font-mincho text-[13px] font-normal text-sumi-muted">{shape?.nameJp}</span>
                          </span>
                          <span className="t2">{p.redStampCount > 0 ? `${p.redStampCount} dấu son` : p.stamp ? 'Đã có con dấu tỉnh' : p.isLocked ? 'Chưa mở' : 'Chưa có con dấu tỉnh'}</span>
                        </span>
                        {i === learning && <span className="now">Đang học</span>}
                        {p.isLocked ? (
                          <Icon name="lock" size={18} label="Chưa mở" className="text-sumi-faint" />
                        ) : (
                          <span className="tcnt">
                            {p.stampCount}/{p.spotCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}

          {groups.length === 0 && <p className="m-0 px-6 py-7 text-sm leading-[22px] text-sumi-muted">Không có tỉnh nào khớp. Thử tên khác hoặc bỏ bộ lọc.</p>}
        </div>
      </aside>
    </>,
    document.body,
  );
};
