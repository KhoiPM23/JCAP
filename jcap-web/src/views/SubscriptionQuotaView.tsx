import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { creditService } from '../services/creditService';
import { subscriptionPlanService, type UserSubscriptionState } from '../services/subscriptionPlanService';

export const SubscriptionQuotaView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State thông tin gói hội viên động từ subscriptionPlanService
  const [subscription, setSubscription] = useState<UserSubscriptionState>(() =>
    subscriptionPlanService.getUserSubscription()
  );

  // State Dual-Window Rolling Quota (Được tính toán động từ các phiên học thật trong DB)
  const [weeklyLimit, setWeeklyLimit] = useState(() => {
    const sub = subscriptionPlanService.getUserSubscription();
    const isActive = sub.status === 'Active' && sub.creditsAmount > 0;
    return {
      remainingPercent: isActive ? 100 : 0,
      usedCredits: 0,
      totalCredits: isActive ? sub.creditsAmount : 0,
      resetsInText: isActive ? '7 ngày (Đầy đủ)' : 'Chưa kích hoạt gói tháng',
    };
  });

  const [fiveHourLimit, setFiveHourLimit] = useState(() => {
    const sub = subscriptionPlanService.getUserSubscription();
    const isActive = sub.status === 'Active' && sub.fiveHourQuota > 0;
    return {
      remainingPercent: isActive ? 100 : 0,
      usedCredits: 0,
      totalCredits: isActive ? sub.fiveHourQuota : 0,
      resetsInText: isActive ? '5 giờ (Đầy đủ)' : 'Chưa kích hoạt gói tháng',
    };
  });

  // Số dư Credit nạp thêm (Extra Credit Balance)
  const [extraCredits, setExtraCredits] = useState<number>(() => {
    return typeof user?.creditBalance === 'number' ? user.creditBalance : 0;
  });

  // Tùy chọn: Cho phép dùng credit khi hết quota
  const [allowAutoUseExtraCredits, setAllowAutoUseExtraCredits] = useState<boolean>(() => {
    const saved = localStorage.getItem('jcap_allow_auto_use_credit');
    return saved !== null ? saved === 'true' : true;
  });

  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadQuotaFromBackend = async (showNotification: boolean = false) => {
    setIsRefreshing(true);
    try {
      const res = await creditService.getQuota();
      if (res.success && res.data) {
        const d = res.data;

        if (d.hasActiveSubscription && d.subscriptionExpiresAt) {
          const planWeeklyTotal = d.weeklyTotalCredits || 1000;
          const planFiveHourTotal = d.fiveHourTotalCredits || 50;
          const matchedPlan = d.planId ? subscriptionPlanService.findPlanById(d.planId) : undefined;

          setSubscription((prev) => ({
            ...prev,
            planId: d.planId || prev.planId,
            planName: d.planName || matchedPlan?.name || prev.planName,
            planTier: d.planTier || prev.planTier,
            status: 'Active',
            expiresAt: d.subscriptionExpiresAt!,
            daysRemaining: typeof d.subscriptionDaysRemaining === 'number' ? d.subscriptionDaysRemaining : 0,
            creditsAmount: planWeeklyTotal,
            fiveHourQuota: planFiveHourTotal,
            features: matchedPlan?.features || prev.features,
          }));

          const weeklyRemaining = Math.max(0, planWeeklyTotal - d.weeklyUsedCredits);
          const weeklyPercent = planWeeklyTotal > 0 ? Math.round((weeklyRemaining / planWeeklyTotal) * 100) : 0;

          const fiveHourRemaining = Math.max(0, planFiveHourTotal - d.fiveHourUsedCredits);
          const fiveHourPercent = planFiveHourTotal > 0 ? Math.round((fiveHourRemaining / planFiveHourTotal) * 100) : 0;

          setWeeklyLimit({
            remainingPercent: weeklyPercent,
            usedCredits: d.weeklyUsedCredits,
            totalCredits: planWeeklyTotal,
            resetsInText: d.weeklyResetsInText,
          });

          setFiveHourLimit({
            remainingPercent: fiveHourPercent,
            usedCredits: d.fiveHourUsedCredits,
            totalCredits: planFiveHourTotal,
            resetsInText: d.fiveHourResetsInText,
          });
        } else {
          // Người dùng chưa đăng ký gói tháng hoặc gói đã hết hạn -> Xóa cache local và hiển thị trạng thái chưa có gói
          subscriptionPlanService.clearUserSubscription();
          const isExpired = Boolean(d.subscriptionExpiresAt);

          setSubscription((prev) => ({
            ...prev,
            planId: d.planId || '',
            planName: d.planName || 'Chưa đăng ký gói hội viên',
            planTier: d.planTier || 'Free',
            status: isExpired ? 'Expired' : 'None',
            expiresAt: d.subscriptionExpiresAt || '',
            daysRemaining: 0,
            creditsAmount: 0,
            fiveHourQuota: 0,
          }));

          setWeeklyLimit({
            remainingPercent: 0,
            usedCredits: 0,
            totalCredits: 0,
            resetsInText: d.weeklyResetsInText || 'Chưa kích hoạt gói tháng',
          });

          setFiveHourLimit({
            remainingPercent: 0,
            usedCredits: 0,
            totalCredits: 0,
            resetsInText: d.fiveHourResetsInText || 'Chưa kích hoạt gói tháng',
          });
        }

        setExtraCredits(d.extraCreditBalance);

        if (showNotification) {
          showToast('Đã làm mới dữ liệu hạn ngạch từ các phiên học thành công!', 'success');
        }
      }
    } catch (err) {
      console.error('Lỗi tải hạn ngạch Quota:', err);
    } finally {
      setIsRefreshing(false);
    }
  };
  useEffect(() => {
    void loadQuotaFromBackend(false);

    const handleSubscriptionUpdate = () => {
      const updated = subscriptionPlanService.getUserSubscription();
      setSubscription(updated);
      void loadQuotaFromBackend(false);
    };

    const handleProfileUpdate = () => {
      void loadQuotaFromBackend(false);
    };

    window.addEventListener('jcap_subscription_updated', handleSubscriptionUpdate);
    window.addEventListener('jcap_profile_updated', handleProfileUpdate);
    window.addEventListener('storage', handleSubscriptionUpdate);

    return () => {
      window.removeEventListener('jcap_subscription_updated', handleSubscriptionUpdate);
      window.removeEventListener('jcap_profile_updated', handleProfileUpdate);
      window.removeEventListener('storage', handleSubscriptionUpdate);
    };
  }, []);

  const handleToggleAutoUseCredit = (checked: boolean) => {
    setAllowAutoUseExtraCredits(checked);
    localStorage.setItem('jcap_allow_auto_use_credit', checked ? 'true' : 'false');
    showToast(
      checked
        ? 'Đã bật: Tự động dùng Credit nạp thêm khi dùng hết hạn ngạch 5 giờ!'
        : 'Đã tắt: Khi hết hạn ngạch 5 giờ, bài học sẽ tạm dừng chờ hồi phục.',
      'info'
    );
  };

  return (
    <div className="min-h-screen bg-[#F4F7FC] py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Toast Thông báo */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 animate-bounce">
            <div
              className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : toastMessage.type === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              <span>{toastMessage.type === 'success' ? '✅' : toastMessage.type === 'error' ? '❌' : '⚡'}</span>
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}

        {/* Tiêu đề & Giới thiệu */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Link to="/" className="hover:text-[#0878EE] transition">Trang chủ</Link>
              <span>/</span>
              <span className="text-slate-800 font-semibold">Gói Dịch Vụ & Hạn Mức</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#071A44] tracking-tight flex items-center gap-2.5">
              <span>Gói Hội Viên & Hạn Mức AI</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-[#0878EE] font-bold">
                Dual-Window Quota
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Quản lý gói tháng, chu kỳ hồi phục hạn ngạch thông minh tính toán động từ các phiên học và số dư Credit nạp thêm.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadQuotaFromBackend(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition cursor-pointer disabled:opacity-60"
            >
              <span className={isRefreshing ? 'animate-spin inline-block' : ''}>🔄</span>
              <span>{isRefreshing ? 'Đang đồng bộ...' : 'Làm mới Quota'}</span>
            </button>
            <Link
              to="/credits/history"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition"
            >
              <span>📜 Lịch sử giao dịch</span>
            </Link>
          </div>
        </div>

        {/* KHỐI 1: THẺ GÓI HỘI VIÊN & SỐ DƯ CREDIT NẠP THÊM */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cột Trái: Thông tin Gói Hội Viên Tháng (2 Cột) */}
          <div className="lg:col-span-2 bg-gradient-to-br from-[#071A44] via-[#0D2B68] to-[#123E8E] text-white rounded-2xl p-6 sm:p-7 shadow-md relative overflow-hidden flex flex-col justify-between">
            {/* Họa tiết trang trí mờ phía sau */}
            <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute top-0 right-0 p-6 opacity-10 text-8xl select-none pointer-events-none">✨</div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👑</span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {subscription.status === 'Active' ? 'Gói Đang Sử Dụng' : 'Trạng Thái Gói Hội Viên'}
                  </span>
                </div>
                {subscription.status === 'Active' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Đang hoạt động (Active)</span>
                  </div>
                ) : subscription.status === 'Expired' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Đã hết hạn (Expired)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/30 text-slate-200 border border-slate-400/30">
                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                    <span>Chưa kích hoạt (Free Tier)</span>
                  </div>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
                {subscription.planName}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mb-6 max-w-xl leading-relaxed">
                {subscription.status === 'Active'
                  ? 'Gói học chuyên sâu dành cho người học Kaiwa: Tự động hồi phục hạn ngạch AI theo chu kỳ 5 giờ & 1 tuần, kết hợp luyện tập đối thoại AI không giới hạn tình huống.'
                  : 'Bạn hiện đang sử dụng chế độ trả theo lượt (Pay-As-You-Go) bằng số dư Credit nạp thêm. Đăng ký Gói Hội Viên Tháng để mở khóa hạn ngạch AI tự động hồi phục mỗi 5 giờ và mỗi tuần.'}
              </p>

              {/* Tính năng nổi bật */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10 text-xs text-slate-200">
                {subscription.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold shrink-0">✓</span>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-slate-400 block">Thời hạn sử dụng còn lại:</span>
                {subscription.status === 'Active' && subscription.expiresAt ? (
                  <span className="text-sm sm:text-base font-bold text-amber-300">
                    Còn {subscription.daysRemaining} ngày (Hết hạn ngày: {new Date(subscription.expiresAt).toLocaleDateString('vi-VN')})
                  </span>
                ) : subscription.status === 'Expired' && subscription.expiresAt ? (
                  <span className="text-sm sm:text-base font-bold text-rose-300">
                    Đã hết hạn vào ngày {new Date(subscription.expiresAt).toLocaleDateString('vi-VN')}
                  </span>
                ) : (
                  <span className="text-sm sm:text-base font-bold text-slate-300">
                    Bạn chưa đăng ký gói hội viên tháng nào
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/credits')}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold transition cursor-pointer shadow-sm"
                >
                  {subscription.status === 'Active' ? 'Nâng cấp / Đổi gói' : 'Đăng ký Gói Tháng ngay'}
                </button>
              </div>
            </div>
          </div>
          {/* Cột Phải: Thẻ Credit Nạp Thêm (Pay-As-You-Go Extra Credits) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Credit Nạp Thêm
                </span>
                <span className="text-xl">🪙</span>
              </div>

              <div className="my-2">
                <div className="text-3xl sm:text-4xl font-extrabold text-[#071A44]">
                  {extraCredits}
                  <span className="text-sm font-semibold text-slate-400 ml-1.5">Credits</span>
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Đây là số dư credit vĩnh viễn (không bao giờ hết hạn). Khi bạn sử dụng vượt trần hạn ngạch 5 giờ của Gói Tháng, hệ thống sẽ tự động trừ vào số credit này để bạn không bị ngắt quãng bài học.
                </p>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 leading-relaxed">
                💡 <span className="font-semibold">Mẹo tiết kiệm:</span> Khi còn hạn ngạch 5 giờ, bài học hoàn toàn miễn phí mà không tốn 1 credit nạp thêm nào!
              </div>

              {/* Chức năng: Cho phép dùng credit khi hết quota */}
              <div className="mt-4 pt-3.5 border-t border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-[#071A44] block">
                      Dùng Credit khi hết Quota
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      {allowAutoUseExtraCredits
                        ? 'Tự động trừ credit nạp thêm để học tiếp.'
                        : 'Dừng khi hết hạn ngạch 5h (chờ hồi phục).'}
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={allowAutoUseExtraCredits}
                      onChange={(e) => handleToggleAutoUseCredit(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0878EE]"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100">
              <Link
                to="/credits"
                className="w-full py-2.5 px-4 rounded-xl bg-[#0878EE] hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition"
              >
                <span>+ Nạp thêm Credit</span>
              </Link>
            </div>
          </div>
        </div>

        {/* KHỐI 2: DUAL-WINDOW ROLLING QUOTA (TÍNH TOÁN ĐỘNG TỪ DATABASE) */}
        <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200/80 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h2 className="text-lg sm:text-xl font-bold text-[#071A44]">
                  Dual-Window Rolling Quota (Hạn Ngạch AI 2 Tầng)
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Cơ chế giới hạn cuộn thông minh giúp phân bổ tài nguyên AI công bằng và ổn định (Đồng bộ trực tiếp theo các phiên học thật).
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Mô hình AI: <strong>Gemini 3.1 Flash / Live AI</strong></span>
            </div>
          </div>

          {/* 2 Khối Quota hiển thị tương tự ảnh Antigravity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* TẦNG 1: WEEKLY LIMIT */}
            <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-[#0F172A] text-white border border-slate-800 shadow-md flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                    Chu kỳ tuần (Weekly Quota)
                  </span>
                  <h3 className="text-base font-bold text-slate-100">
                    Weekly Limit Remaining
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>⏳ Resets in {weeklyLimit.resetsInText}</span>
                  </p>
                </div>

                {/* Vòng tròn tiến trình SVG */}
                <div className="relative flex items-center justify-center shrink-0">
                  <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-400 transition-all duration-700 ease-out"
                      strokeDasharray={`${weeklyLimit.remainingPercent}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute text-sm font-extrabold text-emerald-400">
                    {weeklyLimit.remainingPercent}%
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Đã sử dụng: <strong className="text-slate-200">{weeklyLimit.usedCredits}</strong> / {weeklyLimit.totalCredits} credits</span>
                <span className="text-emerald-400 font-medium">Còn {Math.max(0, weeklyLimit.totalCredits - weeklyLimit.usedCredits)} credits</span>
              </div>
            </div>

            {/* TẦNG 2: FIVE HOUR LIMIT */}
            <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-[#0F172A] text-white border border-slate-800 shadow-md flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider mb-1">
                    Chu kỳ 5 giờ (Rolling 5-Hour)
                  </span>
                  <h3 className="text-base font-bold text-slate-100">
                    Five Hour Limit Remaining
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>⚡ Resets in {fiveHourLimit.resetsInText}</span>
                  </p>
                </div>

                {/* Vòng tròn tiến trình SVG */}
                <div className="relative flex items-center justify-center shrink-0">
                  <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-400 transition-all duration-700 ease-out"
                      strokeDasharray={`${fiveHourLimit.remainingPercent}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute text-sm font-extrabold text-emerald-400">
                    {fiveHourLimit.remainingPercent}%
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Đã sử dụng: <strong className="text-slate-200">{fiveHourLimit.usedCredits}</strong> / {fiveHourLimit.totalCredits} credits</span>
                <span className="text-emerald-400 font-medium">Còn {Math.max(0, fiveHourLimit.totalCredits - fiveHourLimit.usedCredits)} credits</span>
              </div>
            </div>
          </div>

          {/* Hộp thuyết minh cơ chế chuyển đổi tự động */}
          <div className="mt-6 p-4 rounded-xl bg-blue-50/70 border border-blue-200/60 text-xs text-blue-900 flex items-start gap-3">
            <span className="text-lg shrink-0">ℹ️</span>
            <div className="space-y-1">
              <span className="font-bold block">Nguyên lý hoạt động Hạn Ngạch & Credit Nạp Thêm:</span>
              <p className="text-slate-600 leading-relaxed">
                Mỗi khi bạn gửi tin nhắn thoại hoặc hỏi đáp AI trong bài kịch bản, hệ thống sẽ tính số tokens thực tế tiêu thụ và trừ trước vào <strong>Hạn ngạch 5 giờ</strong>. Khi hạn mức 5 giờ hết, nếu bạn bật chức năng <strong>"Dùng Credit khi hết Quota"</strong>, hệ thống sẽ tự động trừ vào số Credit Nạp Thêm để bạn tiếp tục cuộc trò chuyện không bị gián đoạn.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
