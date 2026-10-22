import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { creditService } from '../services/creditService';
import { subscriptionPlanService, type SubscriptionPlanItem } from '../services/subscriptionPlanService';
import { formatDateTime } from '../utils/dateUtils';
import type { CreditTransaction } from '../types/credit';

export const PaymentReturnView: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const orderCodeParam = searchParams.get('orderCode');
  const statusParam = searchParams.get('status');
  const cancelParam = searchParams.get('cancel');
  const typeParam = searchParams.get('type');
  const planIdParam = searchParams.get('planId');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [transaction, setTransaction] = useState<CreditTransaction | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [activatedSubscription, setActivatedSubscription] = useState<SubscriptionPlanItem | null>(null);

  useEffect(() => {
    const verify = async () => {
      setIsLoading(true);

      // Nếu có query cancel=true hoặc status=CANCELLED
      if (cancelParam === 'true' || statusParam === 'CANCELLED') {
        setIsSuccess(false);
        setIsLoading(false);
        return;
      }

      const applySubscriptionIfMatching = (trans?: CreditTransaction | null) => {
        const isSubscription =
          typeParam === 'subscription' ||
          trans?.type?.toLowerCase() === 'subscription' ||
          (trans?.description && trans.description.includes('Đăng ký'));

        if (isSubscription) {
          const plans = subscriptionPlanService.getPlans();
          let matchedPlan: SubscriptionPlanItem | undefined;

          if (planIdParam) {
            matchedPlan = plans.find((p) => p.id === planIdParam);
          }
          if (!matchedPlan && trans?.description) {
            matchedPlan = plans.find(
              (p) => trans.description?.includes(p.name) || trans.description?.includes(p.id)
            );
          }
          if (!matchedPlan) {
            matchedPlan = plans[0];
          }

          if (matchedPlan) {
            subscriptionPlanService.setUserSubscription(matchedPlan);
            setActivatedSubscription(matchedPlan);
          }
        }
      };

      if (orderCodeParam) {
        try {
          const res = await creditService.verifyOrder(orderCodeParam);
          if (res.success && res.data) {
            setTransaction(res.data);
            const success = res.data.status === 'Paid' || statusParam === 'PAID';
            setIsSuccess(success);
            if (success) {
              applySubscriptionIfMatching(res.data);
              // Đồng bộ số dư mới nhất về Header và AuthContext ngay lập tức
              await Promise.all([
                creditService.getHistory(1, 1),
                refreshUser(),
              ]);
            }
          } else {
            const success = statusParam === 'PAID';
            setIsSuccess(success);
            if (success) {
              applySubscriptionIfMatching(null);
              await Promise.all([
                creditService.getHistory(1, 1),
                refreshUser(),
              ]);
            }
          }
        } catch {
          const success = statusParam === 'PAID';
          setIsSuccess(success);
          if (success) {
            applySubscriptionIfMatching(null);
            await Promise.all([
              creditService.getHistory(1, 1),
              refreshUser(),
            ]);
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        const success = statusParam === 'PAID';
        setIsSuccess(success);
        if (success) {
          applySubscriptionIfMatching(null);
          await Promise.all([
            creditService.getHistory(1, 1),
            refreshUser(),
          ]);
        }
        setIsLoading(false);
      }
    };

    verify();
  }, [orderCodeParam, statusParam, cancelParam, typeParam, planIdParam, refreshUser]);

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-white rounded-2xl border border-[#E6EDF5] p-12 text-center shadow-sm">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-[#0878EE] rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-base font-bold text-[#071A44]">Đang xác minh kết quả thanh toán PayOS...</h2>
          <p className="text-xs text-[#71809A] mt-1">Hệ thống đang đồng bộ dữ liệu giao dịch trực tiếp với PayOS, vui lòng chờ trong giây lát.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-16 px-4">
      {isSuccess ? (
        <div className="bg-white rounded-2xl border border-[#E6EDF5] p-8 sm:p-10 text-center shadow-md">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-emerald-50 border-2 border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold shadow-sm">
            ✓
          </div>

          <span className="text-xs uppercase tracking-wider text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 inline-block mb-3">
            {activatedSubscription ? 'Nâng Cấp Gói Thành Công' : 'Thanh Toán Thành Công'}
          </span>

          <h1 className="text-2xl font-extrabold text-[#071A44] mb-2">
            {activatedSubscription ? `Kích Hoạt ${activatedSubscription.name}!` : 'Nạp Credit Hoàn Tất!'}
          </h1>
          <p className="text-xs text-[#71809A] max-w-sm mx-auto mb-6">
            {activatedSubscription
              ? 'Giao dịch qua cổng PayOS đã hoàn tất. Hạn ngạch AI mỗi 5 giờ và mỗi tuần của bạn đã được cập nhật thành công!'
              : 'Giao dịch thanh toán qua cổng PayOS đã được xử lý thành công. Số dư credit của bạn đã được cập nhật.'}
          </p>

          {/* Details Box */}
          <div className="bg-slate-50 border border-[#E6EDF5] rounded-xl p-4 mb-8 text-xs text-left space-y-2.5">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-[#71809A]">Tài khoản thụ hưởng:</span>
              <span className="font-semibold text-[#071A44] truncate max-w-[200px]" title={user?.fullName || user?.email}>
                {user?.fullName || user?.email || 'Tài khoản JCAP'}
              </span>
            </div>

            {activatedSubscription && (
              <>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-[#71809A]">Gói hội viên kích hoạt:</span>
                  <span className="font-bold text-[#0878EE]">{activatedSubscription.name}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-[#71809A]">Hạn mức phục hồi:</span>
                  <span className="font-semibold text-emerald-700">
                    {activatedSubscription.creditsAmount} credits/tuần & {activatedSubscription.fiveHourQuota} credits/5h
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-[#71809A]">Thời hạn sử dụng:</span>
                  <span className="font-medium text-[#071A44]">30 ngày (Kể từ hôm nay)</span>
                </div>
              </>
            )}

            {orderCodeParam && (
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-[#71809A]">Mã đơn hàng PayOS:</span>
                <span className="font-mono font-bold text-[#071A44]">#{orderCodeParam}</span>
              </div>
            )}

            {transaction && transaction.type !== 'Subscription' && (
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-[#71809A]">Số credit được cộng:</span>
                <span className="font-bold text-emerald-600">+{transaction.amount} Credits</span>
              </div>
            )}

            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-[#71809A]">Số dư ví tài khoản:</span>
              <span className="font-extrabold text-[#0878EE] flex items-center gap-1">
                <span>🪙</span>
                <span>{user?.creditBalance ?? (transaction?.currentCreditBalance ?? '...')}</span>
                <span>Credits</span>
              </span>
            </div>

            {transaction && (
              <div className="flex justify-between items-center">
                <span className="text-[#71809A]">Thời gian giao dịch:</span>
                <span className="text-[#071A44]">
                  {formatDateTime(transaction.createdAt)}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {activatedSubscription ? (
              <>
                <Button
                  variant="primary"
                  size="md"
                  className="w-full sm:w-auto font-bold"
                  onClick={() => navigate('/subscription')}
                >
                  Xem Gói & Hạn Mức ➔
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full sm:w-auto"
                  onClick={() => navigate('/scenarios')}
                >
                  Vào Luyện Nói Ngay
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="md"
                  className="w-full sm:w-auto font-bold"
                  onClick={() => navigate('/scenarios')}
                >
                  Vào Luyện Nói Ngay ➔
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full sm:w-auto"
                  onClick={() => navigate('/credits/history')}
                >
                  Xem Lịch Sử Giao Dịch
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E6EDF5] p-8 sm:p-10 text-center shadow-md">
          {/* Cancel/Fail Icon */}
          <div className="w-16 h-16 bg-red-50 border-2 border-red-200 text-[#D92D20] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold shadow-sm">
            ✕
          </div>

          <span className="text-xs uppercase tracking-wider text-red-700 font-bold bg-red-50 px-3 py-1 rounded-full border border-red-200 inline-block mb-3">
            Chưa Hoàn Tất
          </span>

          <h1 className="text-2xl font-extrabold text-[#071A44] mb-2">
            Giao Dịch Đã Bị Hủy
          </h1>
          <p className="text-xs text-[#71809A] max-w-sm mx-auto mb-6">
            Yêu cầu thanh toán của bạn chưa được thực hiện hoặc đã bị hủy trên cổng PayOS. Tài khoản chưa bị trừ tiền.
          </p>

          {orderCodeParam && (
            <div className="bg-slate-50 border border-[#E6EDF5] rounded-xl p-3 mb-8 text-xs">
              <span className="text-[#71809A]">Mã đơn liên kết: </span>
              <span className="font-mono font-semibold text-[#071A44]">#{orderCodeParam}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              className="w-full sm:w-auto font-bold"
              onClick={() => navigate('/credits')}
            >
              Thử Lại (Chọn Gói Khác)
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="w-full sm:w-auto"
              onClick={() => navigate('/scenarios')}
            >
              Về Trang Chủ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

