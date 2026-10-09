import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { VoiceOption, voicevoxService } from '../../services/voicevoxService';

export interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInputId: string;
  selectedOutputId: string;
  selectedVoiceId?: number;
  availableVoices?: VoiceOption[];
  onSave: (inputId: string, outputId: string, voiceId?: number) => void;
}

interface CharacterGroup {
  speakerName: string;
  romajiName: string;
  gender: string;
  region: string;
  description: string;
  speakerUuid: string;
  styles: {
    id: number;
    styleName: string;
    styleVietnamese: string;
  }[];
}

type TabType = 'AUDIO' | 'VOICE';

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  isOpen,
  onClose,
  selectedInputId,
  selectedOutputId,
  selectedVoiceId,
  availableVoices = [],
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('AUDIO');

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentInputId, setCurrentInputId] = useState<string>(selectedInputId || '');
  const [currentOutputId, setCurrentOutputId] = useState<string>(selectedOutputId || '');
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);

  // VOICEVOX Voice Settings State
  const [currentVoiceId, setCurrentVoiceId] = useState<number>(selectedVoiceId || 3);
  const [voiceCategory, setVoiceCategory] = useState<'ALL' | 'Female' | 'Male' | 'Mascot'>('ALL');
  const [selectedCharacterName, setSelectedCharacterName] = useState<string>('');
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Mic test state
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Speaker test state
  const [isTestingSpeaker, setIsTestingSpeaker] = useState<boolean>(false);

  // Nhóm danh sách voice theo từng nhân vật
  const characterGroups = useMemo<CharacterGroup[]>(() => {
    const map = new Map<string, CharacterGroup>();
    availableVoices.forEach((v) => {
      if (!map.has(v.speakerName)) {
        map.set(v.speakerName, {
          speakerName: v.speakerName,
          romajiName: v.romajiName || v.speakerName,
          gender: v.gender || 'Female',
          region: v.region || 'Toàn quốc',
          description: v.description || '',
          speakerUuid: v.speakerUuid || '',
          styles: [],
        });
      }
      map.get(v.speakerName)!.styles.push({
        id: v.id,
        styleName: v.styleName,
        styleVietnamese: v.styleVietnamese || v.styleName,
      });
    });
    return Array.from(map.values());
  }, [availableVoices]);

  // Đếm số lượng theo danh mục
  const counts = useMemo(() => {
    let female = 0;
    let male = 0;
    let mascot = 0;
    characterGroups.forEach((c) => {
      const g = c.gender.toLowerCase();
      if (g === 'female') female++;
      else if (g === 'male') male++;
      else mascot++;
    });
    return { all: characterGroups.length, female, male, mascot };
  }, [characterGroups]);

  // Lọc nhân vật theo tab Danh mục
  const filteredCharacters = useMemo(() => {
    if (voiceCategory === 'ALL') return characterGroups;
    return characterGroups.filter(
      (c) => c.gender.toLowerCase() === voiceCategory.toLowerCase()
    );
  }, [characterGroups, voiceCategory]);

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
      setActiveTab('AUDIO'); // Mặc định mở tab Thiết bị âm thanh
      setCurrentInputId(selectedInputId || localStorage.getItem('jcap_audio_input_device') || '');
      setCurrentOutputId(selectedOutputId || localStorage.getItem('jcap_audio_output_device') || '');

      const initialVoiceId =
        selectedVoiceId || Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3;
      setCurrentVoiceId(initialVoiceId);

      const foundChar = characterGroups.find((c) => c.styles.some((s) => s.id === initialVoiceId));
      if (foundChar) {
        setSelectedCharacterName(foundChar.speakerName);
      } else if (characterGroups.length > 0) {
        setSelectedCharacterName(characterGroups[0].speakerName);
      }

      setPreviewError(null);
      loadDevices();
    } else {
      stopMicTest();
      stopPreviewAudio();
    }
  }, [isOpen, selectedInputId, selectedOutputId, selectedVoiceId, characterGroups]);

  // Clean up mic test and preview on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
      stopPreviewAudio();
    };
  }, []);

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      } catch {}
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
  };

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

  // Test Voice Sample Playback
  const handlePlayVoicePreview = async () => {
    if (isPlayingPreview) {
      stopPreviewAudio();
      return;
    }

    setIsPlayingPreview(true);
    setPreviewError(null);

    try {
      const audio = await voicevoxService.playVoicePreview(currentVoiceId);
      previewAudioRef.current = audio;

      audio.onended = () => {
        setIsPlayingPreview(false);
        previewAudioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlayingPreview(false);
        previewAudioRef.current = null;
        setPreviewError('Lỗi khi phát âm thanh thử nghiệm.');
      };
    } catch (err: any) {
      setIsPlayingPreview(false);
      setPreviewError(err?.message || 'Không thể kết nối tới VOICEVOX để nghe thử giọng.');
    }
  };

  // Lấy danh sách styles cho nhân vật đang chọn
  const activeCharacter = useMemo(() => {
    return (
      characterGroups.find((c) => c.speakerName === selectedCharacterName) ||
      filteredCharacters[0] ||
      characterGroups[0]
    );
  }, [characterGroups, selectedCharacterName, filteredCharacters]);

  const handleCharacterChange = (speakerName: string) => {
    setSelectedCharacterName(speakerName);
    const char = characterGroups.find((c) => c.speakerName === speakerName);
    if (char && char.styles.length > 0) {
      const normalStyle = char.styles.find(
        (s) => s.styleName === 'ノーマル' || s.styleName === 'ふつう'
      );
      const newId = normalStyle ? normalStyle.id : char.styles[0].id;
      setCurrentVoiceId(newId);
    }
    stopPreviewAudio();
  };

  const handleSwitchTab = (tab: TabType) => {
    if (tab === activeTab) return;
    stopMicTest();
    stopPreviewAudio();
    setActiveTab(tab);
  };

  const handleSave = () => {
    stopMicTest();
    stopPreviewAudio();
    if (currentInputId) {
      localStorage.setItem('jcap_audio_input_device', currentInputId);
    }
    if (currentOutputId) {
      localStorage.setItem('jcap_audio_output_device', currentOutputId);
    }
    if (currentVoiceId) {
      localStorage.setItem('jcap_voicevox_selected_id', currentVoiceId.toString());
    }
    onSave(currentInputId, currentOutputId, currentVoiceId);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopMicTest();
        stopPreviewAudio();
        onClose();
      }}
      title={<span className="font-bold text-[#071A44]">Cài đặt</span>}
      maxWidth="lg"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              stopMicTest();
              stopPreviewAudio();
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
      <div className="flex flex-col space-y-4">
        {/* Top Tab Switcher (Cố định ở trên đầu) */}
        <div className="flex items-center gap-1.5 bg-[#F4F9FE] p-1.5 rounded-2xl border border-[#E1EAF4] flex-shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchTab('AUDIO')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs transition-all cursor-pointer ${
              activeTab === 'AUDIO'
                ? 'bg-white text-[#0878EE] font-extrabold shadow-2xs'
                : 'text-[#556987] font-bold hover:text-[#071A44] hover:bg-white/50'
            }`}
          >
            <span className="text-sm">🔊</span>
            <span>Thiết bị âm thanh</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('VOICE')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs transition-all cursor-pointer ${
              activeTab === 'VOICE'
                ? 'bg-white text-[#0878EE] font-extrabold shadow-2xs'
                : 'text-[#556987] font-bold hover:text-[#071A44] hover:bg-white/50'
            }`}
          >
            <span className="text-sm">🎙️</span>
            <span>Giọng đọc AI</span>
          </button>
        </div>

        {/* Content Container với min-height và max-height cố định -> Giữ khung không bị co giãn khi chuyển tab */}
        <div className="min-h-[440px] max-h-[65vh] overflow-y-auto pr-1">
          {/* ========================================================= */}
          {/* TAB 1: THIẾT BỊ ÂM THANH (MICROPHONE & LOA) */}
          {/* ========================================================= */}
          {activeTab === 'AUDIO' && (
            <div className="space-y-4 animate-in fade-in duration-150">
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

              {/* Thiết bị đầu vào (Microphone) */}
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

              {/* Thiết bị đầu ra (Loa / Tai nghe) */}
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
          )}

          {/* ========================================================= */}
          {/* TAB 2: GIỌNG ĐỌC AI (VOICEVOX TTS) */}
          {/* ========================================================= */}
          {activeTab === 'VOICE' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-gradient-to-br from-[#F4F9FE] via-white to-[#EEF6FE] rounded-2xl border-2 border-[#BCDDFB] shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E1EAF4] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎙️</span>
                      <h3 className="text-xs font-black text-[#071A44] uppercase tracking-wide">
                        Giọng đọc mẫu AI (VOICEVOX TTS)
                      </h3>
                    </div>
                    <p className="text-[11px] text-[#556987] mt-0.5">
                      Chọn chất giọng phát âm chuẩn Nhật Bản cho câu thoại mẫu khi luyện Shadowing
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 bg-[#E6F2FE] text-[#0878EE] px-2.5 py-1 rounded-full text-[11px] font-bold">
                    <span>{characterGroups.length} nhân vật</span>
                    <span>•</span>
                    <span>{availableVoices.length} chất giọng</span>
                  </div>
                </div>

                {availableVoices.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    <p className="font-semibold">⚠️ VOICEVOX Engine chưa sẵn sàng</p>
                    <p className="text-[11px] mt-1 text-amber-700">
                      Hệ thống đang sử dụng giọng đọc mặc định của trình duyệt. Hãy mở ứng dụng VOICEVOX trên máy để trải nghiệm chất giọng tự nhiên chất lượng cao.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {/* Category Filter Pills */}
                    <div>
                      <label className="text-[11px] font-bold text-[#556987] block mb-1.5 uppercase">
                        Phân loại giọng:
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceCategory('ALL');
                            stopPreviewAudio();
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                            voiceCategory === 'ALL'
                              ? 'bg-[#0878EE] text-white shadow-xs'
                              : 'bg-white text-[#556987] border border-[#BCDDFB] hover:bg-blue-50'
                          }`}
                        >
                          🌟 Tất cả ({counts.all})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceCategory('Female');
                            stopPreviewAudio();
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                            voiceCategory === 'Female'
                              ? 'bg-pink-600 text-white shadow-xs'
                              : 'bg-white text-[#556987] border border-pink-200 hover:bg-pink-50'
                          }`}
                        >
                          🌸 Giọng Nữ ({counts.female})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceCategory('Male');
                            stopPreviewAudio();
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                            voiceCategory === 'Male'
                              ? 'bg-blue-700 text-white shadow-xs'
                              : 'bg-white text-[#556987] border border-blue-200 hover:bg-blue-50'
                          }`}
                        >
                          👔 Giọng Nam ({counts.male})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceCategory('Mascot');
                            stopPreviewAudio();
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                            voiceCategory === 'Mascot'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white text-[#556987] border border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          ✨ Mascot / Anime ({counts.mascot})
                        </button>
                      </div>
                    </div>

                    {/* Character & Style Pickers Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* 1. Chọn Nhân vật */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#071A44]">
                          1. Nhân vật ({filteredCharacters.length}):
                        </label>
                        <select
                          value={activeCharacter?.speakerName || ''}
                          onChange={(e) => handleCharacterChange(e.target.value)}
                          className="w-full bg-white border border-[#BCDDFB] focus:border-[#0878EE] focus:ring-1 focus:ring-[#0878EE] text-[#071A44] text-xs font-bold rounded-xl px-3 py-2.5 outline-none transition-all cursor-pointer"
                        >
                          {filteredCharacters.map((c) => (
                            <option key={c.speakerName} value={c.speakerName}>
                              {c.gender === 'Female' ? '🌸' : c.gender === 'Male' ? '👔' : '✨'}{' '}
                              {c.speakerName} ({c.romajiName}) — {c.region}
                            </option>
                          ))}
                        </select>
                        {activeCharacter && (
                          <div className="space-y-1 px-1 pt-1">
                            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <span>📍 Vùng:</span>
                              <span>{activeCharacter.region}</span>
                            </div>
                            {activeCharacter.description && (
                              <p className="text-[11px] text-[#0878EE] font-medium italic">
                                💡 {activeCharacter.description}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 2. Chọn Cảm xúc / Phong cách giọng */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#071A44]">
                          2. Phong cách & Cảm xúc giọng:
                        </label>
                        <select
                          value={currentVoiceId}
                          onChange={(e) => {
                            setCurrentVoiceId(Number(e.target.value));
                            stopPreviewAudio();
                          }}
                          className="w-full bg-white border border-[#BCDDFB] focus:border-[#0878EE] focus:ring-1 focus:ring-[#0878EE] text-[#071A44] text-xs font-bold rounded-xl px-3 py-2.5 outline-none transition-all cursor-pointer"
                        >
                          {activeCharacter?.styles.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.styleVietnamese} ({st.styleName})
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-[#71809A] px-1 pt-0.5">
                          Mã Voice ID: <span className="font-mono font-bold text-[#071A44]">{currentVoiceId}</span>
                        </p>
                      </div>
                    </div>

                    {/* Preview Button & Status */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#E6EDF5]">
                      <div className="flex-1">
                        {previewError ? (
                          <p className="text-[11px] text-red-600 font-semibold">{previewError}</p>
                        ) : (
                          <p className="text-[11px] text-[#556987]">
                            Câu mẫu nghe thử: <span className="text-[#071A44] font-medium">「こんにちは！シャドーイングの練習を始めましょう。」</span>
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handlePlayVoicePreview}
                        disabled={availableVoices.length === 0}
                        className={`flex items-center gap-1.5 text-xs font-extrabold px-4 py-2 rounded-full transition-all shadow-xs cursor-pointer ${
                          isPlayingPreview
                            ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                            : 'bg-[#0878EE] hover:bg-[#0662C6] text-white'
                        }`}
                      >
                        <span>{isPlayingPreview ? '⏹️ Đang phát...' : '🔊 Nghe thử giọng'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

