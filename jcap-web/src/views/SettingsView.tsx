import React, { useEffect, useMemo, useRef, useState } from 'react';
import { voicevoxService, VoiceOption } from '../services/voicevoxService';
import { scenarioVoiceService } from '../services/scenarioVoiceService';
import { AudioDeviceSettingsModal } from '../components/shadowing/AudioDeviceSettingsModal';
import { Button, Icon, SegmentedControl, Select, Switch } from '../components/jcap';
import { cx } from '../components/jcap/utils';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { getPracticePrefs, setPracticePref, type PracticePrefs } from '../utils/practicePrefs';

const SAMPLE_TEXT = 'こんにちは！JCAPで日本語を一緒に練習しましょう。';

type VoiceCat = 'standard' | 'region' | 'other';
const REGIONAL = ['tohoku', 'sendai', 'miyagi', 'aomori', 'akita', 'fukushima', 'kansai', 'kyoto', 'nara', 'osaka', 'shikoku', 'chubu', 'toyama', 'nagano', 'nagoya', 'hokuriku', 'kyushu', 'oita', 'hokkaido', 'chugoku', 'okinawa'];

/** Nhóm giọng: Chuẩn (nam/nữ, giọng toàn quốc), Vùng miền (giọng địa phương), Hoạt hình và khác (linh vật, robot…) */
function voiceCategory(v: VoiceOption): VoiceCat {
  if (v.gender !== 'Female' && v.gender !== 'Male') return 'other';
  const r = (v.region || '').toLowerCase();
  return REGIONAL.some((k) => r.includes(k)) ? 'region' : 'standard';
}

/** Mỗi nhân vật một thẻ: lấy kiểu giọng "bình thường" (ノーマル) nếu có, không thì kiểu đầu tiên */
function characters(voices: VoiceOption[]): VoiceOption[] {
  const map = new Map<string, VoiceOption>();
  voices.forEach((v) => {
    const cur = map.get(v.speakerName);
    if (!cur || (cur.styleName !== 'ノーマル' && v.styleName === 'ノーマル')) map.set(v.speakerName, v);
  });
  return Array.from(map.values());
}

const SECTIONS = [
  { id: 'giong', label: 'Giọng đọc AI', icon: 'record_voice_over' },
  { id: 'thietbi', label: 'Micro và loa', icon: 'headphones' },
  { id: 'luyentap', label: 'Khi luyện tập', icon: 'tune' },
  { id: 'giaodien', label: 'Giao diện', icon: 'contrast' },
];

/**
 * Cài đặt (design-handoff mục 6): menu mục con bên trái (cuộn tới mục), giọng đọc AI dạng lưới thẻ, micro và loa,
 * tuỳ chọn khi luyện, giao diện. Thay đổi lưu ngay (cùng khoá localStorage như trước).
 */
