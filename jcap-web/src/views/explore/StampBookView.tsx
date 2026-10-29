import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon, ProgressBar } from '../../components/jcap';
import { PREFECTURES } from '../../data/japanMap';
import { exploreService } from '../../services/exploreService';
import type { ExploreChapter, ExplorePrefectureSummary, ExploreStampedSpot } from '../../types/explore';
import { PrefectureStampMark, SpotStampMark, type PrefectureStampState } from './ExploreStamp';
import { useExploreJourney } from './exploreStore';

/**
 * Sổ con dấu: toàn bộ hành trình của người học trên một trang. Chỉ đọc: con dấu do server cấp khi học (đồng bộ tỉnh trên bản đồ),
 * trang này chỉ hiện lại. Mỗi chương là một trang giấy (theme kham-pha, giữ nguyên ở chế độ tối vì con dấu in trên giấy);
 * trong chương, mỗi tỉnh đã mở có con dấu tỉnh và các con dấu mốc đã đóng. Tên mốc chưa đóng dấu không hiện ở đây.
 */

const PREFECTURE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));

const prefectureState = (p: ExplorePrefectureSummary | undefined): PrefectureStampState =>
  p?.stamp?.redStampedAt ? 'red' : p?.stamp ? 'stamp' : 'none';

export const StampBookView: React.FC = () => {
  const navigate = useNavigate();
  const journey = useExploreJourney();
  const [stamps, setStamps] = useState<ExploreStampedSpot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await exploreService.getStampBook();
    if (res.success && res.data) setStamps(res.data.stamps);
    else setError(res.message || 'Không tải được sổ con dấu.');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byPrefecture = useMemo(() => {
    const map = new Map<number, ExploreStampedSpot[]>();
    for (const s of stamps ?? []) map.set(s.prefectureId, [...(map.get(s.prefectureId) ?? []), s]);
    return map;
  }, [stamps]);

  const data = journey.data;
  const loading = !error && (!stamps || (!data && journey.status !== 'error'));
  const failed = error ?? (journey.status === 'error' ? journey.message ?? 'Không tải được hành trình.' : null);
  const goMap = () => navigate('/');

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[26px] font-bold leading-9 text-sumi">Sổ con dấu</h1>
          <p className="m-0 max-w-[560px] text-[15px] leading-6 text-sumi-muted">
            Mỗi con dấu là một địa điểm bạn đã học xong. Dấu son nghĩa là bạn đã hoàn thành cả Hội thoại AI ở đó.
          </p>
        </div>
        <Button variant="secondary" icon="travel_explore" onClick={goMap}>
          Về bản đồ Hành trình
        </Button>
      </header>

      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-jc-md border border-line bg-danger-soft px-4 py-3">
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

      {!failed && stamps && data && (
        <>
          <Summary stamps={stamps} chapters={data.chapters} prefectures={data.prefectures} />

          {stamps.length === 0 && (
            <EmptyState icon="approval" title="Sổ con dấu còn trống" action={<Button variant="primary" onClick={goMap}>Bắt đầu từ bản đồ</Button>}>
              Chọn một tỉnh trên bản đồ, học một địa điểm rồi luyện Shadowing đạt điểm để đóng con dấu đầu tiên.
            </EmptyState>
          )}

          {data.chapters.map((chapter, i) => (
            <ChapterPage
              key={chapter.id}
              chapter={chapter}
              previous={data.chapters[i - 1]}
              prefectures={data.prefectures}
              byPrefecture={byPrefecture}
              onOpen={(slug) => navigate(`/explore?tinh=${slug}`)}
            />
          ))}

          <UnassignedOpen prefectures={data.prefectures} byPrefecture={byPrefecture} onOpen={(slug) => navigate(`/explore?tinh=${slug}`)} />
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const Summary: React.FC<{ stamps: ExploreStampedSpot[]; chapters: ExploreChapter[]; prefectures: ExplorePrefectureSummary[] }> = ({
  stamps,
  chapters,
  prefectures,
}) => {
  const red = stamps.filter((s) => s.redStampedAt).length;
  const prefStamps = prefectures.filter((p) => p.stamp).length;
  const unlocked = chapters.filter((c) => c.isUnlocked).length;
  return (
    <section aria-label="Tổng quan" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat value={stamps.length} label="con dấu địa điểm" />
      <Stat value={red} label="dấu son" />
      <Stat value={prefStamps} label="con dấu tỉnh" />
      <Stat value={`${unlocked}/${chapters.length}`} label="chương đã mở" />
    </section>
  );
};

const Stat: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
  <div className="flex flex-col gap-0.5 rounded-jc-md border border-line bg-paper-50 px-4 py-3">
    <span className="text-[24px] font-bold leading-8 tabular-nums text-sumi">{value}</span>
    <span className="text-[13px] leading-[18px] text-sumi-muted">{label}</span>
  </div>
);

// ---------------------------------------------------------------------------

interface ChapterPageProps {
  chapter: ExploreChapter;
  previous: ExploreChapter | undefined;
  prefectures: ExplorePrefectureSummary[];
  byPrefecture: Map<number, ExploreStampedSpot[]>;
  onOpen: (slug: string) => void;
}

const ChapterPage: React.FC<ChapterPageProps> = ({ chapter, previous, prefectures, byPrefecture, onOpen }) => {
  const summaries = chapter.prefectureIds.map((id) => prefectures.find((p) => p.id === id)).filter((p): p is ExplorePrefectureSummary => !!p);
  const open = summaries.filter((p) => p.isOpen);
  const comingSoon = summaries.filter((p) => !p.isOpen);
  // Cùng cách tính với bản đồ: cần bấy nhiêu con dấu của chương trước để mở chương này
  const need = previous ? Math.ceil((chapter.unlockThresholdPercent * previous.spotCount) / 100) : 0;
  const level = chapter.minLevel === chapter.maxLevel ? chapter.minLevel : `${chapter.minLevel}–${chapter.maxLevel}`;

  return (
    <section
      data-theme="kham-pha"
      aria-labelledby={`chapter-${chapter.id}`}
      className="flex flex-col gap-4 rounded-jc-lg border border-line bg-paper-100 px-5 py-5 text-sumi md:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`chapter-${chapter.id}`} className="m-0 text-[19px] font-semibold leading-7">
            {chapter.title}
          </h2>
          {chapter.description && <p className="m-0 text-sm leading-[22px] text-sumi-muted">{chapter.description}</p>}
        </div>
        <span className="flex items-center gap-2">
          <Badge tone="neutral">{level}</Badge>
          {!chapter.isUnlocked && (
            <Badge tone="neutral" icon="lock">
              Chưa mở
            </Badge>
          )}
        </span>
      </div>

      {chapter.isUnlocked ? (
        chapter.spotCount > 0 && (
          <ProgressBar value={chapter.stampCount} max={chapter.spotCount} label="Con dấu trong chương" showValue tone="ai" size="sm" />
        )
      ) : (
        <p className="m-0 flex items-start gap-2 text-sm leading-[22px] text-sumi-muted">
          <Icon name="lock" size={18} />
          <span>
            {previous
              ? `Mở khi đạt ${chapter.unlockThresholdPercent}% con dấu của "${previous.title}" (${previous.stampCount}/${need}).`
              : 'Chương này chưa mở.'}
          </span>
        </p>
      )}

      {chapter.isUnlocked &&
        open.map((p) => <PrefectureBlock key={p.id} summary={p} spots={byPrefecture.get(p.id) ?? []} onOpen={onOpen} />)}

      {!chapter.isUnlocked && summaries.length > 0 && <NameChips summaries={summaries} />}

      {chapter.isUnlocked && comingSoon.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-sumi-muted">
          <span>Sắp có:</span>
          <NameChips summaries={comingSoon} />
        </div>
      )}

      {chapter.isUnlocked && summaries.length === 0 && <p className="m-0 text-sm text-sumi-muted">Chương này chưa có tỉnh nào.</p>}
    </section>
  );
};

/** Tên tỉnh dạng chữ nhỏ, không kèm mốc nào (tỉnh chưa mở hoặc chương chưa mở) */
const NameChips: React.FC<{ summaries: ExplorePrefectureSummary[] }> = ({ summaries }) => (
  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
    {summaries.map((p) => (
      <li key={p.id} className="rounded-jc-full border border-line px-2.5 py-0.5 text-[13px] leading-5 text-sumi-muted">
        {PREFECTURE_BY_ID.get(p.id)?.nameVi}
      </li>
    ))}
  </ul>
);

const PrefectureBlock: React.FC<{ summary: ExplorePrefectureSummary; spots: ExploreStampedSpot[]; onOpen: (slug: string) => void }> = ({
  summary,
  spots,
  onOpen,
}) => {
  const shape = PREFECTURE_BY_ID.get(summary.id);
  if (!shape) return null;
  const state = prefectureState(summary);
  return (
    <div className="flex flex-col gap-3 rounded-jc-md border border-line bg-paper-50 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PrefectureStampMark
          d={shape.d}
          main={shape.main}
          nameJp={shape.nameJp}
          caption={`${summary.stampCount}/${summary.spotCount}`}
          state={state}
          size={88}
          seed={summary.id}
        />
        <div className="flex min-w-[150px] flex-[1_1_150px] flex-col gap-0.5">
          <h3 className="m-0 text-[17px] font-semibold leading-6">
            {shape.nameVi} <span className="font-jp text-sm font-normal text-sumi-muted">{shape.nameJp}</span>
          </h3>
          <span className="text-sm leading-[22px] text-sumi-muted">
            {summary.stampCount}/{summary.spotCount} địa điểm có con dấu
            {summary.redStampCount > 0 && ` · ${summary.redStampCount} dấu son`}
          </span>
          {state !== 'none' && (
            <span className="text-[13px] leading-5 text-sumi-muted">{state === 'red' ? 'Đã có dấu son tỉnh' : 'Đã có con dấu tỉnh'}</span>
          )}
        </div>
        <Button size="sm" variant="ghost" iconRight="arrow_forward" onClick={() => onOpen(shape.slug)} aria-label={`Mở ${shape.nameVi} trên bản đồ`}>
          Mở
        </Button>
      </div>

      {spots.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-3 p-0">
          {spots.map((s) => (
            <li key={s.spotId} className="flex w-[84px] flex-col items-center gap-1 text-center">
              <SpotStampMark
                iconId={s.iconId}
                nameJp={s.nameJp}
                sub={shape.nameJp}
                date={s.redStampedAt ?? s.stampedAt}
                state={s.redStampedAt ? 'red' : 'stamp'}
                size={72}
                seed={s.spotId}
              />
              <span className="text-[12px] leading-4 text-sumi">{s.nameVi}</span>
              <span className="sr-only">{s.redStampedAt ? 'Có dấu son' : 'Có con dấu'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm leading-[22px] text-sumi-muted">Chưa có con dấu nào ở {shape.nameVi}. Mở tỉnh trên bản đồ để bắt đầu.</p>
      )}
    </div>
  );
};

/** Tỉnh đã mở nhưng admin chưa xếp vào chương nào: vẫn có con dấu thì phải thấy được ở đây */
const UnassignedOpen: React.FC<{
  prefectures: ExplorePrefectureSummary[];
  byPrefecture: Map<number, ExploreStampedSpot[]>;
  onOpen: (slug: string) => void;
}> = ({ prefectures, byPrefecture, onOpen }) => {
  const list = prefectures.filter((p) => p.isOpen && p.chapterId == null && !p.isLocked && (p.stampCount > 0 || p.stamp));
  if (list.length === 0) return null;
  return (
    <section data-theme="kham-pha" aria-label="Tỉnh ngoài chương" className="flex flex-col gap-4 rounded-jc-lg border border-line bg-paper-100 px-5 py-5 text-sumi md:px-6">
      <h2 className="m-0 text-[19px] font-semibold leading-7">Ngoài các chương</h2>
      {list.map((p) => (
        <PrefectureBlock key={p.id} summary={p} spots={byPrefecture.get(p.id) ?? []} onOpen={onOpen} />
      ))}
    </section>
  );
};

const Skeleton: React.FC = () => (
  <div className="flex flex-col gap-4" aria-busy="true" aria-label="Đang tải sổ con dấu">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[74px] animate-pulse rounded-jc-md bg-paper-200" />
      ))}
    </div>
    <div className="h-64 animate-pulse rounded-jc-lg bg-paper-200" />
  </div>
);
