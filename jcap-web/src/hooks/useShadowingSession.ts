import { useEffect, useRef, useState } from 'react';
import { getPracticePrefs } from '../utils/practicePrefs';
import { shadowingService } from '../services/shadowingService';
import { shadowingStorageService } from '../services/shadowingStorageService';
import type { ShadowingDialogueDetail, ShadowingSentenceItem, ShadowingSentencePracticeResult, ShadowingAudioEvaluationResult, ShadowingDiffToken, ShadowingFluencyMetrics } from '../types/shadowing';
import { voicevoxService, type VoiceOption } from '../services/voicevoxService';
import { audioMetricsService, measureRecordedBlob, type AudioQualityMetrics, type AudioGateStatus } from '../services/audioMetricsService';
import { INPUT_DEVICE_STORAGE_KEY, INPUT_LABEL_STORAGE_KEY, OUTPUT_DEVICE_STORAGE_KEY, applyOutputDevice, describeDeviceStatus, describeMicError, filterSelectableDevices, newlyConnected, normalizeDeviceId } from '../utils/audioDevice';
import { PREROLL_MS, WarmMic, isMicPermissionGranted } from '../utils/warmMic';
import { allowedPrerollMs } from '../utils/pcmTakeBuffer';
import { entriesFromServer, initialEntry, mergeServerStates, nextSentenceState, type SentenceEvent, type SentenceStateEntry } from '../utils/sentencePracticeState';
import { serverToLocalProgress, suggestedIndexFromLocal } from '../utils/shadowingProgressSync';
import type { FuriganaSegment, ShadowingEvaluationDimensions, ShadowingServerProgress, ShadowingSessionSummary } from '../types/shadowing';
import { type DevRecordingTake } from '../components/shadowing/RecordingDevTools';
import { useAuth } from '../contexts/AuthContext';
import { SpeechTranscriptCollector } from '../utils/speechTranscriptCollector';
import { pickRecordingMimeType, resolveRecordedMime } from '../utils/recordingMime';
import { isSpeechMicTrackEnabled, startRecognitionOnTrack, type RecognitionMicSource } from '../utils/speechRecognitionStart';
import { blobToAnalysisWav, pcmToAnalysisWav } from '../utils/wavEncoder';
import { makePlaybackBlob } from '../utils/playbackLevel';

// Giới hạn một bản ghi (bằng giới hạn phân tích của backend) và thời gian chờ chấm tối đa trước khi cho "Gửi lại".
const MAX_RECORDING_MS = 30_000;
const EVALUATE_TIMEOUT_MS = 60_000;

const newSubmissionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

// Chặn trên (ms) khi chờ sự kiện kết thúc của MediaRecorder / Web Speech sau khi bấm dừng.
const RECORDER_SETTLE_TIMEOUT_MS = 2000;
// Chờ kết quả cuối của Web Speech có chặn trên để không làm chậm việc chấm: kết quả cuối thường về trong < 0.6 s sau khi dừng;
// quá hạn thì chỉ dùng phần đã chốt (không bao giờ dùng interim).
const SPEECH_SETTLE_TIMEOUT_MS = 600;
const MAX_RECOGNITION_RESTARTS = 5;

const GATE_LABELS: Record<AudioGateStatus, string> = {
  good: 'Tốt',
  acceptable: 'Chấp nhận được',
  needs_retry: 'Cần thu lại',
  unmeasured: 'Chưa đo được',
};

