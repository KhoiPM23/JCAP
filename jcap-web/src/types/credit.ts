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
}

export interface CreditHistoryResponse {
  transactions: CreditTransaction[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  currentCreditBalance: number;
}
