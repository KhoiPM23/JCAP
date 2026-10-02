import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
} from '../../types/shadowing';
import type { ScenarioListItem } from '../../types/scenarioDetails';

export const AdminShadowingListView: React.FC = () => {
  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // AI Assist State in Form
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [aiSentenceCount, setAiSentenceCount] = useState<number>(4);
  const [aiVocabCount, setAiVocabCount] = useState<number>(3);
  const [aiGrammarCount, setAiGrammarCount] = useState<number>(2);
  const [translatingIndex, setTranslatingIndex] = useState<{ index: number; dir: 'ja-vi' | 'vi-ja' } | null>(null);

  // Audio Recording State
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedAudioPreview, setRecordedAudioPreview] = useState<{ index: number; url: string; blob: Blob } | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Import File Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
    setIsFormOpen(true);
  };

  const handleOpenEdit = async (item: ShadowingDialogueItem) => {
    setEditingId(item.id);
    setIsFormOpen(true);
    setIsSubmitting(true);
    setRecordedAudioPreview(null);
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
    } else {
      alert(res.message || 'Hỗ trợ dịch tự động gặp sự cố.');
    }
    setTranslatingIndex(null);
  };

  // AI Dialogue Full Generation
  const handleGenerateDialogue = async () => {
    const selectedScenario = scenarios.find((s) => s.id === formScenarioId);
    const contextTitle = formTitle.trim() || selectedScenario?.title || 'Hội thoại giao tiếp đời sống';

    setIsAiGenerating(true);
    const payload: GenerateShadowingDialoguePayload = {
      scenarioId: formScenarioId,
      contextTitle,
      contextDescription: formContextDescription.trim() || selectedScenario?.description,
      jlptLevel: formLevel,
      speakerRoles: formSpeakerRoles,
      sentenceCount: aiSentenceCount,
      vocabCount: aiVocabCount,
      grammarCount: aiGrammarCount,
    };

    const res = await adminShadowingService.generateDialogue(payload);
    setIsAiGenerating(false);

    if (res.success && res.data) {
      const data = res.data;
      if (!formTitle.trim()) {
        setFormTitle(data.title || contextTitle);
      }
      if (data.contextDescription && !formContextDescription.trim()) {
        setFormContextDescription(data.contextDescription);
      }
      if (data.speakerRoles && data.speakerRoles.length > 0) {
        setFormSpeakerRoles(data.speakerRoles);
      }
      if (data.sentences && data.sentences.length > 0) {
        setFormSentences(
          data.sentences.map((s, idx) => ({
            orderIndex: idx + 1,
            speakerRole: s.speakerRole || 'A',
            japaneseText: s.japaneseText,
            romajiText: s.romajiText || '',
            vietnameseTranslation: s.vietnameseTranslation,
            nativeAudioUrl: null,
          }))
        );
      }
      if (data.targetVocabularies && data.targetVocabularies.length > 0) {
        setFormVocabularies(data.targetVocabularies);
      }
      if (data.targetGrammars && data.targetGrammars.length > 0) {
        setFormGrammars(data.targetGrammars);
      }
      setIsAiModalOpen(false);
      setMessage({ type: 'success', text: `✨ AI đã tạo xong bài hội thoại mẫu gồm ${data.sentences.length} câu, từ vựng và ngữ pháp!` });
      setTimeout(() => setMessage(null), 5000);
    } else {
      alert(res.message || 'Không thể tạo gợi ý nội dung từ AI.');
    }
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
      alert('Không thể truy cập microphone. Vui lòng cấp quyền micro cho trình duyệt.');
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
      setMessage({ type: 'success', text: '✅ Đã lưu âm thanh tham chiếu câu thoại!' });
      setTimeout(() => setMessage(null), 3000);
    } else {
      alert(res.message || 'Không thể lưu tệp âm thanh.');
    }
  };

  const handleClearSentenceAudio = (index: number) => {
    handleSentenceChange(index, 'nativeAudioUrl', null);
    if (recordedAudioPreview?.index === index) {
      setRecordedAudioPreview(null);
    }
  };

  // Import File Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (!parsed.title && !parsed.sentences) {
            throw new Error('Định dạng JSON cần có thuộc tính "title" hoặc "sentences".');
          }
          setImportPreview({
            title: parsed.title || file.name.replace(/\.[^/.]+$/, ''),
            jlptLevel: parsed.jlptLevel || 'N5',
            contextDescription: parsed.contextDescription || parsed.sourceDescription || '',
            speakerRoles: parsed.speakerRoles || ['Vai A', 'Vai B'],
            sentences: parsed.sentences || [],
            targetVocabularies: parsed.targetVocabularies || [],
            targetGrammars: parsed.targetGrammars || [],
          });
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length <= 1) throw new Error('Tệp CSV rỗng hoặc chỉ có dòng tiêu đề.');
          const rows = lines.slice(1);
          const parsedSentences = rows.map((r, idx) => {
            const parts = r.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
            return {
              orderIndex: idx + 1,
              speakerRole: parts[0] || 'A',
              japaneseText: parts[1] || '',
              romajiText: parts[2] || '',
              vietnameseTranslation: parts[3] || '',
              nativeAudioUrl: null,
            };
          });
          setImportPreview({
            title: file.name.replace(/\.[^/.]+$/, ''),
            jlptLevel: 'N5',
            contextDescription: 'Nhập từ tệp CSV',
            speakerRoles: ['Vai A', 'Vai B'],
            sentences: parsedSentences,
            targetVocabularies: [],
            targetGrammars: [],
          });
        } else {
          throw new Error('Chỉ hỗ trợ tệp .json hoặc .csv');
        }
      } catch (err: any) {
        setImportError(err.message || 'Lỗi đọc tệp.');
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    setEditingId(null);
    setFormScenarioId(scenarios[0]?.id || 1);
    setFormTitle(importPreview.title);
    setFormLevel(importPreview.jlptLevel || 'N5');
    setFormContextDescription(importPreview.contextDescription || '');
    setFormSpeakerRoles(importPreview.speakerRoles || ['Vai A', 'Vai B']);
    setFormIsActive(true);
    setFormSentences(importPreview.sentences || []);
    setFormVocabularies(importPreview.targetVocabularies || []);
    setFormGrammars(importPreview.targetGrammars || []);
    setIsImportModalOpen(false);
    setImportPreview(null);
    setIsFormOpen(true);
    setMessage({ type: 'success', text: `📥 Đã nạp thành công dữ liệu từ tệp "${importFileName}" vào Form!` });
    setTimeout(() => setMessage(null), 4000);
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
        sentences: formSentences,
        targetVocabularies: formVocabularies,
        targetGrammars: formGrammars,
      });

      if (res.success) {
        setIsFormOpen(false);
        setMessage({ type: 'success', text: `Cập nhật thành công bài học "${formTitle}".` });
        loadData();
        setTimeout(() => setMessage(null), 4000);
      } else {
        setFormErrors(res.errors || [res.message || 'Lỗi cập nhật bài học.']);
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
        sentences: formSentences,
        targetVocabularies: formVocabularies,
        targetGrammars: formGrammars,
      };

      const res = await adminShadowingService.createDialogue(payload);
      if (res.success) {
        setIsFormOpen(false);
        setMessage({ type: 'success', text: `Tạo mới thành công bài học Shadowing "${formTitle}".` });
        loadData();
        setTimeout(() => setMessage(null), 4000);
      } else {
        setFormErrors(res.errors || [res.message || 'Lỗi tạo bài học.']);
      }
    }
    setIsSubmitting(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const res = await adminShadowingService.softDelete(deletingItem.id);
    if (res.success) {
      setMessage({ type: 'success', text: `Đã vô hiệu hóa bài học "${deletingItem.title}" thành công.` });
      setDeletingItem(null);
      loadData();
      setTimeout(() => setMessage(null), 4000);
    } else {
      setMessage({ type: 'error', text: res.message || 'Lỗi khi xóa bài học.' });
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
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchCode = `SHD_${item.id}`.toLowerCase().includes(q) || (item.scenarioTitle && item.scenarioTitle.toLowerCase().includes(q));
      if (!matchTitle && !matchCode) return false;
    }
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
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-200 my-8 max-h-[90vh] flex flex-col">
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
                  onClick={() => setIsAiModalOpen(true)}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-98"
                >
                  <span>🤖</span>
                  <span>AI Gợi ý nội dung</span>
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
            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
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
                              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                <span>🔊</span>
                                <audio controls src={s.nativeAudioUrl} className="h-6 max-w-[180px]" />
                                <button
                                  type="button"
                                  onClick={() => handleClearSentenceAudio(idx)}
                                  className="text-red-500 hover:text-red-700 font-bold ml-1 cursor-pointer"
                                  title="Gỡ bỏ âm thanh"
                                >
                                  ✕
                                </button>
                              </div>
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
                                <audio controls src={recordedAudioPreview.url} className="h-6 max-w-[150px]" />
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
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-xs">Từ vựng dùng chung (Shared Master Resources)</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md border border-blue-200">Kho dùng chung</span>
                      </div>
                      <p className="text-[11px] text-slate-500">Từ vựng được liên kết từ kho Master Data của hệ thống, tái sử dụng giữa Shadowing & Scenario.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddVocab}
                      className="bg-blue-50 text-[#0878EE] hover:bg-blue-100 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition cursor-pointer"
                    >
                      + Thêm từ vựng dùng chung
                    </button>
                  </div>

                  {formVocabularies.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      Chưa liên kết từ vựng dùng chung. Bạn có thể thêm mới vào kho hoặc dùng AI Gợi ý nội dung.
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
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-xs">Ngữ pháp dùng chung (Shared Master Resources)</span>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-md border border-indigo-200">Kho dùng chung</span>
                      </div>
                      <p className="text-[11px] text-slate-500">Mẫu ngữ pháp được liên kết từ kho Master Data của hệ thống, tái sử dụng giữa Shadowing & Scenario.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddGrammar}
                      className="bg-blue-50 text-[#0878EE] hover:bg-blue-100 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition cursor-pointer"
                    >
                      + Thêm ngữ pháp dùng chung
                    </button>
                  </div>

                  {formGrammars.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      Chưa liên kết ngữ pháp dùng chung. Bạn có thể thêm mới vào kho hoặc dùng AI Gợi ý nội dung.
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

              {/* Form Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
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
            </form>
          </div>
        </div>
      )}

      {/* 6. AI Generation Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h3 className="font-bold text-slate-900 text-sm">AI Đề xuất nội dung bài hội thoại Shadowing</h3>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Hệ thống AI sẽ tự động phân tích bối cảnh kịch bản, các vai nhân vật và sinh ra bộ câu đối thoại chuẩn ngữ điệu Nhật Bản kèm từ vựng và ngữ pháp trọng tâm.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Chủ đề / Bối cảnh muốn tạo:</label>
                <input
                  type="text"
                  value={formTitle || scenarios.find((s) => s.id === formScenarioId)?.title || ''}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ví dụ: Đặt bàn ăn tối tại nhà hàng Tokyo..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Số câu thoại</label>
                  <select
                    value={aiSentenceCount}
                    onChange={(e) => setAiSentenceCount(parseInt(e.target.value, 10))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  >
                    <option value={4}>4 câu</option>
                    <option value={6}>6 câu</option>
                    <option value={8}>8 câu</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Số từ vựng</label>
                  <select
                    value={aiVocabCount}
                    onChange={(e) => setAiVocabCount(parseInt(e.target.value, 10))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  >
                    <option value={2}>2 từ</option>
                    <option value={3}>3 từ</option>
                    <option value={4}>4 từ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Số ngữ pháp</label>
                  <select
                    value={aiGrammarCount}
                    onChange={(e) => setAiGrammarCount(parseInt(e.target.value, 10))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  >
                    <option value={1}>1 mẫu</option>
                    <option value={2}>2 mẫu</option>
                    <option value={3}>3 mẫu</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleGenerateDialogue}
                disabled={isAiGenerating}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isAiGenerating ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>AI đang tạo bài học...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Bắt đầu tạo hội thoại</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Import File Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">📂</span>
                <h3 className="font-bold text-slate-900 text-sm">Nhập bài học Shadowing từ tệp</h3>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-500">
              Hỗ trợ tệp định dạng <strong>.json</strong> (đầy đủ cấu trúc câu, từ vựng, ngữ pháp) hoặc <strong>.csv</strong> (danh sách câu thoại).
            </p>

            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition cursor-pointer">
              <input
                type="file"
                accept=".json,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="shadowing-file-import-input"
              />
              <label htmlFor="shadowing-file-import-input" className="cursor-pointer space-y-2 block">
                <span className="text-3xl block">📄</span>
                <span className="text-xs font-bold text-blue-600 block">Chọn tệp từ máy tính của bạn</span>
                <span className="text-[11px] text-slate-400 block">Hỗ trợ .json hoặc .csv</span>
              </label>
            </div>

            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                ⚠️ {importError}
              </div>
            )}

            {importPreview && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span>Xem trước dữ liệu tệp:</span>
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px]">
                    Hợp lệ
                  </span>
                </div>
                <div className="text-slate-600">
                  <div>Tiêu đề: <strong>{importPreview.title}</strong> ({importPreview.jlptLevel})</div>
                  <div>Số câu đối thoại: <strong>{importPreview.sentences.length} câu</strong></div>
                  <div>Các vai: <strong>{importPreview.speakerRoles.join(', ')}</strong></div>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={!importPreview}
                className="px-4 py-2 bg-[#0878EE] hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50 cursor-pointer"
              >
                Áp dụng vào Form
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Audio / Detail Preview Modal */}
      {previewDialogue && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 my-8 max-h-[85vh] flex flex-col">
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-emerald-700 font-bold">Audio mẫu:</span>
                            <audio controls src={s.nativeAudioUrl} className="h-6 max-w-[170px]" />
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
        </div>
      )}

      {/* 9. Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
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
        </div>
      )}
    </div>
  );
};
