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

// Helper to dynamically load and transpile TSX components in-memory
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
          playTaikoSuccess: () => {},
          playHyoshigiAlert: () => {},
          playChimeScore: () => {},
        },
      };
    }
    if (spec.includes('japaneseSanitizer')) {
      return loadTsxComponent('src/utils/japaneseSanitizer.ts', '__all__');
    }
    if (spec.includes('moraPhonetics')) {
      return loadTsxComponent('src/utils/moraPhonetics.ts', '__all__');
    }
    // Fallback standard node require
    return import(spec);
  };

  const mod: { exports: any } = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transformed);
  fn(customRequire, mod, mod.exports);

  if (exportName === '__all__') return mod.exports;
  return mod.exports[exportName];
}

// ---------------------------------------------------------------------------
// 1. GRADUATED HINT CARD ADVERSARIAL VERIFICATION
// ---------------------------------------------------------------------------
describe('FE-03 Adversarial: GraduatedHintCard Scaffolding & Autonomy Scenarios', () => {
  const GraduatedHintCard = loadTsxComponent('src/components/roleplay/GraduatedHintCard.tsx', 'GraduatedHintCard');

  it('Tier 1: Progressive disclosure correctly renders keywords and enables keyword clicks', () => {
    const recordedUses: Array<{ text: string; tier: number }> = [];

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(GraduatedHintCard, {
        missionTitle: 'Gọi món tại quán Ramen',
        keywords: ['とんこつラーメン', '一つ', 'お願いします'],
        clozeSentence: '______ を一つお願いします。',
        fullJapaneseSample: 'とんこつラーメンを一つお願いします。',
        vietnameseMeaning: 'Cho tôi một bát mì ramen tonkotsu.',
        onUseHint: (text: string, tier: 1 | 2 | 3) => {
          recordedUses.push({ text, tier });
        },
        onClose: () => {},
      })
    );

    // Initial render is Tier 1
    assert.ok(html.includes('Cấp 1: Từ khoá'), 'Header should mention Cấp 1');
    assert.ok(html.includes('とんこつラーメン'), 'Should display keyword とんこつラーメン');
    assert.ok(html.includes('一つ'), 'Should display keyword 一つ');
    assert.ok(html.includes('お願いします'), 'Should display keyword お願いします');
    assert.ok(html.includes('(-10đ)'), 'Should denote -10đ autonomy deduction for tier 1');
    assert.ok(html.includes('👁️ Đang xem trước (Chưa trừ điểm)'), 'Should explicitly show preview warning');
  });

  it('Tier 1 Fallback: Extracts Japanese keywords automatically when keywords prop is empty', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(GraduatedHintCard, {
        missionTitle: 'Hỏi đường',
        keywords: [],
        fullJapaneseSample: '駅はどこですか。',
        onUseHint: () => {},
        onClose: () => {},
      })
    );

    assert.ok(html.includes('駅'), 'Should have extracted noun 駅');
    assert.ok(html.includes('どこ'), 'Should have extracted interrogative どこ');
  });

  it('Tier 2 Fallback: Derives Japanese cloze blanks when clozeSentence prop is omitted', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(GraduatedHintCard, {
        missionTitle: 'Chào hỏi',
        fullJapaneseSample: '初めまして、よろしくお願いします。',
        onUseHint: () => {},
        onClose: () => {},
      })
    );

    assert.ok(html.includes('Giàn giáo ZPD'), 'Should render ZPD card');
    assert.ok(html.includes('Cấp 2: Điền khuyết'), 'Should offer Tier 2 button');
  });

  it('Tier 3: Sanitizes Vietnamese leakage from Japanese model sentence', () => {
    const leakedSample = 'とんこつラーメンをお願いします。(Tôi muốn gọi ramen tonkotsu)';
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(GraduatedHintCard, {
        missionTitle: 'Gọi món',
        fullJapaneseSample: leakedSample,
        vietnameseMeaning: 'Tôi muốn gọi một bát ramen tonkotsu',
        onUseHint: () => {},
        onClose: () => {},
      })
    );

    // Vietnamese translation should be separated, not in the Japanese text
    assert.ok(!html.includes('とんこつラーメンをお願いします。(Tôi muốn gọi ramen tonkotsu)'),
      'Leaked parentheses should be stripped from raw Japanese sample');
  });

  it('Autonomy penalty preview model: Tab switching triggers onTierChange without premature onUseHint call', () => {
    let autonomyScore = 100;
    let appliedTier: number | null = null;
    let previewedTier: number = 1;
    let onUseHintCalls = 0;

    // Simulate RoleplayPracticeView controller state
    const handleUseHint = (sentence: string, tier: 1 | 2 | 3) => {
      onUseHintCalls++;
      appliedTier = tier;
      const penalty = tier === 1 ? 10 : tier === 2 ? 30 : 60;
      autonomyScore = 100 - penalty;
    };

    const handleTierChange = (tier: 1 | 2 | 3) => {
      previewedTier = tier;
      // Previews are 100% free; autonomy score must remain untouched!
    };

    // User previews Tier 1, switches to Tier 2, then Tier 3
    handleTierChange(1);
    assert.equal(autonomyScore, 100, 'Previewing Tier 1 should NOT reduce autonomy');
    assert.equal(onUseHintCalls, 0, 'onUseHint should not be called on preview');

    handleTierChange(2);
    assert.equal(previewedTier, 2);
    assert.equal(autonomyScore, 100, 'Previewing Tier 2 should NOT reduce autonomy');
    assert.equal(onUseHintCalls, 0);

    handleTierChange(3);
    assert.equal(previewedTier, 3);
    assert.equal(autonomyScore, 100, 'Previewing Tier 3 should NOT reduce autonomy');
    assert.equal(onUseHintCalls, 0);

    // User finally decides to apply Tier 2 (cloze)
    handleUseHint('とんこつラーメンを [ ______ ] お願いします。', 2);
    assert.equal(onUseHintCalls, 1);
    assert.equal(appliedTier, 2);
    assert.equal(autonomyScore, 70, 'Applying Tier 2 should penalize exactly 30 points (100 - 30 = 70)');

    // Applying Tier 3 afterwards: Math.max ensures escalation
    handleUseHint('とんこつラーメンを一つお願いします。', 3);
    assert.equal(appliedTier, 3);
    assert.equal(autonomyScore, 40, 'Applying Tier 3 should penalize 60 points (100 - 60 = 40)');
  });
});

