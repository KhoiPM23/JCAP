import { useEffect, useState } from 'react';

/**
 * Đọc tiếng Nhật bằng giọng có sẵn của trình duyệt (speechSynthesis, ja-JP).
 * TODO: dự án đã có VoiceVox (TtsController) cho giọng tự nhiên hơn, có thể đổi sang đó sau.
 */
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speakJa(kana: string) {
  if (!supported || !kana) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(kana);
  u.lang = 'ja-JP';
  u.rate = 0.85;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja'));
  if (voice) u.voice = voice;
  synth.speak(u);
}

/**
 * Có giọng đọc tiếng Nhật không? Danh sách giọng tải bất đồng bộ nên ban đầu coi là "có" (chưa biết),
 * chỉ ẩn nút nghe khi trình duyệt đã báo danh sách mà không có giọng Nhật nào.
 */
export function useCanSpeakJa(): boolean {
  const [ok, setOk] = useState(supported);
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const check = () => {
      const voices = synth.getVoices();
      if (voices.length) setOk(voices.some((v) => v.lang.toLowerCase().startsWith('ja')));
    };
    check();
    synth.addEventListener('voiceschanged', check);
    return () => synth.removeEventListener('voiceschanged', check);
  }, []);
  return ok;
}
