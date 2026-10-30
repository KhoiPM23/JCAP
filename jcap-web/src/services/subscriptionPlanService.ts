export interface SubscriptionPlanItem {
  id: string;
  name: string;
  subtitle: string;
  creditsAmount: number; // Hạn mức tuần (credits/tuần)
  fiveHourQuota: number; // Hạn mức 5 giờ (credits/5h)
  creditsLabel: string;
  price: number; // VND / 30 ngày
  unitPriceText?: string;
  billingCycle: string;
  isPopular?: boolean;
  isBestValue?: boolean;
  badgeText?: string;
  isActive: boolean;
  features: string[];
}

export interface UserSubscriptionState {
  planId: string;
  planName: string;
  planTier: string;
  status: 'Active' | 'Expired' | 'None';
  activatedAt: string;
  expiresAt: string;
  daysRemaining: number;
  monthlyPrice: number;
  features: string[];
  creditsAmount: number;
  fiveHourQuota: number;
}

const STORAGE_KEY = 'jcap_admin_subscription_plans';
const USER_SUBSCRIPTION_KEY = 'jcap_user_subscription';

const DEFAULT_PLANS: SubscriptionPlanItem[] = [
  {
    id: 'plan-pro',
    name: 'Gói Tháng Pro (Cơ Bản)',
    subtitle: 'Dành cho việc luyện tập đều đặn hàng ngày',
    creditsAmount: 1000,
    fiveHourQuota: 50,
    creditsLabel: 'Credits / tuần',
    price: 199000,
    unitPriceText: '~199 đ / credit',
    billingCycle: '30 ngày (Gia hạn hàng tháng)',
    isPopular: true,
    isBestValue: false,
    badgeText: 'PHỔ BIẾN NHẤT',
    isActive: true,
    features: [
      'Không giới hạn số lượt mở kịch bản hội thoại',
      'Hạn mức 1.000 credits AI mỗi tuần',
      'Hạn mức 50 credits AI hồi phục sau mỗi 5 tiếng',
      'Tự động kết nối trừ Credit nạp thêm khi vượt trần',
      'Đánh giá phát âm & Pitch Accent chi tiết bằng Azure Speech AI',
    ],
  },
  {
    id: 'plan-promax',
    name: 'Gói Tháng Pro Max (Chuyên Sâu)',
    subtitle: 'Luyện tập Kaiwa & Shadowing không giới hạn',
    creditsAmount: 2500,
    fiveHourQuota: 150,
    creditsLabel: 'Credits / tuần',
    price: 349000,
    unitPriceText: '~139 đ / credit',
    billingCycle: '30 ngày (Gia hạn hàng tháng)',
    isPopular: false,
    isBestValue: true,
    badgeText: 'TIẾT KIỆM NHẤT',
    isActive: true,
    features: [
      'Tất cả quyền lợi của gói Pro',
      'Hạn mức 2.500 credits AI mỗi tuần',
      'Hạn mức 150 credits AI hồi phục sau mỗi 5 tiếng',
      'Tốc độ phản hồi AI ưu tiên cao nhất',
      'Luyện tập Shadowing nâng cao không giới hạn',
      'Hỗ trợ kỹ thuật ưu tiên 24/7',
    ],
  },
];

