/**
 * Trạng thái từng câu khi luyện Shadowing (Milestone 1).
 *
 * - Lưu ở server (suy ra từ các lần chấm đã lưu): NOT_STARTED, EVALUATED, EVALUATION_FAILED.
 * - Chỉ ở client: RECORDING, RECORDED (đã thu, chưa gửi), EVALUATING (đang chờ kết quả).
 * Tải lại trang / mở máy khác thì trạng thái chỉ-client mất và câu trở về trạng thái server, nên không câu nào bị kẹt.
 */
export type ServerSentenceState = 'NOT_STARTED' | 'EVALUATED' | 'EVALUATION_FAILED';
export type SentencePracticeState = ServerSentenceState | 'RECORDING' | 'RECORDED' | 'EVALUATING';

export interface SentenceStateEntry {
  state: SentencePracticeState;
  /** Trạng thái đã có ở server; quay về đây khi hủy bản thu/bỏ bản ghi chưa gửi. */
  persisted: ServerSentenceState;
}

export type SentenceEvent =
  | { type: 'START_RECORDING' }
  /** Dừng ghi: có âm thanh thì sang RECORDED, không thì về trạng thái server. */
  | { type: 'STOP_RECORDING'; hasAudio: boolean }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT' }
  /** Server trả kết quả và ĐÃ LƯU lần chấm: có điểm hay chưa chấm được. */
  | { type: 'RESULT'; scored: boolean }
  /** Lỗi mạng/quá hạn: KHÔNG biết server đã lưu chưa; giữ bản ghi để gửi lại. */
  | { type: 'REQUEST_FAILED' };

export const initialEntry = (persisted: ServerSentenceState = 'NOT_STARTED'): SentenceStateEntry => ({ state: persisted, persisted });

/** Chuyển trạng thái; sự kiện không hợp lệ ở trạng thái hiện tại thì giữ nguyên. */
export function nextSentenceState(entry: SentenceStateEntry, event: SentenceEvent): SentenceStateEntry {
  const { state, persisted } = entry;
  switch (event.type) {
    case 'START_RECORDING':
      // Thu lại khi đang có bản ghi chưa gửi: bản cũ bị bỏ
      return state === 'EVALUATING' ? entry : { state: 'RECORDING', persisted };
    case 'STOP_RECORDING':
      if (state !== 'RECORDING') return entry;
      return event.hasAudio ? { state: 'RECORDED', persisted } : { state: persisted, persisted };
    case 'CANCEL':
      return state === 'RECORDING' || state === 'RECORDED' ? { state: persisted, persisted } : entry;
    case 'SUBMIT':
      return state === 'RECORDED' ? { state: 'EVALUATING', persisted } : entry;
    case 'RESULT': {
      if (state !== 'EVALUATING') return entry;
      // Đã chấm được một lần thì câu vẫn là EVALUATED dù lần sau chưa chấm được (giống cách server suy ra).
      const next: ServerSentenceState = event.scored || persisted === 'EVALUATED' ? 'EVALUATED' : 'EVALUATION_FAILED';
      return { state: next, persisted: next };
    }
    case 'REQUEST_FAILED':
      // Giữ bản ghi trong bộ nhớ (RECORDED) để "Gửi lại" với cùng mã lần gửi.
      return state === 'EVALUATING' ? { state: 'RECORDED', persisted } : entry;
    default:
      return entry;
  }
}

const CLIENT_ONLY: ReadonlyArray<SentencePracticeState> = ['RECORDING', 'RECORDED', 'EVALUATING'];

/**
 * Gộp trạng thái server mới về (vd. phản hồi cập nhật vị trí đến muộn) mà KHÔNG làm mất trạng thái chỉ-client của câu
 * đang thu/đang chấm; phần đã lưu (persisted) luôn lấy theo server.
 */
export function mergeServerStates(
  current: ReadonlyMap<number, SentenceStateEntry>,
  sentences: ReadonlyArray<{ sentenceId: number; state: ServerSentenceState }>,
): Map<number, SentenceStateEntry> {
  const next = new Map<number, SentenceStateEntry>();
  for (const s of sentences) {
    const mine = current.get(s.sentenceId);
    next.set(s.sentenceId, mine && CLIENT_ONLY.includes(mine.state) ? { state: mine.state, persisted: s.state } : initialEntry(s.state));
  }
  return next;
}

/** Trạng thái ban đầu của các câu từ phiên server. */
export function entriesFromServer(
  sentences: ReadonlyArray<{ sentenceId: number; state: ServerSentenceState }>,
): Map<number, SentenceStateEntry> {
  return new Map(sentences.map((s) => [s.sentenceId, initialEntry(s.state)]));
}
