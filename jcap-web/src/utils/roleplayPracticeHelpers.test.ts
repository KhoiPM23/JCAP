import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getScenarioThemePalette,
  getFeedbackStatus,
  inferStagePropIcon,
  buildNaturalPhrase,
  buildDynamicStageProps,
} from './roleplayPracticeHelpers.ts';

describe('roleplayPracticeHelpers', () => {
  it('getScenarioThemePalette maps all 5 scenario domains and falls back cleanly', () => {
    assert.equal(getScenarioThemePalette('SCN_RAMEN_01').accentColor, '#b45309');
    assert.equal(getScenarioThemePalette(undefined, 'Mua vé tại ga Shinjuku').accentColor, '#0284c7');
    assert.equal(getScenarioThemePalette(undefined, 'Phỏng vấn Baito', 'interview').accentColor, '#4f46e5');
    assert.equal(getScenarioThemePalette('SCN_KONBINI_01').accentColor, '#e11d48');
    assert.equal(getScenarioThemePalette(undefined, undefined, undefined).accentColor, '#059669');
  });

  it('getFeedbackStatus resolves quickStatus, falls back to status, and defaults to good', () => {
    assert.equal(getFeedbackStatus(null), 'good');
    assert.equal(getFeedbackStatus(undefined), 'good');
    assert.equal(getFeedbackStatus({ status: 'Warning', quickStatus: 'Error' } as any), 'error');
    assert.equal(getFeedbackStatus({ status: 'WARNING' } as any), 'warning');
    assert.equal(getFeedbackStatus({} as any), 'good');
  });

  it('inferStagePropIcon detects domain kanji labels and returns empty string by default', () => {
    assert.equal(inferStagePropIcon('カード', 'Thanh toán thẻ', 'konbini'), '金');
    assert.equal(inferStagePropIcon('切符', 'Mua vé tàu', 'train'), '切');
    assert.equal(inferStagePropIcon('コーヒー', 'Cà phê', 'cafe'), '飲');
    assert.equal(inferStagePropIcon('こんにちは', 'Chào hỏi', 'cafe'), '珈');
    assert.equal(inferStagePropIcon('こんにちは', 'Chào hỏi', 'zen'), '');
  });

  it('buildNaturalPhrase builds context-aware Japanese sentences and prefers matching grammar example', () => {
    assert.equal(buildNaturalPhrase('', { theme: 'zen' }), 'はい、お願いします。');
    assert.equal(
      buildNaturalPhrase('すみません、お水をお願いします', { theme: 'ramen' }),
      'すみません、お水をお願いします。'
    );
    assert.equal(
      buildNaturalPhrase('硬め', {
        theme: 'ramen',
        targetGrammars: [{ exampleSentence: '麺を硬めでお願いします。' }],
      }),
      '麺を硬めでお願いします。'
    );
    assert.equal(buildNaturalPhrase('経験', { theme: 'office' }), '経験についてお話しします。');
    assert.equal(buildNaturalPhrase('新宿駅', { theme: 'train' }), 'すみません、新宿駅はどこですか？');
    assert.equal(buildNaturalPhrase('お水', { theme: 'cafe' }), 'すみません、お水をお願いします。');
  });

  it('buildDynamicStageProps prioritizes mission keywords, vocab/grammar, theme fallbacks, and appends coping phrase', () => {
    const props = buildDynamicStageProps(
      {
        targetVocabularies: [{ id: 1, word: '味玉', reading: 'あじたま', meaning: 'Trứng lòng đào' }],
        targetGrammars: [{ id: 2, pattern: '〜にできますか', meaning: 'Hỏi khả năng', exampleSentence: 'カード払いにできますか？' }],
      },
      { id: 10, content: 'Gọi món 豚骨ラーメン cho 1 người', isCompleted: false } as any,
      'ramen'
    );

    assert.equal(props[0].id, 'mission-kw-豚骨ラーメン');
    assert.equal(props[0].isHighlight, true);
    assert.ok(props.some((p) => p.labelJp === '味玉'));
    assert.ok(props.some((p) => p.id === 'coping-repeat'));
    assert.ok(props.length <= 5);
  });
});