export const subscriptionPlanService = {
  getPlans(): SubscriptionPlanItem[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Lỗi khi đọc danh sách gói tháng:', e);
    }
    // Khởi tạo mặc định nếu chưa có
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PLANS));
    return DEFAULT_PLANS;
  },

  findPlanById(id: string): SubscriptionPlanItem | undefined {
    const plans = this.getPlans();
    return plans.find((p) => p.id === id);
  },

  savePlans(plans: SubscriptionPlanItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    window.dispatchEvent(new CustomEvent('jcap_subscription_plans_updated', { detail: plans }));
  },

  addPlan(plan: Omit<SubscriptionPlanItem, 'id'>): SubscriptionPlanItem {
    const plans = this.getPlans();
    const newId = `plan-${Date.now()}`;
    const newPlan: SubscriptionPlanItem = {
      ...plan,
      id: newId,
      unitPriceText: `~${Math.round(plan.price / (plan.creditsAmount || 1)).toLocaleString('vi-VN')} đ / credit`,
    };
    const updated = [...plans, newPlan];
    this.savePlans(updated);
    return newPlan;
  },

  updatePlan(id: string, updates: Partial<SubscriptionPlanItem>): SubscriptionPlanItem {
    const plans = this.getPlans();
    const index = plans.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Không tìm thấy gói tháng với id: ${id}`);
    }
    const updatedPlan: SubscriptionPlanItem = {
      ...plans[index],
      ...updates,
    };
    if (updates.price !== undefined || updates.creditsAmount !== undefined) {
      const price = updates.price ?? plans[index].price;
      const credits = updates.creditsAmount ?? plans[index].creditsAmount;
      updatedPlan.unitPriceText = `~${Math.round(price / (credits || 1)).toLocaleString('vi-VN')} đ / credit`;
    }
    plans[index] = updatedPlan;
    this.savePlans(plans);
    return updatedPlan;
  },

  togglePlanStatus(id: string): SubscriptionPlanItem {
    const plans = this.getPlans();
    const target = plans.find((p) => p.id === id);
    if (!target) {
      throw new Error(`Không tìm thấy gói tháng với id: ${id}`);
    }
    return this.updatePlan(id, { isActive: !target.isActive });
  },

  deletePlan(id: string): void {
    const plans = this.getPlans();
    const updated = plans.filter((p) => p.id !== id);
    this.savePlans(updated);
  },

  getUserStorageKey(): string {
    try {
      const userStr = localStorage.getItem('jcap_user');
      if (userStr) {
        const u = JSON.parse(userStr);
        const uid = u?.id || u?.userId || u?.email;
        if (uid) {
          return `${USER_SUBSCRIPTION_KEY}_${uid}`;
        }
      }
    } catch {
      // ignore
    }
    return USER_SUBSCRIPTION_KEY;
  },

  /**
   * Lấy thông tin gói hội viên hiện tại của người dùng (Không tự động gán gói Pro giả nếu chưa đăng ký)
   */
  getUserSubscription(): UserSubscriptionState {
    try {
      const key = this.getUserStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        const sub = JSON.parse(saved) as UserSubscriptionState;
        if (sub && sub.planName && sub.expiresAt) {
          const diffMs = new Date(sub.expiresAt).getTime() - Date.now();
          const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          return {
            ...sub,
            daysRemaining,
            status: daysRemaining > 0 ? 'Active' : 'Expired',
          };
        }
      }
    } catch (e) {
      console.error('Lỗi khi đọc gói người dùng:', e);
    }

    // Mặc định khi người dùng chưa đăng ký bất kỳ gói tháng nào
    return {
      planId: '',
      planName: 'Chưa đăng ký gói hội viên',
      planTier: 'Free',
      status: 'None',
      activatedAt: '',
      expiresAt: '',
      daysRemaining: 0,
      monthlyPrice: 0,
      features: DEFAULT_PLANS[0].features,
      creditsAmount: 0,
      fiveHourQuota: 0,
    };
  },

  /**
   * Xóa cache gói tháng cục bộ khi Backend xác nhận người dùng chưa có gói hoặc đã hết hạn
   */
  clearUserSubscription(): void {
    try {
      localStorage.removeItem(this.getUserStorageKey());
      localStorage.removeItem(USER_SUBSCRIPTION_KEY);
    } catch {
      // ignore
    }
  },

  /**
   * Cập nhật gói cho người dùng khi thanh toán PayOS thành công
   */
  setUserSubscription(plan: SubscriptionPlanItem): UserSubscriptionState {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const planTier = plan.name.toLowerCase().includes('max') ? 'Pro Max' : 'Pro';

    const sub: UserSubscriptionState = {
      planId: plan.id,
      planName: plan.name,
      planTier,
      status: 'Active',
      activatedAt: now.toISOString(),
      expiresAt,
      daysRemaining: 30,
      monthlyPrice: plan.price,
      features: plan.features,
      creditsAmount: plan.creditsAmount,
      fiveHourQuota: plan.fiveHourQuota,
    };

    localStorage.setItem(this.getUserStorageKey(), JSON.stringify(sub));
    window.dispatchEvent(new CustomEvent('jcap_subscription_updated', { detail: sub }));
    return sub;
  },
};