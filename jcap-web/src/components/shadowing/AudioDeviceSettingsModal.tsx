import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button, Icon, ProgressBar, Select } from '../jcap';
import {
  INPUT_DEVICE_STORAGE_KEY,
  OUTPUT_DEVICE_STORAGE_KEY,
  acquireMicStream,
  describeMicError,
  filterSelectableDevices,
  isPermissionDeniedError,
  resolveDeviceSelection,
} from '../../utils/audioDevice';
import { GOOD_VOICE_RMS, MIN_VOICE_RMS, assessMicLevel, rmsToMeterPercent, type MicTestLevel } from '../../utils/audioGate';

export interface AudioDeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInputId: string;
  selectedOutputId: string;
  onSave: (inputId: string, outputId: string) => void;
}

/** Quyền micro: unknown = chưa hỏi, granted = đã có tên thiết bị, denied = bị chặn, no-device = không có micro, error = lỗi khác. */
type MicAccess = 'unknown' | 'granted' | 'denied' | 'no-device' | 'error';

/** Cửa sổ RMS dùng để đánh giá mức giọng khi thử mic (~3 giây ở 60 khung/giây), cùng cách tính với cổng kiểm định. */
const LEVEL_WINDOW_FRAMES = 180;
const MIN_FRAMES_FOR_VERDICT = 20;

const LEVEL_VIEW: Record<MicTestLevel, { label: string; hint: string; tone: 'ai' | 'success' | 'warning' | 'danger'; icon: string }> = {
  silent: { label: 'Chưa nghe thấy tiếng', hint: 'Hãy nói thử một câu. Nếu thanh không nhúc nhích, kiểm tra đã chọn đúng micro chưa.', tone: 'ai', icon: 'hearing' },
  too_quiet: { label: 'Quá nhỏ', hint: 'Bản thu ở mức này sẽ bị yêu cầu thu lại. Hãy nói gần micro hơn hoặc tăng mức vào của micro.', tone: 'danger', icon: 'volume_mute' },
  ok: { label: 'Vừa đủ', hint: 'Dùng được, nhưng nói to hơn một chút sẽ cho kết quả chấm ổn định hơn.', tone: 'warning', icon: 'volume_down' },
  good: { label: 'Tốt', hint: 'Âm lượng micro phù hợp để luyện tập.', tone: 'success', icon: 'volume_up' },
};

const ACCESS_NOTICE: Record<Exclude<MicAccess, 'unknown' | 'granted'>, { title: string; body: string }> = {
  denied: {
    title: 'Trình duyệt đang chặn micro',
    body: 'Hãy cho phép micro cho trang này (biểu tượng ổ khóa cạnh địa chỉ) rồi bấm làm mới để thấy tên các thiết bị.',
  },
  'no-device': {
    title: 'Không tìm thấy micro nào',
    body: 'Hãy cắm micro hoặc tai nghe vào máy. Danh sách sẽ tự cập nhật khi có thiết bị mới.',
  },
  error: {
    title: 'Chưa mở được micro',
    body: 'Micro có thể đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi bấm làm mới.',
  },
};

const canChooseOutputDevice = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

