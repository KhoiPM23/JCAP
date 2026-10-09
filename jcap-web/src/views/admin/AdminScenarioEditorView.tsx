import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { scenarioService } from '../../services/scenarioService';
import type {
  MissionItem,
  VocabularyItem,
  GrammarItem,
  LevelConfigState,
} from './AdminScenarioListView';

// Giới hạn độ dài Vai AI (khớp cột DB ScenarioLevelConfiguration.AiPersona = 100 ký tự)
const AI_PERSONA_MAX_LENGTH = 100;

interface ScenarioFormData {
  title: string;
  description: string;
  scenarioCode: string;
  thumbnail: string;
  isActive: boolean;
  levels: Record<'N5' | 'N4' | 'N3', LevelConfigState>;
}

// Khởi tạo các hàng trống (hiển thị placeholder như hình 2, không tự động điền sẵn văn bản mẫu)
const createDefaultLevelsState = (): Record<'N5' | 'N4' | 'N3', LevelConfigState> => ({
  N5: {
    jlptLevel: 'N5',
    enabled: false,
    title: '',
    description: '',
    aiPersona: '',
    creditCost: 5,
    status: 'Published',
    missions: [
      { order: 1, content: '', intent: 'CompleteMission', target: '' },
      { order: 2, content: '', intent: 'CompleteMission', target: '' },
      { order: 3, content: '', intent: 'CompleteMission', target: '' },
    ],
    targetVocabularies: [
      { word: '', reading: '', meaning: '' },
      { word: '', reading: '', meaning: '' },
      { word: '', reading: '', meaning: '' },
    ],
    targetGrammars: [
      { pattern: '', meaning: '', exampleSentence: '' },
      { pattern: '', meaning: '', exampleSentence: '' },
    ],
    isExpanded: false,
  },
  N4: {
    jlptLevel: 'N4',
    enabled: false,
    title: '',
    description: '',
    aiPersona: '',
    creditCost: 5,
    status: 'Published',
    missions: [
      { order: 1, content: '', intent: 'CompleteMission', target: '' },
      { order: 2, content: '', intent: 'CompleteMission', target: '' },
      { order: 3, content: '', intent: 'CompleteMission', target: '' },
    ],
    targetVocabularies: [
      { word: '', reading: '', meaning: '' },
      { word: '', reading: '', meaning: '' },
      { word: '', reading: '', meaning: '' },
    ],
    targetGrammars: [
      { pattern: '', meaning: '', exampleSentence: '' },
      { pattern: '', meaning: '', exampleSentence: '' },
    ],
    isExpanded: false,
  },
  N3: {
    jlptLevel: 'N3',
    enabled: false,
    title: '',
    description: '',
    aiPersona: '',
    creditCost: 5,
    status: 'Published',
    missions: [
      { order: 1, content: '', intent: 'CompleteMission', target: '' },
      { order: 2, content: '', intent: 'CompleteMission', target: '' },
      { order: 3, content: '', intent: 'CompleteMission', target: '' },
    ],
    targetVocabularies: [
      { word: '', reading: '', meaning: '' },
      { word: '', reading: '', meaning: '' },
      { word: '', reading: '', meaning: '' },
    ],
    targetGrammars: [
      { pattern: '', meaning: '', exampleSentence: '' },
      { pattern: '', meaning: '', exampleSentence: '' },
    ],
    isExpanded: false,
  },
});

