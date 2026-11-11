import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Badge as JBadge, Button as JButton, Icon as JIcon, IconButton as JIconButton, Logo as JLogo } from '../../components/jcap';
import { getPracticePrefs } from '../../utils/practicePrefs';
import { shadowingService } from '../../services/shadowingService';
import { shadowingStorageService } from '../../services/shadowingStorageService';
import type {
  ShadowingDialogueDetail,
  ShadowingSentenceItem,
  ShadowingSentencePracticeResult,
  ShadowingAudioEvaluationResult,
  ShadowingDiffToken,
  ShadowingFluencyMetrics,
} from '../../types/shadowing';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { AudioDeviceSettingsModal } from '../../components/shadowing/AudioDeviceSettingsModal';
import { voicevoxService, type VoiceOption } from '../../services/voicevoxService';
import RecordingBar from '../../components/shadowing/RecordingBar';
import { audioMetricsService, measureRecordedBlob, type AudioQualityMetrics, type AudioGateStatus } from '../../services/audioMetricsService';
import {
  INPUT_DEVICE_STORAGE_KEY,
  INPUT_LABEL_STORAGE_KEY,
  MIC_VOICE_PROCESSING_STORAGE_KEY,
  OUTPUT_DEVICE_STORAGE_KEY,
  applyOutputDevice,
  describeDeviceStatus,
  describeMicError,
  filterSelectableDevices,
  isMicVoiceProcessingEnabled,
  newlyConnected,
  normalizeDeviceId,
} from '../../utils/audioDevice';
import { PREROLL_MS, WarmMic, isMicPermissionGranted } from '../../utils/warmMic';
import { allowedPrerollMs } from '../../utils/pcmTakeBuffer';
import {
  entriesFromServer,
  initialEntry,
  mergeServerStates,
  nextSentenceState,
  type SentenceEvent,
  type SentenceStateEntry,
} from '../../utils/sentencePracticeState';
import { serverToLocalProgress, suggestedIndexFromLocal } from '../../utils/shadowingProgressSync';
import RecordingReviewBar from '../../components/shadowing/RecordingReviewBar';
import SessionSummaryPanel from '../../components/shadowing/SessionSummaryPanel';
import { REFERENCE_RATES, REFERENCE_RATE_KEY, matchingFurigana, readReferenceRate } from '../../utils/furigana';
import type {
  FuriganaSegment,
  ShadowingEvaluationDimensions,
  ShadowingRecommendation,
  ShadowingServerProgress,
  ShadowingSessionSummary,
} from '../../types/shadowing';
import { RecordingDevTools, type DevRecordingTake } from '../../components/shadowing/RecordingDevTools';
import { useAuth } from '../../contexts/AuthContext';
import { SpeechTranscriptCollector } from '../../utils/speechTranscriptCollector';
import { pickRecordingMimeType, resolveRecordedMime } from '../../utils/recordingMime';
import {
  isSpeechMicTrackEnabled,
  startRecognitionOnTrack,
  type RecognitionMicSource,
} from '../../utils/speechRecognitionStart';
import { blobToAnalysisWav, pcmToAnalysisWav } from '../../utils/wavEncoder';
import { sessionRankTitle, summarizeSessionScores } from '../../utils/shadowingSessionScores';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import { ShadowingSentenceResultCard } from '../../components/shadowing/ShadowingSentenceResultCard';
import { useTheme } from '../../contexts/ThemeContext';
import { DefaultAvatarImage } from '../../components/shadowing/DefaultAvatarImage';

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

/** Tên vai hiển thị: bỏ chú thích "(Học viên)" mà dữ liệu bài học gắn sẵn sau tên vai (vd. "Khách hàng (Học viên)" -> "Khách hàng") */
const displayRoleName = (name: string): string => name.replace(/\s*[(（]\s*học\s*viên\s*[)）]/gi, '').trim();

