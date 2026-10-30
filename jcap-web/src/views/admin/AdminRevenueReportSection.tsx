import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { formatDateTime } from '../../utils/dateUtils';

export type TimeRange = 'day' | 'week' | 'month' | 'year';

interface RevenueDataPoint {
  key: string;
  label: string;
  fullLabel: string;
  subscriptionRevenue: number;
  creditRevenue: number;
  subscriptionCount: number;
  creditCount: number;
}

// ============================================================================
// DỮ LIỆU MOCK DOANH THU THEO CÁC MỐC THỜI GIAN (NGÀY, TUẦN, THÁNG, NĂM)
// ============================================================================
const MOCK_REVENUE_BY_TIMEFRAME: Record<TimeRange, RevenueDataPoint[]> = {
  // 1. THEO NGÀY: 7 ngày gần nhất (16/10 - 22/10/2026)
  day: [
    { key: 'd1', label: 'T2 (16/10)', fullLabel: 'Thứ Hai, 16/10/2026', subscriptionRevenue: 1194000, creditRevenue: 680000, subscriptionCount: 4, creditCount: 8 },
    { key: 'd2', label: 'T3 (17/10)', fullLabel: 'Thứ Ba, 17/10/2026', subscriptionRevenue: 1543000, creditRevenue: 920000, subscriptionCount: 6, creditCount: 11 },
    { key: 'd3', label: 'T4 (18/10)', fullLabel: 'Thứ Tư, 18/10/2026', subscriptionRevenue: 2094000, creditRevenue: 1250000, subscriptionCount: 8, creditCount: 15 },
    { key: 'd4', label: 'T5 (19/10)', fullLabel: 'Thứ Năm, 19/10/2026', subscriptionRevenue: 1745000, creditRevenue: 890000, subscriptionCount: 6, creditCount: 10 },
    { key: 'd5', label: 'T6 (20/10)', fullLabel: 'Thứ Sáu, 20/10/2026', subscriptionRevenue: 2443000, creditRevenue: 1480000, subscriptionCount: 9, creditCount: 18 },
    { key: 'd6', label: 'T7 (21/10)', fullLabel: 'Thứ Bảy, 21/10/2026', subscriptionRevenue: 3490000, creditRevenue: 2100000, subscriptionCount: 12, creditCount: 24 },
    { key: 'd7', label: 'CN (22/10)', fullLabel: 'Chủ Nhật, 22/10/2026 (Hôm nay)', subscriptionRevenue: 3839000, creditRevenue: 2450000, subscriptionCount: 14, creditCount: 28 },
  ],

  // 2. THEO TUẦN: 4 tuần trong tháng 10/2026
  week: [
    { key: 'w1', label: 'Tuần 1', fullLabel: 'Tuần 1 (01/10 - 07/10/2026)', subscriptionRevenue: 8950000, creditRevenue: 4800000, subscriptionCount: 32, creditCount: 62 },
    { key: 'w2', label: 'Tuần 2', fullLabel: 'Tuần 2 (08/10 - 14/10/2026)', subscriptionRevenue: 11200000, creditRevenue: 6350000, subscriptionCount: 41, creditCount: 78 },
    { key: 'w3', label: 'Tuần 3', fullLabel: 'Tuần 3 (15/10 - 21/10/2026)', subscriptionRevenue: 13450000, creditRevenue: 7900000, subscriptionCount: 52, creditCount: 96 },
    { key: 'w4', label: 'Tuần 4', fullLabel: 'Tuần 4 (22/10 - 28/10/2026)', subscriptionRevenue: 10800000, creditRevenue: 5600000, subscriptionCount: 38, creditCount: 68 },
  ],

  // 3. THEO THÁNG: 12 tháng của năm 2026
  month: [
    { key: 'm1', label: 'T1', fullLabel: 'Tháng 01/2026', subscriptionRevenue: 14500000, creditRevenue: 8200000, subscriptionCount: 55, creditCount: 102 },
    { key: 'm2', label: 'T2', fullLabel: 'Tháng 02/2026', subscriptionRevenue: 18200000, creditRevenue: 10400000, subscriptionCount: 68, creditCount: 130 },
    { key: 'm3', label: 'T3', fullLabel: 'Tháng 03/2026', subscriptionRevenue: 22000000, creditRevenue: 12800000, subscriptionCount: 84, creditCount: 155 },
    { key: 'm4', label: 'T4', fullLabel: 'Tháng 04/2026', subscriptionRevenue: 25500000, creditRevenue: 14200000, subscriptionCount: 96, creditCount: 172 },
    { key: 'm5', label: 'T5', fullLabel: 'Tháng 05/2026', subscriptionRevenue: 28000000, creditRevenue: 15600000, subscriptionCount: 106, creditCount: 190 },
    { key: 'm6', label: 'T6', fullLabel: 'Tháng 06/2026', subscriptionRevenue: 31200000, creditRevenue: 17500000, subscriptionCount: 118, creditCount: 212 },
    { key: 'm7', label: 'T7', fullLabel: 'Tháng 07/2026', subscriptionRevenue: 34800000, creditRevenue: 19400000, subscriptionCount: 130, creditCount: 236 },
    { key: 'm8', label: 'T8', fullLabel: 'Tháng 08/2026', subscriptionRevenue: 37500000, creditRevenue: 21000000, subscriptionCount: 142, creditCount: 255 },
    { key: 'm9', label: 'T9', fullLabel: 'Tháng 09/2026', subscriptionRevenue: 40200000, creditRevenue: 22800000, subscriptionCount: 154, creditCount: 278 },
    { key: 'm10', label: 'T10', fullLabel: 'Tháng 10/2026 (Hiện tại)', subscriptionRevenue: 44400000, creditRevenue: 24650000, subscriptionCount: 163, creditCount: 304 },
    { key: 'm11', label: 'T11', fullLabel: 'Tháng 11/2026 (Dự phóng)', subscriptionRevenue: 48000000, creditRevenue: 27000000, subscriptionCount: 180, creditCount: 330 },
    { key: 'm12', label: 'T12', fullLabel: 'Tháng 12/2026 (Dự phóng)', subscriptionRevenue: 52500000, creditRevenue: 29500000, subscriptionCount: 195, creditCount: 360 },
  ],

  // 4. THEO NĂM: 2024, 2025, 2026
  year: [
    { key: 'y2024', label: '2024', fullLabel: 'Năm 2024 (Năm khởi động)', subscriptionRevenue: 120000000, creditRevenue: 85000000, subscriptionCount: 450, creditCount: 1050 },
    { key: 'y2025', label: '2025', fullLabel: 'Năm 2025 (Tăng trưởng)', subscriptionRevenue: 245000000, creditRevenue: 142000000, subscriptionCount: 920, creditCount: 1820 },
    { key: 'y2026', label: '2026 (YTD)', fullLabel: 'Năm 2026 (Đang diễn ra)', subscriptionRevenue: 396800000, creditRevenue: 223050000, subscriptionCount: 1480, creditCount: 2760 },
  ],
};

