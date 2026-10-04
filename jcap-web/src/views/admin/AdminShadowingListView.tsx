import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Toast, ToastType } from '../../components/ui/Toast';
import { adminShadowingService } from '../../services/adminShadowingService';
import { scenarioService } from '../../services/scenarioService';
import type {
  ShadowingDialogueItem,
  ShadowingDialogueDetail,
  CreateShadowingDialoguePayload,
  CreateShadowingSentencePayload,
  ShadowingVocabularyItem,
  ShadowingGrammarItem,
  GenerateShadowingDialoguePayload,
  GeneratedShadowingDialogueResult,
} from '../../types/shadowing';
import { parseRFC4180CSV } from '../../utils/csvParser';
import type { ScenarioListItem } from '../../types/scenarioDetails';

export interface ImportVocabItem {
  word: string;
  reading?: string | null;
  meaning: string;
  jlptLevel?: string;
  matchedMasterId?: number;
  status: 'matched' | 'missing';
  action: 'create_new' | 'skip';
}

export interface ImportGrammarItem {
  pattern: string;
  meaning: string;
  exampleSentence?: string | null;
  jlptLevel?: string;
  matchedMasterId?: number;
  status: 'matched' | 'missing';
  action: 'create_new' | 'skip';
}

export interface ImportPreviewData {
  format: 'csv' | 'json';
  title?: string;
  jlptLevel?: 'N5' | 'N4' | 'N3';
  scenarioId?: number;
  scenarioCode?: string;
  matchedScenarioTitle?: string;
  scenarioWarning?: string;
  contextDescription?: string;
  speakerRoles?: string[];
  sentences: CreateShadowingSentencePayload[];
  targetVocabularies: ImportVocabItem[];
  targetGrammars: ImportGrammarItem[];
  errors: string[];
  warnings: string[];
}

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

