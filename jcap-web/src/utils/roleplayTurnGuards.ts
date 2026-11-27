/**
 * Pure domain guards & resolution helpers for RoleplayPracticeView (#194, #153, #195, #172, #173, #155).
 */

export interface RoleplayTurnQuotaInput {
  isAdmin: boolean;
  hasActiveSubscription?: boolean | null;
  isSubscriptionQuotaExhausted?: boolean | null;
  remainingSubscriptionQuota?: number | null;
  creditBalance?: number | null;
  isQuotaBlocked?: boolean;
  serverWarningMessage?: string | null;
}

/**
 * Determines whether the user is permitted to send a roleplay turn.
 * - Admins are always allowed.
 * - If backend has explicitly blocked quota (HTTP 400 insufficient credit/quota), block until resolved.
 * - Active subscription learners with remaining token quota (> 0) are allowed even when creditBalance is 0.
 * - Wallet-only learners (or subscription learners whose token quota is exhausted) with creditBalance <= 0 are blocked pre-flight.
 */
export function canSendRoleplayTurn(input: RoleplayTurnQuotaInput): boolean {
  if (input.isAdmin) return true;
  if (input.isQuotaBlocked) return false;

  const subQuotaExhausted =
    Boolean(input.isSubscriptionQuotaExhausted) ||
    (typeof input.remainingSubscriptionQuota === 'number' && input.remainingSubscriptionQuota <= 0);

  if (input.hasActiveSubscription && !subQuotaExhausted) {
    return true;
  }

  if (typeof input.creditBalance === 'number' && input.creditBalance <= 0) {
    return false;
  }
  return true;
}

/**
 * Resolves a low-credit (<= 5 coins) or low-subscription-token (<= 5 tokens) warning message
 * when the user is still allowed to send turns, or null if no warning should be shown.
 * - If subscription token quota is NOT exhausted and has > 5 tokens left: returns null even if creditBalance is 0.
 */
export function resolveRoleplayCreditWarning(input: RoleplayTurnQuotaInput): string | null {
  if (input.isAdmin) return null;

  const subQuotaExhausted =
    Boolean(input.isSubscriptionQuotaExhausted) ||
    (typeof input.remainingSubscriptionQuota === 'number' && input.remainingSubscriptionQuota <= 0);

  if (input.hasActiveSubscription && !subQuotaExhausted) {
    if (
      typeof input.remainingSubscriptionQuota === 'number' &&
      input.remainingSubscriptionQuota > 0 &&
      input.remainingSubscriptionQuota <= 5
    ) {
      return (
        input.serverWarningMessage ||
        `Gói tháng của bạn sắp hết token trong chu kỳ này (còn ${input.remainingSubscriptionQuota} token).`
      );
    }
    return null;
  }

  if (typeof input.creditBalance === 'number' && input.creditBalance > 0 && input.creditBalance <= 5) {
    if (input.serverWarningMessage) return input.serverWarningMessage;
    return input.hasActiveSubscription
      ? `Token gói tháng đã hết, hệ thống đang dùng xu dự phòng và bạn sắp hết xu (chỉ còn ${input.creditBalance} xu). Vui lòng nạp thêm Credit.`
      : `Số dư Credit của bạn sắp hết (chỉ còn ${input.creditBalance} xu). Vui lòng nạp thêm Credit hoặc đăng ký Gói tháng để cuộc trò chuyện không bị gián đoạn.`;
  }

  return null;
}

/**
 * Detects whether a failed sendMessage response represents an insufficient-credit or exhausted-quota error.
 */
export function isInsufficientCreditError(status?: number, message?: string | null): boolean {
  const msg = (message || '').trim();
  if (status === 400 && /credit|số dư|hết lượt|hạn mức|hạn ngạch|không đủ|nạp thêm|quota|gói tháng/i.test(msg)) {
    return true;
  }
  return /số dư credit.*không đủ|hết hạn mức|hết hạn ngạch|hết credit|nạp thêm.*credit|quota.*exhausted/i.test(msg);
}

/**
 * Normalizes Japanese text for echo comparison by removing punctuation and whitespace.
 */
export function normalizeForEchoCheck(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/[\s\u3000.,!?。、？！「」『』（）()・\-〜~]/g, '')
    .trim();
}

function matchesEchoTarget(normTranscript: string, rawTarget?: string | null): boolean {
  if (!rawTarget) return false;
  const normTarget = normalizeForEchoCheck(rawTarget);
  if (!normTarget) return false;

  if (normTranscript === normTarget) return true;
  if (normTarget.length >= 4 && normTranscript.includes(normTarget)) return true;

  const clauses = rawTarget
    .split(/[。？！?!、\s]+/)
    .map((c) => normalizeForEchoCheck(c))
    .filter((c) => c.length >= 4);
  if (clauses.some((clause) => clause === normTranscript)) {
    return true;
  }

  if (normTranscript.length >= 10 && normTarget.includes(normTranscript)) {
    return true;
  }

  return false;
}

