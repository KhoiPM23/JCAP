import React, { useState, useEffect, useRef, useMemo } from 'react';
import { voicevoxService, type VoiceOption } from '../services/voicevoxService';

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

export const VoiceVoxTestView: React.FC = () => {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<number>(3); // 3: Zundamon (Normal)
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'Female' | 'Male' | 'Mascot'>('ALL');
  const [selectedCharacterName, setSelectedCharacterName] = useState<string>('');
  const [text, setText] = useState<string>('今日はいい天気ですね。一緒に日本語を勉強しましょう！');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEngineReady, setIsEngineReady] = useState<boolean | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Nhóm danh sách voice theo nhân vật
  const characterGroups = useMemo<CharacterGroup[]>(() => {
    const map = new Map<string, CharacterGroup>();
    voices.forEach((v) => {
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
  }, [voices]);

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

  // Lọc nhân vật theo category
  const filteredCharacters = useMemo(() => {
    if (selectedCategory === 'ALL') return characterGroups;
    return characterGroups.filter(
      (c) => c.gender.toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [characterGroups, selectedCategory]);

  const activeCharacter = useMemo(() => {
    return (
      characterGroups.find((c) => c.speakerName === selectedCharacterName) ||
      filteredCharacters[0] ||
      characterGroups[0]
    );
  }, [characterGroups, selectedCharacterName, filteredCharacters]);

  const fetchVoices = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await voicevoxService.getVoices();
      setVoices(list);
      setIsEngineReady(true);
      if (list.length > 0 && !list.some((v) => v.id === selectedVoiceId)) {
        setSelectedVoiceId(list[0].id);
      }
    } catch (err: any) {
      setIsEngineReady(false);
      setErrorMessage(err.message || 'VOICEVOX Engine is not running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVoices();

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      voicevoxService.clearCache();
    };
  }, []);

  useEffect(() => {
    if (characterGroups.length > 0 && !selectedCharacterName) {
      const foundChar = characterGroups.find((c) => c.styles.some((s) => s.id === selectedVoiceId));
      if (foundChar) {
        setSelectedCharacterName(foundChar.speakerName);
      } else {
        setSelectedCharacterName(characterGroups[0].speakerName);
      }
    }
  }, [characterGroups, selectedVoiceId, selectedCharacterName]);

  const handleCharacterChange = (charName: string) => {
    setSelectedCharacterName(charName);
    const char = characterGroups.find((c) => c.speakerName === charName);
    if (char && char.styles.length > 0) {
      const normalStyle = char.styles.find(
        (s) => s.styleName === 'ノーマル' || s.styleName === 'ふつう'
      );
      setSelectedVoiceId(normalStyle ? normalStyle.id : char.styles[0].id);
    }
    handleStop();
  };

  const handlePlay = async () => {
    if (!text.trim()) return;

    handleStop();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const audioUrl = await voicevoxService.getAudioUrl(text, selectedVoiceId);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;

      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        audioPlayerRef.current = null;
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setErrorMessage('Không thể phát file âm thanh WAV trả về từ Backend.');
      };

      await audio.play();
    } catch (err: any) {
      setIsPlaying(false);
      setErrorMessage(err.message || 'Lỗi khi gọi VOICEVOX TTS.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
      } catch {}
      audioPlayerRef.current = null;
    }
    setIsPlaying(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 bg-white rounded-3xl shadow-md border border-slate-200 mt-8 mb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-xs font-semibold text-[#005ab6] mb-2">
            <span>🇯🇵</span>
            <span>VOICEVOX TTS Engine (Local POC)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-[#005ab6]">graphic_eq</span>
            <span>Thử nghiệm Text-to-Speech Tiếng Nhật</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kiểm tra chất lượng phát âm và ngữ điệu tự nhiên của VOICEVOX theo phân loại giọng trước khi luyện Shadowing.
          </p>
        </div>

        {/* Engine Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`w-3 h-3 rounded-full ${
              isEngineReady === true
                ? 'bg-emerald-500 animate-pulse'
                : isEngineReady === false
                ? 'bg-rose-500'
                : 'bg-amber-400'
            }`}
          />
          <span className="text-xs font-bold text-slate-700">
            {isEngineReady === true
              ? 'Engine đang chạy (Port 50021)'
              : isEngineReady === false
              ? 'Engine chưa kết nối'
              : 'Đang kiểm tra...'}
          </span>
          <button
            onClick={fetchVoices}
            title="Tải lại danh sách voice"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Warning Alert if Engine is offline */}
      {isEngineReady === false && (
        <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
            <span className="material-symbols-outlined text-[20px] text-amber-600">warning</span>
            <span>VOICEVOX Engine chưa chạy ở cổng 50021</span>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            Vui lòng mở ứng dụng VOICEVOX trên máy để Engine tự động lắng nghe ở cổng 50021.
          </p>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form Controls */}
      <div className="mt-6 space-y-5">
        {/* Category Filter Tabs */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            1. Phân loại chất giọng:
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-[#005ab6] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🌟 Tất cả ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('Female')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                selectedCategory === 'Female'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-pink-50 hover:text-pink-700'
              }`}
            >
              🌸 Giọng Nữ ({counts.female})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('Male')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                selectedCategory === 'Male'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              👔 Giọng Nam ({counts.male})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('Mascot')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                selectedCategory === 'Mascot'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              ✨ Mascot & Anime ({counts.mascot})
            </button>
          </div>
        </div>

        {/* Character & Style Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              2. Chọn nhân vật ({filteredCharacters.length}):
            </label>
            <select
              value={activeCharacter?.speakerName || ''}
              onChange={(e) => handleCharacterChange(e.target.value)}
              disabled={filteredCharacters.length === 0}
              className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#005ab6] focus:outline-none transition cursor-pointer"
            >
              {filteredCharacters.map((c) => (
                <option key={c.speakerName} value={c.speakerName}>
                  {c.gender === 'Female' ? '🌸' : c.gender === 'Male' ? '👔' : '✨'} {c.speakerName} ({c.romajiName}) — {c.region}
                </option>
              ))}
            </select>
            {activeCharacter && (
              <div className="space-y-1 mt-1.5">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <span>📍 Vùng:</span>
                  <span>{activeCharacter.region}</span>
                </div>
                {activeCharacter.description && (
                  <p className="text-[11px] text-[#005ab6] font-medium italic">
                    💡 {activeCharacter.description}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              3. Chọn phong cách cảm xúc:
            </label>
            <select
              value={selectedVoiceId}
              onChange={(e) => {
                setSelectedVoiceId(Number(e.target.value));
                handleStop();
              }}
              disabled={!activeCharacter || activeCharacter.styles.length === 0}
              className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#005ab6] focus:outline-none transition cursor-pointer"
            >
              {activeCharacter?.styles.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.styleVietnamese} ({st.styleName}) [ID: {st.id}]
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Voice ID hiện tại: <span className="font-mono font-bold text-slate-800">{selectedVoiceId}</span>
            </p>
          </div>
        </div>

        {/* Text Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Văn bản tiếng Nhật cần đọc:
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setText('いらっしゃいませ。ご注文はお決まりですか。')}
                className="text-[11px] text-[#005ab6] hover:underline cursor-pointer"
              >
                Mẫu 1 (Quán ăn)
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => setText('すみません、この電車は新宿に行きますか。')}
                className="text-[11px] text-[#005ab6] hover:underline cursor-pointer"
              >
                Mẫu 2 (Hỏi đường)
              </button>
            </div>
          </div>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nhập câu tiếng Nhật vào đây..."
            className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-[#005ab6] focus:outline-none transition font-medium"
          />
        </div>

        {/* Play / Stop Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handlePlay}
            disabled={isLoading || !text.trim()}
            className="flex-1 py-3 px-6 rounded-xl bg-[#005ab6] hover:bg-[#00458f] text-white font-bold text-sm shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Đang tổng hợp giọng nói qua Backend...</span>
              </>
            ) : isPlaying ? (
              <>
                <span className="material-symbols-outlined text-[20px] animate-pulse">volume_up</span>
                <span>Đang phát âm thanh...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                <span>Phát giọng VOICEVOX</span>
              </>
            )}
          </button>

          {isPlaying && (
            <button
              type="button"
              onClick={handleStop}
              className="py-3 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">stop</span>
              <span>Dừng</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

