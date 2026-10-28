/**
 * Tuỳ chọn hiển thị khi luyện (trang Cài đặt > Khi luyện tập), lưu ở trình duyệt.
 * Phòng Shadowing và phòng Hội thoại AI lấy làm giá trị mặc định; trong phòng vẫn bật/tắt tạm thời được.
 */
export interface PracticePrefs {
  /** Hiện furigana trên chữ Hán */
  furigana: boolean;
  /** Tự hiện nghĩa tiếng Việt dưới câu của AI và câu mẫu (mặc định tắt: bấm "Dịch" ở từng câu mới hiện) */
  translation: boolean;
  /** AI đọc to câu trả lời ngay khi hiện ra */
  autoPlay: boolean;
}

// v2: bản đầu lưu cả giá trị mặc định cũ (translation: true), nên đổi khoá để mặc định mới (ẩn bản dịch) có hiệu lực với mọi người
const KEY = 'jcap.practicePrefs.v2';
export const DEFAULT_PRACTICE_PREFS: PracticePrefs = { furigana: true, translation: false, autoPlay: false };

export function getPracticePrefs(): PracticePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRACTICE_PREFS;
    return { ...DEFAULT_PRACTICE_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PRACTICE_PREFS;
  }
}

export function setPracticePref<K extends keyof PracticePrefs>(key: K, value: PracticePrefs[K]): PracticePrefs {
  const next = { ...getPracticePrefs(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* không lưu được thì vẫn dùng trong phiên */
  }
  return next;
}
