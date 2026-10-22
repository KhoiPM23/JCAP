export interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  price: number;
  isActive: boolean;
  createdAt: string;
}

export interface PurchaseCreditRequest {
  packageId: number;
}

export interface PurchaseCreditResponse {
  success: boolean;
  message: string;
  checkoutUrl?: string;
  orderCode?: number;
  isMock: boolean;
  addedCredits?: number;
  newCreditBalance?: number;
}

export interface CreditTransaction {
  id: number;
  amount: number;
  type: string;
  description?: string;
  payOsOrderCode?: string;
  status: string;
  createdAt: string;
  currentCreditBalance?: number;
}

export interface CreditHistoryResponse {
  transactions: CreditTransaction[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  currentCreditBalance: number;
}

export interface UserQuota {
  weeklyTotalCredits: number;
  weeklyUsedCredits: number;
  weeklyRemainingCredits: number;
  weeklyRemainingPercent: number;
  weeklyResetsInText: string;

  fiveHourTotalCredits: number;
  fiveHourUsedCredits: number;
  fiveHourRemainingCredits: number;
  fiveHourRemainingPercent: number;
  fiveHourResetsInText: string;

  extraCreditBalance: number;
  planName: string;
  planTier: string;
}
