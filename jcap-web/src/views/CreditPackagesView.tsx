import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { creditService } from '../services/creditService';
import { profileService } from '../services/profileService';
import type { CreditPackage } from '../types/credit';

export const CreditPackagesView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cancelParam = searchParams.get('cancel');
  const statusParam = searchParams.get('status');

  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [purchasingId, setPurchasingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        const u = JSON.parse(saved);
        return u.creditBalance ?? 0;
      }
    } catch {
      // ignore
    }
    return 0;
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

  useEffect(() => {
    loadPackages();

    if (cancelParam === 'true' || statusParam === 'CANCELLED') {
      setError('Yêu cầu thanh toán đã bị hủy. Bạn có thể chọn gói khác để thử lại.');
    }

    // Đồng bộ hồ sơ và số dư chuẩn từ máy chủ khi vào trang nạp tiền
    profileService.getProfile().catch(() => {});
    creditService.getHistory(1, 1).then((res) => {
      if (res.success && res.data && res.data.currentCreditBalance !== undefined) {
        setCurrentBalance(res.data.currentCreditBalance);
      }
    }).catch(() => {});

    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail?.creditBalance !== undefined) {
        setCurrentBalance(customEvent.detail.creditBalance);
      }
    };

    window.addEventListener('jcap_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
  }, [cancelParam, statusParam]);

  const handlePurchase = async (pkg: CreditPackage) => {
    setPurchasingId(pkg.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await creditService.purchasePackage(pkg.id);
      if (res.success && res.data) {
        if (res.data.checkoutUrl) {
          // Chuyển hướng sang cổng thanh toán thật PayOS
          window.location.href = res.data.checkoutUrl;
        } else if (res.data.isMock) {
          // Chế độ Mock
          setSuccessMessage(`Đã nạp thành công ${res.data.addedCredits} Credits (Chế độ Thử nghiệm)!`);
          if (res.data.newCreditBalance !== undefined) {
            setCurrentBalance(res.data.newCreditBalance);
          }
        } else {
          setSuccessMessage(res.message || 'Nạp credit thành công!');
        }
      } else {
        setError(res.message || 'Không thể xử lý giao dịch nạp credit.');
      }
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi tạo liên kết thanh toán.');
    } finally {
      setPurchasingId(null);
    }
  };

  const formatVnd = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      {/* Header Banner */}
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

          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-5 text-right min-w-[200px] flex flex-col items-start md:items-end justify-center">
            <span className="text-xs uppercase tracking-wider text-blue-100 font-medium">Số dư hiện tại</span>
            <div className="text-3xl font-extrabold text-white mt-1 flex items-center gap-2">
              <span className="text-amber-300">🪙</span>
              <span>{currentBalance}</span>
              <span className="text-sm font-normal text-blue-200">Credits</span>
            </div>
            <Link
              to="/credits/history"
              className="text-xs text-white underline underline-offset-4 hover:text-amber-300 mt-2 font-medium transition-colors"
            >
              Xem lịch sử giao dịch ➔
            </Link>
          </div>
        </div>

        {/* Decorative background circle */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* Thông báo thông điệp */}
      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-[#12B76A]/30 rounded-xl flex items-center justify-between text-sm text-[#027A48] animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-xl">✅</span>
            <span>{successMessage}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/credits/history')}
          >
            Kiểm tra Lịch sử
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-[#D92D20]/30 rounded-xl flex items-center gap-3 text-sm text-[#D92D20]">
          <span className="text-xl">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Section Title */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-[#071A44]">Chọn Gói Nạp Phù Hợp</h2>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {packages.map((pkg, index) => {
            const isPopular = pkg.name.toLowerCase().includes('tiêu chuẩn') || index === 1;
            const isBestValue = pkg.name.toLowerCase().includes('chuyên sâu') || index === 3;
            const unitPrice = Math.round(pkg.price / (pkg.credits || 1));

            return (
              <div
                key={pkg.id}
                className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between p-6 relative ${
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
                    variant={isPopular || isBestValue ? 'primary' : 'secondary'}
                    size="md"
                    className="w-full font-bold shadow-sm"
                    disabled={purchasingId !== null}
                    onClick={() => handlePurchase(pkg)}
                  >
                    {purchasingId === pkg.id ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/80 border-t-white rounded-full animate-spin"></div>
                        Đang khởi tạo...
                      </span>
                    ) : (
                      'Nạp Ngay'
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
