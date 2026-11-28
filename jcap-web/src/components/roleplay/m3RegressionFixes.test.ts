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

function loadTsxModule(relPath: string, customMocks: Record<string, any> = {}): any {
  const fullPath = path.resolve(webRoot, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transformed = transform(code, {
    transforms: ['typescript', 'jsx', 'imports'],
  }).code;

  const customRequire = (spec: string) => {
    if (spec in customMocks) return customMocks[spec];
    if (spec === 'react') return React;
    if (spec === 'react-dom/server') return ReactDOMServer;
    if (spec.includes('ukiyoSoundEngine')) {
      return {
        ukiyoSound: {
          playSubtleTap: () => {},
          playTaikoSuccess: () => {},
          playHyoshigiAlert: () => {},
          playChimeScore: () => {},
          playWoodblockSnap: () => {},
        },
      };
    }
    if (spec.includes('japaneseSanitizer')) {
      return loadTsxModule('src/utils/japaneseSanitizer.ts', customMocks);
    }
    if (spec.includes('SumiInkIndicator')) {
      return { SumiInkIndicator: () => null };
    }
    throw new Error(`Unhandled require in test harness: ${spec}`);
  };

  const mod: { exports: any } = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transformed);
  fn(customRequire, mod, mod.exports);
  return mod.exports;
}

