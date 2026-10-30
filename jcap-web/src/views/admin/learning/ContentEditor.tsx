import { useState } from 'react';
import { adminLearningService, LearningApiError } from '../../../services/adminLearningService';
import { JLPT_LEVELS, type ContentDetail, type ContentKind, type SaveContent, type TopicOption } from '../../../types/adminLearning';
import { ErrorBox, Field, inputClass, LearningModal, primaryClass, secondaryClass, TopicChoices } from './LearningUi';

export function ContentEditor({ kind, detail, topics, readOnly = false, onClose, onSaved }: { kind: ContentKind; detail: ContentDetail | null; topics: TopicOption[]; readOnly?: boolean; onClose: () => void; onSaved: () => void }) {
  const isVocab = kind === 'vocabularies';
  const noun = isVocab ? 'từ vựng' : 'ngữ pháp';
  const [form, setForm] = useState<SaveContent>(() => ({ text: detail?.item.text || '', reading: detail?.item.reading || '', meaning: detail?.item.meaning || '', jlptLevel: detail?.item.jlptLevel || 'N5', partOfSpeech: detail?.item.partOfSpeech || '', formation: detail?.formation || '', explanation: detail?.explanation || '', usageNotes: detail?.usageNotes || '', topicIds: detail?.item.topics.map(t => t.id) || [], examples: detail?.examples.map(e => ({ id: e.id, japaneseText: e.japaneseText, vietnameseTranslation: e.vietnameseTranslation, furigana: e.furigana })) || [], allowSimilar: false }));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [similar, setSimilar] = useState(false);
  const [tab, setTab] = useState<'content' | 'examples' | 'sources'>('content');
  function set<K extends keyof SaveContent>(key: K, value: SaveContent[K]) { setForm(old => ({ ...old, [key]: value })); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    if (!form.text.trim() || !form.meaning.trim()) { setTab('content'); setError('Vui lòng nhập nội dung và nghĩa.'); return; }
    if (form.examples.some(e => !e.japaneseText.trim())) { setTab('examples'); setError('Vui lòng nhập câu tiếng Nhật cho các ví dụ hoặc xóa ví dụ trống.'); return; }
    setBusy(true); setError('');
    try { await adminLearningService.saveContent(kind, detail?.item.id || null, form); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được nội dung.'); if (cause instanceof LearningApiError && cause.status === 409) setSimilar(true); }
    finally { setBusy(false); }
  }
  const footer = <><button type="button" className={secondaryClass} onClick={onClose} disabled={busy}>{readOnly ? 'Đóng' : 'Hủy'}</button>{!readOnly && <button form="learning-content-form" type="submit" className={primaryClass} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu nội dung'}</button>}</>;
  return <LearningModal title={`${readOnly ? 'Chi tiết' : detail ? 'Chỉnh sửa' : 'Thêm'} ${noun}`} onClose={onClose} busy={busy} footer={footer}>
    <form id="learning-content-form" onSubmit={save} noValidate className="space-y-5">
      <ErrorBox message={error} />
      <div className="flex gap-5 border-b border-[#E6EDF5]">{([['content', 'Thông tin'], ['examples', `Ví dụ (${form.examples.length})`], ['sources', 'Nguồn dữ liệu']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setTab(key)} className={`border-b-2 pb-2 text-sm font-semibold ${tab === key ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label}</button>)}</div>
      <div hidden={tab !== 'content'} className="space-y-4">
        {detail && detail.shadowingUses + detail.exploreUses > 0 && <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">Đang dùng trong {detail.shadowingUses} bài Shadowing và {detail.exploreUses} bài Explore. Nội dung chỉnh sửa sẽ được cập nhật tại các nơi này.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={isVocab ? 'Từ vựng *' : 'Mẫu ngữ pháp *'}><input className={`${inputClass} text-lg`} value={form.text} required maxLength={100} readOnly={readOnly} onChange={e => set('text', e.target.value)} lang="ja" placeholder={isVocab ? '食べる' : '〜てもいい'} /></Field>
          <Field label="Cách đọc"><input className={inputClass} value={form.reading || ''} maxLength={isVocab ? 100 : 200} readOnly={readOnly} onChange={e => set('reading', e.target.value)} lang="ja" placeholder="かな" /></Field>
        </div>
        <Field label="Nghĩa tiếng Việt *"><textarea className={inputClass} value={form.meaning} required maxLength={1000} rows={2} readOnly={readOnly} onChange={e => set('meaning', e.target.value)} /></Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Level *" hint={detail && form.jlptLevel !== detail.item.jlptLevel ? 'Đã bỏ chọn chủ đề cũ; hãy chọn chủ đề cùng level mới.' : undefined}><select className={inputClass} value={form.jlptLevel} disabled={readOnly} onChange={e => setForm(old => ({ ...old, jlptLevel: e.target.value, topicIds: [] }))}>{JLPT_LEVELS.map(level => <option key={level}>{level}</option>)}</select></Field>
          {isVocab && <Field label="Từ loại"><input className={inputClass} value={form.partOfSpeech || ''} maxLength={100} readOnly={readOnly} onChange={e => set('partOfSpeech', e.target.value)} list="learning-pos" placeholder="Danh từ; động từ する…" /><datalist id="learning-pos"><option>Danh từ</option><option>Động từ nhóm 1</option><option>Động từ nhóm 2</option><option>Động từ する</option><option>Tính từ đuôi い</option><option>Tính từ đuôi な</option><option>Phó từ</option><option>Trợ từ</option></datalist></Field>}
        </div>
        {!isVocab && <Field label="Cấu trúc"><textarea className={inputClass} value={form.formation || ''} maxLength={1000} rows={2} readOnly={readOnly} onChange={e => set('formation', e.target.value)} /></Field>}
        <Field label="Giải thích"><textarea className={inputClass} value={form.explanation || ''} maxLength={20000} rows={4} readOnly={readOnly} onChange={e => set('explanation', e.target.value)} /></Field>
        <Field label="Lưu ý sử dụng"><textarea className={inputClass} value={form.usageNotes || ''} maxLength={20000} rows={3} readOnly={readOnly} onChange={e => set('usageNotes', e.target.value)} /></Field>
        <div className="space-y-2"><p className="text-xs font-semibold text-slate-600">Chủ đề cùng level</p><TopicChoices topics={topics.filter(t => t.jlptLevel === form.jlptLevel)} selected={form.topicIds} onChange={ids => set('topicIds', ids)} disabled={readOnly} /></div>
        {similar && <label className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><input type="checkbox" checked={form.allowSimilar} onChange={e => set('allowSimilar', e.target.checked)} />Tôi đã kiểm tra và xác nhận đây là mục nghĩa/cách dùng riêng, cần giữ bên cạnh mục tương tự.</label>}
      </div>
      <div hidden={tab !== 'examples'} className="space-y-4">
        {!form.examples.length && <p className="py-5 text-center text-sm text-slate-400">Chưa có câu ví dụ.</p>}
        {form.examples.map((example, index) => <section key={example.id || `new-${index}`} className="rounded-xl border border-[#E6EDF5] bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-500">VÍ DỤ {index + 1}</p>{!readOnly && <div className="flex gap-1"><button type="button" className={secondaryClass} aria-label={`Đưa ví dụ ${index + 1} lên`} disabled={index === 0} onClick={() => { const values = [...form.examples]; [values[index - 1], values[index]] = [values[index], values[index - 1]]; set('examples', values); }}>↑</button><button type="button" className={secondaryClass} aria-label={`Đưa ví dụ ${index + 1} xuống`} disabled={index === form.examples.length - 1} onClick={() => { const values = [...form.examples]; [values[index], values[index + 1]] = [values[index + 1], values[index]]; set('examples', values); }}>↓</button><button type="button" className="px-2 text-xs font-semibold text-red-500" onClick={() => set('examples', form.examples.filter((_, i) => i !== index))}>Xóa</button></div>}</div>
          <Field label="Câu tiếng Nhật *"><textarea className={inputClass} required maxLength={!isVocab && index === 0 ? 500 : 2000} value={example.japaneseText} readOnly={readOnly} rows={2} onChange={e => set('examples', form.examples.map((item, i) => i === index ? { ...item, japaneseText: e.target.value } : item))} lang="ja" /></Field>
          <Field label="Bản dịch tiếng Việt"><textarea className={inputClass} maxLength={2000} value={example.vietnameseTranslation || ''} readOnly={readOnly} rows={2} onChange={e => set('examples', form.examples.map((item, i) => i === index ? { ...item, vietnameseTranslation: e.target.value } : item))} /></Field>
          <Field label="Furigana" hint="Ví dụ: パンを{食|た}べます。"><input className={inputClass} maxLength={4000} value={example.furigana || ''} readOnly={readOnly} onChange={e => set('examples', form.examples.map((item, i) => i === index ? { ...item, furigana: e.target.value } : item))} /></Field>
          {detail?.examples.find(e => e.id === example.id)?.sourceName && <p className="text-xs text-slate-400">Nguồn: {detail.examples.find(e => e.id === example.id)?.sourceName}</p>}
        </section>)}
        {!readOnly && <button type="button" className={secondaryClass} disabled={form.examples.length >= 50} onClick={() => set('examples', [...form.examples, { japaneseText: '', vietnameseTranslation: '', furigana: '' }])}>+ Thêm ví dụ</button>}
      </div>
      <div hidden={tab !== 'sources'} className="space-y-3">
        {detail?.sources.length ? detail.sources.map(source => <section key={`${source.name}-${source.externalId}`} className="rounded-lg border border-[#E6EDF5] p-4 text-sm"><a href={source.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#0878EE]">{source.name}</a><p className="mt-1 text-xs text-slate-400">{source.license} · Mã nguồn: {source.externalId}</p><p className="mt-3 text-xs leading-relaxed text-slate-500">{source.attribution}</p><a href={source.licenseUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[#0878EE]">Giấy phép sử dụng ↗</a></section>) : <p className="py-6 text-center text-sm text-slate-400">Nội dung nhập thủ công. Chưa có thông tin nguồn bên ngoài.</p>}
      </div>
    </form>
  </LearningModal>;
}
