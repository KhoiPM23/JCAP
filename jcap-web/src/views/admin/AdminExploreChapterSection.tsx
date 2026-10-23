import React, { useState } from 'react';
import { PREFECTURES } from '../../data/japanMap';
import type {
  AdminExploreChapter,
  AdminExplorePrefecture,
  ExploreLevel,
  SaveExploreChapter,
} from '../../types/adminExplore';

const LEVELS: ExploreLevel[] = ['N5', 'N4', 'N3'];
const NAME_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p.nameVi]));

const EMPTY_FORM: SaveExploreChapter = {
  title: '',
  description: '',
  minLevel: 'N5',
  maxLevel: 'N5',
  unlockThresholdPercent: 70,
};

/** Kiểm tra giống backend để báo lỗi ngay cạnh ô nhập */
function validate(f: SaveExploreChapter): Partial<Record<keyof SaveExploreChapter, string>> {
  const errors: Partial<Record<keyof SaveExploreChapter, string>> = {};
  if (!f.title.trim()) errors.title = 'Tên chương không được để trống.';
  else if (f.title.trim().length > 200) errors.title = 'Tên chương tối đa 200 ký tự.';
  if ((f.description ?? '').trim().length > 1000) errors.description = 'Mô tả tối đa 1000 ký tự.';
  if (LEVELS.indexOf(f.minLevel) > LEVELS.indexOf(f.maxLevel)) {
    errors.maxLevel = 'Cấp kết thúc phải khó hơn hoặc bằng cấp bắt đầu (N5 → N4 → N3).';
  }
  const t = f.unlockThresholdPercent;
  if (!Number.isInteger(t) || t < 0 || t > 100) errors.unlockThresholdPercent = 'Nhập số nguyên từ 0 đến 100.';
  return errors;
}

interface Props {
  chapters: AdminExploreChapter[];
  prefectures: Map<number, AdminExplorePrefecture>;
  busy: boolean;
  onSelectPrefecture: (id: number) => void;
  /** Trả về danh sách lỗi của máy chủ (rỗng = thành công) */
  onSave: (id: number | null, dto: SaveExploreChapter) => Promise<string[] | null>;
  onMove: (id: number, delta: -1 | 1) => void;
  onDeactivate: (id: number) => Promise<boolean>;
}

