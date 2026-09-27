import React, { useState, useEffect } from 'react';
import { scenarioService } from '../../services/scenarioService';
import type { ScenarioListItem } from '../../types/scenarioDetails';

interface ScenarioFormData {
  title: string;
  description: string;
  scenarioCode: string;
  thumbnail: string;
  isActive: boolean;
  n5Title: string;
  n5Persona: string;
  n4Title: string;
  n4Persona: string;
  n3Title: string;
  n3Persona: string;
}

const initialFormData: ScenarioFormData = {
  title: '',
  description: '',
  scenarioCode: '',
  thumbnail: '',
  isActive: true,
  n5Title: 'Tình huống N5 Cơ bản',
  n5Persona: 'Nhân viên phục vụ / Người hướng dẫn',
  n4Title: 'Tình huống N4 Trung cấp',
  n4Persona: 'Nhân viên cửa hàng / Đồng nghiệp',
  n3Title: 'Tình huống N3 Thượng cấp',
  n3Persona: 'Quản lý / Người phỏng vấn',
};

export const AdminScenarioListView: React.FC = () => {
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingScenario, setEditingScenario] = useState<ScenarioListItem | null>(null);
  const [formData, setFormData] = useState<ScenarioFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchScenarios = async () => {
    setLoading(true);
    setError(null);
    const res = await scenarioService.getAdminScenarios();
    if (res.success && res.data) {
      setScenarios(res.data);
    } else {
      setError(res.message || 'Không thể nạp danh sách kịch bản quản trị.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchScenarios();
  }, []);

  const handleOpenAddModal = () => {
    setEditingScenario(null);
    setFormData(initialFormData);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: ScenarioListItem) => {
    setEditingScenario(item);
    setFormData({
      title: item.title,
      description: item.description,
      scenarioCode: item.scenarioCode || '',
      thumbnail: item.thumbnail || '',
      isActive: item.isActive,
      n5Title: `${item.title} (N5)`,
      n5Persona: 'Phục vụ quán / Hướng dẫn viên',
      n4Title: `${item.title} (N4)`,
      n4Persona: 'Trưởng ca / Quản lý',
      n3Title: `${item.title} (N3)`,
      n3Persona: 'Giám đốc / Khách hàng VIP',
    });
    setIsModalOpen(true);
  };

  const handleDeleteScenario = async (id: number, title: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn vô hiệu hóa (xóa mềm) kịch bản "${title}"?`)) {
      return;
    }

    const res = await scenarioService.deleteScenario(id);
    if (res.success) {
      setSuccessMsg(`Đã vô hiệu hóa kịch bản "${title}" thành công.`);
      fetchScenarios();
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setError(res.message || 'Lỗi khi xóa kịch bản.');
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Vui lòng điền đầy đủ Tiêu đề và Mô tả kịch bản.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const levelConfigurations = [
      {
        jlptLevel: 'N5',
        title: formData.n5Title.trim(),
        description: `Cấu hình N5 cho ${formData.title}`,
        aiPersona: formData.n5Persona.trim(),
        creditCost: 5,
        status: 'Published',
      },
      {
        jlptLevel: 'N4',
        title: formData.n4Title.trim(),
        description: `Cấu hình N4 cho ${formData.title}`,
        aiPersona: formData.n4Persona.trim(),
        creditCost: 5,
        status: 'Published',
      },
    ];

    if (editingScenario) {
      // UC-23 Update
      const res = await scenarioService.updateScenario(editingScenario.id, {
        title: formData.title.trim(),
        description: formData.description.trim(),
        scenarioCode: formData.scenarioCode.trim(),
        thumbnail: formData.thumbnail.trim(),
        isActive: formData.isActive,
        levelConfigurations,
      });

      if (res.success) {
        setSuccessMsg(`Cập nhật kịch bản "${formData.title}" thành công!`);
        setIsModalOpen(false);
        fetchScenarios();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message || 'Lỗi cập nhật kịch bản.');
      }
    } else {
      // UC-22 Add
      const res = await scenarioService.createScenario({
        title: formData.title.trim(),
        description: formData.description.trim(),
        scenarioCode: formData.scenarioCode.trim(),
        thumbnail: formData.thumbnail.trim(),
        isActive: formData.isActive,
        levelConfigurations,
      });

      if (res.success) {
        setSuccessMsg(`Thêm kịch bản mới "${formData.title}" thành công!`);
        setIsModalOpen(false);
        fetchScenarios();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message || 'Lỗi khi tạo mới kịch bản.');
      }
    }

    setIsSubmitting(false);
  };

  const filteredScenarios = scenarios.filter((item) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (item.scenarioCode && item.scenarioCode.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-[#071A44]">🎭 Quản lý Kịch bản Đàm thoại (Admin Catalog)</h1>
          <p className="text-slate-500 text-sm mt-1">
            Quản trị danh mục kịch bản roleplay, cấu hình trình độ JLPT (UC-16, UC-22, UC-23, UC-24).
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-[#0878EE] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition shadow-sm active:scale-98"
        >
          <span>✨</span> Thêm Kịch bản Mới
        </button>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm mb-6 flex items-center gap-2">
          <span>✅</span> {successMsg}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-6 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Tìm kiếm kịch bản theo mã, tiêu đề hoặc nội dung..."
          className="w-full max-w-md px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE] transition"
        />
      </div>

      {/* Content Table */}
      {loading ? (
        <div className="flex justify-center items-center py-20 bg-white rounded-2xl border border-slate-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0878EE]"></div>
          <span className="ml-3 text-sm text-slate-600 font-medium">Đang tải danh sách kịch bản...</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-4 px-6">ID & Mã</th>
                  <th className="py-4 px-6">Tiêu đề & Mô tả</th>
                  <th className="py-4 px-6">Trình độ JLPT</th>
                  <th className="py-4 px-6">Trạng thái</th>
                  <th className="py-4 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredScenarios.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Không tìm thấy kịch bản nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredScenarios.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-mono text-xs text-slate-500">
                        <span className="font-bold text-[#071A44]">#{item.id}</span>
                        {item.scenarioCode && (
                          <span className="block text-slate-400 mt-0.5">{item.scenarioCode}</span>
                        )}
                      </td>
                      <td className="py-4 px-6 max-w-md">
                        <div className="font-bold text-[#071A44]">{item.title}</div>
                        <div className="text-xs text-slate-500 line-clamp-2 mt-1">{item.description}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex gap-1 flex-wrap">
                          {item.supportedJLPTLevels?.map((lvl) => (
                            <span
                              key={lvl}
                              className="px-2 py-0.5 bg-blue-50 text-[#0878EE] border border-blue-200 rounded-full text-[11px] font-bold"
                            >
                              {lvl}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {item.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Vô hiệu hóa
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        >
                          ✏️ Sửa (UC-23)
                        </button>
                        {item.isActive && (
                          <button
                            onClick={() => handleDeleteScenario(item.id, item.title)}
                            className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                          >
                            🗑️ Soft Delete (UC-24)
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
      )}

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-center items-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-[#071A44] mb-4">
              {editingScenario ? `✏️ Chỉnh sửa Kịch bản #${editingScenario.id}` : '✨ Thêm Kịch bản Mới (UC-22)'}
            </h2>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mã kịch bản (ScenarioCode)</label>
                <input
                  type="text"
                  value={formData.scenarioCode}
                  onChange={(e) => setFormData({ ...formData, scenarioCode: e.target.value })}
                  placeholder="Ví dụ: SCN_RAMEN_01"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[#0878EE] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tiêu đề kịch bản <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ví dụ: Gọi món Ramen tại quán Nhật"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0878EE] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô tả chi tiết <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mô tả bối cảnh và mục tiêu giao tiếp..."
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0878EE] outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vai AI N5 Persona</label>
                  <input
                    type="text"
                    value={formData.n5Persona}
                    onChange={(e) => setFormData({ ...formData, n5Persona: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0878EE] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vai AI N4 Persona</label>
                  <input
                    type="text"
                    value={formData.n4Persona}
                    onChange={(e) => setFormData({ ...formData, n4Persona: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0878EE] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-[#0878EE] rounded border-slate-300"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Kích hoạt kịch bản (IsActive = true)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0878EE] hover:bg-blue-700 rounded-xl transition shadow"
                >
                  {isSubmitting ? 'Đang lưu...' : editingScenario ? 'Cập nhật Kịch bản' : 'Tạo Kịch bản Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
