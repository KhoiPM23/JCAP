import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { scenarioService } from '../../services/scenarioService';
import type { ScenarioListItem } from '../../types/scenarioDetails';

export interface MissionItem {
  id?: number;
  content: string;
  order: number;
  intent?: string;
  target?: string;
  conditions?: string[];
}

export interface VocabularyItem {
  id?: number;
  word: string;
  reading?: string;
  meaning: string;
}

export interface GrammarItem {
  id?: number;
  pattern: string;
  meaning: string;
  exampleSentence?: string;
}

export interface LevelConfigState {
  jlptLevel: 'N5' | 'N4' | 'N3';
  enabled: boolean;
  title: string;
  description: string;
  aiPersona: string;
  creditCost: number;
  status: string;
  missions: MissionItem[];
  targetVocabularies: VocabularyItem[];
  targetGrammars: GrammarItem[];
  isExpanded: boolean;
  isAiGenerating?: boolean;
}

interface ScenarioFormData {
  title: string;
  description: string;
  scenarioCode: string;
  thumbnail: string;
  isActive: boolean;
  levels: Record<'N5' | 'N4' | 'N3', LevelConfigState>;
}

const createDefaultLevelsState = (_scenarioTitle: string = ''): Record<'N5' | 'N4' | 'N3', LevelConfigState> => ({
  N5: {
    jlptLevel: 'N5',
    enabled: false,
    title: '',
    description: '',
    aiPersona: '',
    creditCost: 5,
    status: 'Published',
    missions: [],
    targetVocabularies: [],
    targetGrammars: [],
    isExpanded: false,
    isAiGenerating: false,
  },
  N4: {
    jlptLevel: 'N4',
    enabled: false,
    title: '',
    description: '',
    aiPersona: '',
    creditCost: 5,
    status: 'Published',
    missions: [],
    targetVocabularies: [],
    targetGrammars: [],
    isExpanded: false,
    isAiGenerating: false,
  },
  N3: {
    jlptLevel: 'N3',
    enabled: false,
    title: '',
    description: '',
    aiPersona: '',
    creditCost: 5,
    status: 'Published',
    missions: [],
    targetVocabularies: [],
    targetGrammars: [],
    isExpanded: false,
    isAiGenerating: false,
  },
});

