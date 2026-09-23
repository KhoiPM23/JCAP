import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { creditService } from '../services/creditService';
import type { CreditTransaction, CreditHistoryResponse } from '../types/credit';

export const CreditHistoryView: React.FC = () => {
  const [data, setData] = useState<CreditHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const pageSize = 10;

  const fetchHistory = async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await creditService.getHistory(page, pageSize);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.message || 'Không thể tải lịch sử giao dịch.');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(currentPage);
  }, [currentPage]);

  const handleContinuePayment = async (orderCode?: string) => {
    if (!orderCode) return;
    setActionLoadingId(`continue-${orderCode}`);
    try {
      const res = await creditService.continuePayment(orderCode);
      if (res.success && res.data) {
        if (res.data.checkoutUrl) {
          window.location.href = res.data.checkoutUrl;
        } else if (res.data.isMock) {
          await fetchHistory(currentPage);
        }
      } else {
        alert(res.message || 'Không thể tiếp tục thanh toán đơn hàng này.');
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tiếp tục thanh toán.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelOrder = async (orderCode?: string) => {
    if (!orderCode) return;
    if (!window.confirm('Bạn có chắc chắn muốn hủy giao dịch nạp credit này không?')) {
      return;
    }

    setActionLoadingId(`cancel-${orderCode}`);
    try {
      const res = await creditService.cancelOrder(orderCode);
      if (res.success) {
        await fetchHistory(currentPage);
      } else {
        alert(res.message || 'Không thể hủy đơn hàng này.');
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi khi hủy đơn hàng.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Thành công
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Chờ thanh toán
          </span>
        );
      case 'cancelled':
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            Đã hủy
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            {status}
          </span>
        );
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type.toLowerCase()) {
      case 'topup':
        return 'Nạp Credit';
      case 'deduct':
        return 'Sử dụng hội thoại';
      case 'voucher':
        return 'Mã quà tặng';
      default:
        return type;
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      {/* Header & Balance card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-6 border-b border-[#E6EDF5]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/credits" className="text-xs text-[#0878EE] hover:underline font-medium">
              ← Quay lại Nạp Credit
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-[#071A44]">Lịch Sử Giao Dịch Credit</h1>
          <p className="text-xs text-[#71809A] mt-1">
            Tra cứu biến động số dư và theo dõi các khoản nạp qua cổng PayOS.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-right flex items-center gap-3">
            <span className="text-2xl">🪙</span>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-amber-800 font-semibold block">Số dư hiện tại</span>
              <span className="text-xl font-extrabold text-amber-900">
                {data?.currentCreditBalance ?? 0} <span className="text-xs font-normal">Credits</span>
              </span>
            </div>
          </div>

          <Link to="/credits">
            <Button variant="primary" size="md">
              + Nạp Thêm
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-[#D92D20]/30 rounded-xl flex items-center gap-3 text-sm text-[#D92D20]">
          <span className="text-xl">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Table Content */}
      <div className="bg-white rounded-xl border border-[#E6EDF5] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-[#0878EE] rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs text-[#71809A]">Đang tải dữ liệu giao dịch...</p>
          </div>
        ) : !data || data.transactions.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">
              📋
            </div>
            <h3 className="text-base font-semibold text-[#071A44] mb-1">Chưa có giao dịch nào</h3>
            <p className="text-xs text-[#71809A] mb-4">Bạn chưa thực hiện bất kỳ giao dịch nạp hoặc sử dụng credit nào.</p>
            <Link to="/credits">
              <Button variant="primary" size="sm">
                Nạp Credit Ngay
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-[#E6EDF5] text-[#71809A] uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-6">Thời Gian</th>
                  <th className="py-3.5 px-6">Loại Giao Dịch</th>
                  <th className="py-3.5 px-6 text-right">Biến Động</th>
                  <th className="py-3.5 px-6">Trạng Thái</th>
                  <th className="py-3.5 px-6">Diễn Giải</th>
                  <th className="py-3.5 px-6">Mã Đơn PayOS</th>
                  <th className="py-3.5 px-6 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6EDF5]">
                {data.transactions.map((tx: CreditTransaction) => {
                  const isPositive = tx.amount > 0;
                  const isPending = tx.status.toLowerCase() === 'pending';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-6 text-[#071A44] font-medium whitespace-nowrap">
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className="py-4 px-6 text-[#475467] whitespace-nowrap">
                        {getTypeLabel(tx.type)}
                      </td>
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <span
                          className={`font-bold text-sm ${
                            isPositive ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {isPositive ? `+${tx.amount}` : tx.amount}
                        </span>{' '}
                        <span className="text-[11px] text-[#71809A]">Credits</span>
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        {getStatusBadge(tx.status)}
                      </td>
                      <td className="py-4 px-6 text-[#475467] max-w-xs truncate">
                        {tx.description || '—'}
                      </td>
                      <td className="py-4 px-6 text-[#71809A] font-mono text-[11px] whitespace-nowrap">
                        {tx.payOsOrderCode ? `#${tx.payOsOrderCode}` : '—'}
                      </td>
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        {isPending && tx.payOsOrderCode ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              disabled={!!actionLoadingId}
                              onClick={() => handleContinuePayment(tx.payOsOrderCode)}
                              className="bg-[#0878EE] hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
                              title="Tiếp tục sang cổng PayOS để hoàn tất nạp tiền"
                            >
                              {actionLoadingId === `continue-${tx.payOsOrderCode}` ? (
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <span>💳</span>
                              )}
                              Tiếp tục nạp
                            </button>
                            <button
                              type="button"
                              disabled={!!actionLoadingId}
                              onClick={() => handleCancelOrder(tx.payOsOrderCode)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                              title="Hủy đơn nạp tiền này"
                            >
                              {actionLoadingId === `cancel-${tx.payOsOrderCode}` ? (
                                <span className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <span>✕</span>
                              )}
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#71809A] text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#E6EDF5] bg-slate-50">
            <span className="text-xs text-[#71809A]">
              Trang <span className="font-semibold text-[#071A44]">{data.page}</span> trên{' '}
              <span className="font-semibold text-[#071A44]">{data.totalPages}</span> ({data.totalCount} giao dịch)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1 || isLoading}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= data.totalPages || isLoading}
                onClick={() => setCurrentPage((prev) => Math.min(data.totalPages, prev + 1))}
              >
                Tiếp
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

