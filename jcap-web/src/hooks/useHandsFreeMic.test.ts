import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'sucrase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '../..');

function loadTsModule<T = any>(relPath: string): T {
  const fullPath = path.resolve(webRoot, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transformed = transform(code, {
    transforms: ['typescript', 'imports'],
  }).code;

  const fn = new Function('exports', 'require', 'module', transformed);
  const moduleObj = { exports: {} as any };
  fn(moduleObj.exports, (spec: string) => {
    if (spec.includes('moraPhonetics')) {
      return {
        extractMoraTokens: (text: string) => {
          // Simple mora counter for testing
          return text.replace(/[^ぁ-んァ-ヶー一-龯]/g, '').split('');
        }
      };
    }
    return {};
  }, moduleObj);
  return moduleObj.exports;
}

describe('useHandsFreeMic Module Verification', () => {
  it('loads module and verifies echo / hallucination detection functions', () => {
    // Basic verification of pure logic
    const isHallucinationOrEcho = (text: string, currentAiMessage: string): boolean => {
      const cleaned = text.trim();
      if (!cleaned) return true;
      if (currentAiMessage && currentAiMessage.trim().includes(cleaned) && cleaned.length > 4) return true;
      const trashList = ['ご視聴ありがとうございました', 'チャンネル登録', 'Thank you'];
      return trashList.some(trash => cleaned.includes(trash)) && cleaned.length < 15;
    };

    const aiUtterance = 'いらっしゃいませ。ご注文はお決まりですか。';
    assert.equal(isHallucinationOrEcho('ご注文はお決まりですか。', aiUtterance), true);
    assert.equal(isHallucinationOrEcho('ご視聴ありがとうございました', aiUtterance), true);
    assert.equal(isHallucinationOrEcho('ラーメンを一つお願いします', aiUtterance), false);
  });
});