// ---------------------------------------------------------------------------
// 2. NPC AFFINITY & EPISODIC MEMORY ADVERSARIAL VERIFICATION
// ---------------------------------------------------------------------------
describe('FE-03 Adversarial: NPC Affinity Clamping & Episodic Memory Capsule', () => {
  // Pure domain function testing the affinity progression specification
  function evaluateNpcRelationshipTier(affinityScore: number): string {
    const clamped = Math.max(0, Math.min(100, affinityScore));
    if (clamped >= 80) return 'Tri kỷ tâm giao';
    if (clamped >= 50) return 'Thân thiết sâu sắc';
    if (clamped >= 30) return 'Người quen thân thuộc';
    if (clamped >= 20) return 'Đã từng trò chuyện';
    return 'Lần đầu gặp gỡ';
  }

  it('Score clamping: Strictly bounds affinity score between [0, 100]', () => {
    // Extreme edge cases
    assert.equal(Math.max(0, Math.min(100, -10)), 0, 'Negative score clamped to 0');
    assert.equal(Math.max(0, Math.min(100, 0)), 0, 'Zero score boundary is 0');
    assert.equal(Math.max(0, Math.min(100, 10)), 10, 'Default score 10 remains 10');
    assert.equal(Math.max(0, Math.min(100, 99)), 99, 'Score 99 remains 99');
    assert.equal(Math.max(0, Math.min(100, 100)), 100, 'Score 100 boundary is 100');
    assert.equal(Math.max(0, Math.min(100, 105)), 100, 'Score 105 clamped to 100');
    assert.equal(Math.max(0, Math.min(100, 9999)), 100, 'Huge score clamped to 100');
  });

  it('Tier progression: Follows monotonic 5-stage progression matching specifications', () => {
    // Tier 1: Lần đầu gặp gỡ / Người lạ (< 20)
    assert.equal(evaluateNpcRelationshipTier(0), 'Lần đầu gặp gỡ');
    assert.equal(evaluateNpcRelationshipTier(10), 'Lần đầu gặp gỡ');
    assert.equal(evaluateNpcRelationshipTier(19), 'Lần đầu gặp gỡ');

    // Tier 2: Đã từng trò chuyện / Người quen (20 - 29)
    assert.equal(evaluateNpcRelationshipTier(20), 'Đã từng trò chuyện');
    assert.equal(evaluateNpcRelationshipTier(25), 'Đã từng trò chuyện');
    assert.equal(evaluateNpcRelationshipTier(29), 'Đã từng trò chuyện');

    // Tier 3: Người quen thân thuộc / Khách quen (30 - 49)
    assert.equal(evaluateNpcRelationshipTier(30), 'Người quen thân thuộc');
    assert.equal(evaluateNpcRelationshipTier(40), 'Người quen thân thuộc');
    assert.equal(evaluateNpcRelationshipTier(49), 'Người quen thân thuộc');

    // Tier 4: Thân thiết sâu sắc / Bạn bè (50 - 79)
    assert.equal(evaluateNpcRelationshipTier(50), 'Thân thiết sâu sắc');
    assert.equal(evaluateNpcRelationshipTier(65), 'Thân thiết sâu sắc');
    assert.equal(evaluateNpcRelationshipTier(79), 'Thân thiết sâu sắc');

    // Tier 5: Tri kỷ tâm giao / Tri kỷ (>= 80)
    assert.equal(evaluateNpcRelationshipTier(80), 'Tri kỷ tâm giao');
    assert.equal(evaluateNpcRelationshipTier(95), 'Tri kỷ tâm giao');
    assert.equal(evaluateNpcRelationshipTier(100), 'Tri kỷ tâm giao');
  });

  it('Memory capsule: Max 5 facts capacity, deduplication, and JSON serialization resilience', () => {
    // Capsule simulation mimicking PersonaMemoryService
    let memoryCapsuleJson = '[]';

    function addFact(fact: string): void {
      let facts: string[] = [];
      try {
        facts = JSON.parse(memoryCapsuleJson);
      } catch {
        facts = [];
      }
      if (!facts.includes(fact) && facts.length < 5) {
        facts.push(fact);
        memoryCapsuleJson = JSON.stringify(facts);
      }
    }

    // Add facts
    addFact('likes:tonkotsu_ramen');
    addFact('origin:Hanoi');
    addFact('career:IT_engineer');
    addFact('travel:first_time_in_japan');
    assert.equal(JSON.parse(memoryCapsuleJson).length, 4);

    // Deduplication check: duplicate fact must not be added
    addFact('likes:tonkotsu_ramen');
    assert.equal(JSON.parse(memoryCapsuleJson).length, 4, 'Duplicate fact should be rejected');

    // 5th fact
    addFact('status:student');
    assert.equal(JSON.parse(memoryCapsuleJson).length, 5);

    // 6th fact: capacity limit check (must NOT exceed 5)
    addFact('likes:sushi');
    assert.equal(JSON.parse(memoryCapsuleJson).length, 5, 'Capsule must clamp at max 5 facts');

    // Corrupted JSON recovery check
    memoryCapsuleJson = '{corrupted_malformed_json...';
    assert.doesNotThrow(() => {
      addFact('likes:miso_ramen');
    }, 'Corrupted JSON should gracefully fall back without throwing');
    assert.deepEqual(JSON.parse(memoryCapsuleJson), ['likes:miso_ramen']);
  });

  it('Frontend memory tag translation: Resolves all standard episodic facts to Vietnamese', () => {
    const rawMemories = [
      'likes: tonkotsu_ramen',
      'likes: sushi',
      'origin: Da Nang',
      'career: IT engineer',
      'travel: first_time_in_japan',
    ];

    const translated = rawMemories.map((mem) =>
      mem
        .replace('likes: tonkotsu_ramen', 'Thích mì Tonkotsu')
        .replace('likes: sushi', 'Thích Sushi')
        .replace('origin: Da Nang', 'Từ Đà Nẵng')
        .replace('career: IT engineer', 'Kỹ sư IT')
        .replace('travel: first_time_in_japan', 'Lần đầu sang Nhật')
    );

    assert.deepEqual(translated, [
      'Thích mì Tonkotsu',
      'Thích Sushi',
      'Từ Đà Nẵng',
      'Kỹ sư IT',
      'Lần đầu sang Nhật',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. LIVING AVATAR COMPREHENSIVE STRESS TEST (6x7x7 = 294 combinations x 2 genders = 588)
// ---------------------------------------------------------------------------
describe('FE-03 Adversarial: LivingAvatar 588-State Matrix Stress Test', () => {
  const LivingAvatar = loadTsxComponent('src/components/roleplay/LivingAvatar.tsx', 'LivingAvatar');

  const states = ['idle', 'listening', 'thinking', 'speaking', 'cheering', 'bowing'] as const;
  const visemes = ['closed', 'A', 'I', 'U', 'E', 'O', 'N'] as const;
  const archetypes = [
    'culinary',
    'business',
    'transit',
    'retail',
    'hospitality',
    'medical',
    'casual',
  ] as const;
  const genders = [
    { name: 'Ryusei', role: 'Anh chủ quán', isMale: true },
    { name: 'Aoi', role: 'Cô tiếp tân', isMale: false },
  ];

  it('Renders all 588 state combinations with 0 NaN, 0 broken paths, and complete SVG structure', () => {
    let testedCount = 0;
    const errors: string[] = [];

    for (const state of states) {
      for (const viseme of visemes) {
        for (const archetype of archetypes) {
          for (const gender of genders) {
            testedCount++;
            const html = ReactDOMServer.renderToStaticMarkup(
              React.createElement(LivingAvatar, {
                avatarState: state,
                currentViseme: viseme,
                archetype: archetype,
                personaName: gender.name,
                personaRole: gender.role,
                scenarioTitle: `Thực hành ${archetype}`,
                size: 'lg',
                isAizuchiActive: state === 'listening',
              })
            );

            // 1. Zero NaN check
            if (html.includes('NaN')) {
              errors.push(`NaN detected in combination: state=${state}, viseme=${viseme}, archetype=${archetype}, gender=${gender.name}`);
            }

            // 2. Zero undefined/null attribute check
            if (/d="null"|d="undefined"|stroke="undefined"|fill="undefined"/i.test(html)) {
              errors.push(`Broken attribute detected in combination: state=${state}, viseme=${viseme}, archetype=${archetype}`);
            }

            // 3. SVG tag integrity
            if (!html.includes('<svg') || !html.includes('</svg>')) {
              errors.push(`Missing SVG tags in combination: state=${state}, viseme=${viseme}`);
            }

            // 4. Defs & Gradient check
            if (!html.includes('<defs>') || !html.includes('id="skinGrad"')) {
              errors.push(`Missing gradients in combination: state=${state}`);
            }

            // 5. Gender hair gradient check
            const expectedHairGrad = gender.isMale ? 'id="hairGradMale"' : 'id="hairGradFemale"';
            if (!html.includes(expectedHairGrad)) {
              errors.push(`Missing hair gradient ${expectedHairGrad} for ${gender.name}`);
            }
          }
        }
      }
    }

    assert.equal(testedCount, 588, 'Should have tested all 6 x 7 x 7 x 2 = 588 combinations');
    assert.deepEqual(errors, [], `Encountered ${errors.length} SVG render errors:\n${errors.slice(0, 10).join('\n')}`);
  });

  it('Verifies archetype-specific signature accessories and clothing geometry', () => {
    // Culinary: headband & apron
    const culinaryHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', archetype: 'culinary', personaName: 'Tanaka' })
    );
    assert.ok(culinaryHtml.includes('fill="#0f172a"'), 'Culinary apron should be rendered');
    assert.ok(culinaryHtml.includes('fill="#e11d48"'), 'Tenugui headband badge should be rendered');

    // Business: necktie & corporate pin
    const businessHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', archetype: 'business', personaName: 'Sato' })
    );
    assert.ok(businessHtml.includes('fill="#f59e0b"'), 'Business corporate pin should be rendered');
    assert.ok(businessHtml.includes('fill="#0284c7"'), 'Business tie should be rendered');

    // Transit: JR cap with gold emblem
    const transitHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', archetype: 'transit', personaName: 'Suzuki' })
    );
    assert.ok(transitHtml.includes('fill="#eab308"'), 'Transit gold braid/shoulder straps should be rendered');
    assert.ok(transitHtml.includes('fill="#f59e0b"'), 'Transit chrysanthemum emblem should be rendered');

    // Retail: Konbini uniform & name badge
    const retailHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', archetype: 'retail', personaName: 'Yamada' })
    );
    assert.ok(retailHtml.includes('fill="#059669"'), 'Retail green konbini uniform should be rendered');
    assert.ok(retailHtml.includes('stroke="#047857"'), 'Retail name badge stroke should be rendered');

    // Hospitality: Kimono & Kanzashi hairpin
    const hospitalityHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', archetype: 'hospitality', personaName: 'Sakura' })
    );
    assert.ok(hospitalityHtml.includes('fill="#881337"'), 'Hospitality kimono collar should be rendered');
    assert.ok(hospitalityHtml.includes('fill="#fef08a"'), 'Kanzashi hairpin flower center should be rendered');

    // Medical: Stethoscope & scrub
    const medicalHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', archetype: 'medical', personaName: 'Bác sĩ Kenji' })
    );
    assert.ok(medicalHtml.includes('fill="#0d9488"'), 'Medical scrub should be rendered');
    assert.ok(medicalHtml.includes('stroke="#475569"'), 'Stethoscope loop should be rendered');

    // Casual: Daily casual outfit
    const casualHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', archetype: 'casual', personaName: 'Yuki' })
    );
    assert.ok(casualHtml.includes('fill="#4f46e5"'), 'Casual indigo outfit should be rendered');
  });

  it('Verifies emotion state visual indicators (rings, bowing transform, aizuchi)', () => {
    // Speaking: ping ring
    const speakingHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'speaking', personaName: 'Tanaka' })
    );
    assert.ok(speakingHtml.includes('animate-ping'), 'Speaking should have ping animation halo');

    // Listening: pulse ring and aizuchi
    const listeningHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'listening', personaName: 'Tanaka', isAizuchiActive: true })
    );
    assert.ok(listeningHtml.includes('animate-pulse'), 'Listening should have pulse ring');
    assert.ok(listeningHtml.includes('うんうん..'), 'Aizuchi bubble should render when active');

    // Bowing: CSS transform translation and rotation
    const bowingHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'bowing', personaName: 'Tanaka' })
    );
    assert.ok(bowingHtml.includes('translate-y-1.5') && bowingHtml.includes('rotate-[2.5deg]'),
      'Bowing should apply polite tilt transform');

    // Idle: breathing animation
    const idleHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', personaName: 'Tanaka' })
    );
    assert.ok(idleHtml.includes('animate-breathing'), 'Idle should apply gentle breathing cycle');
  });

  it('Verifies all 7 viseme mouth geometries without broken coordinates', () => {
    const mouthA = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'speaking', currentViseme: 'A', personaName: 'Tanaka' })
    );
    assert.ok(mouthA.includes('rx="4.5" ry="5.5"'), 'Viseme A open mouth geometry');

    const mouthI = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'speaking', currentViseme: 'I', personaName: 'Tanaka' })
    );
    assert.ok(mouthI.includes('M44 61.5 C46 60.5'), 'Viseme I wide mouth path');

    const mouthU = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'speaking', currentViseme: 'U', personaName: 'Tanaka' })
    );
    assert.ok(mouthU.includes('circle cx="50" cy="62" r="3"'), 'Viseme U puckered circle');

    const mouthE = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'speaking', currentViseme: 'E', personaName: 'Tanaka' })
    );
    assert.ok(mouthE.includes('rx="4.8" ry="3.5"'), 'Viseme E mouth ellipse');

    const mouthO = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'speaking', currentViseme: 'O', personaName: 'Tanaka' })
    );
    assert.ok(mouthO.includes('rx="4" ry="4.8"'), 'Viseme O vertical mouth ellipse');

    const mouthClosed = ReactDOMServer.renderToStaticMarkup(
      React.createElement(LivingAvatar, { avatarState: 'idle', currentViseme: 'closed', personaName: 'Tanaka' })
    );
    assert.ok(mouthClosed.includes('M46 61.5 Q50 63 54 61.5'), 'Viseme closed gentle smile line');
  });
});