export const SettingsView: React.FC = () => {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  // Giọng đọc
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState<boolean>(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<number>(Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3);
  const [voiceCat, setVoiceCat] = useState<VoiceCat>('standard');

  // Thiết bị âm thanh
  const [isAudioDeviceModalOpen, setIsAudioDeviceModalOpen] = useState<boolean>(false);
  const [selectedInputId, setSelectedInputId] = useState<string>(localStorage.getItem('jcap_audio_input_device') || '');
  const [selectedOutputId, setSelectedOutputId] = useState<string>(localStorage.getItem('jcap_audio_output_device') || '');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  // Nghe thử: id giọng đang phát (null = không phát)
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Khi luyện tập
  const [prefs, setPrefs] = useState<PracticePrefs>(getPracticePrefs);
  const [speechRate, setSpeechRate] = useState<number>(() => scenarioVoiceService.getSpeechRate());

  const [activeSection, setActiveSection] = useState('giong');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingVoices(true);
    voicevoxService
      .getVoices()
      .then((voices) => {
        if (!isMounted) return;
        setAvailableVoices(voices);
        const savedId = Number(localStorage.getItem('jcap_voicevox_selected_id'));
        const current = voices.find((v) => v.id === (savedId || selectedVoiceId));
        if (current) {
          setSelectedVoiceId(current.id);
          setVoiceCat(voiceCategory(current));
        } else if (voices.length > 0) setSelectedVoiceId(voices[0].id);
      })
      .catch((err) => console.warn('Cannot fetch VOICEVOX voices:', err))
      .finally(() => isMounted && setIsLoadingVoices(false));

    const loadDevices = () =>
      navigator.mediaDevices
        ?.enumerateDevices()
        .then((d) => isMounted && setDevices(d))
        .catch(() => {});
    loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);

    return () => {
      isMounted = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
      audioPlayerRef.current?.pause();
      audioPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const activeVoice = availableVoices.find((v) => v.id === selectedVoiceId);
  const groups = useMemo(() => characters(availableVoices), [availableVoices]);
  const shown = groups.filter((v) => voiceCategory(v) === voiceCat);
  const catCount = (c: VoiceCat) => groups.filter((v) => voiceCategory(v) === c).length;

  /** Phát câu mẫu bằng một giọng; bấm lại khi đang phát thì dừng */
  const playSample = async (voiceId: number) => {
    if (playingId === voiceId) {
      audioPlayerRef.current?.pause();
      if (audioPlayerRef.current) audioPlayerRef.current.currentTime = 0;
      window.speechSynthesis?.cancel();
      setPlayingId(null);
      return;
    }
    audioPlayerRef.current?.pause();
    setLoadingId(voiceId);
    try {
      const url = await voicevoxService.getAudioUrl(SAMPLE_TEXT, voiceId);
      if (!audioPlayerRef.current) audioPlayerRef.current = new Audio();
      const audio = audioPlayerRef.current;
      audio.src = url;
      // Phát qua loa đã chọn nếu trình duyệt hỗ trợ
      const sink = (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
      if (sink && selectedOutputId) await sink.call(audio, selectedOutputId).catch(() => {});
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      await audio.play();
      setPlayingId(voiceId);
    } catch (err) {
      console.warn('Error playing sample audio:', err);
      // Không gọi được VOICEVOX: đọc bằng giọng có sẵn của trình duyệt
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(SAMPLE_TEXT);
        u.lang = 'ja-JP';
        u.onend = () => setPlayingId(null);
        u.onerror = () => setPlayingId(null);
        window.speechSynthesis.speak(u);
        setPlayingId(voiceId);
      }
    } finally {
      setLoadingId(null);
    }
  };

  const pickVoice = (v: VoiceOption) => {
    setSelectedVoiceId(v.id);
    localStorage.setItem('jcap_voicevox_selected_id', v.id.toString());
    window.dispatchEvent(new Event('jcap_voicevox_changed'));
    setToastMessage(`Đã chọn giọng ${v.romajiName || v.speakerName}.`);
  };

  const saveDevices = (inId: string, outId: string) => {
    setSelectedInputId(inId);
    setSelectedOutputId(outId);
    localStorage.setItem('jcap_audio_input_device', inId);
    localStorage.setItem('jcap_audio_output_device', outId);
    setToastMessage('Đã cập nhật thiết bị âm thanh.');
  };

  const setPref = <K extends keyof PracticePrefs>(key: K, value: PracticePrefs[K]) => setPrefs(setPracticePref(key, value));

  const deviceOptions = (kind: MediaDeviceKind) => [
    { value: '', label: 'Mặc định hệ thống' },
    ...devices
      .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default')
      .map((d, i) => ({ value: d.deviceId, label: d.label || `${kind === 'audioinput' ? 'Micro' : 'Loa'} ${i + 1}` })),
  ];

  const goSection = (id: string) => {
    setActiveSection(id);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="bg-transparent">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-6 pb-10">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-[38px]">Cài đặt</h1>
          <p className="m-0 text-[15px] leading-6 text-sumi-muted">Chỉnh giọng AI, micro và cách hiển thị khi luyện. Thay đổi được lưu ngay.</p>
        </div>

        {toastMessage && (
          <div role="status" className="fixed right-6 top-6 z-50 flex items-center gap-2 rounded-jc-md border border-line bg-paper-50 px-4 py-3 text-sm font-medium shadow-jc-md">
            <Icon name="check_circle" size={20} fill style={{ color: 'var(--success)' }} />
            {toastMessage}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-8">
          <nav aria-label="Mục cài đặt" className="sticky top-0 flex flex-[0_0_200px] flex-col gap-0.5">
            {SECTIONS.map((s) => {
              const on = activeSection === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goSection(s.id);
                  }}
                  aria-current={on ? 'true' : undefined}
                  className={cx(
                    'flex min-h-11 items-center gap-2.5 rounded-jc-md px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                    on ? 'bg-ai-soft text-ai' : 'text-sumi hover:bg-paper-200',
                  )}
                >
                  <Icon name={s.icon} size={22} fill={on} />
                  {s.label}
                </a>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
            {/* Giọng đọc AI */}
            <section id="giong" aria-labelledby="giong-h" className="flex scroll-mt-6 flex-col gap-[18px] rounded-jc-lg border border-line bg-paper-50 p-6">
              <div className="flex flex-col gap-0.5">
                <h2 id="giong-h" className="m-0 text-[19px] font-semibold leading-7">
                  Giọng đọc AI
                </h2>
                <p className="m-0 text-sm leading-[22px] text-sumi-muted">
                  Dùng cho nhân vật AI trong Hội thoại AI và giọng mẫu Shadowing khi kịch bản không gán giọng riêng.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-jc-lg bg-sora-soft px-[18px] py-4">
                <span className="inline-flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-sora font-mincho text-2xl font-bold text-on-sora" lang="ja">
                  {(activeVoice?.speakerName || '声').charAt(0)}
                </span>
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                  <span className="text-[13px] leading-5 text-sumi-muted">Đang dùng</span>
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-bold leading-[26px]">{activeVoice?.romajiName || activeVoice?.speakerName || (isLoadingVoices ? 'Đang tải…' : `Giọng #${selectedVoiceId}`)}</span>
                    {activeVoice && (
                      <span className="font-jp text-sm text-sumi-muted" lang="ja">
                        {activeVoice.speakerName}
                        {activeVoice.styleVietnamese ? ` · ${activeVoice.styleVietnamese}` : ''}
                      </span>
                    )}
                  </span>
                  {activeVoice?.description && <span className="text-sm leading-5">{activeVoice.description}</span>}
                </div>
                <Button
                  variant="secondary"
                  icon={playingId === selectedVoiceId ? 'stop' : 'play_arrow'}
                  loading={loadingId === selectedVoiceId}
                  onClick={() => playSample(selectedVoiceId)}
                >
                  {playingId === selectedVoiceId ? 'Dừng' : 'Nghe thử'}
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-sm font-semibold leading-5">Chọn giọng khác</span>
                <SegmentedControl
                  ariaLabel="Nhóm giọng"
                  size="sm"
                  value={voiceCat}
                  onChange={(v) => setVoiceCat(v as VoiceCat)}
                  options={[
                    { value: 'standard', label: 'Chuẩn', count: catCount('standard') },
                    { value: 'region', label: 'Vùng miền', count: catCount('region') },
                    { value: 'other', label: 'Hoạt hình và khác', count: catCount('other') },
                  ]}
                />
              </div>

              {isLoadingVoices ? (
                <p className="m-0 text-sm text-sumi-muted" role="status">
                  Đang tải danh sách giọng…
                </p>
              ) : shown.length === 0 ? (
                <p className="m-0 text-sm text-sumi-muted">Chưa có giọng nào trong nhóm này.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((v) => {
                    const selected = activeVoice ? v.speakerName === activeVoice.speakerName : v.id === selectedVoiceId;
                    return (
                      <div
                        key={v.speakerName}
                        className={cx('flex flex-col gap-2 rounded-jc-lg p-3.5', selected ? 'bg-ai-soft' : 'bg-paper-50')}
                        style={{ border: selected ? '2px solid var(--ai)' : '1px solid var(--line)' }}
                      >
                        <button type="button" onClick={() => pickVoice(v)} aria-pressed={selected} className="flex flex-col gap-1 border-0 bg-transparent p-0 text-left text-sumi">
                          <span className="flex items-center justify-between gap-1.5">
                            <span className="text-[15px] font-semibold leading-[22px]">{v.romajiName || v.speakerName}</span>
                            {selected && <Icon name="check_circle" size={22} fill style={{ color: 'var(--ai)' }} />}
                          </span>
                          <span className="font-jp text-[13px] leading-[18px] text-sumi-muted" lang="ja">
                            {v.speakerName}
                          </span>
                          <span className="line-clamp-2 text-[13px] leading-5">{v.description || v.region}</span>
                        </button>
                        <button
                          type="button"
                          className={cx('jc-audiochip self-start', playingId === v.id && 'is-playing')}
                          onClick={() => playSample(v.id)}
                          aria-label={`${playingId === v.id ? 'Dừng' : 'Nghe thử'} giọng ${v.romajiName || v.speakerName}`}
                        >
                          <Icon name={loadingId === v.id ? 'progress_activity' : playingId === v.id ? 'stop_circle' : 'volume_up'} size={18} spin={loadingId === v.id} fill={playingId === v.id} />
                          {playingId === v.id ? 'Dừng' : 'Nghe thử'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Micro và loa */}
            <section id="thietbi" aria-labelledby="tb-h" className="flex scroll-mt-6 flex-col gap-[18px] rounded-jc-lg border border-line bg-paper-50 p-6">
              <div className="flex flex-col gap-0.5">
                <h2 id="tb-h" className="m-0 text-[19px] font-semibold leading-7">
                  Micro và loa
                </h2>
                <p className="m-0 text-sm leading-[22px] text-sumi-muted">Kiểm tra trước khi vào phòng luyện để điểm phát âm được chấm chính xác.</p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-3 rounded-jc-lg bg-paper-100 p-4">
                  <Select
                    label="Micro thu âm"
                    options={deviceOptions('audioinput')}
                    value={selectedInputId}
                    onChange={(e) => saveDevices(e.target.value, selectedOutputId)}
                  />
                  <p className="m-0 text-[13px] leading-5 text-sumi-muted">Nói thử để xem mức âm và kiểm tra micro nghe rõ giọng bạn.</p>
                  <div className="mt-auto flex justify-end">
                    <Button variant="secondary" size="sm" icon="mic" onClick={() => setIsAudioDeviceModalOpen(true)}>
                      Nói thử
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-3 rounded-jc-lg bg-paper-100 p-4">
                  <Select
                    label="Loa hoặc tai nghe"
                    options={deviceOptions('audiooutput')}
                    value={selectedOutputId}
                    onChange={(e) => saveDevices(selectedInputId, e.target.value)}
                  />
                  <p className="m-0 text-[13px] leading-5 text-sumi-muted">Phát một câu mẫu tiếng Nhật để chỉnh âm lượng vừa nghe.</p>
                  <div className="mt-auto flex justify-end">
                    <Button variant="secondary" size="sm" icon="volume_up" loading={loadingId === selectedVoiceId} onClick={() => playSample(selectedVoiceId)}>
                      Phát âm thanh thử
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* Khi luyện tập */}
            <section id="luyentap" aria-labelledby="lt-h" className="flex scroll-mt-6 flex-col gap-1.5 rounded-jc-lg border border-line bg-paper-50 p-6">
              <h2 id="lt-h" className="mb-1.5 mt-0 text-[19px] font-semibold leading-7">
                Khi luyện tập
              </h2>
              <Switch label="Hiện furigana" description="Cách đọc nhỏ phía trên chữ Kanji." checked={prefs.furigana} onChange={(v) => setPref('furigana', v)} />
              <Switch label="Hiện nghĩa tiếng Việt" description="Tự hiện bản dịch dưới mỗi câu. Tắt thì chỉ hiện khi bạn bấm Dịch." checked={prefs.translation} onChange={(v) => setPref('translation', v)} />
              <Switch label="Tự động phát giọng AI" description="AI đọc to câu trả lời ngay khi hiện ra." checked={prefs.autoPlay} onChange={(v) => setPref('autoPlay', v)} />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium leading-[22px]">Tốc độ đọc của AI</span>
                  <span className="text-[13px] leading-5 text-sumi-muted">Người mới nên bắt đầu ở mức chậm.</span>
                </span>
                <SegmentedControl
                  ariaLabel="Tốc độ đọc"
                  value={String(speechRate)}
                  onChange={(v) => {
                    const rate = parseFloat(v);
                    setSpeechRate(rate);
                    scenarioVoiceService.setSpeechRate(rate);
                  }}
                  options={[
                    { value: '0.8', label: 'Chậm' },
                    { value: '1', label: 'Vừa' },
                    { value: '1.2', label: 'Nhanh' },
                  ]}
                />
              </div>
            </section>

            {/* Giao diện: Sáng / Tối / Theo máy, lưu ở trình duyệt (ThemeProvider) */}
            <section id="giaodien" aria-labelledby="gd-h" className="flex scroll-mt-6 flex-wrap items-center justify-between gap-3 rounded-jc-lg border border-line bg-paper-50 p-6">
              <span className="flex flex-col">
                <h2 id="gd-h" className="m-0 text-[19px] font-semibold leading-7">
                  Giao diện
                </h2>
                <span className="text-sm leading-[22px] text-sumi-muted">Chế độ tối dùng cả trong phòng luyện.</span>
              </span>
              <SegmentedControl
                ariaLabel="Chế độ màu"
                value={themeMode}
                onChange={(v) => setThemeMode(v as ThemeMode)}
                options={[
                  { value: 'light', label: 'Sáng', icon: 'light_mode' },
                  { value: 'dark', label: 'Tối', icon: 'dark_mode' },
                  { value: 'system', label: 'Theo máy', icon: 'computer' },
                ]}
              />
            </section>
          </div>
        </div>
      </div>

      {/* Nói thử micro: tái dùng modal kiểm tra thiết bị có sẵn (đo mức âm, ghi thử) */}
      <AudioDeviceSettingsModal
        isOpen={isAudioDeviceModalOpen}
        onClose={() => setIsAudioDeviceModalOpen(false)}
        selectedInputId={selectedInputId}
        selectedOutputId={selectedOutputId}
        onSave={saveDevices}
      />
    </div>
  );
};
