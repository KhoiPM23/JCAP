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
  private lastSoundAt: Map<string, number> = new Map();
  private lastFeedbackAt: number = 0;

  private getNowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * Anti-duplicate cooldown gate: ngăn phát lặp 2 lần cùng một âm thanh hoặc đè chồng âm phản hồi liên tiếp.
   */
  public canPlay(key: string, cooldownMs: number = 320, isFeedbackChannel: boolean = false, allowOverrideNonMigoto: boolean = false): boolean {
    if (this.isMuted) return false;
    const now = this.getNowMs();

    const prevKeyAt = this.lastSoundAt.get(key);
    if (prevKeyAt !== undefined && now - prevKeyAt < cooldownMs) {
      return false;
    }

    if (isFeedbackChannel) {
      const minGap = allowOverrideNonMigoto ? 120 : 450;
      if (this.lastFeedbackAt > 0 && now - this.lastFeedbackAt < minGap) {
        return false;
      }
      this.lastFeedbackAt = now;
    }

    this.lastSoundAt.set(key, now);
    return true;
  }

  public resetCooldowns() {
    this.lastSoundAt.clear();
    this.lastFeedbackAt = 0;
  }

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
   * Tiếng trống Taiko dịu nhẹ (Thud): Âm bass trầm nhẹ, dùng khi mở phòng luyện / khai cuộc.
   */
  public playTaikoThud() {
    if (!this.canPlay('taiko', 400, false)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Bass Oscillator (Màng trống nhẹ nhàng)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.32);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);

    // 2. Skin Noise (Tiếng chạm da nhẹ)
    const bufferSize = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.07, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.005, now + 0.04);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
  }

  /**
   * Tiếng phách gỗ Hyoshigi (Woodblock Snap) nhẹ nhàng.
   */
  public playWoodblockSnap() {
    if (!this.canPlay('woodblock', 260, false)) return;
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

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.05);
    osc2.stop(now + 0.05);
  }

  /**
   * Âm phản xạ đệm tức thì Aizuchi (Harmonic conversational acknowledgment cue).
   */
  public playAizuchi() {
    if (!this.canPlay('aizuchi', 350, false)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.exponentialRampToValueAtTime(554.37, now + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(330, now);
    osc2.frequency.exponentialRampToValueAtTime(440, now + 0.12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.36);
    osc2.stop(now + 0.36);
  }

  /**
   * Âm phản hồi TÍCH CỰC (Success Chime): 2 nốt thanh thoát, dịu nhẹ cho lượt nói tốt hoặc đạt chuẩn.
   */
  public playSuccessChime() {
    if (!this.canPlay('feedback_success', 450, true)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const notes = [523.25, 783.99];
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.07, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.3);
    });
  }

  /**
   * Âm phản hồi LƯU Ý NHẸ (Warning Tone): 1 nốt mềm trầm ấm báo sắc thái/chưa đạt nhẹ (không gắt).
   */
  public playWarningTone() {
    if (!this.canPlay('feedback_warning', 450, true)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(392, now + 0.16);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.065, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * Âm phản hồi LỖI CẦN SỬA (Error Tone): 2 nốt trầm ngắn (300Hz -> 220Hz), rõ ràng mà êm tai.
   */
  public playErrorTone() {
    if (!this.canPlay('feedback_error', 450, true)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const notes = [300, 220];
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.095;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.075, noteTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.16);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.18);
    });
  }

  /**
   * Chuỗi chuông ngũ cung nhẹ nhàng (Migoto Chime): Chỉ dùng khi hoàn thành nhiệm vụ.
   * Cooldown 800ms tránh lặp 2 lần liên tiếp.
   */
  public playMigotoChime() {
    if (!this.canPlay('migoto', 800, true, true)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.07, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.45);
    });
  }

  /**
   * Tiếng đồng xu vàng nhẹ nhàng (Coin Jingle).
   */
  public playCoinJingle() {
    if (!this.canPlay('coin', 400, false)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const coinTones = [
      { freq: 987.77, time: now, vol: 0.065 },
      { freq: 1318.51, time: now + 0.075, vol: 0.085 },
      { freq: 2637.02, time: now + 0.075, vol: 0.03 },
    ];

    coinTones.forEach(({ freq, time, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(vol, time + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.45);
    });
  }

  /**
   * Tiếng giấy Washi sột soạt nhẹ: Dùng khi mở bảng gợi ý hoặc lật thẻ.
   */
  public playPaperRustle() {
    if (!this.canPlay('paper', 300, false)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
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
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
  }

  /**
   * Tiếng gõ nhẹ (Subtle Tap) rất nhỏ.
   */
  public playSubtleTap() {
    if (!this.canPlay('tap', 180, false)) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1050, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.02);

    gain.gain.setValueAtTime(0.04, now);
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
