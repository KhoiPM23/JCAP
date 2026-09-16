import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// ============================================================================
// TypeScript Interfaces
// ============================================================================
export interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  price: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCreditPackageDto {
  name: string;
  credits: number;
  price: number;
}

export interface UpdateCreditPackageDto {
  name: string;
  credits: number;
  price: number;
  isActive: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

interface PackageFormData {
  name: string;
  credits: number | '';
  price: number | '';
  isActive: boolean;
}

const initialFormData: PackageFormData = {
  name: '',
  credits: '',
  price: '',
  isActive: true,
};

const API_BASE_URL = '/api/admin/credits/packages';

export const AdminCreditPackagesView: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  // ============================================================================
  // State Management
  // ============================================================================
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal & Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [formData, setFormData] = useState<PackageFormData>(initialFormData);
  const [formValidationErrors, setFormValidationErrors] = useState<string[]>([]);

  // ============================================================================
  // Helper: Get Auth Token
  // ============================================================================
  const getAuthToken = (): string | null => {
    return localStorage.getItem('jcap_token') || localStorage.getItem('token');
  };

  const getAuthHeaders = (): HeadersInit => {
    const token = getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // ============================================================================
  // API Calls
  // ============================================================================

  // 1. GET: Fetch all packages
  const fetchPackages = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Bạn không có quyền truy cập chức năng này (Yêu cầu quyền Admin).');
        }
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Lỗi tải danh sách (HTTP ${response.status})`);
      }

      const result = await response.json();
      // Handle both wrapped ApiResponse and raw array
      const data: CreditPackage[] = result.data !== undefined ? result.data : result;
      setPackages(data || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // 2. POST: Create a new credit package
  const createPackageApi = async (payload: CreateCreditPackageDto): Promise<CreditPackage> => {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const result: ApiResponse<CreditPackage> = await response.json().catch(() => null as any);

    if (!response.ok) {
      const errMsg =
        result?.errors?.join(', ') ||
        result?.message ||
        `Tạo gói credit thất bại (HTTP ${response.status})`;
      throw new Error(errMsg);
    }

    return result.data ?? (result as unknown as CreditPackage);
  };

  // 3. PUT: Update an existing credit package
  const updatePackageApi = async (id: number, payload: UpdateCreditPackageDto): Promise<CreditPackage> => {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const result: ApiResponse<CreditPackage> = await response.json().catch(() => null as any);

    if (!response.ok) {
      const errMsg =
        result?.errors?.join(', ') ||
        result?.message ||
        `Cập nhật thất bại (HTTP ${response.status})`;
      throw new Error(errMsg);
    }

    return result.data ?? (result as unknown as CreditPackage);
  };

  // 4. DELETE: Soft delete a credit package (sets IsActive = false)
  const deletePackageApi = async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = result?.message || `Xóa gói credit thất bại (HTTP ${response.status})`;
      throw new Error(errMsg);
    }
  };

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setSelectedPackage(null);
    setFormData(initialFormData);
    setFormValidationErrors([]);
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (pkg: CreditPackage) => {
    setSelectedPackage(pkg);
    setFormData({
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price,
      isActive: pkg.isActive,
    });
    setFormValidationErrors([]);
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPackage(null);
    setFormData(initialFormData);
    setFormValidationErrors([]);
  };

  // Form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData((prev) => ({
        ...prev,
        [name]: value === '' ? '' : Number(value),
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Submit form (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationErrors([]);

    // Client-side validation
    const errors: string[] = [];
    if (!formData.name.trim()) {
      errors.push('Tên gói credit không được để trống.');
    }
    if (formData.credits === '' || Number(formData.credits) <= 0) {
      errors.push('Số credits phải là số nguyên lớn hơn 0.');
    }
    if (formData.price === '' || Number(formData.price) < 0) {
      errors.push('Giá tiền không được nhỏ hơn 0.');
    }

    if (errors.length > 0) {
      setFormValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (selectedPackage) {
        // UPDATE
        const updatePayload: UpdateCreditPackageDto = {
          name: formData.name.trim(),
          credits: Number(formData.credits),
          price: Number(formData.price),
          isActive: formData.isActive,
        };
        await updatePackageApi(selectedPackage.id, updatePayload);
        setSuccessMessage(`Cập nhật gói "${updatePayload.name}" thành công.`);
      } else {
        // CREATE
        const createPayload: CreateCreditPackageDto = {
          name: formData.name.trim(),
          credits: Number(formData.credits),
          price: Number(formData.price),
        };
        await createPackageApi(createPayload);
        setSuccessMessage(`Tạo mới gói "${createPayload.name}" thành công.`);
      }

      handleCloseModal();
      await fetchPackages();

      // Clear success notification after 4s
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormValidationErrors([err.message || 'Đã có lỗi xảy ra khi lưu.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Soft Delete with window.confirm
  const handleDelete = async (pkg: CreditPackage) => {
    const isConfirmed = window.confirm('Are you sure you want to deactivate this package?');
    if (!isConfirmed) return;

    try {
      await deletePackageApi(pkg.id);
      setSuccessMessage(`Đã vô hiệu hóa gói "${pkg.name}" thành công.`);
      await fetchPackages();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể vô hiệu hóa gói credit.');
    }
  };

  // Helper formatting currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="p-6 max-w-7xl mx-auto font-sans text-slate-800">
      {/* Top Admin Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-900 text-white px-4 py-3 rounded-xl mb-6 shadow-sm text-xs gap-3">
        <div className="flex items-center space-x-2">
          <span className="bg-red-600 text-white font-bold px-2 py-0.5 rounded text-[11px] uppercase tracking-wider">
            Admin Portal
          </span>
          <span className="text-slate-300">
            Xin chào, <strong>{user?.fullName || 'Quản trị viên'}</strong> ({user?.email || 'admin'})
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => navigate('/scenarios')}
            className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition flex items-center"
          >
            &larr; Xem giao diện Học viên
          </button>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-900/50 hover:bg-red-950/40 transition font-medium"
          >
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Quản Lý Gói Credit (Admin)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý danh sách các gói nạp điểm luyện nói tiếng Nhật trong hệ thống JCAP.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          <svg className="w-5 h-5 mr-1.5 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Thêm Gói Mới
        </button>
      </div>

      {/* Alert Messages */}
      {successMessage && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-4">
            &times;
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">
            &times;
          </button>
        </div>
      )}

      {/* Main Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-500">
            <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-red-600 rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Đang tải danh sách gói credit...</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-base font-medium text-slate-600">Chưa có gói credit nào trong hệ thống</p>
            <p className="text-sm mt-1">Bấm "Thêm Gói Mới" để tạo gói đầu tiên.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-xs tracking-wider">
                  <th className="py-3.5 px-4 text-center w-16">ID</th>
                  <th className="py-3.5 px-4">Tên Gói</th>
                  <th className="py-3.5 px-4 text-right">Số Credits</th>
                  <th className="py-3.5 px-4 text-right">Giá Tiền (VND)</th>
                  <th className="py-3.5 px-4 text-center w-36">Trạng Thái</th>
                  <th className="py-3.5 px-4 text-center w-36">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {packages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-50 transition-colors">
                    {/* ID */}
                    <td className="py-3.5 px-4 text-center font-mono text-slate-500 text-xs">
                      #{pkg.id}
                    </td>

                    {/* Name */}
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      {pkg.name}
                    </td>

                    {/* Credits */}
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                      {pkg.credits.toLocaleString()}
                    </td>

                    {/* Price */}
                    <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                      {formatCurrency(pkg.price)}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {pkg.isActive ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-slate-400"></span>
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(pkg)}
                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(pkg)}
                        disabled={!pkg.isActive}
                        className={`inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded border transition ${
                          pkg.isActive
                            ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300'
                            : 'text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed'
                        }`}
                        title={pkg.isActive ? 'Vô hiệu hóa gói' : 'Gói đã vô hiệu hóa'}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================================
          Modal Form (Reusable for Create & Update)
          ============================================================================ */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">
                {selectedPackage ? 'Chỉnh Sửa Gói Credit' : 'Thêm Gói Credit Mới'}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none focus:outline-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4">
                {/* Form Errors */}
                {formValidationErrors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs space-y-1">
                    {formValidationErrors.map((err, idx) => (
                      <div key={idx} className="flex items-center">
                        <span className="mr-1.5">&bull;</span>
                        {err}
                      </div>
                    ))}
                  </div>
                )}

                {/* Package Name */}
                <div>
                  <label htmlFor="name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Tên Gói Credit <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    name="name"
                    placeholder="Ví dụ: Gói Cơ Bản, Gói Nâng Cao..."
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"
                  />
                </div>

                {/* Credits */}
                <div>
                  <label htmlFor="credits" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Số Credits <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="credits"
                    type="number"
                    name="credits"
                    placeholder="Ví dụ: 100"
                    value={formData.credits}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                    min={1}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"
                  />
                </div>

                {/* Price */}
                <div>
                  <label htmlFor="price" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Giá Tiền (VND) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="price"
                    type="number"
                    name="price"
                    placeholder="Ví dụ: 50000"
                    value={formData.price}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                    min={0}
                    step={1000}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"
                  />
                </div>

                {/* IsActive Checkbox - ONLY shown when editing */}
                {selectedPackage !== null && (
                  <div className="pt-2 border-t border-slate-100">
                    <label className="flex items-center space-x-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        name="isActive"
                        checked={formData.isActive}
                        onChange={handleInputChange}
                        disabled={isSubmitting}
                        className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 transition"
                      />
                      <span className="text-sm font-medium text-slate-800">
                        Kích hoạt gói credit (Active)
                      </span>
                    </label>
                    <p className="text-xs text-slate-500 ml-7 mt-0.5">
                      Bỏ chọn để tạm dừng hoặc ẩn gói khỏi danh sách người dùng mua.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 focus:outline-none transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-4 h-4 mr-2 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Đang lưu...
                    </>
                  ) : selectedPackage ? (
                    'Cập Nhật'
                  ) : (
                    'Tạo Gói'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCreditPackagesView;