describe('M3 Regression Fixes (#192, #193, R3 Zero-Emoji & Route Gating)', () => {
  it('#192: HanabiSparkleBurst executes identical hook count across active=false -> true -> false transitions', () => {
    let hookCallCount = 0;
    const mockReact = {
      ...React,
      useEffect: () => {
        hookCallCount++;
      },
      useMemo: (factory: () => any) => {
        hookCallCount++;
        return factory();
      },
    };

    const { HanabiSparkleBurst: InstrumentedBurst } = loadTsxModule(
      'src/components/roleplay/HanabiSparkleBurst.tsx',
      { react: mockReact }
    );

    hookCallCount = 0;
    const outInactive1 = InstrumentedBurst({ active: false, text: 'Xuất sắc!' });
    const countInactive1 = hookCallCount;
    assert.equal(outInactive1, null);

    hookCallCount = 0;
    const outActive = InstrumentedBurst({ active: true, text: 'Chuỗi 3x · Xuất sắc!' });
    const countActive = hookCallCount;
    assert.ok(outActive !== null);

    hookCallCount = 0;
    const outInactive2 = InstrumentedBurst({ active: false, text: 'Xuất sắc!' });
    const countInactive2 = hookCallCount;
    assert.equal(outInactive2, null);

    assert.equal(countInactive1, countActive, 'Hook count must remain invariant when active changes false -> true');
    assert.equal(countActive, countInactive2, 'Hook count must remain invariant when active changes true -> false');
    assert.equal(countActive, 2);

    // Also verify SSR static markup renders cleanly
    const { HanabiSparkleBurst } = loadTsxModule('src/components/roleplay/HanabiSparkleBurst.tsx');
    const htmlOff = ReactDOMServer.renderToStaticMarkup(React.createElement(HanabiSparkleBurst, { active: false }));
    assert.equal(htmlOff, '');
    const htmlOn = ReactDOMServer.renderToStaticMarkup(
      React.createElement(HanabiSparkleBurst, { active: true, text: 'Chuỗi 3x · Xuất sắc!' })
    );
    assert.ok(htmlOn.includes('Chuỗi 3x · Xuất sắc!'));
  });

  it('#192: ErrorBoundary renders clean SVG fallback with zero emojis and no 60ms auto-retry masking', () => {
    const ebSource = fs.readFileSync(path.resolve(webRoot, 'src/components/common/ErrorBoundary.tsx'), 'utf8');
    assert.equal(ebSource.includes('setTimeout'), false, 'ErrorBoundary must not mask crashes with 60ms setTimeout retry');
    assert.equal(
      /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(ebSource),
      false,
      'ErrorBoundary must contain zero literal emojis'
    );

    const { ErrorBoundary } = loadTsxModule('src/components/common/ErrorBoundary.tsx');
    const instance = new ErrorBoundary({ fallbackTitle: 'Lỗi kiểm thử', children: null });
    const errorState = ErrorBoundary.getDerivedStateFromError(new Error('Simulated crash'));
    instance.state = { ...instance.state, ...errorState };
    const html = ReactDOMServer.renderToStaticMarkup(instance.render() as React.ReactElement);
    assert.ok(html.includes('Lỗi kiểm thử'));
    assert.ok(html.includes('<svg'));
    assert.equal(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(html), false);
  });

  it('#193: RoleplayConversationStream uses alignFuriganaWithOriginal and strips Kanji injection & XSS', () => {
    const { RoleplayConversationStream } = loadTsxModule('src/components/roleplay/RoleplayConversationStream.tsx');
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(RoleplayConversationStream, {
        messages: [
          {
            id: 1,
            sender: 'User',
            japaneseText: 'きっぷをかいます',
            furiganaHtml: '<ruby>切符<rt>きっぷ</rt></ruby>を<ruby>買<rt>か</rt></ruby>います',
            createdAt: new Date().toISOString(),
          },
          {
            id: 2,
            sender: 'Ai',
            japaneseText: '駅はあちらです。',
            furiganaHtml: '<img src=x onerror=alert(1)><ruby>駅<rt>えき</rt></ruby>はあちらです。<script>alert(1)</script>',
            createdAt: new Date().toISOString(),
          },
        ],
        showFurigana: true,
        showVietnamese: false,
        playingMessageId: null,
        onPlayAudio: () => {},
        selectedMessageId: null,
        onSelectUserMessage: () => {},
      })
    );

    assert.ok(html.includes('きっぷをかいます'));
    assert.equal(html.includes('切符'), false, 'Hiragana user message must not receive Kanji from furiganaHtml');
    assert.ok(html.includes('<ruby>駅<rt>えき</rt></ruby>'));
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('onerror'), false);
  });

  it('#193: RoleplayConversationStream blocks unclosed <img XSS inside ruby rawBase when japaneseText is empty or echoed', () => {
    const { RoleplayConversationStream } = loadTsxModule('src/components/roleplay/RoleplayConversationStream.tsx');
    const xssPayload = '<ruby>駅<img src=x onerror=alert(1) alt="東京<rt>えき</rt></ruby>';
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(RoleplayConversationStream, {
        messages: [
          {
            id: 10,
            sender: 'Ai',
            japaneseText: '',
            furiganaHtml: xssPayload,
            createdAt: new Date().toISOString(),
          },
          {
            id: 11,
            sender: 'Ai',
            japaneseText: '駅<img src=x onerror=alert(1) alt="東京',
            furiganaHtml: xssPayload,
            createdAt: new Date().toISOString(),
          },
        ],
        showFurigana: true,
        showVietnamese: false,
        playingMessageId: null,
        onPlayAudio: () => {},
        selectedMessageId: null,
        onSelectUserMessage: () => {},
      })
    );

    assert.equal(html.includes('<img'), false, 'Stream must never render unescaped <img tag');
    assert.equal(html.includes('onerror='), false, 'Stream must never render onerror handler');
  });

  it('R3: VoiceVoxTestView has zero emojis/50021/Local POC and router gates dev routes under import.meta.env.DEV', () => {
    const voiceVoxSource = fs.readFileSync(path.resolve(webRoot, 'src/views/VoiceVoxTestView.tsx'), 'utf8');
    assert.equal(/Local POC/i.test(voiceVoxSource), false);
    assert.equal(/50021/.test(voiceVoxSource), false);
    assert.equal(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(voiceVoxSource), false);

    const routerSource = fs.readFileSync(path.resolve(webRoot, 'src/router/index.tsx'), 'utf8');
    assert.ok(routerSource.includes('import.meta.env.DEV ? <DevShowcaseView />'));
    assert.ok(routerSource.includes('import.meta.env.DEV ? <VoiceVoxTestView />'));
  });
});
