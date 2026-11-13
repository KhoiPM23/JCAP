export interface HotelRoomOptionDto {
  code: string;
  name: string;
  bedType: string;
  status: string;
  surchargePerNight: number;
  isAvailable: boolean;
}

export interface HotelContextPackageDto {
  hotelName: string;
  guestName: string;
  bookingDates: string;
  bookedRoomType: string;
  specialRequest: string;
  breakfastPolicy: string;
  checkInTime: string;
  checkOutTime: string;
  receptionistSpeakerId?: number;
  roomOptions: HotelRoomOptionDto[];
}

export interface PlacementTestStatusDto {
  placementTestStatus: 'NotStarted' | 'Skipped' | 'InProgress' | 'InsufficientEvidence' | 'Completed';
  hasSeenPlacementPrompt: boolean;
  activeSessionId?: number | null;
  initialEstimatedLevel?: string | null;
  initialConfidenceTier?: string | null;
  initialProficiencySnapshotJson?: string | null;
  contextPackage: HotelContextPackageDto;
  eventSummaries?: PlacementEventEvidenceSummary[];
}

export interface PlacementTestTurnMessageDto {
  id: number;
  sender: 'Ai' | 'User';
  japaneseText: string;
  vietnameseMeaning?: string | null;
  furiganaHtml?: string | null;
  createdAt: string;
}

export interface PlacementTestStartResponseDto {
  sessionId: number;
  status: string;
  currentEvent: string;
  currentDifficultyBand: string;
  isResumed: boolean;
  openingMessage: PlacementTestTurnMessageDto;
  messageHistory: PlacementTestTurnMessageDto[];
  contextPackage: HotelContextPackageDto;
  eventSummaries?: PlacementEventEvidenceSummary[];
}

export interface PlacementTestMessageRequestDto {
  message: string;
  fallbackToTextInput?: boolean;
  audioUrl?: string | null;
  speakingDurationSeconds?: number;
  responseLatencySeconds?: number;
  speechConfidence?: number | null;
}

export interface PlacementTestMessageResponseDto {
  sessionId: number;
  userMessage: PlacementTestTurnMessageDto;
  aiMessage: PlacementTestTurnMessageDto;
  currentEvent: string;
  currentDifficultyBand: string;
  scaffoldingStep: number;
  inputClassification: 'Valid' | 'CommunicationDifficulty' | 'OffTopic' | 'AbusiveOrSpam';
  detectedIntent: string;
  demonstratedBand: string;
  isConcluded: boolean;
  terminationReason: string;
  isStrikeWarning: boolean;
  strikeWarningMessage?: string | null;
  taskFulfillmentScore?: number | null;
  grammarAccuracyScore?: number | null;
  vocabularyRangeScore?: number | null;
  pragmaticsScore?: number | null;
  overallTurnScore?: number | null;
  evidenceNote?: string | null;
  estimatedLevelSoFar?: string | null;
  eventSummaries?: PlacementEventEvidenceSummary[];
}

export interface SpeechDeliveryReferenceDto {
  speakingDurationSeconds: number;
  responseLatencySeconds: number;
  speechConfidence?: number | null;
  note: string;
}

export interface PlacementEventEvidenceSummary {
  eventCode: string;
  communicativeGoal: string;
  outcomeStatus: string;
  highestDemonstratedBand: string;
  scaffoldingStepsNeeded: number;
  summaryExplanation: string;
}

export interface PlacementTestCompleteResponseDto {
  sessionId: number;
  placementTestStatus: string;
  initialEstimatedLevel: string;
  initialConfidenceTier: string;
  overallScore: number;
  taskFulfillmentScore: number;
  grammarAccuracyScore: number;
  vocabularyRangeScore: number;
  pragmaticsScore: number;
  speechDeliveryReference?: SpeechDeliveryReferenceDto | null;
  eventSummaries: PlacementEventEvidenceSummary[];
  summaryFeedback: string;
  disclaimer: string;
  completedAtUtc: string;
}

export interface PlacementTurnEvidence {
  turnIndex: number;
  eventCode: string;
  promptDifficultyBand: string;
  scaffoldingStepUsed: number;
  inputClassification: 'Valid' | 'CommunicationDifficulty' | 'OffTopic' | 'AbusiveOrSpam';
  detectedIntent: string;
  demonstratedBand: string;
  taskFulfillmentScore: number;
  grammarAccuracyScore: number;
  vocabularyRangeScore: number;
  pragmaticsScore: number;
  overallTurnScore?: number | null;
  speechDeliveryReference?: SpeechDeliveryReferenceDto | null;
  detectedRuleErrorCodes: string[];
  evidenceNote: string;
}

export interface PlacementTestHistoryItemDto {
  sessionId: number;
  status: string;
  initialEstimatedLevel: string;
  initialConfidenceTier: string;
  overallScore: number;
  taskFulfillmentScore: number;
  grammarAccuracyScore: number;
  vocabularyRangeScore: number;
  pragmaticsScore: number;
  totalTurns: number;
  fulfilledEventsCount: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface PlacementTestHistoryDetailDto {
  sessionId: number;
  status: string;
  initialEstimatedLevel: string;
  initialConfidenceTier: string;
  overallScore: number;
  taskFulfillmentScore: number;
  grammarAccuracyScore: number;
  vocabularyRangeScore: number;
  pragmaticsScore: number;
  summaryFeedback: string;
  disclaimer: string;
  createdAt: string;
  completedAt?: string | null;
  eventSummaries: PlacementEventEvidenceSummary[];
  turnEvidences: PlacementTurnEvidence[];
  messageHistory: PlacementTestTurnMessageDto[];
}
