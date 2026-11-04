import React, { useMemo, useState } from 'react';
import { Icon, SegmentedControl, Select } from '../jcap';
import { cx } from '../jcap/utils';
import type { VoiceOption } from '../../services/voicevoxService';

export interface VoiceBrowserProps {
  voices: VoiceOption[];
  selectedVoiceId: number;
  /** Giọng đang phát thử / đang tải mẫu (null = không có) */
  playingId: number | null;
  loadingId: number | null;
  /** Chọn một giọng (lưu ngay) */
  onSelect: (voiceId: number) => void;
  /** Nghe thử một giọng; bấm lại khi đang phát thì dừng */
  onPlay: (voiceId: number) => void;
}

type GenderFilter = 'all' | 'Female' | 'Male' | 'Mascot';

interface Character {
  speakerName: string;
  romajiName: string;
  gender: GenderFilter;
  region: string;
  description: string;
  styles: VoiceOption[];
}

const REGIONS = [
  { key: 'all', label: 'Tất cả các vùng' },
  { key: 'Tohoku', label: 'Tohoku (Đông Bắc)' },
  { key: 'Kanto', label: 'Kanto (Tokyo, Saitama)' },
  { key: 'Chubu', label: 'Chubu (Nagoya, Toyama…)' },
  { key: 'Kansai', label: 'Kansai (Kyoto, Nara)' },
  { key: 'Chugoku', label: 'Chugoku' },
  { key: 'Shikoku', label: 'Shikoku (Tứ Quốc)' },
  { key: 'Kyushu', label: 'Kyushu (Cửu Châu)' },
  { key: 'Hokkaido', label: 'Hokkaido' },
  { key: 'Other', label: 'Toàn quốc và khác' },
] as const;

const GENDER_LABEL: Record<GenderFilter, string> = { all: 'Tất cả', Female: 'Giọng nữ', Male: 'Giọng nam', Mascot: 'Hoạt hình và khác' };

/** Vùng của nhân vật, suy ra từ chuỗi vùng/tỉnh backend gắn cho nhân vật */
function regionOf(regionText: string): string {
  const r = (regionText || '').toLowerCase();
  if (['tohoku', 'sendai', 'miyagi', 'aomori', 'akita', 'fukushima', 'shirakami'].some((k) => r.includes(k))) return 'Tohoku';
  if (r.includes('shikoku')) return 'Shikoku';
  if (['kansai', 'kyoto', 'nara'].some((k) => r.includes(k))) return 'Kansai';
  if (['chubu', 'toyama', 'nagano', 'nagoya', 'hokuriku'].some((k) => r.includes(k))) return 'Chubu';
  if (['kyushu', 'oita', 'bungo'].some((k) => r.includes(k))) return 'Kyushu';
  if (['chugoku', 'hiroshima'].some((k) => r.includes(k))) return 'Chugoku';
  if (['mombetsu', 'hokkaido'].some((k) => r.includes(k))) return 'Hokkaido';
  if (['kanto', 'tokyo', 'saitama'].some((k) => r.includes(k))) return 'Kanto';
  return 'Other';
}

const genderOf = (g: string): GenderFilter => (g === 'Female' ? 'Female' : g === 'Male' ? 'Male' : 'Mascot');

/** Ký tự đầu hiển thị trên ô nhân vật (bỏ ký hiệu như †) */
const initialOf = (name: string) => Array.from(name).find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? '声';

/** "Tiêu chuẩn (Normal)" -> "Tiêu chuẩn" */
const shortStyle = (v: VoiceOption) => (v.styleVietnamese || v.styleName).replace(/\s*\(.*\)\s*$/, '');

/** Kiểu giọng mặc định khi chọn nhân vật: "bình thường" nếu có, không thì kiểu đầu tiên */
const defaultStyle = (c: Character): VoiceOption => c.styles.find((s) => s.styleName === 'ノーマル' || s.styleName === 'ふつう') ?? c.styles[0];

/**
 * Chọn giọng đọc AI ngay trên trang: lọc theo giới tính và vùng, danh sách nhân vật gọn 2 cột (cuộn trong khung cố định
 * nên trang không bị dài ra), bên phải là chi tiết nhân vật và các phong cách giọng của nhân vật đó.
 */