// Top gói bán chạy nhất (Mock dữ liệu chi tiết từng gói)
const TOP_PACKAGES_DATA = [
  { id: '1', name: 'Gói Tháng Pro Max (Chuyên Sâu)', type: 'subscription', price: 349000, orders: 124, revenue: 43276000, badge: 'TIẾT KIỆM NHẤT', badgeColor: 'bg-amber-500' },
  { id: '2', name: 'Gói Tháng Pro (Cơ Bản)', type: 'subscription', price: 199000, orders: 188, revenue: 37412000, badge: 'PHỔ BIẾN NHẤT', badgeColor: 'bg-[#0878EE]' },
  { id: '3', name: 'Gói Nạp Tiêu Chuẩn (500 Credits)', type: 'credit', price: 100000, orders: 165, revenue: 16500000, badge: 'PHỔ BIẾN', badgeColor: 'bg-blue-600' },
  { id: '4', name: 'Gói Nạp Nâng Cao (1000 Credits)', type: 'credit', price: 190000, orders: 74, revenue: 14060000, badge: 'TIẾT KIỆM', badgeColor: 'bg-amber-600' },
  { id: '5', name: 'Gói Nạp Tối Đa (2500 Credits)', type: 'credit', price: 450000, orders: 28, revenue: 12600000, badge: 'VIP', badgeColor: 'bg-purple-600' },
  { id: '6', name: 'Gói Nạp Khởi Động (100 Credits)', type: 'credit', price: 25000, orders: 195, revenue: 4875000, badge: 'TRẢI NGHIỆM', badgeColor: 'bg-slate-500' },
];