const settleWithin = (promise: Promise<unknown>, ms: number): Promise<void> =>
  Promise.race([
    promise.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);

/** Lượt không chấm được vì lỗi của hệ thống (không phải do bản thu): gửi lại cùng bản thu là đủ. */
export const SYSTEM_BUSY_CODES = ['ASR_BUSY', 'ASR_TIMEOUT', 'SERVER_BUSY', 'ASR_UNAVAILABLE', 'ASR_ERROR', 'RECOGNIZER_UNAVAILABLE', 'ANALYSIS_ERROR'];
export const isSystemBusyCode = (code?: string | null): boolean => !!code && SYSTEM_BUSY_CODES.includes(code);

/** Tên vai hiển thị: bỏ chú thích "(Học viên)" mà dữ liệu bài học gắn sẵn sau tên vai (vd. "Khách hàng (Học viên)" -> "Khách hàng") */
export const displayRoleName = (name: string): string => name.replace(/\s*[(（]\s*học\s*viên\s*[)）]/gi, '').trim();

export type ShadowingPracticeState =
  | 'ready'
  | 'listening'
  | 'recorded'
  | 'analyzing'
  | 'evaluated'
  | 'opponent-speaking'
  | 'completed';

export interface UseShadowingSessionOptions {
  /** Mã bài hội thoại (chuỗi từ URL hoặc số) */
  dialogueId: string | number | undefined;
  /** Vai lúc mở phòng */
  initialRole: 'A' | 'B';
  /** Tiếp tục phiên đang dở (đọc lúc tải bài) */
  resume?: boolean;
  /** Làm lại từ đầu (đọc lúc tải bài) */
  restart?: boolean;
  /** Đã dùng cờ resume/restart: nơi gọi bỏ chúng khỏi URL để tải lại trang không làm lại lần nữa */
  onStartFlagsConsumed?: () => void;
  /** Vừa kết thúc buổi luyện (đang lưu vào lịch sử) */
  onFinish?: () => void;
  /** Vừa đổi vai (hoặc luyện lại cùng vai) */
  onRoleChange?: (role: 'A' | 'B') => void;
}

/**
 * Logic một buổi luyện Shadowing: tải bài và phiên ở server, lượt nhân vật, thu âm, gửi chấm, lưu buổi.
 * Dùng chung cho trang luyện (/shadowing/:id/practice) và khung luyện tại mốc trên bản đồ. Không có giao diện.
 */
export function useShadowingSession(options: UseShadowingSessionOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const id = options.dialogueId == null ? undefined : String(options.dialogueId);

  const { user } = useAuth();

  const [dialogue, setDialogue] = useState<ShadowingDialogueDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Learner Role selection: 'A' or 'B'
  const roleParam = options.initialRole;
  const [userRole, setUserRole] = useState<'A' | 'B'>(roleParam);

  // Practice turn tracking: start at sentence index 0
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentenceResults, setSentenceResults] = useState<Map<number, ShadowingSentencePracticeResult>>(new Map());
  const [practiceStartTime] = useState<number>(Date.now());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState<number>(0);

  // Recording & State
  // recorded: đã thu xong, CHƯA gửi — người học nghe lại, thu lại hoặc gửi chấm
  type PracticeState = ShadowingPracticeState;
  const [practiceState, setPracticeState] = useState<PracticeState>('ready');
  const [currentRecognizedText, setCurrentRecognizedText] = useState<string>('');
  const [currentScore, setCurrentScore] = useState<number>(0);
  // null = chưa đo được (không phải 0)
  const [currentFluencyMetrics, setCurrentFluencyMetrics] = useState<ShadowingFluencyMetrics | null>(null);
  const [currentGateDetail, setCurrentGateDetail] = useState<string>('');
  const [currentDiffTokens, setCurrentDiffTokens] = useState<ShadowingDiffToken[]>([]);
  const [currentEvaluationStatus, setCurrentEvaluationStatus] = useState<'completed' | 'partial' | 'unavailable' | 'failed'>('completed');
  // Nguồn nhận dạng đã dùng cho kết quả hiện tại (backend ghi nhận)
  const [currentRecognitionSource, setCurrentRecognitionSource] = useState<'faster-whisper' | 'phoneme' | 'web_speech' | 'gemini' | null>(null);
  // Trạng thái từng chiều đánh giá của kết quả hiện tại (Shadowing V2) và điểm hiển thị là điểm gì
  const [currentDimensions, setCurrentDimensions] = useState<ShadowingEvaluationDimensions | null>(null);
  const [currentScoreBasis, setCurrentScoreBasis] = useState<'content' | null>(null);
  // Mã lý do khi lượt vừa gửi không chấm được (vd. ASR_BUSY: lỗi của hệ thống, gửi lại được; NO_SPEECH_DETECTED: do bản thu)
  const [currentErrorCode, setCurrentErrorCode] = useState<string | null>(null);
  // Bản thu của lượt vừa "không chấm được" vì hệ thống bận: giữ lại để "Gửi lại" mà không phải thu lại (mã lần gửi mới)
  const resendableTakeRef = useRef<PendingTake | null>(null);
  const [canResendTake, setCanResendTake] = useState<boolean>(false);
  const [sentenceAttemptsMap, setSentenceAttemptsMap] = useState<Map<number, number>>(new Map());
  const latestAttemptIsBestRef = useRef<boolean>(true);
  const [micError, setMicError] = useState<string | null>(null);
  // Thông báo không phải lỗi (vd. đã chuyển sang micro mặc định vì micro đã chọn không còn kết nối)
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [isOpponentPausedForResume, setIsOpponentPausedForResume] = useState<boolean>(false);

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [loadingAudioSentenceId, setLoadingAudioSentenceId] = useState<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // MediaRecorder & Playback for user recordings
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const [recordedAudioUrls, setRecordedAudioUrls] = useState<Map<number, string>>(new Map());
  const [playingUserAudioSentenceId, setPlayingUserAudioSentenceId] = useState<number | null>(null);
  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Web Speech Recognition & Auto-scroll
  const recognitionRef = useRef<any>(null);
  // Track của micro đang thu âm: truyền cho Web Speech để nhận dạng nghe cùng micro với bản ghi chấm điểm.
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  // Micro mở sẵn trong buổi luyện (không mất âm đầu câu khi bấm ghi) + đang mở dở, để không mở hai lần
  const warmMicRef = useRef<WarmMic | null>(null);
  const warmMicOpeningRef = useRef<Promise<WarmMic> | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  // Thời điểm dừng phát âm thanh gần nhất: không lấy tiếng loa vào phần thu trước khi bấm ghi
  const playbackActiveRef = useRef<boolean>(false);
  const playbackEndedAtRef = useRef<number | null>(null);
  // Phiên luyện ở server (nguồn chính thức của tiến độ). null = không đồng bộ được, trang chạy như cũ với localStorage.
  const [serverProgress, setServerProgress] = useState<ShadowingServerProgress | null>(null);
  const serverProgressRef = useRef<ShadowingServerProgress | null>(null);
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null);
  // Trạng thái từng câu của vai người học (server + trạng thái chỉ-client của câu đang thu)
  const [sentenceStates, setSentenceStates] = useState<Map<number, SentenceStateEntry>>(new Map());
  // Bản thu đã dừng nhưng CHƯA gửi chấm (nghe lại / thu lại / gửi). Giữ lại khi gửi lỗi để "Gửi lại" cùng mã lần gửi.
  type PendingTake = {
    sentenceId: number;
    audioBlob: Blob;
    /** Bản để nghe lại: âm lượng đã chuẩn hoá (chỉ phát lại; không gửi chấm). */
    playbackBlob: Blob;
    analysisWav: Blob | null;
    metrics: AudioQualityMetrics;
    recognition: ReturnType<SpeechTranscriptCollector['snapshot']>;
    capture: 'pcm' | 'media-recorder';
    prerollMs: number;
    submissionId: string | null;
  };
  const pendingTakeRef = useRef<PendingTake | null>(null);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const recordingLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chỉ chế độ phát triển: bản ghi gần nhất để tải về đo nhận dạng, và bật/tắt khử nhiễu của trình duyệt
  const [devTake, setDevTake] = useState<DevRecordingTake | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  // Gom transcript đã chốt qua các lần Web Speech tự khởi động lại
  const collectorRef = useRef<SpeechTranscriptCollector>(new SpeechTranscriptCollector());
  const recognitionRestartCountRef = useRef<number>(0);
  const recordedMimeRef = useRef<string>('');
  const recorderStoppedRef = useRef<Promise<void> | null>(null);
  // Tăng mỗi khi hủy/thu lại để bỏ qua kết quả đến muộn
  const evaluationSeqRef = useRef<number>(0);
  const isSubmittingRef = useRef<boolean>(false);
  // Khung hội thoại (chỉ phần này cuộn khi có câu mới)
  const dialogueScrollRef = useRef<HTMLDivElement | null>(null);

  // Lưu buổi luyện vào lịch sử ở backend: idle (chưa lưu / không có câu nào được chấm) | saving | saved | failed
  const [historySaveState, setHistorySaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [historySaveMessage, setHistorySaveMessage] = useState<string>('');
  // Tổng kết do backend tính khi hoàn thành (đúng cả khi tiếp tục phiên từ máy khác) và gợi ý luyện tập
  const [serverSummary, setServerSummary] = useState<ShadowingSessionSummary | null>(null);
  const [serverOverall, setServerOverall] = useState<number | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  // Rỗng = mặc định của hệ thống (người mới chưa chọn gì luôn ở chế độ này; giá trị "default" cũ cũng là mặc định)
  const [selectedAudioInputDeviceId, setSelectedAudioInputDeviceId] = useState<string>(
    normalizeDeviceId(localStorage.getItem(INPUT_DEVICE_STORAGE_KEY))
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string>(
    normalizeDeviceId(localStorage.getItem(OUTPUT_DEVICE_STORAGE_KEY))
  );
  // Không có micro nào: khoá nút ghi âm (vẫn cho nghe mẫu). null = chưa biết (chưa liệt kê được thiết bị)
  const [hasMicrophone, setHasMicrophone] = useState<boolean | null>(null);
  const selectedInputIdRef = useRef(selectedAudioInputDeviceId);
  selectedInputIdRef.current = selectedAudioInputDeviceId;

  // Theo dõi cắm/rút thiết bị: báo tên thiết bị mới, báo micro đã chọn bị rút, khoá ghi âm khi không còn micro.
  // KHÔNG tự đổi lựa chọn của người dùng; khi ghi âm mà micro đã chọn vắng mặt thì tạm dùng micro mặc định.
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) {
      setHasMicrophone(false);
      return;
    }
    let previous: MediaDeviceInfo[] = [];
    let disposed = false;
    const refresh = async () => {
      try {
        const all = filterSelectableDevices(await media.enumerateDevices());
        if (disposed) return;
        const inputs = all.filter((d) => d.kind === 'audioinput');
        setHasMicrophone(inputs.length > 0);

        // Đang tạm dùng micro mặc định vì micro đã chọn vắng mặt: đóng để lượt sau thử lại đúng micro đã chọn
        if (warmMicRef.current?.usedFallback && !isRecordingRef.current) closeWarmMic();

        const added = newlyConnected(previous, all);
        const names = [...new Set(added.map((d) => d.label).filter(Boolean))].join(', ');
        if (names) setMicNotice(`Đã kết nối: ${names}. Mở "Cài đặt âm thanh" nếu muốn dùng thiết bị này.`);

        const selected = selectedInputIdRef.current;
        const canVerify = inputs.some((d) => !!d.deviceId);
        if (selected && canVerify && !inputs.some((d) => d.deviceId === selected)) {
          setMicNotice(
            describeDeviceStatus('audioinput', 'DISCONNECTED', { selected: localStorage.getItem(INPUT_LABEL_STORAGE_KEY) }),
          );
        }
        previous = all;
      } catch {
        // Không liệt kê được: giữ nguyên trạng thái, việc mở micro lúc ghi âm sẽ báo lỗi đúng nguyên nhân
      }
    };
    refresh();
    media.addEventListener?.('devicechange', refresh);
    return () => {
      disposed = true;
      media.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  /** Phát qua loa đã chọn: chờ chuyển xong rồi mới phát; không chuyển được thì báo và phát qua loa mặc định. */
  const routeToSelectedOutput = async (audio: HTMLAudioElement) => {
    const routing = await applyOutputDevice(
      audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> },
      selectedAudioOutputDeviceId
    );
    if (routing === 'failed') {
      setMicNotice('Không phát được qua loa đã chọn (có thể đã ngắt kết nối), đang dùng loa mặc định của hệ thống.');
    }
  };

  // VOICEVOX TTS Integration
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const initialSavedVoiceId = Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3;
  const [selectedVoiceVoxId, setSelectedVoiceVoxId] = useState<number>(initialSavedVoiceId);
  const selectedVoiceVoxIdRef = useRef<number>(initialSavedVoiceId);

  // Nạp danh sách Voice từ Backend (VOICEVOX) khi khởi tạo
  useEffect(() => {
    voicevoxService
      .getVoices()
      .then((list) => {
        setAvailableVoices(list);
        const savedId = Number(localStorage.getItem('jcap_voicevox_selected_id'));
        if (savedId && list.some((v) => v.id === savedId)) {
          setSelectedVoiceVoxId(savedId);
          selectedVoiceVoxIdRef.current = savedId;
        } else if (list.length > 0 && !list.some((v) => v.id === selectedVoiceVoxIdRef.current)) {
          setSelectedVoiceVoxId(list[0].id);
          selectedVoiceVoxIdRef.current = list[0].id;
        }
      })
      .catch(() => {
        // Nếu VOICEVOX offline, hệ thống sẽ tự động fallback sang Web Speech API
      });

    return () => {
      voicevoxService.clearCache();
    };
  }, []);

  // Translations visibility toggles
  const [showTranslations, setShowTranslations] = useState<Record<number, boolean>>({});
  // Mặc định ẩn nghĩa tiếng Việt: bấm "Dịch" ở từng câu mới hiện. Ai bật "Hiện nghĩa tiếng Việt" ở Cài đặt > Khi luyện tập thì hiện sẵn
  const translationDefault = getPracticePrefs().translation;
  // Furigana (Cài đặt > Khi luyện tập > Hiện furigana) lấy từ dữ liệu câu mẫu tính sẵn ở backend; câu chưa có dữ liệu hiện chữ thường
  const showFurigana = getPracticePrefs().furigana;
  const [furiganaMap, setFuriganaMap] = useState<Map<number, FuriganaSegment[]>>(new Map());
  const isTranslationShown = (sentenceId: number) => showTranslations[sentenceId] ?? translationDefault;

  // Synchronization refs to avoid stale closure races and unwanted auto-play
  const userRoleRef = useRef<'A' | 'B'>(userRole);
  const turnIdRef = useRef<number>(0);
  const turnTimeoutRef = useRef<any>(null);
  const isSpeechCancelledRef = useRef<boolean>(false);
  const dialogueRef = useRef<ShadowingDialogueDetail | null>(null);

  // Keep refs in sync
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);

  useEffect(() => {
    dialogueRef.current = dialogue;
  }, [dialogue]);

  const closeWarmMic = () => {
    warmMicRef.current?.close();
    warmMicRef.current = null;
  };

  /**
   * Micro cho lượt ghi: dùng lại micro đang mở nếu đúng thiết bị/cấu hình và còn sống, không thì mở mới.
   * Ném lỗi getUserMedia để nơi bấm ghi báo đúng nguyên nhân.
   */
  const ensureWarmMic = async (deviceId: string): Promise<WarmMic> => {
    const usable = (m: WarmMic | null) => !!m && m.isLive && m.matches(deviceId);
    if (usable(warmMicRef.current)) return warmMicRef.current!;

    if (warmMicOpeningRef.current) {
      try {
        const pending = await warmMicOpeningRef.current;
        if (usable(pending)) return pending;
      } catch {
        // lần mở trước lỗi: thử mở lại bên dưới
      }
    }

    if (warmMicRef.current && isRecordingRef.current && warmMicRef.current.isLive) return warmMicRef.current;
    closeWarmMic();
    const opening = WarmMic.open(deviceId);
    warmMicOpeningRef.current = opening;
    try {
      const mic = await opening;
      if (isUnmountedRef.current) {
        mic.close();
        throw new Error('Đã rời trang luyện');
      }
      if (warmMicRef.current && warmMicRef.current !== mic) warmMicRef.current.close();
      warmMicRef.current = mic;
      return mic;
    } finally {
      if (warmMicOpeningRef.current === opening) warmMicOpeningRef.current = null;
    }
  };

  // ---- Phiên luyện ở server + lớp tương thích localStorage ----

  const learnerIdOf = () => user?.id || user?.email || 'guest_learner';

  /** Server là nguồn chính thức: ghi đè bản localStorage (cho các màn hình còn đọc nó), không có chiều ngược lại. */
  const mirrorToLocal = (progress: ShadowingServerProgress, meta?: ShadowingDialogueDetail | null) => {
    const d = meta ?? dialogueRef.current;
    const local = serverToLocalProgress(progress, learnerIdOf(), {
      subtitle: d?.scenarioTitle,
      scenarioTitle: d?.scenarioTitle,
      textbookTitle: d?.textbookTitle,
      chapterTitle: d?.chapterTitle,
    });
    if (local) shadowingStorageService.saveProgress(local);
  };

  /** replace: tải phiên (mở trang, làm lại, đổi vai). merge: phản hồi cập nhật — giữ trạng thái chỉ-client của câu đang thu. */
  const applyServerProgress = (progress: ShadowingServerProgress, mode: 'replace' | 'merge', meta?: ShadowingDialogueDetail | null) => {
    serverProgressRef.current = progress;
    setServerProgress(progress);
    setSentenceStates((prev) => (mode === 'replace' ? entriesFromServer(progress.sentences) : mergeServerStates(prev, progress.sentences)));
    mirrorToLocal(progress, meta);
  };

  const applySentenceEvent = (sentenceId: number, event: SentenceEvent) =>
    setSentenceStates((prev) => new Map(prev).set(sentenceId, nextSentenceState(prev.get(sentenceId) ?? initialEntry(), event)));

  /** Lưu vị trí câu lên server (không chặn giao diện; lỗi mạng chỉ làm vị trí server cũ hơn, lần sau cập nhật lại). */
  const persistPosition = (index: number) => {
    const progress = serverProgressRef.current;
    if (!progress || progress.status !== 'in_progress') return;
    shadowingService.updateProgress(progress.id, index).then((res) => {
      if (res.success && res.data && serverProgressRef.current?.id === res.data.id) applyServerProgress(res.data, 'merge');
    });
  };

  /** Bỏ bản thu chưa gửi (thu lại, sang câu khác, đổi vai, rời trang). */
  const discardPendingTake = () => {
    pendingTakeRef.current = null;
    setPendingAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSubmitError(null);
  };

  const clearRecordingLimit = () => {
    if (recordingLimitTimerRef.current) {
      clearTimeout(recordingLimitTimerRef.current);
      recordingLimitTimerRef.current = null;
    }
  };

  // Centralized audio & timer stopper
  const stopAllAudio = () => {
    turnIdRef.current += 1;
    isSpeechCancelledRef.current = true;

    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }

    if (userAudioPlayerRef.current) {
      userAudioPlayerRef.current.onended = null;
      userAudioPlayerRef.current.onerror = null;
      userAudioPlayerRef.current.pause();
      userAudioPlayerRef.current.currentTime = 0;
      userAudioPlayerRef.current = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsPlayingAudio(false);
    setPlayingUserAudioSentenceId(null);
  };

  // 1. Fetch dialogue detail from real backend API (strictly dependent on id, NOT userRole)
  useEffect(() => {
    let isCancelled = false;

    const loadDialogue = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      if (!id) {
        setErrorMessage('Thiếu mã bài học Shadowing (ID). Vui lòng chọn một bài học từ Thư viện.');
        setIsLoading(false);
        return;
      }

      try {
        const targetId = parseInt(id, 10);
        if (isNaN(targetId)) {
          setErrorMessage('Mã bài học không hợp lệ.');
          setIsLoading(false);
          return;
        }

        const res = await shadowingService.getDetail(targetId);

        if (isCancelled) return;

        if (res.success && res.data) {
          setDialogue(res.data);
          dialogueRef.current = res.data;

          stopAllAudio();

          let isResume = !!optionsRef.current.resume;
          const isRestart = !!optionsRef.current.restart;
          const learnerId = user?.id || user?.email || 'guest_learner';
          const savedProgress = shadowingStorageService.getProgress(learnerId, targetId);

          let initialIndex = 0;
          let effectiveRole = userRoleRef.current;
          discardPendingTake();

          // 1. Phiên ở server (nguồn chính thức): đã có phiên đang luyện cho bài + vai thì tiếp tục đúng chỗ (kể cả từ máy khác),
          //    chưa có thì tạo mới; ?restart=true thì làm lại. localStorage chỉ gợi ý vị trí khi server chưa từng có phiên.
          const started = await shadowingService.startProgress({
            dialogueId: targetId,
            learnerRole: effectiveRole,
            restart: isRestart,
            suggestedSentenceIndex: isRestart ? undefined : suggestedIndexFromLocal(savedProgress, effectiveRole),
          });
          if (isCancelled) return;

          if (started.success && started.data) {
            const progress = started.data;
            applyServerProgress(progress, 'replace', res.data);
            setProgressSyncError(null);
            initialIndex = Math.min(Math.max(0, progress.currentSentenceIndex), Math.max(0, res.data.sentences.length - 1));
            // Tiếp tục giữa chừng: áp dụng quy tắc "không tự phát câu đối phương" như khi resume
            isResume = !progress.created && initialIndex > 0;
            // Đã làm lại/tiếp tục xong: bỏ tham số khỏi URL để tải lại trang không làm lại phiên lần nữa
            if (isRestart || optionsRef.current.resume) optionsRef.current.onStartFlagsConsumed?.();
          } else {
            // 2. Không đồng bộ được với server: chạy như trước bằng localStorage, báo cho người học biết.
            serverProgressRef.current = null;
            setServerProgress(null);
            setSentenceStates(new Map());
            setProgressSyncError(started.message || 'Chưa đồng bộ được tiến độ với máy chủ; tiến độ chỉ lưu trên trình duyệt này.');
          }

          if (serverProgressRef.current) {
            // Đã có phiên server và đã ghi đè localStorage ở trên
          } else if (isRestart) {
            const firstSentenceText = res.data.sentences[0]?.japaneseText;
            effectiveRole = userRoleRef.current;
            shadowingStorageService.restartProgress(
              learnerId,
              {
                id: res.data.id,
                title: res.data.title,
                subtitle: res.data.scenarioTitle,
                totalSentences: res.data.sentences.length,
                jlptLevel: res.data.jlptLevel,
                scenarioTitle: res.data.scenarioTitle,
                textbookTitle: res.data.textbookTitle,
                chapterTitle: res.data.chapterTitle,
                currentSentenceText: firstSentenceText,
              },
              effectiveRole
            );
            initialIndex = 0;
          } else if (isResume && savedProgress && savedProgress.status === 'IN_PROGRESS') {
            effectiveRole = savedProgress.role || userRoleRef.current;
            userRoleRef.current = effectiveRole;
            setUserRole(effectiveRole);
            initialIndex = Math.min(
              Math.max(0, savedProgress.currentSentenceIndex),
              Math.max(0, res.data.sentences.length - 1)
            );
          } else {
            const firstSentenceText = res.data.sentences[0]?.japaneseText;
            shadowingStorageService.startOrUpdateProgress(
              learnerId,
              {
                id: res.data.id,
                title: res.data.title,
                subtitle: res.data.scenarioTitle,
                totalSentences: res.data.sentences.length,
                jlptLevel: res.data.jlptLevel,
                scenarioTitle: res.data.scenarioTitle,
                textbookTitle: res.data.textbookTitle,
                chapterTitle: res.data.chapterTitle,
                currentSentenceText: firstSentenceText,
              },
              effectiveRole,
              0,
              firstSentenceText
            );
            initialIndex = 0;
          }

          setCurrentSentenceIndex(initialIndex);
          setSentenceResults(new Map());
          setRecordedAudioUrls(new Map());
          setCurrentRecognizedText('');

          // Kiểm tra câu bắt đầu tại initialIndex
          if (res.data.sentences.length > initialIndex) {
            const startSentence = res.data.sentences[initialIndex];
            if (startSentence.speakerRole !== effectiveRole) {
              if (isResume) {
                // Q4 Rule: Resume câu đối phương -> KHÔNG tự động phát ngay, chuyển sang paused state với nút nghe rõ ràng
                setIsOpponentPausedForResume(true);
                setPracticeState('opponent-speaking');
              } else {
                setIsOpponentPausedForResume(false);
                setPracticeState('opponent-speaking');
                const activeTurnId = turnIdRef.current;
                turnTimeoutRef.current = setTimeout(() => {
                  if (turnIdRef.current === activeTurnId) {
                    playOpponentSentence(startSentence, activeTurnId);
                  }
                }, 600);
              }
            } else {
              setIsOpponentPausedForResume(false);
              setPracticeState('ready');
            }
          } else {
            setIsOpponentPausedForResume(false);
            setPracticeState('ready');
          }
        } else {
          setErrorMessage(res.message || `Không tìm thấy bài học Shadowing với Id = ${targetId}.`);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setErrorMessage(err.message || 'Lỗi khi kết nối đến máy chủ.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadDialogue();

    return () => {
      isCancelled = true;
      stopAllAudio();
    };
  }, [id]);

  // Furigana của bài (không chặn việc luyện; lỗi thì hiện chữ thường)
  useEffect(() => {
    const dialogueId = Number(id);
    if (!Number.isInteger(dialogueId)) return;
    let cancelled = false;
    shadowingService.getFurigana(dialogueId).then((map) => {
      if (!cancelled) setFuriganaMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);



  // Update session duration counter
  useEffect(() => {
    if (practiceState === 'completed') return;
    const timer = setInterval(() => {
      setSessionDurationSeconds(Math.floor((Date.now() - practiceStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [practiceStartTime, practiceState]);

  // Stop audio on unmount
  useEffect(() => {
    isUnmountedRef.current = false; // StrictMode gắn lại effect sau lần dọn thử
    return () => {
      isUnmountedRef.current = true;
      closeWarmMic();
      clearRecordingLimit();
      discardPendingTake();
      isRecordingRef.current = false;
      evaluationSeqRef.current += 1;
      collectorRef.current.lock();
      stopAllAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      stopRecordingMedia();
    };
  }, []);

  // Đang phát âm thanh (giọng mẫu, lượt người kia, nghe lại bản ghi): đóng micro mở sẵn để tai nghe Bluetooth
  // không bị chuyển sang chế độ đàm thoại (tiếng giọng mẫu rè) và tiếng loa không lọt vào bản ghi; ghi nhận lúc phát xong.
  const playbackActive = isPlayingAudio || playingUserAudioSentenceId !== null || practiceState === 'opponent-speaking';
  useEffect(() => {
    if (playbackActive) {
      playbackActiveRef.current = true;
      if (!isRecordingRef.current) closeWarmMic();
    } else if (playbackActiveRef.current) {
      playbackActiveRef.current = false;
      playbackEndedAtRef.current = performance.now();
    }
  }, [playbackActive]);

  // Tới lượt người học và không phát gì: mở sẵn micro (chỉ khi đã có quyền, không bật hộp xin quyền tự động).
  // Hết buổi luyện thì đóng.
  const isLearnerTurn = dialogue?.sentences?.[currentSentenceIndex]?.speakerRole === userRole;
  useEffect(() => {
    if (practiceState === 'completed') {
      closeWarmMic();
      return;
    }
    if (!isLearnerTurn || hasMicrophone !== true || playbackActive) return;
    if (practiceState !== 'ready' && practiceState !== 'evaluated' && practiceState !== 'recorded') return;
    let cancelled = false;
    isMicPermissionGranted().then((granted) => {
      if (granted && !cancelled) ensureWarmMic(selectedAudioInputDeviceId).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [isLearnerTurn, hasMicrophone, playbackActive, practiceState, selectedAudioInputDeviceId]);

  // Cuộn khung hội thoại xuống câu mới nhất. KHÔNG dùng scrollIntoView: lệnh đó cuộn cả các khung cha (kể cả khung trang
  // có overflow-hidden) khi nội dung cao hơn màn hình, làm cả trang bị đẩy lên và lộ khoảng trắng phía dưới.
  useEffect(() => {
    const el = dialogueScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [currentSentenceIndex, practiceState]);

  // Tự động tải trước (Pre-fetch ngầm) âm thanh VOICEVOX theo thứ tự ưu tiên:
  // 1. Tải câu hiện tại trước tiên
  // 2. Tuần tự nạp 2 câu tiếp theo
  useEffect(() => {
    const sentences = dialogue?.sentences || [];
    if (!sentences || sentences.length === 0 || availableVoices.length === 0) return;

    let isCancelled = false;

    const prefetchSequence = async () => {
      // Ưu tiên số 1: Tải câu hiện tại
      const current = sentences[currentSentenceIndex];
      if (current?.japaneseText && (!current.nativeAudioUrl || !current.nativeAudioUrl.startsWith('http'))) {
        await voicevoxService.prefetchAudio(current.japaneseText, selectedVoiceVoxId);
      }
      if (isCancelled) return;

      // Ưu tiên số 2: Tuần tự nạp 2 câu tiếp theo
      const nextSentences = sentences.slice(currentSentenceIndex + 1, currentSentenceIndex + 3);
      for (const s of nextSentences) {
        if (isCancelled) return;
        if (s.japaneseText && (!s.nativeAudioUrl || !s.nativeAudioUrl.startsWith('http'))) {
          await voicevoxService.prefetchAudio(s.japaneseText, selectedVoiceVoxId);
        }
      }
    };

    prefetchSequence();

    return () => {
      isCancelled = true;
    };
  }, [currentSentenceIndex, dialogue?.sentences, availableVoices.length, selectedVoiceVoxId]);

  // Web Speech Synthesis for high-fidelity native Japanese audio playback
  const speakJapanese = (
    text: string,
    onEnd?: () => void,
    expectedTurnId?: number
  ) => {
    if ('speechSynthesis' in window) {
      isSpeechCancelledRef.current = false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const jpVoice = voices.find(v => v.lang.includes('ja') || v.lang.includes('JP'));
      if (jpVoice) utterance.voice = jpVoice;

      utterance.onend = () => {
        setIsPlayingAudio(false);
        if (!isSpeechCancelledRef.current && (expectedTurnId === undefined || expectedTurnId === turnIdRef.current)) {
          if (onEnd) onEnd();
        }
      };

      utterance.onerror = (e: any) => {
        setIsPlayingAudio(false);
        // Khi bị hủy bởi cancel(), turn bị drop hoặc đang dở đổi vai, tuyệt đối không trigger callback onEnd!
        if (e.error === 'canceled' || e.error === 'interrupted' || isSpeechCancelledRef.current) {
          return;
        }
        if (expectedTurnId === undefined || expectedTurnId === turnIdRef.current) {
          if (onEnd) onEnd();
        }
      };

      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
      return true;
    }
    if (onEnd && (expectedTurnId === undefined || expectedTurnId === turnIdRef.current)) {
      onEnd();
    }
    return false;
  };

  // Phát audio bằng VOICEVOX TTS, nếu gặp sự cố sẽ tự động fallback sang Web Speech API
  const playVoiceVoxWithFallback = async (
    text: string,
    onEnd?: () => void,
    expectedTurnId?: number,
    sentenceId?: number
  ) => {
    try {
      if (sentenceId !== undefined) {
        setLoadingAudioSentenceId(sentenceId);
      }
      const audioUrl = await voicevoxService.getAudioUrl(text, selectedVoiceVoxIdRef.current);
      if (expectedTurnId !== undefined && expectedTurnId !== turnIdRef.current) return;

      const audio = new Audio(audioUrl);
      await routeToSelectedOutput(audio);
      if (expectedTurnId !== undefined && expectedTurnId !== turnIdRef.current) return;
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);

      audio.onended = () => {
        setIsPlayingAudio(false);
        if (expectedTurnId === undefined || expectedTurnId === turnIdRef.current) {
          if (onEnd) onEnd();
        }
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        speakJapanese(text, onEnd, expectedTurnId);
      };

      await audio.play().catch(() => {
        speakJapanese(text, onEnd, expectedTurnId);
      });
    } catch {
      speakJapanese(text, onEnd, expectedTurnId);
    } finally {
      if (sentenceId !== undefined) {
        setLoadingAudioSentenceId((prev) => (prev === sentenceId ? null : prev));
      }
    }
  };

  // Play audio sample: prefers real audio URL, falls back smoothly to VOICEVOX TTS (then Web Speech API)
  const playAudio = (
    url?: string,
    text?: string,
    onEnd?: () => void,
    expectedTurnId?: number,
    sentenceId?: number
  ) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if ('speechSynthesis' in window) {
      isSpeechCancelledRef.current = true;
      window.speechSynthesis.cancel();
    }

    if (url && url.startsWith('http')) {
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);

      audio.onended = () => {
        setIsPlayingAudio(false);
        if (expectedTurnId === undefined || expectedTurnId === turnIdRef.current) {
          if (onEnd) onEnd();
        }
      };

      audio.onerror = () => {
        if (expectedTurnId !== undefined && expectedTurnId !== turnIdRef.current) return;
        if (text) {
          playVoiceVoxWithFallback(text, onEnd, expectedTurnId, sentenceId);
        } else {
          setIsPlayingAudio(false);
          if (onEnd) onEnd();
        }
      };

      // Chờ chuyển sang loa đã chọn rồi mới phát; đã bị dừng/thay bằng âm thanh khác trong lúc chờ thì không phát nữa
      routeToSelectedOutput(audio)
        .then(() => (audioPlayerRef.current === audio ? audio.play() : undefined))
        .catch(() => {
          if (expectedTurnId !== undefined && expectedTurnId !== turnIdRef.current) return;
          if (text) {
            playVoiceVoxWithFallback(text, onEnd, expectedTurnId, sentenceId);
          } else {
            setIsPlayingAudio(false);
            if (onEnd) onEnd();
          }
        });
    } else if (text) {
      playVoiceVoxWithFallback(text, onEnd, expectedTurnId, sentenceId);
    } else {
      if (onEnd && (expectedTurnId === undefined || expectedTurnId === turnIdRef.current)) {
        onEnd();
      }
    }
  };

  // Play user recorded audio (nghe lại giọng của người học cho từng câu đã lưu)
  const playUserRecording = (sentenceId: number) => {
    const url = recordedAudioUrls.get(sentenceId);
    if (!url) return;

    if (playingUserAudioSentenceId === sentenceId) {
      if (userAudioPlayerRef.current) {
        userAudioPlayerRef.current.pause();
      }
      setPlayingUserAudioSentenceId(null);
      return;
    }

    stopAllAudio();

    const audio = new Audio(url);
    userAudioPlayerRef.current = audio;
    setPlayingUserAudioSentenceId(sentenceId);

    audio.onended = () => {
      setPlayingUserAudioSentenceId(null);
    };
    audio.onerror = () => {
      setPlayingUserAudioSentenceId(null);
    };
    // Chờ chuyển sang loa đã chọn rồi mới phát; đã bị dừng trong lúc chờ thì không phát
    routeToSelectedOutput(audio)
      .then(() => (userAudioPlayerRef.current === audio ? audio.play() : undefined))
      .catch(() => {
        setPlayingUserAudioSentenceId(null);
      });
  };

  // Turn progression: Opponent speaks and auto-advances
  const playOpponentSentence = (sentence: ShadowingSentenceItem, activeTurnId?: number) => {
    const currentTurnId = activeTurnId ?? turnIdRef.current;
    setPracticeState('opponent-speaking');
    playAudio(
      sentence.nativeAudioUrl,
      sentence.japaneseText,
      () => {
        if (turnIdRef.current !== currentTurnId) return;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current !== currentTurnId) return;
          advanceAfterOpponent(sentence.orderIndex, currentTurnId);
        }, 700);
      },
      currentTurnId
    );
  };

  const advanceAfterOpponent = (currentOrderIndex: number, expectedTurnId?: number) => {
    if (expectedTurnId !== undefined && turnIdRef.current !== expectedTurnId) return;
    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;

    const currentIdx = currentDialogue.sentences.findIndex(s => s.orderIndex === currentOrderIndex);
    const nextIdx = currentIdx + 1;
    if (nextIdx < currentDialogue.sentences.length) {
      setCurrentSentenceIndex(nextIdx);
      setIsOpponentPausedForResume(false);

      const nextSentence = currentDialogue.sentences[nextIdx];
      const learnerId = user?.id || user?.email || 'guest_learner';
      shadowingStorageService.updateSentenceProgress(
        learnerId,
        currentDialogue.id,
        nextIdx,
        currentDialogue.sentences.length,
        nextSentence?.japaneseText
      );
      persistPosition(nextIdx); // server là nguồn chính thức; phản hồi sẽ ghi đè lại localStorage
      const currentUserRole = userRoleRef.current;

      if (nextSentence.speakerRole !== currentUserRole) {
        // Đối phương nói: tự động phát giọng đối phương, KHÔNG thu âm
        setPracticeState('opponent-speaking');
        const activeTurnId = turnIdRef.current;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current === activeTurnId) {
            playOpponentSentence(nextSentence, activeTurnId);
          }
        }, 500);
      } else {
        // LƯỢT CỦA NGƯỜI HỌC: Sẵn sàng ghi âm, TUYỆT ĐỐI KHÔNG TỰ ĐỘNG PHÁT CÂU MẪU!
        // Người học phải chủ động bấm nút "Nghe lại" thì mới phát câu mẫu
        setPracticeState('ready');
        setCurrentRecognizedText('');
      }
    } else {
      handleFinishDialogue();
    }
  };

  const handlePlayResumedOpponentSentence = () => {
    setIsOpponentPausedForResume(false);
    const activeTurnId = turnIdRef.current;
    if (currentSentence) {
      playOpponentSentence(currentSentence, activeTurnId);
    }
  };

  const handleSkipOpponentSpeech = () => {
    setIsOpponentPausedForResume(false);
    stopAllAudio();
    if (currentSentence) {
      const activeTurnId = turnIdRef.current;
      advanceAfterOpponent(currentSentence.orderIndex, activeTurnId);
    }
  };

  // Toggle translation
  const toggleTranslation = (sentenceId: number) => {
    setShowTranslations(prev => ({
      ...prev,
      [sentenceId]: !(prev[sentenceId] ?? translationDefault),
    }));
  };

  // ===========================================================================
  // GHI ÂM → NHẬN DẠNG → BACKEND CHẤM ĐIỂM
  // Backend (ShadowingEvaluationService) là nguồn điểm DUY NHẤT. Client chỉ thu bằng chứng
  // (audio, transcript Web Speech ĐÃ CHỐT, trạng thái cổng mic) và hiển thị kết quả trả về.
  // Nhận dạng giọng nói chạy trên trình duyệt (Web Speech); backend chỉ chấm transcript ĐÃ CHỐT, không bao giờ dùng interim.
  // ===========================================================================

  /** Hủy mọi kết quả đang chờ và bỏ qua sự kiện nhận dạng đến muộn. */
  const cancelPendingEvaluation = () => {
    evaluationSeqRef.current += 1;
    collectorRef.current.lock();
  };

  // Một phiên Web Speech. Tự khởi động lại khi trình duyệt tự kết thúc, nhưng KHÔNG mất đoạn đã chốt
  // (SpeechTranscriptCollector giữ lại các đoạn final qua các phiên).
  const startRecognitionSession = (): boolean => {
    const collector = collectorRef.current;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      collector.markUnsupported();
      return false;
    }

    let sessionId = -1;
    let micSource: RecognitionMicSource = 'default';
    try {
      const recognition = new SpeechRec();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;
      sessionId = collector.startSession();
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        if (recognitionRef.current === recognition) setPracticeState('listening');
      };

      recognition.onresult = (event: any) => {
        collector.handleResult(sessionId, event.results);
      };

      recognition.onerror = (event: any) => {
        if (micSource === 'track') {
          console.warn('[Shadowing] Web Speech lỗi khi nghe micro đã chọn:', event?.error, event?.message ?? '');
        }
        collector.handleError(sessionId, String(event?.error ?? 'unknown'));
      };

      recognition.onend = () => {
        collector.endSession(sessionId);
        // Instance đã bị thay thế (bắt đầu lượt ghi âm mới/abort): không tự khởi động lại.
        if (recognitionRef.current !== recognition) return;
        if (
          isRecordingRef.current &&
          !collector.stopRequested &&
          !collector.hasFatalError &&
          recognitionRestartCountRef.current < MAX_RECOGNITION_RESTARTS
        ) {
          recognitionRestartCountRef.current += 1;
          startRecognitionSession();
        }
      };

      // Mặc định khởi động như cũ (micro mặc định của hệ thống): truyền track micro đã chọn làm Web Speech ngừng nhận dạng
      // trên trình duyệt thật, nên chỉ bật khi thử nghiệm (localStorage `jcap_speech_mic_track` = '1').
      if (isSpeechMicTrackEnabled()) {
        micSource = startRecognitionOnTrack(recognition, micTrackRef.current);
        console.info('[Shadowing] Web Speech khởi động với nguồn micro:', micSource);
      } else {
        recognition.start();
      }
      return true;
    } catch (err) {
      console.warn('Recognition start error:', err);
      if (sessionId >= 0) {
        collector.handleError(sessionId, 'start-failed');
        collector.endSession(sessionId);
      }
      return false;
    }
  };

  // Start Voice Recording (CHỈ ghi âm khi tới câu của người học: speakerRole === userRole)
  const startRecording = async () => {
    if (!currentSentence || currentSentence.speakerRole !== userRole) return;
    if (hasMicrophone === false) {
      // Không có micro: không cho bắt đầu ghi âm, vẫn nghe mẫu được
      setMicError(describeDeviceStatus('audioinput', 'NOT_FOUND'));
      return;
    }

    cancelPendingEvaluation();
    // Thu lại khi đang có bản ghi chưa gửi: bỏ bản cũ
    discardPendingTake();
    clearResendableTake();
    applySentenceEvent(currentSentence.id, { type: 'START_RECORDING' });
    const collector = collectorRef.current;
    collector.reset();
    isRecordingRef.current = true;
    recognitionRestartCountRef.current = 0;
    setMicError(null);
    setMicNotice(null);
    setCurrentRecognizedText('');

    // Đang phát giọng mẫu/bản ghi lúc bấm: không lấy phần thu trước (tiếng loa sẽ thành chữ ở đầu câu)
    const playbackWasActive =
      playbackActiveRef.current ||
      (!!audioPlayerRef.current && !audioPlayerRef.current.paused) ||
      (!!userAudioPlayerRef.current && !userAudioPlayerRef.current.paused);
    const prerollMs = allowedPrerollMs(playbackWasActive, playbackEndedAtRef.current, performance.now(), PREROLL_MS);

    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (userAudioPlayerRef.current) userAudioPlayerRef.current.pause();
    setPlayingUserAudioSentenceId(null);
    setIsPlayingAudio(false);

    // 1. MediaRecorder: dùng MIME thực sự được trình duyệt hỗ trợ (webm/ogg/mp4), không gắn nhãn cứng.
    recorderStoppedRef.current = Promise.resolve();
    recordedAudioChunksRef.current = [];
    recordedMimeRef.current = '';
    micTrackRef.current = null;
    try {
      // Micro mở sẵn thì bắt đầu ngay. Micro đã chọn không còn (rút tai nghe, đổi máy): tự dùng micro mặc định
      // và báo cho người học, không để thanh ghi âm chạy giả
      const mic = await ensureWarmMic(selectedAudioInputDeviceId);
      if (!isRecordingRef.current) return; // đã huỷ trong lúc chờ mở micro
      const stream = mic.stream;
      // Bản ghi chấm điểm (PCM) bắt đầu ngay, kèm phần đã nói ngay trước khi bấm
      mic.startTake(prerollMs);
      if (mic.usedFallback) {
        setMicNotice('Micro đã chọn không còn kết nối, đang dùng micro mặc định. Bạn có thể đổi lại ở "Cài đặt âm thanh".');
      }
      micTrackRef.current = mic.track;
      // Phân tích Web Audio API (cổng mic): heuristic, chỉ dùng để kiểm định đầu vào.
      audioMetricsService.startAnalysis(stream);

      const requestedMime = pickRecordingMimeType(
        typeof MediaRecorder !== 'undefined' ? (t) => MediaRecorder.isTypeSupported(t) : undefined
      );
      const mediaRecorder = requestedMime
        ? new MediaRecorder(stream, { mimeType: requestedMime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordedMimeRef.current = resolveRecordedMime(mediaRecorder.mimeType, requestedMime);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedAudioChunksRef.current.push(e.data);
        }
      };

      recorderStoppedRef.current = new Promise<void>((resolve) => {
        // Không tắt micro khi dừng: micro được giữ mở cho lượt sau, chỉ đóng khi phát âm thanh/rời trang
        mediaRecorder.onstop = () => resolve();
      });

      mediaRecorder.start(100);
    } catch (err: any) {
      // Không mở được micro: không bắt đầu ghi âm (không có bản ghi thì không chấm được), báo đúng nguyên nhân
      console.warn('Cannot open microphone:', err);
      warmMicRef.current?.cancelTake();
      setMicError(describeMicError(err));
      isRecordingRef.current = false;
      applySentenceEvent(currentSentence.id, { type: 'CANCEL' });
      setPracticeState('ready');
      return;
    }

    // Không để bản ghi dài vô hạn: tự dừng ở giới hạn của mô hình (30 s) rồi chuyển sang nghe lại.
    clearRecordingLimit();
    recordingLimitTimerRef.current = setTimeout(() => {
      if (isRecordingRef.current) {
        setMicNotice('Đã tự dừng sau 30 giây. Hãy nghe lại rồi gửi chấm hoặc thu lại.');
        finishRecording();
      }
    }, MAX_RECORDING_MS);

    // 2. Web Speech (ja-JP): chỉ hiện chữ trực tiếp khi đang nói (KHÔNG dùng để chấm điểm)
    if (!startRecognitionSession()) {
      setPracticeState('listening');
    }
  };

  const stopRecordingMedia = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
  };

  // Hiển thị trạng thái "chưa chấm được" (không có điểm; KHÔNG phải điểm 0).
  const showNotScored = (
    sentence: ShadowingSentenceItem,
    status: 'unavailable' | 'failed',
    reason: string,
    audioBlob: Blob | null
  ) => {
    const prevAttempts = sentenceAttemptsMap.get(sentence.id) || 0;
    const nextAttempts = prevAttempts + 1;
    setSentenceAttemptsMap((prev) => new Map(prev).set(sentence.id, nextAttempts));

    setCurrentEvaluationStatus(status);
    setCurrentRecognitionSource(null);
    setCurrentRecognizedText('');
    setCurrentScore(0);
    setCurrentFluencyMetrics(null);
    setCurrentGateDetail(reason);
    setCurrentDiffTokens([]);
    setPracticeState('evaluated');

    latestAttemptIsBestRef.current = false;
    registerRecording(sentence.id, audioBlob, false);
    setSentenceResults((prev) => {
      const existing = prev.get(sentence.id);
      if (!existing) return prev;
      return new Map(prev).set(sentence.id, { ...existing, attemptsCount: nextAttempts });
    });
  };

  // Lưu bản thu để người học nghe lại (chỉ giữ bản thu tốt nhất; bản chưa có thì luôn lưu).
  const registerRecording = (sentenceId: number, blob: Blob | null, isBest: boolean) => {
    if (!blob) return;
    setRecordedAudioUrls((prev) => {
      if (isBest || !prev.has(sentenceId)) {
        return new Map(prev).set(sentenceId, URL.createObjectURL(blob));
      }
      return prev;
    });
  };

  // Áp dụng kết quả backend. KHÔNG tính lại điểm ở client.
  const applyBackendEvaluation = (
    sentence: ShadowingSentenceItem,
    data: ShadowingAudioEvaluationResult,
    metrics: AudioQualityMetrics,
    audioBlob: Blob
  ) => {
    const isScored =
      (data.evaluationStatus === 'completed' || data.evaluationStatus === 'partial') &&
      data.contentMatchScore != null &&
      data.overallScore != null;

    setCurrentErrorCode(isScored ? null : data.errorCode ?? null);
    if (!isScored) {
      const status = data.evaluationStatus === 'failed' ? 'failed' : 'unavailable';
      showNotScored(
        sentence,
        status,
        // errorMessage là lý do thật (kể cả AUDIO_QUALITY_INSUFFICIENT); audioQualityDetail chỉ là mô tả cổng mic.
        data.errorMessage || data.audioQualityDetail || 'Chưa thể đánh giá bản ghi này.',
        audioBlob
      );
      return;
    }

    const contentMatch = data.contentMatchScore as number;
    const overallScore = data.overallScore as number;
    const tier: 'green' | 'yellow' | 'red' = data.tier === 'green' || data.tier === 'yellow' ? data.tier : 'red';
    const diffTokens = data.diffTokens ?? [];
    const source =
      data.recognitionSource === 'faster-whisper' || data.recognitionSource === 'phoneme' || data.recognitionSource === 'web_speech'
        ? data.recognitionSource
        : 'gemini';

    const prevAttempts = sentenceAttemptsMap.get(sentence.id) || 0;
    const nextAttempts = prevAttempts + 1;
    setSentenceAttemptsMap((prev) => new Map(prev).set(sentence.id, nextAttempts));

    setCurrentEvaluationStatus(data.evaluationStatus);
    setCurrentRecognitionSource(source);
    setCurrentDimensions(data.dimensions ?? null);
    setCurrentScoreBasis(data.overallScoreBasis ?? null);
    // Hiển thị: từ đọc đúng mang chữ của câu mẫu (có kanji), phần đọc khác giữ kana như đã nghe
    setCurrentRecognizedText(data.recognizedDisplayText || data.recognizedText);
    setCurrentScore(overallScore);
    setCurrentFluencyMetrics(data.fluency ?? null);
    setCurrentGateDetail(data.audioQualityDetail ?? '');
    setCurrentDiffTokens(diffTokens);
    setPracticeState('evaluated');

    const prevResult = sentenceResults.get(sentence.id);
    const prevScore = prevResult ? prevResult.overallScore : -1;
    const isBest = !prevResult || !prevResult.isValidForBestAttempt || overallScore >= prevScore;
    latestAttemptIsBestRef.current = isBest;
    registerRecording(sentence.id, audioBlob, isBest);

    const resultItem: ShadowingSentencePracticeResult = {
      sentenceId: sentence.id,
      evaluationId: data.evaluationId ?? null,
      orderIndex: sentence.orderIndex,
      targetText: data.targetText || sentence.japaneseText,
      recognizedText: data.recognizedText,
      contentMatchScore: contentMatch,
      fluencyScore: data.fluencyScore ?? null,
      overallScore,
      accuracyScore: contentMatch,
      evaluationStatus: data.evaluationStatus,
      recognitionSource: source,
      fallbackReason: data.fallbackReason ?? null,
      scoringVersion: data.scoringVersion,
      comparisonMethod: data.comparisonMethod,
      targetReading: data.targetReading,
      recognizedReading: data.recognizedReading,
      feedback: data.feedback,
      missingWords: data.missingWords,
      mismatchedWords: data.mismatchedWords,
      audioGateStatus: data.audioQualityStatus,
      audioGateLabel: GATE_LABELS[data.audioQualityStatus],
      isValidForBestAttempt: true,
      attemptsCount: nextAttempts,
      evaluationTier: tier,
      diffTokens: data.diffTokens,
      durationMs: metrics.durationMs,
      targetAudioUrl: sentence.nativeAudioUrl ?? undefined,
      romajiText: sentence.romajiText ?? undefined,
      vietnameseTranslation: sentence.vietnameseTranslation,
    };
    setSentenceResults((prev) => new Map(prev).set(sentence.id, resultItem));
  };

  // Dừng ghi (nút dừng hoặc tự dừng sau 30 s): chuẩn bị bản ghi để NGHE LẠI, chưa gửi chấm.
  const finishRecording = async () => {
    if (!currentSentence || isSubmittingRef.current || !isRecordingRef.current) return;
    const sentence = currentSentence;
    const collector = collectorRef.current;
    clearRecordingLimit();

    isRecordingRef.current = false;
    collector.requestStop();
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    stopRecordingMedia();
    // Chốt bản ghi chấm điểm (PCM, có phần thu trước) ngay lúc bấm dừng
    const pcmTake = warmMicRef.current?.stopTake() ?? null;
    setPracticeState('analyzing');

    isSubmittingRef.current = true;
    const seq = (evaluationSeqRef.current += 1);
    try {
      // Đợi MediaRecorder xả hết dữ liệu và Web Speech trả kết quả cuối (onend), tối đa vài giây.
      await Promise.all([
        settleWithin(recorderStoppedRef.current ?? Promise.resolve(), RECORDER_SETTLE_TIMEOUT_MS),
        collector.whenSettled(SPEECH_SETTLE_TIMEOUT_MS),
      ]);
      collector.lock();
      if (seq !== evaluationSeqRef.current) return; // đã hủy: thử lại/đi tiếp/đổi vai

      let metrics = audioMetricsService.stopAnalysis(sentence.audioDurationMs);
      const chunks = recordedAudioChunksRef.current;
      if (chunks.length === 0) {
        applySentenceEvent(sentence.id, { type: 'STOP_RECORDING', hasAudio: false });
        setMicError('Chưa thu được âm thanh. Hãy kiểm tra micro rồi thu lại.');
        setPracticeState('ready');
        return;
      }

      const audioBlob = new Blob(chunks, { type: recordedMimeRef.current });

      // Bộ đo trực tiếp không đo được (vd. im lặng tuyệt đối làm mọi mẫu bằng 0): đo trên chính bản ghi để hiển thị đúng.
      // Backend vẫn tự kiểm tra lại, không dựa vào kết quả này.
      if (metrics.gateStatus === 'unmeasured') {
        const decoded = await measureRecordedBlob(audioBlob, metrics.durationMs);
        if (seq !== evaluationSeqRef.current) return;
        if (decoded) metrics = decoded;
      }
      // WAV 16 kHz mono: backend nhận dạng âm vị trên chính bản ghi này (nguồn chấm DUY NHẤT).
      // Ưu tiên bản PCM thu trực tiếp (không mất âm đầu câu); không có thì giải mã bản MediaRecorder.
      const pcmWav = pcmTake && pcmTake.samples.length > 0 ? await pcmToAnalysisWav(pcmTake.samples, pcmTake.sampleRate) : null;
      const analysisWav = pcmWav ?? (await blobToAnalysisWav(audioBlob));
      // Nghe lại ở mức dễ nghe (micro không tự chỉnh âm lượng thường rất nhỏ); bản gửi chấm giữ nguyên.
      const playbackBlob = await makePlaybackBlob(audioBlob, pcmWav ? pcmTake : null);
      if (seq !== evaluationSeqRef.current) return;

      pendingTakeRef.current = {
        sentenceId: sentence.id,
        audioBlob,
        playbackBlob,
        analysisWav,
        metrics,
        recognition: collector.snapshot(),
        capture: pcmWav ? 'pcm' : 'media-recorder',
        prerollMs: pcmWav ? pcmTake?.prerollMs ?? 0 : 0,
        submissionId: null,
      };
      setPendingAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(playbackBlob);
      });
      setSubmitError(null);
      applySentenceEvent(sentence.id, { type: 'STOP_RECORDING', hasAudio: true });
      setPracticeState('recorded');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // Gửi bản thu đã nghe lại để backend chấm. Lỗi mạng/quá 60 s: giữ bản thu, cho "Gửi lại" với CÙNG mã lần gửi
  // (backend thấy mã đã có thì trả kết quả đã lưu, không lưu trùng).
  const submitPendingTake = async () => {
    const take = pendingTakeRef.current;
    const sentence = dialogue?.sentences.find((s) => s.id === take?.sentenceId);
    if (!take || !sentence || isSubmittingRef.current) return;

    if (!take.submissionId) take.submissionId = newSubmissionId();
    applySentenceEvent(sentence.id, { type: 'SUBMIT' });
    setSubmitError(null);
    setPracticeState('analyzing');
    isSubmittingRef.current = true;
    const seq = (evaluationSeqRef.current += 1);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EVALUATE_TIMEOUT_MS);
    try {
      const res = await shadowingService.evaluateAudio(take.audioBlob, sentence.japaneseText, {
        sentenceId: sentence.id,
        clientRecognition: take.recognition,
        audioGateStatus: take.metrics.gateStatus,
        audioGateDetail: take.metrics.gateDetail,
        durationMs: take.metrics.durationMs,
        analysisWav: take.analysisWav,
        referenceSpeakerId: selectedVoiceVoxIdRef.current,
        progressId: serverProgressRef.current?.status === 'in_progress' ? serverProgressRef.current.id : null,
        clientSubmissionId: take.submissionId,
        signal: controller.signal,
      });
      if (seq !== evaluationSeqRef.current) return;

      if (import.meta.env.DEV && take.analysisWav) {
        setDevTake({
          sentenceId: sentence.id,
          wav: take.analysisWav,
          meta: {
            sentenceId: sentence.id,
            targetText: sentence.japaneseText,
            recordedAt: new Date().toISOString(),
            capture: take.capture,
            prerollMs: take.prerollMs,
            voiceProcessing: true, // khử nhiễu + tự chỉnh âm lượng luôn bật
            webSpeech: take.recognition,
            result: res.data
              ? {
                  score: res.data.overallScore ?? null,
                  recognitionSource: res.data.recognitionSource ?? null,
                  recognitionMode: res.data.recognitionMode ?? null,
                  recognizedText: res.data.recognizedText ?? null,
                  freeRecognizedText: res.data.freeRecognizedText ?? null,
                  errorCode: res.data.errorCode ?? null,
                }
              : { error: res.message ?? 'failed' },
          },
        });
      }

      if (!res.success || !res.data) {
        // Không biết server đã lưu chưa (lỗi mạng/quá hạn): giữ bản thu để gửi lại cùng mã. KHÔNG phải điểm 0.
        applySentenceEvent(sentence.id, { type: 'REQUEST_FAILED' });
        setSubmitError(res.message || 'Không thể chấm điểm lúc này. Điểm chưa được ghi nhận.');
        setPracticeState('recorded');
        return;
      }

      // Server đã chấm và đã lưu lần gửi này (có điểm hoặc "chưa chấm được" kèm lý do)
      const scored = res.data.overallScore != null
        && (res.data.evaluationStatus === 'completed' || res.data.evaluationStatus === 'partial');
      applySentenceEvent(sentence.id, { type: 'RESULT', scored });
      const audioBlob = take.playbackBlob; // chỉ để nghe lại câu đã chấm
      const metrics = take.metrics;
      discardPendingTake();
      const resendable = !scored && isSystemBusyCode(res.data.errorCode);
      resendableTakeRef.current = resendable ? { ...take, submissionId: null } : null;
      setCanResendTake(resendable);
      applyBackendEvaluation(sentence, res.data, metrics, audioBlob);
    } finally {
      clearTimeout(timeout);
      isSubmittingRef.current = false;
    }
  };

  /**
   * "Gửi lại" khi lượt vừa rồi không chấm được vì hệ thống bận (ASR_BUSY, SERVER_BUSY…): gửi lại đúng bản thu đó
   * với mã lần gửi mới (lần cũ đã được lưu là "chưa chấm được"), không bắt người học thu lại.
   */
  const resendLastTake = () => {
    const take = resendableTakeRef.current;
    if (!take || isSubmittingRef.current) return;
    resendableTakeRef.current = null;
    setCanResendTake(false);
    applySentenceEvent(take.sentenceId, { type: 'START_RECORDING' });
    applySentenceEvent(take.sentenceId, { type: 'STOP_RECORDING', hasAudio: true });
    pendingTakeRef.current = take;
    setPendingAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(take.playbackBlob);
    });
    submitPendingTake();
  };

  const clearResendableTake = () => {
    resendableTakeRef.current = null;
    setCanResendTake(false);
  };

  // Bỏ bản thu chưa gửi (nút "Bỏ" ở bước nghe lại): câu trở về trạng thái đã lưu ở server.
  const discardRecordedTake = () => {
    const take = pendingTakeRef.current;
    if (take) applySentenceEvent(take.sentenceId, { type: 'CANCEL' });
    discardPendingTake();
    if (userAudioPlayerRef.current) userAudioPlayerRef.current.pause();
    setPracticeState('ready');
  };

  // Nghe lại bản thu chưa gửi (qua loa đã chọn)
  const playPendingTake = () => {
    if (!pendingAudioUrl) return;
    stopAllAudio();
    const audio = new Audio(pendingAudioUrl);
    userAudioPlayerRef.current = audio;
    setPlayingUserAudioSentenceId(-1);
    audio.onended = () => setPlayingUserAudioSentenceId(null);
    audio.onerror = () => setPlayingUserAudioSentenceId(null);
    routeToSelectedOutput(audio)
      .then(() => (userAudioPlayerRef.current === audio ? audio.play() : undefined))
      .catch(() => setPlayingUserAudioSentenceId(null));
  };

  // Hủy bản thu đang chạy (nút vuông trên thanh ghi âm): bỏ âm thanh, KHÔNG gửi chấm điểm, quay về trạng thái sẵn sàng.
  const cancelRecording = () => {
    if (isSubmittingRef.current) return;
    cancelPendingEvaluation();
    isRecordingRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    stopRecordingMedia();
    clearRecordingLimit();
    warmMicRef.current?.cancelTake();
    audioMetricsService.stopAnalysis();
    recordedAudioChunksRef.current = [];
    if (currentSentence) applySentenceEvent(currentSentence.id, { type: 'CANCEL' });
    setCurrentRecognizedText('');
    setMicError(null);
    setPracticeState('ready');
  };

  // Retry current sentence
  const handleRetryCurrentSentence = () => {
    clearResendableTake();
    cancelPendingEvaluation();
    discardPendingTake();
    stopAllAudio();
    setPracticeState('ready');
    setCurrentRecognizedText('');
    setMicError(null);
    setCurrentEvaluationStatus('completed');
  };

  // Finish current sentence and move to next
  const handleNextSentence = () => {
    clearResendableTake();
    cancelPendingEvaluation();
    if (pendingTakeRef.current) {
      // Bản thu chưa gửi bị bỏ khi sang câu khác: câu trở về trạng thái đã lưu ở server
      applySentenceEvent(pendingTakeRef.current.sentenceId, { type: 'CANCEL' });
      discardPendingTake();
    }
    stopAllAudio();
    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;

    const nextIdx = currentSentenceIndex + 1;
    const learnerId = user?.id || user?.email || 'guest_learner';

    if (nextIdx < currentDialogue.sentences.length) {
      setCurrentSentenceIndex(nextIdx);
      setCurrentRecognizedText('');
      setMicError(null);
      setIsOpponentPausedForResume(false);

      const nextSentence = currentDialogue.sentences[nextIdx];
      // Cập nhật tiến trình lưu vào storage
      shadowingStorageService.updateSentenceProgress(
        learnerId,
        currentDialogue.id,
        nextIdx,
        currentDialogue.sentences.length,
        nextSentence?.japaneseText
      );
      persistPosition(nextIdx);
      const currentUserRole = userRoleRef.current;
      if (nextSentence.speakerRole !== currentUserRole) {
        // Đối phương nói: tự động phát giọng đối phương, KHÔNG thu âm
        setPracticeState('opponent-speaking');
        const activeTurnId = turnIdRef.current;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current === activeTurnId) {
            playOpponentSentence(nextSentence, activeTurnId);
          }
        }, 300);
      } else {
        // Lượt của người học: sẵn sàng ghi âm, KHÔNG tự động phát âm thanh câu mẫu
        setPracticeState('ready');
      }
    } else {
      handleFinishDialogue();
    }
  };

  // Complete dialogue
  const handleFinishDialogue = async () => {
    setPracticeState('completed');
    optionsRef.current.onFinish?.();
    setHistorySaveState('idle');
    setHistorySaveMessage('');
    setServerSummary(null);
    setServerOverall(null);
    setCompletedSessionId(null);

    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;

    // 1. Cập nhật trạng thái hoàn thành của tiến trình đang luyện (lưu trên trình duyệt để có thể luyện tiếp)
    const learnerId = user?.id || user?.email || 'guest_learner';
    shadowingStorageService.completeProgress(learnerId, currentDialogue.id, currentDialogue.sentences.length);

    // 2. Chỉ các câu backend đã chấm VÀ đã lưu mới vào lịch sử. Không câu nào thì không tạo bản ghi "0 điểm" gây hiểu nhầm.
    //    Có phiên server: backend tự lấy các lần chấm của phiên (kể cả lần chấm ở máy khác trước khi tiếp tục ở đây).
    const evaluationIds = Array.from(sentenceResults.values())
      .filter((r) => r.isValidForBestAttempt !== false && r.evaluationId)
      .map((r) => r.evaluationId as string);
    const progress = serverProgressRef.current?.status === 'in_progress' ? serverProgressRef.current : null;
    const anyScoredOnServer = Array.from(sentenceStates.values()).some((e) => e.persisted === 'EVALUATED');
    if (evaluationIds.length === 0 && !(progress && anyScoredOnServer)) return;

    // 3. Backend đọc điểm đã lưu, tính điểm tổng và lưu buổi luyện vào lịch sử (client không gửi điểm).
    setHistorySaveState('saving');
    const completeRes = await shadowingService.completeSession({
      dialogueId: currentDialogue.id,
      learnerRole: userRoleRef.current,
      durationSeconds: sessionDurationSeconds,
      startedAt: new Date(practiceStartTime).toISOString(),
      evaluationIds,
      progressId: progress?.id,
    });

    if (completeRes.success) {
      if (progress) {
        const done = { ...progress, status: 'completed' as const, completedAt: new Date().toISOString(), sessionId: completeRes.data?.sessionId ?? null };
        serverProgressRef.current = done;
        setServerProgress(done);
        mirrorToLocal(done);
      }
      setServerSummary(completeRes.data?.summary ?? null);
      setServerOverall(completeRes.data?.weightedOverallScore ?? null);
      setCompletedSessionId(completeRes.data?.sessionId ?? null);
      setHistorySaveState('saved');
    } else {
      setHistorySaveState('failed');
      setHistorySaveMessage(completeRes.message || 'Chưa lưu được buổi luyện vào lịch sử.');
    }
  };

  // Role selection change
  const handleConfirmRoleChange = (newRole: 'A' | 'B') => {
    // 1. Dừng ngay lập tức toàn bộ audio, speech synthesis và timers đang chạy dở
    clearResendableTake();
    cancelPendingEvaluation();
    isRecordingRef.current = false;
    clearRecordingLimit();
    discardPendingTake();
    stopAllAudio();

    // 2. Dừng micro và ghi âm nếu đang ghi âm dở
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    stopRecordingMedia();

    // 3. Cập nhật vai mới vào ref và state
    userRoleRef.current = newRole;
    setUserRole(newRole);
    optionsRef.current.onRoleChange?.(newRole);

    // 4. Reset toàn bộ tiến độ bài học về câu 0 & bắt đầu session mới
    setCurrentSentenceIndex(0);
    setSentenceResults(new Map());
    setSentenceAttemptsMap(new Map());
    setRecordedAudioUrls(new Map());
    setCurrentRecognizedText('');
    setMicError(null);
    setIsOpponentPausedForResume(false);

    const currentDialogue = dialogueRef.current || dialogue;
    if (currentDialogue) {
      const learnerId = user?.id || user?.email || 'guest_learner';
      shadowingStorageService.restartProgress(
        learnerId,
        {
          id: currentDialogue.id,
          title: currentDialogue.title,
          totalSentences: currentDialogue.sentences.length,
          jlptLevel: currentDialogue.jlptLevel,
          scenarioTitle: currentDialogue.scenarioTitle,
          textbookTitle: currentDialogue.textbookTitle,
          chapterTitle: currentDialogue.chapterTitle,
        },
        newRole
      );

      // Phiên server cho vai mới, bắt đầu lại từ câu đầu (giống hành vi cũ). Phiên của vai kia không bị đụng tới.
      setSentenceStates(new Map());
      const seen = serverProgressRef.current;
      shadowingService
        .startProgress({
          dialogueId: currentDialogue.id,
          learnerRole: newRole,
          restart: true,
          // "Luyện lại" cùng vai: phiên tab này đang thấy (tab cũ làm lại không tạo phiên thứ hai)
          expectedProgressId: seen && seen.learnerRole === newRole && seen.status === 'in_progress' ? seen.id : undefined,
        })
        .then((started) => {
          if (userRoleRef.current !== newRole) return; // đã đổi vai lần nữa
          if (started.success && started.data) {
            applyServerProgress(started.data, 'replace');
            setProgressSyncError(null);
          } else {
            serverProgressRef.current = null;
            setServerProgress(null);
            setProgressSyncError(started.message || 'Chưa đồng bộ được tiến độ với máy chủ; tiến độ chỉ lưu trên trình duyệt này.');
          }
        });
    }

    // 5. Kiểm tra câu 0 theo vai mới
    if (currentDialogue && currentDialogue.sentences && currentDialogue.sentences.length > 0) {
      const firstSentence = currentDialogue.sentences[0];
      if (firstSentence.speakerRole !== newRole) {
        // Câu 0 là vai đối phương: Tự động phát âm thanh đối phương sau 500ms
        setPracticeState('opponent-speaking');
        const activeTurnId = turnIdRef.current;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current === activeTurnId) {
            playOpponentSentence(firstSentence, activeTurnId);
          }
        }, 500);
      } else {
        // Câu 0 là vai người học (vai của tôi):
        // Chuyển sang trạng thái 'ready' (sẵn sàng ghi âm), TUYỆT ĐỐI KHÔNG TỰ ĐỘNG PHÁT CÂU MẪU!
        // Người học phải chủ động bấm nút "Nghe lại" thì mới phát câu mẫu.
        setPracticeState('ready');
      }
    }
  };


  /** Nhảy tới một câu (luyện lại câu đã qua): bỏ bản thu chưa gửi, dừng âm thanh, câu của người học thì sẵn sàng thu. */
  const goToSentence = (index: number) => {
    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue || index < 0 || index >= currentDialogue.sentences.length) return;
    clearResendableTake();
    cancelPendingEvaluation();
    if (pendingTakeRef.current) {
      applySentenceEvent(pendingTakeRef.current.sentenceId, { type: 'CANCEL' });
      discardPendingTake();
    }
    stopAllAudio();
    setCurrentSentenceIndex(index);
    setCurrentRecognizedText('');
    setMicError(null);
    setCurrentEvaluationStatus('completed');
    persistPosition(index);
    const target = currentDialogue.sentences[index];
    if (target.speakerRole === userRoleRef.current) {
      setIsOpponentPausedForResume(false);
      setPracticeState('ready');
    } else {
      setIsOpponentPausedForResume(true);
      setPracticeState('opponent-speaking');
    }
  };

  const currentSentence = dialogue?.sentences?.[currentSentenceIndex];

  return {
    advanceAfterOpponent,
    applyBackendEvaluation,
    applySentenceEvent,
    applyServerProgress,
    audioPlayerRef,
    availableVoices,
    cancelPendingEvaluation,
    cancelRecording,
    clearRecordingLimit,
    closeWarmMic,
    collectorRef,
    completedSessionId,
    currentDiffTokens,
    currentDimensions,
    currentEvaluationStatus,
    currentFluencyMetrics,
    currentGateDetail,
    currentRecognitionSource,
    currentRecognizedText,
    currentScore,
    currentScoreBasis,
    currentSentenceIndex,
    devTake,
    dialogue,
    dialogueRef,
    dialogueScrollRef,
    discardPendingTake,
    discardRecordedTake,
    ensureWarmMic,
    errorMessage,
    evaluationSeqRef,
    finishRecording,
    furiganaMap,
    handleConfirmRoleChange,
    handleFinishDialogue,
    handleNextSentence,
    handlePlayResumedOpponentSentence,
    handleRetryCurrentSentence,
    handleSkipOpponentSpeech,
    hasMicrophone,
    historySaveMessage,
    historySaveState,
    initialSavedVoiceId,
    isLearnerTurn,
    isLoading,
    isOpponentPausedForResume,
    isPlayingAudio,
    isRecordingRef,
    isSpeechCancelledRef,
    isSubmittingRef,
    isTranslationShown,
    isUnmountedRef,
    latestAttemptIsBestRef,
    learnerIdOf,
    loadingAudioSentenceId,
    mediaRecorderRef,
    micError,
    micNotice,
    micTrackRef,
    mirrorToLocal,
    pendingAudioUrl,
    pendingTakeRef,
    persistPosition,
    playAudio,
    playOpponentSentence,
    playPendingTake,
    playUserRecording,
    playVoiceVoxWithFallback,
    playbackActive,
    playbackActiveRef,
    playbackEndedAtRef,
    playingUserAudioSentenceId,
    practiceState,
    progressSyncError,
    recognitionRef,
    recognitionRestartCountRef,
    recordedAudioChunksRef,
    recordedAudioUrls,
    recordedMimeRef,
    recorderStoppedRef,
    recordingLimitTimerRef,
    registerRecording,
    roleParam,
    routeToSelectedOutput,
    selectedAudioInputDeviceId,
    selectedAudioOutputDeviceId,
    selectedInputIdRef,
    selectedVoiceVoxId,
    selectedVoiceVoxIdRef,
    sentenceAttemptsMap,
    sentenceResults,
    sentenceStates,
    serverOverall,
    serverProgress,
    serverProgressRef,
    serverSummary,
    sessionDurationSeconds,
    setAvailableVoices,
    setCompletedSessionId,
    setCurrentDiffTokens,
    setCurrentDimensions,
    setCurrentEvaluationStatus,
    setCurrentFluencyMetrics,
    setCurrentGateDetail,
    setCurrentRecognitionSource,
    setCurrentRecognizedText,
    setCurrentScore,
    setCurrentScoreBasis,
    setCurrentSentenceIndex,
    setDevTake,
    setDialogue,
    setErrorMessage,
    setFuriganaMap,
    setHasMicrophone,
    setHistorySaveMessage,
    setHistorySaveState,
    setIsLoading,
    setIsOpponentPausedForResume,
    setIsPlayingAudio,
    setLoadingAudioSentenceId,
    setMicError,
    setMicNotice,
    setPendingAudioUrl,
    setPlayingUserAudioSentenceId,
    setPracticeState,
    setProgressSyncError,
    setRecordedAudioUrls,
    setSelectedAudioInputDeviceId,
    setSelectedAudioOutputDeviceId,
    setSelectedVoiceVoxId,
    setSentenceAttemptsMap,
    setSentenceResults,
    setSentenceStates,
    setServerOverall,
    setServerProgress,
    setServerSummary,
    setSessionDurationSeconds,
    setShowTranslations,
    setSubmitError,
    setUserRole,
    showFurigana,
    showNotScored,
    showTranslations,
    speakJapanese,
    startRecognitionSession,
    startRecording,
    stopAllAudio,
    stopRecordingMedia,
    submitError,
    submitPendingTake,
    toggleTranslation,
    translationDefault,
    turnIdRef,
    turnTimeoutRef,
    user,
    userAudioPlayerRef,
    userRole,
    userRoleRef,
    warmMicOpeningRef,
    warmMicRef,
    goToSentence,
    currentSentence,
    currentErrorCode,
    canResendTake,
    resendLastTake,
  };
}

export type ShadowingSession = ReturnType<typeof useShadowingSession>;
