import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { VoiceOption, voicevoxService } from '../../services/voicevoxService';

export interface AiVoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoiceId?: number;
  availableVoices?: VoiceOption[];
  onSave: (voiceId: number) => void;
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

const REGION_OPTIONS = [
  { key: 'ALL', label: 'Tất cả các vùng' },
  { key: 'Tohoku', label: 'Vùng Tohoku (Đông Bắc)' },
  { key: 'Kanto', label: 'Vùng Kanto (Tokyo, Saitama)' },
  { key: 'Kansai', label: 'Vùng Kansai (Kyoto, Nara)' },
  { key: 'Chubu', label: 'Vùng Chubu (Nagoya, Toyama...)' },
  { key: 'Kyushu', label: 'Vùng Kyushu (Cửu Châu)' },
  { key: 'Shikoku', label: 'Vùng Shikoku (Tứ Quốc)' },
  { key: 'Chugoku', label: 'Vùng Chugoku' },
  { key: 'Hokkaido', label: 'Vùng Hokkaido' },
  { key: 'Other', label: 'Toàn quốc & Khác' },
] as const;

const getRegionCategory = (regionStr: string): string => {
  const r = (regionStr || '').toLowerCase();
  if (
    r.includes('tohoku') ||
    r.includes('sendai') ||
    r.includes('miyagi') ||
    r.includes('aomori') ||
    r.includes('akita') ||
    r.includes('fukushima') ||
    r.includes('shirakami')
  ) {
    return 'Tohoku';
  }
  if (r.includes('shikoku')) {
    return 'Shikoku';
  }
  if (r.includes('kansai') || r.includes('kyoto') || r.includes('nara')) {
    return 'Kansai';
  }
  if (
    r.includes('chubu') ||
    r.includes('toyama') ||
    r.includes('nagano') ||
    r.includes('nagoya') ||
    r.includes('hokuriku')
  ) {
    return 'Chubu';
  }
  if (r.includes('kyushu') || r.includes('oita') || r.includes('bungo')) {
    return 'Kyushu';
  }
  if (r.includes('chugoku') || r.includes('hiroshima')) {
    return 'Chugoku';
  }
  if (r.includes('mombetsu') || r.includes('hokkaido')) {
    return 'Hokkaido';
  }
  if (r.includes('kanto') || r.includes('tokyo') || r.includes('saitama')) {
    return 'Kanto';
  }
  return 'Other';
};

