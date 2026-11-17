import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { transform } from 'sucrase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '../../..');

function loadTsxComponent<T = any>(relPath: string, exportName: string): T {
  const fullPath = path.resolve(webRoot, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transformed = transform(code, {
    transforms: ['typescript', 'jsx', 'imports'],
  }).code;

  const customRequire = (spec: string) => {
    if (spec === 'react') return React;
    if (spec === 'react-dom/server') return ReactDOMServer;
    if (spec.includes('ukiyoSoundEngine')) {
      return {
        ukiyoSound: {
          playSubtleTap: () => {},
          playWoodblockSnap: () => {},
          playTaikoSuccess: () => {},
          playHyoshigiAlert: () => {},
          playChimeScore: () => {},
        },
      };
    }
    return import(spec);
  };

  const mod: { exports: any } = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transformed);
  fn(customRequire, mod, mod.exports);

  if (exportName === '__all__') return mod.exports;
  return mod.exports[exportName];
}

describe('FE-03 Milestone 3: SumiInkIndicator & Ambient Micro-Feedback', () => {
  const SumiInkIndicator = loadTsxComponent('src/components/roleplay/SumiInkIndicator.tsx', 'SumiInkIndicator');
  const RedoTurnButton = loadTsxComponent('src/components/roleplay/SumiInkIndicator.tsx', 'RedoTurnButton');
  const LivingAvatar = loadTsxComponent('src/components/roleplay/LivingAvatar.tsx', 'LivingAvatar');

  it('Returns null when feedback is undefined or has no stain', () => {
    const htmlEmpty = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SumiInkIndicator, { feedback: undefined })
    );
    assert.equal(htmlEmpty, '', 'Should render nothing when feedback is undefined');

    const cleanFeedback = {
      hasStain: false,
      stainType: 'None',
      registerDelta: 0,
      isSurvivalPhrase: false,
    };
    const htmlClean = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SumiInkIndicator, { feedback: cleanFeedback })
    );
    assert.equal(htmlClean, '', 'Should render nothing when hasStain is false');
  });

  it('Renders Survival Phrase badge with 100% autonomy and no error when isSurvivalPhrase is true', () => {
    const survivalFeedback = {
      hasStain: false,
      stainType: 'None',
      message: 'Cụm từ sinh tồn: đã yêu cầu nhắc lại hoặc nói chậm.',
      registerDelta: 0,
      isSurvivalPhrase: true,
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SumiInkIndicator, { feedback: survivalFeedback })
    );

    assert.ok(html.includes('Cụm từ sinh tồn (100đ Tự chủ)'), 'Should display survival phrase badge');
    assert.ok(html.includes('check_circle'), 'Should render check_circle icon');
    assert.ok(!html.includes('NaN'), 'Should not contain NaN');
  });

  it('Renders ambient Sumi ink stain when register slip is detected', () => {
    const slipFeedback = {
      hasStain: true,
      stainType: 'TameguchiSlip',
      message: 'Bạn đang dùng thể thường với cấp trên. Hãy dùng thể Kính ngữ hoặc Desu/Masu.',
      suggestedAlternative: 'かしこまりました、すぐ対応いたします。',
      registerDelta: -2,
      isSurvivalPhrase: false,
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SumiInkIndicator, {
        feedback: slipFeedback,
        onRedo: () => {},
      })
    );

    assert.ok(html.includes('Lưu ý về thể văn và độ lịch sự trong giao tiếp'), 'Should render style/register notice');
    assert.ok(html.includes('Lệch vai vế'), 'Should indicate register asymmetry slip');
    assert.ok(html.includes('言い直す ↻'), 'Should include 1-click self-repair button');
    assert.ok(!html.includes('NaN'), 'Zero NaN in rendered markup');
  });

  it('Renders backend standard error and warning stainTypes accurately', () => {
    const errorHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SumiInkIndicator, {
        feedback: {
          hasStain: true,
          stainType: 'error',
          message: 'Cảnh báo vai vế nghiêm trọng',
          registerDelta: -2,
          isSurvivalPhrase: false,
        },
      })
    );
    assert.ok(errorHtml.includes('Lệch vai vế'), 'error stainType maps to Lệch vai vế');
    assert.ok(errorHtml.includes('bg-rose-500'), 'error stainType renders rose shu-soft color');

    const warningHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SumiInkIndicator, {
        feedback: {
          hasStain: true,
          stainType: 'warning',
          message: 'Gợi ý điều chỉnh sắc thái nhẹ',
          registerDelta: -1,
          isSurvivalPhrase: false,
        },
      })
    );
    assert.ok(warningHtml.includes('Sắc thái'), 'warning stainType maps to Sắc thái');
    assert.ok(warningHtml.includes('bg-amber-500'), 'warning stainType renders amber color');
  });

  it('RedoTurnButton renders clean HTML and valid label', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(RedoTurnButton, {
        onRedo: () => {},
        label: '言い直す ↻',
      })
    );

    assert.ok(html.includes('言い直す ↻'), 'Should contain button label');
    assert.ok(html.includes('autorenew'), 'Should render autorenew icon');
  });

  it('LivingAvatar renders puzzled and delighted states without NaN or broken attributes', () => {
    const puzzledHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, {
        avatarState: 'puzzled',
        personaName: 'Tanaka',
        archetype: 'business',
      })
    );
    assert.ok(!puzzledHtml.includes('NaN'), 'Puzzled state has zero NaN');
    assert.ok(puzzledHtml.includes('<svg'), 'Puzzled state renders valid SVG');
    assert.ok(puzzledHtml.includes('border-amber-300'), 'Puzzled state includes subtle amber frame');

    const delightedHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, {
        avatarState: 'delighted',
        personaName: 'Ryusei',
        archetype: 'culinary',
      })
    );
    assert.ok(!delightedHtml.includes('NaN'), 'Delighted state has zero NaN');
    assert.ok(delightedHtml.includes('<svg'), 'Delighted state renders valid SVG');
    assert.ok(delightedHtml.includes('border-amber-400'), 'Delighted state includes warm amber ring');
  });
});
