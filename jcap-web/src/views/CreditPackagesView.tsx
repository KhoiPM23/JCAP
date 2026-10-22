import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { creditService } from '../services/creditService';
import { profileService } from '../services/profileService';
import type { CreditPackage } from '../types/credit';
import { subscriptionPlanService, type SubscriptionPlanItem } from '../services/subscriptionPlanService';

export const CreditPackagesView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const cancelParam = searchParams.get('cancel');
  const statusParam = searchParams.get('status');

  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [purchasingId, setPurchasingId] = useState<number | null>(null);
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  // Tự động mờ dần và tắt thông báo sau 5 giây
  useEffect(() => {
    if (!error && !successMessage) {
      setIsFadingOut(false);
      return;
    }

    setIsFadingOut(false);
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 5000);

    const clearTimer = setTimeout(() => {
      setError(null);
      setSuccessMessage(null);
      setIsFadingOut(false);
    }, 5500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(clearTimer);
    };
  }, [error, successMessage]);

  const [currentBalance, setCurrentBalance] = useState<number>(() => {
    if (typeof user?.creditBalance === 'number') {
      return user.creditBalance;
    }
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (typeof u.creditBalance === 'number') return u.creditBalance;
      }
    } catch {
      // ignore
    }
    return 3320;
  });

  const loadPackages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await creditService.getPackages();
      if (res.success && res.data) {
        setPackages(res.data);
      } else {
        setError(res.message || 'Không thể tải danh sách gói credit.');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  // Tự động đồng bộ khi user trong AuthContext thay đổi
  useEffect(() => {
    if (typeof user?.creditBalance === 'number') {
      setCurrentBalance(user.creditBalance);
    }
  }, [user?.creditBalance]);

  useEffect(() => {
    loadPackages();

    if (cancelParam === 'true' || statusParam === 'CANCELLED') {
      setError('Yêu cầu thanh toán đã bị hủy. Bạn có thể chọn gói khác để thử lại.');
    }

    creditService.getHistory(1, 1).then((res) => {
      if (res.success && res.data && typeof res.data.currentCreditBalance === 'number') {
        setCurrentBalance(res.data.currentCreditBalance);
        creditService.updateLocalCreditBalance(res.data.currentCreditBalance);
      }
    }).catch(() => {});

    profileService.getProfile().then((res) => {
      if (res.success && res.data && typeof res.data.creditBalance === 'number') {
        setCurrentBalance(res.data.creditBalance);
        creditService.updateLocalCreditBalance(res.data.creditBalance);
      }
    }).catch(() => {});

    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const newBal = customEvent.detail?.creditBalance;
      if (typeof newBal === 'number') {
        setCurrentBalance(newBal);
      }
    };

    window.addEventListener('jcap_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
  }, [cancelParam, statusParam]);

  const displayBalance = useMemo(() => {
    if (typeof currentBalance === 'number') {
      return currentBalance;
    }
    if (typeof user?.creditBalance === 'number') {
      return user.creditBalance;
    }
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (typeof u.creditBalance === 'number') return u.creditBalance;
      }
    } catch {}
    return 3320;
  }, [currentBalance, user?.creditBalance]);

  const bestValuePkgId = useMemo(() => {
    if (packages.length <= 1) return null;
    let bestId = packages[0].id;
    let minCost = packages[0].price / (packages[0].credits || 1);
    packages.forEach((p) => {
      const cost = p.price / (p.credits || 1);
      if (cost < minCost) {
        minCost = cost;
        bestId = p.id;
      }
    });
    return bestId;
  }, [packages]);

  const packageLayout = useMemo(() => {
    const count = packages.length;
    if (count === 1) {
      return {
        containerClass: 'max-w-md mx-auto',
        cardClass: 'w-full max-w-sm',
      };
    }
    if (count === 2) {
      return {
        containerClass: 'max-w-3xl mx-auto',
        cardClass: 'w-full sm:w-[320px] max-w-sm',
      };
    }
    if (count === 3) {
      return {
        containerClass: 'max-w-5xl mx-auto',
        cardClass: 'w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] max-w-sm',
      };
    }
    return {
      containerClass: 'max-w-7xl mx-auto',
      cardClass: 'w-full sm:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] min-w-[240px] max-w-[290px]',
    };
  }, [packages.length]);

  // Danh sách Gói Tháng (Subscription Plans) - Đọc trực tiếp từ subscriptionPlanService và đồng bộ với cấu hình Admin
  const [monthlyPlans, setMonthlyPlans] = useState<SubscriptionPlanItem[]>(() =>
    subscriptionPlanService.getPlans().filter((p) => p.isActive)
  );

  useEffect(() => {
    const handlePlansUpdated = () => {
      setMonthlyPlans(subscriptionPlanService.getPlans().filter((p) => p.isActive));
    };

    // Lắng nghe sự kiện custom nội bộ trong cùng tab
    window.addEventListener('jcap_subscription_plans_updated', handlePlansUpdated);

    // Lắng nghe sự kiện storage khi Admin cập nhật gói ở tab/cửa sổ khác
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'jcap_admin_subscription_plans') {
        setMonthlyPlans(subscriptionPlanService.getPlans().filter((p) => p.isActive));
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('jcap_subscription_plans_updated', handlePlansUpdated);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Tính toán danh hiệu (Badge) tự động: Phổ Biến Nhất, Tiết Kiệm Nhất
  const processedMonthlyPlans = useMemo(() => {
    if (monthlyPlans.length === 0) return [];

    let bestValueId: string | null = null;
    let minCost = Infinity;

    if (monthlyPlans.length > 1) {
      monthlyPlans.forEach((p) => {
        const cost = p.price / (p.creditsAmount || 1);
        if (cost < minCost) {
          minCost = cost;
          bestValueId = p.id;
        }
      });
    }

    return monthlyPlans.map((plan) => {
      const nameLower = plan.name.toLowerCase();
      const isPopular =
        plan.isPopular ||
        nameLower.includes('tiêu chuẩn') ||
        nameLower.includes('cơ bản') ||
        nameLower.includes('phổ biến');
      const isBestValue =
        !isPopular &&
        (plan.id === bestValueId ||
          nameLower.includes('chuyên sâu') ||
          nameLower.includes('tiết kiệm'));

      let badgeText: string | null = null;
      let badgeBg = '';

      if (isPopular) {
        badgeText = 'Phổ Biến Nhất';
        badgeBg = 'bg-[#0878EE]';
      } else if (isBestValue) {
        badgeText = 'Tiết Kiệm Nhất';
        badgeBg = 'bg-amber-500';
      } else if (plan.badgeText && plan.badgeText.trim() && plan.badgeText.trim() !== '-') {
        badgeText = plan.badgeText.trim();
        badgeBg = 'bg-blue-600';
      }

      return {
        ...plan,
        isPopular,
        isBestValue,
        badgeText,
        badgeBg,
      };
    });
  }, [monthlyPlans]);

  // Layout linh hoạt tự cân bằng cho Gói Tháng giống phần Credit
  const monthlyPlanLayout = useMemo(() => {
    const count = monthlyPlans.length;
    if (count === 1) {
      return {
        containerClass: 'max-w-md mx-auto',
        cardClass: 'w-full max-w-sm',
      };
    }
    if (count === 2) {
      return {
        containerClass: 'max-w-3xl mx-auto',
        cardClass: 'w-full sm:w-[320px] max-w-sm',
      };
    }
    if (count === 3) {
      return {
        containerClass: 'max-w-5xl mx-auto',
        cardClass: 'w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] max-w-sm',
      };
    }
    return {
      containerClass: 'max-w-7xl mx-auto',
      cardClass: 'w-full sm:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] min-w-[240px] max-w-[290px]',
    };
  }, [monthlyPlans.length]);

  const handlePurchase = async (pkg: CreditPackage) => {
    setPurchasingId(pkg.id);
    setError(null);
    setSuccessMessage(null);

    /* =========================================================================
     * CODE CŨ (GỌI PAYOS THANH TOÁN THẬT) - TẠM ĐÓNG ĐỂ PHỤC VỤ TEST CHỨC NĂNG
     * =========================================================================
    try {
      const res = await creditService.purchasePackage(pkg.id);
      if (res.success && res.data?.checkoutUrl) {
        // Chuyển hướng người dùng sang cổng thanh toán VietQR PayOS thật
        window.location.href = res.data.checkoutUrl;
      } else {
        setError(res.message || 'Không thể khởi tạo giao dịch PayOS cho gói credit.');
      }
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi kết nối đến cổng PayOS.');
    } finally {
      setPurchasingId(null);
    }
    ========================================================================= */

    // =========================================================================
    // CODE TEST CHỨC NĂNG: TỰ ĐỘNG NẠP CREDIT NGAY, BỎ QUA BƯỚC NẠP TIỀN PAYOS
    // =========================================================================
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const addedCredits = pkg.credits;
      const prevBalance = typeof currentBalance === 'number' ? currentBalance : (user?.creditBalance || 0);
      const newBalance = prevBalance + addedCredits;

      setCurrentBalance(newBalance);
      creditService.updateLocalCreditBalance(newBalance);

      setSuccessMessage(
        `Nạp thành công ${pkg.name}! (+${addedCredits.toLocaleString('vi-VN')} credits vào tài khoản). (Chế độ Test: Đã bỏ qua bước nạp tiền)`
      );
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi nạp credit test.');
    } finally {
      setPurchasingId(null);
    }
  };

  const handleSubscribeMonthlyPlan = async (plan: SubscriptionPlanItem) => {
    setSubscribingPlanId(plan.id);
    setError(null);
    setSuccessMessage(null);

    /* =========================================================================
     * CODE CŨ (GỌI PAYOS THANH TOÁN THẬT) - TẠM ĐÓNG ĐỂ PHỤC VỤ TEST CHỨC NĂNG
     * =========================================================================
    try {
      const res = await creditService.purchaseSubscriptionPlan(plan);
      if (res.success && res.data?.checkoutUrl) {
        // Chuyển hướng người dùng sang cổng thanh toán VietQR PayOS thật
        window.location.href = res.data.checkoutUrl;
      } else {
        setError(res.message || 'Không thể khởi tạo giao dịch PayOS cho gói tháng.');
      }
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi kết nối đến cổng PayOS.');
    } finally {
      setSubscribingPlanId(null);
    }
    ========================================================================= */

    // =========================================================================
    // CODE TEST CHỨC NĂNG: TỰ ĐỘNG MUA & KÍCH HOẠT GÓI NGAY, BỎ QUA NẠP TIỀN PAYOS
    // =========================================================================
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 1. Kích hoạt và lưu thông tin gói hội viên vào hệ thống / LocalStorage
      subscriptionPlanService.setUserSubscription(plan);

      // 2. Tự động cộng số credit của gói vào số dư hiện tại của tài khoản
      const addedCredits = plan.creditsAmount || 2500;
      const prevBalance = typeof currentBalance === 'number' ? currentBalance : (user?.creditBalance || 0);
      const newBalance = prevBalance + addedCredits;

      setCurrentBalance(newBalance);
      creditService.updateLocalCreditBalance(newBalance);

      // 3. Hiển thị thông báo mua thành công
      setSuccessMessage(
        `Đã kích hoạt thành công ${plan.name}! Bạn được cấp ${addedCredits.toLocaleString('vi-VN')} credits/tuần và hạn mức mới. (Chế độ Test: Đã tự động mua, bỏ qua bước nạp tiền)`
      );
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi kích hoạt gói test.');
    } finally {
      setSubscribingPlanId(null);
    }
  };

  const formatVnd = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 font-sans">
      {/* 1. Breadcrumb & Nút Thoát / Quay lại */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link to="/" className="hover:text-[#0878EE] transition">Trang chủ</Link>
          <span>/</span>
          <Link to="/subscription" className="hover:text-[#0878EE] transition">Gói Dịch Vụ & Hạn Mức</Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Nạp credit</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/subscription')}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition cursor-pointer"
          title="Quay lại trang Gói Dịch Vụ & Hạn Mức"
        >
          <span>←</span>
          <span>Quay lại Gói & Hạn Mức</span>
        </button>
      </div>

      {/* 2. Header Banner */}
      <div className="bg-gradient-to-r from-[#0878EE] to-[#044EB9] rounded-2xl p-8 mb-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <span>🪙</span> Nạp Thêm Credit
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Mở Rộng Giới Hạn Luyện Hội Thoại Cùng AI
            </h1>
            <p className="text-blue-100 text-sm mt-2 max-w-xl">
              Credit được sử dụng để tương tác các kịch bản Kaiwa, đánh giá ngữ điệu / phát âm chuyên sâu, và nhận phản hồi chi tiết từ hệ thống AI.
            </p>
          </div>

          {/* Ô số dư bên phải & Button check lịch sử giao dịch */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-right min-w-[220px] flex flex-col items-start md:items-end justify-center shadow-xs">
            <span className="text-xs uppercase tracking-wider text-blue-100 font-medium">Số dư hiện tại</span>
            <div className="text-3xl font-extrabold text-white mt-1 flex items-center gap-2">
              <span className="text-amber-300">🪙</span>
              <span>{displayBalance}</span>
              <span className="text-sm font-normal text-blue-200">Credits</span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/credits/history')}
              className="mt-3.5 inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/30 text-xs font-bold backdrop-blur-sm transition shadow-2xs cursor-pointer w-full md:w-auto"
            >
              <span>📜 Kiểm tra lịch sử giao dịch</span>
            </button>
          </div>
        </div>

        {/* Decorative background circle */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* Thông báo thông điệp */}
      {successMessage && (
        <div
          className={`mb-6 p-4 bg-emerald-50 border border-[#12B76A]/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-[#027A48] transition-opacity duration-500 ease-in-out ${
            isFadingOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">✅</span>
            <span className="font-medium">{successMessage}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/subscription')}
            >
              👑 Xem Gói & Hạn Mức
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/credits/history')}
            >
              Lịch sử
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          className={`mb-6 p-4 bg-red-50 border border-[#D92D20]/30 rounded-xl flex items-center gap-3 text-sm text-[#D92D20] transition-opacity duration-500 ease-in-out ${
            isFadingOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <span className="text-xl">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* 3. MỤC GÓI THÁNG (SUBSCRIPTION PLANS) */}
      <div className="mb-12">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">👑</span>
              <h2 className="text-xl font-bold text-[#071A44]">Gói Hội Viên Theo Tháng (Pro Monthly)</h2>
            </div>
            <p className="text-xs text-[#71809A] mt-0.5">
              Đăng ký định kỳ để nhận hạn ngạch AI hồi phục liên tục mỗi 5 giờ và mỗi tuần (kiểu Antigravity)
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 font-medium">
            <span>✨</span> Tự động hồi phục sau mỗi 5 tiếng
          </div>
        </div>

        <div className={`flex flex-wrap justify-center gap-6 ${monthlyPlanLayout.containerClass}`}>
          {processedMonthlyPlans.map((plan) => (
            <div
              key={plan.id}
              className={`${monthlyPlanLayout.cardClass} bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between p-6 relative ${
                plan.isPopular
                  ? 'border-[#0878EE] shadow-md ring-2 ring-[#0878EE]/10'
                  : plan.isBestValue
                  ? 'border-amber-400 shadow-md ring-2 ring-amber-400/10'
                  : 'border-[#E6EDF5] hover:border-blue-300 hover:shadow-md'
              }`}
            >
              {/* Badge */}
              {plan.badgeText && (
                <span
                  className={`absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow ${plan.badgeBg}`}
                >
                  {plan.badgeText}
                </span>
              )}

              <div>
                <h3 className="text-lg font-bold text-[#071A44] mb-1">{plan.name}</h3>
                <p className="text-xs text-[#71809A] mb-4">{plan.subtitle || 'Dành cho việc luyện tập đều đặn'}</p>

                <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100 text-center">
                  <div className="text-3xl font-extrabold text-[#0878EE] flex items-center justify-center gap-1.5">
                    <span>👑</span>
                    <span>{plan.creditsAmount}</span>
                  </div>
                  <span className="text-xs text-[#71809A] font-medium mt-1 block">
                    {plan.creditsLabel || 'Credits / tuần'}
                  </span>
                </div>

                <div className="space-y-2 mb-6 text-xs text-[#475467]">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[#71809A]">Đơn giá:</span>
                    <span className="font-semibold text-[#071A44]">
                      {plan.unitPriceText || `~${Math.round(plan.price / (plan.creditsAmount || 1)).toLocaleString('vi-VN')} đ / credit`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[#71809A]">Thời hạn sử dụng:</span>
                    <span className="font-medium text-emerald-700">{plan.billingCycle || '30 ngày (Gia hạn hàng tháng)'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71809A]">Kích hoạt:</span>
                    <span className="font-medium text-[#071A44]">Tự động tức thì</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-4 text-center">
                  <span className="text-2xl font-bold text-[#071A44]">{formatVnd(plan.price)}</span>
                  <span className="text-xs text-slate-400 ml-1">/ tháng</span>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  className={`w-full font-bold shadow-sm ${
                    plan.isBestValue
                      ? 'bg-amber-600 hover:bg-amber-700 border-amber-600'
                      : 'bg-[#0878EE] hover:bg-blue-700'
                  }`}
                  disabled={subscribingPlanId !== null}
                  onClick={() => handleSubscribeMonthlyPlan(plan)}
                >
                  {subscribingPlanId === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/80 border-t-white rounded-full animate-spin"></div>
                      Đang kích hoạt gói...
                    </span>
                  ) : (
                    'Mua Ngay'
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. MỤC CHỌN GÓI NẠP PHÙ HỢP (CREDIT VĨNH VIỄN) */}
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🪙</span>
              <h2 className="text-xl font-bold text-[#071A44]">Chọn Gói Nạp Phù Hợp (Credit Vĩnh Viễn)</h2>
            </div>
            <p className="text-xs text-[#71809A] mt-0.5">
              Thanh toán an toàn, bảo mật qua cổng chuyển khoản trực tiếp VietQR PayOS
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 font-medium">
            <span>🔒</span> Hỗ trợ chuyển khoản quét mã QR tự động 24/7
          </div>
        </div>

        {/* Packages Grid */}
        {isLoading ? (
          <div className="bg-white rounded-xl border border-[#E6EDF5] p-12 text-center shadow-sm">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-[#0878EE] rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm font-medium text-[#71809A]">Đang tải danh sách các gói nạp credit...</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E6EDF5] p-12 text-center shadow-sm">
            <p className="text-sm font-medium text-[#71809A]">Hiện chưa có gói credit nào khả dụng. Vui lòng quay lại sau.</p>
          </div>
        ) : (
          <div className={`flex flex-wrap justify-center gap-6 ${packageLayout.containerClass}`}>
            {packages.map((pkg) => {
              const nameLower = pkg.name.toLowerCase();
              const unitPrice = Math.round(pkg.price / (pkg.credits || 1));
              const isPopular = nameLower.includes('tiêu chuẩn') || nameLower.includes('phổ biến');
              const isBestValue = !isPopular && (pkg.id === bestValuePkgId || nameLower.includes('chuyên sâu') || nameLower.includes('tiết kiệm'));

              return (
                <div
                  key={pkg.id}
                  className={`${packageLayout.cardClass} bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between p-6 relative ${
                    isPopular
                      ? 'border-[#0878EE] shadow-md ring-2 ring-[#0878EE]/10'
                      : isBestValue
                      ? 'border-amber-400 shadow-md ring-2 ring-amber-400/10'
                      : 'border-[#E6EDF5] hover:border-blue-300 hover:shadow-md'
                  }`}
                >
                  {/* Badges */}
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0878EE] text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow">
                      Phổ Biến Nhất
                    </span>
                  )}
                  {isBestValue && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow">
                      Tiết Kiệm Nhất
                    </span>
                  )}

                  <div>
                    <h3 className="text-lg font-bold text-[#071A44] mb-1">{pkg.name}</h3>
                    <p className="text-xs text-[#71809A] mb-4">Dành cho việc luyện tập đều đặn</p>

                    <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100 text-center">
                      <div className="text-3xl font-extrabold text-[#0878EE] flex items-center justify-center gap-1.5">
                        <span>🪙</span>
                        <span>{pkg.credits}</span>
                      </div>
                      <span className="text-xs text-[#71809A] font-medium mt-1 block">Credits</span>
                    </div>

                    <div className="space-y-2 mb-6 text-xs text-[#475467]">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-[#71809A]">Đơn giá:</span>
                        <span className="font-semibold text-[#071A44]">~{unitPrice.toLocaleString('vi-VN')} đ / credit</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-[#71809A]">Thời hạn sử dụng:</span>
                        <span className="font-medium text-emerald-700">Vĩnh viễn</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#71809A]">Kích hoạt:</span>
                        <span className="font-medium text-[#071A44]">Tự động tức thì</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-4 text-center">
                      <span className="text-2xl font-bold text-[#071A44]">{formatVnd(pkg.price)}</span>
                    </div>

                    <Button
                      variant="primary"
                      size="md"
                      className="w-full font-bold shadow-sm cursor-pointer"
                      disabled={purchasingId !== null}
                      onClick={() => handlePurchase(pkg)}
                    >
                      {purchasingId === pkg.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/80 border-t-white rounded-full animate-spin"></div>
                          Đang khởi tạo...
                        </span>
                      ) : (
                        'Mua Ngay'
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security & Support note */}
      <div className="mt-12 bg-slate-50 border border-[#E6EDF5] rounded-xl p-6 text-xs text-[#71809A] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0878EE] flex items-center justify-center font-bold text-base shrink-0">
            ?
          </div>
          <div>
            <p className="font-semibold text-[#071A44]">Cần trợ giúp trong quá trình thanh toán?</p>
            <p>Liên hệ bộ phận hỗ trợ kỹ thuật hoặc quản trị viên JCAP nếu giao dịch gặp sự cố.</p>
          </div>
        </div>
        <Link
          to="/credits/history"
          className="text-[#0878EE] font-semibold hover:underline shrink-0"
        >
          Tra cứu lịch sử nạp tiền ➔
        </Link>
      </div>
    </div>
  );
};

