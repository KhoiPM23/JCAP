import React, { useEffect, useState, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export interface AudioDeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInputId: string;
  selectedOutputId: string;
  onSave: (inputId: string, outputId: string) => void;
}

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
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);

  // Mic test state
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Speaker test state
  const [isTestingSpeaker, setIsTestingSpeaker] = useState<boolean>(false);

  // Load available devices
  const loadDevices = async (requestPermissionIfEmpty: boolean = true) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

    setIsLoadingDevices(true);
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();

      const hasLabels = devices.some(
        (d) => (d.kind === 'audioinput' || d.kind === 'audiooutput') && !!d.label
      );

      if (!hasLabels && requestPermissionIfEmpty) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          devices = await navigator.mediaDevices.enumerateDevices();
          stream.getTracks().forEach((t) => t.stop());
          setHasPermission(true);
        } catch {
          setHasPermission(false);
        }
      } else if (hasLabels) {
        setHasPermission(true);
      }

      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');

      setInputDevices(inputs);
      setOutputDevices(outputs);

      if (!currentInputId && inputs.length > 0) {
        setCurrentInputId(inputs[0].deviceId);
      }
      if (!currentOutputId && outputs.length > 0) {
        setCurrentOutputId(outputs[0].deviceId);
      }
    } catch (err) {
      console.warn('Failed to load audio devices:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCurrentInputId(selectedInputId || localStorage.getItem('jcap_audio_input_device') || '');
      setCurrentOutputId(selectedOutputId || localStorage.getItem('jcap_audio_output_device') || '');
      loadDevices();
    } else {
      stopMicTest();
    }
  }, [isOpen, selectedInputId, selectedOutputId]);

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  // Stop Mic Test
  const stopMicTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicVolume(0);
  };

  // Start Mic Test
  const startMicTest = async () => {
    stopMicTest();
    setIsTestingMic(true);

    try {
      const constraints: MediaStreamConstraints = {
        audio: currentInputId ? { deviceId: { exact: currentInputId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setMicVolume(normalized);
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.warn('Cannot start mic test:', err);
      stopMicTest();
    }
  };

  // Test Speaker Playback (Chime)
  const testSpeaker = async () => {
    if (isTestingSpeaker) return;
    setIsTestingSpeaker(true);

    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        if (currentOutputId && 'setSinkId' in (audioCtx as any)) {
          await (audioCtx as any).setSinkId(currentOutputId);
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
          try {
            audioCtx.close();
          } catch {}
        }, 750);
      } else {
        setIsTestingSpeaker(false);
      }
    } catch (err) {
      console.warn('Speaker test failed:', err);
      setIsTestingSpeaker(false);
    }
  };

  const handleSave = () => {
    stopMicTest();
    if (currentInputId) {
      localStorage.setItem('jcap_audio_input_device', currentInputId);
    }
    if (currentOutputId) {
      localStorage.setItem('jcap_audio_output_device', currentOutputId);
    }
    onSave(currentInputId, currentOutputId);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopMicTest();
        onClose();
      }}
      title={
        <div className="flex items-center gap-2">
          <span className="text-lg">🔊</span>
          <span className="font-bold text-[#071A44]">Cài đặt thiết bị âm thanh</span>
        </div>
      }
      maxWidth="md"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              stopMicTest();
              onClose();
            }}
          >
            Hủy bỏ
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Lưu cài đặt
          </Button>
        </>
      }
    >
      <div className="space-y-5 py-1">
        {/* Permission Notice */}
        {!hasPermission && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
            <span className="text-base flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold">Chưa cấp đủ quyền micro</p>
              <p className="text-[11px] mt-0.5 text-amber-700">
                Hãy cho phép trình duyệt truy cập micro để hệ thống nhận diện đầy đủ tên các thiết bị âm thanh đang kết nối.
              </p>
              <button
                type="button"
                onClick={() => loadDevices(true)}
                className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Cấp quyền & Làm mới thiết bị
              </button>
            </div>
          </div>
        )}

        {/* 1. Thiết bị đầu vào (Microphone) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#071A44] flex items-center gap-1.5 uppercase tracking-wide">
              <span>🎤</span> Thiết bị đầu vào (Microphone)
            </label>
            <span className="text-[11px] text-[#71809A]">
              {inputDevices.length} thiết bị tìm thấy
            </span>
          </div>

          <div className="relative">
            <select
              value={currentInputId}
              onChange={(e) => {
                setCurrentInputId(e.target.value);
                if (isTestingMic) {
                  stopMicTest();
                }
              }}
              disabled={isLoadingDevices || inputDevices.length === 0}
              className="w-full bg-[#F8FAFD] border border-[#BCDDFB] focus:border-[#0878EE] focus:ring-1 focus:ring-[#0878EE] text-[#071A44] text-xs font-semibold rounded-xl px-3.5 py-2.5 outline-none transition-all cursor-pointer disabled:opacity-50"
            >
              {inputDevices.length === 0 ? (
                <option value="">Không tìm thấy microphone nào</option>
              ) : (
                inputDevices.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    {dev.label || `Microphone ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Mic Test Section */}
          <div className="bg-[#F4F9FE] p-3 rounded-xl border border-[#E6EDF5] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#556987] font-medium">Kiểm tra tín hiệu giọng nói:</span>
              <button
                type="button"
                onClick={isTestingMic ? stopMicTest : startMicTest}
                className={`text-xs font-bold px-3 py-1 rounded-full border transition-all cursor-pointer ${
                  isTestingMic
                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    : 'bg-white text-[#0878EE] border-[#BCDDFB] hover:bg-blue-50'
                }`}
              >
                {isTestingMic ? 'Dừng kiểm tra' : 'Bắt đầu nói thử'}
              </button>
            </div>

            {/* Volume indicator bar */}
            <div className="space-y-1">
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    micVolume > 60 ? 'bg-emerald-500' : micVolume > 20 ? 'bg-[#0878EE]' : 'bg-gray-400'
                  }`}
                  style={{ width: `${isTestingMic ? Math.max(micVolume, 4) : 0}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-[#71809A] flex justify-between">
                <span>
                  {isTestingMic
                    ? 'Đang lắng nghe âm thanh từ mic...'
                    : 'Nhấn nút để kiểm tra âm lượng micro'}
                </span>
                {isTestingMic && <span className="font-bold text-[#071A44]">{micVolume}%</span>}
              </p>
            </div>
          </div>
        </div>

        {/* 2. Thiết bị đầu ra (Loa / Tai nghe) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#071A44] flex items-center gap-1.5 uppercase tracking-wide">
              <span>🔊</span> Thiết bị đầu ra (Loa / Tai nghe)
            </label>
            <span className="text-[11px] text-[#71809A]">
              {outputDevices.length > 0 ? `${outputDevices.length} thiết bị tìm thấy` : 'Mặc định hệ thống'}
            </span>
          </div>

          <div className="relative">
            <select
              value={currentOutputId}
              onChange={(e) => setCurrentOutputId(e.target.value)}
              disabled={isLoadingDevices || outputDevices.length === 0}
              className="w-full bg-[#F8FAFD] border border-[#BCDDFB] focus:border-[#0878EE] focus:ring-1 focus:ring-[#0878EE] text-[#071A44] text-xs font-semibold rounded-xl px-3.5 py-2.5 outline-none transition-all cursor-pointer disabled:opacity-50"
            >
              {outputDevices.length === 0 ? (
                <option value="">Thiết bị phát âm thanh mặc định (System Default)</option>
              ) : (
                outputDevices.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    {dev.label || `Thiết bị đầu ra ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Speaker Test Section */}
          <div className="bg-[#F4F9FE] p-3 rounded-xl border border-[#E6EDF5] flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#071A44]">Kiểm tra âm thanh phát ra</p>
              <p className="text-[11px] text-[#71809A]">Phát chuông thử nghiệm qua loa/tai nghe</p>
            </div>
            <button
              type="button"
              onClick={testSpeaker}
              disabled={isTestingSpeaker}
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-white text-[#0878EE] border border-[#BCDDFB] hover:bg-blue-50 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <span>{isTestingSpeaker ? '🔔 Đang phát...' : 'Nghe thử'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