export const AdminExploreChapterSection: React.FC<Props> = ({
  chapters,
  prefectures,
  busy,
  onSelectPrefecture,
  onSave,
  onMove,
  onDeactivate,
}) => {
  /** null = không mở form; 'new' = thêm chương; số = đang sửa chương đó */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(null);

  const startEdit = (target: number | 'new') => {
    setConfirmDeactivate(null);
    setEditing(target);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm" aria-labelledby="explore-chapters-title">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-5 border-b border-slate-100">
        <div>
          <h2 id="explore-chapters-title" className="text-base font-bold text-slate-900">
            Chương của hành trình
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Người học đi theo thứ tự chương. Chương sau mở khi người học đạt tỷ lệ con dấu đã đặt ở chương trước.
            Mỗi tỉnh chỉ thuộc một chương; đặt chương cho tỉnh ở bảng bên phải bản đồ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startEdit('new')}
          disabled={busy || editing === 'new'}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-[#0878EE] text-white text-sm font-semibold hover:bg-[#0667cc] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0878EE]"
        >
          <PlusIcon className="w-4 h-4" />
          Thêm chương
        </button>
      </div>

      <div className="p-5 space-y-3">
        {editing === 'new' && (
          <ChapterForm
            initial={EMPTY_FORM}
            heading="Chương mới"
            submitLabel="Tạo chương"
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={async (dto) => {
              const errors = await onSave(null, dto);
              if (errors === null) setEditing(null);
              return errors;
            }}
          />
        )}

        {chapters.length === 0 && editing !== 'new' && (
          <p className="text-sm text-slate-500 text-center py-8">
            Chưa có chương nào. Bấm "Thêm chương" để bắt đầu hành trình.
          </p>
        )}

        {chapters.map((c, i) =>
          editing === c.id ? (
            <ChapterForm
              key={c.id}
              initial={{
                title: c.title,
                description: c.description ?? '',
                minLevel: c.minLevel,
                maxLevel: c.maxLevel,
                unlockThresholdPercent: c.unlockThresholdPercent,
              }}
              heading={`Sửa chương`}
              submitLabel="Lưu thay đổi"
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={async (dto) => {
                const errors = await onSave(c.id, dto);
                if (errors === null) setEditing(null);
                return errors;
              }}
            />
          ) : (
            <ChapterCard
              key={c.id}
              chapter={c}
              isFirst={i === 0}
              isLast={i === chapters.length - 1}
              prefectures={prefectures}
              busy={busy}
              confirming={confirmDeactivate === c.id}
              onSelectPrefecture={onSelectPrefecture}
              onMove={(delta) => onMove(c.id, delta)}
              onEdit={() => startEdit(c.id)}
              onAskDeactivate={() => setConfirmDeactivate(c.id)}
              onCancelDeactivate={() => setConfirmDeactivate(null)}
              onDeactivate={async () => {
                if (await onDeactivate(c.id)) setConfirmDeactivate(null);
              }}
            />
          ),
        )}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------

interface CardProps {
  chapter: AdminExploreChapter;
  isFirst: boolean;
  isLast: boolean;
  prefectures: Map<number, AdminExplorePrefecture>;
  busy: boolean;
  confirming: boolean;
  onSelectPrefecture: (id: number) => void;
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onAskDeactivate: () => void;
  onCancelDeactivate: () => void;
  onDeactivate: () => void;
}

const ChapterCard: React.FC<CardProps> = ({
  chapter: c,
  isFirst,
  isLast,
  prefectures,
  busy,
  confirming,
  onSelectPrefecture,
  onMove,
  onEdit,
  onAskDeactivate,
  onCancelDeactivate,
  onDeactivate,
}) => {
  const closedCount = c.prefectureIds.filter((id) => !prefectures.get(id)?.isOpen).length;
  const levelText = c.minLevel === c.maxLevel ? c.minLevel : `${c.minLevel} → ${c.maxLevel}`;

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-bold flex items-center justify-center"
          aria-label={`Thứ tự ${c.orderIndex}`}
        >
          {c.orderIndex}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">{c.title}</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#0878EE] border border-blue-100">
              {levelText}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              {isFirst ? 'Chương đầu · luôn mở' : `Mở khi đạt ${c.unlockThresholdPercent}% con dấu chương trước`}
            </span>
          </div>
          {c.description && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{c.description}</p>}

          <div className="flex flex-wrap gap-1.5 mt-3">
            {c.prefectureIds.length === 0 ? (
              <span className="text-xs text-slate-500">
                Chưa có tỉnh nào. Chọn một tỉnh trên bản đồ rồi đặt chương ở bảng bên phải.
              </span>
            ) : (
              c.prefectureIds.map((id) => {
                const open = prefectures.get(id)?.isOpen;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectPrefecture(id)}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
                      open
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-white text-slate-600 border-slate-300 border-dashed hover:bg-slate-100'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
                    {NAME_BY_ID.get(id) ?? `Tỉnh ${id}`}
                    {!open && <span className="font-normal text-slate-500">· chưa mở</span>}
                  </button>
                );
              })
            )}
          </div>
          {closedCount > 0 && (
            <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
              <WarnIcon className="w-3.5 h-3.5 shrink-0" />
              {closedCount} tỉnh trong chương chưa mở: người học sẽ thấy "Sẽ cập nhật trong tương lai".
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <IconButton label="Đưa chương lên trên" disabled={busy || isFirst} onClick={() => onMove(-1)}>
            <ChevronIcon className="w-4 h-4" />
          </IconButton>
          <IconButton label="Đưa chương xuống dưới" disabled={busy || isLast} onClick={() => onMove(1)}>
            <ChevronIcon className="w-4 h-4 rotate-180" />
          </IconButton>
        </div>
      </div>

      {confirming ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3" role="alertdialog" aria-label="Xác nhận ngừng dùng chương">
          <p className="text-xs text-red-800 leading-relaxed">
            Ngừng dùng "{c.title}"? Chương được ẩn khỏi hành trình (không xoá dữ liệu). Các tỉnh trong chương trở về
            trạng thái chưa thuộc chương nào; tỉnh đang mở vẫn mở.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onCancelDeactivate} className={SECONDARY_BTN}>
              Huỷ
            </button>
            <button
              type="button"
              onClick={onDeactivate}
              disabled={busy}
              className="h-9 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-red-600"
            >
              Ngừng dùng
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" onClick={onEdit} disabled={busy} className={SECONDARY_BTN}>
            Sửa
          </button>
          <button
            type="button"
            onClick={onAskDeactivate}
            disabled={busy}
            className="h-9 px-3 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          >
            Ngừng dùng
          </button>
        </div>
      )}
    </article>
  );
};

