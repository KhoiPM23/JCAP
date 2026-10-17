/**
 * Gom transcript từ Web Speech API qua nhiều phiên nhận dạng (tự khởi động lại khi `onend`).
 *
 * Quy tắc:
 *  - Mỗi lần `recognition.start()` là một PHIÊN riêng; `event.results` của phiên mới bắt đầu lại từ 0.
 *    Các đoạn ĐÃ CHỐT (isFinal) của phiên cũ được giữ lại (commit) khi phiên đó kết thúc.
 *  - Kết quả interim chỉ phục vụ hiển thị trực tiếp; KHÔNG BAO GIỜ nằm trong `finalTranscript`.
 *  - Mỗi lần nhận kết quả thay thế nguyên snapshot của phiên (không nối thêm) nên sự kiện lặp/chồng không nhân đôi chữ.
 *  - Mỗi phiên chỉ được commit một lần; sự kiện của phiên cũ đến muộn bị bỏ qua.
 *  - Sau `lock()` mọi sự kiện đến muộn bị bỏ qua, kết quả đã chốt không bị ghi đè.
 */

export interface SpeechSegmentLike {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}

export type ClientRecognitionStatus = 'final' | 'empty' | 'unsupported' | 'error';

export interface ClientRecognitionSnapshot {
  status: ClientRecognitionStatus;
  /** Chỉ chứa phần đã chốt. Rỗng nếu status khác 'final'. */
  transcript: string;
  /** Mã lỗi Web Speech (no-speech, network, not-allowed...) nếu có. */
  error?: string;
}

/** Lỗi mà việc tự khởi động lại phiên nhận dạng sẽ không giúp ích. */
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);

export class SpeechTranscriptCollector {
  private committed: string[] = [];
  private committedSessions = new Set<number>();
  private sessionSegments: { text: string; isFinal: boolean }[] = [];
  private currentSessionId = 0;
  private sessionActive = false;
  private unsupported = false;
  private stopRequestedFlag = false;
  private locked = false;
  private firstError: string | undefined;
  private waiters: Array<() => void> = [];

  get isLocked(): boolean {
    return this.locked;
  }

  get stopRequested(): boolean {
    return this.stopRequestedFlag;
  }

  /** Có đang có phiên nhận dạng chạy không. */
  get hasActiveSession(): boolean {
    return this.sessionActive;
  }

  /** Lỗi nghiêm trọng đã gặp: tự khởi động lại sẽ vô ích. */
  get hasFatalError(): boolean {
    return this.firstError !== undefined && FATAL_ERRORS.has(this.firstError);
  }

  /** Bắt đầu phiên mới, trả về id để gắn vào các sự kiện của phiên đó. */
  startSession(): number {
    if (this.sessionActive) this.commitCurrentSession();
    this.currentSessionId += 1;
    this.sessionSegments = [];
    this.sessionActive = true;
    return this.currentSessionId;
  }

  handleResult(sessionId: number, results: ArrayLike<SpeechSegmentLike>): void {
    if (this.locked || sessionId !== this.currentSessionId || !this.sessionActive) return;

    const snapshot: { text: string; isFinal: boolean }[] = [];
    for (let i = 0; i < results.length; i++) {
      const segment = results[i];
      const text = segment?.[0]?.transcript ?? '';
      if (text) snapshot.push({ text, isFinal: !!segment.isFinal });
    }
    this.sessionSegments = snapshot;
  }

  handleError(sessionId: number, code: string): void {
    if (this.locked || sessionId > this.currentSessionId) return;
    // 'no-speech' và 'aborted' là bình thường khi người học im lặng/dừng: không coi là lỗi.
    if (code === 'no-speech' || code === 'aborted') return;
    if (this.firstError === undefined) this.firstError = code;
  }

  endSession(sessionId: number): void {
    if (sessionId !== this.currentSessionId) return;
    this.commitCurrentSession();
    this.sessionActive = false;
    this.resolveWaiters();
  }

  markUnsupported(): void {
    this.unsupported = true;
    this.resolveWaiters();
  }

  requestStop(): void {
    this.stopRequestedFlag = true;
  }

  /**
   * Chờ phiên nhận dạng kết thúc (sự kiện `onend` sau `stop()`), tối đa `timeoutMs`.
   * Dựa trên sự kiện thay vì độ trễ cố định; timeout chỉ là chặn trên để không treo giao diện.
   */
  whenSettled(timeoutMs: number): Promise<'settled' | 'timeout'> {
    if (!this.sessionActive || this.unsupported) return Promise.resolve('settled');

    return new Promise((resolve) => {
      let done = false;
      const finish = (value: 'settled' | 'timeout') => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish('timeout'), timeoutMs);
      this.waiters.push(() => finish('settled'));
    });
  }

  /** Chốt kết quả: từ đây các sự kiện đến muộn không còn ảnh hưởng. */
  lock(): void {
    if (this.sessionActive) this.commitCurrentSession();
    this.locked = true;
    this.resolveWaiters();
  }

  reset(): void {
    this.committed = [];
    this.committedSessions = new Set();
    this.sessionSegments = [];
    this.currentSessionId += 1; // vô hiệu hóa mọi sự kiện của phiên trước
    this.sessionActive = false;
    this.unsupported = false;
    this.stopRequestedFlag = false;
    this.locked = false;
    this.firstError = undefined;
    this.waiters = [];
  }

  /** Transcript đã chốt (không có interim). */
  get finalTranscript(): string {
    const currentFinals = this.sessionActive
      ? this.sessionSegments.filter((s) => s.isFinal).map((s) => s.text)
      : [];
    return [...this.committed, ...currentFinals].join('').trim();
  }

  snapshot(): ClientRecognitionSnapshot {
    const transcript = this.finalTranscript;
    if (transcript) return { status: 'final', transcript, error: this.firstError };
    if (this.unsupported) return { status: 'unsupported', transcript: '' };
    if (this.firstError) return { status: 'error', transcript: '', error: this.firstError };
    return { status: 'empty', transcript: '' };
  }

  private commitCurrentSession(): void {
    if (this.committedSessions.has(this.currentSessionId)) return;
    this.committedSessions.add(this.currentSessionId);
    const finals = this.sessionSegments.filter((s) => s.isFinal).map((s) => s.text).join('');
    if (finals) this.committed.push(finals);
    this.sessionSegments = [];
  }

  private resolveWaiters(): void {
    const pending = this.waiters;
    this.waiters = [];
    pending.forEach((fn) => fn());
  }
}
