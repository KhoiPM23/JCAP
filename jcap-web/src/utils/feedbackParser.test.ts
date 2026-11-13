import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeneralFeedbackSections } from './feedbackParser.ts';

describe('parseGeneralFeedbackSections', () => {
  it('separates turns, strengths, and improvements cleanly without cross-bleeding when periods are omitted', () => {
    const sample =
      'Bạn chưa hoàn thành đủ nhiệm vụ (2/3), nên kết quả phiên này là Chưa đạt. ' +
      'Nhận xét theo lượt: Rất tốt • Đã sử dụng chính xác từ vựng về độ cứng của mì và độ đậm của nước dùng; ' +
      'Chưa thành câu hoàn chỉnh • Cần thêm vị ngữ hoặc đuôi câu lịch sự ' +
      'Điểm làm tốt: Quý khách đã sử dụng rất chính xác các từ vựng mục tiêu về độ cứng sợi mì (硬め) và độ đậm đà của nước dùng (濃いめ).; ' +
      "Bạn đã sử dụng rất chính xác từ vựng mục tiêu '味玉' (trứng ngâm tương lòng đào) trong câu yêu cầu topping. " +
      "Điểm cần cải thiện: Quý khách chỉ liệt kê danh từ sẽ nghe cộc lốc. Hãy diễn đạt thành câu như '麺は硬め、味は濃いめでお願いします' để tự nhiên hơn.";

    const parsed = parseGeneralFeedbackSections(sample);

    assert.equal(
      parsed.summary,
      'Bạn chưa hoàn thành đủ nhiệm vụ (2/3), nên kết quả phiên này là Chưa đạt.'
    );
    assert.equal(parsed.turnHighlights.length, 2);
    assert.deepEqual(parsed.turnHighlights[0], {
      badge: 'Rất tốt',
      text: 'Đã sử dụng chính xác từ vựng về độ cứng của mì và độ đậm của nước dùng',
    });
    assert.deepEqual(parsed.turnHighlights[1], {
      badge: 'Chưa thành câu hoàn chỉnh',
      text: 'Cần thêm vị ngữ hoặc đuôi câu lịch sự',
    });

    assert.equal(parsed.strengths.length, 2);
    assert.equal(
      parsed.strengths.some((s) => s.includes('Điểm cần cải thiện')),
      false
    );
    assert.equal(
      parsed.improvements.length,
      2
    );
    assert.equal(
      parsed.improvements[0],
      'Quý khách chỉ liệt kê danh từ sẽ nghe cộc lốc'
    );
  });

  it('extracts native phrasing alternatives and delivery notes cleanly', () => {
    const sample =
      'Hoàn thành tốt các mục tiêu. ' +
      'Độ trôi chảy & Phát âm: Nhịp nói đều, phát âm rõ. ' +
      'Cách diễn đạt tự nhiên hơn: 麺は硬めでお願いします | 味玉を追加できますか';

    const parsed = parseGeneralFeedbackSections(sample);
    assert.equal(parsed.delivery, 'Nhịp nói đều, phát âm rõ.');
    assert.deepEqual(parsed.naturalAlternatives, [
      '麺は硬めでお願いします',
      '味玉を追加できますか',
    ]);
  });
});

