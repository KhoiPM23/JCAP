export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

export type PlacementTestStatusType =
  | 'NotStarted'
  | 'Skipped'
  | 'InProgress'
  | 'InsufficientEvidence'
  | 'Completed';

export interface AuthResponseDto {
  token: string;
  userId: string;
  email: string;
  fullName: string;
  role: string;
  jlptLevel?: string;
  creditBalance?: number;
  expiresAt: string;
  hasPassword: boolean;
  placementTestStatus?: PlacementTestStatusType;
  hasSeenPlacementPrompt?: boolean;
  initialEstimatedLevel?: string | null;
  initialConfidenceTier?: string | null;
}

export interface RegisterResponseDto {
  email: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  level?: string;
  avatarUrl?: string;
  creditBalance?: number;
  placementTestStatus?: PlacementTestStatusType;
  hasSeenPlacementPrompt?: boolean;
  initialEstimatedLevel?: string | null;
  initialConfidenceTier?: string | null;
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
}

export interface ResetPasswordPayload {
  email: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}
