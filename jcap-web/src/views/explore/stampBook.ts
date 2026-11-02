import type { RegionId } from '../../data/japanMap';
import type { ExploreChapter, ExplorePrefectureSummary } from '../../types/explore';

/**
 * Phần tính toán thuần của Sổ con dấu: con dấu được phân loại theo vùng và tỉnh (không theo chương). Mỗi tỉnh đã mở là một
 * trang đôi, các trang xếp theo vùng. Chương chỉ còn dùng ngầm để biết tỉnh nào đang học và vì sao một tỉnh chưa mở.
 * Không đụng DOM nên chạy được trong test.
 */

export type StampRegionKey = 'kanto' | 'chubu' | 'kansai' | 'chugoku-shikoku' | 'kyushu' | 'tohoku' | 'hokkaido';

export interface StampRegion {
  key: StampRegionKey;
  kanji: string;
  name: string;
}

/** Thứ tự tab ở mép sổ. Chugoku + Shikoku gộp một tab, Kyushu gồm cả Okinawa */
export const STAMP_REGIONS: StampRegion[] = [
  { key: 'kanto', kanji: '関東', name: 'Kanto' },
  { key: 'chubu', kanji: '中部', name: 'Chubu' },
  { key: 'kansai', kanji: '関西', name: 'Kansai' },
  { key: 'chugoku-shikoku', kanji: '中四国', name: 'Chugoku – Shikoku' },
  { key: 'kyushu', kanji: '九州', name: 'Kyushu – Okinawa' },
  { key: 'tohoku', kanji: '東北', name: 'Tohoku' },
  { key: 'hokkaido', kanji: '北海道', name: 'Hokkaido' },
];

export const regionByKey = (key: StampRegionKey): StampRegion => STAMP_REGIONS.find((r) => r.key === key) ?? STAMP_REGIONS[0];

export function regionKeyOf(region: RegionId): StampRegionKey {
  if (region === 'chugoku' || region === 'shikoku') return 'chugoku-shikoku';
  return region;
}

const regionOrder = (key: StampRegionKey) => STAMP_REGIONS.findIndex((r) => r.key === key);

/** Chữ lớn mờ ở góc trang trái: tên Nhật của tỉnh bỏ hậu tố 県 府 都 (千葉県 → 千葉; 北海道 giữ nguyên) */
export const prefectureWatermark = (nameJp: string) => nameJp.replace(/[県府都]$/, '');

/** Cỡ chữ mờ: tên ngắn thì to hơn */
export const watermarkSize = (text: string) => (text.length <= 2 ? 120 : text.length === 3 ? 96 : 76);

export interface BookPage {
  prefecture: ExplorePrefectureSummary;
  region: StampRegionKey;
}

/** Mỗi tỉnh đã mở là một trang đôi, xếp theo vùng rồi theo mã tỉnh. Tỉnh chưa mở không có trang (chỉ hiện tên ở "Sắp có") */
export function buildPages(prefectures: ExplorePrefectureSummary[], regionOfPrefecture: (prefectureId: number) => RegionId | undefined): BookPage[] {
  const pages: BookPage[] = [];
  for (const prefecture of prefectures) {
    if (!prefecture.isOpen) continue;
    const region = regionOfPrefecture(prefecture.id);
    if (region) pages.push({ prefecture, region: regionKeyOf(region) });
  }
  return pages.sort((a, b) => regionOrder(a.region) - regionOrder(b.region) || a.prefecture.id - b.prefecture.id);
}

/** Tỉnh đang học: tỉnh đã mở đầu tiên của chương đã mở có thứ tự lớn nhất. Không có thì trang đầu */
export function learningPage(pages: BookPage[], chapters: ExploreChapter[]): number {
  const current = chapters.filter((c) => c.isUnlocked).sort((a, b) => b.orderIndex - a.orderIndex)[0];
  const inChapter = current ? pages.findIndex((p) => p.prefecture.chapterId === current.id && !p.prefecture.isLocked) : -1;
  if (inChapter >= 0) return inChapter;
  return Math.max(0, pages.findIndex((p) => !p.prefecture.isLocked));
}

/** Số con dấu của chương trước cần có để mở chương này (cùng cách tính với bản đồ) */
export const stampsNeeded = (chapter: ExploreChapter, previous: ExploreChapter) =>
  Math.ceil((chapter.unlockThresholdPercent * previous.spotCount) / 100);

/** Câu giải thích vì sao tỉnh chưa mở (tỉnh thuộc chương mà người học chưa mở) */
export function unlockCondition(prefecture: ExplorePrefectureSummary, chapters: ExploreChapter[]): string {
  const sorted = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
  const i = sorted.findIndex((c) => c.id === prefecture.chapterId);
  if (i <= 0) return 'Tỉnh này chưa mở.';
  const prev = sorted[i - 1];
  return `Mở khi đạt ${sorted[i].unlockThresholdPercent}% con dấu của “${prev.title}” (${prev.stampCount}/${stampsNeeded(sorted[i], prev)}).`;
}

/** Bấm tab vùng: tỉnh đang học nếu nó nằm trong vùng, không thì tỉnh đầu của vùng. Vùng chưa có tỉnh nào: null */
export function regionTabTarget(pages: BookPage[], region: StampRegionKey, learning: number): number | null {
  if (pages[learning]?.region === region) return learning;
  const i = pages.findIndex((p) => p.region === region);
  return i < 0 ? null : i;
}

/** Vùng chưa có tỉnh nào mở được cho người học thì tab hiện ổ khoá */
export const regionLocked = (pages: BookPage[], region: StampRegionKey) => !pages.some((p) => p.region === region && !p.prefecture.isLocked);

export type TocFilter = 'all' | 'open' | 'stamp' | 'lock';

export const TOC_FILTERS: { key: TocFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'open', label: 'Đã mở' },
  { key: 'stamp', label: 'Có dấu' },
  { key: 'lock', label: 'Chưa mở' },
];

export const matchesFilter = (p: ExplorePrefectureSummary, f: TocFilter) =>
  f === 'all' || (f === 'open' && !p.isLocked) || (f === 'stamp' && p.stampCount > 0) || (f === 'lock' && p.isLocked);

/** Bỏ dấu tiếng Việt và chữ hoa để "hoi", "Hội" cùng khớp */
export const normalizeQuery = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();

/** Ô tìm khớp tên tỉnh (Việt/Nhật) hoặc tên vùng */
export function matchesQuery(page: BookPage, query: string, prefectureName: (id: number) => string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  return normalizeQuery(`${prefectureName(page.prefecture.id)} ${regionByKey(page.region).name}`).includes(q);
}
