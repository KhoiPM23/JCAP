/**
 * Ukiyo Procedural Sound Engine
 * Tự tổng hợp âm thanh bằng Web Audio API thuần (Zero external assets/mp3, latency < 5ms).
 * Âm sắc phong cách truyền thống Nhật Bản: Taiko, Woodblock (Hyoshigi), Hirajoshi Chime, Washi Rustle.
 */

export type AmbientTheme = 'ramen' | 'train' | 'cafe' | 'office' | 'konbini' | 'zen';

export const detectScenarioTheme = (scenarioTitle?: string, aiPersona?: string): AmbientTheme => {
  const text = `${scenarioTitle || ''} ${aiPersona || ''}`.toLowerCase();
  if (/tàu|ga|shinkansen|chuyến đi|sân bay|vé tàu|soát vé/.test(text)) return 'train';
  if (/công ty|phỏng vấn|baito|tuyển dụng|văn phòng|hội nghị|giám đốc|nhân sự/.test(text)) return 'office';
  if (/tiện lợi|konbini|siêu thị|thu ngân|tính tiền|mua sắm|tạp hóa/.test(text)) return 'konbini';
  if (/trà đạo|kimono|ryokan|khách sạn|chùa|đền|truyền thống|onsen/.test(text)) return 'zen';
  if (/cafe|cà phê|nước uống|quán trà|barista/.test(text)) return 'cafe';
  return 'ramen'; // Mặc định quán ăn / ẩm thực Nhật
};

class UkiyoSoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private ambientSource: AudioNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientType: AmbientTheme | null = null;

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Tiếng trống Taiko (Thud): Âm bass trầm, rền, dùng cho Eki-Stamp slam hoặc khi vào phòng luyện.
   */
  public playTaikoThud() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Bass Oscillator (Màng trống)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.35);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);

    // 2. Skin Noise (Tiếng đập mặt da)
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
  }

  /**
   * Tiếng phách gỗ Hyoshigi (Woodblock Snap): Đanh gọn, dùng khi chuyển lượt hoặc ghi âm xong.
   */
  public playWoodblockSnap() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(620, now + 0.04);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now);
    osc2.frequency.exponentialRampToValueAtTime(940, now + 0.035);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.05);
    osc2.stop(now + 0.05);
  }

  /**
   * Chuỗi chuông ngũ cung Hirajoshi (Migoto Chime): Cung điệu truyền thống Nhật Bản (C, Db, F, G, Ab).
   * Dùng khi hoàn thành nhiệm vụ (Mission Complete) hoặc kết thúc hội thoại thành công.
   */
  public playMigotoChime() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    // Hirajoshi Pentatonic Frequencies (Hz)
    const notes = [523.25, 554.37, 698.46, 783.99, 830.61, 1046.50];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.18, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.7);
    });
  }

  /**
   * Tiếng giấy Washi sột soạt nhẹ: Dùng khi mở bảng gợi ý hoặc lật trang.
   */
  public playPaperRustle() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(1.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
  }

  /**
   * Tiếng gõ nhẹ (Subtle Tap): Dùng khi ấn nút hoặc chọn gợi ý.
   */
  public playSubtleTap() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1050, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.02);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.025);
  }

  /**
   * Bật âm thanh môi trường thủ công cho mọi bối cảnh hội thoại (Ramen, tàu điện, văn phòng phỏng vấn, konbini, cafe, thiền zen)
   * Tạo bằng Pink-Noise Filtered Synthesis siêu nhẹ, 0 byte file tải ngoài, latency < 5ms.
   */
  public startAmbientSound(theme: AmbientTheme = 'ramen') {
    if (this.isMuted) return;
    this.stopAmbientSound();
    const ctx = this.initContext();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(theme === 'office' ? 0.018 : 0.03, ctx.currentTime + 1.5);

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2) * 0.12;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    // Điều chỉnh tần số cắt filter theo bối cảnh
    let cutoffFreq = 340;
    switch (theme) {
      case 'train':
        cutoffFreq = 160; // Tiếng rầm rì trầm sâu của đường ray
        break;
      case 'office':
        cutoffFreq = 220; // Tiếng điều hòa và không gian phòng họp tĩnh lặng
        break;
      case 'konbini':
        cutoffFreq = 380; // Tiếng quạt mát tủ lạnh cửa hàng tiện lợi
        break;
      case 'zen':
        cutoffFreq = 260; // Tiếng gió mát và nước róc rách thanh tịnh
        break;
      case 'cafe':
        cutoffFreq = 420; // Tiếng máy pha cafe và không gian quán ấm áp
        break;
      case 'ramen':
      default:
        cutoffFreq = 340; // Tiếng nồi súp hầm ramen sôi sùng sục
        break;
    }
    filter.frequency.setValueAtTime(cutoffFreq, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();

    // Điểm xuyết âm thanh biểu tượng đặc thù:
    // Nếu là Konbini: điểm chuông cửa 2-tone kinh điển của cửa hàng tiện lợi Nhật Bản
    if (theme === 'konbini') {
      const chimeNow = ctx.currentTime + 0.3;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const cGain = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(740, chimeNow); // F#5
      osc1.frequency.setValueAtTime(587.33, chimeNow + 0.22); // D5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1480, chimeNow);
      osc2.frequency.setValueAtTime(1174.66, chimeNow + 0.22);

      cGain.gain.setValueAtTime(0.08, chimeNow);
      cGain.gain.exponentialRampToValueAtTime(0.001, chimeNow + 0.7);

      osc1.connect(cGain);
      osc2.connect(cGain);
      cGain.connect(ctx.destination);

      osc1.start(chimeNow);
      osc2.start(chimeNow);
      osc1.stop(chimeNow + 0.7);
      osc2.stop(chimeNow + 0.7);
    }

    this.ambientSource = noise;
    this.ambientGain = gain;
    this.ambientType = theme;
  }

  /**
   * Dừng âm thanh môi trường
   */
  public stopAmbientSound() {
    if (this.ambientGain && this.ctx) {
      try {
        this.ambientGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.4);
      } catch {
        // ignore
      }
    }
    setTimeout(() => {
      if (this.ambientSource && 'stop' in this.ambientSource) {
        try {
          (this.ambientSource as AudioScheduledSourceNode).stop();
        } catch {
          // ignore
        }
      }
      this.ambientSource = null;
      this.ambientGain = null;
      this.ambientType = null;
    }, 500);
  }

  public isAmbientPlaying(): boolean {
    return this.ambientSource !== null;
  }
}

export const ukiyoSound = new UkiyoSoundEngine();
