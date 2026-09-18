/**
 * Type definitions for UC07 (View Profile) and UC08 (Update Profile)
 * Strict typing aligned with JCAP Learner Profile domain model
 */

// JLPT Level of JCAP is strictly N5, N4, N3 (NO N2, NO N1)
export type JLPTLevel = 'N5' | 'N4' | 'N3';

export interface LearnerProfile {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  profilePictureUrl?: string;
  jlptLevel: JLPTLevel;
  role: string;
  createdAt: string;
}

export interface UpdateLearnerProfileRequest {
  fullName: string;
  phoneNumber?: string;
  profilePictureUrl?: string;
  jlptLevel: JLPTLevel;
}