export const AdminShadowingListView: React.FC = () => {
  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (msg: string, type: ToastType = 'success') => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    setToasts((prev) => [...prev, { id, message: msg, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterScenario, setFilterScenario] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Form Modal state (UC-30 Create / UC-31 Edit)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form Data
  const [formScenarioId, setFormScenarioId] = useState<number>(1);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formLevel, setFormLevel] = useState<'N5' | 'N4' | 'N3'>('N5');
  const [formContextDescription, setFormContextDescription] = useState<string>('');
  const [formSpeakerRoles, setFormSpeakerRoles] = useState<string[]>([
    'Khách hàng (Học viên)',
    'Nhân viên quán'
  ]);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formSentences, setFormSentences] = useState<CreateShadowingSentencePayload[]>([]);
  const [formVocabularies, setFormVocabularies] = useState<ShadowingVocabularyItem[]>([]);
  const [formGrammars, setFormGrammars] = useState<ShadowingGrammarItem[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [activeFormTab, setActiveFormTab] = useState<'sentences' | 'vocab' | 'grammar'>('sentences');

  // AI Assist State embedded in Form (No isolated modal)
  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(false);
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [aiCustomInstructions, setAiCustomInstructions] = useState<string>('');
  const [aiSentenceCount, setAiSentenceCount] = useState<number>(4);
  const [aiVocabCount, setAiVocabCount] = useState<number>(3);
  const [aiGrammarCount, setAiGrammarCount] = useState<number>(2);
  const [aiDraft, setAiDraft] = useState<GeneratedShadowingDialogueResult | null>(null);
  const [translatingIndex, setTranslatingIndex] = useState<{ index: number; dir: 'ja-vi' | 'vi-ja' } | null>(null);

  // Shared Master Data Explorer State (JLPT priority but selectable all levels)
  const [isVocabLibraryOpen, setIsVocabLibraryOpen] = useState<boolean>(false);
  const [vocabSearchKeyword, setVocabSearchKeyword] = useState<string>('');
  const [vocabFilterLevel, setVocabFilterLevel] = useState<string>('formLevel');
  const [masterVocabList, setMasterVocabList] = useState<ShadowingVocabularyItem[]>([]);
  const [isLoadingMasterVocabs, setIsLoadingMasterVocabs] = useState<boolean>(false);

  const [isGrammarLibraryOpen, setIsGrammarLibraryOpen] = useState<boolean>(false);
  const [grammarSearchKeyword, setGrammarSearchKeyword] = useState<string>('');
  const [grammarFilterLevel, setGrammarFilterLevel] = useState<string>('formLevel');
  const [masterGrammarList, setMasterGrammarList] = useState<ShadowingGrammarItem[]>([]);
  const [isLoadingMasterGrammars, setIsLoadingMasterGrammars] = useState<boolean>(false);

  // Audio Recording State
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedAudioPreview, setRecordedAudioPreview] = useState<{ index: number; url: string; blob: Blob } | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState<boolean>(false);
  const [brokenAudioIndexes, setBrokenAudioIndexes] = useState<Record<number, boolean>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Import File Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showImportGuide, setShowImportGuide] = useState<boolean>(false);

  // Delete modal state (UC-32 Soft Delete)
  const [deletingItem, setDeletingItem] = useState<ShadowingDialogueItem | null>(null);

  // Audio / Detail Preview Modal State
  const [previewDialogue, setPreviewDialogue] = useState<ShadowingDialogueDetail | null>(null);
  const [previewActiveTab, setPreviewActiveTab] = useState<'sentences' | 'vocab' | 'grammar'>('sentences');
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    const [resCatalog, resScenarios] = await Promise.all([
      adminShadowingService.getCatalog(),
      scenarioService.getScenarios()
    ]);

    if (resCatalog.success && resCatalog.data) {
      setItems(resCatalog.data);
    }
    if (resScenarios.success && resScenarios.data) {
      setScenarios(resScenarios.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormScenarioId(scenarios[0]?.id || 1);
    setFormTitle('');
    setFormLevel('N5');
    setFormContextDescription('');
    setFormSpeakerRoles(['Khách hàng (Học viên)', 'Nhân viên']);
    setFormIsActive(true);
    setFormSentences([
      {
        orderIndex: 1,
        speakerRole: 'A',
        japaneseText: 'すみません、ラーメンをひとつお願いします。',
        romajiText: 'Sumimasen, raamen wo hitotsuonegai shimasu.',
        vietnameseTranslation: 'Xin lỗi, cho tôi xin một tô mì ramen.',
        nativeAudioUrl: null,
      },
      {
        orderIndex: 2,
        speakerRole: 'B',
        japaneseText: 'はい、かしこまりました。トッピングはいかがですか。',
        romajiText: 'Hai, kashikomarimashita. Toppingu wa ikaga desu ka.',
        vietnameseTranslation: 'Vâng, tôi đã rõ. Quý khách có muốn thêm topping gì không ạ?',
        nativeAudioUrl: null,
      },
    ]);
    setFormVocabularies([
      { word: 'ラーメン', reading: 'らーめん', meaning: 'Mì ramen' },
      { word: '注文', reading: 'ちゅうもん', meaning: 'Gọi món' }
    ]);
    setFormGrammars([
      { pattern: '～をお願いします', meaning: 'Làm ơn cho tôi...', exampleSentence: 'お水をお願いします。' }
    ]);
    setFormErrors([]);
    setActiveFormTab('sentences');
    setRecordedAudioPreview(null);
    setBrokenAudioIndexes({});
    setIsAiPanelOpen(false);
    setAiDraft(null);
    setAiCustomInstructions('');
    setIsVocabLibraryOpen(false);
    setIsGrammarLibraryOpen(false);
    setVocabFilterLevel('formLevel');
    setGrammarFilterLevel('formLevel');
    setIsFormOpen(true);
  };

  const handleOpenEdit = async (item: ShadowingDialogueItem) => {
    setEditingId(item.id);
    setIsAiPanelOpen(false);
    setAiDraft(null);
    setAiCustomInstructions('');
    setIsVocabLibraryOpen(false);
    setIsGrammarLibraryOpen(false);
    setVocabFilterLevel('formLevel');
    setGrammarFilterLevel('formLevel');
    setIsFormOpen(true);
    setIsSubmitting(true);
    setRecordedAudioPreview(null);
    setBrokenAudioIndexes({});
    setFormErrors([]);

    const res = await adminShadowingService.getDetail(item.id);
    if (res.success && res.data) {
      const d = res.data;
      setFormScenarioId(d.scenarioId);
      setFormTitle(d.title);
      setFormLevel(d.jlptLevel);
      setFormContextDescription(d.sourceDescription || '');
      setFormSpeakerRoles(
        d.speakerRoles && d.speakerRoles.length > 0
          ? d.speakerRoles
          : [d.speakerRoleA_Name || 'Vai A', d.speakerRoleB_Name || 'Vai B']
      );
      setFormIsActive(d.isActive);
      setFormSentences(
        d.sentences.map((s) => ({
          orderIndex: s.orderIndex,
          speakerRole: s.speakerRole,
          japaneseText: s.japaneseText,
          romajiText: s.romajiText || '',
          vietnameseTranslation: s.vietnameseTranslation,
          nativeAudioUrl: s.nativeAudioUrl || null,
          audioDurationMs: s.audioDurationMs || null,
        }))
      );
      setFormVocabularies(d.targetVocabularies || []);
      setFormGrammars(d.targetGrammars || []);
    }
    setIsSubmitting(false);
  };

  const handleOpenPreview = async (id: number) => {
    setIsPreviewLoading(true);
    setPreviewActiveTab('sentences');
    const res = await adminShadowingService.getDetail(id);
    if (res.success && res.data) {
      setPreviewDialogue(res.data);
    }
    setIsPreviewLoading(false);
  };

  // Role Management
  const handleAddRole = () => {
    const nextChar = String.fromCharCode(65 + formSpeakerRoles.length); // C, D, E...
    setFormSpeakerRoles((prev) => [...prev, `Nhân vật ${nextChar}`]);
  };

  const handleRoleNameChange = (idx: number, newName: string) => {
    setFormSpeakerRoles((prev) => {
      const updated = [...prev];
      updated[idx] = newName;
      return updated;
    });
  };

  const handleRemoveRole = (idx: number) => {
    if (formSpeakerRoles.length <= 2) return; // Keep minimum 2 roles
    const removedChar = String.fromCharCode(65 + idx);
    setFormSpeakerRoles((prev) => prev.filter((_, i) => i !== idx));
    // Reassign sentences using this role to 'A'
    setFormSentences((prev) =>
      prev.map((s) => (s.speakerRole === removedChar ? { ...s, speakerRole: 'A' } : s))
    );
  };

  // Sentences Management
  const handleAddSentence = () => {
    const defaultRole = String.fromCharCode(65 + (formSentences.length % formSpeakerRoles.length));
    setFormSentences((prev) => [
      ...prev,
      {
        orderIndex: prev.length + 1,
        speakerRole: defaultRole,
        japaneseText: '',
        romajiText: '',
        vietnameseTranslation: '',
        nativeAudioUrl: null,
      },
    ]);
  };

  const handleRemoveSentence = (index: number) => {
    if (formSentences.length <= 1) return;
    setFormSentences((prev) =>
      prev.filter((_, i) => i !== index).map((s, idx) => ({ ...s, orderIndex: idx + 1 }))
    );
  };

  const handleSentenceChange = (
    index: number,
    field: keyof CreateShadowingSentencePayload,
    value: any
  ) => {
    setFormSentences((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Vocab Management
  const handleAddVocab = () => {
    setFormVocabularies((prev) => [
      ...prev,
      { word: '', reading: '', meaning: '' }
    ]);
  };

  const handleVocabChange = (index: number, field: keyof ShadowingVocabularyItem, value: string) => {
    setFormVocabularies((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveVocab = (index: number) => {
    setFormVocabularies((prev) => prev.filter((_, i) => i !== index));
  };

  // Grammar Management
  const handleAddGrammar = () => {
    setFormGrammars((prev) => [
      ...prev,
      { pattern: '', meaning: '', exampleSentence: '' }
    ]);
  };

  const handleGrammarChange = (index: number, field: keyof ShadowingGrammarItem, value: string) => {
    setFormGrammars((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveGrammar = (index: number) => {
    setFormGrammars((prev) => prev.filter((_, i) => i !== index));
  };

  // AI Translate Assist
  const handleTranslateAssist = async (index: number, direction: 'ja-vi' | 'vi-ja') => {
    const sentence = formSentences[index];
    const text = direction === 'ja-vi' ? sentence.japaneseText : sentence.vietnameseTranslation;
    if (!text.trim()) {
      alert(direction === 'ja-vi' ? 'Vui lòng nhập câu tiếng Nhật trước khi gọi AI.' : 'Vui lòng nhập câu tiếng Việt trước khi gọi AI.');
      return;
    }

    setTranslatingIndex({ index, dir: direction });
    const res = await adminShadowingService.translateAssist({
      text,
      sourceLanguage: direction === 'ja-vi' ? 'ja' : 'vi',
      jlptLevel: formLevel,
    });

    if (res.success && res.data) {
      const { japaneseText, romajiText, vietnameseTranslation } = res.data;
      setFormSentences((prev) => {
        const next = [...prev];
        if (direction === 'ja-vi') {
          next[index] = {
            ...next[index],
            romajiText: romajiText || next[index].romajiText,
            vietnameseTranslation: vietnameseTranslation || next[index].vietnameseTranslation,
          };
        } else {
          next[index] = {
            ...next[index],
            japaneseText: japaneseText || next[index].japaneseText,
            romajiText: romajiText || next[index].romajiText,
          };
        }
        return next;
      });
      addToast('Dịch tự động hoàn tất.', 'success');
    } else {
      addToast(res.message || 'Hỗ trợ dịch tự động gặp sự cố.', 'error');
    }
    setTranslatingIndex(null);
  };

  // AI Dialogue Full Generation (In-form Draft Workflow)
  const handleGenerateDialogue = async () => {
    const selectedScenario = scenarios.find((s) => s.id === formScenarioId);
    const contextTitle = formTitle.trim() || selectedScenario?.title || 'Hội thoại giao tiếp đời sống';

    const safeSentenceCount = Math.max(2, Math.min(12, Number(aiSentenceCount) || 4));
    const safeVocabCount = Math.max(1, Math.min(8, Number(aiVocabCount) || 3));
    const safeGrammarCount = Math.max(1, Math.min(5, Number(aiGrammarCount) || 2));

    setIsAiGenerating(true);
    const payload: GenerateShadowingDialoguePayload = {
      scenarioId: formScenarioId,
      contextTitle,
      contextDescription: formContextDescription.trim() || selectedScenario?.description,
      jlptLevel: formLevel,
      speakerRoles: formSpeakerRoles,
      sentenceCount: safeSentenceCount,
      vocabCount: safeVocabCount,
      grammarCount: safeGrammarCount,
      customInstructions: aiCustomInstructions.trim() || undefined,
    };

    const res = await adminShadowingService.generateDialogue(payload);
    setIsAiGenerating(false);

    if (res.success && res.data) {
      setAiDraft(res.data);
      addToast(`✨ AI đã tạo xong bản thảo gồm ${res.data.sentences.length} câu thoại gợi ý!`, 'success');
    } else {
      addToast(res.message || 'Không thể tạo gợi ý nội dung từ AI.', 'error');
    }
  };

  const handleApplyAiDraft = () => {
    if (!aiDraft) return;

    if (!formTitle.trim() || formTitle.trim().length <= 3) {
      setFormTitle(aiDraft.title);
    }
    if (!formContextDescription.trim() && aiDraft.contextDescription) {
      setFormContextDescription(aiDraft.contextDescription);
    }
    if (aiDraft.speakerRoles && aiDraft.speakerRoles.length > 0) {
      setFormSpeakerRoles(aiDraft.speakerRoles);
    }
    if (aiDraft.sentences && aiDraft.sentences.length > 0) {
      const roleAName = aiDraft.speakerRoles?.[0] || formSpeakerRoles[0] || 'Vai A';
      const roleBName = aiDraft.speakerRoles?.[1] || formSpeakerRoles[1] || 'Vai B';

      setFormSentences(
        aiDraft.sentences.map((s, idx) => {
          let normalizedRole = 'A';
          const rawRole = (s.speakerRole || '').trim();
          if (rawRole.toUpperCase() === 'B' || (roleBName && rawRole.toLowerCase() === roleBName.toLowerCase())) {
            normalizedRole = 'B';
          } else if (rawRole.toUpperCase() === 'A' || (roleAName && rawRole.toLowerCase() === roleAName.toLowerCase())) {
            normalizedRole = 'A';
          } else {
            normalizedRole = idx % 2 === 0 ? 'A' : 'B';
          }

          return {
            orderIndex: idx + 1,
            speakerRole: normalizedRole,
            japaneseText: s.japaneseText,
            romajiText: s.romajiText || '',
            vietnameseTranslation: s.vietnameseTranslation,
            nativeAudioUrl: null,
          };
        })
      );
    }
    if (aiDraft.targetVocabularies && aiDraft.targetVocabularies.length > 0) {
      setFormVocabularies(aiDraft.targetVocabularies);
    }
    if (aiDraft.targetGrammars && aiDraft.targetGrammars.length > 0) {
      setFormGrammars(aiDraft.targetGrammars);
    }

    setAiDraft(null);
    setIsAiPanelOpen(false);
    addToast('Đã áp dụng bản thảo AI vào form.', 'success');
  };

  const handleDiscardAiDraft = () => {
    setAiDraft(null);
  };

  // Shared Master Data Library Handlers
  const fetchMasterVocabularies = async (keyword?: string, level?: string) => {
    setIsLoadingMasterVocabs(true);
    const targetLevel = level === 'formLevel' ? formLevel : level;
    const res = await adminShadowingService.getSharedVocabularies(keyword, targetLevel);
    if (res.success && res.data) {
      setMasterVocabList(res.data);
    }
    setIsLoadingMasterVocabs(false);
  };

  const fetchMasterGrammars = async (keyword?: string, level?: string) => {
    setIsLoadingMasterGrammars(true);
    const targetLevel = level === 'formLevel' ? formLevel : level;
    const res = await adminShadowingService.getSharedGrammars(keyword, targetLevel);
    if (res.success && res.data) {
      setMasterGrammarList(res.data);
    }
    setIsLoadingMasterGrammars(false);
  };

  const handleSelectMasterVocab = (v: ShadowingVocabularyItem) => {
    if (formVocabularies.some((existing) => existing.word.trim().toLowerCase() === v.word.trim().toLowerCase())) {
      alert(`Từ vựng "${v.word}" đã có trong bài học này.`);
      return;
    }
    setFormVocabularies((prev) => [
      ...prev,
      {
        id: v.id,
        word: v.word,
        reading: v.reading || '',
        meaning: v.meaning,
        wordClass: v.wordClass,
        jlptLevel: v.jlptLevel,
      },
    ]);
  };

  const handleSelectMasterGrammar = (g: ShadowingGrammarItem) => {
    if (formGrammars.some((existing) => existing.pattern.trim().toLowerCase() === g.pattern.trim().toLowerCase())) {
      alert(`Ngữ pháp "${g.pattern}" đã có trong bài học này.`);
      return;
    }
    setFormGrammars((prev) => [
      ...prev,
      {
        id: g.id,
        pattern: g.pattern,
        meaning: g.meaning,
        exampleSentence: g.exampleSentence || '',
        jlptLevel: g.jlptLevel,
      },
    ]);
  };

  // Audio Recording Handlers
  const handleStartRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioPreview({ index, url: audioUrl, blob: audioBlob });
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecordingIndex(index);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      addToast('Không thể truy cập microphone. Vui lòng cấp quyền micro cho trình duyệt.', 'error');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingIndex(null);
  };

  const handleSaveRecordedAudio = async (index: number) => {
    if (!recordedAudioPreview || recordedAudioPreview.index !== index) return;
    setIsUploadingAudio(true);
    const res = await adminShadowingService.uploadAudio(recordedAudioPreview.blob);
    setIsUploadingAudio(false);

    if (res.success && res.data) {
      handleSentenceChange(index, 'nativeAudioUrl', res.data);
      setRecordedAudioPreview(null);
      addToast('Đã lưu audio.', 'success');
    } else {
      addToast(res.message || 'Không thể lưu audio.', 'error');
    }
  };

  const handleClearSentenceAudio = (index: number) => {
    handleSentenceChange(index, 'nativeAudioUrl', null);
    if (recordedAudioPreview?.index === index) {
      setRecordedAudioPreview(null);
    }
    addToast('Đã gỡ audio câu thoại.', 'success');
  };

  // Import File Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        if (!content || !content.trim()) {
          throw new Error('Tệp tải lên rỗng.');
        }

        // Ensure we have current master list for resolution
        let currentVocabs = masterVocabList;
        let currentGrammars = masterGrammarList;
        if (currentVocabs.length === 0 || currentGrammars.length === 0) {
          const [vRes, gRes] = await Promise.all([
            adminShadowingService.getSharedVocabularies(undefined, 'ALL'),
            adminShadowingService.getSharedGrammars(undefined, 'ALL'),
          ]);
          if (vRes.success && vRes.data) {
            currentVocabs = vRes.data;
            setMasterVocabList(vRes.data);
          }
          if (gRes.success && gRes.data) {
            currentGrammars = gRes.data;
            setMasterGrammarList(gRes.data);
          }
        }

        if (file.name.toLowerCase().endsWith('.csv')) {
          const rawRows = parseRFC4180CSV(content);
          if (rawRows.length === 0) {
            throw new Error('Tệp CSV rỗng.');
          }

          // Detect header row
          let dataRows = rawRows;
          const firstRow = rawRows[0].map((c) => c.toLowerCase());
          const hasHeader = firstRow.some(
            (c) =>
              c.includes('role') ||
              c.includes('speaker') ||
              c.includes('japanese') ||
              c.includes('vietnamese') ||
              c.includes('tiếng')
          );
          if (hasHeader) {
            if (rawRows.length <= 1) {
              throw new Error('Tệp CSV chỉ chứa dòng tiêu đề (header), không có dữ liệu câu thoại.');
            }
            dataRows = rawRows.slice(1);
          }

          const errors: string[] = [];
          const warnings: string[] = [];
          const parsedSentences: CreateShadowingSentencePayload[] = [];

          dataRows.forEach((rowCols, idx) => {
            const rowNumber = hasHeader ? idx + 2 : idx + 1;
            const rawRole = (rowCols[0] || 'A').trim().toUpperCase();
            const japaneseText = (rowCols[1] || '').trim();
            const romajiText = (rowCols[2] || '').trim();
            const vietnameseTranslation = (rowCols[3] || '').trim();

            if (!japaneseText) {
              errors.push(`Dòng ${rowNumber}: Câu tiếng Nhật không được để trống.`);
            }
            if (!vietnameseTranslation) {
              errors.push(`Dòng ${rowNumber}: Bản dịch tiếng Việt không được để trống.`);
            }

            let normalizedRole = 'A';
            if (rawRole === 'B' || (formSpeakerRoles[1] && formSpeakerRoles[1].toUpperCase().includes(rawRole))) {
              normalizedRole = 'B';
            } else if (rawRole === 'A' || (formSpeakerRoles[0] && formSpeakerRoles[0].toUpperCase().includes(rawRole))) {
              normalizedRole = 'A';
            } else {
              normalizedRole = idx % 2 === 0 ? 'A' : 'B';
            }

            parsedSentences.push({
              orderIndex: idx + 1,
              speakerRole: normalizedRole,
              japaneseText,
              romajiText,
              vietnameseTranslation,
              nativeAudioUrl: null,
            });
          });

          setImportPreview({
            format: 'csv',
            title: formTitle || 'Bài học hiện tại',
            jlptLevel: formLevel,
            contextDescription: formContextDescription,
            speakerRoles: formSpeakerRoles,
            sentences: parsedSentences,
            targetVocabularies: [],
            targetGrammars: [],
            errors,
            warnings,
          });

          if (errors.length > 0) {
            addToast('Tệp CSV có chứa lỗi xác thực dữ liệu. Vui lòng kiểm tra các mục đánh dấu đỏ.', 'error');
          } else {
            addToast(`Tệp CSV đã được phân tích cú pháp thành công (${parsedSentences.length} câu thoại).`, 'success');
          }
        } else if (file.name.toLowerCase().endsWith('.json')) {
          let parsed: any;
          try {
            parsed = JSON.parse(content);
          } catch (e: any) {
            throw new Error(`Cú pháp JSON không hợp lệ: ${e.message}`);
          }

          if (!parsed || typeof parsed !== 'object') {
            throw new Error('Định dạng tệp JSON không hợp lệ (phải là đối tượng JSON).');
          }

          const errors: string[] = [];
          const warnings: string[] = [];

          // 1. JLPT validation
          let resolvedLevel: 'N5' | 'N4' | 'N3' = formLevel;
          if (parsed.jlptLevel) {
            const lvl = String(parsed.jlptLevel).trim().toUpperCase();
            if (lvl === 'N5' || lvl === 'N4' || lvl === 'N3') {
              resolvedLevel = lvl as 'N5' | 'N4' | 'N3';
            } else {
              errors.push(`Cấp độ JLPT '${parsed.jlptLevel}' không hợp lệ (hệ thống chỉ hỗ trợ N5, N4, N3).`);
            }
          }

          // 2. Scenario matching
          let resolvedScenarioId: number | undefined = undefined;
          let matchedScenarioTitle: string | undefined = undefined;
          let scenarioWarning: string | undefined = undefined;

          if (parsed.scenarioCode || parsed.scenarioId) {
            const matched = scenarios.find(
              (s) =>
                (parsed.scenarioCode && s.scenarioCode === parsed.scenarioCode) ||
                (parsed.scenarioId && s.id === Number(parsed.scenarioId))
            );
            if (matched) {
              resolvedScenarioId = matched.id;
              matchedScenarioTitle = `#${matched.id} - ${matched.title}`;
            } else {
              scenarioWarning = `Không tìm thấy kịch bản khớp với '${parsed.scenarioCode || parsed.scenarioId}'. Bạn sẽ cần chọn Kịch bản thủ công trên form sau khi nạp.`;
              warnings.push(scenarioWarning);
            }
          } else {
            scenarioWarning = 'Tệp JSON không chỉ định kịch bản cha. Kịch bản của form hiện tại sẽ được giữ nguyên.';
          }

          // 3. Sentences validation
          const rawSentences: any[] = Array.isArray(parsed.sentences) ? parsed.sentences : [];
          if (rawSentences.length === 0) {
            errors.push('Tệp JSON không chứa danh sách câu thoại ("sentences").');
          }

          const parsedRoles = Array.isArray(parsed.speakerRoles) ? parsed.speakerRoles : formSpeakerRoles;
          const parsedSentences: CreateShadowingSentencePayload[] = rawSentences.map((s, idx) => {
            const rowNumber = idx + 1;
            const rawRole = (s.speakerRole || (idx % 2 === 0 ? 'A' : 'B')).trim().toUpperCase();
            const japaneseText = (s.japaneseText || '').trim();
            const romajiText = (s.romajiText || '').trim();
            const vietnameseTranslation = (s.vietnameseTranslation || '').trim();
            const nativeAudioUrl = s.nativeAudioUrl ? String(s.nativeAudioUrl).trim() : null;

            if (!japaneseText) {
              errors.push(`Câu thoại #${rowNumber}: Thuộc tính "japaneseText" không được để trống.`);
            }
            if (!vietnameseTranslation) {
              errors.push(`Câu thoại #${rowNumber}: Thuộc tính "vietnameseTranslation" không được để trống.`);
            }

            let normalizedRole = 'A';
            if (rawRole === 'B' || (parsedRoles[1] && parsedRoles[1].toUpperCase().includes(rawRole))) {
              normalizedRole = 'B';
            } else if (rawRole === 'A' || (parsedRoles[0] && parsedRoles[0].toUpperCase().includes(rawRole))) {
              normalizedRole = 'A';
            } else {
              normalizedRole = idx % 2 === 0 ? 'A' : 'B';
            }

            return {
              orderIndex: s.orderIndex || rowNumber,
              speakerRole: normalizedRole,
              japaneseText,
              romajiText,
              vietnameseTranslation,
              nativeAudioUrl,
            };
          });

          // 4. Vocabularies matching
          const rawVocabs: any[] = Array.isArray(parsed.targetVocabularies) ? parsed.targetVocabularies : [];
          const resolvedVocabs: ImportVocabItem[] = rawVocabs.map((v) => {
            const word = (v.word || '').trim();
            const meaning = (v.meaning || '').trim();
            const reading = v.reading ? String(v.reading).trim() : '';
            const matched = currentVocabs.find(
              (mv) =>
                (v.id && mv.id === v.id) ||
                (mv.word.trim().toLowerCase() === word.toLowerCase() &&
                  mv.meaning.trim().toLowerCase() === meaning.toLowerCase())
            );

            if (matched) {
              return {
                word,
                reading: reading || matched.reading || '',
                meaning,
                jlptLevel: v.jlptLevel || matched.jlptLevel || resolvedLevel,
                matchedMasterId: matched.id,
                status: 'matched' as const,
                action: 'create_new' as const,
              };
            } else {
              return {
                word,
                reading,
                meaning,
                jlptLevel: v.jlptLevel || resolvedLevel,
                status: 'missing' as const,
                action: 'create_new' as const,
              };
            }
          });

          // 5. Grammars matching
          const rawGrammars: any[] = Array.isArray(parsed.targetGrammars) ? parsed.targetGrammars : [];
          const resolvedGrammars: ImportGrammarItem[] = rawGrammars.map((g) => {
            const pattern = (g.pattern || '').trim();
            const meaning = (g.meaning || '').trim();
            const exampleSentence = g.exampleSentence ? String(g.exampleSentence).trim() : '';
            const matched = currentGrammars.find(
              (mg) =>
                (g.id && mg.id === g.id) ||
                (mg.pattern.trim().toLowerCase() === pattern.toLowerCase() &&
                  mg.meaning.trim().toLowerCase() === meaning.toLowerCase())
            );

            if (matched) {
              return {
                pattern,
                meaning,
                exampleSentence: exampleSentence || matched.exampleSentence || '',
                jlptLevel: g.jlptLevel || matched.jlptLevel || resolvedLevel,
                matchedMasterId: matched.id,
                status: 'matched' as const,
                action: 'create_new' as const,
              };
            } else {
              return {
                pattern,
                meaning,
                exampleSentence,
                jlptLevel: g.jlptLevel || resolvedLevel,
                status: 'missing' as const,
                action: 'create_new' as const,
              };
            }
          });

          setImportPreview({
            format: 'json',
            title: parsed.title ? String(parsed.title).trim() : formTitle,
            jlptLevel: resolvedLevel,
            scenarioId: resolvedScenarioId,
            scenarioCode: parsed.scenarioCode,
            matchedScenarioTitle,
            scenarioWarning,
            contextDescription: parsed.contextDescription || parsed.sourceDescription || formContextDescription,
            speakerRoles:
              Array.isArray(parsed.speakerRoles) && parsed.speakerRoles.length > 0
                ? parsed.speakerRoles
                : formSpeakerRoles,
            sentences: parsedSentences,
            targetVocabularies: resolvedVocabs,
            targetGrammars: resolvedGrammars,
            errors,
            warnings,
          });

          if (errors.length > 0) {
            addToast('Tệp JSON có chứa lỗi xác thực dữ liệu. Vui lòng kiểm tra các mục đánh dấu đỏ.', 'error');
          } else {
            addToast(`Tệp JSON đã được phân tích cú pháp thành công (${parsedSentences.length} câu thoại).`, 'success');
          }
        } else {
          throw new Error('Định dạng tệp không được hỗ trợ. Vui lòng chọn tệp .json hoặc .csv.');
        }
      } catch (err: any) {
        setImportError(err.message || 'Lỗi đọc tệp.');
        setImportPreview(null);
        addToast(`Lỗi nhập tệp: ${err.message || 'Không thể đọc tệp.'}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleToggleVocabAction = (idx: number) => {
    if (!importPreview) return;
    setImportPreview((prev) => {
      if (!prev) return null;
      const nextVocabs = [...prev.targetVocabularies];
      nextVocabs[idx] = {
        ...nextVocabs[idx],
        action: nextVocabs[idx].action === 'create_new' ? 'skip' : 'create_new',
      };
      return { ...prev, targetVocabularies: nextVocabs };
    });
  };

  const handleToggleGrammarAction = (idx: number) => {
    if (!importPreview) return;
    setImportPreview((prev) => {
      if (!prev) return null;
      const nextGrammars = [...prev.targetGrammars];
      nextGrammars[idx] = {
        ...nextGrammars[idx],
        action: nextGrammars[idx].action === 'create_new' ? 'skip' : 'create_new',
      };
      return { ...prev, targetGrammars: nextGrammars };
    });
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    if (importPreview.errors.length > 0) {
      addToast('Tệp có chứa lỗi validation. Vui lòng kiểm tra và sửa các lỗi hiển thị màu đỏ trước khi áp dụng.', 'error');
      return;
    }

    if (formSentences.length > 0) {
      const confirmOverwrite = window.confirm(
        `Form hiện tại đang có ${formSentences.length} câu đối thoại. Áp dụng tệp này sẽ thay thế danh sách câu thoại đó.\n\nBạn có chắc chắn muốn tiếp tục?`
      );
      if (!confirmOverwrite) return;
    }

    if (importPreview.format === 'csv') {
      // CSV = Quick Dialogue Import
      // ONLY replace sentences, preserve formTitle, formLevel, formScenarioId, formContextDescription, formSpeakerRoles, formVocabularies, formGrammars
      setFormSentences(importPreview.sentences);
      addToast('Đã áp dụng dữ liệu câu thoại vào form.', 'success');
    } else {
      // JSON = Full Lesson Import
      if (importPreview.title) {
        setFormTitle(importPreview.title);
      }
      if (importPreview.jlptLevel) {
        setFormLevel(importPreview.jlptLevel);
      }
      if (importPreview.scenarioId) {
        setFormScenarioId(importPreview.scenarioId);
      }
      if (importPreview.contextDescription) {
        setFormContextDescription(importPreview.contextDescription);
      }
      if (importPreview.speakerRoles && importPreview.speakerRoles.length > 0) {
        setFormSpeakerRoles(importPreview.speakerRoles);
      }
      setFormSentences(importPreview.sentences);

      // Filter Vocabularies
      const filteredVocabs: ShadowingVocabularyItem[] = importPreview.targetVocabularies
        .filter((v) => v.action !== 'skip')
        .map((v) => ({
          id: v.matchedMasterId,
          word: v.word,
          reading: v.reading || '',
          meaning: v.meaning,
          jlptLevel: v.jlptLevel,
        }));
      setFormVocabularies(filteredVocabs);

      // Filter Grammars
      const filteredGrammars: ShadowingGrammarItem[] = importPreview.targetGrammars
        .filter((g) => g.action !== 'skip')
        .map((g) => ({
          id: g.matchedMasterId,
          pattern: g.pattern,
          meaning: g.meaning,
          exampleSentence: g.exampleSentence || '',
          jlptLevel: g.jlptLevel,
        }));
      setFormGrammars(filteredGrammars);

      addToast('Đã áp dụng toàn bộ bài học vào form.', 'success');
    }

    setIsImportModalOpen(false);
    setImportPreview(null);
    setIsFormOpen(true);
  };

  const handleDownloadTemplate = async (format: 'csv' | 'json') => {
    const fileName = format === 'csv' ? 'shadowing_dialogue_template.csv' : 'shadowing_full_lesson_template.json';
    try {
      const res = await fetch(`/api/admin/shadowing/download-template?type=${format}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      addToast(`Đang tải file mẫu: ${fileName}`, 'success');
    } catch {
      window.location.href = `/api/admin/shadowing/download-template?type=${format}`;
    }
  };

  // Submit Form
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);

    if (!formTitle.trim()) {
      setFormErrors(['Tiêu đề bài học không được để trống.']);
      return;
    }
    if (formSentences.length === 0) {
      setFormErrors(['Phải có ít nhất 1 câu đối thoại.']);
      return;
    }

    const invalidSentence = formSentences.find(
      (s) => !s.japaneseText.trim() || !s.vietnameseTranslation.trim()
    );
    if (invalidSentence) {
      setFormErrors([`Câu thoại số ${invalidSentence.orderIndex} chưa điền đủ Tiếng Nhật hoặc Bản dịch.`]);
      return;
    }

    setIsSubmitting(true);
    let finalSentences = [...formSentences];
    if (recordedAudioPreview) {
      const audioRes = await adminShadowingService.uploadAudio(recordedAudioPreview.blob);
      if (audioRes.success && audioRes.data) {
        finalSentences[recordedAudioPreview.index] = {
          ...finalSentences[recordedAudioPreview.index],
          nativeAudioUrl: audioRes.data,
        };
        setFormSentences(finalSentences);
        setRecordedAudioPreview(null);
      }
    }

    const roleA = formSpeakerRoles[0] || 'Vai A';
    const roleB = formSpeakerRoles[1] || 'Vai B';

    if (editingId) {
      // UC-31 Update
      const res = await adminShadowingService.updateDialogue(editingId, {
        title: formTitle,
        jlptLevel: formLevel,
        sourceDescription: formContextDescription || null,
        speakerRoleA_Name: roleA,
        speakerRoleB_Name: roleB,
        speakerRoles: formSpeakerRoles,
        isActive: formIsActive,
        sentences: finalSentences,
        targetVocabularies: formVocabularies,
        targetGrammars: formGrammars,
      });

      if (res.success) {
        setIsFormOpen(false);
        addToast('Cập nhật Shadowing thành công.', 'success');
        loadData();
      } else {
        setFormErrors(res.errors || [res.message || 'Không thể cập nhật Shadowing.']);
        addToast('Không thể cập nhật Shadowing.', 'error');
      }
    } else {
      // UC-30 Create
      const payload: CreateShadowingDialoguePayload = {
        scenarioId: formScenarioId,
        title: formTitle,
        jlptLevel: formLevel,
        sourceDescription: formContextDescription || null,
        speakerRoleA_Name: roleA,
        speakerRoleB_Name: roleB,
        speakerRoles: formSpeakerRoles,
        sentences: finalSentences,
        targetVocabularies: formVocabularies,
        targetGrammars: formGrammars,
      };

      const res = await adminShadowingService.createDialogue(payload);
      if (res.success) {
        setIsFormOpen(false);
        addToast('Tạo Shadowing thành công.', 'success');
        loadData();
      } else {
        setFormErrors(res.errors || [res.message || 'Không thể tạo Shadowing. Vui lòng thử lại.']);
        addToast('Không thể tạo Shadowing. Vui lòng thử lại.', 'error');
      }
    }
    setIsSubmitting(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const res = await adminShadowingService.softDelete(deletingItem.id);
    if (res.success) {
      addToast('Đã tạm ngưng Shadowing.', 'success');
      setDeletingItem(null);
      loadData();
    } else {
      addToast('Không thể tạm ngưng Shadowing.', 'error');
      setDeletingItem(null);
    }
  };

  const handleExportExcel = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['ID,Tiêu đề,Cấp độ,Kịch bản,Trạng thái,Số câu']
        .concat(
          filteredItems.map(
            (i) =>
              `"${i.id}","${i.title}","${i.jlptLevel}","${i.scenarioTitle}","${i.isActive ? 'Hoạt động' : 'Tạm ngưng'}","${i.totalSentences}"`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shadowing_dialogues_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setMessage({ type: 'success', text: '📥 Đã xuất dữ liệu danh mục Shadowing ra tệp CSV (.csv).' });
    setTimeout(() => setMessage(null), 4000);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilterLevel('ALL');
    setFilterScenario('ALL');
    setFilterStatus('ALL');
  };

  // Filter calculations
  const filteredItems = items.filter((item) => {
    const term = searchTerm.trim();
    if (!term) return true;
    if (term.length < 2) return false;
    const q = term.toLowerCase();
    const matchTitle = item.title.toLowerCase().includes(q);
    const matchCode = `SHD_${item.id}`.toLowerCase().includes(q) || (item.scenarioTitle && item.scenarioTitle.toLowerCase().includes(q));
    if (!matchTitle && !matchCode) return false;
    if (filterLevel !== 'ALL' && item.jlptLevel !== filterLevel) return false;
    if (filterScenario !== 'ALL' && item.scenarioTitle !== filterScenario) return false;
    if (filterStatus === 'ACTIVE' && !item.isActive) return false;
    if (filterStatus === 'INACTIVE' && item.isActive) return false;
    return true;
  });

  const totalCount = items.length;
  const activeCount = items.filter((i) => i.isActive).length;
  const inactiveCount = items.filter((i) => !i.isActive).length;
  const uniqueScenarios = Array.from(new Set(items.map((i) => i.scenarioTitle).filter(Boolean)));

  const getRoleBadgeColor = (roleChar: string) => {
    switch (roleChar) {
      case 'A':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'B':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'C':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'D':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* 1. Breadcrumb & Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
            <span>Hệ thống Quản trị</span>
            <span>&gt;</span>
            <span>Nội dung Luyện nói</span>
            <span>&gt;</span>
            <span className="text-slate-800 font-semibold">Quản lý Shadowing</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Quản lý Nội dung Shadowing
            </h1>
            <span className="bg-blue-100 text-[#0878EE] font-bold text-xs px-2.5 py-0.5 rounded-full border border-blue-200">
              {totalCount} bài
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý danh mục bài hội thoại mẫu, thiết lập vai nhân vật, ngân hàng câu thoại kèm hỗ trợ AI và thu âm giọng chuẩn.
          </p>
        </div>

        {/* Action Header Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/shadowing"
            className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300 px-3.5 py-2 rounded-xl text-xs transition shadow-xs cursor-pointer active:scale-98"
            title="Chuyển sang giao diện luyện nói Shadowing của người học để trải nghiệm thực tế"
          >
            <span>🎧</span>
            <span>Vào giao diện người học</span>
          </Link>
          <button
            onClick={() => {
              setImportPreview(null);
              setImportError(null);
              setImportFileName('');
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300 px-3.5 py-2 rounded-xl text-xs transition shadow-xs cursor-pointer active:scale-98"
          >
            <span>📂</span>
            <span>Nhập tệp</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300 px-3.5 py-2 rounded-xl text-xs transition shadow-xs cursor-pointer active:scale-98"
          >
            <span>📥</span>
            <span>Xuất CSV</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 bg-[#0878EE] hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm cursor-pointer active:scale-98"
          >
            <span>+</span>
            <span>Thêm bài Shadowing mới</span>
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between shadow-xs ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{message.type === 'success' ? '✅' : '⚠️'} {message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold hover:opacity-75 cursor-pointer">✕</button>
        </div>
      )}

      {/* 2. Top Metric Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                TỔNG SỐ BÀI HỘI THOẠI
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">{totalCount < 10 ? `0${totalCount}` : totalCount}</span>
                <span className="text-sm font-semibold text-slate-500">bài</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0878EE] flex items-center justify-center text-lg border border-blue-100">
              📄
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>⚙️</span>
            <span>Hỗ trợ đa vai nhân vật & AI generation</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                ĐANG HOẠT ĐỘNG
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">{activeCount < 10 ? `0${activeCount}` : activeCount}</span>
                <span className="text-sm font-semibold text-slate-500">bài</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg border border-emerald-100">
              ✔
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Sẵn sàng cho người học truy cập</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                ĐÃ ẨN / TẠM NGƯNG
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">{inactiveCount < 10 ? `0${inactiveCount}` : inactiveCount}</span>
                <span className="text-sm font-semibold text-slate-500">bài</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg border border-amber-100">
              👁️‍🗨️
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-amber-700 font-medium">
            <span>ℹ️</span>
            <span>{inactiveCount > 0 ? `${inactiveCount} bài tạm ẩn` : 'Tất cả bài học đang hiển thị'}</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar Row */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tiêu đề bài học, mã kịch bản, từ khóa..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] cursor-pointer"
          >
            <option value="ALL">Cấp độ: Tất cả JLPT</option>
            <option value="N5">JLPT N5</option>
            <option value="N4">JLPT N4</option>
            <option value="N3">JLPT N3</option>
          </select>

          <select
            value={filterScenario}
            onChange={(e) => setFilterScenario(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] cursor-pointer max-w-[180px] truncate"
          >
            <option value="ALL">Kịch bản: Tất cả</option>
            {uniqueScenarios.map((scen) => (
              <option key={scen} value={scen}>{scen}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0878EE] cursor-pointer"
          >
            <option value="ALL">Trạng thái: Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="INACTIVE">Đã ẩn / Tạm ngưng</option>
          </select>

          <button
            onClick={resetFilters}
            title="Đặt lại bộ lọc"
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs transition cursor-pointer border border-slate-200"
          >
            🔄
          </button>
        </div>
      </div>

      {/* 4. Main Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <span className="inline-block animate-spin text-lg mb-2">⏳</span>
            <p>Đang tải danh mục Shadowing...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <span className="text-3xl mb-2 block">📭</span>
            <p>Không tìm thấy bài học Shadowing nào phù hợp.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Bài học</th>
                  <th className="py-3 px-4">Kịch bản liên kết</th>
                  <th className="py-3 px-4">Bối cảnh</th>
                  <th className="py-3 px-4">Vai hội thoại</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="bg-blue-50 text-[#0878EE] font-bold text-[10px] px-1.5 py-0.5 rounded border border-blue-200">
                          {item.jlptLevel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Mã: <span className="font-mono text-slate-500 font-semibold">SHD_{item.id}</span> • {item.totalSentences} câu thoại
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-slate-200">
                        {item.scenarioTitle || 'Chưa gắn'}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-500">
                      {item.sourceDescription || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          A: {item.speakerRoleA_Name}
                        </span>
                        <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          B: {item.speakerRoleB_Name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          Tạm ngưng
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenPreview(item.id)}
                          title="Xem chi tiết & âm thanh mẫu"
                          className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition border border-transparent hover:border-blue-200 cursor-pointer"
                        >
                          👁️
                        </button>
                        <Link
                          to={`/shadowing/practice/${item.id}`}
                          target="_blank"
                          title="Luyện thử giao diện học viên"
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition border border-emerald-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <span>🎧</span>
                          <span>Luyện thử</span>
                        </Link>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          title="Chỉnh sửa bài học"
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition border border-transparent hover:border-slate-300 cursor-pointer"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeletingItem(item)}
                          title="Vô hiệu hóa (xóa mềm)"
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition border border-transparent hover:border-red-200 cursor-pointer"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Create / Edit Form Modal */}
      {isFormOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-200 my-auto max-h-[90vh] flex flex-col relative">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingId ? `Chỉnh sửa bài Shadowing #${editingId}` : 'Thêm mới bài Shadowing'}
                </h2>
                <p className="text-xs text-slate-500">
                  Cấu hình kịch bản, các vai nhân vật và nội dung câu thoại luyện nói.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportPreview(null);
                    setImportError(null);
                    setImportFileName('');
                    setIsImportModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-98 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700"
                >
                  <span>📂</span>
                  <span>Nhập từ tệp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-98 ${
                    isAiPanelOpen
                      ? 'bg-indigo-700 text-white ring-2 ring-indigo-400'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
                  }`}
                >
                  <span>🤖</span>
                  <span>{isAiPanelOpen ? 'Thu gọn AI Assist' : 'AI Trợ lý nội dung'}</span>
                </button>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveForm} className="flex flex-col flex-1 min-h-0 overflow-hidden text-xs">
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Embedded In-Form AI Assist Panel */}
              {isAiPanelOpen && (
                <div className="bg-gradient-to-br from-indigo-50/90 via-blue-50/50 to-slate-50 border-2 border-indigo-200/90 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm shadow-2xs">
                        🤖
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">AI Assist: Trợ lý tạo nội dung Shadowing</h3>
                          <span className="bg-indigo-100 text-indigo-700 font-bold text-[10px] px-2 py-0.5 rounded-full border border-indigo-200">
                            Bản nháp / Draft Mode
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          AI tự động phân tích bối cảnh, các vai nhân vật và sinh ra bộ hội thoại chuẩn ngữ điệu. Dữ liệu sẽ trở thành bản thảo để bạn xem trước trước khi áp dụng vào form.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAiPanelOpen(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold px-2 py-1 rounded-lg hover:bg-white cursor-pointer"
                    >
                      Thu gọn ✕
                    </button>
                  </div>

                  {/* Context Auto-detection Info */}
                  <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-600">
                    <div>
                      <span className="font-bold text-slate-700 block">Kịch bản cha:</span>
                      <span className="text-indigo-900 font-medium truncate block">
                        #{formScenarioId} - {scenarios.find((s) => s.id === formScenarioId)?.title || 'Chưa chọn'}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700 block">Cấp độ JLPT:</span>
                      <span className="font-bold text-[#0878EE]">{formLevel}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-700 block">Các vai đối thoại:</span>
                      <span className="text-slate-800 font-medium truncate block">
                        {formSpeakerRoles.filter(Boolean).join(' & ') || 'Vai A & Vai B'}
                      </span>
                    </div>
                  </div>

                  {/* AI Generation Settings */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1 text-xs">
                        Chủ đề / Bối cảnh muốn AI tạo:
                      </label>
                      <input
                        type="text"
                        value={formTitle || scenarios.find((s) => s.id === formScenarioId)?.title || ''}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="Ví dụ: Đặt bàn ăn tối tại nhà hàng Tokyo..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1 text-xs flex items-center justify-between">
                        <span>Chỉ dẫn bổ sung cho AI (Custom Instructions):</span>
                        <span className="text-slate-400 font-normal text-[11px]">Tùy chọn</span>
                      </label>
                      <textarea
                        value={aiCustomInstructions}
                        onChange={(e) => setAiCustomInstructions(e.target.value)}
                        placeholder="Ví dụ: Tạo hội thoại N4 tự nhiên, khoảng 6 câu, ưu tiên mẫu câu dùng trong nhà hàng khi gọi món và thanh toán tiền."
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Số câu thoại: 2 - 12 câu */}
                      <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="font-bold text-slate-800 text-xs">Số câu thoại</label>
                          <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">
                            2 - 12 câu
                          </span>
                        </div>
                        {/* Stepper */}
                        <div className="flex items-center justify-between bg-slate-50 p-1 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            disabled={aiSentenceCount <= 2}
                            onClick={() => setAiSentenceCount((prev) => Math.max(2, prev - 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs text-sm"
                          >
                            −
                          </button>
                          <div className="flex items-baseline gap-1">
                            <input
                              type="number"
                              min={2}
                              max={12}
                              value={aiSentenceCount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) setAiSentenceCount(Math.max(2, Math.min(12, val)));
                              }}
                              className="w-10 text-center font-extrabold text-indigo-700 text-base bg-transparent border-b border-dashed border-indigo-300 focus:border-indigo-600 focus:outline-none"
                            />
                            <span className="text-xs font-semibold text-slate-500">câu</span>
                          </div>
                          <button
                            type="button"
                            disabled={aiSentenceCount >= 12}
                            onClick={() => setAiSentenceCount((prev) => Math.min(12, prev + 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-700 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs text-sm"
                          >
                            +
                          </button>
                        </div>
                        {/* Quick Presets */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">Chọn nhanh:</span>
                          {[4, 6, 8, 10].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAiSentenceCount(n)}
                              className={`flex-1 py-0.5 text-[11px] font-semibold rounded-md border transition cursor-pointer ${
                                aiSentenceCount === n
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Số từ vựng: 1 - 8 từ */}
                      <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="font-bold text-slate-800 text-xs">Số từ vựng</label>
                          <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">
                            1 - 8 từ
                          </span>
                        </div>
                        {/* Stepper */}
                        <div className="flex items-center justify-between bg-slate-50 p-1 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            disabled={aiVocabCount <= 1}
                            onClick={() => setAiVocabCount((prev) => Math.max(1, prev - 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs text-sm"
                          >
                            −
                          </button>
                          <div className="flex items-baseline gap-1">
                            <input
                              type="number"
                              min={1}
                              max={8}
                              value={aiVocabCount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) setAiVocabCount(Math.max(1, Math.min(8, val)));
                              }}
                              className="w-10 text-center font-extrabold text-indigo-700 text-base bg-transparent border-b border-dashed border-indigo-300 focus:border-indigo-600 focus:outline-none"
                            />
                            <span className="text-xs font-semibold text-slate-500">từ</span>
                          </div>
                          <button
                            type="button"
                            disabled={aiVocabCount >= 8}
                            onClick={() => setAiVocabCount((prev) => Math.min(8, prev + 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-700 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs text-sm"
                          >
                            +
                          </button>
                        </div>
                        {/* Quick Presets */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">Chọn nhanh:</span>
                          {[2, 3, 5, 8].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAiVocabCount(n)}
                              className={`flex-1 py-0.5 text-[11px] font-semibold rounded-md border transition cursor-pointer ${
                                aiVocabCount === n
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Số ngữ pháp: 1 - 5 mẫu */}
                      <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="font-bold text-slate-800 text-xs">Số ngữ pháp</label>
                          <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">
                            1 - 5 mẫu
                          </span>
                        </div>
                        {/* Stepper */}
                        <div className="flex items-center justify-between bg-slate-50 p-1 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            disabled={aiGrammarCount <= 1}
                            onClick={() => setAiGrammarCount((prev) => Math.max(1, prev - 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs text-sm"
                          >
                            −
                          </button>
                          <div className="flex items-baseline gap-1">
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={aiGrammarCount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) setAiGrammarCount(Math.max(1, Math.min(5, val)));
                              }}
                              className="w-10 text-center font-extrabold text-indigo-700 text-base bg-transparent border-b border-dashed border-indigo-300 focus:border-indigo-600 focus:outline-none"
                            />
                            <span className="text-xs font-semibold text-slate-500">mẫu</span>
                          </div>
                          <button
                            type="button"
                            disabled={aiGrammarCount >= 5}
                            onClick={() => setAiGrammarCount((prev) => Math.min(5, prev + 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-700 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs text-sm"
                          >
                            +
                          </button>
                        </div>
                        {/* Quick Presets */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">Chọn nhanh:</span>
                          {[1, 2, 3, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAiGrammarCount(n)}
                              className={`flex-1 py-0.5 text-[11px] font-semibold rounded-md border transition cursor-pointer ${
                                aiGrammarCount === n
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleGenerateDialogue}
                      disabled={isAiGenerating}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-98"
                    >
                      {isAiGenerating ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          <span>AI đang sinh bản thảo...</span>
                        </>
                      ) : (
                        <>
                          <span>✨</span>
                          <span>{aiDraft ? 'Sinh lại bản thảo khác' : 'Sinh bản thảo với AI'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* AI Draft Preview & Review Section */}
                  {aiDraft && (
                    <div className="mt-4 pt-4 border-t-2 border-indigo-200/80 space-y-3 bg-white p-4 rounded-xl border border-indigo-100 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">📋 Xem trước bản thảo AI gợi ý:</span>
                          <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded">
                            {aiDraft.sentences.length} câu thoại • {aiDraft.targetVocabularies?.length || 0} từ • {aiDraft.targetGrammars?.length || 0} ngữ pháp
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleDiscardAiDraft}
                          className="text-slate-400 hover:text-red-600 text-xs transition cursor-pointer"
                        >
                          Bỏ qua bản thảo ✕
                        </button>
                      </div>

                      {/* Overwrite Warning Banner if form already has sentences */}
                      {formSentences.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-start gap-2">
                          <span className="text-base leading-none">⚠️</span>
                          <div>
                            <span className="font-bold">Lưu ý ghi đè:</span> Form của bạn hiện đã có <strong>{formSentences.length} câu thoại</strong>. Khi bạn bấm <strong>"Áp dụng vào Form"</strong>, các câu thoại hiện tại sẽ được thay thế bằng bản thảo AI này. Tất cả dữ liệu sau khi điền vẫn hoàn toàn có thể chỉnh sửa tự do trước khi tạo bài học.
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="text-xs text-slate-700">
                          <strong>Tiêu đề:</strong> {aiDraft.title}
                        </div>
                        {aiDraft.contextDescription && (
                          <div className="text-xs text-slate-600">
                            <strong>Bối cảnh:</strong> {aiDraft.contextDescription}
                          </div>
                        )}
                      </div>

                      {/* Sentences Preview */}
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-1 border border-slate-100 rounded-lg p-2 bg-slate-50/60">
                        {aiDraft.sentences.map((s, idx) => (
                          <div key={idx} className="p-2 bg-white rounded-lg border border-slate-200 text-xs space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className={`px-2 py-0.2 rounded font-bold text-[10px] border ${getRoleBadgeColor(s.speakerRole)}`}>
                                Vai {s.speakerRole}
                              </span>
                            </div>
                            <div className="font-bold text-slate-800">{s.japaneseText}</div>
                            {s.romajiText && <div className="text-[10px] text-slate-400 font-mono">{s.romajiText}</div>}
                            <div className="text-[11px] text-slate-600">{s.vietnameseTranslation}</div>
                          </div>
                        ))}
                      </div>

                      {/* Vocabs & Grammars Draft Tags */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {aiDraft.targetVocabularies && aiDraft.targetVocabularies.length > 0 && (
                          <div className="p-2 bg-blue-50/50 rounded-lg border border-blue-100">
                            <span className="font-bold text-blue-900 block mb-1 text-[11px]">Từ vựng đề xuất:</span>
                            <div className="flex flex-wrap gap-1">
                              {aiDraft.targetVocabularies.map((v, i) => (
                                <span key={i} className="bg-white px-2 py-0.5 rounded border border-blue-200 text-[11px] text-blue-800">
                                  {v.word} ({v.meaning})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiDraft.targetGrammars && aiDraft.targetGrammars.length > 0 && (
                          <div className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
                            <span className="font-bold text-indigo-900 block mb-1 text-[11px]">Ngữ pháp đề xuất:</span>
                            <div className="flex flex-wrap gap-1">
                              {aiDraft.targetGrammars.map((g, i) => (
                                <span key={i} className="bg-white px-2 py-0.5 rounded border border-indigo-200 text-[11px] text-indigo-800">
                                  {g.pattern} ({g.meaning})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Decision Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={handleDiscardAiDraft}
                          className="px-3 py-1.5 border border-slate-300 text-slate-600 font-semibold rounded-xl text-xs hover:bg-slate-100 cursor-pointer"
                        >
                          Hủy bản thảo
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateDialogue}
                          disabled={isAiGenerating}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
                        >
                          🔄 Sinh bản thảo khác
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyAiDraft}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <span>✅</span>
                          <span>{formSentences.length > 0 ? 'Thay thế & Áp dụng vào Form' : 'Áp dụng vào Form'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {formErrors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 space-y-1">
                  {formErrors.map((err, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Kịch bản cha liên kết *</label>
                  <select
                    value={formScenarioId}
                    onChange={(e) => setFormScenarioId(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0878EE] focus:outline-none"
                  >
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        #{s.id} - {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Cấp độ JLPT *</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value as 'N5' | 'N4' | 'N3')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0878EE] focus:outline-none"
                  >
                    <option value="N5">JLPT N5 (Sơ cấp 1)</option>
                    <option value="N4">JLPT N4 (Sơ cấp 2)</option>
                    <option value="N3">JLPT N3 (Trung cấp)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Trạng thái kích hoạt</label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="w-4 h-4 rounded text-[#0878EE] focus:ring-blue-500 border-slate-300"
                    />
                    <span>Kích hoạt hiển thị cho Học viên</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Tiêu đề bài học Shadowing *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ví dụ: Gọi món mì ramen tại quán địa phương..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0878EE] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Bối cảnh</label>
                <textarea
                  rows={2}
                  value={formContextDescription}
                  onChange={(e) => setFormContextDescription(e.target.value)}
                  placeholder="Ví dụ: Cuộc trò chuyện tại quầy gọi món mì ramen khi lần đầu đến Nhật..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#0878EE] focus:outline-none"
                />
              </div>

              {/* Speaker Roles Section */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 text-xs">Thiết lập Vai nhân vật đối thoại</span>
                    <p className="text-[11px] text-slate-500">Các vai nhân vật tham gia bài tập Shadowing (tối thiểu 2 vai).</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRole}
                    className="text-xs text-[#0878EE] font-bold hover:underline cursor-pointer"
                  >
                    + Thêm vai nhân vật
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {formSpeakerRoles.map((roleName, rIdx) => {
                    const roleChar = String.fromCharCode(65 + rIdx);
                    return (
                      <div key={rIdx} className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-2 shadow-2xs">
                        <span className={`px-2 py-0.5 rounded font-bold text-xs border ${getRoleBadgeColor(roleChar)}`}>
                          Vai {roleChar}
                        </span>
                        <input
                          type="text"
                          value={roleName}
                          onChange={(e) => handleRoleNameChange(rIdx, e.target.value)}
                          placeholder={`Tên vai ${roleChar}`}
                          className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:bg-white focus:outline-none"
                        />
                        {formSpeakerRoles.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRole(rIdx)}
                            className="text-slate-400 hover:text-red-500 font-bold px-1"
                            title="Xóa vai này"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabs for Sentences / Vocab / Grammar */}
              <div className="border-b border-slate-200 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveFormTab('sentences')}
                  className={`px-4 py-2 font-bold text-xs border-b-2 transition cursor-pointer ${
                    activeFormTab === 'sentences'
                      ? 'border-[#0878EE] text-[#0878EE]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  💬 Câu đối thoại ({formSentences.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab('vocab')}
                  className={`px-4 py-2 font-bold text-xs border-b-2 transition cursor-pointer ${
                    activeFormTab === 'vocab'
                      ? 'border-[#0878EE] text-[#0878EE]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📖 Từ vựng dùng chung ({formVocabularies.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab('grammar')}
                  className={`px-4 py-2 font-bold text-xs border-b-2 transition cursor-pointer ${
                    activeFormTab === 'grammar'
                      ? 'border-[#0878EE] text-[#0878EE]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📐 Ngữ pháp dùng chung ({formGrammars.length})
                </button>
              </div>

              {/* Tab 1: Sentences */}
              {activeFormTab === 'sentences' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">Danh sách câu đối thoại</span>
                    <button
                      type="button"
                      onClick={handleAddSentence}
                      className="bg-blue-50 text-[#0878EE] hover:bg-blue-100 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition cursor-pointer"
                    >
                      + Thêm câu thoại
                    </button>
                  </div>

                  <div className="space-y-4">
                    {formSentences.map((s, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">Câu #{s.orderIndex}</span>
                            <select
                              value={s.speakerRole}
                              onChange={(e) => handleSentenceChange(idx, 'speakerRole', e.target.value)}
                              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-bold text-xs"
                            >
                              {formSpeakerRoles.map((rName, rIdx) => {
                                const roleChar = String.fromCharCode(65 + rIdx);
                                return (
                                  <option key={roleChar} value={roleChar}>
                                    Vai {roleChar}: {rName}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            {formSentences.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSentence(idx)}
                                className="text-red-600 hover:text-red-700 font-semibold text-xs cursor-pointer"
                              >
                                Xóa câu này
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Japanese text & AI Assist */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-semibold text-slate-700">Tiếng Nhật (Kanji/Kana) *</label>
                            <button
                              type="button"
                              onClick={() => handleTranslateAssist(idx, 'ja-vi')}
                              disabled={translatingIndex?.index === idx}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                            >
                              {translatingIndex?.index === idx && translatingIndex.dir === 'ja-vi' ? (
                                <span>⏳ Đang dịch...</span>
                              ) : (
                                <span>✨ AI Dịch sang Tiếng Việt & Romaji</span>
                              )}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={s.japaneseText}
                            onChange={(e) => handleSentenceChange(idx, 'japaneseText', e.target.value)}
                            placeholder="Nhập câu tiếng Nhật..."
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0878EE]"
                          />
                        </div>

                        {/* Romaji */}
                        <div className="space-y-1">
                          <label className="font-semibold text-slate-700">Phiên âm Romaji</label>
                          <input
                            type="text"
                            value={s.romajiText || ''}
                            onChange={(e) => handleSentenceChange(idx, 'romajiText', e.target.value)}
                            placeholder="Nhập phiên âm Romaji (hoặc dùng AI tự động điền)..."
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0878EE]"
                          />
                        </div>

                        {/* Vietnamese Translation & AI Assist */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-semibold text-slate-700">Bản dịch Tiếng Việt *</label>
                            <button
                              type="button"
                              onClick={() => handleTranslateAssist(idx, 'vi-ja')}
                              disabled={translatingIndex?.index === idx}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                            >
                              {translatingIndex?.index === idx && translatingIndex.dir === 'vi-ja' ? (
                                <span>⏳ Đang dịch...</span>
                              ) : (
                                <span>✨ AI Dịch sang Tiếng Nhật</span>
                              )}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={s.vietnameseTranslation}
                            onChange={(e) => handleSentenceChange(idx, 'vietnameseTranslation', e.target.value)}
                            placeholder="Nhập bản dịch tiếng Việt..."
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0878EE]"
                          />
                        </div>

                        {/* Audio Section (Optional) */}
                        <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-600">Âm thanh mẫu:</span>
                            {s.nativeAudioUrl ? (
                              brokenAudioIndexes[idx] ? (
                                <div className="flex items-center gap-2 bg-amber-50 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg text-xs">
                                  <span>⚠️</span>
                                  <span className="text-[11px] font-medium">Tệp âm thanh không tìm thấy trên máy chủ.</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleClearSentenceAudio(idx);
                                      setBrokenAudioIndexes((prev) => ({ ...prev, [idx]: false }));
                                    }}
                                    className="text-red-600 hover:text-red-800 font-bold underline cursor-pointer ml-1 text-[11px]"
                                  >
                                    Gỡ bỏ để ghi âm lại
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                  <span>🔊</span>
                                  <audio
                                    controls
                                    src={s.nativeAudioUrl}
                                    className="h-8 w-64 sm:w-80 min-w-[240px]"
                                    onError={() => {
                                      setBrokenAudioIndexes((prev) => ({ ...prev, [idx]: true }));
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleClearSentenceAudio(idx)}
                                    className="text-red-500 hover:text-red-700 font-bold ml-1 cursor-pointer"
                                    title="Gỡ bỏ âm thanh"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )
                            ) : (
                              <span className="text-slate-400 italic">Chưa có âm thanh (không bắt buộc)</span>
                            )}
                          </div>

                          {/* Recording Controls */}
                          <div className="flex items-center gap-2">
                            {recordingIndex === idx ? (
                              <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-lg animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-red-600"></span>
                                <span className="font-bold">Đang ghi âm: {recordingSeconds}s</span>
                                <button
                                  type="button"
                                  onClick={handleStopRecording}
                                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-0.5 rounded text-xs cursor-pointer ml-1"
                                >
                                  ⏹ Dừng
                                </button>
                              </div>
                            ) : recordedAudioPreview?.index === idx ? (
                              <div className="flex items-center gap-2 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-lg">
                                <audio controls src={recordedAudioPreview.url} className="h-8 w-64 sm:w-80 min-w-[240px]" />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRecordedAudio(idx)}
                                  disabled={isUploadingAudio}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-xs cursor-pointer"
                                >
                                  {isUploadingAudio ? '⏳ Đang lưu...' : '✅ Lưu âm thanh'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartRecording(idx)}
                                  className="text-slate-600 hover:text-slate-900 font-medium text-xs cursor-pointer"
                                >
                                  🔄 Ghi lại
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartRecording(idx)}
                                className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer shadow-2xs"
                              >
                                <span>🎙️</span>
                                <span>Ghi âm câu này</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 2: Vocabularies */}
              {activeFormTab === 'vocab' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-xs">Từ vựng dùng chung (Shared Master Resources)</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md border border-blue-200">Kho dùng chung</span>
                      </div>
                      <p className="text-[11px] text-slate-500">Từ vựng được liên kết từ kho Master Data của hệ thống, tái sử dụng giữa Shadowing & Scenario.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const willOpen = !isVocabLibraryOpen;
                          setIsVocabLibraryOpen(willOpen);
                          if (willOpen && masterVocabList.length === 0) {
                            fetchMasterVocabularies(vocabSearchKeyword, vocabFilterLevel);
                          }
                        }}
                        className={`font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-xs ${
                          isVocabLibraryOpen
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <span>🔍</span>
                        <span>{isVocabLibraryOpen ? 'Đóng tra cứu kho' : 'Tra cứu kho Master Data'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddVocab}
                        className="bg-blue-50 text-[#0878EE] hover:bg-blue-100 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition cursor-pointer text-xs"
                      >
                        + Thêm dòng từ vựng
                      </button>
                    </div>
                  </div>

                  {/* Master Vocab Explorer Drawer */}
                  {isVocabLibraryOpen && (
                    <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 text-xs">Kho Từ vựng Master Data (Dùng chung)</span>
                            <span className="text-[10px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-semibold">
                              Ưu tiên JLPT {formLevel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Mặc định lọc theo cấp độ bài học ({formLevel}), nhưng bạn có thể tra cứu và chọn bất kỳ cấp độ nào.
                          </p>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={vocabSearchKeyword}
                            onChange={(e) => setVocabSearchKeyword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                fetchMasterVocabularies(vocabSearchKeyword, vocabFilterLevel);
                              }
                            }}
                            placeholder="Tìm từ vựng, ý nghĩa..."
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-44"
                          />
                          <select
                            value={vocabFilterLevel}
                            onChange={(e) => {
                              const newLvl = e.target.value;
                              setVocabFilterLevel(newLvl);
                              fetchMasterVocabularies(vocabSearchKeyword, newLvl);
                            }}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <option value="formLevel">Ưu tiên {formLevel} (Mặc định)</option>
                            <option value="ALL">Tất cả cấp độ (Mở rộng)</option>
                            <option value="N5">Cấp độ N5</option>
                            <option value="N4">Cấp độ N4</option>
                            <option value="N3">Cấp độ N3</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => fetchMasterVocabularies(vocabSearchKeyword, vocabFilterLevel)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs cursor-pointer"
                          >
                            Tìm
                          </button>
                        </div>
                      </div>

                      {/* Items List */}
                      {isLoadingMasterVocabs ? (
                        <div className="p-6 text-center text-slate-400 text-xs">
                          <span className="inline-block animate-spin mr-1">⏳</span> Đang tải từ vựng từ kho Master Data...
                        </div>
                      ) : masterVocabList.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs bg-white rounded-lg border border-dashed border-slate-200">
                          Chưa có kết quả nào. Hãy thử bấm "Tìm" hoặc đổi cấp độ lọc sang "Tất cả cấp độ".
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {masterVocabList.map((v, i) => {
                            const isAdded = formVocabularies.some(
                              (fv) => fv.word.trim().toLowerCase() === v.word.trim().toLowerCase()
                            );
                            return (
                              <div
                                key={i}
                                className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-blue-300 transition"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{v.word}</span>
                                  {v.reading && <span className="text-slate-500 font-mono text-[11px]">({v.reading})</span>}
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-700">{v.meaning}</span>
                                  {v.jlptLevel && (
                                    <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded font-bold text-[10px] border border-blue-200">
                                      {v.jlptLevel}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSelectMasterVocab(v)}
                                  disabled={isAdded}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                                    isAdded
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                                  }`}
                                >
                                  {isAdded ? '✓ Đã chọn' : '+ Chọn vào bài'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {formVocabularies.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      Chưa liên kết từ vựng dùng chung. Bạn có thể tra cứu từ kho Master Data, tự thêm dòng mới hoặc dùng AI Gợi ý nội dung.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formVocabularies.map((v, vIdx) => (
                        <div key={vIdx} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-2">
                          <input
                            type="text"
                            value={v.word}
                            onChange={(e) => handleVocabChange(vIdx, 'word', e.target.value)}
                            placeholder="Từ vựng (Ví dụ: ラーメン)"
                            className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                          <input
                            type="text"
                            value={v.reading || ''}
                            onChange={(e) => handleVocabChange(vIdx, 'reading', e.target.value)}
                            placeholder="Cách đọc (Ví dụ: らーめん)"
                            className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                          <input
                            type="text"
                            value={v.meaning}
                            onChange={(e) => handleVocabChange(vIdx, 'meaning', e.target.value)}
                            placeholder="Ý nghĩa (Ví dụ: Mì ramen)"
                            className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveVocab(vIdx)}
                            className="text-red-500 hover:text-red-700 font-bold px-2 py-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Grammars */}
              {activeFormTab === 'grammar' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-xs">Ngữ pháp dùng chung (Shared Master Resources)</span>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-md border border-indigo-200">Kho dùng chung</span>
                      </div>
                      <p className="text-[11px] text-slate-500">Mẫu ngữ pháp được liên kết từ kho Master Data của hệ thống, tái sử dụng giữa Shadowing & Scenario.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const willOpen = !isGrammarLibraryOpen;
                          setIsGrammarLibraryOpen(willOpen);
                          if (willOpen && masterGrammarList.length === 0) {
                            fetchMasterGrammars(grammarSearchKeyword, grammarFilterLevel);
                          }
                        }}
                        className={`font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-xs ${
                          isGrammarLibraryOpen
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        <span>🔍</span>
                        <span>{isGrammarLibraryOpen ? 'Đóng tra cứu kho' : 'Tra cứu kho Master Data'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddGrammar}
                        className="bg-blue-50 text-[#0878EE] hover:bg-blue-100 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition cursor-pointer text-xs"
                      >
                        + Thêm dòng ngữ pháp
                      </button>
                    </div>
                  </div>

                  {/* Master Grammar Explorer Drawer */}
                  {isGrammarLibraryOpen && (
                    <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 text-xs">Kho Ngữ pháp Master Data (Dùng chung)</span>
                            <span className="text-[10px] text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded font-semibold">
                              Ưu tiên JLPT {formLevel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Mặc định lọc theo cấp độ bài học ({formLevel}), nhưng bạn có thể tra cứu và chọn bất kỳ cấp độ nào.
                          </p>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={grammarSearchKeyword}
                            onChange={(e) => setGrammarSearchKeyword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                fetchMasterGrammars(grammarSearchKeyword, grammarFilterLevel);
                              }
                            }}
                            placeholder="Tìm mẫu ngữ pháp, ý nghĩa..."
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-44"
                          />
                          <select
                            value={grammarFilterLevel}
                            onChange={(e) => {
                              const newLvl = e.target.value;
                              setGrammarFilterLevel(newLvl);
                              fetchMasterGrammars(grammarSearchKeyword, newLvl);
                            }}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <option value="formLevel">Ưu tiên {formLevel} (Mặc định)</option>
                            <option value="ALL">Tất cả cấp độ (Mở rộng)</option>
                            <option value="N5">Cấp độ N5</option>
                            <option value="N4">Cấp độ N4</option>
                            <option value="N3">Cấp độ N3</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => fetchMasterGrammars(grammarSearchKeyword, grammarFilterLevel)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs cursor-pointer"
                          >
                            Tìm
                          </button>
                        </div>
                      </div>

                      {/* Items List */}
                      {isLoadingMasterGrammars ? (
                        <div className="p-6 text-center text-slate-400 text-xs">
                          <span className="inline-block animate-spin mr-1">⏳</span> Đang tải ngữ pháp từ kho Master Data...
                        </div>
                      ) : masterGrammarList.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs bg-white rounded-lg border border-dashed border-slate-200">
                          Chưa có kết quả nào. Hãy thử bấm "Tìm" hoặc đổi cấp độ lọc sang "Tất cả cấp độ".
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {masterGrammarList.map((g, i) => {
                            const isAdded = formGrammars.some(
                              (fg) => fg.pattern.trim().toLowerCase() === g.pattern.trim().toLowerCase()
                            );
                            return (
                              <div
                                key={i}
                                className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-indigo-300 transition"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-[#0878EE]">{g.pattern}</span>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-700">{g.meaning}</span>
                                    {g.jlptLevel && (
                                      <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 rounded font-bold text-[10px] border border-indigo-200">
                                        {g.jlptLevel}
                                      </span>
                                    )}
                                  </div>
                                  {g.exampleSentence && (
                                    <div className="text-[11px] text-slate-400 italic">
                                      Ví dụ: {g.exampleSentence}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSelectMasterGrammar(g)}
                                  disabled={isAdded}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                                    isAdded
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                                  }`}
                                >
                                  {isAdded ? '✓ Đã chọn' : '+ Chọn vào bài'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {formGrammars.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      Chưa liên kết ngữ pháp dùng chung. Bạn có thể tra cứu từ kho Master Data, tự thêm dòng mới hoặc dùng AI Gợi ý nội dung.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formGrammars.map((g, gIdx) => (
                        <div key={gIdx} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center gap-2">
                          <input
                            type="text"
                            value={g.pattern}
                            onChange={(e) => handleGrammarChange(gIdx, 'pattern', e.target.value)}
                            placeholder="Mẫu ngữ pháp (Ví dụ: ～てください)"
                            className="w-full md:w-1/4 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                          <input
                            type="text"
                            value={g.meaning}
                            onChange={(e) => handleGrammarChange(gIdx, 'meaning', e.target.value)}
                            placeholder="Ý nghĩa (Ví dụ: Xin hãy làm...)"
                            className="w-full md:w-1/3 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                          <input
                            type="text"
                            value={g.exampleSentence || ''}
                            onChange={(e) => handleGrammarChange(gIdx, 'exampleSentence', e.target.value)}
                            placeholder="Câu ví dụ minh họa..."
                            className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveGrammar(gIdx)}
                            className="text-red-500 hover:text-red-700 font-bold px-2 py-1 self-end md:self-center"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>

              {/* Form Footer (Sticky / Fixed at Bottom) */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 rounded-b-2xl flex items-center justify-between gap-3 shrink-0">
                <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
                  {editingId ? 'Đang chỉnh sửa bài học Shadowing' : 'Soạn thảo bài học Shadowing mới'}
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#0878EE] hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Đang lưu bài học...' : editingId ? 'Lưu cập nhật' : 'Hoàn tất & Tạo bài học'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}



      {/* 7. Import File Modal */}
      {isImportModalOpen && createPortal(
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 my-auto max-h-[90vh] flex flex-col relative">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#0878EE] flex items-center justify-center text-base font-bold shadow-2xs">
                  📂
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Nhập bài học Shadowing từ tệp mẫu</h3>
                  <p className="text-[11px] text-slate-500">
                    Hỗ trợ 2 định dạng: <strong>CSV</strong> (Nhập nhanh danh sách câu thoại) và <strong>JSON</strong> (Toàn bộ bài học).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* Cards: 2 Format Explanations & Download Templates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card CSV */}
                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📄</span>
                        <span className="font-bold text-emerald-900 text-xs">CSV — Nhập nhanh câu thoại</span>
                      </div>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-300">
                        Quick Dialogue
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Dùng khi bạn đã có bài học và muốn nhập nhanh nhiều câu thoại từ Excel hoặc Google Sheets.
                      Kịch bản, JLPT, bối cảnh và vai nhân vật được kế thừa từ form hiện tại.
                    </p>
                    <p className="text-[10px] text-amber-700 bg-amber-50/80 p-2 rounded-lg border border-amber-200/70 mt-2 font-medium">
                      ⚠️ <strong>Lưu ý mã hóa:</strong> Hãy lưu/xuất file CSV ở bảng mã <strong>UTF-8</strong> để tiếng Nhật và tiếng Việt hiển thị chính xác, không bị lỗi font.
                    </p>
                  </div>
                  <div className="pt-2 border-t border-emerald-100">
                    <a
                      href="/api/admin/shadowing/download-template?type=csv"
                      download="shadowing_dialogue_template.csv"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDownloadTemplate('csv');
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-2xs cursor-pointer active:scale-98"
                    >
                      <span>📥</span>
                      <span>Tải file mẫu CSV</span>
                    </a>
                  </div>
                </div>

                {/* Card JSON */}
                <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-200 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📦</span>
                        <span className="font-bold text-purple-900 text-xs">JSON — Nhập toàn bộ bài học</span>
                      </div>
                      <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-300">
                        Full Lesson
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Dùng khi bạn muốn nhập một bài học Shadowing hoàn chỉnh, bao gồm tiêu đề, kịch bản cha, cấp độ JLPT, vai đối thoại, danh sách câu thoại, từ vựng và ngữ pháp.
                    </p>
                    <p className="text-[10px] text-indigo-700 bg-indigo-50/80 p-2 rounded-lg border border-indigo-200/70 mt-2 font-medium">
                      ℹ️ <strong>Master Data:</strong> Từ vựng & ngữ pháp sẽ tự động so khớp với kho Master Data để tái sử dụng. Các mục chưa có sẽ được gắn cảnh báo để bạn quyết định tạo mới hay bỏ qua.
                    </p>
                  </div>
                  <div className="pt-2 border-t border-purple-100">
                    <a
                      href="/api/admin/shadowing/download-template?type=json"
                      download="shadowing_full_lesson_template.json"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDownloadTemplate('json');
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition shadow-2xs cursor-pointer active:scale-98"
                    >
                      <span>📥</span>
                      <span>Tải file mẫu JSON</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Collapsible Format Specifications Guide */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setShowImportGuide(!showImportGuide)}
                  className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-700 text-xs cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span>📖</span>
                    <span>Xem quy chuẩn dữ liệu tệp CSV & JSON</span>
                  </span>
                  <span>{showImportGuide ? '▲ Thu gọn' : '▼ Chi tiết'}</span>
                </button>
                {showImportGuide && (
                  <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/40 text-[11px] text-slate-600">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs mb-1">1. Cấu trúc cột file CSV (Chuẩn RFC-4180):</h4>
                      <p className="mb-1">Tệp CSV gồm 4 cột theo thứ tự:</p>
                      <code className="block bg-slate-900 text-emerald-400 p-2 rounded font-mono text-[11px]">
                        SpeakerRole,JapaneseText,RomajiText,VietnameseTranslation
                      </code>
                      <p className="mt-1 text-slate-500">
                        • Nếu văn bản chứa dấu phẩy (,), hãy bọc trong dấu ngoặc kép ("..."). Cột tiếng Nhật và bản dịch tiếng Việt bắt buộc không được để trống.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs mb-1">2. Cấu trúc tệp JSON (Full Lesson):</h4>
                      <p className="mb-1">
                        Chứa các trường: <code className="text-purple-700 font-mono">title</code>, <code className="text-purple-700 font-mono">jlptLevel</code> (N5/N4/N3), <code className="text-purple-700 font-mono">scenarioCode</code>, <code className="text-purple-700 font-mono">speakerRoles</code>, <code className="text-purple-700 font-mono">sentences</code>, <code className="text-purple-700 font-mono">targetVocabularies</code>, <code className="text-purple-700 font-mono">targetGrammars</code>.
                      </p>
                      <p className="text-slate-500">
                        • Hệ thống không tự ý gán bài học vào kịch bản đầu tiên nếu không khớp mã.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:bg-slate-50/80 transition cursor-pointer relative">
                <input
                  type="file"
                  accept=".json,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  id="shadowing-file-import-input"
                />
                <div className="space-y-2 pointer-events-none">
                  <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl">
                    📁
                  </div>
                  <div>
                    <span className="text-xs font-bold text-blue-600 block">
                      {importFileName ? `Đã chọn: ${importFileName}` : 'Nhấn để chọn tệp hoặc kéo thả tệp vào đây'}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Chấp nhận tệp định dạng .csv hoặc .json (Tối đa 5MB)
                    </span>
                  </div>
                </div>
              </div>

              {/* File Reading Error */}
              {importError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <span className="text-base">❌</span>
                  <span>{importError}</span>
                </div>
              )}

              {/* Validation Warnings */}
              {importPreview && importPreview.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-900">
                    <span>⚠️</span>
                    <span>Cảnh báo validation ({importPreview.warnings.length}):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                    {importPreview.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation Errors */}
              {importPreview && importPreview.errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-red-900">
                    <span>❌</span>
                    <span>Có {importPreview.errors.length} lỗi validation cần sửa trong tệp trước khi áp dụng:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                    {importPreview.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detailed Preview Section */}
              {importPreview && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-xs">Xem trước nội dung đã phân tích:</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                          importPreview.format === 'csv'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-purple-50 text-purple-800 border-purple-300'
                        }`}
                      >
                        {importPreview.format === 'csv' ? '📄 CSV: Quick Dialogue' : '📦 JSON: Full Lesson'}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        importPreview.errors.length > 0
                          ? 'bg-red-100 text-red-700'
                          : importPreview.warnings.length > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {importPreview.errors.length > 0
                        ? `❌ ${importPreview.errors.length} lỗi`
                        : importPreview.warnings.length > 0
                        ? `⚠️ Hợp lệ (${importPreview.warnings.length} cảnh báo)`
                        : '✅ Hoàn toàn hợp lệ'}
                    </span>
                  </div>

                  {/* Metadata Card */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500 text-[11px]">Tiêu đề bài học:</div>
                      <div className="font-bold text-slate-800 text-xs mt-0.5">{importPreview.title || '—'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[11px]">Cấp độ JLPT:</div>
                      <div className="font-bold text-[#0878EE] text-xs mt-0.5">{importPreview.jlptLevel || formLevel}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[11px]">Kịch bản cha:</div>
                      <div className="font-semibold text-slate-800 text-xs mt-0.5">
                        {importPreview.format === 'csv' ? (
                          <span className="text-slate-500 italic">Kế thừa từ form hiện tại (#{formScenarioId})</span>
                        ) : importPreview.matchedScenarioTitle ? (
                          <span className="text-emerald-700">✓ {importPreview.matchedScenarioTitle}</span>
                        ) : (
                          <span className="text-amber-700">⚠️ Chưa gán (chọn thủ công trên form)</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[11px]">Các vai nhân vật:</div>
                      <div className="font-semibold text-slate-800 text-xs mt-0.5">
                        {importPreview.speakerRoles?.join(' & ') || 'Vai A & Vai B'}
                      </div>
                    </div>
                  </div>

                  {/* Sentences Table Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs">
                        Danh sách câu thoại ({importPreview.sentences.length} câu):
                      </span>
                    </div>
                    <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px]">
                            <th className="py-2 px-3 w-12 text-center">#</th>
                            <th className="py-2 px-3 w-20">Vai</th>
                            <th className="py-2 px-3">Câu tiếng Nhật</th>
                            <th className="py-2 px-3">Romaji</th>
                            <th className="py-2 px-3">Bản dịch tiếng Việt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importPreview.sentences.map((s, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-center font-mono text-slate-400 text-[11px]">
                                {s.orderIndex || idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${getRoleBadgeColor(s.speakerRole)}`}>
                                  Vai {s.speakerRole}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-800">{s.japaneseText}</td>
                              <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{s.romajiText || '—'}</td>
                              <td className="py-2 px-3 text-slate-600">{s.vietnameseTranslation}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Target Vocabularies Preview (JSON only) */}
                  {importPreview.format === 'json' && importPreview.targetVocabularies.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">
                          Từ vựng kèm theo ({importPreview.targetVocabularies.length} mục):
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Nhấn vào trạng thái để bật/tắt quyền nạp từ vựng vào bài học
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {importPreview.targetVocabularies.map((v, vIdx) => (
                          <div
                            key={vIdx}
                            className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-blue-700">{v.word}</span>
                                {v.reading && <span className="text-slate-400 font-mono">({v.reading})</span>}
                                <span className="text-slate-400">•</span>
                                <span className="text-slate-700">{v.meaning}</span>
                                {v.jlptLevel && (
                                  <span className="px-1.5 py-0.2 bg-blue-50 text-blue-600 rounded font-bold text-[10px] border border-blue-200">
                                    {v.jlptLevel}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px]">
                                {v.status === 'matched' ? (
                                  <span className="text-emerald-700 font-medium">
                                    ✓ Đã khớp Master Data #{v.matchedMasterId}
                                  </span>
                                ) : (
                                  <span className="text-amber-700 font-medium">
                                    ⚠️ Chưa có trong Master Data (sẽ tạo mới nếu chọn)
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleVocabAction(vIdx)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                v.action === 'create_new'
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                              }`}
                            >
                              {v.action === 'create_new' ? '✓ Nạp từ này' : '✕ Bỏ qua'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target Grammars Preview (JSON only) */}
                  {importPreview.format === 'json' && importPreview.targetGrammars.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">
                          Ngữ pháp kèm theo ({importPreview.targetGrammars.length} mục):
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Nhấn vào trạng thái để bật/tắt quyền nạp ngữ pháp vào bài học
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {importPreview.targetGrammars.map((g, gIdx) => (
                          <div
                            key={gIdx}
                            className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-indigo-700">{g.pattern}</span>
                                <span className="text-slate-400">•</span>
                                <span className="text-slate-700">{g.meaning}</span>
                                {g.jlptLevel && (
                                  <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-600 rounded font-bold text-[10px] border border-indigo-200">
                                    {g.jlptLevel}
                                  </span>
                                )}
                              </div>
                              {g.exampleSentence && (
                                <div className="text-[11px] text-slate-400 italic">
                                  Ví dụ: {g.exampleSentence}
                                </div>
                              )}
                              <div className="text-[11px]">
                                {g.status === 'matched' ? (
                                  <span className="text-emerald-700 font-medium">
                                    ✓ Đã khớp Master Data #{g.matchedMasterId}
                                  </span>
                                ) : (
                                  <span className="text-amber-700 font-medium">
                                    ⚠️ Chưa có trong Master Data (sẽ tạo mới nếu chọn)
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleGrammarAction(gIdx)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                g.action === 'create_new'
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                              }`}
                            >
                              {g.action === 'create_new' ? '✓ Nạp mẫu này' : '✕ Bỏ qua'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 rounded-b-2xl text-xs">
              <span className="text-slate-500 text-[11px]">
                ℹ️ Dữ liệu tệp sẽ được nạp trực tiếp vào Form để bạn xem lại và chỉnh sửa trước khi lưu.
              </span>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={!importPreview || importPreview.errors.length > 0}
                  className="px-5 py-2 bg-[#0878EE] hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Áp dụng vào Form
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 8. Audio / Detail Preview Modal */}
      {previewDialogue && createPortal(
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 my-auto max-h-[85vh] flex flex-col relative">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{previewDialogue.title}</h2>
                  <span className="bg-blue-100 text-[#0878EE] font-bold text-[10px] px-2 py-0.5 rounded">
                    {previewDialogue.jlptLevel}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kịch bản: <strong>{previewDialogue.scenarioTitle}</strong> • {previewDialogue.sentences.length} câu đối thoại
                </p>
              </div>
              <button
                onClick={() => setPreviewDialogue(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs in Preview */}
            <div className="px-6 border-b border-slate-200 flex items-center justify-between bg-white text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewActiveTab('sentences')}
                  className={`py-2.5 px-3 font-bold border-b-2 cursor-pointer transition ${
                    previewActiveTab === 'sentences' ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Hội thoại ({previewDialogue.sentences.length})
                </button>
                <button
                  onClick={() => setPreviewActiveTab('vocab')}
                  className={`py-2.5 px-3 font-bold border-b-2 cursor-pointer transition ${
                    previewActiveTab === 'vocab' ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Từ vựng ({previewDialogue.targetVocabularies?.length || 0})
                </button>
                <button
                  onClick={() => setPreviewActiveTab('grammar')}
                  className={`py-2.5 px-3 font-bold border-b-2 cursor-pointer transition ${
                    previewActiveTab === 'grammar' ? 'border-[#0878EE] text-[#0878EE]' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ngữ pháp ({previewDialogue.targetGrammars?.length || 0})
                </button>
              </div>

              {/* Direct link to Learner Practice UI */}
              <Link
                to={`/shadowing/practice/${previewDialogue.id}`}
                target="_blank"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1 shadow-2xs"
              >
                <span>🎧</span>
                <span>Thử bài Shadowing</span>
              </Link>
            </div>

            {/* Preview Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {previewDialogue.sourceDescription && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600">
                  <span className="font-bold text-slate-800 block mb-0.5">Bối cảnh:</span>
                  {previewDialogue.sourceDescription}
                </div>
              )}

              {/* Tab 1: Sentences */}
              {previewActiveTab === 'sentences' && (
                <div className="space-y-3">
                  {previewDialogue.sentences.map((s) => (
                    <div key={s.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${getRoleBadgeColor(s.speakerRole)}`}>
                          Vai {s.speakerRole}: {s.speakerRole === 'A' ? previewDialogue.speakerRoleA_Name : previewDialogue.speakerRoleB_Name}
                        </span>
                        {s.nativeAudioUrl ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-emerald-700 font-bold shrink-0">Audio mẫu:</span>
                            <audio controls src={s.nativeAudioUrl} className="h-8 w-64 sm:w-80 min-w-[240px]" />
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Chưa gắn audio mẫu</span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900">{s.japaneseText}</div>
                      {s.romajiText && <div className="text-[11px] text-slate-500 font-mono">{s.romajiText}</div>}
                      <div className="text-xs text-slate-600">{s.vietnameseTranslation}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 2: Vocab */}
              {previewActiveTab === 'vocab' && (
                <div className="space-y-2">
                  {!previewDialogue.targetVocabularies || previewDialogue.targetVocabularies.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">Chưa có từ vựng trọng tâm.</div>
                  ) : (
                    previewDialogue.targetVocabularies.map((v, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 text-sm">{v.word}</span>
                          {v.reading && <span className="text-slate-500 ml-2">({v.reading})</span>}
                        </div>
                        <div className="text-slate-700 font-medium">{v.meaning}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 3: Grammar */}
              {previewActiveTab === 'grammar' && (
                <div className="space-y-2">
                  {!previewDialogue.targetGrammars || previewDialogue.targetGrammars.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">Chưa có mẫu ngữ pháp trọng tâm.</div>
                  ) : (
                    previewDialogue.targetGrammars.map((g, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#0878EE]">{g.pattern}</span>
                          <span className="text-slate-700 font-medium">{g.meaning}</span>
                        </div>
                        {g.exampleSentence && (
                          <div className="text-slate-500 italic text-[11px]">Ví dụ: {g.exampleSentence}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setPreviewDialogue(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 9. Delete Confirmation Modal */}
      {deletingItem && createPortal(
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 my-auto p-6 space-y-4 relative">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl mx-auto">
              ⚠️
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Xác nhận vô hiệu hóa bài học</h3>
              <p className="text-xs text-slate-500">
                Bạn có chắc chắn muốn vô hiệu hóa bài học <strong>"{deletingItem.title}"</strong> (SHD_{deletingItem.id})? Bài học sẽ chuyển sang trạng thái "Tạm ngưng" và ẩn khỏi giao diện học viên.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-100 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer"
              >
                Xác nhận vô hiệu hóa
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notifications */}
      {createPortal(
        <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none w-auto max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <Toast
              key={t.id}
              id={t.id}
              message={t.message}
              type={t.type}
              onClose={removeToast}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};