// ---------------------------------------------------------------------------

interface FormProps {
  initial: SaveExploreChapter;
  heading: string;
  submitLabel: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (dto: SaveExploreChapter) => Promise<string[] | null>;
}

const ChapterForm: React.FC<FormProps> = ({ initial, heading, submitLabel, busy, onCancel, onSubmit }) => {
  const [form, setForm] = useState<SaveExploreChapter>(initial);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const errors = touched ? validate(form) : {};

  const set = <K extends keyof SaveExploreChapter>(key: K, value: SaveExploreChapter[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(validate(form)).length > 0) return;
    const result = await onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description?.trim() || null,
    });
    setServerErrors(result ?? []);
  };

  return (
    <form onSubmit={submit} className="rounded-xl border-2 border-[#0878EE]/30 bg-blue-50/30 p-4 space-y-3" noValidate>
      <h3 className="text-sm font-bold text-slate-900">{heading}</h3>

      <Field label="Tên chương" htmlFor="chapter-title" error={errors.title} required>
        <input
          id="chapter-title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={200}
          placeholder="Ví dụ: Chương 3 · Osaka"
          className={inputClass(!!errors.title)}
          autoFocus
        />
      </Field>

      <Field label="Mô tả ngắn" htmlFor="chapter-desc" error={errors.description} hint="Người học thấy dòng này ở đầu chương.">
        <textarea
          id="chapter-desc"
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          maxLength={1000}
          rows={2}
          className={inputClass(!!errors.description)}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Cấp bắt đầu" htmlFor="chapter-min">
          <select
            id="chapter-min"
            value={form.minLevel}
            onChange={(e) => set('minLevel', e.target.value as ExploreLevel)}
            className={inputClass(false)}
          >
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Cấp kết thúc" htmlFor="chapter-max" error={errors.maxLevel}>
          <select
            id="chapter-max"
            value={form.maxLevel}
            onChange={(e) => set('maxLevel', e.target.value as ExploreLevel)}
            className={inputClass(!!errors.maxLevel)}
          >
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Tỷ lệ mở chương sau (%)"
          htmlFor="chapter-threshold"
          error={errors.unlockThresholdPercent}
          hint="Tỷ lệ con dấu cần có ở chương này."
        >
          <input
            id="chapter-threshold"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={Number.isNaN(form.unlockThresholdPercent) ? '' : form.unlockThresholdPercent}
            onChange={(e) => set('unlockThresholdPercent', e.target.value === '' ? NaN : Number(e.target.value))}
            className={inputClass(!!errors.unlockThresholdPercent)}
          />
        </Field>
      </div>

      {serverErrors.length > 0 && (
        <ul className="text-xs text-red-700 list-disc pl-5 space-y-0.5" role="alert">
          {serverErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY_BTN}>
          Huỷ
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-9 px-4 rounded-lg bg-[#0878EE] text-white text-xs font-semibold hover:bg-[#0667cc] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0878EE]"
        >
          {busy ? 'Đang lưu…' : submitLabel}
        </button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------

const SECONDARY_BTN =
  'h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]';

const inputClass = (invalid: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40 ${
    invalid ? 'border-red-400' : 'border-slate-300 focus:border-[#0878EE]'
  }`;

const Field: React.FC<{
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, htmlFor, error, hint, required, children }) => (
  <div>
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-700 mb-1">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
    {children}
    {error ? (
      <p className="text-[11px] text-red-600 mt-1">{error}</p>
    ) : hint ? (
      <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
    ) : null}
  </div>
);

const IconButton: React.FC<{ label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({
  label,
  disabled,
  onClick,
  children,
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
  >
    {children}
  </button>
);

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeWidth="2.5" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function WarnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  );
}
