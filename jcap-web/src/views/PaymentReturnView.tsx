import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { creditService } from '../services/creditService';
import type { CreditTransaction } from '../types/credit';

export const PaymentReturnView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const orderCodeParam = searchParams.get('orderCode');
  const statusParam = searchParams.get('status');
  const cancelParam = searchParams.get('cancel');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [transaction, setTransaction] = useState<CreditTransaction | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    const verify = async () => {
      setIsLoading(true);

      // Nếu có query cancel=true hoặc status=CANCELLED
      if (cancelParam === 'true' || statusParam === 'CANCELLED') {
        setIsSuccess(false);
        setIsLoading(false);
        return;
      }

      if (orderCodeParam) {
        try {
          const res = await creditService.verifyOrder(orderCodeParam);
          if (res.success && res.data) {
            setTransaction(res.data);
            const success = res.data.status === 'Paid' || statusParam === 'PAID';
            setIsSuccess(success);
            if (success) {
              // Đồng bộ số dư mới nhất về Header và LocalStorage ngay lập tức
              await creditService.getHistory(1, 1);
            }
          } else {
            const success = statusParam === 'PAID';
            setIsSuccess(success);
            if (success) {
              await creditService.getHistory(1, 1);
            }
          }
        } catch {
          const success = statusParam === 'PAID';
          setIsSuccess(success);
          if (success) {
            await creditService.getHistory(1, 1);
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        const success = statusParam === 'PAID';
        setIsSuccess(success);
        if (success) {
          await creditService.getHistory(1, 1);
        }
        setIsLoading(false);
      }
    };

    verify();
  }, [orderCodeParam, statusParam, cancelParam]);

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-white rounded-2xl border border-[#E6EDF5] p-12 text-center shadow-sm">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-[#0878EE] rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-base font-bold text-[#071A44]">Đang xác minh kết quả thanh toán...</h2>
          <p className="text-xs text-[#71809A] mt-1">Hệ thống đang đồng bộ dữ liệu với cổng PayOS, vui lòng chờ trong giây lát.</p>
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
            Thanh Toán Thành Công
          </span>

          <h1 className="text-2xl font-extrabold text-[#071A44] mb-2">
            Nạp Credit Hoàn Tất!
          </h1>
          <p className="text-xs text-[#71809A] max-w-sm mx-auto mb-6">
            Giao dịch thanh toán qua cổng PayOS đã được xử lý thành công. Số dư credit của bạn đã được cập nhật.
          </p>

          {/* Details Box */}
          <div className="bg-slate-50 border border-[#E6EDF5] rounded-xl p-4 mb-8 text-xs text-left space-y-2.5">
            {orderCodeParam && (
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-[#71809A]">Mã đơn hàng PayOS:</span>
                <span className="font-mono font-bold text-[#071A44]">#{orderCodeParam}</span>
              </div>
            )}
            {transaction && (
              <>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-[#71809A]">Số credit được cộng:</span>
                  <span className="font-bold text-emerald-600">+{transaction.amount} Credits</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#71809A]">Thời gian giao dịch:</span>
                  <span className="text-[#071A44]">
                    {new Date(transaction.createdAt).toLocaleString('vi-VN')}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
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