/**
 * Checks whether an STT transcript is an echo of the just-played AI vocal filler or last AI utterance (#195).
 */
export function isFillerOrAiEcho(
  transcript?: string | null,
  lastFiller?: string | null,
  lastAiText?: string | null
): boolean {
  const normTranscript = normalizeForEchoCheck(transcript);
  if (!normTranscript || normTranscript.length < 4) return false;

  return (
    matchesEchoTarget(normTranscript, lastFiller) ||
    matchesEchoTarget(normTranscript, lastAiText)
  );
}

export interface DeadlockFillerGuardInput {
  isHandsFreeMode: boolean;
  isSending: boolean;
  isPlayingAiSpeech: boolean;
  isSessionConcluded: boolean;
  hasSpokenFiller: boolean;
  isOutOfCredits: boolean;
  isLearnerUttering: boolean;
  hasUtteranceStarted: boolean;
  latestTranscript?: string | null;
  inputText?: string | null;
}

export function shouldRunDeadlockFiller(input: DeadlockFillerGuardInput): boolean {
  if (!input.isHandsFreeMode) return false;
  if (input.isSending || input.isPlayingAiSpeech || input.isSessionConcluded) return false;
  if (input.hasSpokenFiller || input.isOutOfCredits) return false;
  if (input.isLearnerUttering || input.hasUtteranceStarted) return false;
  if ((input.latestTranscript || '').trim().length > 0) return false;
  if ((input.inputText || '').trim().length > 0) return false;
  return true;
}

export interface ManualIdleFillerGuardInput {
  isHandsFreeMode: boolean;
  isSending: boolean;
  isPlayingAiSpeech: boolean;
  isRecordingMic: boolean;
  isSessionConcluded: boolean;
  hasHint: boolean;
  isOutOfCredits: boolean;
  hasSpokenFiller?: boolean;
}

export function shouldRunManualIdleFiller(input: ManualIdleFillerGuardInput): boolean {
  if (input.isHandsFreeMode) return false;
  if (input.isSending || input.isPlayingAiSpeech || input.isRecordingMic) return false;
  if (input.isSessionConcluded || input.hasHint || input.isOutOfCredits) return false;
  if (input.hasSpokenFiller) return false;
  return true;
}

/**
 * Resolves the post-session result route for a completed session (#172).
 * Prefers `resultId` from RoleplaySessionDetailsDto over sessionId and omits `?justCompleted=true`.
 */
export function resolveCompletedResultPath(params: {
  resultId?: number | null;
  sessionId?: number | null;
  routeSessionId?: number | null;
  returnUrl?: string | null;
}): string {
  const targetId = params.resultId ?? params.sessionId ?? params.routeSessionId;
  const basePath = `/roleplay/results/${targetId}`;
  if (params.returnUrl) {
    return `${basePath}?return=${encodeURIComponent(params.returnUrl)}`;
  }
  return basePath;
}

/**
 * Resolves the back-button target on the error screen while honoring returnUrl (#173).
 */
export function resolveErrorBackTarget(returnUrl?: string | null): { path: string; label: string } {
  const trimmed = (returnUrl || '').trim();
  if (trimmed && trimmed.startsWith('/') && !/^\/[/\\]/.test(trimmed)) {
    return {
      path: trimmed,
      label: '← Quay lại Bản đồ Khám phá',
    };
  }
  return {
    path: '/scenarios',
    label: '← Quay lại thư viện kịch bản',
  };
}

/**
 * Resolves speaking duration in seconds, preferring Whisper/recorded audio duration
 * over wall-clock or text-length heuristics (#155).
 */
export function resolveSpeakingDurationSeconds(params: {
  whisperDurationSeconds?: number | null;
  recordedDurationSeconds?: number | null;
  firstUtteranceAt?: number | null;
  micStartedAt?: number | null;
  now: number;
  textLength: number;
  usedVoiceInput: boolean;
}): number | undefined {
  if (typeof params.whisperDurationSeconds === 'number' && params.whisperDurationSeconds > 0) {
    return Math.round(params.whisperDurationSeconds * 10) / 10;
  }
  if (typeof params.recordedDurationSeconds === 'number' && params.recordedDurationSeconds > 0) {
    return Math.round(params.recordedDurationSeconds * 10) / 10;
  }
  if (params.firstUtteranceAt) {
    return Math.round(Math.max(0.4, (params.now - params.firstUtteranceAt) / 1000) * 10) / 10;
  }
  if (params.micStartedAt) {
    return Math.round(Math.max(0.4, (params.now - params.micStartedAt) / 1000) * 10) / 10;
  }
  if (params.usedVoiceInput && params.textLength > 0) {
    return Math.max(0.8, Math.round(params.textLength * 0.22 * 10) / 10);
  }
  return undefined;
}
