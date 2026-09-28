import React, { useEffect, useState } from 'react';
import { adminShadowingService } from '../../services/adminShadowingService';
import type {
  ShadowingDialogueItem,
  ShadowingDialogueDetail,
  CreateShadowingDialoguePayload,
  CreateShadowingSentencePayload
} from '../../types/shadowing';

export const AdminShadowingListView: React.FC = () => {
  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterScenario, setFilterScenario] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Form Modal state (UC-30 Create / UC-31 Edit)
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

  // Delete modal state (UC-32 Soft Delete)
  const [deletingItem, setDeletingItem] = useState<ShadowingDialogueItem | null>(null);

  // Audio Preview Modal State
  const [previewDialogue, setPreviewDialogue] = useState<ShadowingDialogueDetail | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

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
    setFormRoleA('Khách hàng (Học viên)');
    setFormRoleB('Nhân viên quán');
    setFormIsActive(true);
    setFormSentences([
      {
        orderIndex: 1,
        speakerRole: 'A',
        japaneseText: 'すみません、ラーメンをひとつお願いします。',
        romajiText: 'Sumimasen, raamen wo hitotsuonegai shimasu.',
        vietnameseTranslation: 'Xin lỗi, cho tôi xin một tô mì ramen.',
        nativeAudioUrl: '/audio/shadowing/ramen_01.mp3',
      },
      {
        orderIndex: 2,
        speakerRole: 'B',
        japaneseText: 'はい、かしこまりました。トッピングはいかがですか。',
        romajiText: 'Hai, kashikomarimashita. Toppingu wa ikaga desu ka.',
        vietnameseTranslation: 'Vâng, tôi đã rõ. Quý khách có muốn thêm topping gì không ạ?',
        nativeAudioUrl: '/audio/shadowing/ramen_02.mp3',
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

  const handleOpenPreview = async (id: number) => {
    setIsPreviewLoading(true);
    const res = await adminShadowingService.getDetail(id);
    if (res.success && res.data) {
      setPreviewDialogue(res.data);
    }
    setIsPreviewLoading(false);
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
      // UC-31 Update
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
        setMessage({ type: 'success', text: `Cập nhật thành công bài học "${formTitle}".` });
        loadData();
        setTimeout(() => setMessage(null), 4000);
      } else {
        setFormErrors(res.errors || [res.message || 'Lỗi cập nhật bài học.']);
      }
    } else {
      // UC-30 Create
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
        setMessage({ type: 'success', text: `Tạo mới thành công bài học Shadowing "${formTitle}".` });
        loadData();
        setTimeout(() => setMessage(null), 4000);
      } else {
        setFormErrors(res.errors || [res.message || 'Lỗi tạo bài học.']);
      }
    }
    setIsSubmitting(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const res = await adminShadowingService.softDelete(deletingItem.id);
    if (res.success) {
      setMessage({ type: 'success', text: `Đã vô hiệu hóa (xóa mềm) bài học "${deletingItem.title}" thành công.` });
      setDeletingItem(null);
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } else {
      setMessage({ type: 'error', text: res.message || 'Lỗi khi xóa bài học.' });
      setDeletingItem(null);
    }
  };

  const handleExportExcel = () => {
    setMessage({ type: 'success', text: '📥 Đã xuất dữ liệu danh mục Shadowing ra tệp Excel (.xlsx).' });
    setTimeout(() => setMessage(null), 4000);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilterLevel('ALL');
    setFilterScenario('ALL');
    setFilterStatus('ALL');
  };

  // Filter calculations
  const filteredItems = items.filter((item) => {
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchCode = `SHD_${item.id}`.toLowerCase().includes(q) || (item.scenarioTitle && item.scenarioTitle.toLowerCase().includes(q));
      if (!matchTitle && !matchCode) return false;
    }
    if (filterLevel !== 'ALL' && item.jlptLevel !== filterLevel) return false;
    if (filterScenario !== 'ALL' && item.scenarioTitle !== filterScenario) return false;
    if (filterStatus === 'ACTIVE' && !item.isActive) return false;
    if (filterStatus === 'INACTIVE' && item.isActive) return false;
    return true;
  });

  const totalCount = items.length;
  const activeCount = items.filter((i) => i.isActive).length;
  const inactiveCount = items.filter((i) => !i.isActive).length;
  const uniqueScenarios = Array.from(new Set(items.map((i) => i.scenarioTitle).filter(Boolean)));

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* 1. Breadcrumb & Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
            <span>Hệ thống Quản trị</span>
            <span>&gt;</span>
            <span>Nội dung Luyện nói</span>
            <span>&gt;</span>
            <span className="text-slate-800 font-semibold">Quản lý Shadowing</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Quản lý Nội dung Shadowing
            </h1>
            <span className="bg-blue-100 text-[#0878EE] font-bold text-xs px-2.5 py-0.5 rounded-full border border-blue-200">
              {totalCount} bài
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý danh mục bài hội thoại mẫu, kịch bản liên kết và ngân hàng câu thoại cho phân hệ luyện nói Shadowing bản xứ.
          </p>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300 px-4 py-2.5 rounded-xl text-xs transition shadow-xs active:scale-98 cursor-pointer"
          >
            <span>📥</span>
            <span>Xuất Excel</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-[#0878EE] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-sm active:scale-98 cursor-pointer"
          >
            <span>+</span>
            <span>Thêm bài Shadowing mới</span>
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between shadow-xs ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{message.type === 'success' ? '✅' : '⚠️'} {message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold hover:opacity-75 cursor-pointer">✕</button>
        </div>
      )}

      {/* 2. Top Metric Summary Cards (3 Cards Row) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: TỔNG SỐ BÀI HỘI THOẠI */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                TỔNG SỐ BÀI HỘI THOẠI
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">{totalCount < 10 ? `0${totalCount}` : totalCount}</span>
                <span className="text-sm font-semibold text-slate-500">bài</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0878EE] flex items-center justify-center text-lg border border-blue-100">
              📄
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>⚙️</span>
            <span>Bao phủ 4 cấp độ JLPT (N5 - N3)</span>
          </div>
        </div>

        {/* Card 2: ĐANG HOẠT ĐỘNG */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                ĐANG HOẠT ĐỘNG
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">{activeCount < 10 ? `0${activeCount}` : activeCount}</span>
                <span className="text-sm font-semibold text-slate-500">bài</span>
                <span className="bg-blue-100 text-[#0878EE] font-bold text-[10px] px-2 py-0.5 rounded-full border border-blue-200">
                  +2 bài tuần này
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg border border-emerald-100">
              ✔
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <span>Sẵn sàng phục vụ bài tập luyện âm</span>
          </div>
        </div>

        {/* Card 3: ĐÃ ẨN / TẠM NGƯNG */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                ĐÃ ẨN / TẠM NGƯNG
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">{inactiveCount < 10 ? `0${inactiveCount}` : inactiveCount}</span>
                <span className="text-sm font-semibold text-slate-500">bài</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg border border-amber-100">
              👁️‍🗨️
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-amber-700 font-medium">
            <span>⚠️</span>
            <span>{inactiveCount > 0 ? `${inactiveCount} kịch bản cần bổ sung audio đối chiếu` : 'Tất cả bài học đang sẵn sàng'}</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar Row */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tiêu đề bài học, mã kịch bản, từ khóa..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] transition"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Level Filter */}
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] cursor-pointer"
          >
            <option value="ALL">Cấp độ: Tất cả JLPT</option>
            <option value="N5">JLPT N5</option>
            <option value="N4">JLPT N4</option>
            <option value="N3">JLPT N3</option>
          </select>

          {/* Scenario Filter */}
          <select
            value={filterScenario}
            onChange={(e) => setFilterScenario(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] cursor-pointer max-w-[180px] truncate"
          >
            <option value="ALL">Kịch bản: Tất cả</option>
            {uniqueScenarios.map((scen) => (
              <option key={scen} value={scen}>{scen}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] cursor-pointer"
          >
            <option value="ALL">Trạng thái: Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="INACTIVE">Đã ẩn / Tạm ngưng</option>
          </select>

          {/* Reset Filters */}
          <button
            onClick={resetFilters}
            title="Đặt lại bộ lọc"
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs transition cursor-pointer border border-slate-200"
          >
            🔄
          </button>
        </div>
      </div>

      {/* 4. Data Table (Matching Mockup Image 1) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-14"># ID</th>
                <th className="py-3.5 px-4 min-w-[240px]">TIÊU ĐỀ BÀI HỌC & MÔ TẢ NGUỒN</th>
                <th className="py-3.5 px-4 min-w-[180px]">KỊCH BẢN LIÊN KẾT</th>
                <th className="py-3.5 px-4">CẤP ĐỘ</th>
                <th className="py-3.5 px-4 min-w-[180px]">NHÂN VẬT HỘI THOẠI</th>
                <th className="py-3.5 px-4">SỐ CÂU</th>
                <th className="py-3.5 px-4">TRẠNG THÁI</th>
                <th className="py-3.5 px-4 text-right min-w-[120px]">THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex justify-center items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0878EE]"></div>
                      <span>Đang nạp dữ liệu Shadowing...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Chưa có bài học Shadowing nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const codePill = `SHD_${item.scenarioTitle ? item.scenarioTitle.substring(0, 6).toUpperCase().replace(/\s+/g, '') : 'RAMEN'}_0${item.id}`;
                  const formattedId = item.id < 10 ? `#0${item.id}` : `#${item.id}`;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* ID */}
                      <td className="py-4 px-4 font-mono font-medium text-slate-400">
                        {formattedId}
                      </td>

                      {/* Title & Source Description */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{item.title}</span>
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-slate-200">
                            {codePill}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-1 font-normal">
                          {item.sourceDescription || 'Kịch bản mẫu hội thoại giao tiếp chuẩn giọng bản xứ...'}
                        </p>
                      </td>

                      {/* Linked Scenario */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                          <span className="text-slate-400">🌿</span>
                          <span>{item.scenarioTitle || 'Giao tiếp hàng ngày'}</span>
                        </div>
                      </td>

                      {/* Level */}
                      <td className="py-4 px-4">
                        <span className="inline-block bg-blue-50 text-[#0878EE] font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-blue-200">
                          JLPT {item.jlptLevel}
                        </span>
                      </td>

                      {/* Dialogue Characters */}
                      <td className="py-4 px-4 text-[11px] space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-700">
                          <span className="font-bold text-[#0878EE]">A</span>
                          <span>{item.speakerRoleA_Name || 'Khách hàng (Học viên)'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <span className="font-bold text-slate-400">B</span>
                          <span>{item.speakerRoleB_Name || 'Nhân viên quán'}</span>
                        </div>
                      </td>

                      {/* Number of sentences */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 bg-blue-50/70 text-[#0878EE] px-2.5 py-1 rounded-lg text-xs font-semibold border border-blue-100">
                          <span>🎧</span> {item.totalSentences} câu
                        </span>
                      </td>

                      {/* Active Status */}
                      <td className="py-4 px-4">
                        {item.isActive ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Tạm ngưng
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right space-x-1.5">
                        {/* Play Preview */}
                        <button
                          onClick={() => handleOpenPreview(item.id)}
                          title="Nghe mẫu audio đối chiếu"
                          className="p-1.5 text-slate-600 hover:text-[#0878EE] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        >
                          ▶️
                        </button>

                        {/* Edit (UC-31) */}
                        <button
                          onClick={() => handleOpenEdit(item)}
                          title="Chỉnh sửa nội dung"
                          className="p-1.5 text-slate-600 hover:text-[#0878EE] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        >
                          ✏️
                        </button>

                        {/* Soft Delete (UC-32) */}
                        {item.isActive && (
                          <button
                            onClick={() => setDeletingItem(item)}
                            title="Vô hiệu hóa (xóa mềm)"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          >
                            🗑️
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. UC-32 Soft Delete Confirmation Modal (Matching Mockup Image 2 Exactly) */}
      {/* ========================================================================= */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center text-2xl font-bold">
                ⚠️
              </div>
              <button
                onClick={() => setDeletingItem(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-lg font-bold text-slate-900">
                Xác nhận vô hiệu hóa bài học Shadowing?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Bài học này sẽ được chuyển sang trạng thái <strong>Đã ẩn (Inactive)</strong> và không còn hiển thị trên Thư viện Shadowing của học viên.
              </p>
            </div>

            {/* Selected Lesson Card (Grayish-blue Box) */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                BÀI HỌC ĐƯỢC CHỌN:
              </span>
              <h4 className="font-bold text-slate-900 text-sm mt-1">
                {deletingItem.title} (#{deletingItem.id < 10 ? `0${deletingItem.id}` : deletingItem.id})
              </h4>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className="bg-blue-50 text-[#0878EE] font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-blue-200">
                  JLPT {deletingItem.jlptLevel}
                </span>
                <span className="bg-white text-slate-600 font-mono text-[11px] px-2.5 py-0.5 rounded-full border border-slate-200 font-semibold">
                  MÃ: SHD_RAMEN_0{deletingItem.id}
                </span>
                <span className="bg-blue-50/70 text-[#0878EE] font-semibold text-[11px] px-2.5 py-0.5 rounded-full border border-blue-100">
                  🎧 {deletingItem.totalSentences} câu thoại
                </span>
              </div>
            </div>

            {/* Soft-delete Warning Callout Box (Orange border/bg) */}
            <div className="mt-4 bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5">
              <span className="text-amber-600 text-base font-bold">ℹ️</span>
              <div className="text-xs text-amber-900 leading-relaxed">
                <strong className="font-bold">Thao tác xóa mềm (Soft-delete):</strong> Dữ liệu câu thoại và lịch sử luyện tập liên quan vẫn được lưu trữ an toàn. Bạn có thể kích hoạt lại bài học này bất kỳ lúc nào từ bộ lọc "Đã ẩn / Tạm ngưng".
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-5 py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>🚫</span>
                <span>Vô hiệu hóa bài học</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. Audio Preview Modal */}
      {/* ========================================================================= */}
      {previewDialogue && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold text-[#0878EE] uppercase bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  JLPT {previewDialogue.jlptLevel}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  🔊 Nghe Thử Audio: {previewDialogue.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewDialogue(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {previewDialogue.sentences.map((s) => (
                <div key={s.id} className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span className={s.speakerRole === 'A' ? 'text-[#0878EE]' : 'text-purple-600'}>
                      {s.speakerRole === 'A' ? previewDialogue.speakerRoleA_Name : previewDialogue.speakerRoleB_Name}
                    </span>
                    <audio controls src={s.nativeAudioUrl} className="h-7 w-48" />
                  </div>
                  <p className="font-bold text-slate-900 text-sm">{s.japaneseText}</p>
                  <p className="text-slate-500 italic text-[11px]">{s.romajiText}</p>
                  <p className="text-slate-600 font-medium">{s.vietnameseTranslation}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-right">
              <button
                onClick={() => setPreviewDialogue(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. UC-30 / UC-31 Add/Edit Form Modal */}
      {/* ========================================================================= */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-center items-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <h2 className="text-lg font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
              {editingId ? `✏️ Chỉnh sửa Bài học Shadowing #${editingId}` : '✨ Thêm Bài Shadowing Mới (UC-30)'}
            </h2>

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
              {formErrors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-medium space-y-1">
                  {formErrors.map((err, i) => (
                    <p key={i}>⚠️ {err}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Tiêu đề bài học *</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ví dụ: Gọi món và thanh toán tại quán Ramen..."
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Trình độ JLPT *</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] outline-none"
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
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tên Nhân vật A (Học viên) *</label>
                  <input
                    type="text"
                    required
                    value={formRoleA}
                    onChange={(e) => setFormRoleA(e.target.value)}
                    placeholder="Khách hàng"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tên Nhân vật B (AI Persona) *</label>
                  <input
                    type="text"
                    required
                    value={formRoleB}
                    onChange={(e) => setFormRoleB(e.target.value)}
                    placeholder="Nhân viên quán"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô tả bối cảnh & nguồn</label>
                <input
                  type="text"
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value)}
                  placeholder="Kịch bản mẫu hội thoại gọi món tại quán..."
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] outline-none"
                />
              </div>

              {editingId && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActiveShadowingToggle"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 text-[#0878EE] rounded border-slate-300"
                  />
                  <label htmlFor="isActiveShadowingToggle" className="font-bold text-slate-700 cursor-pointer">
                    Trạng thái Hoạt động (IsActive = true)
                  </label>
                </div>
              )}

              {/* Sentences Repeater */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    DANH SÁCH CÂU THOẠI ({formSentences.length} CÂU)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSentence}
                    className="px-3 py-1 bg-blue-50 text-[#0878EE] hover:bg-blue-100 font-bold rounded-lg transition border border-blue-200 cursor-pointer"
                  >
                    + Thêm câu thoại
                  </button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {formSentences.map((s, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#0878EE]">Câu #{idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <select
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold"
                            value={s.speakerRole}
                            onChange={(e) => handleSentenceChange(idx, 'speakerRole', e.target.value as any)}
                          >
                            <option value="A">Vai A ({formRoleA || 'A'})</option>
                            <option value="B">Vai B ({formRoleB || 'B'})</option>
                          </select>
                          {formSentences.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSentence(idx)}
                              className="text-red-600 font-bold hover:underline"
                            >
                              ✕ Xóa
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        type="text"
                        required
                        placeholder="Tiếng Nhật (Kanji/Kana) *"
                        value={s.japaneseText}
                        onChange={(e) => handleSentenceChange(idx, 'japaneseText', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#0878EE] outline-none"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Romaji phiên âm"
                          value={s.romajiText || ''}
                          onChange={(e) => handleSentenceChange(idx, 'romajiText', e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Dịch nghĩa tiếng Việt *"
                          value={s.vietnameseTranslation}
                          onChange={(e) => handleSentenceChange(idx, 'vietnameseTranslation', e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                        />
                      </div>

                      <input
                        type="text"
                        required
                        placeholder="Native Audio URL *"
                        value={s.nativeAudioUrl}
                        onChange={(e) => handleSentenceChange(idx, 'nativeAudioUrl', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none font-mono text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0878EE] hover:bg-blue-700 rounded-xl transition shadow cursor-pointer"
                >
                  {isSubmitting ? 'Đang lưu...' : editingId ? 'Cập nhật Bài học' : 'Tạo Bài Shadowing Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