export const LearnerShadowingPracticeView: React.FC = () => {
  const { themeFor } = useTheme();
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  /**
   * Mở từ trang Khám phá (?return=/explore?...): bấm "Xong"/"Quay lại" thì về lại đúng địa điểm trên bản đồ, nơi con dấu
   * được cấp. Chỉ nhận đường dẫn nội bộ của Khám phá (không cho chuyển hướng ra ngoài).
   */
  const returnParam = searchParams.get('return');
  const returnTo = returnParam && returnParam.startsWith('/explore') ? returnParam : null;
  const navigate = useNavigate();
  const { user } = useAuth();

  // Active JLPT level selector (N5, N4, N3 - default N4 as per prototype)
  const initialLevel = (searchParams.get('level')?.toUpperCase() as 'N5' | 'N4' | 'N3') || 'N4';
  const [selectedLevel, setSelectedLevel] = useState<'N5' | 'N4' | 'N3'>(initialLevel);

  const [dialogue, setDialogue] = useState<ShadowingDialogueDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Learner Role selection: 'A' or 'B'
  const roleParam = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
  const [userRole, setUserRole] = useState<'A' | 'B'>(roleParam);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);

  // Practice turn tracking: start at sentence index 0
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentenceResults, setSentenceResults] = useState<Map<number, ShadowingSentencePracticeResult>>(new Map());
  const [practiceStartTime] = useState<number>(Date.now());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState<number>(0);

  // Recording & State
  // recorded: đã thu xong, CHƯA gửi — người học nghe lại, thu lại hoặc gửi chấm
  type PracticeState = 'ready' | 'listening' | 'recorded' | 'analyzing' | 'evaluated' | 'opponent-speaking' | 'completed';
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
  const [micVoiceProcessing, setMicVoiceProcessing] = useState<boolean>(() => isMicVoiceProcessingEnabled());
  const isRecordingRef = useRef<boolean>(false);
  // Gom transcript đã chốt qua các lần Web Speech tự khởi động lại
  const collectorRef = useRef<SpeechTranscriptCollector>(new SpeechTranscriptCollector());
  const recognitionRestartCountRef = useRef<number>(0);
  const recordedMimeRef = useRef<string>('');
  const recorderStoppedRef = useRef<Promise<void> | null>(null);
  // Tăng mỗi khi hủy/thu lại để bỏ qua kết quả đến muộn
  const evaluationSeqRef = useRef<number>(0);
  const isSubmittingRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Modals & Slideovers (Mặc định ẩn nội dung khi lần đầu vào trang, mũi tên hướng xuống)
  const [isSituationCollapsed, setIsSituationCollapsed] = useState<boolean>(true);
  const [isDialogueContentCollapsed, setIsDialogueContentCollapsed] = useState<boolean>(true);
  const [isFullScriptModalOpen, setIsFullScriptModalOpen] = useState<boolean>(false);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState<boolean>(false);
  // Lưu buổi luyện vào lịch sử ở backend: idle (chưa lưu / không có câu nào được chấm) | saving | saved | failed
  const [historySaveState, setHistorySaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [historySaveMessage, setHistorySaveMessage] = useState<string>('');
  // Tổng kết do backend tính khi hoàn thành (đúng cả khi tiếp tục phiên từ máy khác) và gợi ý luyện tập
  const [serverSummary, setServerSummary] = useState<ShadowingSessionSummary | null>(null);
  const [serverOverall, setServerOverall] = useState<number | null>(null);
  const [recommendation, setRecommendation] = useState<ShadowingRecommendation | null>(null);
  const [isAudioDeviceModalOpen, setIsAudioDeviceModalOpen] = useState<boolean>(false);
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
  // Tốc độ giọng mẫu (VOICEVOX / audio mẫu / giọng trình duyệt); bản ghi của người học luôn phát đúng tốc độ
  const [referenceRate, setReferenceRate] = useState<number>(() => readReferenceRate());
  const referenceRateRef = useRef<number>(referenceRate);
  referenceRateRef.current = referenceRate;
  const changeReferenceRate = (rate: number) => {
    setReferenceRate(rate);
    try {
      localStorage.setItem(REFERENCE_RATE_KEY, String(rate));
    } catch {
      // không lưu được: vẫn dùng trong phiên
    }
    if (audioPlayerRef.current) audioPlayerRef.current.playbackRate = rate;
  };
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
    const processing = isMicVoiceProcessingEnabled();
    const usable = (m: WarmMic | null) => !!m && m.isLive && m.matches(deviceId, processing);
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
    const opening = WarmMic.open(deviceId, processing);
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
          if (res.data.jlptLevel) {
            setSelectedLevel(res.data.jlptLevel as 'N5' | 'N4' | 'N3');
          }

          stopAllAudio();

          let isResume = searchParams.get('resume') === 'true';
          const isRestart = searchParams.get('restart') === 'true';
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
            if (isRestart || searchParams.get('resume')) {
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete('restart');
                  next.delete('resume');
                  return next;
                },
                { replace: true },
              );
            }
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

  // Sync role if changed via URL query params (e.g. browser back/forward)
  useEffect(() => {
    const roleInUrl = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
    if (roleInUrl !== userRoleRef.current) {
      handleConfirmRoleChange(roleInUrl);
    }
  }, [searchParams]);

  // Handle changing Level from dropdown in header
  const handleLevelChange = (newLevel: 'N5' | 'N4' | 'N3') => {
    setSelectedLevel(newLevel);
    navigate(`/shadowing?level=${newLevel}`);
  };

  // Back button: returns to dialogue catalog (mở từ Khám phá thì về lại đúng chỗ đó trên bản đồ)
  const handleBackToDialogueList = () => {
    if (returnTo) navigate(returnTo, { replace: true });
    else navigate('/shadowing');
  };

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
  }, [isLearnerTurn, hasMicrophone, playbackActive, practiceState, selectedAudioInputDeviceId, micVoiceProcessing]);

  const toggleMicVoiceProcessing = () => {
    const next = !micVoiceProcessing;
    try {
      localStorage.setItem(MIC_VOICE_PROCESSING_STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // không lưu được: vẫn đổi trong phiên này
    }
    setMicVoiceProcessing(next);
    if (!isRecordingRef.current) closeWarmMic(); // mở lại với cấu hình mới
  };

  // Auto-scroll to latest sentence when dialogue progresses
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      utterance.rate = referenceRateRef.current;
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
      audio.playbackRate = referenceRateRef.current;
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
      audio.playbackRate = referenceRateRef.current;
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
      if (seq !== evaluationSeqRef.current) return;

      pendingTakeRef.current = {
        sentenceId: sentence.id,
        audioBlob,
        analysisWav,
        metrics,
        recognition: collector.snapshot(),
        capture: pcmWav ? 'pcm' : 'media-recorder',
        prerollMs: pcmWav ? pcmTake?.prerollMs ?? 0 : 0,
        submissionId: null,
      };
      setPendingAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(audioBlob);
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
            voiceProcessing: isMicVoiceProcessingEnabled(),
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
      const audioBlob = take.audioBlob;
      const metrics = take.metrics;
      discardPendingTake();
      applyBackendEvaluation(sentence, res.data, metrics, audioBlob);
    } finally {
      clearTimeout(timeout);
      isSubmittingRef.current = false;
    }
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
    setIsCompletedModalOpen(true);
    setHistorySaveState('idle');
    setHistorySaveMessage('');
    setServerSummary(null);
    setServerOverall(null);
    setRecommendation(null);

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
      shadowingService.getRecommendations(currentDialogue.id).then((rec) => {
        if (rec.success && rec.data) setRecommendation(rec.data);
      });
      setHistorySaveState('saved');
    } else {
      setHistorySaveState('failed');
      setHistorySaveMessage(completeRes.message || 'Chưa lưu được buổi luyện vào lịch sử.');
    }
  };

  // Role selection change
  const handleConfirmRoleChange = (newRole: 'A' | 'B') => {
    // 1. Dừng ngay lập tức toàn bộ audio, speech synthesis và timers đang chạy dở
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
    setIsRoleModalOpen(false);
    userRoleRef.current = newRole;
    setUserRole(newRole);
    setSearchParams({ level: selectedLevel, role: newRole, ...(returnTo ? { return: returnTo } : {}) });

    // 4. Reset toàn bộ tiến độ bài học về câu 0 & bắt đầu session mới
    setCurrentSentenceIndex(0);
    setSentenceResults(new Map());
    setSentenceAttemptsMap(new Map());
    setRecordedAudioUrls(new Map());
    setCurrentRecognizedText('');
    setMicError(null);
    setIsCompletedModalOpen(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper-100 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-line-strong border-t-ai rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-sumi">Đang chuẩn bị phòng luyện Shadowing...</p>
      </div>
    );
  }

  if (errorMessage || !dialogue) {
    return (
      <div className="min-h-screen bg-paper-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-paper-50 p-8 rounded-2xl border border-danger-soft text-center space-y-4 shadow-sm">
          <p className="text-danger font-bold">{errorMessage || 'Không tìm thấy bài học.'}</p>
          <button
            onClick={handleBackToDialogueList}
            className="bg-ai text-white px-5 py-2 rounded-full font-bold text-xs hover:bg-ai-hover cursor-pointer"
          >
            {returnTo ? 'Quay lại Khám phá' : 'Quay lại Thư viện Shadowing'}
          </button>
        </div>
      </div>
    );
  }

  const sentences = dialogue.sentences || [];
  const currentSentence: ShadowingSentenceItem | undefined = sentences[currentSentenceIndex];
  const remainingSentences = sentences.slice(currentSentenceIndex + 1);
  const hasNextLearnerSentence = remainingSentences.some((s) => s.speakerRole === userRole);


  // Helper names
  const opponentRole = userRole === 'A' ? 'B' : 'A';
  const opponentName = displayRoleName(userRole === 'A' ? dialogue.speakerRoleB_Name : dialogue.speakerRoleA_Name);
  const learnerName = displayRoleName(userRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name);


  // Summary results for celebration modal (trung bình các điểm do backend chấm; không áp lại công thức)
  const learnerSentences = sentences.filter(s => s.speakerRole === userRole);
  const totalLearnerSentencesCount = learnerSentences.length;

  const sessionSummary = summarizeSessionScores(learnerSentences.map(s => s.id), sentenceResults);
  // Có tổng kết của backend thì dùng số của backend (gồm cả các câu đã chấm trước khi tiếp tục phiên ở đây)
  const practicedSentencesCount = serverSummary?.evaluatedSentenceCount ?? sessionSummary.practicedSentences;
  const finalContentMatchScore = serverSummary?.contentAccuracy ?? sessionSummary.contentMatch;
  const finalWeightedScore = serverOverall ?? sessionSummary.overall;
  const finalGateStatus = sessionSummary.gateStatus;
  const finalGreenCount = sessionSummary.greenCount;
  const finalYellowCount = sessionSummary.yellowCount;
  const finalRedCount = sessionSummary.redCount;
  const hasScoredSentence = practicedSentencesCount > 0;

  // Render text directly without popup annotations (Bỏ qua popup từ vựng/ngữ pháp theo yêu cầu)
  // Câu tiếng Nhật kèm Furigana trên chữ Hán (khi bật và có dữ liệu khớp đúng chữ của câu)
  const renderAnnotatedSentenceText = (text: string, sentenceId?: number) => {
    const segments = showFurigana && sentenceId != null ? matchingFurigana(text, furiganaMap.get(sentenceId)) : null;
    if (!segments) return text;
    return segments.map((seg, i) =>
      seg.reading ? (
        <ruby key={i}>
          {seg.text}
          <rt className="text-[0.5em] font-medium opacity-80">{seg.reading}</rt>
        </ruby>
      ) : (
        <span key={i}>{seg.text}</span>
      ),
    );
  };

  return (
    <div
      data-theme={themeFor('room')}
      className="jx-room min-h-screen lg:h-screen lg:max-h-screen flex flex-col justify-between selection:bg-ai selection:text-white text-sumi font-sans lg:overflow-hidden"
    >
      {/* Styles for interactive tooltips & pulse animations */}
      <style>{`
        .annotation-term {
          position: relative;
          display: inline-block;
          cursor: pointer;
          border-bottom-width: 2px;
          border-bottom-style: dashed;
          padding: 0 2px;
          transition: all 0.15s ease-in-out;
        }
        .annotation-term-red {
          border-bottom-color: var(--danger);
        }
        .annotation-term-red:hover {
          background-color: var(--danger-soft);
        }
        .annotation-term-blue {
          border-bottom-color: var(--info);
        }
        .annotation-term-blue:hover {
          background-color: var(--info-soft);
        }
        .annotation-term .term-tooltip {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
          z-index: 60;
          pointer-events: none;
          min-width: 220px;
          max-width: 280px;
          width: max-content;
        }
        .annotation-term:hover .term-tooltip {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        /* Custom scrollbar for dialogue container */
        .dialogue-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .dialogue-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .dialogue-scroll-container::-webkit-scrollbar-thumb {
          background-color: var(--line);
          border-radius: 9999px;
        }
        .dialogue-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: var(--line-strong);
        }
      `}</style>

      {/* Thanh trên: logo, đường dẫn (kịch bản › bài), cấp độ của bài, cài đặt âm thanh */}
      <header className="jx-rm-bar">
        <Link to={returnTo ?? '/shadowing'} aria-label="JCAP, về thư viện Shadowing" className="flex-none">
          <JLogo size={28} withName={false} />
        </Link>
        <span className="jx-rm-div" aria-hidden="true" />
        <nav aria-label="Vị trí" className="jx-rm-crumb min-w-0">
          <button type="button" onClick={handleBackToDialogueList} title={dialogue.scenarioTitle}>
            {dialogue.scenarioTitle || 'Shadowing'}
          </button>
          <JIcon name="chevron_right" size={18} />
          <span className="jx-rm-title" aria-current="page" title={dialogue.title}>
            {dialogue.title}
          </span>
        </nav>
        <label className={`jx-rm-lv lv-${selectedLevel}`} title="Đổi cấp độ của bài">
          <select aria-label="Cấp độ của bài" value={selectedLevel} onChange={(e) => handleLevelChange(e.target.value as 'N5' | 'N4' | 'N3')}>
            <option value="N5">N5</option>
            <option value="N4">N4</option>
            <option value="N3">N3</option>
          </select>
          <JIcon name="expand_more" size={16} />
        </label>
        <div className="flex-auto" />
        <label className="jx-rm-lv" title="Tốc độ phát giọng mẫu">
          <select aria-label="Tốc độ giọng mẫu" value={referenceRate} onChange={(e) => changeReferenceRate(Number(e.target.value))}>
            {REFERENCE_RATES.map((r) => (
              <option key={r} value={r}>
                {r === 1 ? 'Tốc độ 1×' : `Chậm ${r}×`}
              </option>
            ))}
          </select>
          <JIcon name="expand_more" size={16} />
        </label>
        <JIconButton icon="tune" label="Cài đặt âm thanh" onClick={() => setIsAudioDeviceModalOpen(true)} />
      </header>

      {/* MAIN WORKSPACE CONTENT */}
      <main className="max-w-7xl w-full mx-auto py-3 px-4 sm:px-6 flex-1 flex flex-col min-h-0 lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start lg:h-full min-h-0 lg:overflow-hidden">
          {/* LEFT COLUMN: Context Panel (Hình 3) - Cố định vị trí, không cuộn theo đoạn chat */}
          <section className="lg:col-span-4 flex flex-col gap-4 lg:h-full lg:overflow-y-auto pr-1">
            <div className="rounded-[28px] p-5 border border-line bg-paper-50 relative overflow-hidden" style={{ boxShadow: '0 10px 30px rgba(15,37,56,.06)' }}>
              {/* Quay lại / Kết thúc */}
              <div className="flex items-center justify-between mb-4">
                <JButton variant="secondary" size="sm" icon="arrow_back" onClick={handleBackToDialogueList}>
                  Quay lại
                </JButton>
                <JButton variant="danger" size="sm" icon="stop_circle" onClick={handleFinishDialogue}>
                  Kết thúc
                </JButton>
              </div>

              {/* Ảnh bối cảnh + nhân vật đè góc */}
              <div className="relative pb-10">
                <div className="jx-scene" aria-hidden="true">
                  <span className="jx-cloud" style={{ left: 26, top: 40, width: 70 }} />
                  <span className="jx-cloud" style={{ right: 30, top: 92, width: 56 }} />
                  <span className="jx-ground" />
                  <span className="jx-win">
                    <JIcon name="forum" size={36} />
                  </span>
                </div>
                {dialogue.scenarioTitle && (
                  <span className="absolute right-3 top-3 max-w-[60%] truncate rounded-full bg-paper-50 px-3 py-1 text-xs font-bold text-ai shadow-jc-sm">
                    {dialogue.scenarioTitle}
                  </span>
                )}
                <div className="absolute bottom-0 left-3.5 flex items-end gap-3">
                  <span className="relative inline-flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full border-4 border-paper-50 bg-paper-200 shadow-jc-md">
                    <DefaultAvatarImage alt={opponentName} className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-paper-50 bg-success" title="AI đang sẵn sàng" />
                  </span>
                  <span className="pb-1.5 text-xl font-bold leading-[26px]">{opponentName}</span>
                </div>
              </div>

              {/* Vai của người học + Đổi vai */}
              <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-line bg-paper-100 py-2.5 pl-4 pr-2.5">
                <span className="flex-auto text-sm leading-5">
                  <span className="text-sumi-muted">Vai của bạn: </span>
                  <strong>{learnerName}</strong>
                </span>
                <JButton
                  variant="secondary"
                  size="sm"
                  icon="swap_horiz"
                  onClick={() => {
                    stopAllAudio();
                    setIsRoleModalOpen(true);
                  }}
                >
                  Đổi vai
                </JButton>
              </div>

              <div className="h-px bg-line my-4"></div>

              {/* Situation ("Tình huống") */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-sumi font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsSituationCollapsed(!isSituationCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Tình huống</span>
                  <button
                    type="button"
                    aria-label={isSituationCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    className="w-6 h-6 rounded-full bg-paper-100 hover:bg-ai-soft border border-line text-sumi-muted flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isSituationCollapsed ? (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </div>

                {!isSituationCollapsed && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs leading-relaxed text-sumi-muted text-justify">
                      {dialogue.scenarioDescription ||
                        'Bạn là tân học sinh. Chị khóa trên Ran phụ trách Club Day gọi điện báo về Ngày giới thiệu câu lạc bộ. Hãy hỏi lịch trình, địa điểm nhận đơn, và cách đăng ký câu lạc bộ âm nhạc.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="h-px bg-paper-200 my-3"></div>

              {/* NỘI DUNG BÀI HỌC (3 Buttons: Toàn bộ hội thoại, Từ vựng, Ngữ pháp) */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-sumi font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsDialogueContentCollapsed(!isDialogueContentCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Nội dung bài học</span>
                  <button
                    type="button"
                    aria-label={isDialogueContentCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    className="w-6 h-6 rounded-full bg-paper-100 hover:bg-ai-soft border border-line text-sumi-muted flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isDialogueContentCollapsed ? (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </div>

                {!isDialogueContentCollapsed && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsFullScriptModalOpen(true)}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-paper-50 hover:bg-ai-soft border border-line-strong text-sumi hover:text-ai text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Toàn bộ hội thoại
                    </button>
                    <button
                      type="button"
                      onClick={() => {}}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-paper-50 hover:bg-ai-soft border border-line-strong text-sumi hover:text-ai text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Từ vựng
                    </button>
                    <button
                      type="button"
                      onClick={() => {}}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-paper-50 hover:bg-ai-soft border border-line-strong text-sumi hover:text-ai text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Ngữ pháp
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Dialogue Stream & Mic Console */}
          <section className="lg:col-span-8 flex flex-col justify-between lg:h-full min-h-0 lg:overflow-hidden gap-2">
            {/* Dialogue Stream - CHỈ PHẦN NÀY ĐƯỢC CUỘN */}
            <div className="dialogue-scroll-container flex-1 overflow-y-auto min-h-0 pr-2 space-y-4 pb-2">
              {sentences.slice(0, currentSentenceIndex + 1).map((s, idx) => {
                const isOpponent = s.speakerRole !== userRole;
                const isCurrentActive = idx === currentSentenceIndex;
                const hasRecordedAudio = recordedAudioUrls.has(s.id);

                if (isOpponent) {
                  // Opponent speech bubble (Ran / Yui)
                  return (
                    <div key={s.id} className="flex items-start gap-3 w-full max-w-xl">
                      <div className="w-10 h-10 rounded-full border-2 border-paper-50 shadow-sm bg-ai-soft overflow-hidden flex-shrink-0 mt-0.5">
                        <DefaultAvatarImage alt={opponentName} className="w-full h-full object-cover" />
                      </div>

                      <div className="flex flex-col items-start min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 ml-1">
                          <span className="font-bold text-xs text-sumi">{opponentName}</span>
                        </div>

                        <div className="bg-paper-50 rounded-[20px] p-4 shadow-xs border border-line max-w-full">
                          <p className="text-base text-sumi font-medium leading-relaxed">
                            {renderAnnotatedSentenceText(s.japaneseText, s.id)}
                          </p>

                          {isTranslationShown(s.id) && (
                            <div className="mt-2 pt-2 border-t border-line text-xs text-sumi-muted italic">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>

                        {/* Nút hành động nằm NGOÀI bong bóng, góc dưới phía avatar (bên trái) */}
                        <div className="flex items-center justify-start gap-1.5 mt-1.5 ml-1">
                          <button
                            type="button"
                            onClick={() => toggleTranslation(s.id)}
                            className="bg-paper-50 hover:bg-paper-200 text-sumi-muted border border-line text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                          >
                            <span>文A</span> Dịch
                          </button>
                          <button
                            type="button"
                            onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                            disabled={loadingAudioSentenceId === s.id}
                            className="bg-paper-50 hover:bg-paper-200 text-sumi-muted border border-line text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                          >
                            {loadingAudioSentenceId === s.id ? (
                              <>
                                <span className="w-2.5 h-2.5 border-2 border-ai border-t-transparent rounded-full animate-spin"></span>
                                <span>Đang nạp...</span>
                              </>
                            ) : (
                              <>
                                <span>🔊</span> Nghe mẫu
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Learner Bubble (MATCHES REFERENCE IMAGE 2 EXACTLY FOR BOTH ACTIVE & COMPLETED TURNS)
                  return (
                    <div key={s.id} className="flex flex-col items-end w-full">
                      {/* Top Header: Yuuri / Learner Name */}
                      <div className="flex items-center gap-2 mb-1.5 text-xs pr-10">
                        <span className="font-bold text-sumi">{learnerName}</span>
                        {(() => {
                          // Trạng thái câu: chưa gửi / đang chấm / chưa chấm được (đã chấm thì hiện điểm bên dưới)
                          const entry = sentenceStates.get(s.id);
                          if (entry?.state === 'RECORDED') return <JBadge tone="warning" dot>Chưa gửi</JBadge>;
                          if (entry?.state === 'EVALUATING') return <JBadge tone="info" dot>Đang chấm</JBadge>;
                          if (entry?.state === 'RECORDING') return <JBadge tone="ai" dot>Đang ghi</JBadge>;
                          if (entry?.state === 'EVALUATION_FAILED' && !(isCurrentActive && practiceState === 'evaluated'))
                            return <JBadge tone="danger" dot>Chưa chấm được</JBadge>;
                          return null;
                        })()}
                        {(() => {
                          const sentenceResult = sentenceResults.get(s.id);
                          // Tiếp tục phiên (tải lại trang, máy khác): điểm cao nhất của câu đã lưu ở server
                          const serverBest = serverProgress?.sentences.find((x) => x.sentenceId === s.id)?.bestScore ?? null;
                          const activeScore = (isCurrentActive && practiceState === 'evaluated')
                            ? currentScore
                            : (sentenceResult ? (sentenceResult.overallScore ?? sentenceResult.accuracyScore) : serverBest);

                          if (activeScore === null || activeScore === undefined) return null;

                          return (
                            <span className={`font-bold text-[11px] px-2.5 py-0.5 rounded-full border transition-all duration-300 ${
                              activeScore >= 80
                                ? 'bg-success-soft text-success border-success'
                                : activeScore >= 65
                                ? 'bg-warning-soft text-warning border-warning-soft'
                                : 'bg-danger-soft text-danger border-danger-soft'
                            }`}>
                              {activeScore}%
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex items-start gap-2.5 justify-end w-full max-w-xl">
                        {/* Dark Navy Bubble */}
                        <div className={`jx-me-bubble rounded-[22px] p-4 sm:p-5 text-white shadow-md flex flex-col justify-between min-w-0 max-w-full bg-sumi transition-all ${
                          isCurrentActive && practiceState === 'listening' ? 'ring-2 ring-cyan-400 shadow-cyan-500/20' : ''
                        }`}>
                          {/* Japanese Text */}
                          <p className="text-lg sm:text-xl font-bold tracking-wide text-white leading-relaxed my-1 text-left">
                            {renderAnnotatedSentenceText(s.japaneseText, s.id)}
                          </p>

                          {/* Vietnamese Translation (if toggled) */}
                          {isTranslationShown(s.id) && (
                            <div className="pt-2 mt-2 text-xs sm:text-sm text-on-ai italic border-t border-sumi text-left">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>

                        {/* Circular Avatar */}
                        <div className="w-8 h-8 rounded-full border border-line overflow-hidden flex-shrink-0 shadow-xs mt-1">
                          <DefaultAvatarImage alt={learnerName} className="w-full h-full object-cover" />
                        </div>
                      </div>

                      {/* Nút hành động nằm NGOÀI bong bóng, góc dưới bên phải (phía avatar) */}
                      <div className="flex items-center justify-end gap-1.5 mt-1.5 w-full max-w-xl pr-10">
                        {/* 1. Mic: ghi âm / nghe lại giọng của bạn */}
                        <button
                          type="button"
                          onClick={() => {
                            if (hasRecordedAudio) {
                              playUserRecording(s.id);
                            } else {
                              startRecording();
                            }
                          }}
                          className="h-7 w-8 sm:w-9 rounded-full bg-paper-50 hover:bg-ai-soft text-ai border border-line-strong flex items-center justify-center transition-all shadow-2xs cursor-pointer"
                          title={hasRecordedAudio ? "Nghe lại giọng ghi âm của bạn" : "Bấm để ghi âm câu này"}
                        >
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                          </svg>
                        </button>

                        {/* 2. Nghe mẫu */}
                        <button
                          type="button"
                          onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                          disabled={loadingAudioSentenceId === s.id}
                          className="h-7 px-3.5 rounded-full bg-paper-50 hover:bg-ai-soft text-sumi border border-line font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:opacity-60"
                          title="Nghe phát âm chuẩn câu này"
                        >
                          {loadingAudioSentenceId === s.id ? (
                            <>
                              <span className="w-2.5 h-2.5 border-2 border-ai border-t-transparent rounded-full animate-spin"></span>
                              <span>Đang nạp...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-ai fill-current" viewBox="0 0 24 24">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                              </svg>
                              <span>Nghe mẫu</span>
                            </>
                          )}
                        </button>

                        {/* 3. 文A Dịch */}
                        <button
                          type="button"
                          onClick={() => toggleTranslation(s.id)}
                          className="h-7 px-3 rounded-full bg-paper-50 hover:bg-ai-soft text-sumi-muted border border-line text-xs font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                          title="Xem bản dịch tiếng Việt"
                        >
                          <span>文A Dịch</span>
                        </button>
                      </div>
                    </div>
                  );
                }
              })}
              {/* Anchor for auto-scrolling */}
              <div ref={chatEndRef} />
            </div>

            {/* ACTION CONSOLE (Recording & Evaluation) (Hình 4) - Cố định vị trí ở đáy */}
            <div className="w-full flex-shrink-0 pt-2 pb-1 z-10">
              <div
                className="w-full rounded-[24px] border-2 border-dashed bg-paper-50 backdrop-blur-xs py-3.5 px-6 flex flex-col items-center justify-center shadow-xs transition-all"
                style={{ borderColor: 'rgb(147, 197, 253)' }}
              >
                {micError && (
                  <div className="w-full mb-3 p-2 bg-danger-soft border border-danger-soft rounded-xl text-danger text-xs flex items-center justify-between">
                    <span>⚠️ {micError}</span>
                    <button onClick={() => setMicError(null)} className="font-bold text-danger">×</button>
                  </div>
                )}
                {micNotice && (
                  <div role="status" className="w-full mb-3 p-2 bg-warning-soft rounded-xl text-warning text-xs flex items-center justify-between gap-2">
                    <span>{micNotice}</span>
                    <button onClick={() => setMicNotice(null)} aria-label="Đóng thông báo" className="font-bold text-warning">×</button>
                  </div>
                )}
                {progressSyncError && (
                  <div role="status" className="w-full mb-3 p-2 bg-warning-soft rounded-xl text-warning text-xs flex items-center justify-between gap-2">
                    <span>{progressSyncError}</span>
                    <button onClick={() => setProgressSyncError(null)} aria-label="Đóng thông báo" className="font-bold text-warning">×</button>
                  </div>
                )}

                {/* CHỈ THU ÂM CÂU CỦA NGƯỜI HỌC (userRole) - KHÔNG THU ÂM CÂU CỦA ĐỐI PHƯƠNG */}
                {currentSentence?.speakerRole !== userRole ? (
                  isOpponentPausedForResume ? (
                    <div className="w-full flex flex-col items-center justify-center py-2 px-4 gap-2.5 animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-ai-soft border border-line-strong overflow-hidden flex items-center justify-center font-bold text-base shadow-sm">
                          <DefaultAvatarImage alt={opponentName} className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-sumi">{opponentName} (Đối phương)</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning-soft text-warning border border-warning-soft">
                              Tạm dừng (Tiếp tục học)
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-sumi font-jp mt-0.5 line-clamp-1">
                            "{currentSentence?.japaneseText}"
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 my-1">
                        <button
                          type="button"
                          onClick={handlePlayResumedOpponentSentence}
                          className="text-xs font-bold text-white bg-ai hover:bg-ai-hover px-5 py-2 rounded-full transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <span>Nghe câu đối thoại</span>
                        </button>
                        {hasNextLearnerSentence && (
                          <button
                            type="button"
                            onClick={handleSkipOpponentSpeech}
                            className="text-xs font-bold text-sumi bg-paper-100 hover:bg-paper-200 px-4 py-2 rounded-full transition-all cursor-pointer"
                          >
                            <span>Sang lượt nói của bạn</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-sumi-muted">
                        {hasNextLearnerSentence
                          ? '* Bấm để nghe câu thoại mẫu của đối phương trước khi chuyển sang lượt nói của bạn.'
                          : '* Bấm để nghe câu đối thoại kết thúc của đối phương.'}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col items-center justify-center py-2 px-4 gap-2.5 animate-in fade-in">
                      {/* Audio wave indicator */}
                      <div className="flex items-center gap-1 my-0.5">
                        <span className="w-1 h-2.5 bg-ai rounded-full animate-bounce"></span>
                        <span className="w-1 h-4 bg-ai rounded-full animate-bounce [animation-delay:0.1s]"></span>
                        <span className="w-1 h-5 bg-ai rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1 h-3.5 bg-ai rounded-full animate-bounce [animation-delay:0.3s]"></span>
                        <span className="w-1 h-2 bg-ai rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                      {hasNextLearnerSentence && (
                        <button
                          onClick={handleSkipOpponentSpeech}
                          className="text-xs font-bold text-white bg-ai hover:bg-ai-hover px-5 py-1.5 rounded-full transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <span>Sang lượt nói của bạn</span>
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <>
                    {/* LƯỢT CỦA BẠN - State 1: Ready to record (Ảnh 1: Chỉ hiển thị nút ghi âm) */}
                    {practiceState === 'ready' && (
                      <div className="flex flex-col items-center justify-center w-full py-1 gap-1.5">
                        {hasMicrophone === false && (
                          <p role="status" className="text-xs text-warning bg-warning-soft rounded-xl px-3 py-1.5 text-center">
                            {describeDeviceStatus('audioinput', 'NOT_FOUND')}
                          </p>
                        )}
                        <button
                          onClick={startRecording}
                          disabled={hasMicrophone === false}
                          className="group bg-gradient-to-r from-ai to-ai-hover hover:from-ai-hover hover:to-sumi text-white w-14 h-14 rounded-full font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                          title={
                            hasMicrophone === false
                              ? describeDeviceStatus('audioinput', 'NOT_FOUND')
                              : 'Bấm để ghi âm câu thoại của bạn'
                          }
                        >
                          {/* Refined minimalist mic icon */}
                          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* LƯỢT CỦA BẠN - State 2: Listening (Đang ghi âm câu thoại) */}
                    {practiceState === 'listening' && (
                      <div className="flex items-center justify-center w-full py-1">
                        <RecordingBar onCancel={cancelRecording} onStop={finishRecording} />
                      </div>
                    )}

                    {/* LƯỢT CỦA BẠN - Đã thu, chưa gửi: nghe lại / thu lại / bỏ / gửi chấm */}
                    {practiceState === 'recorded' && (
                      <RecordingReviewBar
                        isPlaying={playingUserAudioSentenceId === -1}
                        onPlay={() => {
                          if (playingUserAudioSentenceId === -1) {
                            userAudioPlayerRef.current?.pause();
                            setPlayingUserAudioSentenceId(null);
                          } else {
                            playPendingTake();
                          }
                        }}
                        onReRecord={startRecording}
                        onSubmit={submitPendingTake}
                        onDiscard={discardRecordedTake}
                        error={submitError}
                      />
                    )}

                    {/* LƯỢT CỦA BẠN - State B: Analyzing / Processing (Đang phân tích bản ghi) */}
                    {practiceState === 'analyzing' && (
                      <div className="w-full flex items-center justify-center gap-3 py-6 bg-paper-50 rounded-2xl border border-line shadow-2xs text-sumi font-bold text-sm animate-pulse">
                        <div className="w-5 h-5 border-2 border-ai border-t-transparent rounded-full animate-spin"></div>
                        <span>Đang phân tích bản ghi âm...</span>
                      </div>
                    )}

                    {/* LƯỢT CỦA BẠN - State 3: Evaluated (State C & State D chuẩn SaaS EdTech) */}
                    {practiceState === 'evaluated' && currentSentence && (
                      <ShadowingSentenceResultCard
                        targetText={currentSentence.japaneseText}
                        spokenText={currentRecognizedText}
                        overallScore={currentScore}
                        fluencyMetrics={currentFluencyMetrics}
                        gateDetail={currentGateDetail}
                        diffTokens={currentDiffTokens}
                        attemptsCount={sentenceAttemptsMap.get(currentSentence.id) || 1}
                        hasRecording={recordedAudioUrls.has(currentSentence.id)}
                        isPlayingUserAudio={playingUserAudioSentenceId === currentSentence.id}
                        evaluationStatus={currentEvaluationStatus}
                        recognitionSource={currentRecognitionSource}
                        dimensions={currentDimensions}
                        overallScoreBasis={currentScoreBasis}
                        onPlayUserAudio={() => playUserRecording(currentSentence.id)}
                        onRetry={handleRetryCurrentSentence}
                        onNext={handleNextSentence}
                      />
                    )}

                    {/* Chỉ chế độ phát triển: tải bản ghi để đo nhận dạng bằng giọng thật, bật/tắt khử nhiễu */}
                    {import.meta.env.DEV && (practiceState === 'ready' || practiceState === 'evaluated') && (
                      <RecordingDevTools
                        take={devTake && devTake.sentenceId === currentSentence?.id ? devTake : null}
                        voiceProcessing={micVoiceProcessing}
                        onToggleVoiceProcessing={toggleMicVoiceProcessing}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* MODAL 1: FullScriptModal (Xem kịch bản toàn bộ) */}
      {isFullScriptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color-mix(in_srgb,var(--sumi)_50%,transparent)] backdrop-blur-xs transition-all duration-200"
          onClick={() => setIsFullScriptModalOpen(false)}
        >
          <div
            className="bg-paper-50 rounded-[28px] max-w-2xl w-full max-h-[88vh] shadow-2xl border border-line flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-line bg-paper-100 flex items-center justify-between">
              <h3 className="font-extrabold text-sumi text-lg">
                Toàn bộ kịch bản hội thoại
              </h3>
              <button
                onClick={() => setIsFullScriptModalOpen(false)}
                className="w-8 h-8 rounded-full bg-paper-50 hover:bg-danger-soft text-sumi-muted hover:text-danger border border-line flex items-center justify-center font-bold text-sm transition-colors shadow-2xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm bg-paper-50">
              <div className="space-y-3.5">
                {sentences.map(s => (
                  <div
                    key={s.id}
                    className={`flex items-start gap-2.5 ${s.speakerRole === userRole ? 'justify-end' : 'justify-start'}`}
                  >
                    {s.speakerRole !== userRole && (
                      <div className="w-8 h-8 rounded-full bg-ai-soft overflow-hidden flex-shrink-0 mt-1">
                        <DefaultAvatarImage alt="Opponent" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className={`flex flex-col max-w-[80%] ${s.speakerRole === userRole ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <button
                          onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText)}
                          className="bg-paper-50 hover:bg-ai-soft text-ai border border-line-strong text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <span>🔊</span> Nghe
                        </button>
                        <span className="text-[10px] text-sumi-muted">Câu #{s.orderIndex}</span>
                        <span className="font-bold text-xs text-sumi">
                          {displayRoleName(s.speakerRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name)}
                        </span>
                      </div>

                      <div
                        className={`p-3 rounded-2xl border text-sm ${
                          s.speakerRole === userRole
                            ? 'bg-ai-soft border-line-strong text-right'
                            : 'bg-paper-100 border-line text-left'
                        }`}
                      >
                        <p className="font-semibold text-sumi leading-relaxed">{s.japaneseText}</p>
                        <p className="text-xs text-sumi-muted mt-1 italic">"{s.vietnameseTranslation}"</p>
                      </div>
                    </div>

                    {s.speakerRole === userRole && (
                      <div className="w-8 h-8 rounded-full border border-line overflow-hidden flex-shrink-0 mt-1">
                        <DefaultAvatarImage alt="Learner" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-line bg-paper-100 flex justify-end">
              <button
                onClick={() => setIsFullScriptModalOpen(false)}
                className="px-6 py-2 rounded-full bg-ai text-white text-xs font-bold hover:bg-ai-hover cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Tổng kết buổi luyện (chỉ số liệu thật do backend chấm) */}
      {isCompletedModalOpen && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--sumi)_50%,transparent)] backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="completed-modal-title" className="bg-paper-50 rounded-[28px] max-w-3xl w-full shadow-2xl border border-line max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Nội dung cuộn (trục cuộn duy nhất của modal) */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
              {/* 1. Tiêu đề: chỉ chúc mừng khi thật sự có câu được chấm */}
              <div className="text-center">
                <h3 id="completed-modal-title" className="text-xl sm:text-2xl font-black text-sumi tracking-tight">
                  {hasScoredSentence ? 'Hoàn thành bài luyện!' : 'Buổi luyện đã kết thúc'}
                </h3>
                <p className="text-sm text-sumi-muted font-medium mt-1">
                  {dialogue.title} · JLPT {dialogue.jlptLevel} · Vai {userRole} ({learnerName})
                </p>
                <div role="status" className="min-h-[18px] mt-1">
                  {historySaveState === 'saving' && (
                    <p className="text-xs text-sumi-muted">Đang lưu buổi luyện vào lịch sử...</p>
                  )}
                  {historySaveState === 'saved' && (
                    <p className="text-xs text-success font-semibold">Đã lưu buổi luyện vào lịch sử.</p>
                  )}
                  {historySaveState === 'failed' && (
                    <p className="text-xs text-danger font-semibold">{historySaveMessage}</p>
                  )}
                </div>
              </div>

              {/* 2. Tổng kết: số liệu thật từ kết quả backend đã chấm */}
              {hasScoredSentence ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`col-span-2 sm:col-span-1 rounded-2xl p-4 flex flex-col items-center justify-center text-white ${
                    finalWeightedScore >= 80
                      ? 'bg-gradient-to-br from-ai to-ai-hover'
                      : finalWeightedScore >= 65
                      ? 'bg-gradient-to-br from-score-mid to-score-mid'
                      : 'bg-gradient-to-br from-score-low to-score-low'
                  }`}>
                    <span className="text-4xl font-black leading-none">{finalWeightedScore}</span>
                    <span className="text-[11px] font-bold opacity-90 mt-1">/ 100 điểm</span>
                    <span className="text-xs font-bold mt-2 text-center">{sessionRankTitle(finalWeightedScore)}</span>
                  </div>

                  <div className="rounded-2xl border border-line bg-paper-100 p-4">
                    <p className="text-xs font-semibold text-sumi-muted">Câu đã chấm</p>
                    <p className="text-2xl font-black text-sumi mt-1">
                      {practicedSentencesCount}<span className="text-base text-sumi-faint font-bold">/{totalLearnerSentencesCount}</span>
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs text-sumi-muted">
                      <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-score-good" aria-hidden="true" />{finalGreenCount} khớp tốt</li>
                      <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />{finalYellowCount} khớp một phần</li>
                      <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-score-low" aria-hidden="true" />{finalRedCount} cần luyện lại</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-line bg-paper-100 p-4">
                    <p className="text-xs font-semibold text-sumi-muted">Độ khớp nội dung</p>
                    <p className="text-2xl font-black text-ai mt-1">{finalContentMatchScore}%</p>
                    <div className="w-full bg-paper-200 h-1.5 rounded-full overflow-hidden mt-3" aria-hidden="true">
                      <div className="bg-ai h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, finalContentMatchScore))}%` }} />
                    </div>
                    <p className="text-[11px] text-sumi-faint mt-2 leading-snug">Tính trên tất cả câu của vai bạn, câu chưa chấm tính 0.</p>
                  </div>

                  <div className="rounded-2xl border border-line bg-paper-100 p-4">
                    <p className="text-xs font-semibold text-sumi-muted">Thời gian luyện</p>
                    <p className="text-2xl font-black text-sumi mt-1">
                      {Math.floor(sessionDurationSeconds / 60)}:{String(sessionDurationSeconds % 60).padStart(2, '0')}
                    </p>
                    <p className="text-[11px] text-sumi-faint mt-2">phút : giây</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line-strong bg-paper-100 p-5 text-center">
                  <p className="font-bold text-sumi">Chưa có câu nào được chấm điểm</p>
                  <p className="text-sm text-sumi-muted mt-1">
                    Bấm <strong>Luyện lại bài này</strong>, ghi âm từng câu của vai bạn rồi gửi để nhận điểm và lưu vào lịch sử.
                  </p>
                </div>
              )}

              {serverSummary && (
                <SessionSummaryPanel
                  summary={serverSummary}
                  recommendation={recommendation}
                  onOpenDialogue={(dialogueId) => navigate(`/shadowing/${dialogueId}`)}
                />
              )}

              {finalGateStatus === 'needs_retry' && (
                <div className="flex items-start gap-2 rounded-xl border border-warning-soft bg-warning-soft p-3 text-xs text-warning">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Tín hiệu micro hơi nhỏ hoặc có tạp âm ở một số câu. Dùng tai nghe có micro sẽ cho kết quả ổn định hơn.</span>
                </div>
              )}

              {/* 3. Chi tiết từng câu của vai người học */}
              <section aria-labelledby="completed-sentences-title" className="space-y-3">
                <h4 id="completed-sentences-title" className="font-bold text-sumi text-sm">Chi tiết từng câu</h4>

                <ol className="space-y-3">
                  {learnerSentences.map((s, index) => {
                    const res = sentenceResults.get(s.id);
                    // Điểm và tier do backend tính; không tái tạo ở client.
                    const tier = res?.evaluationTier;
                    const hasUserRecording = recordedAudioUrls.has(s.id);
                    const isPlayingUser = playingUserAudioSentenceId === s.id;
                    const isPlayingNative = isPlayingAudio && loadingAudioSentenceId === s.id;
                    const attempts = res?.attemptsCount ?? sentenceAttemptsMap.get(s.id) ?? 0;

                    return (
                      <li key={s.id} className="p-4 rounded-xl bg-paper-50 border border-line space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-sumi-muted">Câu {index + 1}/{totalLearnerSentencesCount}</span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                                !res
                                  ? 'bg-paper-100 text-sumi-muted border-line'
                                  : tier === 'green'
                                  ? 'bg-score-good-soft text-score-good border-score-good-soft'
                                  : tier === 'yellow'
                                  ? 'bg-warning-soft text-warning border-warning-soft'
                                  : 'bg-score-low-soft text-score-low border-score-low-soft'
                              }`}
                            >
                              {res ? `${res.overallScore} điểm` : 'Chưa chấm'}
                            </span>
                            {attempts > 1 && <span className="text-xs text-sumi-faint">thử {attempts} lần</span>}
                          </div>

                          <div className="flex items-center gap-2">
                            {hasUserRecording && (
                              <button
                                type="button"
                                onClick={() => playUserRecording(s.id)}
                                className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  isPlayingUser
                                    ? 'bg-ai text-white'
                                    : 'bg-ai-soft hover:bg-ai-soft text-ai border border-line-strong'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                                </svg>
                                <span>{isPlayingUser ? 'Đang phát...' : 'Nghe bạn'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                              className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                isPlayingNative
                                  ? 'bg-sumi text-white'
                                  : 'bg-paper-50 hover:bg-paper-100 text-sumi border border-line'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                              <span>{isPlayingNative ? 'Đang phát...' : 'Nghe mẫu'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="bg-paper-100 p-3 rounded-lg border border-line">
                          <JapaneseSentenceDiffView
                            diffTokens={res?.diffTokens}
                            targetText={s.japaneseText}
                            spokenText={res?.recognizedText}
                            size="sm"
                          />
                        </div>

                        <div className="space-y-0.5 text-xs">
                          {s.romajiText && <p className="text-sumi-faint font-mono">{s.romajiText}</p>}
                          {s.vietnameseTranslation && <p className="text-sumi-muted">{s.vietnameseTranslation}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>

          {/* Sticky / Pinned Footer Bar (Luôn hiển thị cố định ở chân modal) */}
          <div className="p-4 sm:px-7 bg-paper-50 backdrop-blur-md border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  handleConfirmRoleChange(userRoleRef.current);
                }}
                className="flex-1 sm:flex-initial text-xs font-bold text-sumi-muted hover:text-sumi bg-paper-100 hover:bg-ai-soft border border-line px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Luyện lại bài này
              </button>
              <button
                onClick={() => {
                  stopAllAudio();
                  setIsCompletedModalOpen(false);
                  setIsRoleModalOpen(true);
                }}
                className="flex-1 sm:flex-initial text-xs font-bold text-ai bg-ai-soft hover:bg-ai-soft border border-line-strong px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Đổi sang vai ({opponentRole})
              </button>
            </div>
            <button
              onClick={handleBackToDialogueList}
              className="w-full sm:w-auto text-xs font-extrabold text-white bg-ai hover:bg-ai-hover px-6 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    )}

      <RoleSelectionModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        dialogueId={dialogue.id}
        dialogueTitle={dialogue.title}
        roleAName={displayRoleName(dialogue.speakerRoleA_Name)}
        roleBName={displayRoleName(dialogue.speakerRoleB_Name)}
        onConfirm={handleConfirmRoleChange}
      />

      {/* 1. Modal Cài đặt thiết bị âm thanh (Microphone & Loa) */}
      <AudioDeviceSettingsModal
        isOpen={isAudioDeviceModalOpen}
        onClose={() => setIsAudioDeviceModalOpen(false)}
        selectedInputId={selectedAudioInputDeviceId}
        selectedOutputId={selectedAudioOutputDeviceId}
        onSave={(inId, outId) => {
          setSelectedAudioInputDeviceId(inId);
          setSelectedAudioOutputDeviceId(outId);
        }}
      />
    </div>
  );
};

