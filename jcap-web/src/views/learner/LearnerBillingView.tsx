import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { CreditPackage } from '../../types/creditPackage';
import type { ApiResponse } from '../../types/auth';

const API_PACKAGES_URL = '/api/credits/packages';
const CUSTOM_CREDIT_RATE_VND = 50; // 1 Credit = 50 VND

export const LearnerBillingView: React.FC = () => {
  const navigate = useNavigate();
  const { user, token, logout, userLevel } = useAuth();

  // Balance & Package state
  const currentBalance = 500; // Hardcoded as requested
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selection state
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customCredits, setCustomCredits] = useState<number>(200);

  // UI state
  const [autoTopUpEnabled, setAutoTopUpEnabled] = useState<boolean>(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'paypal' | 'apple' | 'crypto'>('card');
  const [country, setCountry] = useState<string>('Vietnam');
  const [zipCode, setZipCode] = useState<string>('70000');

  // Token helper
  const getAuthHeaders = useCallback((): HeadersInit => {
    const activeToken = token || localStorage.getItem('jcap_token') || localStorage.getItem('token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }
    return headers;
  }, [token]);

  // Fetch active packages from backend
  const fetchPackages = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(API_PACKAGES_URL, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.message || `Lỗi khi tải gói credit (Mã lỗi: ${response.status})`);
      }

      const result: ApiResponse<CreditPackage[]> | CreditPackage[] = await response.json();
      // Unpack wrapped ApiResponse if available
      const data: CreditPackage[] =
        result && typeof result === 'object' && 'data' in result && result.data
          ? result.data
          : (result as CreditPackage[]);

      const activeList = Array.isArray(data) ? data : [];
      setPackages(activeList);

      // Auto-select the first package by default if available
      if (activeList.length > 0 && selectedPackageId === null && !isCustom) {
        setSelectedPackageId(activeList[0].id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders, selectedPackageId, isCustom]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // Handle fixed package click
  const handleSelectPackage = (pkg: CreditPackage) => {
    setSelectedPackageId(pkg.id);
    setIsCustom(false);
  };

  // Handle custom range slider change
  const handleCustomSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCustomCredits(val);
    setSelectedPackageId(null);
    setIsCustom(true);
  };

  // Determine effective credits and price
  const selectedPackage = packages.find((p) => p.id === selectedPackageId);
  const effectiveCredits = isCustom
    ? customCredits
    : selectedPackage
    ? selectedPackage.credits
    : 0;

  const effectivePrice = isCustom
    ? customCredits * CUSTOM_CREDIT_RATE_VND
    : selectedPackage
    ? selectedPackage.price
    : 0;

  // Checkout action
  const handleBuyCredits = () => {
    if (effectiveCredits <= 0) {
      alert('Vui lòng chọn một gói credit hoặc điều chỉnh thanh số lượng tuỳ chọn.');
      return;
    }
    window.alert('Redirecting to Payment Gateway (Coming in Phase 2)...');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/scenarios" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 bg-red-600 text-white font-bold rounded-xl flex items-center justify-center shadow-sm group-hover:bg-red-700 transition">
                J
              </div>
              <span className="font-bold text-slate-800 text-lg tracking-tight">JCAP Nihongo</span>
            </Link>
            <span className="text-slate-300">|</span>
            <span className="text-sm font-semibold text-slate-600">Thanh Toán và Nạp Tiền</span>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              to="/scenarios"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition flex items-center gap-1.5"
            >
              <span>←</span>
              <span>Luyện nói</span>
            </Link>

            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-800">{user?.email}</p>
              <p className="text-[11px] text-red-600 font-bold">Mục tiêu: {userLevel || 'N5'}</p>
            </div>

            <button
              onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ============================================================ */}
          {/* LEFT COLUMN: Balance Information & Account Limits */}
          {/* ============================================================ */}
          <div className="lg:col-span-5 space-y-6">
            {/* Balance Information Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800 tracking-tight">THÔNG TIN SỐ DƯ</h2>
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </div>
              </div>

              {/* Big Balance display */}
              <div className="flex items-baseline justify-between py-2 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    {currentBalance.toLocaleString()}
                  </span>
                  <span className="text-amber-500 text-2xl" role="img" aria-label="credit-coin">
                    🪙
                  </span>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  SỐ DƯ HIỆN TẠI
                </span>
              </div>

  {/*             Informational callout
              <div className="mt-4 flex items-start space-x-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200/70 p-3 rounded-xl">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
  < span > Số dư tín dụng không bao giờ hết hạn và có thể được sử dụng bất cứ lúc nào để luyện nói với AI.</span>
              </div> */}

              {/* Rate Limit section */}
              {/* <div className="mt-6 pt-5 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Rate Limit</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Each account is limited to 20 new generation requests per 10 seconds (≈ 100+ concurrent tasks).
                </p>

                <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
                  <li className="flex items-center gap-1.5">
                    <span className="text-amber-500">⚠</span>
                    <span>Enforced per account</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-amber-500">⚠</span>
                    <span>Excess requests return HTTP 429 and are not queued</span>
                  </li>
                </ul>

                <p className="text-[11px] text-slate-400 mt-3 italic leading-normal">
                  This limit is sufficient for most users. If you consistently hit 429, contact support to request an increase (reviewed carefully).
                </p>
              </div> */}
            </div>

            {/* Automatic Payments Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Automatic Payments</h3>
              {/* <p className="text-xs text-slate-500 leading-relaxed mb-4">
                Configure automatic billing by adding a card to your account. When your balance nears your Auto-Pay threshold, we will attempt to reload credits by billing your saved card max once every 10 minutes for the Auto-Pay amount that is configured below.
              </p> */}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-semibold text-slate-700">Enable auto top-ups</span>
                <button
                  type="button"
                  onClick={() => setAutoTopUpEnabled(!autoTopUpEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoTopUpEnabled ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      autoTopUpEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Transaction History Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">LỊCH SỬ GIAO DỊCH</h3>
                <button
                  type="button"
                  onClick={() => alert('Đã làm mới lịch sử giao dịch')}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 transition flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Làm mới</span>
                </button>
              </div>

              {/* Sample / Welcome Credit History */}
              <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                <div className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    <p className="font-semibold text-slate-800">Khởi tạo tài khoản học viên</p>
                    <p className="text-[11px] text-slate-400">Bonus chào mừng gia nhập JCAP</p>
                  </div>
                    <div className ="flex items-center gap-2">
                    <span className="font-bold text-emerald-600">+500 Credits</span>
                    <p className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">
                      Thành công
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* RIGHT COLUMN: Add Credits, Package Grid, Slider & Checkout */}
          {/* ============================================================ */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-1">Thêm Credits</h2>
              <p className="text-xs text-slate-500 mb-6">
                Chọn gói ưu đãi có sẵn hoặc kéo thanh trượt để tuỳ chỉnh số lượng điểm cần nạp.
              </p>

              {/* Package Selection Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Chọn Gói</h3>
                  {selectedPackageId && !isCustom && (
                    <span className="text-xs text-blue-600 font-semibold">Đã chọn 1 gói</span>
                  )}
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
                    <span>{errorMessage}</span>
                    <button
                      onClick={fetchPackages}
                      className="underline font-bold text-red-800 hover:text-red-950 ml-2"
                    >
                      Thử lại
                    </button>
                  </div>
                )}

                {/* Loading Skeleton */}
                {isLoading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
                    ))}
                  </div>
                )}

                {/* Packages Grid */}
                {!isLoading && packages.length === 0 && !errorMessage && (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                    Hiện chưa có gói credit nào được kích hoạt trong hệ thống.
                  </div>
                )}

                {!isLoading && packages.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {packages.map((pkg, index) => {
                      const isSelected = !isCustom && selectedPackageId === pkg.id;

                      // Determine discount badges similar to reference screenshot
                      let badgeText: string | null = null;
                      if (index === 2) badgeText = 'SAVE 5%';
                      if (index === 3) badgeText = 'SAVE 10%';

                      return (
                        <div
                          key={pkg.id}
                          onClick={() => handleSelectPackage(pkg)}
                          className={`relative rounded-2xl p-5 cursor-pointer transition-all duration-150 overflow-hidden border ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30'
                              : 'bg-slate-50/80 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Corner Badge */}
                          {badgeText && (
                            <div
                              className={`absolute top-0 right-0 transform translate-x-3 translate-y-2 rotate-45 text-[9px] font-extrabold uppercase px-6 py-0.5 shadow-sm ${
                                isSelected ? 'bg-amber-400 text-slate-900' : 'bg-blue-500 text-white'
                              }`}
                            >
                              {badgeText}
                            </div>
                          )}

                          <div className="pr-4">
                            {/* Prominent Price */}
                            <div className="text-2xl font-black tracking-tight mb-1">
                              {Number(pkg.price).toLocaleString('vi-VN')} ₫
                            </div>

                            {/* Credits description */}
                            <div className={`text-xs font-semibold ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                              {pkg.credits.toLocaleString()} credits
                            </div>

                            {/* Package name tag */}
                            {pkg.name && (
                              <div
                                className={`text-[11px] mt-2 inline-block font-medium px-2 py-0.5 rounded-md ${
                                  isSelected ? 'bg-blue-700/60 text-blue-100' : 'bg-white border border-slate-200 text-slate-600'
                                }`}
                              >
                                {pkg.name}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Amount Slider Section */}
              <div className="mb-8 pt-5 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Tùy chỉnh
                  </h3>
                  {isCustom && (
                    <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Đang tuỳ chọn
                    </span>
                  )}
                </div>

                <div
                  className={`p-5 rounded-2xl border transition-all ${
                    isCustom
                      ? 'bg-blue-50/40 border-blue-300 ring-2 ring-blue-500/10'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-700">Số lượng credits cần nạp:</span>
                    <span className="text-base font-extrabold text-blue-700">
                      {customCredits.toLocaleString()} Credits
                    </span>
                  </div>

                  <input
                    type="range"
                    min={50}
                    max={5000}
                    step={50}
                    value={customCredits}
                    onChange={handleCustomSliderChange}
                    className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                  />

                  <div className="flex justify-between text-[11px] text-slate-400 mt-1.5">
                    <span>50 credits</span>
                    <span>2,500 credits</span>
                    <span>5,000 credits</span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Giá tính toán (1 credit = {CUSTOM_CREDIT_RATE_VND} ₫):
                    </span>
                    <span className="font-bold text-slate-900 text-sm">
                      {(customCredits * CUSTOM_CREDIT_RATE_VND).toLocaleString('vi-VN')} ₫
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Method Mockup Tabs */}
              <div className="mb-6 pt-5 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Payment Method</h3>

                <div className="grid grid-cols-5 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('card')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                      selectedPaymentMethod === 'card'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>💳</span>
                    <span className="hidden sm:inline">Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('paypal')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                      selectedPaymentMethod === 'paypal'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span className="text-blue-600 font-extrabold">P</span>
                    <span className="hidden sm:inline">PayPal</span>
                  </button>

                  {/* <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('apple')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                      selectedPaymentMethod === 'apple'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span></span>
                    <span className="hidden sm:inline">Pay</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('crypto')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                      selectedPaymentMethod === 'crypto'
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>₿</span>
                    <span className="hidden sm:inline">Crypto</span>
                  </button> */}

                </div>

                {/* Billing Address Mockup Container */}
                <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                    Billing Address
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Country or Region <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="Vietnam">Vietnam</option>
                        <option value="Japan">Japan</option>
                        <option value="United States">United States</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Zip Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        placeholder="Enter zip code"
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Checkout / Buy Credits Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleBuyCredits}
                  disabled={effectiveCredits <= 0}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm shadow-sm transition duration-150 ease-in-out flex items-center justify-center space-x-2 ${
                    effectiveCredits > 0
                      ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-[0.99] shadow-blue-500/20'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span>
                    Mua Credits ({effectiveCredits.toLocaleString()} Credits -{' '}
                    {effectivePrice.toLocaleString('vi-VN')} ₫)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

