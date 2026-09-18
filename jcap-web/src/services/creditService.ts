import type { ApiResponse } from '../types/auth';
import type {
  CreditPackage,
  PurchaseCreditResponse,
  CreditHistoryResponse,
  CreditTransaction,
} from '../types/credit';

const BASE_URL = '/api/credits';

class CreditService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('jcap_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * UC11: Lấy danh sách các gói nạp credit đang hoạt động
   */
  public async getPackages(): Promise<ApiResponse<CreditPackage[]>> {
    try {
      const response = await fetch(`${BASE_URL}/packages`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi tải danh sách gói credit (${response.status})`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại dịch vụ.',
      };
    }
  }

  /**
   * UC12: Mua gói credit (Hỗ trợ cả Mock và Link PayOS thật)
   */
  public async purchasePackage(packageId: number): Promise<ApiResponse<PurchaseCreditResponse>> {
    const token = localStorage.getItem('jcap_token');
    if (!token) {
      return {
        success: false,
        message: 'Vui lòng đăng nhập để thực hiện nạp credit.',
      };
    }

    try {
      const response = await fetch(`${BASE_URL}/purchase`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ packageId }),
      });

      if (response.ok) {
        const result: ApiResponse<PurchaseCreditResponse> = await response.json();
        // Nếu nạp thành công ở chế độ Mock và có số dư mới, tự động đồng bộ session user
        if (result.success && result.data?.newCreditBalance !== undefined) {
          this.updateLocalCreditBalance(result.data.newCreditBalance);
        }
        return result;
      }

      if (response.status === 401) {
        return {
          success: false,
          message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        };
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Yêu cầu nạp credit thất bại (${response.status})`,
        errors: errData?.errors,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ thanh toán.',
      };
    }
  }

  /**
   * UC13: Lấy lịch sử biến động số dư / giao dịch nạp credit
   */
  public async getHistory(page: number = 1, pageSize: number = 10): Promise<ApiResponse<CreditHistoryResponse>> {
    const token = localStorage.getItem('jcap_token');
    if (!token) {
      return {
        success: false,
        message: 'Vui lòng đăng nhập để xem lịch sử giao dịch.',
      };
    }

    try {
      const response = await fetch(`${BASE_URL}/history?page=${page}&pageSize=${pageSize}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const result: ApiResponse<CreditHistoryResponse> = await response.json();
        if (result.success && result.data?.currentCreditBalance !== undefined) {
          this.updateLocalCreditBalance(result.data.currentCreditBalance);
        }
        return result;
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi tải lịch sử giao dịch (${response.status})`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ.',
      };
    }
  }

  /**
   * Xác thực và kiểm tra trạng thái giao dịch theo mã đơn hàng sau khi PayOS callback về
   */
  public async verifyOrder(orderCode: number | string): Promise<ApiResponse<CreditTransaction>> {
    try {
      const response = await fetch(`${BASE_URL}/verify-order/${orderCode}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Không thể xác minh đơn hàng (${response.status})`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối để xác minh đơn hàng.',
      };
    }
  }

  /**
   * Cập nhật số dư credit trong localStorage và thông báo sự kiện cập nhật để Header đồng bộ
   */
  public updateLocalCreditBalance(newBalance: number) {
    const userStr = localStorage.getItem('jcap_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        user.creditBalance = newBalance;
        localStorage.setItem('jcap_user', JSON.stringify(user));
        // Phát event cho Header và các component khác
        window.dispatchEvent(new CustomEvent('jcap_profile_updated', {
          detail: {
            ...user,
            creditBalance: newBalance,
          }
        }));
      } catch {
        // ignore
      }
    }
  }
}

export const creditService = new CreditService();
