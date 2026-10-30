import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminLearningService } from '../../../services/adminLearningService';
import { JLPT_LEVELS, type ContentDetail, type ContentKind, type ContentRow, type LearningKind, type TopicDetail, type TopicOption, type TopicRow } from '../../../types/adminLearning';
import { useAdminToasts } from '../AdminExploreToasts';
import { ContentEditor } from './ContentEditor';
import { TopicEditor, TopicManager } from './TopicManager';
import { actionClass, ErrorBox, inputClass, LearningModal, LevelBadge, primaryClass, secondaryClass, StatusBadge, TopicChoices } from './LearningUi';

type Editor = { type: 'topic'; detail: TopicDetail | null } | { type: 'content'; detail: ContentDetail | null; readOnly: boolean } | { type: 'manager'; detail: TopicDetail } | { type: 'status'; id: number; name: string; active: boolean } | { type: 'bulkStatus'; active: boolean } | { type: 'assign' };
const names: Record<LearningKind, string> = { topics: 'Chủ đề', vocabularies: 'Từ vựng', grammars: 'Ngữ pháp' };
export function AdminLearningView({ kind }: { kind: LearningKind }) {
  const isTopic = kind === 'topics';
  const [keyword, setKeyword] = useState(''); const [level, setLevel] = useState(''); const [topic, setTopic] = useState(''); const [status, setStatus] = useState(''); const [pos, setPos] = useState(''); const [page, setPage] = useState(1);
  const [topics, setTopics] = useState<TopicOption[]>([]); const [rows, setRows] = useState<(TopicRow | ContentRow)[]>([]); const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<number[]>([]); const [assignTopics, setAssignTopics] = useState<number[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [modalError, setModalError] = useState(''); const [editor, setEditor] = useState<Editor | null>(null); const [revision, setRevision] = useState(0);
  const { toast, toasts } = useAdminToasts();
  useEffect(() => { const controller = new AbortController(); adminLearningService.options(controller.signal).then(setTopics).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }); return () => controller.abort(); }, [revision]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setSelected([]);
    const timer = setTimeout(() => {
      const filters = { keyword, jlptLevel: level, isActive: status, page: String(page), pageSize: '20', ...(topic === 'none' ? { untopiced: 'true' } : { topicId: topic }), partOfSpeech: pos };
      const promise = isTopic ? adminLearningService.topics(filters, controller.signal) : adminLearningService.contents(kind as ContentKind, filters, controller.signal);
      promise.then(data => { setRows(data.items); setTotal(data.total); setError(''); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message || 'Không tải được dữ liệu.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, isTopic, keyword, level, topic, status, pos, page, revision]);
  function refresh() { setEditor(null); setRevision(r => r + 1); setSelected([]); toast('Đã lưu thay đổi.'); }
  function close() { if (!busy) { setEditor(null); setModalError(''); } }
  async function open(id: number, mode: 'edit' | 'view' | 'manager') {
    setBusy(true); setError('');
    try {
      if (isTopic) { const detail = await adminLearningService.topic(id); setEditor(mode === 'manager' || mode === 'view' ? { type: 'manager', detail } : { type: 'topic', detail }); }
      else { const detail = await adminLearningService.detail(kind as ContentKind, id); setEditor({ type: 'content', detail, readOnly: mode === 'view' }); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được chi tiết.'); } finally { setBusy(false); }
  }
  async function mutate() {
    if (!editor) return; setBusy(true); setModalError('');
    try {
      if (editor.type === 'status') await adminLearningService.status(kind, editor.id, !editor.active);
      else if (editor.type === 'bulkStatus') await adminLearningService.bulkStatus(kind as ContentKind, selected, editor.active);
      else if (editor.type === 'assign') await adminLearningService.assign(kind as ContentKind, selected, assignTopics);
      refresh();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : 'Không lưu được thay đổi.'); } finally { setBusy(false); }
  }
  const selectionLevel = !isTopic && selected.length ? (rows.filter(row => selected.includes(row.id)) as ContentRow[]).map(row => row.jlptLevel) : [];
  const canAssign = selected.length > 0 && new Set(selectionLevel).size === 1;
  const maxPage = Math.max(1, Math.ceil(total / 20));
  return <div className="min-h-full bg-[#F8FAFC] p-5 md:p-8 font-sans text-[#071A44]">
    {toasts}
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-1 text-xs text-slate-400">Quản trị nội dung / Kho học liệu</p><h1 className="text-2xl font-bold tracking-tight">Quản lý {names[kind].toLowerCase()}</h1><p className="mt-1.5 text-sm text-slate-500">{isTopic ? 'Tổ chức nội dung theo chủ đề và level JLPT.' : 'Quản lý nội dung dùng chung, ví dụ và các chủ đề liên quan.'}</p></div><button className={primaryClass} disabled={busy} onClick={() => { setModalError(''); setEditor(isTopic ? { type: 'topic', detail: null } : { type: 'content', detail: null, readOnly: false }); }}><span className="text-lg leading-none">+</span> Thêm {names[kind].toLowerCase()}</button></div>
      <div className="flex gap-6 border-b border-[#E6EDF5]">{(['topics', 'vocabularies', 'grammars'] as const).map(value => <Link key={value} to={`/admin/${value}`} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${kind === value ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{names[value]}</Link>)}</div>
      <ErrorBox message={error} />
      <section className="rounded-xl border border-[#E6EDF5] bg-white shadow-sm">
        <div className="flex flex-wrap gap-3 border-b border-[#E6EDF5] p-4">
          <input className={`${inputClass} min-w-48 flex-1 sm:max-w-xs`} aria-label="Tìm kiếm" placeholder={isTopic ? 'Tìm tên hoặc mã chủ đề…' : 'Tìm từ, cách đọc hoặc nghĩa…'} value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} />
          <select className={`${inputClass} !w-auto`} aria-label="Lọc theo level" value={level} onChange={e => { setLevel(e.target.value); setTopic(''); setPage(1); }}><option value="">Tất cả level</option>{JLPT_LEVELS.map(value => <option key={value}>{value}</option>)}</select>
          {!isTopic && <select className={`${inputClass} !w-auto max-w-56`} aria-label="Lọc theo chủ đề" value={topic} onChange={e => { setTopic(e.target.value); setPage(1); }}><option value="">Tất cả chủ đề</option><option value="none">Chưa có chủ đề</option>{topics.filter(t => !level || t.jlptLevel === level).map(t => <option key={t.id} value={t.id}>{t.name} · {t.jlptLevel}</option>)}</select>}
          {kind === 'vocabularies' && <select className={`${inputClass} !w-auto`} aria-label="Lọc từ loại" value={pos} onChange={e => { setPos(e.target.value); setPage(1); }}><option value="">Tất cả từ loại</option>{['Danh từ', 'Động từ', 'Tính từ', 'Phó từ', 'Trợ từ'].map(value => <option key={value}>{value}</option>)}</select>}
          <select className={`${inputClass} !w-auto`} aria-label="Lọc trạng thái" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="true">Đang hiển thị</option><option value="false">Đã ẩn</option></select>
          {(keyword || level || topic || status || pos) && <button className={actionClass} onClick={() => { setKeyword(''); setLevel(''); setTopic(''); setStatus(''); setPos(''); setPage(1); }}>Xóa bộ lọc</button>}
        </div>
        {!isTopic && selected.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-800"><span>Đã chọn {selected.length} mục{!canAssign ? ' · Chọn các mục cùng level để gán chủ đề.' : ` · ${selectionLevel[0]}`}</span><div className="flex flex-wrap gap-2"><button className={secondaryClass} disabled={!canAssign || busy} onClick={() => { setAssignTopics([]); setEditor({ type: 'assign' }); }}>Gán chủ đề</button><button className={secondaryClass} disabled={busy} onClick={() => { setModalError(''); setEditor({ type: 'bulkStatus', active: false }); }}>Ẩn đã chọn</button><button className={secondaryClass} disabled={busy} onClick={() => { setModalError(''); setEditor({ type: 'bulkStatus', active: true }); }}>Khôi phục</button></div></div>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-[#E6EDF5] bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><tr>
          {!isTopic && <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Chọn tất cả trên trang" className="accent-[#0878EE]" checked={rows.length > 0 && selected.length === rows.length} disabled={loading} onChange={e => setSelected(e.target.checked ? rows.map(r => r.id) : [])} /></th>}
          <th className="min-w-48 px-5 py-3">{isTopic ? 'Chủ đề' : names[kind]}</th><th className="px-4 py-3">Level</th><th className="min-w-52 px-4 py-3">{isTopic ? 'Nội dung' : 'Nghĩa / Chủ đề'}</th><th className="px-4 py-3">Trạng thái</th><th className="min-w-40 px-4 py-3 text-right">Thao tác</th>
        </tr></thead><tbody className="divide-y divide-slate-100">
          {loading ? <tr><td colSpan={6} className="p-12 text-center text-slate-400">Đang tải dữ liệu…</td></tr> : !rows.length ? <tr><td colSpan={6} className="p-12 text-center"><p className="font-semibold text-slate-500">Chưa có nội dung phù hợp</p><p className="mt-1 text-xs text-slate-400">Thử thay đổi bộ lọc hoặc thêm nội dung mới.</p></td></tr> : rows.map(row => <tr key={row.id} className="hover:bg-slate-50/60">
            {!isTopic && <td className="px-4 py-4"><input type="checkbox" aria-label={`Chọn ${(row as ContentRow).text}`} className="accent-[#0878EE]" checked={selected.includes(row.id)} onChange={e => setSelected(old => e.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))} /></td>}
            <td className="px-5 py-4"><button className="text-left font-semibold text-[#071A44] hover:text-[#0878EE]" disabled={busy} onClick={() => open(row.id, 'view')}>{isTopic ? (row as TopicRow).name : <span className="text-base" lang="ja">{(row as ContentRow).text}</span>}</button><p className="mt-1 text-xs text-slate-400">{isTopic ? (row as TopicRow).code : (row as ContentRow).reading || (row as ContentRow).partOfSpeech || '—'}</p></td>
            <td className="px-4 py-4"><LevelBadge level={row.jlptLevel} /></td>
            <td className="max-w-sm px-4 py-4">{isTopic ? <><p className="font-medium text-slate-600">{(row as TopicRow).vocabularyCount} từ vựng · {(row as TopicRow).grammarCount} ngữ pháp</p><p className="mt-1 truncate text-xs text-slate-400">{(row as TopicRow).description || 'Chưa có mô tả'}</p></> : <><p className="line-clamp-2 text-slate-600">{(row as ContentRow).meaning}</p><div className="mt-1.5 flex flex-wrap gap-1">{(row as ContentRow).topics.slice(0, 2).map(t => <span key={t.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{t.name}</span>)}{(row as ContentRow).topics.length > 2 && <span className="text-xs text-slate-400">+{(row as ContentRow).topics.length - 2}</span>}{!(row as ContentRow).topics.length && <span className="text-xs italic text-slate-400">Chưa có chủ đề</span>}</div></>}</td>
            <td className="whitespace-nowrap px-4 py-4"><StatusBadge active={row.isActive} /></td><td className="px-4 py-4 text-right whitespace-nowrap">{isTopic && <button className={actionClass} disabled={busy} onClick={() => open(row.id, 'manager')}>Nội dung</button>}<button className={actionClass} disabled={busy} onClick={() => open(row.id, 'edit')}>Sửa</button><button className={`${actionClass} ${row.isActive ? '!text-slate-400' : '!text-emerald-600'}`} disabled={busy} onClick={() => { setModalError(''); setEditor({ type: 'status', id: row.id, name: isTopic ? (row as TopicRow).name : (row as ContentRow).text, active: row.isActive }); }}>{row.isActive ? 'Ẩn' : 'Khôi phục'}</button></td>
          </tr>)}
        </tbody></table></div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6EDF5] px-5 py-3 text-xs text-slate-400"><span>{total} {names[kind].toLowerCase()} · Trang {page}/{maxPage}</span><div className="flex gap-2"><button className={secondaryClass} disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>← Trước</button><button className={secondaryClass} disabled={page >= maxPage || loading} onClick={() => setPage(p => p + 1)}>Sau →</button></div></footer>
      </section>
    </div>
    {editor?.type === 'topic' && <TopicEditor detail={editor.detail} onClose={close} onSaved={refresh} />}
    {editor?.type === 'content' && <ContentEditor kind={kind as ContentKind} detail={editor.detail} topics={topics} readOnly={editor.readOnly} onClose={close} onSaved={refresh} />}
    {editor?.type === 'manager' && <TopicManager detail={editor.detail} onClose={close} onSaved={refresh} />}
    {editor?.type === 'status' && <LearningModal wide={false} title={editor.active ? 'Ẩn nội dung' : 'Khôi phục nội dung'} busy={busy} onClose={close} footer={<><button className={secondaryClass} onClick={close} disabled={busy}>Hủy</button><button className={primaryClass} disabled={busy} onClick={mutate}>{busy ? 'Đang lưu…' : 'Xác nhận'}</button></>}><div className="space-y-3"><ErrorBox message={modalError} /><p className="text-sm leading-relaxed text-slate-600">{editor.active ? 'Ẩn' : 'Khôi phục'} <strong>{editor.name}</strong>?</p><p className="text-xs leading-relaxed text-slate-400">{isTopic ? 'Trạng thái chỉ áp dụng cho chủ đề này. Các từ vựng và ngữ pháp vẫn được giữ trong kho.' : 'Nội dung bị ẩn sẽ không hiển thị cho learner tại các module sử dụng kho. Dữ liệu và liên kết vẫn được giữ lại để khôi phục.'}</p></div></LearningModal>}
    {editor?.type === 'assign' && <LearningModal wide={false} title={`Gán chủ đề cho ${selected.length} mục · ${selectionLevel[0]}`} busy={busy} onClose={close} footer={<><button className={secondaryClass} onClick={close} disabled={busy}>Hủy</button><button className={primaryClass} disabled={busy || !assignTopics.length} onClick={mutate}>{busy ? 'Đang lưu…' : 'Gán chủ đề'}</button></>}><div className="space-y-3"><ErrorBox message={modalError} /><p className="text-xs text-slate-400">Thêm các chủ đề được chọn, giữ nguyên các liên kết hiện có.</p><TopicChoices topics={topics.filter(t => t.jlptLevel === selectionLevel[0])} selected={assignTopics} onChange={setAssignTopics} /></div></LearningModal>}
    {editor?.type === 'bulkStatus' && <LearningModal wide={false} title={editor.active ? 'Khôi phục nhiều nội dung' : 'Ẩn nhiều nội dung'} busy={busy} onClose={close} footer={<><button className={secondaryClass} onClick={close} disabled={busy}>Hủy</button><button className={primaryClass} onClick={mutate} disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận'}</button></>}><ErrorBox message={modalError} /><p className="text-sm text-slate-600">{editor.active ? 'Khôi phục' : 'Ẩn'} {selected.length} {names[kind].toLowerCase()} đã chọn? Dữ liệu và liên kết vẫn được giữ nguyên.</p></LearningModal>}
  </div>;
}