export const AudioDeviceSettingsModal: React.FC<AudioDeviceSettingsModalProps> = ({
  isOpen,
  onClose,
  selectedInputId,
  selectedOutputId,
  onSave,
}) => {
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentInputId, setCurrentInputId] = useState<string>(selectedInputId || '');
  const [currentOutputId, setCurrentOutputId] = useState<string>(selectedOutputId || '');
  const [micAccess, setMicAccess] = useState<MicAccess>('unknown');
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);
  // Thông báo khi thiết bị đã lưu không còn kết nối và đã chuyển sang thiết bị mặc định
  const [inputNotice, setInputNotice] = useState<string>('');
  const [outputNotice, setOutputNotice] = useState<string>('');

  // Giá trị mới nhất cho các callback bất đồng bộ (tránh đọc state cũ trong closure)
  const currentInputRef = useRef(currentInputId);
  const currentOutputRef = useRef(currentOutputId);
  const loadSeqRef = useRef(0);
  const setInputId = (id: string) => {
    currentInputRef.current = id;
    setCurrentInputId(id);
  };
  const setOutputId = (id: string) => {
    currentOutputRef.current = id;
    setCurrentOutputId(id);
  };

  // Mic test state
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micMeter, setMicMeter] = useState<{ percent: number; level: MicTestLevel | null }>({ percent: 0, level: null });
  const [micTestError, setMicTestError] = useState<string>('');
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const micTestSeqRef = useRef(0);

  // Speaker test state
  const [isTestingSpeaker, setIsTestingSpeaker] = useState<boolean>(false);
  const outputSelectable = canChooseOutputDevice();

  // Stop Mic Test (đồng thời huỷ lần thử đang chờ getUserMedia để không rò rỉ luồng)
  const stopMicTest = useCallback(() => {
    micTestSeqRef.current++;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicMeter({ percent: 0, level: null });
  }, []);

  /**
   * Nạp danh sách thiết bị rồi đối chiếu lựa chọn với danh sách thật: id đã lưu không còn thì chuyển sang thiết bị mặc định
   * và báo cho người học, để hộp chọn luôn hiển thị đúng thiết bị sẽ được lưu/sử dụng.
   */
  const loadDevices = useCallback(
    async (requestPermission: boolean, preferInput: string, preferOutput: string) => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const seq = ++loadSeqRef.current;

      setIsLoadingDevices(true);
      try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        const hasLabels = devices.some((d) => (d.kind === 'audioinput' || d.kind === 'audiooutput') && !!d.label);

        if (hasLabels) {
          setMicAccess('granted');
        } else if (requestPermission) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
            setMicAccess('granted');
          } catch (err) {
            const name = (err as { name?: string })?.name;
            setMicAccess(isPermissionDeniedError(err) ? 'denied' : name === 'NotFoundError' ? 'no-device' : 'error');
          }
        }
        if (seq !== loadSeqRef.current) return; // có lần nạp mới hơn

        const inputs = filterSelectableDevices(devices.filter((d) => d.kind === 'audioinput'));
        const outputs = filterSelectableDevices(devices.filter((d) => d.kind === 'audiooutput'));
        setInputDevices(inputs);
        setOutputDevices(outputs);
        // Chưa cấp quyền thì trình duyệt vẫn liệt kê thiết bị (không tên), nên danh sách trống nghĩa là thật sự không có micro
        if (inputs.length === 0) setMicAccess('no-device');

        const labelOf = (list: MediaDeviceInfo[], id: string, fallback: string) =>
          list.find((d) => d.deviceId === id)?.label || fallback;

        const inRes = resolveDeviceSelection(preferInput, inputs);
        if (inRes.id !== currentInputRef.current) setInputId(inRes.id);
        setInputNotice(
          inRes.missing
            ? `Micro đã lưu không còn kết nối. Đang dùng "${labelOf(inputs, inRes.id, 'micro mặc định')}".`
            : '',
        );
        if (inRes.missing) stopMicTest();

        const outRes = resolveDeviceSelection(preferOutput, outputs);
        if (outRes.id !== currentOutputRef.current) setOutputId(outRes.id);
        setOutputNotice(
          outRes.missing
            ? `Thiết bị phát đã lưu không còn kết nối. Đang dùng "${labelOf(outputs, outRes.id, 'thiết bị mặc định')}".`
            : '',
        );
      } catch (err) {
        console.warn('Failed to load audio devices:', err);
      } finally {
        if (seq === loadSeqRef.current) setIsLoadingDevices(false);
      }
    },
    [stopMicTest],
  );

  // Mở modal: nạp lại từ giá trị đã lưu. Đóng modal: dừng thử mic.
  useEffect(() => {
    if (isOpen) {
      const savedInput = selectedInputId || localStorage.getItem(INPUT_DEVICE_STORAGE_KEY) || '';
      const savedOutput = selectedOutputId || localStorage.getItem(OUTPUT_DEVICE_STORAGE_KEY) || '';
      setInputId(savedInput);
      setOutputId(savedOutput);
      setMicTestError('');
      loadDevices(true, savedInput, savedOutput);
    } else {
      stopMicTest();
    }
  }, [isOpen, selectedInputId, selectedOutputId, loadDevices, stopMicTest]);

  // Cắm/rút thiết bị khi modal đang mở: nạp lại, giữ lựa chọn hiện tại nếu còn, không thì chuyển về mặc định
  useEffect(() => {
    if (!isOpen || !navigator.mediaDevices?.addEventListener) return;
    const onDeviceChange = () => {
      loadDevices(false, currentInputRef.current, currentOutputRef.current);
    };
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, [isOpen, loadDevices]);

  useEffect(() => stopMicTest, [stopMicTest]);

  // Start Mic Test
  const startMicTest = async () => {
    stopMicTest();
    const seq = micTestSeqRef.current;
    setIsTestingMic(true);
    setMicTestError('');

    try {
      // Cùng ràng buộc với lúc thu thật (AGC, khử ồn...) nên mức đo phản ánh đúng bản thu; không dự phòng sang micro khác
      const { stream } = await acquireMicStream(currentInputRef.current, { fallbackToDefault: false });
      if (seq !== micTestSeqRef.current) {
        stream.getTracks().forEach((t) => t.stop()); // đã bấm dừng/đóng trong lúc chờ cấp quyền
        return;
      }
      micStreamRef.current = stream;

      const AudioContextClass: typeof AudioContext | undefined =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        stopMicTest();
        setMicTestError('Trình duyệt này không hỗ trợ đo âm lượng micro.');
        return;
      }

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      audioCtx.createMediaStreamSource(stream).connect(analyser);

      const samples = new Float32Array(analyser.fftSize);
      const recent: number[] = [];

      const update = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);

        recent.push(rms);
        if (recent.length > LEVEL_WINDOW_FRAMES) recent.shift();
        const level = recent.length >= MIN_FRAMES_FOR_VERDICT ? assessMicLevel(recent).level : null;
        setMicMeter({ percent: rmsToMeterPercent(rms), level });
        animationFrameRef.current = requestAnimationFrame(update);
      };
      update();
    } catch (err) {
      console.warn('Cannot start mic test:', err);
      if (seq !== micTestSeqRef.current) return;
      stopMicTest();
      setMicTestError(describeMicError(err));
    }
  };

  // Test Speaker Playback (Chime)
  const testSpeaker = async () => {
    if (isTestingSpeaker) return;
    setIsTestingSpeaker(true);

    try {
      const AudioContextClass: typeof AudioContext | undefined =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const sinkable = audioCtx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
        if (currentOutputRef.current && sinkable.setSinkId) {
          await sinkable.setSinkId(currentOutputRef.current);
        }

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.15);
        osc.frequency.setValueAtTime(783.99, now + 0.3);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.65);

        setTimeout(() => {
          setIsTestingSpeaker(false);
          audioCtx.close().catch(() => {});
        }, 750);
      } else {
        setIsTestingSpeaker(false);
      }
    } catch (err) {
      console.warn('Speaker test failed:', err);
      setIsTestingSpeaker(false);
    }
  };

  const handleClose = () => {
    stopMicTest();
    onClose();
  };

  const handleSave = () => {
    stopMicTest();
    if (currentInputId) {
      localStorage.setItem(INPUT_DEVICE_STORAGE_KEY, currentInputId);
    }
    if (currentOutputId) {
      localStorage.setItem(OUTPUT_DEVICE_STORAGE_KEY, currentOutputId);
    }
    onSave(currentInputId, currentOutputId);
    onClose();
  };

  const accessNotice = micAccess === 'unknown' || micAccess === 'granted' ? null : ACCESS_NOTICE[micAccess];
  const levelView = micMeter.level ? LEVEL_VIEW[micMeter.level] : null;
  const inputOptions =
    inputDevices.length === 0
      ? [{ value: '', label: 'Không tìm thấy microphone nào' }]
      : inputDevices.map((dev, idx) => ({ value: dev.deviceId, label: dev.label || `Microphone ${idx + 1}` }));
  const outputOptions =
    outputDevices.length === 0
      ? [{ value: '', label: 'Thiết bị phát âm thanh mặc định (System Default)' }]
      : outputDevices.map((dev, idx) => ({ value: dev.deviceId, label: dev.label || `Thiết bị đầu ra ${idx + 1}` }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <Icon name="graphic_eq" size={22} className="text-ai" />
          <span className="font-bold text-sumi">Cài đặt thiết bị âm thanh</span>
        </div>
      }
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Hủy bỏ
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Lưu cài đặt
          </Button>
        </>
      }
    >
      <div className="space-y-5 py-1 text-sumi">
        {/* Thông báo quyền / không có thiết bị (đúng nguyên nhân) */}
        {accessNotice && (
          <div role="alert" className="p-3 bg-warning-soft rounded-jc-md text-xs text-warning flex items-start gap-2">
            <Icon name="warning" size={20} className="flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{accessNotice.title}</p>
              <p className="mt-0.5">{accessNotice.body}</p>
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                className="mt-2"
                onClick={() => loadDevices(true, currentInputRef.current, currentOutputRef.current)}
              >
                Cấp quyền &amp; Làm mới thiết bị
              </Button>
            </div>
          </div>
        )}

        {/* 1. Thiết bị đầu vào (Microphone) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
              <Icon name="mic" size={18} /> Thiết bị đầu vào (Microphone)
            </span>
            <span className="text-[11px] text-sumi-muted">{inputDevices.length} thiết bị tìm thấy</span>
          </div>

          <Select
            aria-label="Thiết bị đầu vào (Microphone)"
            value={currentInputId}
            options={inputOptions}
            onChange={(e) => {
              setInputId(e.target.value);
              setInputNotice('');
              stopMicTest();
            }}
            disabled={isLoadingDevices || inputDevices.length === 0}
          />
          {inputNotice && (
            <p role="status" className="text-xs text-warning bg-warning-soft rounded-jc-md px-3 py-2 flex items-start gap-1.5">
              <Icon name="usb_off" size={16} className="flex-shrink-0 mt-px" />
              <span>{inputNotice}</span>
            </p>
          )}
          <p className="text-[11px] text-sumi-muted flex items-start gap-1.5">
            <Icon name="info" size={14} className="flex-shrink-0 mt-px" />
            <span>
              Micro này dùng để thu âm bài chấm điểm. Chữ hiện trực tiếp khi bạn nói (nhận dạng giọng nói của trình duyệt) luôn dùng micro
              mặc định của hệ thống. Muốn hai phần đồng bộ, hãy đặt micro này làm mặc định trong cài đặt âm thanh của hệ điều hành.
            </span>
          </p>

          {/* Mic Test Section */}
          <div className="bg-paper-100 p-3 rounded-jc-md border border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-sumi-muted font-medium">Kiểm tra tín hiệu giọng nói:</span>
              <Button
                size="sm"
                variant={isTestingMic ? 'danger' : 'secondary'}
                icon={isTestingMic ? 'stop_circle' : 'mic'}
                onClick={isTestingMic ? stopMicTest : startMicTest}
              >
                {isTestingMic ? 'Dừng kiểm tra' : 'Bắt đầu nói thử'}
              </Button>
            </div>

            {/* Thanh mức âm theo dBFS; vạch đánh dấu ngưỡng "đủ" và "tốt" của cổng kiểm định */}
            <div className="space-y-1">
              <div className="relative">
                <ProgressBar
                  value={isTestingMic ? Math.max(micMeter.percent, 2) : 0}
                  tone={levelView && micMeter.level !== 'silent' ? levelView.tone : 'ai'}
                  size="md"
                />
                <span
                  aria-hidden="true"
                  title="Ngưỡng tối thiểu"
                  className="absolute bottom-0 h-2 w-px bg-sumi-muted"
                  style={{ left: `${rmsToMeterPercent(MIN_VOICE_RMS)}%` }}
                />
                <span
                  aria-hidden="true"
                  title="Ngưỡng tốt"
                  className="absolute bottom-0 h-2 w-px bg-sumi-muted"
                  style={{ left: `${rmsToMeterPercent(GOOD_VOICE_RMS)}%` }}
                />
              </div>
              {isTestingMic ? (
                <p className="text-[11px] flex items-start gap-1.5" aria-live="polite">
                  {levelView ? (
                    <>
                      <Icon name={levelView.icon} size={16} className="flex-shrink-0" />
                      <span>
                        <strong>{levelView.label}</strong>. <span className="text-sumi-muted">{levelView.hint}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-sumi-muted">Đang lắng nghe, hãy nói một câu tiếng Nhật...</span>
                  )}
                </p>
              ) : micTestError ? (
                <p role="alert" className="text-[11px] text-danger flex items-start gap-1.5">
                  <Icon name="error" size={16} className="flex-shrink-0" />
                  <span>{micTestError}</span>
                </p>
              ) : (
                <p className="text-[11px] text-sumi-muted">
                  Nhấn nút rồi nói như khi luyện tập. Hai vạch trên thanh là ngưỡng "đủ dùng" và "tốt" của hệ thống chấm.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 2. Thiết bị đầu ra (Loa / Tai nghe) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide">
              <Icon name="volume_up" size={18} /> Thiết bị đầu ra (Loa / Tai nghe)
            </span>
            <span className="text-[11px] text-sumi-muted">
              {outputDevices.length > 0 ? `${outputDevices.length} thiết bị tìm thấy` : 'Mặc định hệ thống'}
            </span>
          </div>

          <Select
            aria-label="Thiết bị đầu ra (Loa / Tai nghe)"
            value={currentOutputId}
            options={outputOptions}
            onChange={(e) => {
              setOutputId(e.target.value);
              setOutputNotice('');
            }}
            disabled={isLoadingDevices || outputDevices.length === 0 || !outputSelectable}
          />
          {!outputSelectable && (
            <p className="text-[11px] text-sumi-muted">Trình duyệt này không hỗ trợ chọn loa riêng, âm thanh sẽ phát qua thiết bị mặc định.</p>
          )}
          {outputNotice && (
            <p role="status" className="text-xs text-warning bg-warning-soft rounded-jc-md px-3 py-2 flex items-start gap-1.5">
              <Icon name="usb_off" size={16} className="flex-shrink-0 mt-px" />
              <span>{outputNotice}</span>
            </p>
          )}

          {/* Speaker Test Section */}
          <div className="bg-paper-100 p-3 rounded-jc-md border border-line flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">Kiểm tra âm thanh phát ra</p>
              <p className="text-[11px] text-sumi-muted">Phát chuông thử nghiệm qua loa/tai nghe</p>
            </div>
            <Button size="sm" variant="secondary" icon={isTestingSpeaker ? 'notifications_active' : 'play_arrow'} onClick={testSpeaker} disabled={isTestingSpeaker}>
              {isTestingSpeaker ? 'Đang phát...' : 'Nghe thử'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
