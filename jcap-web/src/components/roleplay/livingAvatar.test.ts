import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countJapaneseMora } from '../../utils/moraPhonetics.ts';

describe('LivingAvatar & Mora Phonetics', () => {
  describe('countJapaneseMora', () => {
    it('correctly counts moras for standard hiragana greetings', () => {
      // こ・ん・に・ち・は => 5 moras
      assert.equal(countJapaneseMora('こんにちは'), 5);
      // あ・り・が・と・う => 5 moras
      assert.equal(countJapaneseMora('ありがとう'), 5);
    });

    it('correctly handles contracted sounds (yoon) and small kana', () => {
      // ち・ょ・っ・と -> ちょ (1 mora) + っ (sokuon, 1 mora) + と (1 mora) = 3 moras
      assert.equal(countJapaneseMora('ちょっと'), 3);
      // き・ょ・う -> きょう = 2 moras
      assert.equal(countJapaneseMora('きょう'), 2);
    });

    it('correctly counts chouon (prolonged sound mark ー)', () => {
      // ラ・ー・メ・ン => 4 moras
      assert.equal(countJapaneseMora('ラーメン'), 4);
      // コ・ー・ヒ・ー => 4 moras
      assert.equal(countJapaneseMora('コーヒー'), 4);
    });

    it('returns 0 for empty or whitespace-only strings', () => {
      assert.equal(countJapaneseMora(''), 0);
      assert.equal(countJapaneseMora('   '), 0);
      assert.equal(countJapaneseMora('、。！？'), 0);
    });
  });
});
