import { useEffect, useState } from 'react';
import { adminLearningService } from '../../../services/adminLearningService';
import { JLPT_LEVELS, type ContentKind, type ContentRow, type SaveTopic, type TopicDetail } from '../../../types/adminLearning';
import { actionClass, ErrorBox, Field, inputClass, LearningModal, LevelBadge, primaryClass, secondaryClass, StatusBadge } from './LearningUi';

export function TopicEditor({ detail, onClose, onSaved }: { detail: TopicDetail | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<SaveTopic>(() => ({ code: detail?.topic.code || '', name: detail?.topic.name || '', jlptLevel: detail?.topic.jlptLevel || 'N5', description: detail?.topic.description || '' }));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await adminLearningService.saveTopic(detail?.topic.id || null, form); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được chủ đề.'); }
    finally { setBusy(false); }
  }
  return <LearningModal title={detail ? 'Chỉnh sửa chủ đề' : 'Thêm chủ đề'} wide={false} busy={busy} onClose={onClose} footer={<><button className={secondaryClass} onClick={onClose} disabled={busy}>Hủy</button><button className={primaryClass} form="learning-topic-form" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu chủ đề'}</button></>}>
    <form id="learning-topic-form" onSubmit={save} className="space-y-4"><ErrorBox message={error} />
      <Field label="Tên chủ đề *"><input className={inputClass} value={form.name} required maxLength={200} onChange={e => setForm(old => ({ ...old, name: e.target.value }))} placeholder="Ví dụ: Ăn uống" /></Field>
      <div className="grid grid-cols-2 gap-4"><Field label="Mã chủ đề *" hint={detail ? 'Mã được giữ cố định.' : 'Chữ Latin, số, dấu _ hoặc -.'}><input className={inputClass} value={form.code} required maxLength={50} pattern="[A-Za-z0-9_-]+" readOnly={!!detail} onChange={e => setForm(old => ({ ...old, code: e.target.value.toUpperCase() }))} placeholder="DINING_N5" /></Field>
      <Field label="Level *" hint={detail && detail.topic.vocabularyCount + detail.topic.grammarCount > 0 ? 'Gỡ nội dung trước khi đổi level.' : 'Chỉ gán nội dung cùng level.'}><select className={inputClass} value={form.jlptLevel} disabled={!!detail && detail.topic.vocabularyCount + detail.topic.grammarCount > 0} onChange={e => setForm(old => ({ ...old, jlptLevel: e.target.value }))}>{JLPT_LEVELS.map(level => <option key={level}>{level}</option>)}</select></Field></div>
      <Field label="Mô tả"><textarea className={inputClass} rows={4} maxLength={1000} value={form.description || ''} onChange={e => setForm(old => ({ ...old, description: e.target.value }))} /></Field>
    </form>
  </LearningModal>;
}

export function TopicManager({ detail, onClose, onSaved }: { detail: TopicDetail; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<ContentKind>('vocabularies');
  const [selected, setSelected] = useState({ vocabularies: detail.vocabularies, grammars: detail.grammars });
  const [keyword, setKeyword] = useState(''); const [page, setPage] = useState(1);
  const [items, setItems] = useState<ContentRow[]>([]); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    const timeout = setTimeout(() => {
      setLoading(true);
      adminLearningService.contents(kind, { keyword, jlptLevel: detail.topic.jlptLevel, page: String(page), pageSize: '10' }, controller.signal)
        .then(data => { setItems(data.items); setTotal(data.total); })
        .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được nội dung.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [kind, keyword, page, detail.topic.jlptLevel]);
  function change(items: ContentRow[]) { setSelected(old => ({ ...old, [kind]: items })); }
  async function save() {
    setBusy(true); setError('');
    try { await adminLearningService.topicContents(detail.topic.id, selected.vocabularies.map(v => v.id), selected.grammars.map(g => g.id)); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được liên kết.'); }
    finally { setBusy(false); }
  }
  function move(index: number, delta: number) { const values = [...selected[kind]]; [values[index], values[index + delta]] = [values[index + delta], values[index]]; change(values); }
  return <LearningModal title={`${detail.topic.name} · ${detail.topic.jlptLevel}`} busy={busy} onClose={onClose} footer={<><button className={secondaryClass} onClick={onClose} disabled={busy}>Hủy</button><button className={primaryClass} onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu danh sách'}</button></>}>
    <div className="space-y-4"><ErrorBox message={error} /><p className="text-xs leading-relaxed text-slate-500">Chọn nội dung từ kho cùng level. Bỏ khỏi danh sách chỉ gỡ liên kết với chủ đề này.</p>
      <div className="flex gap-3 border-b border-[#E6EDF5]">{(['vocabularies', 'grammars'] as const).map(value => <button key={value} className={`border-b-2 px-1 pb-2 text-sm font-semibold ${kind === value ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-400'}`} onClick={() => { setItems([]); setLoading(true); setKind(value); setKeyword(''); setPage(1); }}>{value === 'vocabularies' ? 'Từ vựng' : 'Ngữ pháp'} ({selected[value].length})</button>)}</div>
      <section className="rounded-xl border border-[#E6EDF5] p-3 space-y-2"><h4 className="text-xs font-bold text-slate-500">NỘI DUNG ĐÃ CHỌN</h4><div className="max-h-48 overflow-y-auto space-y-1">
        {selected[kind].length ? selected[kind].map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-2 text-sm"><span className="w-5 text-xs text-slate-400">{index + 1}</span><span className="flex-1 truncate" lang="ja">{item.text} <span className="text-xs text-slate-400">{item.meaning}</span></span><button className={actionClass} aria-label={`Đưa ${item.text} lên`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button className={actionClass} aria-label={`Đưa ${item.text} xuống`} disabled={index === selected[kind].length - 1} onClick={() => move(index, 1)}>↓</button><button className="px-2 text-xs font-semibold text-red-500" onClick={() => change(selected[kind].filter(v => v.id !== item.id))}>Bỏ</button></div>) : <p className="py-3 text-center text-xs text-slate-400">Chưa chọn nội dung.</p>}
      </div></section>
      <input className={inputClass} value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} placeholder="Tìm trong kho theo từ, cách đọc hoặc nghĩa…" aria-label="Tìm nội dung để gán" />
      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-[#E6EDF5]">{loading ? <p className="p-6 text-center text-sm text-slate-400">Đang tải…</p> : items.length ? items.map(item => <label key={item.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50"><input type="checkbox" className="accent-[#0878EE]" checked={selected[kind].some(v => v.id === item.id)} onChange={e => change(e.target.checked ? [...selected[kind], item] : selected[kind].filter(v => v.id !== item.id))} /><span className="min-w-0 flex-1"><span className="block font-semibold text-[#071A44]" lang="ja">{item.text}</span><span className="block truncate text-xs text-slate-400">{item.meaning}</span></span><LevelBadge level={item.jlptLevel} />{!item.isActive && <StatusBadge active={false} />}</label>) : <p className="p-6 text-center text-sm text-slate-400">Không tìm thấy nội dung cùng level.</p>}</div>
      <div className="flex items-center justify-between text-xs text-slate-400"><span>{total} kết quả · Trang {page}/{Math.max(1, Math.ceil(total / 10))}</span><div className="flex gap-2"><button className={secondaryClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button><button className={secondaryClass} disabled={page * 10 >= total} onClick={() => setPage(p => p + 1)}>Sau</button></div></div>
    </div>
  </LearningModal>;
}
