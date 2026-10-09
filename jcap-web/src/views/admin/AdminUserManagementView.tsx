import React, { useState, useEffect, useCallback } from 'react';
import {
  adminUserService,
  type AdminUserItem,
  type AdminUserSearchParams,
} from '../../services/adminUserService';

export const AdminUserManagementView: React.FC = () => {
  // Danh sách & thống kê
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [bannedCount, setBannedCount] = useState<number>(0);
  const [learnerCount, setLearnerCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // UC-54: Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Learner' | 'Admin'>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(100);

  // Loading & Thông báo
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // UC-55: Modal xác nhận Ban / Unban
  const [confirmTargetUser, setConfirmTargetUser] = useState<AdminUserItem | null>(null);
  const [statusReason, setStatusReason] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Modal xem chi tiết học viên
  const [detailUser, setDetailUser] = useState<AdminUserItem | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);

    const params: AdminUserSearchParams = {
      page,
      pageSize,
    };

    const res = await adminUserService.searchAndFilterUsers(params);
    if (res.success && res.data) {
      setUsers(res.data.items || []);
      setTotalCount(res.data.totalCount ?? 0);
      setActiveCount(res.data.activeCount ?? 0);
      setBannedCount(res.data.bannedCount ?? 0);
      setLearnerCount(res.data.learnerCount ?? 0);
      setTotalPages(res.data.totalPages || 1);
    } else {
      setErrorMsg(res.message || 'Không thể tải danh sách học viên.');
    }

    setIsLoading(false);
  }, [page, pageSize]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Mở modal xác nhận Khóa / Mở khóa (UC-55)
  const handleOpenBanUnbanModal = (user: AdminUserItem) => {
    setConfirmTargetUser(user);
    setStatusReason('');
  };

  // Xác nhận thực thi Ban / Unban (UC-55)
  const handleConfirmChangeStatus = async () => {
    if (!confirmTargetUser || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setErrorMsg(null);

    const nextActiveState = !confirmTargetUser.isActive;
    const res = await adminUserService.changeUserAccountStatus(
      confirmTargetUser.id,
      nextActiveState,
      statusReason.trim() || undefined
    );

    if (res.success && res.data) {
      setSuccessMsg(
        res.message ||
          (nextActiveState
            ? `Đã mở khóa (Unban) tài khoản "${confirmTargetUser.fullName}" thành công.`
            : `Đã khóa (Ban) tài khoản "${confirmTargetUser.fullName}" thành công.`)
      );
      setConfirmTargetUser(null);
      setStatusReason('');
      // Cập nhật lại chi tiết nếu đang mở modal chi tiết cùng user
      if (detailUser && detailUser.id === confirmTargetUser.id) {
        setDetailUser(res.data);
      }
      await fetchUsers();
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setErrorMsg(res.message || 'Không thể thay đổi trạng thái tài khoản.');
      setConfirmTargetUser(null);
    }

    setIsUpdatingStatus(false);
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const filteredUsers = users.filter((item) => {
    if (statusFilter === 'active' && !item.isActive) return false;
    if (statusFilter === 'banned' && item.isActive) return false;
    if (roleFilter !== 'all' && item.role.toLowerCase() !== roleFilter.toLowerCase()) return false;

    const term = searchTerm.trim();
    if (!term) return true;
    if (term.length < 2) return false;
    const q = term.toLowerCase();
    return (
      (item.fullName && item.fullName.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.id && item.id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-[#0878EE] border border-blue-200 text-xs font-bold mb-2">
            <span>👥</span> Quản Trị Tài Khoản & Học Viên (FE-06: UC-54 & UC-55)
          </div>
          <h1 className="text-2xl font-bold text-[#071A44]">Quản lý Học viên (User Management)</h1>
          <p className="text-slate-500 text-sm mt-1">
            Tìm kiếm, lọc danh sách người dùng và kiểm soát trạng thái hoạt động (Khóa / Mở khóa tài khoản).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchUsers}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-sm transition border border-slate-200 cursor-pointer"
          >
            <span>🔄</span> Làm mới danh sách
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => {
            setStatusFilter('all');
            setRoleFilter('all');
            setPage(1);
          }}
          className={`bg-white p-5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
            statusFilter === 'all' && roleFilter === 'all'
              ? 'border-[#0878EE] ring-2 ring-[#0878EE]/15 shadow-sm'
              : 'border-slate-200/80 shadow-xs hover:border-blue-300'
          }`}
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng Tài Khoản</span>
            <div className="text-2xl font-black text-[#071A44] mt-1">{activeCount + bannedCount}</div>
            <span className="text-xs text-[#0878EE] font-medium mt-1 inline-block">Toàn hệ thống</span>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-[#0878EE] rounded-xl flex items-center justify-center text-xl">
            👥
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('active');
            setPage(1);
          }}
          className={`bg-white p-5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
            statusFilter === 'active'
              ? 'border-emerald-500 ring-2 ring-emerald-500/15 shadow-sm'
              : 'border-slate-200/80 shadow-xs hover:border-emerald-300'
          }`}
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đang Hoạt Động</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{activeCount}</div>
            <span className="text-xs text-emerald-600 font-medium mt-1 inline-block">● Active Users</span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl">
            ✅
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('banned');
            setPage(1);
          }}
          className={`bg-white p-5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
            statusFilter === 'banned'
              ? 'border-red-500 ring-2 ring-red-500/15 shadow-sm'
              : 'border-slate-200/80 shadow-xs hover:border-red-300'
          }`}
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đã Bị Khóa (Banned)</span>
            <div className="text-2xl font-black text-red-600 mt-1">{bannedCount}</div>
            <span className="text-xs text-red-600 font-medium mt-1 inline-block">🔒 Banned Accounts</span>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-xl">
            🚫
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoleFilter('Learner');
            setStatusFilter('all');
            setPage(1);
          }}
          className={`bg-white p-5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
            roleFilter === 'Learner'
              ? 'border-purple-500 ring-2 ring-purple-500/15 shadow-sm'
              : 'border-slate-200/80 shadow-xs hover:border-purple-300'
          }`}
        >
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng Số Học Viên</span>
            <div className="text-2xl font-black text-purple-700 mt-1">{learnerCount}</div>
            <span className="text-xs text-purple-600 font-medium mt-1 inline-block">Vai trò Learner</span>
          </div>
        </button>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Tìm kiếm học viên theo họ tên, email hoặc ID..."
          className="w-full max-w-md px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE] transition"
        />
      </div>

      {searchTerm.trim().length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2.5 rounded-xl text-xs font-medium">
          <span>
            🔍 Kết quả tìm kiếm cho: <strong>"{searchTerm.trim()}"</strong>
          </span>
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="text-blue-600 hover:text-blue-900 font-bold underline transition cursor-pointer"
          >
            Xóa tìm kiếm
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0878EE]"></div>
            <span className="ml-3 text-sm text-slate-600 font-medium">Đang tải danh sách học viên...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-4 px-6">Học viên / Email</th>
                  <th className="py-4 px-4">Vai trò</th>
                  <th className="py-4 px-4">Số dư Credit</th>
                  <th className="py-4 px-4">Phiên luyện tập</th>
                  <th className="py-4 px-4">Ngày tham gia</th>
                  <th className="py-4 px-4">Trạng thái</th>
                  <th className="py-4 px-6 text-right">Thao tác (UC-55)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <div className="text-3xl mb-2">🔍</div>
                      Không tìm thấy học viên nào khớp với điều kiện lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((item) => {
                    const isAdminUser = item.role.toLowerCase() === 'admin';
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Học viên & Email */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            {item.profilePictureUrl ? (
                              <img
                                src={item.profilePictureUrl}
                                alt={item.fullName}
                                className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                                  item.isActive
                                    ? 'bg-blue-100 text-[#0878EE]'
                                    : 'bg-red-100 text-red-600'
                                }`}
                              >
                                {(item.fullName || item.email || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="font-bold text-[#071A44] truncate flex items-center gap-1.5">
                                <span>{item.fullName}</span>
                                {item.emailConfirmed ? (
                                  <span
                                    title="Email đã xác minh"
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  >
                                    ✓ Đã xác minh
                                  </span>
                                ) : (
                                  <span
                                    title="Email chưa xác minh"
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                                  >
                                    Chưa xác minh
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-0.5">{item.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Vai trò */}
                        <td className="py-4 px-4">
                          {isAdminUser ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              Learner
                            </span>
                          )}
                        </td>

                        {/* Credit Balance */}
                        <td className="py-4 px-4">
                          {isAdminUser ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full text-xs">
                              <span>🪙</span>
                              <span>{item.creditBalance}</span>
                            </span>
                          )}
                        </td>

                        {/* Phiên luyện tập */}
                        <td className="py-4 px-4 text-xs font-semibold text-slate-600">
                          {item.totalRoleplaySessions} phiên
                        </td>

                        {/* Ngày tham gia */}
                        <td className="py-4 px-4 text-xs text-slate-500">
                          {formatDate(item.createdAt)}
                        </td>

                        {/* Trạng thái tài khoản */}
                        <td className="py-4 px-4">
                          {item.isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              Hoạt động
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                              Đã khóa (Banned)
                            </span>
                          )}
                        </td>

                        {/* Thao tác (UC-55 Ban / Unban) */}
                        <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailUser(item)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                          >
                            👁️ Chi tiết
                          </button>

                          {!isAdminUser && (
                            <button
                              type="button"
                              onClick={() => handleOpenBanUnbanModal(item)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                                item.isActive
                                  ? 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-200'
                                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                              }`}
                            >
                              {item.isActive ? '🔒 Khóa (Ban)' : '🔓 Mở khóa (Unban)'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Trang <strong className="text-[#071A44]">{page}</strong> / <strong>{totalPages}</strong> (Tổng{' '}
              <strong>{totalCount}</strong> tài khoản)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                ← Trước
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                Sau →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Xem chi tiết học viên */}
      {detailUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDetailUser(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-[#071A44]">👤 Hồ sơ Chi tiết Người dùng</h3>
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-4">
              {detailUser.profilePictureUrl ? (
                <img
                  src={detailUser.profilePictureUrl}
                  alt={detailUser.fullName}
                  className="w-16 h-16 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-100 text-[#0878EE] flex items-center justify-center text-2xl font-bold">
                  {(detailUser.fullName || detailUser.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h4 className="text-lg font-bold text-[#071A44]">{detailUser.fullName}</h4>
                <p className="text-xs text-slate-500">{detailUser.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {detailUser.isActive ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ● Đang hoạt động
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                      🔒 Đã khóa (Banned)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Mã định danh (User ID):</span>
                <span className="font-mono text-slate-700">{detailUser.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vai trò hệ thống:</span>
                <span className="font-bold text-slate-800">{detailUser.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Xác thực Email:</span>
                <span className="font-bold text-slate-800">
                  {detailUser.emailConfirmed ? 'Đã xác minh' : 'Chưa xác minh'}
                </span>
              </div>
              {detailUser.role.toLowerCase() !== 'admin' && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Số dư Credit hiện tại:</span>
                  <span className="font-bold text-amber-700">🪙 {detailUser.creditBalance} Credits</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Số phiên luyện hội thoại AI:</span>
                <span className="font-bold text-[#0878EE]">{detailUser.totalRoleplaySessions} phiên</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ngày tạo tài khoản:</span>
                <span className="font-semibold text-slate-700">{formatDate(detailUser.createdAt)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              {detailUser.role.toLowerCase() !== 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailUser;
                    setDetailUser(null);
                    handleOpenBanUnbanModal(target);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    detailUser.isActive
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {detailUser.isActive ? '🔒 Khóa tài khoản (Ban)' : '🔓 Mở khóa tài khoản (Unban)'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UC-55: Modal Xác nhận Ban / Unban tài khoản */}
      {confirmTargetUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isUpdatingStatus && setConfirmTargetUser(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                  confirmTargetUser.isActive ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {confirmTargetUser.isActive ? '🔒' : '🔓'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#071A44]">
                  {confirmTargetUser.isActive
                    ? 'Xác nhận Khóa tài khoản (Ban User)'
                    : 'Xác nhận Mở khóa tài khoản (Unban User)'}
                </h3>
                <p className="text-xs text-slate-500">
                  UC-55: Thay đổi trạng thái truy cập hệ thống của học viên
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
              <div className="font-bold text-[#071A44] text-sm">{confirmTargetUser.fullName}</div>
              <div className="text-slate-500">{confirmTargetUser.email}</div>
              <div className="pt-1 text-slate-600">
                {confirmTargetUser.isActive ? (
                  <span>
                    Khi bị <strong>Khóa (Ban)</strong>, học viên này sẽ không thể đăng nhập hoặc sử dụng các tính năng luyện tập của JCAP cho đến khi được mở khóa lại.
                  </span>
                ) : (
                  <span>
                    Khi được <strong>Mở khóa (Unban)</strong>, học viên này có thể đăng nhập và tiếp tục sử dụng toàn bộ tính năng học tập bình thường.
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ghi chú / Lý do {confirmTargetUser.isActive ? 'khóa tài khoản' : 'mở khóa'} (tùy chọn)
              </label>
              <textarea
                rows={2}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder={
                  confirmTargetUser.isActive
                    ? 'Nhập lý do khóa tài khoản (VD: Vi phạm quy chuẩn cộng đồng, spam...)'
                    : 'Nhập ghi chú mở khóa tài khoản...'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#0878EE]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => setConfirmTargetUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={handleConfirmChangeStatus}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-sm transition cursor-pointer ${
                  confirmTargetUser.isActive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isUpdatingStatus
                  ? 'Đang xử lý...'
                  : confirmTargetUser.isActive
                    ? '🔒 Xác nhận Khóa (Ban)'
                    : '🔓 Xác nhận Mở khóa (Unban)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagementView;

