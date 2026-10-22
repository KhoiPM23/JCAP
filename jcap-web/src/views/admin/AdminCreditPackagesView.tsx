import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscriptionPlanService,
  type SubscriptionPlanItem,
} from '../../services/subscriptionPlanService';

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

interface MonthlyPlanFormData {
  id?: string;
  name: string;
  subtitle: string;
  creditsAmount: number | '';
  fiveHourQuota: number | '';
  price: number | '';
  billingCycle: string;
  featuresText: string;
  isActive: boolean;
}

const initialMonthlyFormData: MonthlyPlanFormData = {
  name: '',
  subtitle: '',
  creditsAmount: 1000,
  fiveHourQuota: 50,
  price: 199000,
  billingCycle: '30 ngày (Gia hạn hàng tháng)',
  featuresText:
    'Không giới hạn số lượt mở kịch bản hội thoại\nHạn mức 1.000 credits AI mỗi tuần\nHạn mức 50 credits AI hồi phục sau mỗi 5 tiếng\nTự động kết nối trừ Credit nạp thêm khi vượt trần\nĐánh giá phát âm & Pitch Accent chi tiết bằng Azure Speech AI',
  isActive: true,
};

const API_BASE_URL = '/api/admin/credits/packages';

export const AdminCreditPackagesView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ============================================================================
  // 1. Category Mode: MẶC ĐỊNH AUTO HIỆN BÊN GÓI THÁNG KHI VÀO TRANG
  // 'subscription' (Gói Hội Viên Tháng) | 'one-time' (Gói Nạp Credit Lẻ)
  // ============================================================================
  const [mainCategory, setMainCategory] = useState<'subscription' | 'one-time'>('subscription');

  // ============================================================================
  // 2. Editor Mode: Chuyển sang trang soạn thảo riêng như bên Scenario
  // 'none' | 'create-credit' | 'edit-credit' | 'create-monthly' | 'edit-monthly'
  // ============================================================================
  const [editorMode, setEditorMode] = useState<
    'none' | 'create-credit' | 'edit-credit' | 'create-monthly' | 'edit-monthly'
  >('none');

  // Modal xác nhận hủy bỏ / rời khỏi trang khi chưa lưu (Hình 5 demo)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);

  // ============================================================================
  // 3. Notification with Auto Fade-out (5s start fade, 5.5s clear - Chuẩn Add Scenario)
  // ============================================================================
  const [errorMessage, setErrorMessageState] = useState<string | null>(null);
  const [successMessage, setSuccessMessageState] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setErrorMessage = useCallback((msg: string | null) => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

    if (!msg) {
      setErrorMessageState(null);
      setIsFadingOut(false);
      return;
    }

    setSuccessMessageState(null);
    setErrorMessageState(msg);
    setIsFadingOut(false);

    fadeTimerRef.current = setTimeout(() => {
      setIsFadingOut(true);
    }, 5000);

    clearTimerRef.current = setTimeout(() => {
      setErrorMessageState(null);
      setIsFadingOut(false);
    }, 5500);
  }, []);

  const setSuccessMessage = useCallback((msg: string | null) => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

    if (!msg) {
      setSuccessMessageState(null);
      setIsFadingOut(false);
      return;
    }

    setErrorMessageState(null);
    setSuccessMessageState(msg);
    setIsFadingOut(false);

    fadeTimerRef.current = setTimeout(() => {
      setIsFadingOut(true);
    }, 5000);

    clearTimerRef.current = setTimeout(() => {
      setSuccessMessageState(null);
      setIsFadingOut(false);
    }, 5500);
  }, []);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  // ============================================================================
  // State: Gói Nạp Credit (Một lần - API)
  // ============================================================================
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [creditActiveTab, setCreditActiveTab] = useState<'active' | 'inactive'>('active');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State: Gói Credit
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [formData, setFormData] = useState<PackageFormData>(initialFormData);
  const [formValidationErrors, setFormValidationErrors] = useState<string[]>([]);

  // Computed tab package lists
  const activePackages = useMemo(() => packages.filter((p) => p.isActive), [packages]);
  const inactivePackages = useMemo(() => packages.filter((p) => !p.isActive), [packages]);
  const currentDisplayPackages = creditActiveTab === 'active' ? activePackages : inactivePackages;

  // ============================================================================
  // State: Gói Hội Viên Tháng (Subscription - Đồng bộ Service)
  // ============================================================================
  const [monthlyPlans, setMonthlyPlans] = useState<SubscriptionPlanItem[]>(() =>
    subscriptionPlanService.getPlans()
  );
  const [monthlyActiveTab, setMonthlyActiveTab] = useState<'active' | 'inactive'>('active');

  // Form State: Gói Tháng
  const [editingMonthlyPlan, setEditingMonthlyPlan] = useState<SubscriptionPlanItem | null>(null);
  const [monthlyFormData, setMonthlyFormData] = useState<MonthlyPlanFormData>(initialMonthlyFormData);
  const [monthlyValidationErrors, setMonthlyValidationErrors] = useState<string[]>([]);

  // Tự động gán danh hiệu cho Gói Tháng (Hệ thống tự tính toán, không cần ô nhập tay như Hình 2)
  const processedMonthlyPlans = useMemo(() => {
    if (monthlyPlans.length === 0) return [];

    let lowestUnitCost = Infinity;
    let bestValueId: string | null = null;

    monthlyPlans.forEach((plan) => {
      if (plan.creditsAmount > 0) {
        const cost = plan.price / plan.creditsAmount;
        if (cost < lowestUnitCost) {
          lowestUnitCost = cost;
          bestValueId = plan.id;
        }
      }
    });

    return monthlyPlans.map((plan) => {
      const isBestValue = plan.id === bestValueId && monthlyPlans.length > 1;
      const isPopular = !isBestValue && (plan.id === 'plan-pro' || plan.price <= 200000);
      return {
        ...plan,
        isBestValue,
        isPopular,
        badgeText: isBestValue ? 'TIẾT KIỆM NHẤT' : isPopular ? 'PHỔ BIẾN NHẤT' : undefined,
      };
    });
  }, [monthlyPlans]);

  const activeMonthlyPlans = useMemo(
    () => processedMonthlyPlans.filter((p) => p.isActive),
    [processedMonthlyPlans]
  );
  const inactiveMonthlyPlans = useMemo(
    () => processedMonthlyPlans.filter((p) => !p.isActive),
    [processedMonthlyPlans]
  );
  const currentDisplayMonthlyPlans =
    monthlyActiveTab === 'active' ? activeMonthlyPlans : inactiveMonthlyPlans;

  const reloadMonthlyPlans = useCallback(() => {
    setMonthlyPlans(subscriptionPlanService.getPlans());
  }, []);

  useEffect(() => {
    window.addEventListener('jcap_subscription_plans_updated', reloadMonthlyPlans);
    return () => window.removeEventListener('jcap_subscription_plans_updated', reloadMonthlyPlans);
  }, [reloadMonthlyPlans]);

  // ============================================================================
  // Helper: Auth Token & Headers
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
  // API Calls: Gói Nạp Credit
  // ============================================================================
  const fetchPackages = useCallback(async () => {
    setIsLoading(true);
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
      const data: CreditPackage[] = result.data !== undefined ? result.data : result;
      setPackages(data || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }, [setErrorMessage]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

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

  const updatePackageApi = async (
    id: number,
    payload: UpdateCreditPackageDto
  ): Promise<CreditPackage> => {
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
        `Cập nhật gói credit thất bại (HTTP ${response.status})`;
      throw new Error(errMsg);
    }

    return result.data ?? (result as unknown as CreditPackage);
  };

  const deletePackageApi = async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const result: ApiResponse<null> = await response.json().catch(() => null as any);

    if (!response.ok) {
      const errMsg =
        result?.errors?.join(', ') ||
        result?.message ||
        `Ẩn gói credit thất bại (HTTP ${response.status})`;
      throw new Error(errMsg);
    }
  };

  // ============================================================================
  // Handlers: Mở trang soạn thảo (Giống bên Scenario)
  // ============================================================================
  const handleOpenCreateCreditEditor = () => {
    setSelectedPackage(null);
    setFormData(initialFormData);
    setFormValidationErrors([]);
    setEditorMode('create-credit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenEditCreditEditor = (pkg: CreditPackage) => {
    setSelectedPackage(pkg);
    setFormData({
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price,
      isActive: pkg.isActive,
    });
    setFormValidationErrors([]);
    setEditorMode('edit-credit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCreateMonthlyEditor = () => {
    setEditingMonthlyPlan(null);
    setMonthlyFormData(initialMonthlyFormData);
    setMonthlyValidationErrors([]);
    setEditorMode('create-monthly');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenEditMonthlyEditor = (plan: SubscriptionPlanItem) => {
    setEditingMonthlyPlan(plan);
    setMonthlyFormData({
      id: plan.id,
      name: plan.name,
      subtitle: plan.subtitle || '',
      creditsAmount: plan.creditsAmount,
      fiveHourQuota: plan.fiveHourQuota || 50,
      price: plan.price,
      billingCycle: plan.billingCycle || '30 ngày (Gia hạn hàng tháng)',
      featuresText: plan.features ? plan.features.join('\n') : '',
      isActive: plan.isActive,
    });
    setMonthlyValidationErrors([]);
    setEditorMode('edit-monthly');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Xác nhận thoát trang soạn thảo (Trigger modal Hình 5)
  const handleRequestExitEditor = () => {
    setIsCancelModalOpen(true);
  };

  const handleConfirmExit = () => {
    setIsCancelModalOpen(false);
    setEditorMode('none');
    setSelectedPackage(null);
    setEditingMonthlyPlan(null);
    setFormValidationErrors([]);
    setMonthlyValidationErrors([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDismissCancel = () => {
    setIsCancelModalOpen(false);
  };

  // ============================================================================
  // Validation & Submit Form
  // ============================================================================
  const validateOneTimeForm = (): boolean => {
    const errors: string[] = [];
    if (!formData.name.trim()) errors.push('Tên gói không được để trống.');
    if (formData.credits === '' || Number(formData.credits) <= 0) {
      errors.push('Số credits phải lớn hơn 0.');
    }
    if (formData.price === '' || Number(formData.price) <= 0) {
      errors.push('Giá tiền phải lớn hơn 0 VND.');
    }
    setFormValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmitOneTimeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateOneTimeForm()) return;

    setIsSubmitting(true);
    try {
      if (selectedPackage) {
        await updatePackageApi(selectedPackage.id, {
          name: formData.name.trim(),
          credits: Number(formData.credits),
          price: Number(formData.price),
          isActive: formData.isActive,
        });
        setSuccessMessage(`Cập nhật gói "${formData.name.trim()}" thành công!`);
      } else {
        await createPackageApi({
          name: formData.name.trim(),
          credits: Number(formData.credits),
          price: Number(formData.price),
        });
        setSuccessMessage(`Tạo mới gói "${formData.name.trim()}" thành công!`);
      }
      setEditorMode('none');
      await fetchPackages();
    } catch (err: any) {
      setErrorMessage(err.message || 'Có lỗi xảy ra khi lưu gói credit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHideOneTimePackage = async (pkg: CreditPackage) => {
    if (!window.confirm(`Bạn có chắc chắn muốn ẩn gói "${pkg.name}" khỏi học viên không?`)) {
      return;
    }
    try {
      await deletePackageApi(pkg.id);
      setSuccessMessage(`Đã ẩn gói "${pkg.name}" thành công.`);
      await fetchPackages();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể ẩn gói credit.');
    }
  };

  const handleRestoreOneTimePackage = async (pkg: CreditPackage) => {
    try {
      await updatePackageApi(pkg.id, {
        name: pkg.name,
        credits: pkg.credits,
        price: pkg.price,
        isActive: true,
      });
      setSuccessMessage(`Đã khôi phục gói "${pkg.name}" hoạt động trở lại thành công.`);
      await fetchPackages();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể khôi phục gói credit.');
    }
  };

  const validateMonthlyForm = (): boolean => {
    const errors: string[] = [];
    if (!monthlyFormData.name.trim()) errors.push('Tên gói tháng không được để trống.');
    if (monthlyFormData.creditsAmount === '' || Number(monthlyFormData.creditsAmount) <= 0) {
      errors.push('Hạn mức tuần (credits) phải lớn hơn 0.');
    }
    if (monthlyFormData.fiveHourQuota === '' || Number(monthlyFormData.fiveHourQuota) <= 0) {
      errors.push('Hạn mức hồi phục 5 giờ (credits) phải lớn hơn 0.');
    }
    if (monthlyFormData.price === '' || Number(monthlyFormData.price) <= 0) {
      errors.push('Giá gói tháng phải lớn hơn 0 VND.');
    }
    setMonthlyValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmitMonthlyForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateMonthlyForm()) return;

    const features = monthlyFormData.featuresText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    try {
      if (editingMonthlyPlan) {
        subscriptionPlanService.updatePlan(editingMonthlyPlan.id, {
          name: monthlyFormData.name.trim(),
          subtitle: monthlyFormData.subtitle.trim(),
          creditsAmount: Number(monthlyFormData.creditsAmount),
          fiveHourQuota: Number(monthlyFormData.fiveHourQuota),
          price: Number(monthlyFormData.price),
          billingCycle: monthlyFormData.billingCycle.trim(),
          features,
          isActive: monthlyFormData.isActive,
        });
        setSuccessMessage(`Đã cập nhật cấu hình "${monthlyFormData.name.trim()}" thành công!`);
      } else {
        subscriptionPlanService.addPlan({
          name: monthlyFormData.name.trim(),
          subtitle: monthlyFormData.subtitle.trim(),
          creditsAmount: Number(monthlyFormData.creditsAmount),
          fiveHourQuota: Number(monthlyFormData.fiveHourQuota),
          creditsLabel: 'Credits / tuần',
          price: Number(monthlyFormData.price),
          billingCycle: monthlyFormData.billingCycle.trim() || '30 ngày (Gia hạn hàng tháng)',
          features,
          isActive: monthlyFormData.isActive,
        });
        setSuccessMessage(`Đã tạo mới gói hội viên "${monthlyFormData.name.trim()}" thành công!`);
      }
      setEditorMode('none');
      reloadMonthlyPlans();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi lưu cấu hình gói tháng.');
    }
  };

  const handleToggleMonthlyStatus = (plan: SubscriptionPlanItem) => {
    try {
      const updated = subscriptionPlanService.togglePlanStatus(plan.id);
      setSuccessMessage(
        updated.isActive
          ? `Đã kích hoạt hiển thị gói "${plan.name}" cho học viên!`
          : `Đã tạm ẩn gói "${plan.name}" khỏi học viên!`
      );
      reloadMonthlyPlans();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể thay đổi trạng thái gói tháng.');
    }
  };

  const handleDeleteMonthlyPlan = (plan: SubscriptionPlanItem) => {
    if (!window.confirm(`Bạn có chắc muốn xóa vĩnh viễn gói tháng "${plan.name}" không?`)) {
      return;
    }
    try {
      subscriptionPlanService.deletePlan(plan.id);
      setSuccessMessage(`Đã xóa gói "${plan.name}" thành công.`);
      reloadMonthlyPlans();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể xóa gói tháng.');
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  // ============================================================================
  // RENDER: GIAO DIỆN SOẠN THẢO RIÊNG (GIỐNG BÊN SCENARIO - BỐ TRÍ CÂN XỨNG, KHÔNG LỆCH)
  // ============================================================================
  if (editorMode !== 'none') {
    const isEditingCredit = editorMode === 'edit-credit';
    const isCreatingCredit = editorMode === 'create-credit';
    const isCreditEditor = isEditingCredit || isCreatingCredit;

    const isEditingMonthly = editorMode === 'edit-monthly';
    const isMonthlyEditor = !isCreditEditor;

    return (
      <div className="p-6 max-w-4xl mx-auto font-sans text-slate-800">
        {/* Breadcrumb chuẩn hóa: Hệ thống & Người dùng > Quản lý Gói và Credit > Thao tác */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>Hệ thống &amp; Người dùng</span>
            <span>&gt;</span>
            <button
              type="button"
              onClick={handleRequestExitEditor}
              className="hover:text-[#0878EE] transition cursor-pointer"
            >
              Quản lý Gói và Credit
            </button>
            <span>&gt;</span>
            <span className="text-slate-800 font-semibold">
              {isCreatingCredit && 'Thêm Gói Nạp Lẻ Mới'}
              {isEditingCredit && `Chỉnh Sửa Gói Nạp: ${selectedPackage?.name}`}
              {editorMode === 'create-monthly' && 'Thêm Gói Hội Viên Tháng Mới'}
              {isEditingMonthly && `Chỉnh Sửa Gói Tháng: ${editingMonthlyPlan?.name}`}
            </span>
          </div>

          <button
            type="button"
            onClick={handleRequestExitEditor}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition cursor-pointer"
          >
            <span>←</span>
            <span>Quay lại danh sách</span>
          </button>
        </div>

        {/* Tiêu đề trang soạn thảo */}
        <div className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isCreatingCredit && 'Thêm Gói Nạp Credit Mới'}
            {isEditingCredit && `Chỉnh Sửa Gói Nạp Credit #${selectedPackage?.id}`}
            {editorMode === 'create-monthly' && 'Thêm Gói Hội Viên Tháng Mới'}
            {isEditingMonthly && `Chỉnh Sửa Cấu Hình Gói: ${editingMonthlyPlan?.name}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isCreditEditor
              ? 'Thiết lập số lượng credits và giá bán đơn lẻ cho học viên mua bổ sung.'
              : 'Cấu hình giá tháng, hạn mức Dual-Window Rolling Quota (tuần & 5 giờ) và quyền lợi của học viên.'}
          </p>
        </div>

        {/* Validation Errors */}
        {(formValidationErrors.length > 0 || monthlyValidationErrors.length > 0) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs sm:text-sm text-red-700 space-y-1 shadow-xs">
            {(isCreditEditor ? formValidationErrors : monthlyValidationErrors).map((err, i) => (
              <div key={i}>⚠️ {err}</div>
            ))}
          </div>
        )}

        {/* ==================================================================== */}
        {/* FORM GÓI NẠP CREDIT (Cân xứng, rộng 100%, không bị lệch)            */}
        {/* ==================================================================== */}
        {isCreditEditor && (
          <form onSubmit={handleSubmitOneTimeForm} className="space-y-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tên Gói Credit <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ví dụ: Gói Tiêu Chuẩn 150 Credits"
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Số Credits <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.credits}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        credits: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    placeholder="150"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Giá Tiền (VND) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        price: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    placeholder="50000"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none transition"
                  />
                </div>
              </div>

              {isEditingCredit && (
                <div className="pt-2">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                      className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Kích hoạt gói này cho học viên nhìn thấy và mua
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleRequestExitEditor}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? 'Đang lưu...' : 'Lưu Gói Nạp Credit'}
              </button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* FORM GÓI HỘI VIÊN THÁNG (Đã sửa lỗi lệch ở Hình 3, bỏ huy hiệu Hình 2)*/}
        {/* ==================================================================== */}
        {isMonthlyEditor && (
          <form onSubmit={handleSubmitMonthlyForm} className="space-y-6 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tên Gói Hội Viên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={monthlyFormData.name}
                  onChange={(e) => setMonthlyFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ví dụ: Gói Tháng Pro (Cơ Bản)"
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Phụ đề / Mô tả ngắn
                </label>
                <input
                  type="text"
                  value={monthlyFormData.subtitle}
                  onChange={(e) =>
                    setMonthlyFormData((prev) => ({ ...prev, subtitle: e.target.value }))
                  }
                  placeholder="Ví dụ: Dành cho việc luyện tập đều đặn hàng ngày"
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Giá Gói Tháng (VND) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={monthlyFormData.price}
                    onChange={(e) =>
                      setMonthlyFormData((prev) => ({
                        ...prev,
                        price: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    placeholder="199000"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Chu kỳ thanh toán
                  </label>
                  <input
                    type="text"
                    value={monthlyFormData.billingCycle}
                    onChange={(e) =>
                      setMonthlyFormData((prev) => ({ ...prev, billingCycle: e.target.value }))
                    }
                    placeholder="30 ngày (Gia hạn hàng tháng)"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Định Mức Quota Lăn (Cân xứng 100% chiều rộng) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>⚡</span> Định Mức Dual-Window Rolling Quota
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                      Hạn mức Tuần (Credits) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={monthlyFormData.creditsAmount}
                      onChange={(e) =>
                        setMonthlyFormData((prev) => ({
                          ...prev,
                          creditsAmount: e.target.value === '' ? '' : Number(e.target.value),
                        }))
                      }
                      placeholder="1000"
                      className="w-full px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                      Hạn mức 5 Giờ (Credits) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={monthlyFormData.fiveHourQuota}
                      onChange={(e) =>
                        setMonthlyFormData((prev) => ({
                          ...prev,
                          fiveHourQuota: e.target.value === '' ? '' : Number(e.target.value),
                        }))
                      }
                      placeholder="50"
                      className="w-full px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] focus:outline-none transition"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Danh sách quyền lợi / tính năng (mỗi dòng 1 tính năng)
                </label>
                <textarea
                  rows={5}
                  value={monthlyFormData.featuresText}
                  onChange={(e) =>
                    setMonthlyFormData((prev) => ({ ...prev, featuresText: e.target.value }))
                  }
                  placeholder="Không giới hạn kịch bản hội thoại&#10;Hạn mức 1.000 credits mỗi tuần&#10;Đánh giá Pitch Accent chi tiết"
                  className="w-full px-4 py-3 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0878EE] focus:outline-none font-mono leading-relaxed transition"
                />
              </div>

              <div className="pt-1">
                <label className="inline-flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={monthlyFormData.isActive}
                    onChange={(e) =>
                      setMonthlyFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                    }
                    className="w-4 h-4 text-[#0878EE] rounded border-slate-300 focus:ring-[#0878EE]"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Kích hoạt gói này cho Học viên nhìn thấy và đăng ký
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleRequestExitEditor}
                className="px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 text-xs font-bold text-white bg-[#0878EE] hover:bg-[#0662C4] rounded-xl shadow-xs transition cursor-pointer"
              >
                Lưu Cấu Hình Gói Tháng
              </button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* MODAL XÁC NHẬN RỜI KHỎI TRANG KHI CHƯA LƯU (CHUẨN HÌNH 5 DEMO)      */}
        {/* ==================================================================== */}
        {isCancelModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl flex-shrink-0">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#071A44]">
                    Xác nhận rời khỏi trang {editorMode.startsWith('create') ? 'tạo mới' : 'chỉnh sửa'} gói?
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Thao tác này sẽ thoát khỏi trang soạn thảo gói.
                  </p>
                </div>
              </div>

              <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 mb-5 text-xs text-amber-900 leading-relaxed">
                <p className="font-bold mb-1">📌 Lưu ý quan trọng:</p>
                <p>
                  Nếu bạn rời khỏi trang bây giờ, toàn bộ các thay đổi và nội dung vừa nhập hiện tại sẽ bị hủy bỏ và không được lưu lại.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleDismissCancel}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition cursor-pointer"
                >
                  Tiếp tục chỉnh sửa
                </button>

                <button
                  type="button"
                  onClick={handleConfirmExit}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                >
                  Đồng ý rời khỏi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER: GIAO DIỆN DANH SÁCH (LIST VIEW - KHỚP CHUẨN HÌNH 1 CHO CẢ 2 BÊN)
  // ============================================================================
  return (
    <div className="p-6 max-w-7xl mx-auto font-sans text-slate-800">
      {/* 1. Header Bar & Breadcrumb chuẩn hóa (Hệ thống & Người dùng > Quản lý Gói và Credit) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
            <span>Hệ thống &amp; Người dùng</span>
            <span>&gt;</span>
            <span className="text-slate-800 font-semibold">Quản lý Gói và Credit</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Quản Lý Gói Dịch Vụ &amp; Hạn Mức Quota
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cấu hình Gói Tháng Hội Viên, định mức Quota Rolling (5 tiếng &amp; tuần) và các Gói Nạp Credit lẻ.
          </p>
        </div>

        {/* Nút hành động thêm mới: KHÔNG CÓ TRÙNG LẶP DẤU CỘNG (Sửa lỗi Hình 2) */}
        {mainCategory === 'subscription' ? (
          <button
            type="button"
            onClick={handleOpenCreateMonthlyEditor}
            className="inline-flex items-center px-4 py-2.5 bg-[#0878EE] hover:bg-[#0662C4] text-white text-sm font-semibold rounded-xl shadow-xs transition duration-150 cursor-pointer"
          >
            + Thêm Gói Tháng Mới
          </button>
        ) : (
          <button
            type="button"
            onClick={handleOpenCreateCreditEditor}
            className="inline-flex items-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-xs transition duration-150 cursor-pointer"
          >
            + Thêm Gói Nạp Lẻ
          </button>
        )}
      </div>

      {/* 2. Alert Messages (Chuẩn phong cách Add Scenario - tự làm mờ sau 5s, không in đậm, không nút X) */}
      {successMessage && (
        <div
          className={`bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs sm:text-sm mb-6 flex items-center gap-2.5 shadow-xs transition-opacity duration-500 ease-in-out ${
            isFadingOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <span className="text-base">✅</span>
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          className={`bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs sm:text-sm mb-6 flex items-center gap-2.5 shadow-xs transition-opacity duration-500 ease-in-out ${
            isFadingOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <span className="text-base">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3. Main Navigation Switcher (Gói Hội Viên Tháng vs Gói Nạp Lẻ) */}
      <div className="flex flex-wrap items-center gap-3 p-1.5 bg-slate-100 rounded-2xl mb-8 w-fit border border-slate-200">
        <button
          type="button"
          onClick={() => setMainCategory('subscription')}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            mainCategory === 'subscription'
              ? 'bg-white text-[#0878EE] shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>⭐</span>
          <span>Gói Hội Viên Tháng &amp; Hạn Mức Quota</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-[#0878EE] font-bold">
            {monthlyPlans.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainCategory('one-time')}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            mainCategory === 'one-time'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>🪙</span>
          <span>Gói Nạp Credit (Một Lần)</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700 font-bold">
            {packages.length}
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1: GÓI HỘI VIÊN THÁNG (DẠNG BẢNG TABLE GIỐNG HỆT HÌNH 1)      */}
      {/* ==================================================================== */}
      {mainCategory === 'subscription' && (
        <div>
          {/* Sub-tabs Gói Tháng giống hệt Hình 1 */}
          <div className="flex border-b border-slate-200 mb-6 gap-2">
            <button
              type="button"
              onClick={() => setMonthlyActiveTab('active')}
              className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-all cursor-pointer ${
                monthlyActiveTab === 'active'
                  ? 'border-red-600 text-red-600 bg-red-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span>Gói Đang Hoạt Động</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  monthlyActiveTab === 'active' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {activeMonthlyPlans.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMonthlyActiveTab('inactive')}
              className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-all cursor-pointer ${
                monthlyActiveTab === 'inactive'
                  ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span>Gói Đã Ẩn</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  monthlyActiveTab === 'inactive' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {inactiveMonthlyPlans.length}
              </span>
            </button>
          </div>

          {/* Table Gói Tháng (Đồng bộ cấu trúc giao diện giống hệt Bảng Credit Hình 1) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {currentDisplayMonthlyPlans.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <div className="text-4xl mb-3">⭐</div>
                <p className="text-base font-medium text-slate-600">
                  {monthlyActiveTab === 'active'
                    ? 'Không có gói hội viên nào đang hoạt động.'
                    : 'Không có gói hội viên nào đã bị ẩn.'}
                </p>
                {monthlyActiveTab === 'active' && (
                  <p className="text-sm mt-1">Bấm "+ Thêm Gói Tháng Mới" để tạo gói đầu tiên.</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-xs tracking-wider">
                      <th className="py-3.5 px-4 text-center w-16">ID</th>
                      <th className="py-3.5 px-4">TÊN GÓI THÁNG</th>
                      <th className="py-3.5 px-4 text-center">HẠN MỨC TUẦN</th>
                      <th className="py-3.5 px-4 text-center">HẠN MỨC 5 GIỜ</th>
                      <th className="py-3.5 px-4 text-right">GIÁ GÓI / THÁNG</th>
                      <th className="py-3.5 px-4 text-center w-36">TRẠNG THÁI</th>
                      <th className="py-3.5 px-4 text-center w-48">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentDisplayMonthlyPlans.map((plan, index) => (
                      <tr key={plan.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 text-center font-mono text-slate-500 text-xs">
                          #{index + 1}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{plan.name}</span>
                            {plan.badgeText && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-50 text-[#0878EE] border border-blue-200">
                                {plan.badgeText}
                              </span>
                            )}
                          </div>
                          {plan.subtitle && (
                            <p className="text-xs text-slate-500 mt-0.5">{plan.subtitle}</p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-[#0878EE]">
                          🪙 {plan.creditsAmount.toLocaleString()} credits
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-indigo-700">
                          ⏳ {plan.fiveHourQuota || 50} credits
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                          {formatCurrency(plan.price)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {plan.isActive ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Đang bán
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Đã ẩn
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditMonthlyEditor(plan)}
                            className="text-xs font-semibold px-2.5 py-1 text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 transition cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleMonthlyStatus(plan)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition cursor-pointer ${
                              plan.isActive
                                ? 'text-amber-700 border-amber-200 hover:bg-amber-50'
                                : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                            }`}
                          >
                            {plan.isActive ? 'Ẩn gói' : 'Khôi phục'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMonthlyPlan(plan)}
                            className="text-xs font-semibold px-2.5 py-1 text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition cursor-pointer"
                            title="Xóa vĩnh viễn"
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 2: GÓI NẠP CREDIT (MỘT LẦN - API DATABASE - KHỚP HÌNH 1)      */}
      {/* ==================================================================== */}
      {mainCategory === 'one-time' && (
        <div>
          {/* Sub-tabs for one-time packages (Khớp chuẩn Hình 1) */}
          <div className="flex border-b border-slate-200 mb-6 gap-2">
            <button
              type="button"
              onClick={() => setCreditActiveTab('active')}
              className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-all cursor-pointer ${
                creditActiveTab === 'active'
                  ? 'border-red-600 text-red-600 bg-red-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span>Gói Đang Hoạt Động</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  creditActiveTab === 'active' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {activePackages.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCreditActiveTab('inactive')}
              className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-all cursor-pointer ${
                creditActiveTab === 'inactive'
                  ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span>Gói Đã Ẩn</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  creditActiveTab === 'inactive' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {inactivePackages.length}
              </span>
            </button>
          </div>

          {/* Table (Khớp chuẩn Hình 1) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {isLoading ? (
              <div className="py-16 text-center text-slate-500">
                <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-red-600 rounded-full animate-spin mb-3" />
                <p className="text-sm">Đang tải danh sách gói credit...</p>
              </div>
            ) : currentDisplayPackages.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <div className="text-4xl mb-3">🪙</div>
                <p className="text-base font-medium text-slate-600">
                  {creditActiveTab === 'active'
                    ? 'Không có gói credit nào đang hoạt động.'
                    : 'Không có gói credit nào đã bị ẩn.'}
                </p>
                {creditActiveTab === 'active' && (
                  <p className="text-sm mt-1">Bấm "+ Thêm Gói Nạp Lẻ" để tạo gói đầu tiên.</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-xs tracking-wider">
                      <th className="py-3.5 px-4 text-center w-16">ID</th>
                      <th className="py-3.5 px-4">TÊN GÓI</th>
                      <th className="py-3.5 px-4 text-center">SỐ CREDITS</th>
                      <th className="py-3.5 px-4 text-right">GIÁ TIỀN (VND)</th>
                      <th className="py-3.5 px-4 text-center w-36">TRẠNG THÁI</th>
                      <th className="py-3.5 px-4 text-center w-44">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentDisplayPackages.map((pkg) => (
                      <tr key={pkg.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 text-center font-mono text-slate-500 text-xs">
                          #{pkg.id}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-900">{pkg.name}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-[#0878EE]">
                          🪙 {pkg.credits.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                          {formatCurrency(pkg.price)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {pkg.isActive ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Đang bán
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Đã ẩn
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center space-x-2">
                          {pkg.isActive ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditCreditEditor(pkg)}
                                className="text-xs font-semibold px-2.5 py-1 text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 transition cursor-pointer"
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                onClick={() => handleHideOneTimePackage(pkg)}
                                className="text-xs font-semibold px-2.5 py-1 text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition cursor-pointer"
                              >
                                Ẩn gói
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRestoreOneTimePackage(pkg)}
                              className="text-xs font-semibold px-3 py-1 text-emerald-700 border border-emerald-300 rounded-md hover:bg-emerald-50 transition cursor-pointer"
                            >
                              Khôi phục
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