export interface AdminRecentTransaction {
  id: string;
  userId: string;
  user: string;
  email: string;
  packageName: string;
  type: 'subscription' | 'credit';
  amount: number;
  credits: number;
  status: string;
  method: string;
  createdAt: string;
}



interface AdminRevenueReportSectionProps {
  onExportReport?: () => void;
}

export const AdminRevenueReportSection: React.FC<AdminRevenueReportSectionProps> = ({
  onExportReport,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [hoveredPoint, setHoveredPoint] = useState<RevenueDataPoint | null>(null);

  // Dữ liệu giao dịch thật từ database
  const [recentTransactions, setRecentTransactions] = useState<AdminRecentTransaction[]>([]);
  const [isLoadingTx, setIsLoadingTx] = useState<boolean>(true);
  const [txError, setTxError] = useState<string | null>(null);

  const fetchRecentTransactions = useCallback(async (silent: boolean = false) => {
    if (!silent) {
      setIsLoadingTx(true);
    }
    setTxError(null);
    try {
      const token = localStorage.getItem('jcap_token');
      const response = await fetch('/api/admin/credits/packages/recent-transactions?limit=20', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData.success && Array.isArray(resData.data)) {
          // Chỉ hiển thị các giao dịch đã thanh toán thành công (Paid)
          const paidOnly = resData.data.filter(
            (tx: AdminRecentTransaction) => tx.status?.toLowerCase() === 'paid'
          );
          setRecentTransactions(paidOnly);
        }
      } else if (!silent) {
        setTxError('Không thể tải dữ liệu giao dịch');
      }
    } catch (err: any) {
      if (!silent) {
        setTxError(err.message || 'Lỗi kết nối máy chủ');
      }
    } finally {
      if (!silent) {
        setIsLoadingTx(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchRecentTransactions(false);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchRecentTransactions(true);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchRecentTransactions(true);
      }
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      clearInterval(interval);
    };
  }, [fetchRecentTransactions]);

  const formatVnd = (val: number): string => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const currentDataset = useMemo(() => {
    return MOCK_REVENUE_BY_TIMEFRAME[timeRange];
  }, [timeRange]);

  // Thống kê tổng hợp theo mốc thời gian đã chọn
  const totals = useMemo(() => {
    let subRev = 0;
    let credRev = 0;
    let subCnt = 0;
    let credCnt = 0;

    currentDataset.forEach((dp) => {
      subRev += dp.subscriptionRevenue;
      credRev += dp.creditRevenue;
      subCnt += dp.subscriptionCount;
      credCnt += dp.creditCount;
    });

    const totalRev = subRev + credRev;
    const totalTransactions = subCnt + credCnt;
    const subPct = totalRev > 0 ? Math.round((subRev / totalRev) * 1000) / 10 : 0;
    const credPct = totalRev > 0 ? Math.round((100 - subPct) * 10) / 10 : 0;
    const aov = totalTransactions > 0 ? Math.round(totalRev / totalTransactions) : 0;

    return {
      subRev,
      credRev,
      totalRev,
      subCnt,
      credCnt,
      totalTransactions,
      subPct,
      credPct,
      aov,
    };
  }, [currentDataset]);

  // Tìm giá trị cao nhất để chuẩn hóa chiều cao cột Bar Chart
  const maxBarValue = useMemo(() => {
    let max = 0;
    currentDataset.forEach((dp) => {
      const total = dp.subscriptionRevenue + dp.creditRevenue;
      if (total > max) max = total;
    });
    return max > 0 ? max : 1;
  }, [currentDataset]);

  // Thông số vẽ SVG Donut Chart
  // Chu vi hình tròn r = 70 => C = 2 * PI * 70 = 439.82
  const CIRCLE_CIRCUMFERENCE = 439.82;
  const subDash = (totals.subPct / 100) * CIRCLE_CIRCUMFERENCE;
  const credDash = (totals.credPct / 100) * CIRCLE_CIRCUMFERENCE;

  // Xử lý xuất file CSV
  const handleExportCSV = () => {
    if (onExportReport) {
      onExportReport();
      return;
    }
    const headers = ['Mốc Thời Gian', 'Doanh Thu Gói Tháng (VND)', 'Lượt Mua Gói Tháng', 'Doanh Thu Credit Lẻ (VND)', 'Lượt Nạp Credit', 'Tổng Doanh Thu (VND)'];
    const rows = currentDataset.map((d) => [
      `"${d.fullLabel}"`,
      d.subscriptionRevenue,
      d.subscriptionCount,
      d.creditRevenue,
      d.creditCount,
      d.subscriptionRevenue + d.creditRevenue,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bao_Cao_Doanh_Thu_JCAP_${timeRange}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Lắng nghe sự kiện xuất CSV từ Header Toolbar của AdminCreditPackagesView
  useEffect(() => {
    const handleCustomExport = () => {
      handleExportCSV();
    };
    window.addEventListener('jcap_export_revenue_csv', handleCustomExport);
    return () => window.removeEventListener('jcap_export_revenue_csv', handleCustomExport);
  }, [currentDataset, timeRange]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Header Toolbar: Bộ lọc thời gian & Nút hành động xuất báo cáo */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold mb-2">
            <span>📈</span> Báo Cáo Doanh Thu Hệ Thống (Mock Data Preview)
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Thống Kê Doanh Thu: Gói Hội Viên Tháng &amp; Gói Nạp Credit
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Phân tích chi tiết nguồn thu nhập, tỷ trọng dòng tiền từ đăng ký gói định kỳ so với nạp credit lẻ theo thời gian thực.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ chuyển đổi thời gian: Ngày, Tuần, Tháng, Năm */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTimeRange('day')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === 'day'
                  ? 'bg-white text-[#0878EE] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📅 Theo Ngày (7 ngày)
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('week')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === 'week'
                  ? 'bg-white text-[#0878EE] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📆 Theo Tuần (4 tuần)
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === 'month'
                  ? 'bg-white text-[#0878EE] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📊 Theo Tháng (12 tháng)
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('year')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeRange === 'year'
                  ? 'bg-white text-[#0878EE] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📈 Theo Năm
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
            title="Tải xuống tệp CSV số liệu"
          >
            <span>📥</span>
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Hàng 4 Thẻ KPI Doanh Thu Nổi Bật */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tổng Doanh Thu */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng Doanh Thu</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">
              💰
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {formatVnd(totals.totalRev)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            <span className="inline-flex items-center text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
              ↑ +18.4%
            </span>
            <span className="text-slate-400">so với kỳ trước</span>
          </div>
        </div>

        {/* KPI 2: Doanh Thu Gói Hội Viên Tháng */}
        <div className="bg-white p-5 rounded-2xl border border-blue-200/80 shadow-xs relative overflow-hidden bg-gradient-to-b from-blue-50/20 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0878EE]">Gói Hội Viên Tháng</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#0878EE] flex items-center justify-center text-sm font-bold">
              👑
            </div>
          </div>
          <div className="text-2xl font-black text-[#0878EE] tracking-tight">
            {formatVnd(totals.subRev)}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-slate-500 font-medium">
            <span>Chiếm <strong className="text-blue-700 font-bold">{totals.subPct}%</strong> doanh thu</span>
            <span>{totals.subCnt} lượt đăng ký</span>
          </div>
        </div>

        {/* KPI 3: Doanh Thu Gói Nạp Credit Lẻ */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-xs relative overflow-hidden bg-gradient-to-b from-amber-50/20 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Gói Nạp Credit (Một lần)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold">
              🪙
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 tracking-tight">
            {formatVnd(totals.credRev)}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-slate-500 font-medium">
            <span>Chiếm <strong className="text-amber-700 font-bold">{totals.credPct}%</strong> doanh thu</span>
            <span>{totals.credCnt} lượt nạp</span>
          </div>
        </div>

        {/* KPI 4: Tổng Số Giao Dịch & AOV */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Giao Dịch &amp; Giá Trị TB</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-bold">
              🧾
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {totals.totalTransactions} <span className="text-xs font-semibold text-slate-400">giao dịch</span>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-slate-500 font-medium">
            <span>AOV: <strong className="text-slate-800 font-bold">{formatVnd(totals.aov)}</strong></span>
            <span className="text-emerald-600 font-semibold">98.6% Thành công</span>
          </div>
        </div>
      </div>

      {/* 3. KHỐI 2 BIỂU ĐỒ CHÍNH: BIỂU ĐỒ CỘT (DOANH THU THEO MỐC) & BIỂU ĐỒ TRÒN (CƠ CẤU DOANH THU) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 3.1 BIỂU ĐỒ CỘT (BAR CHART - 7/12 cột): Thể hiện biến động doanh thu theo thời gian */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>📊</span> Biểu Đồ Cột: Doanh Thu Theo {timeRange === 'day' ? 'Từng Ngày' : timeRange === 'week' ? 'Từng Tuần' : timeRange === 'month' ? 'Từng Tháng' : 'Từng Năm'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cột màu xanh (Gói Tháng) và cột màu cam (Gói Nạp Credit Lẻ) được phân tách rõ ràng.
                </p>
              </div>

              {/* Chú giải màu biểu đồ */}
              <div className="flex items-center gap-3 text-xs font-medium">
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded-sm bg-[#0878EE] inline-block"></span>
                  Gói Tháng
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded-sm bg-[#F59E0B] inline-block"></span>
                  Nạp Credit
                </span>
              </div>
            </div>

            {/* Khung Biểu Đồ Cột Trực Quan (Interactive Grouped / Stacked Bar Chart) */}
            <div className="h-64 pt-6 pb-2 flex items-end justify-between gap-2 border-b border-slate-100 relative">
              {/* Đường kẻ dóng ngang mốc tiền */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40 text-[10px] text-slate-400">
                <div className="border-b border-dashed border-slate-200 pb-0.5">
                  {formatVnd(maxBarValue)}
                </div>
                <div className="border-b border-dashed border-slate-200 pb-0.5">
                  {formatVnd(Math.round(maxBarValue * 0.66))}
                </div>
                <div className="border-b border-dashed border-slate-200 pb-0.5">
                  {formatVnd(Math.round(maxBarValue * 0.33))}
                </div>
                <div className="border-b border-slate-200">0 ₫</div>
              </div>

              {/* Các cột dữ liệu */}
              {currentDataset.map((dp) => {
                const totalItem = dp.subscriptionRevenue + dp.creditRevenue;
                const subHeightPercent = Math.max(6, Math.round((dp.subscriptionRevenue / maxBarValue) * 100));
                const credHeightPercent = Math.max(6, Math.round((dp.creditRevenue / maxBarValue) * 100));
                const isHovered = hoveredPoint?.key === dp.key;

                return (
                  <div
                    key={dp.key}
                    onMouseEnter={() => setHoveredPoint(dp)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    className="flex-1 flex flex-col items-center h-full justify-end relative group cursor-pointer"
                  >
                    {/* Tooltip khi hover */}
                    {isHovered && (
                      <div className="absolute bottom-full mb-3 z-30 bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs whitespace-nowrap pointer-events-none -translate-x-1/2 left-1/2 min-w-[200px] border border-slate-700 animate-fadeIn">
                        <div className="font-bold text-slate-200 border-b border-slate-700/80 pb-1 mb-1.5 flex items-center justify-between">
                          <span>{dp.fullLabel}</span>
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between gap-3 text-blue-300">
                            <span>👑 Gói Tháng:</span>
                            <span className="font-bold">{formatVnd(dp.subscriptionRevenue)} ({dp.subscriptionCount} lượt)</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-amber-300">
                            <span>🪙 Nạp Credit:</span>
                            <span className="font-bold">{formatVnd(dp.creditRevenue)} ({dp.creditCount} lượt)</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-emerald-400 font-extrabold pt-1 border-t border-slate-800">
                            <span>💰 Tổng doanh thu:</span>
                            <span>{formatVnd(totalItem)}</span>
                          </div>
                        </div>
                        {/* Mũi tên tooltip */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                      </div>
                    )}

                    {/* Cặp 2 cột đứng song song cho Gói Tháng & Credit Lẻ */}
                    <div className="w-full flex items-end justify-center gap-1 h-full pb-1">
                      {/* Cột Xanh (Gói Tháng) */}
                      <div
                        style={{ height: `${subHeightPercent}%` }}
                        className={`w-full max-w-[18px] sm:max-w-[24px] rounded-t-md transition-all duration-300 ${
                          isHovered ? 'bg-blue-600 shadow-md ring-2 ring-blue-300' : 'bg-[#0878EE]'
                        }`}
                      />
                      {/* Cột Cam (Credit Lẻ) */}
                      <div
                        style={{ height: `${credHeightPercent}%` }}
                        className={`w-full max-w-[18px] sm:max-w-[24px] rounded-t-md transition-all duration-300 ${
                          isHovered ? 'bg-amber-600 shadow-md ring-2 ring-amber-300' : 'bg-[#F59E0B]'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trục hoành: Nhãn các mốc thời gian */}
            <div className="flex items-center justify-between pt-2 text-[11px] font-semibold text-slate-500">
              {currentDataset.map((dp) => (
                <div key={dp.key} className="flex-1 text-center truncate px-0.5" title={dp.fullLabel}>
                  {dp.label}
                </div>
              ))}
            </div>
          </div>

          {/* Dòng tóm tắt dưới biểu đồ cột */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              💡 Rê chuột vào từng cột để xem chi tiết doanh thu và số lượng đơn hàng theo từng mốc.
            </span>
            <span className="font-bold text-slate-700">
              Tổng mốc: {formatVnd(totals.totalRev)}
            </span>
          </div>
        </div>

        {/* 3.2 BIỂU ĐỒ TRÒN (DONUT CHART - 5/12 cột): Thể hiện cơ cấu % Gói Tháng vs Gói Credit */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🥧</span> Biểu Đồ Tròn: Cơ Cấu Tỷ Trọng Doanh Thu
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                So sánh tỷ lệ đóng góp giữa Gói Tháng Hội Viên và Gói Nạp Credit Lẻ.
              </p>
            </div>

            {/* SVG Donut Chart */}
            <div className="relative flex items-center justify-center my-6">
              <svg className="w-48 h-48 -rotate-90 transform" viewBox="0 0 200 200">
                {/* Vòng nền xám mờ */}
                <circle
                  cx="100"
                  cy="100"
                  r="70"
                  fill="transparent"
                  stroke="#F1F5F9"
                  strokeWidth="24"
                />
                {/* Vành 1: Gói Tháng (Màu Xanh Dương #0878EE) */}
                <circle
                  cx="100"
                  cy="100"
                  r="70"
                  fill="transparent"
                  stroke="#0878EE"
                  strokeWidth="24"
                  strokeDasharray={`${subDash} ${CIRCLE_CIRCUMFERENCE}`}
                  strokeDashoffset="0"
                  className="transition-all duration-700 ease-out"
                />
                {/* Vành 2: Gói Credit Lẻ (Màu Hổ Phách #F59E0B) */}
                <circle
                  cx="100"
                  cy="100"
                  r="70"
                  fill="transparent"
                  stroke="#F59E0B"
                  strokeWidth="24"
                  strokeDasharray={`${credDash} ${CIRCLE_CIRCUMFERENCE}`}
                  strokeDashoffset={`-${subDash}`}
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              {/* Tâm Donut Chart hiển thị Tổng Doanh Thu */}
              <div className="absolute text-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Tổng Doanh Thu
                </span>
                <span className="text-lg font-black text-slate-900 block mt-0.5">
                  {formatVnd(totals.totalRev)}
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-1">
                  100% Doanh Thu
                </span>
              </div>
            </div>

            {/* Chi tiết 2 nguồn thu */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              {/* Nguồn 1: Gói Tháng */}
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#0878EE] shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Gói Hội Viên Tháng (Pro / Pro Max)</h4>
                    <span className="text-[11px] text-slate-500">{totals.subCnt} lượt đăng ký</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-[#0878EE]">{formatVnd(totals.subRev)}</div>
                  <span className="text-[11px] font-bold text-blue-600">{totals.subPct}%</span>
                </div>
              </div>

              {/* Nguồn 2: Gói Credit Lẻ */}
              <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#F59E0B] shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Gói Nạp Credit (Một lần)</h4>
                    <span className="text-[11px] text-slate-500">{totals.credCnt} lượt nạp credit</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-amber-600">{formatVnd(totals.credRev)}</div>
                  <span className="text-[11px] font-bold text-amber-700">{totals.credPct}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 text-center">
            Mô hình kết hợp Hybrid: Doanh thu định kỳ (MRR) chiếm ưu thế vững chắc so với nạp lẻ.
          </div>
        </div>
      </div>

      {/* 4. BẢNG XẾP HẠNG GÓI BÁN CHẠY NHẤT (TOP PACKAGES PERFORMANCE) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>🏆</span> Xếp Hạng Gói Bán Chạy &amp; Đóng Góp Doanh Thu
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Danh mục gói có hiệu suất tiêu thụ và mang lại giá trị dòng tiền cao nhất cho nền tảng.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
            Hiển thị 6 gói chủ lực
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200 tracking-wider">
              <tr>
                <th className="py-3 px-4">Tên Gói Dịch Vụ</th>
                <th className="py-3 px-4">Phân Loại</th>
                <th className="py-3 px-4">Đơn Giá</th>
                <th className="py-3 px-4 text-center">Lượt Mua (Orders)</th>
                <th className="py-3 px-4 text-right">Tổng Doanh Thu</th>
                <th className="py-3 px-4 w-44">Tỷ Trọng Đóng Góp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {TOP_PACKAGES_DATA.map((pkg) => {
                const totalRevAll = TOP_PACKAGES_DATA.reduce((acc, p) => acc + p.revenue, 0);
                const percent = Math.round((pkg.revenue / totalRevAll) * 100);

                return (
                  <tr key={pkg.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{pkg.name}</span>
                        {pkg.badge && (
                          <span className={`text-[10px] text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${pkg.badgeColor}`}>
                            {pkg.badge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {pkg.type === 'subscription' ? (
                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                          👑 Gói Tháng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                          🪙 Credit Lẻ
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 font-semibold">
                      {formatVnd(pkg.price)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                      {pkg.orders} <span className="text-[11px] text-slate-400 font-normal">lượt</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900">
                      {formatVnd(pkg.revenue)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${percent}%` }}
                            className={`h-full rounded-full ${
                              pkg.type === 'subscription' ? 'bg-[#0878EE]' : 'bg-[#F59E0B]'
                            }`}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 shrink-0 min-w-[32px] text-right">
                          {percent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. GIAO DỊCH THANH TOÁN GẦN ĐÂY QUA VIETQR PAYOS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>⚡</span> Dòng Giao Dịch Gần Nhất (Live Stream)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Các khoản thanh toán thành công và kích hoạt gói qua cổng VietQR PayOS (Dữ liệu thực từ hệ thống).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchRecentTransactions(false)}
              disabled={isLoadingTx}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full font-medium transition cursor-pointer"
              title="Làm mới dòng giao dịch"
            >
              <span className={isLoadingTx ? "inline-block animate-spin" : ""}>🔄</span>
              <span>Làm mới</span>
            </button>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Kết nối PayOS 24/7
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {isLoadingTx ? (
            <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-[#0878EE] border-t-transparent rounded-full animate-spin"></div>
              <span>Đang đồng bộ giao dịch thực từ database...</span>
            </div>
          ) : txError ? (
            <div className="p-8 text-center text-xs text-red-500">
              {txError} - <button onClick={() => void fetchRecentTransactions(false)} className="underline font-bold ml-1 cursor-pointer">Thử lại</button>
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Chưa có giao dịch thanh toán thành công nào được ghi nhận trong hệ thống.
            </div>
          ) : (
            recentTransactions.map((tx) => (
              <div key={tx.id} className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0 font-bold ${
                    tx.type === 'subscription' ? 'bg-blue-100 text-[#0878EE]' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {tx.type === 'subscription' ? '👑' : '🪙'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{tx.user}</span>
                      <span className="text-[11px] text-slate-400">({tx.email})</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{tx.id}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Đã thanh toán <strong className="text-slate-700">{tx.packageName}</strong> • {tx.method}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1">
                  <span className="font-black text-slate-900 text-sm">{formatVnd(tx.amount)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {formatDateTime(tx.createdAt)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Thành công
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