export const AdminScenarioEditorView: React.FC = () => {
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id?: string }>();
  const location = useLocation();

  // Xác định ID kịch bản (nếu là trang edit)
  const stateScenarioId = (location.state as { scenarioId?: number } | null)?.scenarioId;
  const scenarioId = paramId ? parseInt(paramId, 10) : (stateScenarioId || null);
  const isEditMode = Boolean(scenarioId && scenarioId > 0);

  const [isLoading, setIsLoading] = useState<boolean>(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal xác nhận hủy bỏ
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);

  // Chế độ chọn ảnh (Thumbnail): 'local' (tải từ máy), 'url' (nhập link), 'ai' (AI gen mock)
  const [imageSourceMode, setImageSourceMode] = useState<'local' | 'url' | 'ai'>('local');
  const [aiImagePrompt, setAiImagePrompt] = useState<string>('');
  const [aiMockNotice, setAiMockNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop state for reordering
  const [draggedMissionIndex, setDraggedMissionIndex] = useState<{ lvl: 'N5' | 'N4' | 'N3'; index: number } | null>(null);
  const [draggedVocabIndex, setDraggedVocabIndex] = useState<{ lvl: 'N5' | 'N4' | 'N3'; index: number } | null>(null);
  const [draggedGrammarIndex, setDraggedGrammarIndex] = useState<{ lvl: 'N5' | 'N4' | 'N3'; index: number } | null>(null);

  const [formData, setFormData] = useState<ScenarioFormData>({
    title: '',
    description: '',
    scenarioCode: '',
    thumbnail: '',
    isActive: true,
    levels: createDefaultLevelsState(),
  });

  // Tải chi tiết kịch bản khi vào chế độ Edit
  useEffect(() => {
    if (!isEditMode || !scenarioId) return;

    let isMounted = true;
    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await scenarioService.getAdminScenarioDetails(scenarioId);
        if (isMounted && res.success && res.data) {
          const full = res.data;
          const loadedLevels = createDefaultLevelsState();

          // Reset tất cả về disabled trước
          (['N5', 'N4', 'N3'] as const).forEach((lvl) => {
            loadedLevels[lvl].enabled = false;
          });

          full.levelConfigurations.forEach((lc) => {
            const lvl = lc.jlptLevel as 'N5' | 'N4' | 'N3';
            if (loadedLevels[lvl]) {
              loadedLevels[lvl] = {
                jlptLevel: lvl,
                enabled: (lc.status || 'Published').toLowerCase() === 'published',
                title: lc.title || `${full.title} (${lvl})`,
                description: lc.description || `Cấu hình ${lvl} cho ${full.title}`,
                aiPersona: lc.aiPersona || '',
                creditCost: lc.creditCost || 5,
                status: lc.status || 'Published',
                missions: (lc.missions || []).map((m, idx) => ({
                  id: m.id,
                  order: m.order || idx + 1,
                  content: m.content || '',
                  target: m.completionCriteria?.target || m.content || '',
                  intent: m.completionCriteria?.intent || 'CompleteMission',
                  conditions: m.completionCriteria?.conditions || [],
                })),
                targetVocabularies: (lc.targetVocabularies || []).map((v) => ({
                  id: v.id,
                  word: v.word || '',
                  reading: v.reading || '',
                  meaning: v.meaning || '',
                })),
                targetGrammars: (lc.targetGrammars || []).map((g) => ({
                  id: g.id,
                  pattern: g.pattern || '',
                  meaning: g.meaning || '',
                  exampleSentence: g.exampleSentence || '',
                })),
                isExpanded: true,
                isAiGenerating: false,
              };
            }
          });

          setFormData({
            title: full.title,
            description: full.description,
            scenarioCode: full.scenarioCode || '',
            thumbnail: full.thumbnail || '',
            isActive: full.isActive,
            levels: loadedLevels,
          });

          // Xác định mode nguồn ảnh ban đầu
          if (full.thumbnail) {
            if (full.thumbnail.startsWith('data:image')) {
              setImageSourceMode('local');
            } else {
              setImageSourceMode('url');
            }
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải chi tiết kịch bản:', err);
        if (isMounted) setError('Không thể tải thông tin chi tiết kịch bản.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDetails();
    return () => {
      isMounted = false;
    };
  }, [isEditMode, scenarioId]);

  // Xử lý chọn ảnh từ máy local (File input sang DataURL)
  const handleLocalImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Giới hạn 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError('Dung lượng hình ảnh không được vượt quá 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setFormData((prev) => ({ ...prev, thumbnail: dataUrl }));
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Xử lý sinh ảnh AI (Mock)
  const handleAiGenerateMock = () => {
    setAiMockNotice(
      'Tính năng AI sinh ảnh tự động đang trong quá trình phát triển (Mock). Đã gán một ảnh mẫu ngẫu nhiên minh họa cho kịch bản.'
    );
    const sampleImages = [
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1528164344705-475426879c0d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&auto=format&fit=crop&q=80',
    ];
    const randomImg = sampleImages[Math.floor(Math.random() * sampleImages.length)];
    setFormData((prev) => ({ ...prev, thumbnail: randomImg }));
  };

  // Xóa ảnh đại diện
  const handleClearImage = () => {
    setFormData((prev) => ({ ...prev, thumbnail: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setAiMockNotice(null);
  };

  const handleToggleLevel = (lvl: 'N5' | 'N4' | 'N3') => {
    setFormData((prev) => {
      const current = prev.levels[lvl].enabled;
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: {
            ...prev.levels[lvl],
            enabled: !current,
            isExpanded: !current,
          },
        },
      };
    });
  };

  const handleToggleExpand = (lvl: 'N5' | 'N4' | 'N3') => {
    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: { ...prev.levels[lvl], isExpanded: !prev.levels[lvl].isExpanded },
      },
    }));
  };

  // AI Generate Level Content
  const handleGenerateAiContent = async (lvl: 'N5' | 'N4' | 'N3') => {
    if (!formData.title.trim()) {
      setError('Vui lòng nhập Tiêu đề kịch bản trước khi tạo nội dung AI.');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: { ...prev.levels[lvl], isAiGenerating: true },
      },
    }));

    // Số lượng cần sinh = số dòng admin đang có (tối thiểu 3) → AI phải điền đủ toàn bộ
    const currentLvl = formData.levels[lvl];
    const missionCount = Math.max(3, currentLvl.missions.length);
    const vocabCount = Math.max(3, currentLvl.targetVocabularies.length);
    const grammarCount = Math.max(3, currentLvl.targetGrammars.length);

    // Gửi kèm các mục đã nhập để AI giữ ý, chỉnh câu chữ, sắp xếp lại và điền thêm
    const existingMissions = currentLvl.missions
      .filter((m) => m.content.trim())
      .map((m) => ({
        id: m.id,
        content: m.content.trim(),
        target: m.target?.trim() || '',
        intent: m.intent,
        conditions: m.conditions,
      }));
    const existingVocabularies = currentLvl.targetVocabularies
      .filter((v) => v.word.trim())
      .map((v) => ({ id: v.id, word: v.word.trim(), reading: v.reading?.trim() || '', meaning: v.meaning.trim() }));
    const existingGrammars = currentLvl.targetGrammars
      .filter((g) => g.pattern.trim())
      .map((g) => ({
        id: g.id,
        pattern: g.pattern.trim(),
        meaning: g.meaning.trim(),
        exampleSentence: g.exampleSentence?.trim() || '',
      }));

    try {
      const res = await scenarioService.generateLevelContent(
        formData.title.trim(),
        formData.description.trim(),
        lvl,
        missionCount,
        vocabCount,
        grammarCount,
        { missions: existingMissions, vocabularies: existingVocabularies, grammars: existingGrammars }
      );

      if (res.success && res.data) {
        const gen = res.data;
        type WithId = { id?: number | null };

        const genMissions: MissionItem[] = (gen.missions || [])
          .filter((m) => m.content?.trim())
          .slice(0, missionCount)
          .map((m, idx) => ({
            id: (m as WithId).id ?? undefined,
            order: idx + 1,
            content: m.content.trim(),
            target: m.target?.trim() || m.content.trim(),
            intent: m.intent || 'CompleteMission',
            conditions: m.conditions || [],
          }));
        const genVocabs: VocabularyItem[] = (gen.targetVocabularies || [])
          .filter((v) => v.word?.trim() && v.meaning?.trim())
          .slice(0, vocabCount)
          .map((v) => ({
            id: (v as WithId).id ?? undefined,
            word: v.word.trim(),
            reading: v.reading?.trim() || '',
            meaning: v.meaning.trim(),
          }));
        const genGrammars: GrammarItem[] = (gen.targetGrammars || [])
          .filter((g) => g.pattern?.trim() && g.meaning?.trim())
          .slice(0, grammarCount)
          .map((g) => ({
            id: (g as WithId).id ?? undefined,
            pattern: g.pattern.trim(),
            meaning: g.meaning.trim(),
            exampleSentence: g.exampleSentence?.trim() || '',
          }));

        // Ràng buộc: phải đủ đúng số lượng, nếu thiếu thì không ghi đè dữ liệu admin
        if (
          genMissions.length < missionCount ||
          genVocabs.length < vocabCount ||
          genGrammars.length < grammarCount
        ) {
          setError(
            `AI chưa sinh đủ nội dung (cần ${missionCount} nhiệm vụ, ${vocabCount} từ vựng, ${grammarCount} ngữ pháp). Vui lòng thử lại.`
          );
          return;
        }

        setFormData((prev) => {
          const prevLvl = prev.levels[lvl];
          return {
            ...prev,
            levels: {
              ...prev.levels,
              [lvl]: {
                ...prevLvl,
                aiPersona: (gen.aiPersona || prevLvl.aiPersona || 'Nhân viên cửa hàng / Đối tác giao tiếp')
                  .trim()
                  .slice(0, AI_PERSONA_MAX_LENGTH),
                missions: genMissions,
                targetVocabularies: genVocabs,
                targetGrammars: genGrammars,
                isExpanded: true,
                isAiGenerating: false,
              },
            },
          };
        });
      } else {
        setError(res.message || 'Không thể tạo nội dung AI.');
      }
    } catch (err) {
      console.error('Lỗi gọi API GenerateLevelContent:', err);
      setError('Lỗi kết nối khi gọi AI sinh nội dung.');
    } finally {
      setFormData((prev) => ({
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], isAiGenerating: false },
        },
      }));
    }
  };

  // Add / remove / change missions
  const handleAddMission = (lvl: 'N5' | 'N4' | 'N3') => {
    setFormData((prev) => {
      const currentList = prev.levels[lvl].missions;
      const newOrder = currentList.length + 1;
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: {
            ...prev.levels[lvl],
            missions: [
              ...currentList,
              { order: newOrder, content: '', target: '', intent: 'CompleteMission' },
            ],
          },
        },
      };
    });
  };

  const handleRemoveMission = (lvl: 'N5' | 'N4' | 'N3', index: number) => {
    setFormData((prev) => {
      const updated = prev.levels[lvl].missions
        .filter((_, idx) => idx !== index)
        .map((m, idx) => ({ ...m, order: idx + 1 }));
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], missions: updated },
        },
      };
    });
  };

  const handleMissionChange = (
    lvl: 'N5' | 'N4' | 'N3',
    index: number,
    field: keyof MissionItem,
    value: string
  ) => {
    setFormData((prev) => {
      const next = [...prev.levels[lvl].missions];
      next[index] = { ...next[index], [field]: value };
      if (field === 'content' && !next[index].target) {
        next[index].target = value;
      }
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], missions: next },
        },
      };
    });
  };

  // Di chuyển thứ tự Mission (Up / Down)
  const handleMoveMission = (lvl: 'N5' | 'N4' | 'N3', index: number, direction: 'up' | 'down') => {
    setFormData((prev) => {
      const list = [...prev.levels[lvl].missions];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      const updated = list.map((m, idx) => ({ ...m, order: idx + 1 }));
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], missions: updated },
        },
      };
    });
  };

  // Drag & drop Mission
  const handleMissionDragStart = (lvl: 'N5' | 'N4' | 'N3', index: number) => {
    setDraggedMissionIndex({ lvl, index });
  };

  const handleMissionDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleMissionDrop = (lvl: 'N5' | 'N4' | 'N3', dropIndex: number) => {
    if (!draggedMissionIndex || draggedMissionIndex.lvl !== lvl) return;
    const fromIndex = draggedMissionIndex.index;
    if (fromIndex === dropIndex) return;

    setFormData((prev) => {
      const list = [...prev.levels[lvl].missions];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(dropIndex, 0, moved);
      const updated = list.map((m, idx) => ({ ...m, order: idx + 1 }));
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], missions: updated },
        },
      };
    });
    setDraggedMissionIndex(null);
  };

  // Add / remove / change vocabulary
  const handleAddVocab = (lvl: 'N5' | 'N4' | 'N3') => {
    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: {
          ...prev.levels[lvl],
          targetVocabularies: [
            ...prev.levels[lvl].targetVocabularies,
            { word: '', reading: '', meaning: '' },
          ],
        },
      },
    }));
  };

  const handleRemoveVocab = (lvl: 'N5' | 'N4' | 'N3', index: number) => {
    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: {
          ...prev.levels[lvl],
          targetVocabularies: prev.levels[lvl].targetVocabularies.filter((_, idx) => idx !== index),
        },
      },
    }));
  };

  const handleVocabChange = (
    lvl: 'N5' | 'N4' | 'N3',
    index: number,
    field: keyof VocabularyItem,
    value: string
  ) => {
    setFormData((prev) => {
      const next = [...prev.levels[lvl].targetVocabularies];
      next[index] = { ...next[index], [field]: value };
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], targetVocabularies: next },
        },
      };
    });
  };

  // Di chuyển thứ tự Từ vựng (Up / Down)
  const handleMoveVocab = (lvl: 'N5' | 'N4' | 'N3', index: number, direction: 'up' | 'down') => {
    setFormData((prev) => {
      const list = [...prev.levels[lvl].targetVocabularies];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], targetVocabularies: list },
        },
      };
    });
  };

  const handleVocabDragStart = (lvl: 'N5' | 'N4' | 'N3', index: number) => {
    setDraggedVocabIndex({ lvl, index });
  };

  const handleVocabDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleVocabDrop = (lvl: 'N5' | 'N4' | 'N3', dropIndex: number) => {
    if (!draggedVocabIndex || draggedVocabIndex.lvl !== lvl) return;
    const fromIndex = draggedVocabIndex.index;
    if (fromIndex === dropIndex) return;

    setFormData((prev) => {
      const list = [...prev.levels[lvl].targetVocabularies];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(dropIndex, 0, moved);
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], targetVocabularies: list },
        },
      };
    });
    setDraggedVocabIndex(null);
  };

  // Add / remove / change grammar
  const handleAddGrammar = (lvl: 'N5' | 'N4' | 'N3') => {
    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: {
          ...prev.levels[lvl],
          targetGrammars: [
            ...prev.levels[lvl].targetGrammars,
            { pattern: '', meaning: '', exampleSentence: '' },
          ],
        },
      },
    }));
  };

  const handleRemoveGrammar = (lvl: 'N5' | 'N4' | 'N3', index: number) => {
    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: {
          ...prev.levels[lvl],
          targetGrammars: prev.levels[lvl].targetGrammars.filter((_, idx) => idx !== index),
        },
      },
    }));
  };

  const handleGrammarChange = (
    lvl: 'N5' | 'N4' | 'N3',
    index: number,
    field: keyof GrammarItem,
    value: string
  ) => {
    setFormData((prev) => {
      const next = [...prev.levels[lvl].targetGrammars];
      next[index] = { ...next[index], [field]: value };
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], targetGrammars: next },
        },
      };
    });
  };

  // Di chuyển thứ tự Ngữ pháp (Up / Down)
  const handleMoveGrammar = (lvl: 'N5' | 'N4' | 'N3', index: number, direction: 'up' | 'down') => {
    setFormData((prev) => {
      const list = [...prev.levels[lvl].targetGrammars];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], targetGrammars: list },
        },
      };
    });
  };

  const handleGrammarDragStart = (lvl: 'N5' | 'N4' | 'N3', index: number) => {
    setDraggedGrammarIndex({ lvl, index });
  };

  const handleGrammarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleGrammarDrop = (lvl: 'N5' | 'N4' | 'N3', dropIndex: number) => {
    if (!draggedGrammarIndex || draggedGrammarIndex.lvl !== lvl) return;
    const fromIndex = draggedGrammarIndex.index;
    if (fromIndex === dropIndex) return;

    setFormData((prev) => {
      const list = [...prev.levels[lvl].targetGrammars];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(dropIndex, 0, moved);
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], targetGrammars: list },
        },
      };
    });
    setDraggedGrammarIndex(null);
  };

  // Submit Handler
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Vui lòng điền đầy đủ Tiêu đề và Mô tả kịch bản.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const enabledLevels = (['N5', 'N4', 'N3'] as const)
      .map((lvl) => formData.levels[lvl])
      .filter((lvl) => lvl.enabled);

    if (enabledLevels.length === 0) {
      setError('Vui lòng chọn cấu hình ít nhất 1 trình độ JLPT (N5, N4 hoặc N3).');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const tooLongPersona = enabledLevels.find((lvl) => lvl.aiPersona.trim().length > AI_PERSONA_MAX_LENGTH);
    if (tooLongPersona) {
      setError(
        `Vai nhân vật AI của cấp ${tooLongPersona.jlptLevel} quá dài (${tooLongPersona.aiPersona.trim().length}/${AI_PERSONA_MAX_LENGTH} ký tự). Vui lòng rút gọn hoặc bấm "AI Gợi ý nội dung" để sinh lại.`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const levelConfigurations = enabledLevels.map((lvl) => ({
      jlptLevel: lvl.jlptLevel,
      title: lvl.title.trim() || `${formData.title.trim()} (${lvl.jlptLevel})`,
      description: lvl.description.trim() || `Cấu hình ${lvl.jlptLevel} cho ${formData.title.trim()}`,
      aiPersona: lvl.aiPersona.trim() || 'Nhân viên hỗ trợ / Hướng dẫn viên',
      creditCost: lvl.creditCost || 5,
      status: 'Published',
      missions: lvl.missions
        .filter((m) => m.content.trim())
        .map((m, idx) => ({
          id: m.id,
          content: m.content.trim(),
          order: idx + 1,
          intent: m.intent || 'CompleteMission',
          target: m.target || m.content.trim(),
          conditions: m.conditions || [],
        })),
      targetVocabularies: lvl.targetVocabularies
        .filter((v) => v.word.trim())
        .map((v) => ({
          id: v.id,
          word: v.word.trim(),
          reading: v.reading?.trim() || '',
          meaning: v.meaning.trim(),
        })),
      targetGrammars: lvl.targetGrammars
        .filter((g) => g.pattern.trim())
        .map((g) => ({
          id: g.id,
          pattern: g.pattern.trim(),
          meaning: g.meaning.trim(),
          exampleSentence: g.exampleSentence?.trim() || '',
        })),
    }));

    if (isEditMode && scenarioId) {
      // UC-23 Update
      const res = await scenarioService.updateScenario(scenarioId, {
        title: formData.title.trim(),
        description: formData.description.trim(),
        scenarioCode: formData.scenarioCode.trim(),
        thumbnail: formData.thumbnail.trim(),
        isActive: formData.isActive,
        levelConfigurations,
      });

      if (res.success) {
        navigate('/admin/scenarios', {
          state: { successMessage: `Cập nhật kịch bản "${formData.title}" thành công!` },
        });
      } else {
        setError(res.message || 'Lỗi cập nhật kịch bản.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setIsSubmitting(false);
      }
    } else {
      // UC-22 Add
      const res = await scenarioService.createScenario({
        title: formData.title.trim(),
        description: formData.description.trim(),
        scenarioCode: formData.scenarioCode.trim(),
        thumbnail: formData.thumbnail.trim(),
        isActive: formData.isActive,
        levelConfigurations,
      });

      if (res.success) {
        navigate('/admin/scenarios', {
          state: { successMessage: `Thêm kịch bản mới "${formData.title}" thành công!` },
        });
      } else {
        setError(res.message || 'Lỗi khi tạo mới kịch bản.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setIsSubmitting(false);
      }
    }
  };

  const handleOpenCancelConfirmation = () => {
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = () => {
    setIsCancelModalOpen(false);
    navigate('/admin/scenarios');
  };

  const handleDismissCancel = () => {
    setIsCancelModalOpen(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0878EE]"></div>
        <p className="mt-4 text-sm font-semibold text-slate-600">Đang tải thông tin chi tiết kịch bản...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Breadcrumb Navigation - Đã xóa nút "✕ Hủy bỏ" thừa ở góc phải theo yêu cầu Hình 3 */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenCancelConfirmation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition active:scale-95 cursor-pointer"
          >
            <span>←</span> Quay lại danh sách
          </button>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl sm:text-2xl font-black text-[#071A44] tracking-tight">
            {isEditMode ? `✏️ Chỉnh sửa Kịch bản #${scenarioId}` : '✨ Thêm Kịch bản Đàm thoại Mới'}
          </h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs sm:text-sm mb-6 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-800 font-bold p-1 rounded-lg hover:bg-red-100/60 transition cursor-pointer text-sm leading-none ml-3"
            title="Tắt thông báo"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmitForm} className="space-y-6">
        {/* Card 1: Thông tin cơ bản */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm sm:text-base font-bold text-[#071A44] flex items-center gap-2">
              <span>📋</span> Thông tin tổng quan kịch bản
            </h2>
            <span className="text-xs text-slate-400">Các trường có dấu (*) là bắt buộc</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Mã kịch bản (ScenarioCode)</label>
              <input
                type="text"
                value={formData.scenarioCode}
                onChange={(e) => setFormData({ ...formData, scenarioCode: e.target.value })}
                placeholder="Ví dụ: SCN_BAITO_01"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:bg-white focus:ring-2 focus:ring-[#0878EE] outline-none transition"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Tiêu đề kịch bản <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Nhập tiêu đề kịch bản giao tiếp..."
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-[#071A44] focus:bg-white focus:ring-2 focus:ring-[#0878EE] outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Mô tả chi tiết kịch bản <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Mô tả bối cảnh tình huống hội thoại..."
              className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-[#0878EE] outline-none transition"
            />
          </div>

          {/* Hình ảnh kịch bản (Thumbnail - Không bắt buộc) */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Hình ảnh kịch bản (Thumbnail)
              <span className="text-slate-400 font-normal ml-1.5">(Không bắt buộc)</span>
            </label>

            {/* Layout: Cột trái (3/4) chứa 2 khung bằng nhau, Cột phải (1/4) là khung ảnh như cũ được đẩy lên ngang hàng */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start">
              {/* Cột 1 (sm:col-span-3): 2 khung bằng nhau (Khung Option & Khung Input) */}
              <div className="sm:col-span-3 space-y-2.5">
                {/* Khung 1: Option chọn ảnh */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 hover:text-slate-900 select-none">
                    <input
                      type="radio"
                      name="imageSourceMode"
                      value="local"
                      checked={imageSourceMode === 'local'}
                      onChange={() => setImageSourceMode('local')}
                      className="text-[#0878EE] focus:ring-[#0878EE] h-3.5 w-3.5"
                    />
                    <span>📁 Duyệt từ máy chủ local</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 hover:text-slate-900 select-none">
                    <input
                      type="radio"
                      name="imageSourceMode"
                      value="url"
                      checked={imageSourceMode === 'url'}
                      onChange={() => setImageSourceMode('url')}
                      className="text-[#0878EE] focus:ring-[#0878EE] h-3.5 w-3.5"
                    />
                    <span>🔗 Điền link ảnh (URL)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 hover:text-slate-900 select-none">
                    <input
                      type="radio"
                      name="imageSourceMode"
                      value="ai"
                      checked={imageSourceMode === 'ai'}
                      onChange={() => setImageSourceMode('ai')}
                      className="text-[#0878EE] focus:ring-[#0878EE] h-3.5 w-3.5"
                    />
                    <span className="flex items-center gap-1">
                      <span>✨ Nhờ AI sinh ảnh</span>
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-md">Mock</span>
                    </span>
                  </label>
                </div>

                {/* Khung 2: Nhập liệu tương ứng (Cùng chiều rộng với Khung 1) */}
                {imageSourceMode === 'local' && (
                  <div className="space-y-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLocalImageChange}
                      className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#0878EE]/10 file:text-[#0878EE] hover:file:bg-[#0878EE]/20 file:cursor-pointer cursor-pointer border border-slate-200 rounded-xl p-1.5 bg-slate-50/50"
                    />
                    <p className="text-[11px] text-slate-400">
                      Hỗ trợ tải lên ảnh PNG, JPG, JPEG, WebP dung lượng tối đa 5MB từ thiết bị của bạn.
                    </p>
                  </div>
                )}

                {imageSourceMode === 'url' && (
                  <div className="space-y-1.5">
                    <input
                      type="url"
                      value={formData.thumbnail}
                      onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                      placeholder="https://example.com/hinh-anh-kich-ban.jpg"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-[#0878EE] outline-none transition"
                    />
                    <p className="text-[11px] text-slate-400">
                      Dán đường dẫn ảnh kịch bản (URL) từ internet (giống trong mục Chỉnh sửa hồ sơ).
                    </p>
                  </div>
                )}

                {imageSourceMode === 'ai' && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                      <span>✨</span>
                      <span>Tính năng AI sinh ảnh tự động (Bản thử nghiệm / Mock)</span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={aiImagePrompt}
                        onChange={(e) => setAiImagePrompt(e.target.value)}
                        placeholder="Mô tả bối cảnh muốn AI tạo ảnh (Ví dụ: Tiệm mì Ramen Tokyo)..."
                        className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <button
                        type="button"
                        onClick={handleAiGenerateMock}
                        className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        Sinh ảnh (Mock)
                      </button>
                    </div>
                    {aiMockNotice && (
                      <div className="text-[11px] text-amber-700 bg-amber-100/70 p-1.5 rounded-lg flex items-center gap-1.5">
                        <span>ℹ️</span>
                        <span>{aiMockNotice}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cột 2 (sm:col-span-1): Khung ảnh vẫn giữ nguyên dạng ô vuông như cũ, đẩy lên ngang hàng trên cùng */}
              <div className="sm:col-span-1">
                <div className="w-full aspect-square rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center overflow-hidden relative group shadow-2xs">
                  {formData.thumbnail ? (
                    <>
                      <img
                        src={formData.thumbnail}
                        alt="Thumbnail kịch bản"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <button
                          type="button"
                          onClick={handleClearImage}
                          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow transition cursor-pointer"
                        >
                          ✕ Gỡ ảnh
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-3 text-slate-400">
                      <span className="text-3xl block mb-1.5">🖼️</span>
                      <span className="text-[11px] font-medium block">Xem trước ảnh</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isActivePageCheckbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-[#0878EE] focus:ring-[#0878EE]"
            />
            <label htmlFor="isActivePageCheckbox" className="text-xs sm:text-sm font-bold text-slate-700 cursor-pointer">
              Kích hoạt kịch bản ngay (Hiển thị cho học viên luyện tập)
            </label>
          </div>
        </section>

        {/* Card 2: Cấu hình trình độ JLPT */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#071A44] flex items-center gap-2">
                  <span>🎯</span> Cấu hình trình độ JLPT (N3 / N4 / N5)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn các trình độ muốn hỗ trợ (1, 2 hoặc cả 3 cấp độ). Mỗi cấp độ sẽ có vai AI, nhiệm vụ và nội dung học riêng biệt.
                </p>
              </div>

              {/* Badges Toggle */}
              <div className="flex items-center gap-2">
                {(['N5', 'N4', 'N3'] as const).map((lvl) => {
                  const isChecked = formData.levels[lvl].enabled;
                  const activeColor =
                    lvl === 'N5'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : lvl === 'N4'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-purple-600 text-white border-purple-600';
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => handleToggleLevel(lvl)}
                      className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                        isChecked
                          ? activeColor
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{isChecked ? '✓' : '+'}</span>
                      <span>JLPT {lvl}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cards for each level */}
          <div className="space-y-4">
            {(['N5', 'N4', 'N3'] as const).map((lvl) => {
              const lvlData = formData.levels[lvl];
              if (!lvlData.enabled) return null;

              const badgeColor =
                lvl === 'N5'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : lvl === 'N4'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-purple-50 text-purple-700 border-purple-200';

              return (
                <div
                  key={lvl}
                  className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5 shadow-2xs space-y-4"
                >
                  {/* Level Header Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className={`px-2.5 py-1 rounded-lg border text-xs font-extrabold ${badgeColor}`}>
                        JLPT {lvl}
                      </span>
                      <div className="text-xs text-slate-600">
                        <span className="font-bold text-slate-800">Vai AI:</span>{' '}
                        <span>{lvlData.aiPersona || '(Chưa đặt)'}</span>
                      </div>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-500 font-medium">
                        {lvlData.missions.length} nhiệm vụ • {lvlData.targetVocabularies.length} từ vựng •{' '}
                        {lvlData.targetGrammars.length} ngữ pháp
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateAiContent(lvl)}
                        disabled={lvlData.isAiGenerating}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        {lvlData.isAiGenerating ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            <span>Đang sinh...</span>
                          </>
                        ) : (
                          <>
                            <span>✨</span>
                            <span>AI Gợi ý nội dung</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleExpand(lvl)}
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        {lvlData.isExpanded ? '▲ Thu gọn' : '▼ Sửa chi tiết'}
                      </button>
                    </div>
                  </div>

                  {/* Level Accordion Details */}
                  {lvlData.isExpanded && (
                    <div className="space-y-5 pt-3 border-t border-slate-200/80">
                      {/* Vai AI & Cost */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200/70">
                        <div className="sm:col-span-3">
                          <label className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                            <span>Vai nhân vật AI (AiPersona) cho cấp {lvl}</span>
                            <span
                              className={`font-medium ${
                                lvlData.aiPersona.length >= AI_PERSONA_MAX_LENGTH ? 'text-red-500' : 'text-slate-400'
                              }`}
                            >
                              {lvlData.aiPersona.length}/{AI_PERSONA_MAX_LENGTH}
                            </span>
                          </label>
                          <input
                            type="text"
                            value={lvlData.aiPersona}
                            maxLength={AI_PERSONA_MAX_LENGTH}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                levels: {
                                  ...prev.levels,
                                  [lvl]: {
                                    ...prev.levels[lvl],
                                    aiPersona: e.target.value.slice(0, AI_PERSONA_MAX_LENGTH),
                                  },
                                },
                              }))
                            }
                            placeholder="Ví dụ: Quản lý cửa hàng - 店長 (nói chậm)"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Credit / lượt ({lvl})
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={lvlData.creditCost}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                levels: {
                                  ...prev.levels,
                                  [lvl]: { ...prev.levels[lvl], creditCost: parseInt(e.target.value, 10) || 5 },
                                },
                              }))
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                          />
                        </div>
                      </div>

                      {/* Nhiệm vụ (Missions) - Hỗ trợ kéo thả & đổi thứ tự theo Hình 4 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/70 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <span>🎯</span> Nhiệm vụ cần hoàn thành ({lvlData.missions.length})
                            </h3>
                            <span className="text-[11px] text-slate-400 hidden sm:inline">
                              (Kéo biểu tượng ⋮⋮ ở đầu hàng để đổi thứ tự)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddMission(lvl)}
                            className="text-xs font-bold text-[#0878EE] hover:underline"
                          >
                            + Thêm nhiệm vụ
                          </button>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto overflow-x-hidden pr-1.5">
                          {lvlData.missions.map((m, mIdx) => (
                            <div
                              key={mIdx}
                              draggable
                              onDragStart={() => handleMissionDragStart(lvl, mIdx)}
                              onDragOver={handleMissionDragOver}
                              onDrop={() => handleMissionDrop(lvl, mIdx)}
                              className={`flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border transition-all ${
                                draggedMissionIndex?.lvl === lvl && draggedMissionIndex?.index === mIdx
                                  ? 'opacity-40 border-dashed border-[#0878EE] bg-blue-50/40'
                                  : 'border-slate-200/80 hover:border-slate-300'
                              }`}
                            >
                              {/* Drag Handle Icon matching Hình 4 */}
                              <div
                                className="flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing px-1 select-none flex-shrink-0"
                                title="Kéo để sắp xếp lại"
                              >
                                <span className="text-sm font-mono tracking-tighter leading-none select-none">⋮⋮</span>
                              </div>

                              <span className="text-xs font-bold text-slate-400 w-5 text-center flex-shrink-0">#{mIdx + 1}</span>

                              {/* Input nội dung nhiệm vụ có placeholder rỗng chuẩn Hình 2 */}
                              <input
                                type="text"
                                value={m.content}
                                onChange={(e) => handleMissionChange(lvl, mIdx, 'content', e.target.value)}
                                placeholder="Nội dung nhiệm vụ"
                                className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                              />
                              <input
                                type="text"
                                value={m.target || ''}
                                onChange={(e) => handleMissionChange(lvl, mIdx, 'target', e.target.value)}
                                placeholder="Mục tiêu cốt lõi"
                                className="w-32 sm:w-44 min-w-0 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE] hidden md:block"
                              />

                              {/* Nút Xóa */}
                              <button
                                type="button"
                                onClick={() => handleRemoveMission(lvl, mIdx)}
                                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 text-xs rounded hover:bg-red-50 transition cursor-pointer flex-shrink-0"
                                title="Xóa nhiệm vụ"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Từ vựng & Ngữ pháp 2 cột - Hỗ trợ đổi thứ tự & placeholder rỗng */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Từ vựng */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/70 space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <span>📖</span> Từ vựng trọng tâm ({lvlData.targetVocabularies.length})
                            </h3>
                            <button
                              type="button"
                              onClick={() => handleAddVocab(lvl)}
                              className="text-xs font-bold text-[#0878EE] hover:underline cursor-pointer"
                            >
                              + Thêm từ
                            </button>
                          </div>
                          <div className="space-y-2 max-h-72 overflow-y-auto overflow-x-hidden pr-1.5">
                            {lvlData.targetVocabularies.map((v, vIdx) => (
                              <div
                                key={vIdx}
                                draggable
                                onDragStart={() => handleVocabDragStart(lvl, vIdx)}
                                onDragOver={handleVocabDragOver}
                                onDrop={() => handleVocabDrop(lvl, vIdx)}
                                className={`flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border transition-all ${
                                  draggedVocabIndex?.lvl === lvl && draggedVocabIndex?.index === vIdx
                                    ? 'opacity-40 border-dashed border-[#0878EE]'
                                    : 'border-slate-100 hover:border-slate-200'
                                }`}
                              >
                                <span
                                  className="text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-xs select-none px-0.5 flex-shrink-0"
                                  title="Kéo để sắp xếp lại"
                                >
                                  ⋮⋮
                                </span>
                                <input
                                  type="text"
                                  value={v.word}
                                  onChange={(e) => handleVocabChange(lvl, vIdx, 'word', e.target.value)}
                                  placeholder="Từ vựng"
                                  className="w-20 sm:w-24 min-w-0 flex-shrink px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                />
                                <input
                                  type="text"
                                  value={v.reading || ''}
                                  onChange={(e) => handleVocabChange(lvl, vIdx, 'reading', e.target.value)}
                                  placeholder="Cách đọc"
                                  className="w-16 sm:w-20 min-w-0 flex-shrink px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                />
                                <input
                                  type="text"
                                  value={v.meaning}
                                  onChange={(e) => handleVocabChange(lvl, vIdx, 'meaning', e.target.value)}
                                  placeholder="Ý nghĩa"
                                  className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveVocab(lvl, vIdx)}
                                  className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded text-xs transition flex-shrink-0 cursor-pointer"
                                  title="Xóa từ vựng"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Ngữ pháp */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/70 space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <span>📐</span> Ngữ pháp trọng tâm ({lvlData.targetGrammars.length})
                            </h3>
                            <button
                              type="button"
                              onClick={() => handleAddGrammar(lvl)}
                              className="text-xs font-bold text-[#0878EE] hover:underline cursor-pointer"
                            >
                              + Thêm ngữ pháp
                            </button>
                          </div>
                          <div className="space-y-2 max-h-72 overflow-y-auto overflow-x-hidden pr-1.5">
                            {lvlData.targetGrammars.map((g, gIdx) => (
                              <div
                                key={gIdx}
                                draggable
                                onDragStart={() => handleGrammarDragStart(lvl, gIdx)}
                                onDragOver={handleGrammarDragOver}
                                onDrop={() => handleGrammarDrop(lvl, gIdx)}
                                className={`flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border transition-all ${
                                  draggedGrammarIndex?.lvl === lvl && draggedGrammarIndex?.index === gIdx
                                    ? 'opacity-40 border-dashed border-[#0878EE]'
                                    : 'border-slate-100 hover:border-slate-200'
                                }`}
                              >
                                <span
                                  className="text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-xs select-none px-0.5 flex-shrink-0"
                                  title="Kéo để sắp xếp lại"
                                >
                                  ⋮⋮
                                </span>
                                <input
                                  type="text"
                                  value={g.pattern}
                                  onChange={(e) => handleGrammarChange(lvl, gIdx, 'pattern', e.target.value)}
                                  placeholder="Mẫu ngữ pháp"
                                  className="w-28 sm:w-32 min-w-0 flex-shrink px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                />
                                <input
                                  type="text"
                                  value={g.meaning}
                                  onChange={(e) => handleGrammarChange(lvl, gIdx, 'meaning', e.target.value)}
                                  placeholder="Ý nghĩa"
                                  className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGrammar(lvl, gIdx)}
                                  className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded text-xs transition flex-shrink-0 cursor-pointer"
                                  title="Xóa ngữ pháp"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer Actions Sticky Bar */}
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 p-4 shadow-lg flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleOpenCancelConfirmation}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs sm:text-sm transition cursor-pointer"
          >
            Hủy bỏ
          </button>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#0878EE] hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm transition active:scale-98 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Đang lưu kịch bản...</span>
                </>
              ) : isEditMode ? (
                <span>💾 Cập nhật Kịch bản</span>
              ) : (
                <span>✨ Tạo Kịch bản Mới</span>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Confirmation Modal for Hủy bỏ */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl flex-shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#071A44]">
                  Xác nhận hủy {isEditMode ? 'chỉnh sửa' : 'tạo mới'} kịch bản?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thao tác này sẽ thoát khỏi trang soạn thảo kịch bản.
                </p>
              </div>
            </div>

            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 mb-5 text-xs text-amber-900 leading-relaxed">
              <p className="font-bold mb-1">📌 Lưu ý quan trọng:</p>
              <p>
                Nếu bạn chọn hủy, toàn bộ bản nháp và tất cả các thay đổi vừa nhập hiện tại sẽ bị xóa bỏ và không được lưu lại.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleDismissCancel}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition cursor-pointer"
              >
                Tiếp tục cài đặt
              </button>

              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Đồng ý hủy & Quay lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