export const VoiceBrowser: React.FC<VoiceBrowserProps> = ({ voices, selectedVoiceId, playingId, loadingId, onSelect, onPlay }) => {
  const [gender, setGender] = useState<GenderFilter>('all');
  const [region, setRegion] = useState<string>('all');
  const [browsing, setBrowsing] = useState<string | null>(null);

  const characters = useMemo<Character[]>(() => {
    const map = new Map<string, Character>();
    voices.forEach((v) => {
      let c = map.get(v.speakerName);
      if (!c) {
        c = { speakerName: v.speakerName, romajiName: v.romajiName || v.speakerName, gender: genderOf(v.gender), region: v.region, description: v.description, styles: [] };
        map.set(v.speakerName, c);
      }
      c.styles.push(v);
    });
    return Array.from(map.values());
  }, [voices]);

  const byGender = (c: Character, g: GenderFilter) => g === 'all' || c.gender === g;
  const byRegion = (c: Character, r: string) => r === 'all' || regionOf(c.region) === r;
  const genderCount = (g: GenderFilter) => characters.filter((c) => byGender(c, g) && byRegion(c, region)).length;
  const regionCount = (r: string) => characters.filter((c) => byGender(c, gender) && byRegion(c, r)).length;

  const current = voices.find((v) => v.id === selectedVoiceId);
  const shown = characters.filter((c) => byGender(c, gender) && byRegion(c, region));
  // Nhân vật đang xem: ưu tiên nhân vật vừa bấm, không thì nhân vật của giọng đang dùng; nằm ngoài bộ lọc thì lấy nhân vật đầu danh sách
  const wanted = browsing ?? current?.speakerName;
  const active = shown.find((c) => c.speakerName === wanted) ?? shown[0];
  const isCurrentCharacter = !!active && current?.speakerName === active.speakerName;

  const pickCharacter = (c: Character) => {
    setBrowsing(c.speakerName);
    // Bấm lại nhân vật đang dùng thì giữ nguyên phong cách đã chọn
    if (current?.speakerName !== c.speakerName) onSelect(defaultStyle(c).id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SegmentedControl
          ariaLabel="Nhóm giọng"
          size="sm"
          value={gender}
          onChange={(v) => setGender(v as GenderFilter)}
          options={(['all', 'Female', 'Male', 'Mascot'] as const).map((g) => ({ value: g, label: g === 'Mascot' ? 'Hoạt hình và khác' : g === 'all' ? 'Tất cả' : g === 'Female' ? 'Nữ' : 'Nam', count: genderCount(g) }))}
        />
        <div className="w-full sm:w-[260px]">
          <Select
            aria-label="Lọc theo vùng"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            options={REGIONS.map((r) => ({ value: r.key, label: `${r.label} (${regionCount(r.key)})`, disabled: r.key !== 'all' && regionCount(r.key) === 0 }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 overflow-hidden rounded-jc-lg border border-line lg:h-[392px] lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        {/* Danh sách nhân vật */}
        <div role="group" aria-label="Nhân vật" tabIndex={0} className="max-h-[300px] overflow-y-auto p-2 lg:max-h-none">
          {shown.length === 0 ? (
            <p className="m-0 p-3 text-sm text-sumi-muted">Không có nhân vật nào khớp bộ lọc này.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 min-[420px]:grid-cols-2">
              {shown.map((c) => {
                const on = c.speakerName === active?.speakerName;
                const inUse = c.speakerName === current?.speakerName;
                return (
                  <button
                    key={c.speakerName}
                    type="button"
                    onClick={() => pickCharacter(c)}
                    aria-pressed={on}
                    className={cx(
                      'flex min-h-11 w-full items-center gap-2.5 rounded-jc-md border-0 px-2 py-1.5 text-left text-sumi focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                      on ? 'bg-ai-soft' : 'bg-transparent hover:bg-paper-200',
                    )}
                  >
                    <span
                      className={cx('inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg font-mincho text-base font-bold', inUse ? 'bg-ai text-on-ai' : 'bg-paper-200 text-sumi')}
                      lang="ja"
                      aria-hidden="true"
                    >
                      {initialOf(c.speakerName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold leading-5">{c.romajiName}</span>
                      <span className="block truncate font-jp text-xs leading-4 text-sumi-muted" lang="ja">
                        {c.speakerName}
                      </span>
                    </span>
                    {c.styles.length > 1 && <span className="flex-none text-xs font-medium text-sumi-muted">{c.styles.length}</span>}
                    {inUse && <Icon name="check_circle" size={18} fill style={{ color: 'var(--ai)' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Chi tiết nhân vật và các phong cách giọng */}
        <div className="flex flex-col gap-3 overflow-y-auto border-t border-line bg-paper-100 p-4 lg:border-l lg:border-t-0">
          {active ? (
            <>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-sora font-mincho text-xl font-bold text-on-sora" lang="ja" aria-hidden="true">
                  {initialOf(active.speakerName)}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base font-bold leading-6">{active.romajiName}</span>
                  <span className="font-jp text-[13px] leading-5 text-sumi-muted" lang="ja">
                    {active.speakerName}
                  </span>
                </div>
              </div>
              <p className="m-0 text-[13px] leading-5 text-sumi-muted">
                {GENDER_LABEL[active.gender]} · {active.region}
              </p>
              {active.description && <p className="m-0 text-sm leading-5">{active.description}</p>}

              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold leading-5">
                  Phong cách giọng <span className="font-medium text-sumi-muted">{active.styles.length}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {active.styles.map((s) => {
                    const chosen = s.id === selectedVoiceId;
                    const busy = playingId === s.id;
                    return (
                      <div
                        key={s.id}
                        className={cx('inline-flex items-center rounded-full', chosen ? 'bg-ai-soft' : 'bg-paper-50')}
                        style={{ border: chosen ? '2px solid var(--ai)' : '1px solid var(--line)' }}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(s.id)}
                          aria-pressed={chosen}
                          title={`${s.styleVietnamese || s.styleName} · ${s.styleName}`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-0 bg-transparent py-0 pl-3 pr-1 text-sm font-semibold text-sumi focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                        >
                          {chosen && <Icon name="check" size={16} style={{ color: 'var(--ai)' }} />}
                          {shortStyle(s)}
                        </button>
                        <button
                          type="button"
                          className={cx('jc-audiochip', busy && 'is-playing')}
                          onClick={() => onPlay(s.id)}
                          aria-label={`${busy ? 'Dừng' : 'Nghe thử'} phong cách ${shortStyle(s)}`}
                        >
                          <Icon name={loadingId === s.id ? 'progress_activity' : busy ? 'stop_circle' : 'volume_up'} size={18} spin={loadingId === s.id} fill={busy} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {!isCurrentCharacter && <p className="m-0 text-[13px] leading-5 text-sumi-muted">Bấm vào phong cách để chọn giọng này. Biểu tượng loa để nghe thử.</p>}
              </div>
            </>
          ) : (
            <p className="m-0 text-sm text-sumi-muted">Chọn bộ lọc khác để xem nhân vật.</p>
          )}
        </div>
      </div>
    </div>
  );
};
