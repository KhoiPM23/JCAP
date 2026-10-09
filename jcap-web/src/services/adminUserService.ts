import type { ApiResponse } from '../types/auth';

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  role: string;
  jlptLevel: string;
  creditBalance: number;
  isActive: boolean;
  emailConfirmed: boolean;
  profilePictureUrl?: string | null;
  createdAt: string;
  totalRoleplaySessions: number;
}

export interface AdminUserPagedResponse {
  items: AdminUserItem[];
  totalCount: number;
  activeCount: number;
  bannedCount: number;
  learnerCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminUserSearchParams {
  search?: string;
  status?: 'all' | 'active' | 'banned';
  jlptLevel?: 'all' | 'N5' | 'N4' | 'N3';
  role?: 'all' | 'Learner' | 'Admin';
  page?: number;
  pageSize?: number;
}

const API_BASE_URL = '/api/admin/users';

export const adminUserService = {
  /**
   * UC-54: Tìm kiếm, lọc và phân trang danh sách người dùng (Học viên / Admin)
   */
  async searchAndFilterUsers(params: AdminUserSearchParams = {}): Promise<ApiResponse<AdminUserPagedResponse>> {
    const token = localStorage.getItem('jcap_token');
    if (!token) {
      return {
        success: false,
        message: 'Chưa đăng nhập tài khoản Quản trị viên.',
      };
    }

    const query = new URLSearchParams();
    if (params.search && params.search.trim()) {
      query.set('search', params.search.trim());
    }
    if (params.status && params.status !== 'all') {
      query.set('status', params.status);
    }
    if (params.jlptLevel && params.jlptLevel !== 'all') {
      query.set('jlptLevel', params.jlptLevel);
    }
    if (params.role && params.role !== 'all') {
      query.set('role', params.role);
    }
    query.set('page', String(params.page || 1));
    query.set('pageSize', String(params.pageSize || 10));

    try {
      const response = await fetch(`${API_BASE_URL}?${query.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = (await response.json().catch(() => null)) as ApiResponse<AdminUserPagedResponse> | null;
      if (result) {
        return result;
      }

      return {
        success: false,
        message: `Không thể tải danh sách học viên (HTTP ${response.status}).`,
      };
    } catch {
      return {
        success: false,
        message: 'Lỗi kết nối đến máy chủ khi tải danh sách học viên.',
      };
    }
  },

  /**
   * UC-55: Thay đổi trạng thái tài khoản người dùng (Khóa / Mở khóa - Ban / Unban)
   */
  async changeUserAccountStatus(
    userId: string,
    isActive: boolean,
    reason?: string
  ): Promise<ApiResponse<AdminUserItem>> {
    const token = localStorage.getItem('jcap_token');
    if (!token) {
      return {
        success: false,
        message: 'Chưa đăng nhập tài khoản Quản trị viên.',
      };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive, reason }),
      });

      const result = (await response.json().catch(() => null)) as ApiResponse<AdminUserItem> | null;
      if (result) {
        return result;
      }

      return {
        success: false,
        message: `Không thể cập nhật trạng thái tài khoản (HTTP ${response.status}).`,
      };
    } catch {
      return {
        success: false,
        message: 'Lỗi kết nối đến máy chủ khi cập nhật trạng thái tài khoản.',
      };
    }
  },
};

