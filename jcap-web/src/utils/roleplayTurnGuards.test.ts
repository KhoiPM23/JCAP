import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSendRoleplayTurn,
  resolveRoleplayCreditWarning,
  isInsufficientCreditError,
  isFillerOrAiEcho,
  shouldRunDeadlockFiller,
  shouldRunManualIdleFiller,
  resolveCompletedResultPath,
  resolveErrorBackTarget,
  resolveSpeakingDurationSeconds,
} from './roleplayTurnGuards.ts';

describe('roleplayTurnGuards (#194, #153, #195, #172, #173, #155)', () => {
  it('#194/#153: canSendRoleplayTurn blocks 0-credit non-sub learners and quota-blocked users while allowing Admin & active-sub', () => {
    assert.equal(
      canSendRoleplayTurn({ isAdmin: true, hasActiveSubscription: false, creditBalance: 0 }),
      true
    );
    assert.equal(
      canSendRoleplayTurn({ isAdmin: false, hasActiveSubscription: true, creditBalance: 0 }),
      true
    );
    assert.equal(
      canSendRoleplayTurn({
        isAdmin: false,
        hasActiveSubscription: true,
        isSubscriptionQuotaExhausted: true,
        creditBalance: 0,
      }),
      false
    );
    assert.equal(
      canSendRoleplayTurn({
        isAdmin: false,
        hasActiveSubscription: true,
        isSubscriptionQuotaExhausted: true,
        creditBalance: 3,
      }),
      true
    );
    assert.equal(
      canSendRoleplayTurn({ isAdmin: false, hasActiveSubscription: true, creditBalance: 0, isQuotaBlocked: true }),
      false
    );
    assert.equal(
      canSendRoleplayTurn({ isAdmin: false, hasActiveSubscription: false, creditBalance: 0 }),
      false
    );
    assert.equal(
      canSendRoleplayTurn({ isAdmin: false, hasActiveSubscription: false, creditBalance: -2 }),
      false
    );
    assert.equal(
      canSendRoleplayTurn({ isAdmin: false, hasActiveSubscription: false, creditBalance: 5 }),
      true
    );
  });

  it('resolveRoleplayCreditWarning warns on <=5 coins or <=5 sub tokens, and stays silent when sub has >5 tokens even with 0 coins', () => {
    // 1. Active sub with plenty of tokens (> 5) and 0 extra coins -> silent (null)
    assert.equal(
      resolveRoleplayCreditWarning({
        isAdmin: false,
        hasActiveSubscription: true,
        remainingSubscriptionQuota: 42,
        isSubscriptionQuotaExhausted: false,
        creditBalance: 0,
      }),
      null
    );
    // 2. Active sub with low remaining tokens (<= 5) -> warns about subscription tokens
    const lowSubMsg = resolveRoleplayCreditWarning({
      isAdmin: false,
      hasActiveSubscription: true,
      remainingSubscriptionQuota: 4,
      isSubscriptionQuotaExhausted: false,
      creditBalance: 0,
    });
    assert.ok(lowSubMsg && lowSubMsg.includes('4 token'));

    // 3. Non-sub user with 5 coins -> warns about low credit balance
    const lowCoinMsg = resolveRoleplayCreditWarning({
      isAdmin: false,
      hasActiveSubscription: false,
      creditBalance: 5,
    });
    assert.ok(lowCoinMsg && lowCoinMsg.includes('5 xu'));

    // 4. Non-sub user with 6 coins -> silent (null)
    assert.equal(
      resolveRoleplayCreditWarning({
        isAdmin: false,
        hasActiveSubscription: false,
        creditBalance: 6,
      }),
      null
    );
  });

  it('#194/#153: isInsufficientCreditError detects backend HTTP 400 quota/credit rejections without false positives', () => {
    assert.equal(
      isInsufficientCreditError(
        400,
        'Số dư credit của bạn không đủ để tiếp tục lượt nói. Vui lòng nạp thêm để tiếp tục kịch bản.'
      ),
      true
    );
    assert.equal(
      isInsufficientCreditError(400, 'Bạn đã hết hạn mức 5 giờ của gói tháng và số dư credit bằng 0.'),
      true
    );
    assert.equal(isInsufficientCreditError(400, 'Tin nhắn không được để trống.'), false);
    assert.equal(isInsufficientCreditError(500, 'Internal server error'), false);
  });

  it('#195: shouldRunManualIdleFiller blocks filler whenever manual mic is open or out of credits', () => {
    assert.equal(
      shouldRunManualIdleFiller({
        isHandsFreeMode: false,
        isSending: false,
        isPlayingAiSpeech: false,
        isRecordingMic: true,
        isSessionConcluded: false,
        hasHint: false,
        isOutOfCredits: false,
      }),
      false
    );
    assert.equal(
      shouldRunManualIdleFiller({
        isHandsFreeMode: false,
        isSending: false,
        isPlayingAiSpeech: false,
        isRecordingMic: false,
        isSessionConcluded: false,
        hasHint: false,
        isOutOfCredits: true,
      }),
      false
    );
    assert.equal(
      shouldRunManualIdleFiller({
        isHandsFreeMode: false,
        isSending: false,
        isPlayingAiSpeech: false,
        isRecordingMic: false,
        isSessionConcluded: false,
        hasHint: false,
        isOutOfCredits: false,
      }),
      true
    );
  });

  it('#195: shouldRunDeadlockFiller aborts when learner is speaking, transcript exists, or out of credits', () => {
    assert.equal(
      shouldRunDeadlockFiller({
        isHandsFreeMode: true,
        isSending: false,
        isPlayingAiSpeech: false,
        isSessionConcluded: false,
        hasSpokenFiller: false,
        isOutOfCredits: false,
        isLearnerUttering: true,
        hasUtteranceStarted: false,
        latestTranscript: '',
        inputText: '',
      }),
      false
    );
    assert.equal(
      shouldRunDeadlockFiller({
        isHandsFreeMode: true,
        isSending: false,
        isPlayingAiSpeech: false,
        isSessionConcluded: false,
        hasSpokenFiller: false,
        isOutOfCredits: false,
        isLearnerUttering: false,
        hasUtteranceStarted: false,
        latestTranscript: 'すみません',
        inputText: '',
      }),
      false
    );
    assert.equal(
      shouldRunDeadlockFiller({
        isHandsFreeMode: true,
        isSending: false,
        isPlayingAiSpeech: false,
        isSessionConcluded: false,
        hasSpokenFiller: false,
        isOutOfCredits: false,
        isLearnerUttering: false,
        hasUtteranceStarted: false,
        latestTranscript: '',
        inputText: '',
      }),
      true
    );
  });

  it('#195: isFillerOrAiEcho rejects AI vocal filler echoes while preserving genuine short Japanese responses', () => {
    const filler = 'どうぞ、ごゆっくりお選びください。';
    const aiMsg = 'いらっしゃいませ！ご注文はお決まりですか？';
    assert.equal(isFillerOrAiEcho('どうぞごゆっくりお選びください', filler, aiMsg), true);
    assert.equal(isFillerOrAiEcho('ご注文はお決まりですか', filler, aiMsg), true);
    assert.equal(isFillerOrAiEcho('とんこつラーメンを一つお願いします', filler, aiMsg), false);
    assert.equal(isFillerOrAiEcho('はい', filler, aiMsg), false);
    assert.equal(isFillerOrAiEcho('ゆっくり', filler, aiMsg), false);

    const fallbackFiller = '大丈夫ですか？ごゆっくりでいいですよ。';
    assert.equal(isFillerOrAiEcho('「大丈夫ですか？」', fallbackFiller, ''), true);
    assert.equal(isFillerOrAiEcho('大丈夫ですか', fallbackFiller, ''), true);
    assert.equal(isFillerOrAiEcho('いいですよ', fallbackFiller, ''), false);
  });

  it('#172: resolveCompletedResultPath prefers resultId over sessionId and omits ?justCompleted=true', () => {
    assert.equal(
      resolveCompletedResultPath({ resultId: 901, sessionId: 42, routeSessionId: 42, returnUrl: null }),
      '/roleplay/results/901'
    );
    assert.equal(
      resolveCompletedResultPath({ resultId: 901, sessionId: 42, routeSessionId: 42, returnUrl: '/explore' }),
      '/roleplay/results/901?return=%2Fexplore'
    );
    assert.equal(
      resolveCompletedResultPath({ resultId: null, sessionId: 42, routeSessionId: 42, returnUrl: null }),
      '/roleplay/results/42'
    );
  });

  it('#173: resolveErrorBackTarget preserves valid returnUrl and rejects protocol-relative or backslash-prefixed URLs', () => {
    assert.deepEqual(resolveErrorBackTarget('/explore'), {
      path: '/explore',
      label: '← Quay lại Bản đồ Khám phá',
    });
    assert.deepEqual(resolveErrorBackTarget('//evil.com'), {
      path: '/scenarios',
      label: '← Quay lại thư viện kịch bản',
    });
    assert.deepEqual(resolveErrorBackTarget('/\\evil.com'), {
      path: '/scenarios',
      label: '← Quay lại thư viện kịch bản',
    });
    assert.deepEqual(resolveErrorBackTarget(null), {
      path: '/scenarios',
      label: '← Quay lại thư viện kịch bản',
    });
  });

  it('#155: resolveSpeakingDurationSeconds prefers Whisper/recorded duration over text-length heuristic', () => {
    assert.equal(
      resolveSpeakingDurationSeconds({
        whisperDurationSeconds: 3.42,
        recordedDurationSeconds: 4.1,
        firstUtteranceAt: 1000,
        micStartedAt: 500,
        now: 6000,
        textLength: 5,
        usedVoiceInput: true,
      }),
      3.4
    );
    assert.equal(
      resolveSpeakingDurationSeconds({
        whisperDurationSeconds: 0,
        recordedDurationSeconds: 2.76,
        firstUtteranceAt: null,
        micStartedAt: null,
        now: 6000,
        textLength: 20,
        usedVoiceInput: true,
      }),
      2.8
    );
    assert.equal(
      resolveSpeakingDurationSeconds({
        whisperDurationSeconds: null,
        recordedDurationSeconds: null,
        firstUtteranceAt: null,
        micStartedAt: null,
        now: 6000,
        textLength: 10,
        usedVoiceInput: false,
      }),
      undefined
    );
  });
});
