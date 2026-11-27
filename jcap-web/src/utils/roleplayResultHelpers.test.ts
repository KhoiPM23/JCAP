import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdaptiveRecommendations } from './roleplayResultHelpers.ts';

describe('buildAdaptiveRecommendations (Hybrid AI-Adaptive)', () => {
  const sampleResult: any = {
    id: 101,
    scenarioId: 1,
    jlptLevel: 'N5',
    overallScore: 78,
    passStatus: true,
    targetVocabularies: [
      { id: 1, word: 'ラーメン', reading: 'ラーメン', meaning: 'Mì Ramen' },
    ],
    messages: [
      { sender: 'User', japaneseText: '豚骨ラーメンを一つお願いします。' },
    ],
  };

  const sampleScenarios: any[] = [
    {
      id: 2,
      title: 'Phỏng vấn xin việc Baito',
      description: 'Giới thiệu bản thân tại cửa hàng',
      topicName: 'Công sở',
      supportedJLPTLevels: ['N4', 'N3'],
    },
    {
      id: 3,
      title: 'Mua sắm tại Combini',
      description: 'Hâm nóng đồ ăn và thanh toán',
      topicName: 'Mua sắm',
      supportedJLPTLevels: ['N5', 'N4'],
    },
  ];

  it('prefers AI executiveDiagnosis and AI-overlaid scenario reasons when adaptiveContext contains aiCoaching', () => {
    const out = buildAdaptiveRecommendations(sampleResult, sampleScenarios, {
      recommendedDifficulty: 'N4',
      recommendedScenarios: [
        {
          scenarioId: 3,
          recommendedLevel: 'N5',
          tier: 'Consolidate',
          matchScore: 84,
          predictedPassRate: 88,
          reasonVi: 'AI gợi ý: củng cố số lượng và thanh toán mượt mà hơn.',
          isTopPick: false,
        },
        {
          scenarioId: 2,
          recommendedLevel: 'N4',
          tier: 'Core',
          matchScore: 93,
          predictedPassRate: 76,
          reasonVi: 'AI gợi ý: sẵn sàng chuyển lên N4 với hội thoại phỏng vấn.',
          isTopPick: true,
        },
      ],
      aiCoaching: {
        sourceSessionId: 101,
        generatedAtUtc: '2026-11-27T18:00:00Z',
        source: 'ai',
        executiveDiagnosis: 'Bạn phản xạ tự nhiên ở mức N5 và đã sẵn sàng rèn thể lịch sự ở tình huống N4.',
      },
    });

    assert.equal(
      out.weaknessSummary,
      'Bạn phản xạ tự nhiên ở mức N5 và đã sẵn sàng rèn thể lịch sự ở tình huống N4.',
    );
    assert.equal(out.items.length, 2);
    assert.equal(out.items[0].actionReason, 'AI gợi ý: củng cố số lượng và thanh toán mượt mà hơn.');
    assert.equal(out.items[1].isTopPick, true);
    assert.equal(out.items[1].actionReason, 'AI gợi ý: sẵn sàng chuyển lên N4 với hội thoại phỏng vấn.');
  });

  it('falls back cleanly to deterministic summary when aiCoaching is absent', () => {
    const out = buildAdaptiveRecommendations(sampleResult, sampleScenarios, {
      recommendedDifficulty: 'N5',
      recommendedScenarios: [
        {
          scenarioId: 3,
          recommendedLevel: 'N5',
          tier: 'Core',
          matchScore: 89,
          predictedPassRate: 82,
          reasonVi: 'Phù hợp mức N5 hiện tại.',
          isTopPick: true,
        },
      ],
    });

    assert.match(out.weaknessSummary, /Hệ thống đề xuất ưu tiên trình độ N5/);
    assert.equal(out.items[0].actionReason, 'Phù hợp mức N5 hiện tại.');
  });
});
