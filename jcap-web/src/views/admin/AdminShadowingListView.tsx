import React, { useEffect, useState } from 'react';
import { adminShadowingService } from '../../services/adminShadowingService';
import type {
  ShadowingDialogueItem,
  CreateShadowingDialoguePayload,
  CreateShadowingSentencePayload
} from '../../types/shadowing';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';

export const AdminShadowingListView: React.FC = () => {
  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string | null>(null);

  // Form Modal state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form Data
  const [formScenarioId, setFormScenarioId] = useState<number>(1);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formLevel, setFormLevel] = useState<'N5' | 'N4' | 'N3'>('N5');
  const [formSource, setFormSource] = useState<string>('');
  const [formRoleA, setFormRoleA] = useState<string>('');
  const [formRoleB, setFormRoleB] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formSentences, setFormSentences] = useState<CreateShadowingSentencePayload[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Delete modal state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    const res = await adminShadowingService.getCatalog();
    if (res.success && res.data) {
      setItems(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormScenarioId(1);
    setFormTitle('');
    setFormLevel('N5');
    setFormSource('');
    setFormRoleA('Người nói A');
    setFormRoleB('Người nói B');
    setFormIsActive(true);
    setFormSentences([
      {
        orderIndex: 1,
        speakerRole: 'A',
        japaneseText: '',
        romajiText: '',
        vietnameseTranslation: '',
        nativeAudioUrl: '/audio/shadowing/sample.mp3',
      },
    ]);
    setFormErrors([]);
    setIsFormOpen(true);
  };

  const handleOpenEdit = async (item: ShadowingDialogueItem) => {
    setEditingId(item.id);
    setIsFormOpen(true);
    setIsSubmitting(true);
    const res = await adminShadowingService.getDetail(item.id);
    if (res.success && res.data) {
      const d = res.data;
      setFormScenarioId(d.scenarioId);
      setFormTitle(d.title);
      setFormLevel(d.jlptLevel);
      setFormSource(d.sourceDescription || '');
      setFormRoleA(d.speakerRoleA_Name);
      setFormRoleB(d.speakerRoleB_Name);
      setFormIsActive(d.isActive);
      setFormSentences(
        d.sentences.map((s) => ({
          orderIndex: s.orderIndex,
          speakerRole: s.speakerRole,
          japaneseText: s.japaneseText,
          romajiText: s.romajiText || '',
          vietnameseTranslation: s.vietnameseTranslation,
          nativeAudioUrl: s.nativeAudioUrl,
        }))
      );
    }
    setIsSubmitting(false);
  };

  const handleAddSentence = () => {
    setFormSentences((prev) => [
      ...prev,
      {
        orderIndex: prev.length + 1,
        speakerRole: prev.length % 2 === 0 ? 'A' : 'B',
        japaneseText: '',
        romajiText: '',
        vietnameseTranslation: '',
        nativeAudioUrl: '/audio/shadowing/sample.mp3',
      },
    ]);
  };

  const handleRemoveSentence = (index: number) => {
    if (formSentences.length <= 1) return;
    setFormSentences((prev) =>
      prev.filter((_, i) => i !== index).map((s, idx) => ({ ...s, orderIndex: idx + 1 }))
    );
  };

  const handleSentenceChange = (index: number, field: keyof CreateShadowingSentencePayload, value: string) => {
    setFormSentences((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);

    if (!formTitle.trim()) {
      setFormErrors(['Tiêu đề bài học không được để trống.']);
      return;
    }
    if (formSentences.length === 0) {
      setFormErrors(['Phải có ít nhất 1 câu đối thoại.']);
      return;
    }

    setIsSubmitting(true);
    if (editingId) {
      // Update
      const res = await adminShadowingService.updateDialogue(editingId, {
        title: formTitle,
        jlptLevel: formLevel,
        sourceDescription: formSource || null,
        speakerRoleA_Name: formRoleA,
        speakerRoleB_Name: formRoleB,
        isActive: formIsActive,
        sentences: formSentences,
      });

      if (res.success) {
        setIsFormOpen(false);
        setMessage('Cập nhật bài học thành công.');
        loadData();
      } else {
        setFormErrors(res.errors || [res.message || 'Lỗi cập nhật.']);
      }
    } else {
      // Create
      const payload: CreateShadowingDialoguePayload = {
        scenarioId: formScenarioId,
        title: formTitle,
        jlptLevel: formLevel,
        sourceDescription: formSource || null,
        speakerRoleA_Name: formRoleA,
        speakerRoleB_Name: formRoleB,
        sentences: formSentences,
      };

      const res = await adminShadowingService.createDialogue(payload);
      if (res.success) {
        setIsFormOpen(false);
        setMessage('Tạo mới bài học thành công.');
        loadData();
      } else {
        setFormErrors(res.errors || [res.message || 'Lỗi tạo bài học.']);
      }
    }
    setIsSubmitting(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    const res = await adminShadowingService.softDelete(deletingId);
    if (res.success) {
      setMessage('Đã vô hiệu hóa (xóa mềm) bài học thành công.');
      setDeletingId(null);
      loadData();
    } else {
      alert(res.message || 'Lỗi khi xóa bài học.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span>🛡️</span> Quản Trị Nội Dung Shadowing
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Quản lý bài hội thoại mẫu, phân vai đối thoại và liên kết âm thanh bản xứ.
          </p>
        </div>
        <Button variant="danger" onClick={handleOpenCreate}>
          + Thêm Bài Hội Thoại Mới
        </Button>
      </div>

      {message && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-lg flex justify-between">
          <span>✓ {message}</span>
          <button onClick={() => setMessage(null)} className="font-bold">×</button>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-[#E6EDF5] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E6EDF5] text-left text-xs">
            <thead className="bg-[#F4F9FE] text-[#71809A] uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Tiêu đề bài học</th>
                <th className="py-3 px-4">Kịch bản (Scenario)</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Vai nói</th>
                <th className="py-3 px-4">Số câu</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6EDF5] text-[#071A44]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#71809A]">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#71809A]">
                    Chưa có bài học Shadowing nào.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#71809A]">#{item.id}</td>
                    <td className="py-3 px-4 font-semibold text-[#071A44]">{item.title}</td>
                    <td className="py-3 px-4 text-[#71809A]">{item.scenarioTitle}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#0878EE] border border-blue-200">
                        {item.jlptLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#71809A]">
                      {item.speakerRoleA_Name} / {item.speakerRoleB_Name}
                    </td>
                    <td className="py-3 px-4 font-bold">{item.totalSentences}</td>
                    <td className="py-3 px-4">
                      {item.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="text-[#0878EE] hover:underline font-semibold"
                      >
                        Sửa
                      </button>
                      {item.isActive && (
                        <button
                          type="button"
                          onClick={() => setDeletingId(item.id)}
                          className="text-[#D92D20] hover:underline font-semibold"
                        >
                          Xóa
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Chỉnh sửa Bài học Shadowing' : 'Thêm mới Bài học Shadowing'}
        maxWidth="xl"
      >
        <form onSubmit={handleSaveForm} className="space-y-4">
          {formErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs space-y-1">
              {formErrors.map((err, i) => (
                <p key={i}>• {err}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                label="Tiêu đề bài học *"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ví dụ: Gọi món tại quán mì Ramen..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#071A44] mb-1.5">
                Trình độ JLPT *
              </label>
              <select
                className="w-full rounded-lg border border-[#E6EDF5] px-3 py-2 text-sm text-[#071A44]"
                value={formLevel}
                onChange={(e) => setFormLevel(e.target.value as any)}
              >
                <option value="N5">N5</option>
                <option value="N4">N4</option>
                <option value="N3">N3</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Tên vai A *"
              value={formRoleA}
              onChange={(e) => setFormRoleA(e.target.value)}
              placeholder="Ví dụ: Khách hàng"
              required
            />
            <Input
              label="Tên vai B *"
              value={formRoleB}
              onChange={(e) => setFormRoleB(e.target.value)}
              placeholder="Ví dụ: Nhân viên phục vụ"
              required
            />
          </div>

          <Input
            label="Mô tả nguồn (Source Description)"
            value={formSource}
            onChange={(e) => setFormSource(e.target.value)}
            placeholder="Ví dụ: DEV SAMPLE — Phỏng vấn Baito..."
          />

          {editingId && (
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#071A44]">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="rounded border-[#E6EDF5]"
              />
              <span>Kích hoạt hiển thị cho Học viên (IsActive)</span>
            </label>
          )}

          {/* Dynamic Sentence Repeater */}
          <div className="pt-3 border-t border-[#E6EDF5] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#071A44] uppercase tracking-wider">
                Danh sách câu đối thoại ({formSentences.length})
              </h4>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddSentence}>
                + Thêm câu thoại
              </Button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {formSentences.map((s, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-[#E6EDF5] bg-gray-50/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0878EE]">Câu #{idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded border border-[#E6EDF5] px-2 py-1 text-xs"
                        value={s.speakerRole}
                        onChange={(e) => handleSentenceChange(idx, 'speakerRole', e.target.value as any)}
                      >
                        <option value="A">Vai A ({formRoleA || 'Vai A'})</option>
                        <option value="B">Vai B ({formRoleB || 'Vai B'})</option>
                      </select>
                      {formSentences.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSentence(idx)}
                          className="text-[#D92D20] hover:underline"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="text"
                    className="w-full rounded border border-[#E6EDF5] px-2.5 py-1.5 text-xs text-[#071A44]"
                    placeholder="Tiếng Nhật (Kanji/Kana) *"
                    value={s.japaneseText}
                    onChange={(e) => handleSentenceChange(idx, 'japaneseText', e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      className="w-full rounded border border-[#E6EDF5] px-2.5 py-1.5 text-xs text-[#071A44]"
                      placeholder="Romaji phiên âm"
                      value={s.romajiText || ''}
                      onChange={(e) => handleSentenceChange(idx, 'romajiText', e.target.value)}
                    />
                    <input
                      type="text"
                      className="w-full rounded border border-[#E6EDF5] px-2.5 py-1.5 text-xs text-[#071A44]"
                      placeholder="Dịch nghĩa tiếng Việt *"
                      value={s.vietnameseTranslation}
                      onChange={(e) => handleSentenceChange(idx, 'vietnameseTranslation', e.target.value)}
                      required
                    />
                  </div>

                  <input
                    type="text"
                    className="w-full rounded border border-[#E6EDF5] px-2.5 py-1.5 text-xs text-[#071A44]"
                    placeholder="Native Audio URL *"
                    value={s.nativeAudioUrl}
                    onChange={(e) => handleSentenceChange(idx, 'nativeAudioUrl', e.target.value)}
                    required
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E6EDF5]">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {editingId ? 'Lưu Thay Đổi' : 'Tạo Bài Học'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Soft Delete Modal */}
      <Modal
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        title="Xác nhận vô hiệu hóa bài học"
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingId(null)}>
              Hủy bỏ
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Xác nhận Vô hiệu hóa
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#071A44]">
          Bạn có chắc chắn muốn vô hiệu hóa bài học này? Bài học sẽ bị ẩn khỏi thư viện của học viên nhưng toàn bộ dữ liệu lịch sử vẫn được bảo toàn.
        </p>
      </Modal>
    </div>
  );
};