export const AdminScenarioListView: React.FC = () => {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingScenario, setEditingScenario] = useState<ScenarioListItem | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [formData, setFormData] = useState<ScenarioFormData>({
    title: '',
    description: '',
    scenarioCode: '',
    thumbnail: '',
    isActive: true,
    levels: createDefaultLevelsState(''),
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchScenarios = async () => {
    setLoading(true);
    setError(null);
    const res = await scenarioService.getAdminScenarios();
    if (res.success && res.data) {
      setScenarios(res.data);
    } else {
      setError(res.message || 'Không thể nạp danh sách kịch bản quản trị.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchScenarios();
  }, []);

  const handleOpenAddModal = () => {
    setEditingScenario(null);
    setError(null);
    setFormData({
      title: '',
      description: '',
      scenarioCode: '',
      thumbnail: '',
      isActive: true,
      levels: createDefaultLevelsState(''),
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (item: ScenarioListItem) => {
    setEditingScenario(item);
    setError(null);
    setIsModalOpen(true);
    setIsLoadingDetails(true);

    const baseLevels = createDefaultLevelsState(item.title);
    setFormData({
      title: item.title,
      description: item.description,
      scenarioCode: item.scenarioCode || '',
      thumbnail: item.thumbnail || '',
      isActive: item.isActive,
      levels: baseLevels,
    });

    try {
      const detailsRes = await scenarioService.getAdminScenarioDetails(item.id);
      if (detailsRes.success && detailsRes.data) {
        const full = detailsRes.data;
        const loadedLevels = createDefaultLevelsState(full.title);

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
              isExpanded: false,
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
      }
    } catch (err) {
      console.error('Lỗi khi tải chi tiết kịch bản:', err);
    } finally {
      setIsLoadingDetails(false);
    }
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

  const handleAiGenerateLevel = async (lvl: 'N5' | 'N4' | 'N3') => {
    if (!formData.title.trim()) {
      alert('Vui lòng nhập Tiêu đề kịch bản trước khi tạo gợi ý AI.');
      return;
    }

    const currentLevel = formData.levels[lvl];
    const targetMissionCount = Math.max(3, currentLevel.missions.length);
    const targetVocabCount = Math.max(3, currentLevel.targetVocabularies.length);
    const targetGrammarCount = Math.max(3, currentLevel.targetGrammars.length);

    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: { ...prev.levels[lvl], isAiGenerating: true },
      },
    }));

    try {
      const res = await scenarioService.generateLevelContent(
        formData.title,
        formData.description,
        lvl,
        targetMissionCount,
        targetVocabCount,
        targetGrammarCount
      );

      if (res.success && res.data) {
        const gen = res.data;
        setFormData((prev) => {
          const prevLvl = prev.levels[lvl];

          // Merge Missions: minimum 3, or fill empty slots if Admin added extra slots
          const desiredMissionsLen = Math.max(3, prevLvl.missions.length);
          const hasEmptyMissions = prevLvl.missions.some((m) => !m.content.trim()) || prevLvl.missions.length < desiredMissionsLen;
          const genMissions: MissionItem[] = (gen.missions || []).map((m, idx) => ({
            order: m.order || idx + 1,
            content: m.content,
            target: m.target || m.content,
            intent: m.intent || 'CompleteMission',
            conditions: m.conditions || [],
          }));

          let mergedMissions: MissionItem[];
          if (prevLvl.missions.length > 0 && hasEmptyMissions) {
            const existingContents = new Set(
              prevLvl.missions.map((m) => m.content.trim().toLowerCase()).filter(Boolean)
            );
            const unusedGenMissions = genMissions.filter(
              (gm) => !existingContents.has(gm.content.trim().toLowerCase())
            );
            let genIdx = 0;
            mergedMissions = [];
            for (let i = 0; i < desiredMissionsLen; i++) {
              const existing = prevLvl.missions[i];
              if (existing && existing.content.trim()) {
                mergedMissions.push({ ...existing, order: i + 1 });
              } else {
                const pick = unusedGenMissions[genIdx++] || genMissions[i] || {
                  order: i + 1,
                  content: `Nhiệm vụ giao tiếp bước ${i + 1} cho "${formData.title}"`,
                  target: `Mục tiêu số ${i + 1}`,
                };
                mergedMissions.push({ ...pick, order: i + 1 });
              }
            }
          } else {
            mergedMissions = genMissions.slice(0, desiredMissionsLen).map((m, idx) => ({
              ...m,
              order: idx + 1,
            }));
          }

          // Merge Vocabularies: minimum 3, or fill empty slots if Admin added extra slots
          const desiredVocabsLen = Math.max(3, prevLvl.targetVocabularies.length);
          const hasEmptyVocabs =
            prevLvl.targetVocabularies.some((v) => !v.word.trim()) ||
            prevLvl.targetVocabularies.length < desiredVocabsLen;
          const genVocabs: VocabularyItem[] = (gen.targetVocabularies || []).map((v) => ({
            word: v.word,
            reading: v.reading || '',
            meaning: v.meaning,
          }));

          let mergedVocabs: VocabularyItem[];
          if (prevLvl.targetVocabularies.length > 0 && hasEmptyVocabs) {
            const existingWords = new Set(
              prevLvl.targetVocabularies.map((v) => v.word.trim().toLowerCase()).filter(Boolean)
            );
            const unusedGenVocabs = genVocabs.filter(
              (gv) => !existingWords.has(gv.word.trim().toLowerCase())
            );
            let genIdx = 0;
            mergedVocabs = [];
            for (let i = 0; i < desiredVocabsLen; i++) {
              const existing = prevLvl.targetVocabularies[i];
              if (existing && existing.word.trim()) {
                mergedVocabs.push(existing);
              } else {
                const pick = unusedGenVocabs[genIdx++] || genVocabs[i] || {
                  word: '',
                  reading: '',
                  meaning: '',
                };
                mergedVocabs.push(pick);
              }
            }
          } else {
            mergedVocabs = genVocabs.slice(0, desiredVocabsLen);
          }

          // Merge Grammars: minimum 3, or fill empty slots if Admin added extra slots
          const desiredGrammarsLen = Math.max(3, prevLvl.targetGrammars.length);
          const hasEmptyGrammars =
            prevLvl.targetGrammars.some((g) => !g.pattern.trim()) ||
            prevLvl.targetGrammars.length < desiredGrammarsLen;
          const genGrammars: GrammarItem[] = (gen.targetGrammars || []).map((g) => ({
            pattern: g.pattern,
            meaning: g.meaning,
            exampleSentence: g.exampleSentence || '',
          }));

          let mergedGrammars: GrammarItem[];
          if (prevLvl.targetGrammars.length > 0 && hasEmptyGrammars) {
            const existingPatterns = new Set(
              prevLvl.targetGrammars.map((g) => g.pattern.trim().toLowerCase()).filter(Boolean)
            );
            const unusedGenGrammars = genGrammars.filter(
              (gg) => !existingPatterns.has(gg.pattern.trim().toLowerCase())
            );
            let genIdx = 0;
            mergedGrammars = [];
            for (let i = 0; i < desiredGrammarsLen; i++) {
              const existing = prevLvl.targetGrammars[i];
              if (existing && existing.pattern.trim()) {
                mergedGrammars.push(existing);
              } else {
                const pick = unusedGenGrammars[genIdx++] || genGrammars[i] || {
                  pattern: '',
                  meaning: '',
                  exampleSentence: '',
                };
                mergedGrammars.push(pick);
              }
            }
          } else {
            mergedGrammars = genGrammars.slice(0, desiredGrammarsLen);
          }

          return {
            ...prev,
            levels: {
              ...prev.levels,
              [lvl]: {
                ...prevLvl,
                aiPersona: prevLvl.aiPersona.trim() || gen.aiPersona || prevLvl.aiPersona,
                title: prevLvl.title.trim() || gen.title || prevLvl.title,
                description: prevLvl.description.trim() || gen.description || prevLvl.description,
                missions: mergedMissions,
                targetVocabularies: mergedVocabs,
                targetGrammars: mergedGrammars,
                isExpanded: true,
                isAiGenerating: false,
              },
            },
          };
        });
      } else {
        alert(res.message || 'Không thể tạo gợi ý AI lúc này.');
        setFormData((prev) => ({
          ...prev,
          levels: {
            ...prev.levels,
            [lvl]: { ...prev.levels[lvl], isAiGenerating: false },
          },
        }));
      }
    } catch {
      alert('Lỗi kết nối khi gọi AI gợi ý.');
      setFormData((prev) => ({
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], isAiGenerating: false },
        },
      }));
    }
  };

  // Add / remove / change mission
  const handleAddMission = (lvl: 'N5' | 'N4' | 'N3') => {
    setFormData((prev) => {
      const current = prev.levels[lvl].missions;
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: {
            ...prev.levels[lvl],
            missions: [
              ...current,
              { order: current.length + 1, content: '', target: '' },
            ],
          },
        },
      };
    });
  };

  const handleRemoveMission = (lvl: 'N5' | 'N4' | 'N3', index: number) => {
    setFormData((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [lvl]: {
          ...prev.levels[lvl],
          missions: prev.levels[lvl].missions
            .filter((_, idx) => idx !== index)
            .map((m, idx) => ({ ...m, order: idx + 1 })),
        },
      },
    }));
  };

  const handleMissionChange = (lvl: 'N5' | 'N4' | 'N3', index: number, content: string) => {
    setFormData((prev) => {
      const next = [...prev.levels[lvl].missions];
      next[index] = { ...next[index], content, target: content };
      return {
        ...prev,
        levels: {
          ...prev.levels,
          [lvl]: { ...prev.levels[lvl], missions: next },
        },
      };
    });
  };

  // Add / remove / change vocab
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

  const handleDeleteScenario = async (id: number, title: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn vô hiệu hóa (xóa mềm) kịch bản "${title}"?`)) {
      return;
    }

    const res = await scenarioService.deleteScenario(id);
    if (res.success) {
      setSuccessMsg(`Đã vô hiệu hóa kịch bản "${title}" thành công.`);
      fetchScenarios();
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setError(res.message || 'Lỗi khi xóa kịch bản.');
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Vui lòng điền đầy đủ Tiêu đề và Mô tả kịch bản.');
      return;
    }

    const enabledLevels = (['N5', 'N4', 'N3'] as const)
      .map((lvl) => formData.levels[lvl])
      .filter((lvl) => lvl.enabled);

    if (enabledLevels.length === 0) {
      setError('Vui lòng chọn cấu hình ít nhất 1 trình độ JLPT (N5, N4 hoặc N3).');
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

    if (editingScenario) {
      // UC-23 Update
      const res = await scenarioService.updateScenario(editingScenario.id, {
        title: formData.title.trim(),
        description: formData.description.trim(),
        scenarioCode: formData.scenarioCode.trim(),
        thumbnail: formData.thumbnail.trim(),
        isActive: formData.isActive,
        levelConfigurations,
      });

      if (res.success) {
        setSuccessMsg(`Cập nhật kịch bản "${formData.title}" thành công!`);
        setIsModalOpen(false);
        fetchScenarios();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message || 'Lỗi cập nhật kịch bản.');
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
        setSuccessMsg(`Thêm kịch bản mới "${formData.title}" thành công!`);
        setIsModalOpen(false);
        fetchScenarios();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.message || 'Lỗi khi tạo mới kịch bản.');
      }
    }

    setIsSubmitting(false);
  };

  const hasSelectedLevel = (['N5', 'N4', 'N3'] as const).some((lvl) => formData.levels[lvl].enabled);

  const filteredScenarios = scenarios.filter((item) => {
    const term = searchTerm.trim();
    if (!term) return true;
    if (term.length < 2) return false;
    const q = term.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (item.scenarioCode && item.scenarioCode.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-[#071A44]">🎭 Quản lý Kịch bản Đàm thoại</h1>
          <p className="text-slate-500 text-sm mt-1">
            Quản trị danh mục kịch bản roleplay, cấu hình trình độ JLPT.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/scenarios')}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-2xs active:scale-98 border border-slate-200 cursor-pointer"
          >
            <span>👁️</span> Xem kịch bản
          </button>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 bg-[#0878EE] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition shadow-sm active:scale-98 cursor-pointer"
          >
            <span>✨</span> Thêm Kịch bản Mới
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm mb-6 flex items-center gap-2">
          <span>✅</span> {successMsg}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-6 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Tìm kiếm kịch bản theo mã, tiêu đề hoặc nội dung..."
          className="w-full max-w-md px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE] transition"
        />
      </div>

      {searchTerm.trim().length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2.5 rounded-xl text-xs font-medium mb-6">
          <span>🔍 Kết quả tìm kiếm cho: <strong>"{searchTerm.trim()}"</strong></span>
          <button
            onClick={() => setSearchTerm('')}
            className="text-blue-600 hover:text-blue-900 font-bold underline transition cursor-pointer"
          >
            Xóa tìm kiếm
          </button>
        </div>
      )}

      {/* Content Table */}
      {loading ? (
        <div className="flex justify-center items-center py-20 bg-white rounded-2xl border border-slate-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0878EE]"></div>
          <span className="ml-3 text-sm text-slate-600 font-medium">Đang tải danh sách kịch bản...</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-4 px-6">ID & Mã</th>
                  <th className="py-4 px-6">Tiêu đề & Mô tả</th>
                  <th className="py-4 px-6">Trình độ JLPT</th>
                  <th className="py-4 px-6">Trạng thái</th>
                  <th className="py-4 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredScenarios.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      {searchTerm.trim().length > 0
                        ? `Không tìm thấy kịch bản nào phù hợp với từ khóa "${searchTerm.trim()}".`
                        : 'Không tìm thấy kịch bản nào phù hợp.'}
                    </td>
                  </tr>
                ) : (
                  filteredScenarios.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-mono text-xs text-slate-500">
                        <span className="font-bold text-[#071A44]">#{item.id}</span>
                        {item.scenarioCode && (
                          <span className="block text-slate-400 mt-0.5">{item.scenarioCode}</span>
                        )}
                      </td>
                      <td className="py-4 px-6 max-w-md">
                        <div className="font-bold text-[#071A44]">{item.title}</div>
                        <div className="text-xs text-slate-500 line-clamp-2 mt-1">{item.description}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex gap-1 flex-wrap">
                          {item.supportedJLPTLevels?.map((lvl) => (
                            <span
                              key={lvl}
                              className="px-2 py-0.5 bg-blue-50 text-[#0878EE] border border-blue-200 rounded-full text-[11px] font-bold"
                            >
                              {lvl}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {item.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Vô hiệu hóa
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                        >
                          ✏️ Sửa
                        </button>
                        {item.isActive && (
                          <button
                            onClick={() => handleDeleteScenario(item.id, item.title)}
                            className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition cursor-pointer"
                          >
                            🗑️ Xóa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-center items-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-[#071A44]">
                  {editingScenario ? `✏️ Chỉnh sửa Kịch bản #${editingScenario.id}` : '✨ Thêm Kịch bản Mới'}
                </h2>
                {isLoadingDetails && (
                  <span className="text-xs text-[#0878EE] font-medium bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                    Đang nạp chi tiết các level...
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitForm} className="flex flex-col flex-1 min-h-0 pt-4">
              <div className="overflow-y-auto pr-2 space-y-5 flex-1">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                    <span>⚠️</span> {error}
                  </div>
                )}

                {/* 1. Thông tin cơ bản */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mã kịch bản (ScenarioCode)</label>
                    <input
                      type="text"
                      value={formData.scenarioCode}
                      onChange={(e) => setFormData({ ...formData, scenarioCode: e.target.value })}
                      placeholder="Ví dụ: SCN_01"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#0878EE] outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tiêu đề kịch bản <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Nhập tiêu đề kịch bản giao tiếp..."
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#0878EE] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mô tả chi tiết kịch bản <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Mô tả bối cảnh và mục tiêu giao tiếp tổng thể..."
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0878EE] outline-none resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActiveToggle"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-[#0878EE] rounded border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="isActiveToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                    Kích hoạt kịch bản (IsActive = true)
                  </label>
                </div>

                {/* 2. Thiết lập Trình độ JLPT & Nội dung luyện tập */}
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-4">
                  {/* Selector các Level hỗ trợ */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span>🎯</span> Cấu hình Trình độ JLPT (N3 / N4 / N5)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Chọn trình độ muốn mở (hỗ trợ 1, 2 hoặc cả 3 cấp độ). Mỗi cấp độ có nhiệm vụ, từ vựng và vai AI riêng biệt.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {(['N5', 'N4', 'N3'] as const).map((lvl) => {
                        const isChecked = formData.levels[lvl].enabled;
                        return (
                          <button
                            type="button"
                            key={lvl}
                            onClick={() => handleToggleLevel(lvl)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition select-none cursor-pointer ${
                              isChecked
                                ? lvl === 'N5'
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                  : lvl === 'N4'
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                            }`}
                          >
                            <span>{isChecked ? '✓' : '+'}</span>
                            <span>JLPT {lvl}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Thông báo chữ đỏ khi chưa chọn trình độ JLPT nào */}
                  {!hasSelectedLevel && (
                    <p className="text-xs font-semibold text-red-600">
                      Vui lòng chọn ít nhất 1 trình độ JLPT (N5, N4 hoặc N3) để cấu hình cho kịch bản.
                    </p>
                  )}

                  {/* Danh sách các Cards cấu hình cho từng Level */}
                  <div className="space-y-3">
                    {(['N5', 'N4', 'N3'] as const).map((lvl) => {
                      const levelData = formData.levels[lvl];
                      if (!levelData.enabled) return null;

                      const themeColors = {
                        N5: {
                          badge: 'bg-emerald-600 text-white',
                          border: 'border-emerald-200 bg-emerald-50/30',
                          btnAi: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
                          accent: 'text-emerald-700',
                        },
                        N4: {
                          badge: 'bg-blue-600 text-white',
                          border: 'border-blue-200 bg-blue-50/30',
                          btnAi: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
                          accent: 'text-blue-700',
                        },
                        N3: {
                          badge: 'bg-purple-600 text-white',
                          border: 'border-purple-200 bg-purple-50/30',
                          btnAi: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200',
                          accent: 'text-purple-700',
                        },
                      }[lvl];

                      return (
                        <div
                          key={lvl}
                          className={`border rounded-2xl bg-white shadow-2xs overflow-hidden transition-all ${themeColors.border}`}
                        >
                          {/* Header thanh Level */}
                          <div className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${themeColors.badge}`}>
                                JLPT {lvl}
                              </span>
                              <div className="text-xs text-slate-600">
                                <span className="font-semibold text-slate-800">Vai AI: </span>
                                <span>{levelData.aiPersona || 'Chưa thiết lập'}</span>
                              </div>
                              <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400">
                                <span>•</span>
                                <span>{levelData.missions.length} nhiệm vụ</span>
                                <span>•</span>
                                <span>{levelData.targetVocabularies.length} từ vựng</span>
                                <span>•</span>
                                <span>{levelData.targetGrammars.length} ngữ pháp</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Nút Gen AI hỗ trợ */}
                              <button
                                type="button"
                                disabled={levelData.isAiGenerating}
                                onClick={() => handleAiGenerateLevel(lvl)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer shadow-2xs active:scale-95 ${themeColors.btnAi}`}
                                title="Bấm để AI tự động đề xuất Vai trò, Nhiệm vụ, Từ vựng và Ngữ pháp theo trình độ này"
                              >
                                {levelData.isAiGenerating ? (
                                  <>
                                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                                    <span>AI đang tạo...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>✨</span>
                                    <span>AI Gợi ý nội dung</span>
                                  </>
                                )}
                              </button>

                              {/* Nút Ẩn / Hiện chi tiết để làm gọn form */}
                              <button
                                type="button"
                                onClick={() => handleToggleExpand(lvl)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                              >
                                <span>{levelData.isExpanded ? '▲ Ẩn chi tiết' : '▼ Sửa chi tiết'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Body chi tiết khi Mở rộng (isExpanded = true) */}
                          {levelData.isExpanded && (
                            <div className="p-4 space-y-4 bg-white/70">
                              {/* Vai AI Persona & Tiêu đề Level */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                    Nhân vật AI đối thoại (Persona) <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={levelData.aiPersona}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormData((prev) => ({
                                        ...prev,
                                        levels: {
                                          ...prev.levels,
                                          [lvl]: { ...prev.levels[lvl], aiPersona: val },
                                        },
                                      }));
                                    }}
                                    placeholder="Nhập vai trò của nhân vật AI trong tình huống này..."
                                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0878EE] outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                    Tiêu đề cấu hình ({lvl})
                                  </label>
                                  <input
                                    type="text"
                                    value={levelData.title}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormData((prev) => ({
                                        ...prev,
                                        levels: {
                                          ...prev.levels,
                                          [lvl]: { ...prev.levels[lvl], title: val },
                                        },
                                      }));
                                    }}
                                    placeholder={`Nhập tiêu đề cấu hình trình độ ${lvl}...`}
                                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0878EE] outline-none"
                                  />
                                </div>
                              </div>

                              {/* Bối cảnh trình độ */}
                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                  Bối cảnh kịch bản ({lvl})
                                </label>
                                <textarea
                                  rows={2}
                                  value={levelData.description}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData((prev) => ({
                                      ...prev,
                                      levels: {
                                        ...prev.levels,
                                        [lvl]: { ...prev.levels[lvl], description: val },
                                      },
                                    }));
                                  }}
                                  placeholder={`Mô tả bối cảnh và yêu cầu giao tiếp cụ thể cho trình độ ${lvl}...`}
                                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0878EE] outline-none resize-none"
                                />
                              </div>

                              {/* 1. Nhiệm vụ cần hoàn thành (Missions) */}
                              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <span>📋</span> Nhiệm vụ cần hoàn thành ({levelData.missions.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddMission(lvl)}
                                    className="text-xs font-bold text-[#0878EE] hover:underline cursor-pointer"
                                  >
                                    + Thêm nhiệm vụ
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {levelData.missions.map((mission, mIdx) => (
                                    <div key={mIdx} className="flex items-center gap-2">
                                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-blue-100 text-[#0878EE] font-bold text-[10px] shrink-0">
                                        {mIdx + 1}
                                      </span>
                                      <input
                                        type="text"
                                        value={mission.content}
                                        onChange={(e) => handleMissionChange(lvl, mIdx, e.target.value)}
                                        placeholder="Nhập nội dung nhiệm vụ cần hoàn thành..."
                                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#0878EE] outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMission(lvl, mIdx)}
                                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 text-xs cursor-pointer"
                                        title="Xóa nhiệm vụ này"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                  {levelData.missions.length === 0 && (
                                    <p className="text-[11px] text-slate-400 italic">Chưa có nhiệm vụ nào. Nhấn "+ Thêm nhiệm vụ" hoặc dùng "AI Gợi ý nội dung".</p>
                                  )}
                                </div>
                              </div>

                              {/* 2. Từ vựng trọng tâm (Vocabularies) */}
                              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <span>📖</span> Từ vựng trọng tâm ({levelData.targetVocabularies.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddVocab(lvl)}
                                    className="text-xs font-bold text-[#0878EE] hover:underline cursor-pointer"
                                  >
                                    + Thêm từ vựng
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {levelData.targetVocabularies.map((vocab, vIdx) => (
                                    <div key={vIdx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200 relative">
                                      <input
                                        type="text"
                                        value={vocab.word}
                                        onChange={(e) => handleVocabChange(lvl, vIdx, 'word', e.target.value)}
                                        placeholder="Nhập từ vựng tiếng Nhật..."
                                        className="px-2.5 py-1 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                      />
                                      <input
                                        type="text"
                                        value={vocab.reading || ''}
                                        onChange={(e) => handleVocabChange(lvl, vIdx, 'reading', e.target.value)}
                                        placeholder="Nhập cách đọc (Hiragana)..."
                                        className="px-2.5 py-1 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                      />
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          value={vocab.meaning}
                                          onChange={(e) => handleVocabChange(lvl, vIdx, 'meaning', e.target.value)}
                                          placeholder="Nhập ý nghĩa tiếng Việt..."
                                          className="flex-1 px-2.5 py-1 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveVocab(lvl, vIdx)}
                                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 text-xs cursor-pointer"
                                          title="Xóa từ vựng này"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {levelData.targetVocabularies.length === 0 && (
                                    <p className="text-[11px] text-slate-400 italic">Chưa có từ vựng nào.</p>
                                  )}
                                </div>
                              </div>

                              {/* 3. Ngữ pháp trọng tâm (Grammars) */}
                              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <span>📝</span> Ngữ pháp trọng tâm ({levelData.targetGrammars.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddGrammar(lvl)}
                                    className="text-xs font-bold text-[#0878EE] hover:underline cursor-pointer"
                                  >
                                    + Thêm ngữ pháp
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {levelData.targetGrammars.map((grammar, gIdx) => (
                                    <div key={gIdx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200 relative">
                                      <input
                                        type="text"
                                        value={grammar.pattern}
                                        onChange={(e) => handleGrammarChange(lvl, gIdx, 'pattern', e.target.value)}
                                        placeholder="Nhập mẫu ngữ pháp..."
                                        className="px-2.5 py-1 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                      />
                                      <input
                                        type="text"
                                        value={grammar.meaning}
                                        onChange={(e) => handleGrammarChange(lvl, gIdx, 'meaning', e.target.value)}
                                        placeholder="Nhập ý nghĩa ngữ pháp..."
                                        className="px-2.5 py-1 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                      />
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          value={grammar.exampleSentence || ''}
                                          onChange={(e) => handleGrammarChange(lvl, gIdx, 'exampleSentence', e.target.value)}
                                          placeholder="Nhập câu ví dụ minh họa..."
                                          className="flex-1 px-2.5 py-1 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-[#0878EE]"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveGrammar(lvl, gIdx)}
                                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 text-xs cursor-pointer"
                                          title="Xóa ngữ pháp này"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {levelData.targetGrammars.length === 0 && (
                                    <p className="text-[11px] text-slate-400 italic">Chưa có ngữ pháp nào.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 bg-white">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !hasSelectedLevel}
                  className={`px-5 py-2 text-xs font-bold text-white bg-[#0878EE] rounded-xl transition shadow flex items-center gap-1.5 ${
                    isSubmitting || !hasSelectedLevel
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-blue-700 cursor-pointer'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Đang lưu...</span>
                    </>
                  ) : editingScenario ? (
                    'Cập nhật Kịch bản'
                  ) : (
                    'Tạo Kịch bản Mới'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
