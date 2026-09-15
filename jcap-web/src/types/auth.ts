export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

export interface AuthResponseDto {
  token: string;
  userId: string;
  email: string;
  fullName: string;
  role: string;
  expiresAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  level?: string;
  avatarUrl?: string;
  creditBalance?: number;
  [key: string]: any;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role?: string;
  jlptLevel?: string;
}

