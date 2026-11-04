import { useState } from 'react';
import { adminLearningImportService } from '../../../services/adminLearningImportService';
import type { LearningImportReport } from '../../../types/adminLearning';
import { ErrorBox, inputClass, LearningModal, primaryClass, secondaryClass } from './LearningUi';

const actions = { create: 'Thêm mới', reuse: 'Dùng mục có sẵn', skip: 'Bỏ qua' };
export function LearningImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<LearningImportReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [issuePage, setIssuePage] = useState(0);
  const [rowPage, setRowPage] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  async function template() {
    setDownloading(true); setError('');
    try { await adminLearningImportService.template(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được mẫu.'); }
    finally { setDownloading(false); }
  }
  async function upload(confirm = false) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const result = await adminLearningImportService.upload(file, confirm ? report?.fileHash : undefined);
      setReport(result); setIssuePage(0); setRowPage(0); setAcknowledged(false);
    } catch (cause) {
      // A failed confirmation must be checked again before the next attempt.
      if (confirm) setReport(null);
      setError(cause instanceof Error ? cause.message : 'Không xử lý được file.');
    } finally { setBusy(false); }
  }
  function selectFile(next: File | null) {
    setReport(null); setFile(null); setAcknowledged(false); setError(''); setIssuePage(0); setRowPage(0);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith('.xlsx') || !next.size || next.size > 5 * 1024 * 1024) {
      setError('Chọn file .xlsx không rỗng, tối đa 5 MB.'); return;
    }
    setFile(next);
  }
  const errorCount = report?.issues.filter(i => i.severity === 'error').length ?? 0;
  const warningCount = report?.issues.filter(i => i.severity === 'warning').length ?? 0;
  const issues = report ? [...report.issues.filter(i => i.severity === 'error'), ...report.issues.filter(i => i.severity === 'warning')] : [];
  return <LearningModal title="Nhập học liệu từ Excel" busy={busy || downloading} onClose={report?.imported ? onSaved : onClose} footer={report?.imported
    ? <button className={primaryClass} onClick={onSaved}>Hoàn tất</button>
    : <><button className={secondaryClass} disabled={busy || downloading} onClick={onClose}>Đóng</button>
      {report?.canImport ? <button className={primaryClass} disabled={busy || !acknowledged} onClick={() => upload(true)}>{busy ? 'Đang nhập…' : 'Xác nhận nhập'}</button>
        : <button className={primaryClass} disabled={!file || busy || downloading} onClick={() => upload()}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra dữ liệu'}</button>}</>}>
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
        <div><p className="text-sm font-semibold">1. Chuẩn bị theo mẫu · 2. Kiểm tra · 3. Xác nhận nhập</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Một file có thể chứa chủ đề, từ vựng, ngữ pháp, ví dụ và nguồn. Xóa dòng minh họa trước khi dùng. Hướng dẫn chi tiết nằm trong sheet Guide.</p></div>
        <button className={`${secondaryClass} shrink-0`} disabled={downloading || busy} onClick={template}>{downloading ? 'Đang tải…' : 'Tải mẫu Excel'}</button>
      </div>
      <ErrorBox message={error} />
      {!report?.imported && <label className="block space-y-2 text-sm font-medium"><span>Chọn file Excel (.xlsx)</span><input type="file" accept=".xlsx" className={inputClass} disabled={busy || downloading} onChange={e => selectFile(e.target.files?.[0] ?? null)} /><span className="block text-xs font-normal text-slate-400">Tối đa 5 MB · 500 mục mỗi loại · 3.000 dòng toàn file. Chủ đề và nội dung phải cùng level.</span></label>}
      {report && <>
        <div role="status" aria-live="polite" className={`rounded-lg border p-3 text-sm ${report.imported ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : report.canImport ? 'border-blue-100 bg-blue-50 text-blue-800' : 'border-red-100 bg-red-50 text-red-700'}`}>
          <p className="font-semibold">{report.imported ? 'Đã nhập dữ liệu thành công.' : report.canImport ? 'File hợp lệ. Chưa lưu vào kho.' : `${errorCount} lỗi cần sửa. Chưa lưu dữ liệu.`}</p>
          <p className="mt-1 text-xs">{warningCount > 0 ? `${warningCount} lưu ý · ` : ''}{report.imported ? 'Các mục đã có được giữ nguyên.' : 'Có lỗi sẽ không nhập bất kỳ dòng nào. Sửa file rồi chọn lại để kiểm tra.'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[
          ['Chủ đề mới', report.newTopics], ['Từ vựng mới', report.newVocabularies], ['Ngữ pháp mới', report.newGrammars], ['Ví dụ mới', report.newExamples],
          ['Nguồn mới', report.newSources], ['Liên kết mới', report.newLinks], ['Mục dùng lại', report.reusedContents],
        ].map(([label, count]) => <div key={label} className="rounded-lg border border-[#E6EDF5] p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-bold">{count}</p></div>)}</div>
        {!report.canImport && <p className="text-xs text-slate-400">Các số trên là dự kiến cho những dòng đã kiểm tra, chưa phải số đã nhập.</p>}
        {issues.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">Lỗi và lưu ý ({issues.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-[#E6EDF5]"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Vị trí</th><th className="p-2">Cột</th><th className="p-2">Nội dung</th></tr></thead><tbody className="divide-y divide-slate-100">{issues.slice(issuePage * 20, (issuePage + 1) * 20).map((issue, index) => <tr key={index}><td className="whitespace-nowrap p-2">{issue.sheet}{issue.row > 0 ? ` · dòng ${issue.row}` : ''}</td><td className="p-2">{issue.column || '—'}</td><td className={`p-2 ${issue.severity === 'error' ? 'text-red-600' : 'text-amber-700'}`}>{issue.severity === 'error' ? 'Lỗi: ' : 'Lưu ý: '}{issue.message}</td></tr>)}</tbody></table></div>
          {issues.length > 20 && <div className="flex items-center justify-end gap-2 text-xs"><button className={secondaryClass} disabled={issuePage === 0} onClick={() => setIssuePage(p => p - 1)}>Trước</button><span>{issuePage + 1}/{Math.ceil(issues.length / 20)}</span><button className={secondaryClass} disabled={(issuePage + 1) * 20 >= issues.length} onClick={() => setIssuePage(p => p + 1)}>Sau</button></div>}
        </section>}
        {report.rows.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">{report.imported ? 'Kết quả theo dòng' : 'Xem trước theo dòng'} ({report.rows.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-[#E6EDF5]"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Vị trí</th><th className="p-2">Nội dung</th><th className="p-2">Xử lý</th></tr></thead><tbody className="divide-y divide-slate-100">{report.rows.slice(rowPage * 20, (rowPage + 1) * 20).map(row => <tr key={`${row.sheet}-${row.row}`}><td className="whitespace-nowrap p-2">{row.sheet} · {row.row}</td><td className="max-w-sm p-2"><p className="break-words">{row.text}</p><span className="text-slate-400">{row.key}</span></td><td className="whitespace-nowrap p-2 text-[#0878EE]">{actions[row.action]}</td></tr>)}</tbody></table></div>
          {report.rows.length > 20 && <div className="flex items-center justify-end gap-2 text-xs"><button className={secondaryClass} disabled={rowPage === 0} onClick={() => setRowPage(p => p - 1)}>Trước</button><span>{rowPage + 1}/{Math.ceil(report.rows.length / 20)}</span><button className={secondaryClass} disabled={(rowPage + 1) * 20 >= report.rows.length} onClick={() => setRowPage(p => p + 1)}>Sau</button></div>}
        </section>}
        {!report.imported && report.canImport && <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><input type="checkbox" className="mt-0.5 accent-[#0878EE]" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} /><span>Tôi đã kiểm tra dữ liệu và các lưu ý. Mục đã có giữ nguyên nội dung, nguồn, ví dụ và trạng thái; chỉ thêm liên kết chủ đề còn thiếu. Hệ thống sẽ kiểm tra lại trước khi lưu.</span></label>}
      </>}
    </div>
  </LearningModal>;
}
