import { useEffect, useState, type FormEvent } from 'react';
import { adminLearningService } from '../../../services/adminLearningService';
import { JLPT_LEVELS, type ContentKind, type ContentRow, type SaveTopic, type TopicDetail } from '../../../types/adminLearning';
import { actionClass, ErrorBox, Field, inputClass, LearningModal, LevelBadge, primaryClass, secondaryClass, StatusBadge } from './LearningUi';

type TopicSelection = Record<ContentKind, ContentRow[]>;

export function TopicEditor({ detail, onClose, onSaved }: { detail: TopicDetail | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<SaveTopic>(() => ({ code: detail?.topic.code || '', name: detail?.topic.name || '', jlptLevel: detail?.topic.jlptLevel || 'N5', description: detail?.topic.description || '' }));
  const [selected, setSelected] = useState<TopicSelection>(() => ({ vocabularies: detail?.vocabularies || [], grammars: detail?.grammars || [] }));
  const [tab, setTab] = useState<'info' | 'contents'>('info');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasContents = selected.vocabularies.length + selected.grammars.length > 0;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !/^[A-Za-z0-9_-]+$/.test(form.code)) {
      setTab('info');
      setError('Nhập tên và mã chủ đề hợp lệ. Mã chỉ gồm chữ Latin, số, dấu _ hoặc -.');
      return;
    }
    setBusy(true); setError('');
    try {
      await adminLearningService.saveTopic(detail?.topic.id || null, {
        ...form,
        contents: { vocabularyIds: selected.vocabularies.map(item => item.id), grammarIds: selected.grammars.map(item => item.id) },
      });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được chủ đề.'); }
    finally { setBusy(false); }
  }

  return <LearningModal title={detail ? 'Chỉnh sửa chủ đề' : 'Thêm chủ đề'} busy={busy} onClose={onClose} footer={<>
    <button type="button" className={secondaryClass} onClick={onClose} disabled={busy}>Hủy</button>
    <button className={primaryClass} form="learning-topic-form" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu chủ đề'}</button>
  </>}>
    <form id="learning-topic-form" onSubmit={save} noValidate className="space-y-5">
      <ErrorBox message={error} />
      <div className="al-editor-tabs flex gap-5 border-b border-[#E6EDF5]" role="tablist" aria-label="Chỉnh sửa chủ đề">
        {(['info', 'contents'] as const).map(value => <button
          key={value} type="button" role="tab" id={`al-topic-tab-${value}`} aria-controls={`al-topic-panel-${value}`}
          aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
          className={`border-b-2 pb-3 text-sm font-semibold ${tab === value ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          onClick={() => setTab(value)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'info' : event.key === 'End' ? 'contents' : tab === 'info' ? 'contents' : 'info';
            setTab(next); document.getElementById(`al-topic-tab-${next}`)?.focus();
          }}
        >{value === 'info' ? 'Thông tin' : `Nội dung (${selected.vocabularies.length + selected.grammars.length})`}</button>)}
      </div>
      <div hidden={tab !== 'info'} role="tabpanel" id="al-topic-panel-info" aria-labelledby="al-topic-tab-info" className="space-y-4">
        <Field label="Tên chủ đề *" hint="Nhóm từ vựng theo tình huống. Nhóm ngữ pháp theo mục đích diễn đạt.">
          <input className={inputClass} value={form.name} required maxLength={200} disabled={busy} onChange={event => setForm(old => ({ ...old, name: event.target.value }))} placeholder="Ví dụ: Ăn uống hoặc Xin phép" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mã chủ đề *" hint={detail ? 'Mã được giữ cố định.' : 'Chữ Latin, số, dấu _ hoặc -.'}>
            <input className={inputClass} value={form.code} required maxLength={50} pattern="[A-Za-z0-9_-]+" readOnly={!!detail} disabled={busy} onChange={event => setForm(old => ({ ...old, code: event.target.value.toUpperCase() }))} placeholder="DINING_N5" />
          </Field>
          <Field label="Trình độ JLPT *" hint={hasContents ? 'Gỡ hết nội dung đã chọn trước khi đổi trình độ.' : 'Chỉ gán nội dung cùng trình độ.'}>
            <select className={inputClass} value={form.jlptLevel} disabled={busy || hasContents} onChange={event => setForm(old => ({ ...old, jlptLevel: event.target.value }))}>
              {JLPT_LEVELS.map(level => <option key={level}>{level}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Mô tả"><textarea className={inputClass} rows={4} maxLength={1000} disabled={busy} value={form.description || ''} onChange={event => setForm(old => ({ ...old, description: event.target.value }))} /></Field>
      </div>
      <div hidden={tab !== 'contents'} role="tabpanel" id="al-topic-panel-contents" aria-labelledby="al-topic-tab-contents">
        <TopicContentPicker key={form.jlptLevel} level={form.jlptLevel} selected={selected} onChange={setSelected} disabled={busy} />
      </div>
    </form>
  </LearningModal>;
}

function TopicContentPicker({ level, selected, onChange, disabled }: { level: string; selected: TopicSelection; onChange: (value: TopicSelection) => void; disabled: boolean }) {
  const [kind, setKind] = useState<ContentKind>('vocabularies');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ContentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const timeout = setTimeout(() => {
      adminLearningService.contents(kind, { keyword, jlptLevel: level, page: String(page), pageSize: '10' }, controller.signal)
        .then(data => { if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total); } })
        .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được nội dung.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [kind, keyword, page, level]);
  function change(items: ContentRow[]) { onChange({ ...selected, [kind]: items }); }
  function move(index: number, delta: number) {
    const values = [...selected[kind]];
    [values[index], values[index + delta]] = [values[index + delta], values[index]];
    change(values);
  }
  return <div className="space-y-4">
    <p className="text-xs leading-relaxed text-slate-500">Chọn nội dung từ kho cùng trình độ {level}. Bỏ khỏi danh sách chỉ gỡ liên kết với chủ đề này.</p>
    <div className="flex gap-3 border-b border-[#E6EDF5]" role="tablist" aria-label="Loại nội dung chủ đề">
      {(['vocabularies', 'grammars'] as const).map(value => <button key={value} type="button" role="tab" id={`al-topic-kind-${value}`} aria-controls="al-topic-items" aria-selected={kind === value} tabIndex={kind === value ? 0 : -1}
        className={`border-b-2 px-1 pb-2 text-sm font-semibold ${kind === value ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-400'}`} disabled={disabled}
        onClick={() => { setItems([]); setLoading(true); setKind(value); setKeyword(''); setPage(1); }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'vocabularies' : event.key === 'End' ? 'grammars' : kind === 'vocabularies' ? 'grammars' : 'vocabularies';
          setItems([]); setLoading(true); setKind(next); setKeyword(''); setPage(1);
          document.getElementById(`al-topic-kind-${next}`)?.focus();
        }}
      >{value === 'vocabularies' ? 'Từ vựng' : 'Ngữ pháp'} ({selected[value].length})</button>)}
    </div>
    <div id="al-topic-items" role="tabpanel" aria-labelledby={`al-topic-kind-${kind}`} className="space-y-4">
      {kind === 'grammars' && <p className="text-xs leading-relaxed text-slate-500">Ưu tiên các mẫu câu có cùng công dụng chính. Có thể gắn thêm chủ đề nếu mẫu có một công dụng khác rõ ràng.</p>}
      <section className="space-y-2" aria-label="Nội dung đã chọn">
        <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold text-slate-500">Đã chọn ({selected[kind].length})</h4>
          {selected[kind].length > 0 && <button type="button" className={actionClass} disabled={disabled} onClick={() => change([])}>Bỏ chọn tất cả</button>}
        </div>
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-[#E6EDF5]">
          {selected[kind].length ? selected[kind].map((item, index) => <div key={item.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
            <span className="w-5 text-xs text-slate-400">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate" title={`${item.text} · ${item.meaning}`}><span lang="ja">{item.text}</span> <span className="text-xs text-slate-400">{item.meaning}</span></span>
            <button type="button" className={actionClass} aria-label={`Đưa ${item.text} lên`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className={actionClass} aria-label={`Đưa ${item.text} xuống`} disabled={disabled || index === selected[kind].length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="px-2 text-xs font-semibold text-red-500 disabled:opacity-40" disabled={disabled} onClick={() => change(selected[kind].filter(value => value.id !== item.id))}>Bỏ</button>
          </div>) : <p className="py-4 text-center text-xs text-slate-400">Chưa chọn nội dung.</p>}
        </div>
      </section>
      <input className={inputClass} value={keyword} disabled={disabled} maxLength={200} onChange={event => { setKeyword(event.target.value); setPage(1); }} placeholder="Tìm trong kho theo từ, cách đọc hoặc nghĩa…" aria-label="Tìm nội dung để gán" />
      <ErrorBox message={error} />
      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-[#E6EDF5]" aria-label="Nội dung trong kho" aria-busy={loading}>
        {loading ? <p className="p-6 text-center text-sm text-slate-400">Đang tải…</p> : error ? null : items.length ? items.map(item => <label key={item.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50">
          <input type="checkbox" className="accent-[#0878EE]" disabled={disabled} checked={selected[kind].some(value => value.id === item.id)} onChange={event => change(event.target.checked ? [...selected[kind], item] : selected[kind].filter(value => value.id !== item.id))} />
          <span className="min-w-0 flex-1"><span className="block font-semibold text-[#071A44]" lang="ja">{item.text}</span><span className="block truncate text-xs text-slate-400">{item.meaning}</span></span>
          <LevelBadge level={item.jlptLevel} />{!item.isActive && <StatusBadge active={false} />}
        </label>) : <p className="p-6 text-center text-sm text-slate-400">Không tìm thấy nội dung cùng trình độ.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>{total} kết quả · Trang {page}/{Math.max(1, Math.ceil(total / 10))}</span><div className="flex gap-2">
        <button type="button" className={secondaryClass} disabled={disabled || loading || !!error || page <= 1} onClick={() => setPage(value => value - 1)}>Trước</button>
        <button type="button" className={secondaryClass} disabled={disabled || loading || !!error || page * 10 >= total} onClick={() => setPage(value => value + 1)}>Sau</button>
      </div></div>
    </div>
  </div>;
}
