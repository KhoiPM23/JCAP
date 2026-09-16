export interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  price: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCreditPackageDto {
  name: string;
  credits: number;
  price: number;
}

export interface UpdateCreditPackageDto {
  name: string;
  credits: number;
  price: number;
  isActive: boolean;
}