export const AiVoiceSettingsModal: React.FC<AiVoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  selectedVoiceId,
  availableVoices = [],
  onSave,
}) => {
  const [currentVoiceId, setCurrentVoiceId] = useState<number>(selectedVoiceId || 3);
  const [voiceCategory, setVoiceCategory] = useState<'ALL' | 'Female' | 'Male' | 'Mascot'>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedCharacterName, setSelectedCharacterName] = useState<string>('');
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Đếm số lượng theo danh mục giới tính
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

  // Đếm số lượng theo vùng tương ứng với danh mục giới tính hiện tại
  const regionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    characterGroups.forEach((c) => {
      if (voiceCategory === 'ALL' || c.gender.toLowerCase() === voiceCategory.toLowerCase()) {
        const regKey = getRegionCategory(c.region);
        map[regKey] = (map[regKey] || 0) + 1;
      }
    });
    return map;
  }, [characterGroups, voiceCategory]);

  // Lọc nhân vật theo cả Giới tính và Vùng miền
  const filteredCharacters = useMemo(() => {
    return characterGroups.filter((c) => {
      const matchCategory =
        voiceCategory === 'ALL' || c.gender.toLowerCase() === voiceCategory.toLowerCase();
      const matchRegion =
        selectedRegion === 'ALL' || getRegionCategory(c.region) === selectedRegion;
      return matchCategory && matchRegion;
    });
  }, [characterGroups, voiceCategory, selectedRegion]);

  useEffect(() => {
    if (isOpen) {
      const initialVoiceId =
        selectedVoiceId || Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3;
      setCurrentVoiceId(initialVoiceId);

      const foundChar = characterGroups.find((c) => c.styles.some((s) => s.id === initialVoiceId));
      if (foundChar) {
        setSelectedCharacterName(foundChar.speakerName);
        if (
          voiceCategory !== 'ALL' &&
          foundChar.gender.toLowerCase() !== voiceCategory.toLowerCase()
        ) {
          setVoiceCategory('ALL');
        }
        if (selectedRegion !== 'ALL' && getRegionCategory(foundChar.region) !== selectedRegion) {
          setSelectedRegion('ALL');
        }
      } else if (characterGroups.length > 0) {
        setSelectedCharacterName(characterGroups[0].speakerName);
      }

      setPreviewError(null);
    } else {
      stopPreviewAudio();
    }
  }, [isOpen, selectedVoiceId, characterGroups]);

  useEffect(() => {
    return () => {
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

  // Lấy nhân vật đang chọn
  const activeCharacter = useMemo(() => {
    return (
      filteredCharacters.find((c) => c.speakerName === selectedCharacterName) ||
      filteredCharacters[0] ||
      characterGroups[0]
    );
  }, [filteredCharacters, selectedCharacterName, characterGroups]);

  const handleCategoryChange = (cat: 'ALL' | 'Female' | 'Male' | 'Mascot') => {
    setVoiceCategory(cat);
    stopPreviewAudio();

    let activeReg = selectedRegion;
    const matchCategoryAndCurrentRegion = characterGroups.some(
      (c) =>
        (cat === 'ALL' || c.gender.toLowerCase() === cat.toLowerCase()) &&
        (selectedRegion === 'ALL' || getRegionCategory(c.region) === selectedRegion)
    );
    if (!matchCategoryAndCurrentRegion) {
      activeReg = 'ALL';
      setSelectedRegion('ALL');
    }

    const newFiltered = characterGroups.filter((c) => {
      const matchCat = cat === 'ALL' || c.gender.toLowerCase() === cat.toLowerCase();
      const matchReg = activeReg === 'ALL' || getRegionCategory(c.region) === activeReg;
      return matchCat && matchReg;
    });

    if (newFiltered.length > 0 && !newFiltered.some((c) => c.speakerName === selectedCharacterName)) {
      const nextChar = newFiltered[0];
      setSelectedCharacterName(nextChar.speakerName);
      if (nextChar.styles.length > 0) {
        const normalStyle = nextChar.styles.find(
          (s) => s.styleName === 'ノーマル' || s.styleName === 'ふつう'
        );
        setCurrentVoiceId(normalStyle ? normalStyle.id : nextChar.styles[0].id);
      }
    }
  };

  const handleRegionChange = (regKey: string) => {
    setSelectedRegion(regKey);
    stopPreviewAudio();

    const newFiltered = characterGroups.filter((c) => {
      const matchCategory =
        voiceCategory === 'ALL' || c.gender.toLowerCase() === voiceCategory.toLowerCase();
      const matchRegion = regKey === 'ALL' || getRegionCategory(c.region) === regKey;
      return matchCategory && matchRegion;
    });

    if (newFiltered.length > 0 && !newFiltered.some((c) => c.speakerName === selectedCharacterName)) {
      const nextChar = newFiltered[0];
      setSelectedCharacterName(nextChar.speakerName);
      if (nextChar.styles.length > 0) {
        const normalStyle = nextChar.styles.find(
          (s) => s.styleName === 'ノーマル' || s.styleName === 'ふつう'
        );
        setCurrentVoiceId(normalStyle ? normalStyle.id : nextChar.styles[0].id);
      }
    }
  };

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

  const handleSave = () => {
    stopPreviewAudio();
    if (currentVoiceId) {
      localStorage.setItem('jcap_voicevox_selected_id', currentVoiceId.toString());
    }
    onSave(currentVoiceId);
    onClose();
  };

  const categories = [
    { key: 'ALL', label: `Tất cả (${counts.all})` },
    { key: 'Female', label: `Nữ (${counts.female})` },
    { key: 'Male', label: `Nam (${counts.male})` },
    { key: 'Mascot', label: `Anime & Khác (${counts.mascot})` },
  ] as const;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopPreviewAudio();
        onClose();
      }}
      title={
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🎙️</span>
            <span className="font-bold text-[#071A44] text-base sm:text-lg">
              Cài đặt giọng đọc AI (VOICEVOX TTS)
            </span>
          </div>
          <p className="text-xs text-[#556987] font-normal mt-0.5">
            Chọn giọng đọc AI chuẩn Nhật ngữ cho toàn bộ hệ thống (Hội thoại & Shadowing)
          </p>
        </div>
      }
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => {
              stopPreviewAudio();
              onClose();
            }}
            className="text-xs font-semibold text-[#556987] hover:text-[#071A44] px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Hủy bỏ
          </button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Lưu cài đặt
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {availableVoices.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>⚠️</span> VOICEVOX Engine chưa sẵn sàng
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Hệ thống đang sử dụng giọng đọc mặc định của trình duyệt. Hãy mở ứng dụng VOICEVOX trên máy để trải nghiệm các giọng đọc AI tự nhiên chất lượng cao.
            </p>
          </div>
        ) : (
          <>
            {/* 1. Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {categories.map((cat) => {
                const isActive = voiceCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => handleCategoryChange(cat.key as any)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#0878EE] text-white shadow-xs font-semibold'
                        : 'bg-[#F1F5F9] text-[#556987] hover:bg-[#E2E8F0] hover:text-[#071A44]'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* 2. Character, Style & Region Pickers Grid (3 Cột) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Cột 1: Nhân vật */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#071A44]">
                  Nhân vật
                </label>
                <select
                  value={activeCharacter?.speakerName || ''}
                  onChange={(e) => handleCharacterChange(e.target.value)}
                  className="w-full bg-white border border-[#CBD5E1] focus:border-[#0878EE] focus:ring-2 focus:ring-[#0878EE]/20 text-[#071A44] text-xs font-medium rounded-xl px-2.5 py-2.5 outline-none transition-all cursor-pointer shadow-2xs truncate"
                >
                  {filteredCharacters.length === 0 ? (
                    <option value="">(Không có nhân vật)</option>
                  ) : (
                    filteredCharacters.map((c) => (
                      <option key={c.speakerName} value={c.speakerName}>
                        {c.speakerName} ({c.romajiName})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Cột 2: Phong cách giọng */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#071A44]">
                  Phong cách giọng
                </label>
                <select
                  value={currentVoiceId}
                  onChange={(e) => {
                    setCurrentVoiceId(Number(e.target.value));
                    stopPreviewAudio();
                  }}
                  disabled={!activeCharacter || activeCharacter.styles.length === 0}
                  className="w-full bg-white border border-[#CBD5E1] focus:border-[#0878EE] focus:ring-2 focus:ring-[#0878EE]/20 text-[#071A44] text-xs font-medium rounded-xl px-2.5 py-2.5 outline-none transition-all cursor-pointer shadow-2xs truncate disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  {activeCharacter?.styles.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.styleVietnamese} ({st.styleName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Cột 3: Lọc theo vùng (bên phải của phong cách giọng) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#071A44]">
                  Lọc theo vùng
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => handleRegionChange(e.target.value)}
                  className="w-full bg-white border border-[#CBD5E1] focus:border-[#0878EE] focus:ring-2 focus:ring-[#0878EE]/20 text-[#071A44] text-xs font-medium rounded-xl px-2.5 py-2.5 outline-none transition-all cursor-pointer shadow-2xs truncate"
                >
                  {REGION_OPTIONS.map((reg) => {
                    const totalMatching =
                      reg.key === 'ALL'
                        ? characterGroups.filter(
                            (c) =>
                              voiceCategory === 'ALL' ||
                              c.gender.toLowerCase() === voiceCategory.toLowerCase()
                          ).length
                        : regionCounts[reg.key] || 0;
                    return (
                      <option
                        key={reg.key}
                        value={reg.key}
                        disabled={totalMatching === 0 && reg.key !== 'ALL'}
                      >
                        {reg.label} ({totalMatching})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* 3. Character Info Card */}
            {activeCharacter && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-sm text-[#071A44]">
                      {activeCharacter.speakerName}
                    </span>
                    <span className="text-xs text-[#71809A]">
                      {activeCharacter.romajiName}
                    </span>
                  </div>
                  {activeCharacter.region && (
                    <span className="text-[11px] font-medium text-[#0878EE] bg-blue-50/80 border border-blue-100/80 px-2.5 py-0.5 rounded-full shrink-0">
                      {activeCharacter.region}
                    </span>
                  )}
                </div>
                {activeCharacter.description && (
                  <p className="text-xs text-[#556987] leading-relaxed line-clamp-2">
                    {activeCharacter.description}
                  </p>
                )}
              </div>
            )}

            {/* 4. Audio Preview Component */}
            <div className="space-y-1.5 pt-0.5">
              <span className="text-[11px] font-bold text-[#71809A] uppercase tracking-wider block">
                Nghe thử
              </span>
              <div className="bg-[#F8FAFD] border border-[#BCDDFB] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 text-[#0878EE] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    <span className="text-base">{isPlayingPreview ? '🔊' : '🔈'}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#071A44] leading-relaxed">
                      「こんにちは！シャドーイングの練習を始めましょう。」
                    </p>
                    {previewError && (
                      <p className="text-[11px] text-red-500 font-medium mt-0.5">
                        {previewError}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePlayVoicePreview}
                  disabled={availableVoices.length === 0}
                  className={`shrink-0 self-end sm:self-center inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                    isPlayingPreview
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-[#0878EE] hover:bg-[#0662C6] text-white'
                  }`}
                >
                  <span>{isPlayingPreview ? 'Dừng' : 'Nghe thử'}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

