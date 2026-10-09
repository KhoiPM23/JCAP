import React, { useEffect, useState, useRef } from 'react';
import { voicevoxService, VoiceOption } from '../services/voicevoxService';
import { AiVoiceSettingsModal } from '../components/shadowing/AiVoiceSettingsModal';
import { AudioDeviceSettingsModal } from '../components/shadowing/AudioDeviceSettingsModal';
import { Toast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';

export const SettingsView: React.FC = () => {

  // Voice States
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState<boolean>(true);
  const initialSavedVoiceId = Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3;
  const [selectedVoiceId, setSelectedVoiceId] = useState<number>(initialSavedVoiceId);

  // Modals
  const [isAiVoiceModalOpen, setIsAiVoiceModalOpen] = useState<boolean>(false);
  const [isAudioDeviceModalOpen, setIsAudioDeviceModalOpen] = useState<boolean>(false);

  // Audio Device States
  const [selectedInputId, setSelectedInputId] = useState<string>(
    localStorage.getItem('jcap_audio_input_device') || ''
  );
  const [selectedOutputId, setSelectedOutputId] = useState<string>(
    localStorage.getItem('jcap_audio_output_device') || ''
  );
  const [deviceLabels, setDeviceLabels] = useState<{ input: string; output: string }>({
    input: 'Mặc định hệ thống',
    output: 'Mặc định hệ thống',
  });

  // Audio Playback Preview State
  const [isPlayingSample, setIsPlayingSample] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load Voices & Audio Devices
  useEffect(() => {
    let isMounted = true;

    // 1. Fetch available VOICEVOX voices
    setIsLoadingVoices(true);
    voicevoxService
      .getVoices()
      .then((voices) => {
        if (!isMounted) return;
        setAvailableVoices(voices);

        // Ensure valid voice selection
        const savedId = Number(localStorage.getItem('jcap_voicevox_selected_id'));
        if (savedId && voices.some((v) => v.id === savedId)) {
          setSelectedVoiceId(savedId);
        } else if (voices.length > 0 && !voices.some((v) => v.id === selectedVoiceId)) {
          setSelectedVoiceId(voices[0].id);
        }
      })
      .catch((err) => {
        console.warn('Cannot fetch VOICEVOX voices:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingVoices(false);
      });

    // 2. Fetch Audio Device Labels
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (!isMounted) return;
          const currentIn = devices.find((d) => d.kind === 'audioinput' && d.deviceId === selectedInputId);
          const currentOut = devices.find((d) => d.kind === 'audiooutput' && d.deviceId === selectedOutputId);

          setDeviceLabels({
            input: currentIn?.label || (selectedInputId ? 'Thiết bị đã lưu' : 'Mặc định hệ thống'),
            output: currentOut?.label || (selectedOutputId ? 'Thiết bị đã lưu' : 'Mặc định hệ thống'),
          });
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Currently active voice detail object
  const activeVoice = availableVoices.find((v) => v.id === selectedVoiceId) || {
    id: selectedVoiceId,
    speakerName: '四国めたん',
    romajiName: 'Shikoku Metan',
    gender: 'Female',
    region: 'Tohoku (Đông Bắc)',
    description: 'Giọng nữ trong trẻo, tự nhiên chuẩn bản xứ Nhật Bản.',
    styleName: 'ノーマル',
    styleVietnamese: 'Bình thường',
    speakerUuid: '',
    displayName: 'Shikoku Metan - Bình thường',
  };

  // Play test sample audio
  const handlePlaySample = async () => {
    if (isPlayingSample) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
      setIsPlayingSample(false);
      return;
    }

    setIsLoadingAudio(true);
    const sampleText = 'こんにちは！JCAPで日本語を一緒に練習しましょう。';
    try {
      const url = await voicevoxService.getAudioUrl(sampleText, selectedVoiceId);
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      audioPlayerRef.current.src = url;
      audioPlayerRef.current.onended = () => setIsPlayingSample(false);
      audioPlayerRef.current.onerror = () => setIsPlayingSample(false);
      await audioPlayerRef.current.play();
      setIsPlayingSample(true);
    } catch (err: any) {
      console.warn('Error playing sample audio:', err);
      // Fallback to Web Speech API
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(sampleText);
        u.lang = 'ja-JP';
        u.onend = () => setIsPlayingSample(false);
        u.onerror = () => setIsPlayingSample(false);
        window.speechSynthesis.speak(u);
        setIsPlayingSample(true);
      }
    } finally {
      setIsLoadingAudio(false);
    }
  };

  // Handle saving new voice from modal
  const handleSaveVoice = (newVoiceId: number) => {
    setSelectedVoiceId(newVoiceId);
    localStorage.setItem('jcap_voicevox_selected_id', newVoiceId.toString());
    window.dispatchEvent(new Event('jcap_voicevox_changed'));

    const newVoice = availableVoices.find((v) => v.id === newVoiceId);
    const name = newVoice ? `${newVoice.romajiName || newVoice.speakerName}` : 'mới';
    setToastMessage(`Đã áp dụng giọng đọc AI (${name}) cho toàn bộ hệ thống!`);
  };

  // Handle saving audio devices from modal
  const handleSaveAudioDevices = (inId: string, outId: string) => {
    setSelectedInputId(inId);
    setSelectedOutputId(outId);
    localStorage.setItem('jcap_audio_input_device', inId);
    localStorage.setItem('jcap_audio_output_device', outId);

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const currentIn = devices.find((d) => d.kind === 'audioinput' && d.deviceId === inId);
        const currentOut = devices.find((d) => d.kind === 'audiooutput' && d.deviceId === outId);
        setDeviceLabels({
          input: currentIn?.label || (inId ? 'Thiết bị đã chọn' : 'Mặc định hệ thống'),
          output: currentOut?.label || (outId ? 'Thiết bị đã chọn' : 'Mặc định hệ thống'),
        });
      });
    }

    setToastMessage('Đã cập nhật thiết bị âm thanh thành công!');
  };

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-6 px-4 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <Toast
            id="settings-toast"
            message={toastMessage}
            type="success"
            duration={4000}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E6EDF5]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#EEF6FE] border border-[#BCDDFB] flex items-center justify-center text-[#0878EE] shadow-2xs">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#071A44] tracking-tight">
                Cài đặt hệ thống
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Giọng đọc AI toàn hệ thống (VOICEVOX TTS) */}
      <section className="bg-white rounded-3xl border border-[#E6EDF5] p-6 sm:p-8 shadow-xs relative overflow-hidden">
        {/* Decorative corner glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-blue-50/70 via-sky-50/30 to-transparent rounded-bl-full pointer-events-none -mr-16 -mt-16" />

        <div className="relative z-10 space-y-6">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#071A44]">
                  Giọng đọc AI đại diện
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  Đang hoạt động
                </span>
              </div>
              <p className="text-xs text-[#556987] font-medium mt-1">
                Giọng đọc này được áp dụng tự động cho các nhân vật đối thoại AI trong bài tập Shadowing và Hội thoại Roleplay.
              </p>
            </div>

            {/* Quick Change Voice Button */}
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsAiVoiceModalOpen(true)}
              className="flex items-center gap-2 self-start sm:self-auto cursor-pointer shadow-md shadow-blue-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="2.5" width="6" height="11" rx="3" />
                <path d="M9 5.5h6" />
                <path d="M9 8h6" />
                <path d="M9 10.5h6" />
                <path d="M5.5 10.5a6.5 6.5 0 0013 0" />
                <path d="M12 17v4" />
                <path d="M8.5 21h7" />
              </svg>
              <span>Đổi giọng đọc AI</span>
            </Button>
          </div>

          {/* Active Voice Spotlight Card */}
          <div className="rounded-2xl border-2 border-[#BCDDFB] bg-gradient-to-r from-[#F4F9FE] via-white to-[#F4F9FE] p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Character Details */}
              <div className="flex items-start sm:items-center gap-4">
                {/* Character Avatar Circle */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-[#0878EE] to-[#38BDF8] flex items-center justify-center text-white text-3xl shadow-lg shadow-blue-500/20 flex-shrink-0">
                  {activeVoice.gender === 'Female' ? '👧' : activeVoice.gender === 'Male' ? '👦' : '🦊'}
                </div>

                {/* Details */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-[#071A44]">
                      {activeVoice.romajiName || activeVoice.speakerName}
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">
                      ({activeVoice.speakerName})
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-[#0878EE]">
                      ID: {activeVoice.id}
                    </span>
                  </div>

                  {/* Pills (Gender, Style, Region) */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg font-bold bg-[#E6EDF5] text-[#071A44]">
                      {activeVoice.gender === 'Female' ? 'Nữ' : activeVoice.gender === 'Male' ? 'Nam' : 'Anime / Khác'}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      Phong cách: {activeVoice.styleVietnamese || activeVoice.styleName}
                    </span>
                    {activeVoice.region && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg font-medium bg-slate-100 text-slate-700">
                         {activeVoice.region}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#556987] font-normal leading-relaxed max-w-xl">
                    {activeVoice.description || 'Giọng đọc chuẩn tiếng Nhật tự nhiên được hỗ trợ bởi engine VOICEVOX.'}
                  </p>
                </div>
              </div>

              {/* Action: Listen to sample voice */}
              <div className="flex flex-col sm:flex-row md:flex-col gap-2 self-stretch md:self-center md:min-w-[200px] justify-center">
                <button
                  type="button"
                  onClick={handlePlaySample}
                  disabled={isLoadingAudio}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-2xs border ${
                    isPlayingSample
                      ? 'bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100'
                      : 'bg-white border-[#BCDDFB] text-[#0878EE] hover:bg-[#EEF6FE] hover:border-[#0878EE]'
                  }`}
                >
                  {isLoadingAudio ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                      <span>Đang nạp giọng...</span>
                    </>
                  ) : isPlayingSample ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                      <span>Dừng nghe thử</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-[#0878EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>Nghe thử giọng mẫu</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-[#71809A] italic">
                  &ldquo;こんにちは！JCAPで日本語を一緒に練習しましょう。&rdquo;
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Section 2: Thiết bị âm thanh (Microphone & Loa) */}
      <section className="bg-white rounded-3xl border border-[#E6EDF5] p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E6EDF5]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#071A44]">
                Thiết bị âm thanh (Microphone & Loa / Tai nghe)
              </h2>
            </div>
            <p className="text-xs text-[#556987] font-medium mt-1">
              Kiểm tra khả năng bắt âm thanh từ microphone và âm lượng loa trước khi tham gia luyện tập Shadowing.
            </p>
          </div>

          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsAudioDeviceModalOpen(true)}
            className="flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <svg className="w-4 h-4 text-[#0878EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 4.5L5.5 8.5H2.5a1 1 0 00-1 1v5a1 1 0 001 1h3l5 4V4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 10a3 3 0 010 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 7.5a6.5 6.5 0 010 9" />
            </svg>
            <span>Kiểm tra thiết bị</span>
          </Button>
        </div>

        {/* Devices Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Microphone Card */}
          <div className="p-4 rounded-2xl border border-[#E6EDF5] bg-[#F8FAFC] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0878EE] flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="2.5" width="6" height="11" rx="3" />
                <path d="M5.5 10.5a6.5 6.5 0 0013 0" />
                <path d="M12 17v4" />
                <path d="M8.5 21h7" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#71809A]">
                Microphone thu âm
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#071A44] truncate" title={deviceLabels.input}>
                {deviceLabels.input}
              </div>
            </div>
          </div>

          {/* Speaker Card */}
          <div className="p-4 rounded-2xl border border-[#E6EDF5] bg-[#F8FAFC] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 4.5L5.5 8.5H2.5a1 1 0 00-1 1v5a1 1 0 001 1h3l5 4V4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 10a3 3 0 010 4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 7.5a6.5 6.5 0 010 9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 5a10 10 0 010 14" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#71809A]">
                Loa / Tai nghe phát âm
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#071A44] truncate" title={deviceLabels.output}>
                {deviceLabels.output}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1. Modal Cài đặt Giọng đọc AI (VOICEVOX TTS) */}
      <AiVoiceSettingsModal
        isOpen={isAiVoiceModalOpen}
        onClose={() => setIsAiVoiceModalOpen(false)}
        selectedVoiceId={selectedVoiceId}
        availableVoices={availableVoices}
        onSave={handleSaveVoice}
      />

      {/* 2. Modal Cài đặt Thiết bị âm thanh (Microphone & Loa) */}
      <AudioDeviceSettingsModal
        isOpen={isAudioDeviceModalOpen}
        onClose={() => setIsAudioDeviceModalOpen(false)}
        selectedInputId={selectedInputId}
        selectedOutputId={selectedOutputId}
        onSave={handleSaveAudioDevices}
      />
    </div>
  );
};
