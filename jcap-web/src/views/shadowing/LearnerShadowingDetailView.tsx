import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingDialogueDetail, ShadowingSentenceItem } from '../../types/shadowing';
import { Button } from '../../components/ui/Button';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';

export const LearnerShadowingDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [dialogue, setDialogue] = useState<ShadowingDialogueDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio playback state
  const [playingSentenceId, setPlayingSentenceId] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sequential play state
  const [isSequentialPlaying, setIsSequentialPlaying] = useState<boolean>(false);
  const sequentialIndexRef = useRef<number>(0);

  // Role selection modal
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    const fetchDetail = async () => {
      setIsLoading(true);
      const res = await shadowingService.getDetail(parseInt(id, 10));
      if (res.success && res.data) {
        setDialogue(res.data);
      } else {
        setErrorMessage(res.message || 'Không thể tải chi tiết bài học.');
      }
      setIsLoading(false);
    };
    fetchDetail();
  }, [id]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingSentenceId(null);
    setIsSequentialPlaying(false);
  };

  const playSentence = (sentence: ShadowingSentenceItem) => {
    stopAudio();
    setAudioError(null);

    const audio = new Audio(sentence.nativeAudioUrl);
    audioRef.current = audio;
    setPlayingSentenceId(sentence.id);

    audio.onended = () => {
      setPlayingSentenceId(null);
      if (isSequentialPlaying && dialogue) {
        playNextSequential();
      }
    };

    audio.onerror = () => {
      setAudioError(`Không thể phát âm thanh của câu #${sentence.orderIndex}.`);
      setPlayingSentenceId(null);
      setIsSequentialPlaying(false);
    };

    audio.play().catch(() => {
      setAudioError('Trình duyệt đã chặn tự động phát âm thanh.');
      setPlayingSentenceId(null);
      setIsSequentialPlaying(false);
    });
  };

  const playNextSequential = () => {
    if (!dialogue) return;
    const nextIdx = sequentialIndexRef.current + 1;
    if (nextIdx < dialogue.sentences.length) {
      sequentialIndexRef.current = nextIdx;
      playSentence(dialogue.sentences[nextIdx]);
    } else {
      setIsSequentialPlaying(false);
      sequentialIndexRef.current = 0;
    }
  };

  const handlePlayAll = () => {
    if (isSequentialPlaying) {
      stopAudio();
      return;
    }
    if (!dialogue || dialogue.sentences.length === 0) return;
    setIsSequentialPlaying(true);
    sequentialIndexRef.current = 0;
    playSentence(dialogue.sentences[0]);
  };

  const handleConfirmRole = (selectedRole: 'A' | 'B') => {
    setIsRoleModalOpen(false);
    // TV4 -> TV5 Canonical Route Handoff
    navigate(`/shadowing/${dialogue?.id}/practice?role=${selectedRole}`);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse p-6">
        <div className="h-6 bg-gray-200 rounded w-1/3"></div>
        <div className="h-32 bg-gray-200 rounded-xl"></div>
        <div className="h-64 bg-gray-200 rounded-xl"></div>
      </div>
    );
  }

  if (errorMessage || !dialogue) {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded-xl border border-red-200 text-center space-y-4">
        <p className="text-red-600 font-medium">{errorMessage || 'Không tìm thấy bài học.'}</p>
        <Button variant="secondary" onClick={() => navigate('/shadowing')}>
          Quay lại Thư viện
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#71809A]">
        <Link to="/shadowing" className="hover:text-[#0878EE]">
          Thư viện Shadowing
        </Link>
        <span>/</span>
        <span className="text-[#071A44] font-medium truncate">{dialogue.title}</span>
      </nav>

      {/* Dialogue Overview Card */}
      <div className="bg-white rounded-xl border border-[#E6EDF5] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                dialogue.jlptLevel === 'N5'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : dialogue.jlptLevel === 'N4'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
              }`}
            >
              JLPT {dialogue.jlptLevel}
            </span>
            <span className="text-xs text-[#71809A]">
              Kịch bản: <strong>{dialogue.scenarioTitle}</strong>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-[#071A44]">{dialogue.title}</h1>

          {dialogue.sourceDescription && (
            <p className="text-xs text-[#71809A] max-w-xl">{dialogue.sourceDescription}</p>
          )}

          <div className="flex items-center gap-4 text-xs text-[#071A44] pt-2">
            <span>Vai A: <strong className="text-[#0878EE]">{dialogue.speakerRoleA_Name}</strong></span>
            <span>•</span>
            <span>Vai B: <strong className="text-purple-700">{dialogue.speakerRoleB_Name}</strong></span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch md:items-center gap-3">
          <Button
            variant="secondary"
            onClick={handlePlayAll}
            className="flex items-center justify-center gap-2"
          >
            <span>{isSequentialPlaying ? '⏸️' : '▶️'}</span>
            <span>{isSequentialPlaying ? 'Dừng phát' : 'Nghe toàn bài'}</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsRoleModalOpen(true)}
            className="whitespace-nowrap"
          >
            Chọn vai luyện tập ➔
          </Button>
        </div>
      </div>

      {audioError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center justify-between">
          <span>⚠️ {audioError}</span>
          <button onClick={() => setAudioError(null)} className="text-red-500 font-bold">×</button>
        </div>
      )}

      {/* Sentences Script Viewer */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-[#071A44] uppercase tracking-wider">
          Kịch bản đối thoại song ngữ ({dialogue.sentences.length} câu)
        </h2>

        <div className="space-y-3">
          {dialogue.sentences.map((s) => {
            const isRoleA = s.speakerRole === 'A';
            const isPlaying = playingSentenceId === s.id;

            return (
              <div
                key={s.id}
                className={`p-4 rounded-xl border transition-all flex items-start gap-4 ${
                  isPlaying
                    ? 'border-[#0878EE] bg-blue-50/40 ring-1 ring-[#0878EE]'
                    : isRoleA
                    ? 'bg-white border-[#E6EDF5]'
                    : 'bg-slate-50/60 border-[#E6EDF5]'
                }`}
              >
                {/* Audio Play Button */}
                <button
                  type="button"
                  onClick={() => playSentence(s)}
                  className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    isPlaying
                      ? 'bg-[#0878EE] text-white shadow-sm'
                      : 'bg-white border border-[#E6EDF5] text-[#0878EE] hover:bg-blue-50'
                  }`}
                  title="Nghe phát âm chuẩn câu này"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                {/* Sentence Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isRoleA
                          ? 'bg-blue-100 text-[#0878EE]'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {isRoleA ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name}
                    </span>
                    <span className="text-xs text-[#71809A]">#{s.orderIndex}</span>
                  </div>

                  {/* Japanese text (Large font) */}
                  <p className="text-lg font-semibold text-[#071A44] leading-relaxed">
                    {s.japaneseText}
                  </p>

                  {/* Romaji */}
                  {s.romajiText && (
                    <p className="text-xs text-[#71809A] font-mono">
                      {s.romajiText}
                    </p>
                  )}

                  {/* Vietnamese */}
                  <p className="text-sm text-slate-700 pt-0.5">
                    {s.vietnameseTranslation}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Role Selection Modal */}
      <RoleSelectionModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        dialogueId={dialogue.id}
        dialogueTitle={dialogue.title}
        roleAName={dialogue.speakerRoleA_Name}
        roleBName={dialogue.speakerRoleB_Name}
        onConfirm={handleConfirmRole}
      />
    </div>
  );
};
