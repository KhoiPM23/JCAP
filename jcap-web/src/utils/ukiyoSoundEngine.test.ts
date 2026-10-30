import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectScenarioTheme, ukiyoSound } from './ukiyoSoundEngine.ts';

describe('ukiyoSoundEngine', () => {
  describe('detectScenarioTheme', () => {
    it('detects train theme for rail and transit keywords', () => {
      assert.equal(detectScenarioTheme('Mua vé tàu Shinkansen', 'Nhân viên soát vé ga Shinjuku'), 'train');
      assert.equal(detectScenarioTheme('Đi sân bay Narita', 'Tài xế'), 'train');
    });

    it('detects office theme for corporate and interview keywords', () => {
      assert.equal(detectScenarioTheme('Phỏng vấn xin việc baito', 'Người phỏng vấn Yamada'), 'office');
      assert.equal(detectScenarioTheme('Họp công ty', 'Giám đốc'), 'office');
    });

    it('detects konbini theme for convenience store keywords', () => {
      assert.equal(detectScenarioTheme('Mua sắm tại cửa hàng tiện lợi', 'Thu ngân FamilyMart'), 'konbini');
      assert.equal(detectScenarioTheme('Tính tiền tại Konbini Lawson', 'Nhân viên'), 'konbini');
    });

    it('detects zen theme for ryokan, tea ceremony and traditional spots', () => {
      assert.equal(detectScenarioTheme('Trải nghiệm trà đạo truyền thống', 'Thầy dạy trà'), 'zen');
      assert.equal(detectScenarioTheme('Nghỉ dưỡng tại Ryokan Onsen', 'Tiếp tân'), 'zen');
    });

    it('detects cafe theme for coffee and drinks', () => {
      assert.equal(detectScenarioTheme('Gọi đồ uống tại cafe', 'Barista'), 'cafe');
    });

    it('defaults to ramen theme for culinary or unspecified keywords', () => {
      assert.equal(detectScenarioTheme('Gọi mì Ramen Tonkotsu', 'Chủ quán Ryusei'), 'ramen');
      assert.equal(detectScenarioTheme('', ''), 'ramen');
      assert.equal(detectScenarioTheme(undefined, undefined), 'ramen');
    });
  });

  describe('mute state management', () => {
    it('properly toggles muted state', () => {
      ukiyoSound.setMuted(true);
      assert.equal(ukiyoSound.getIsMuted(), true);

      ukiyoSound.setMuted(false);
      assert.equal(ukiyoSound.getIsMuted(), false);
    });
  });
});
