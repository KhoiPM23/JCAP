import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { flashcardService } from '../../services/flashcardService';
import { flashcardQuizService } from '../../services/flashcardQuizService';
import { getDemoSetDetail, DEMO_VOCAB_SET, DEMO_GRAMMAR_SET } from './demoFlashcardData';
import type { FlashcardCardItem, FlashcardContentType } from '../../types/flashcard';
import type { SubmitFlashcardQuizAttemptRequest } from '../../types/flashcardQuiz';

export type QuizQuestionType = 'true_false' | 'multiple_choice' | 'matching' | 'written';
export type AnswerDirection = 'ja_to_vi' | 'vi_to_ja' | 'mixed';
export type CardScopeFilter = 'all' | 'learned' | 'due' | 'bookmarked';

export interface QuizTestConfig {
  questionCount: number;
  includeTrueFalse: boolean;
  includeMultipleChoice: boolean;
  includeMatching: boolean;
  includeWritten: boolean;
  direction: AnswerDirection;
  cardScope: CardScopeFilter;
  instantFeedback: boolean;
  listeningMode: boolean;
  timeLimitSeconds: number; // 0 = unlimited
}

export interface MatchingPairItem {
  card: FlashcardCardItem;
  promptText: string;
  promptSub?: string | null;
  answerText: string;
}

export interface QuizQuestion {
  id: string;
  index: number;
  type: QuizQuestionType;
  direction: 'ja_to_vi' | 'vi_to_ja';
  card: FlashcardCardItem;
  promptText: string;
  promptSub?: string | null;
  correctAnswer: string;
  acceptableAnswers: string[];
  // For True / False
  displayedPairing?: string;
  displayedPairingCard?: FlashcardCardItem;
  isTruePairing?: boolean;
  // For Multiple Choice
  options?: string[];
  // For Matching block (a single question node that groups 4-5 cards, or individual matching)
  matchingOptions?: string[];
}

export interface UserAnswerRecord {
  questionId: string;
  userAnswer: string;
  isSubmitted: boolean;
  isCorrect: boolean;
  isSkipped?: boolean;
}

const normalizeAnswer = (raw: string | null | undefined): string => {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[〜～・、。！？!?,.\s\(\)（）\-\+\/「」『』]/g, '')
    .trim();
};

const stripTilde = (raw: string | null | undefined): string => {
  if (!raw) return '';
  return raw.replace(/^[〜～]+|[〜～]+$/g, '').trim();
};

const shuffleArray = <T,>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const FlashcardTestView: React.FC = () => {
  const { topicId, contentType } = useParams<{ topicId: string; contentType: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isBookmarkSource =
    searchParams.get('source') === 'bookmark' || topicId === 'bookmarks';
  const isDemo = topicId === 'demo' || (topicId === '0' && !isBookmarkSource);
  const currentTopicId = topicId && !isDemo && !isBookmarkSource ? parseInt(topicId, 10) : 101;
  const currentContentType: FlashcardContentType =
    contentType?.toLowerCase() === 'grammar' ? 'Grammar' : 'Vocabulary';
  const isGrammar = currentContentType === 'Grammar';

  // Data state
  const [setTitle, setSetTitle] = useState<string>('');
  const [jlptLevel, setJlptLevel] = useState<string>('N5');
  const [allCards, setAllCards] = useState<FlashcardCardItem[]>([]);
  const [distractorPool, setDistractorPool] = useState<FlashcardCardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Test Configuration state
  const [config, setConfig] = useState<QuizTestConfig>({
    questionCount: 10,
    includeTrueFalse: true,
    includeMultipleChoice: true,
    includeMatching: true,
    includeWritten: false,
    direction: 'ja_to_vi',
    cardScope: 'all',
    instantFeedback: false,
    listeningMode: false,
    timeLimitSeconds: 0,
  });

  // Phase: 'setup' | 'testing' | 'result'
  const [phase, setPhase] = useState<'setup' | 'testing' | 'result'>('setup');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, UserAnswerRecord>>({});
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number>(0);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [unansweredWarning, setUnansweredWarning] = useState<boolean>(false);
  const [revealedListeningIds, setRevealedListeningIds] = useState<Record<string, boolean>>({});
  const [timedOut, setTimedOut] = useState<boolean>(false);
  const [bulkBookmarking, setBulkBookmarking] = useState<boolean>(false);
  const [bulkBookmarkMessage, setBulkBookmarkMessage] = useState<string | null>(null);

  // Independent self-assessment attempt persistence state
  const [savingResult, setSavingResult] = useState<boolean>(false);
  const [savedAttemptId, setSavedAttemptId] = useState<number | null>(null);
  const [saveResultError, setSaveResultError] = useState<string | null>(null);

  // Matching block interactive state (selected option tracking)
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const autoSubmittedRef = useRef<boolean>(false);

  // Load cards from API or Demo
  useEffect(() => {
    const loadCards = async () => {
      setLoading(true);
      setErrorMessage(null);

      const fallbackPool = [
        ...DEMO_VOCAB_SET.cards,
        ...DEMO_GRAMMAR_SET.cards,
      ];

      if (isDemo) {
        const demoDetail = getDemoSetDetail(currentContentType);
        setSetTitle(demoDetail.summary.topicTitle);
        setJlptLevel(demoDetail.summary.jlptLevel);
        setAllCards(demoDetail.cards);
        setDistractorPool([...demoDetail.cards, ...fallbackPool]);
        setConfig((prev) => ({
          ...prev,
          questionCount: demoDetail.cards.length,
        }));
        setLoading(false);
        return;
      }

      if (isBookmarkSource) {
        const res = await flashcardService.getBookmarks('All', 'All', '');
        if (res.success && res.data && Array.isArray(res.data.items)) {
          const mapped: FlashcardCardItem[] = res.data.items.map((b) => ({
            itemId: b.itemId,
            itemType: b.itemType,
            frontText: b.frontText,
            readingOrFormation: b.readingOrFormation,
            meaning: b.meaning,
            partOfSpeech: b.partOfSpeech,
            explanation: b.explanation,
            exampleSentence: b.exampleSentence,
            audioUrl: b.audioUrl,
            jlptLevel: b.jlptLevel || 'N5',
            isBookmarked: true,
            srsState: b.srsState,
            repetitions: 1,
            intervalDays: b.intervalDays,
            easeFactor: 2.5,
            nextReviewAt: b.nextReviewAt,
            intervalPreview: { againDays: 1, goodDays: 1, easyDays: 3 },
          }));
          setSetTitle('Kho thẻ đã lưu (Bookmarks)');
          setJlptLevel('N5 - N3');
          setAllCards(mapped);
          setDistractorPool([...mapped, ...fallbackPool]);
          setConfig((prev) => ({
            ...prev,
            questionCount: Math.min(20, Math.max(1, mapped.length)),
          }));
        } else {
          setErrorMessage(res.message || 'Không thể tải danh sách thẻ đã lưu.');
        }
        setLoading(false);
        return;
      }

      const res = await flashcardService.getSetDetail(currentTopicId, currentContentType);
      if (res.success && res.data) {
        setSetTitle(res.data.summary.topicTitle);
        setJlptLevel(res.data.summary.jlptLevel);
        setAllCards(res.data.cards);
        setDistractorPool([...res.data.cards, ...fallbackPool]);
        setConfig((prev) => ({
          ...prev,
          questionCount: Math.min(20, Math.max(1, res.data!.cards.length)),
        }));
      } else {
        setErrorMessage(res.message || 'Không thể tải danh sách thẻ để tạo bài kiểm tra.');
      }
      setLoading(false);
    };

    loadCards();
  }, [currentTopicId, currentContentType, isDemo, isBookmarkSource]);

  // Timer during 'testing' phase
  useEffect(() => {
    if (phase !== 'testing') return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, startedAt]);

  // Filtered eligible cards based on cardScope
  const eligibleCards = useMemo(() => {
    if (config.cardScope === 'learned') {
      return allCards.filter((c) => c.srsState === 'Learning' || c.srsState === 'Due');
    }
    if (config.cardScope === 'due') {
      return allCards.filter((c) => c.srsState === 'Due');
    }
    if (config.cardScope === 'bookmarked') {
      return allCards.filter((c) => c.isBookmarked);
    }
    return allCards;
  }, [allCards, config.cardScope]);

  // Adjust questionCount when eligibleCards changes
  useEffect(() => {
    if (eligibleCards.length > 0 && config.questionCount > eligibleCards.length) {
      setConfig((prev) => ({ ...prev, questionCount: eligibleCards.length }));
    } else if (eligibleCards.length > 0 && config.questionCount === 0) {
      setConfig((prev) => ({ ...prev, questionCount: Math.min(10, eligibleCards.length) }));
    }
  }, [eligibleCards.length]);

  // Audio playback helper
  const playJapaneseAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Toggle Bookmark directly in Results
  const handleToggleBookmark = async (card: FlashcardCardItem) => {
    const nextState = !card.isBookmarked;
    setAllCards((prev) =>
      prev.map((c) =>
        c.itemId === card.itemId && c.itemType === card.itemType
          ? { ...c, isBookmarked: nextState }
          : c
      )
    );
    setQuestions((prev) =>
      prev.map((q) =>
        q.card.itemId === card.itemId && q.card.itemType === card.itemType
          ? { ...q, card: { ...q.card, isBookmarked: nextState } }
          : q
      )
    );

    if (!isDemo) {
      await flashcardService.toggleBookmark(card.itemType, card.itemId);
    }
  };

  // 1-click Bookmark all missed / skipped cards on Result screen
  const handleBookmarkAllMissed = async () => {
    const missedUnbookmarked = questions
      .filter((q) => {
        const rec = answers[q.id];
        return (!rec || !rec.isCorrect) && !q.card.isBookmarked;
      })
      .map((q) => q.card);

    // Deduplicate by itemType + itemId
    const seen = new Set<string>();
    const uniqueCards = missedUnbookmarked.filter((c) => {
      const k = `${c.itemType}_${c.itemId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (uniqueCards.length === 0) {
      setBulkBookmarkMessage('Tất cả các thẻ làm sai đều đã có trong Bookmark rồi.');
      return;
    }

    setBulkBookmarking(true);
    setBulkBookmarkMessage(null);

    if (!isDemo) {
      await Promise.all(
        uniqueCards.map((c) => flashcardService.toggleBookmark(c.itemType, c.itemId))
      );
    }

    const savedKeys = new Set(uniqueCards.map((c) => `${c.itemType}_${c.itemId}`));
    setAllCards((prev) =>
      prev.map((c) =>
        savedKeys.has(`${c.itemType}_${c.itemId}`) ? { ...c, isBookmarked: true } : c
      )
    );
    setQuestions((prev) =>
      prev.map((q) =>
        savedKeys.has(`${q.card.itemType}_${q.card.itemId}`)
          ? { ...q, card: { ...q.card, isBookmarked: true } }
          : q
      )
    );

    setBulkBookmarking(false);
    setBulkBookmarkMessage(`Đã lưu ${uniqueCards.length} thẻ làm sai vào Bookmark!`);
  };

  // Build Quiz Questions from a target list of cards
  const buildQuestionsFromCards = (sourceCards: FlashcardCardItem[]) => {
    const enabledTypes: QuizQuestionType[] = [];
    if (config.includeTrueFalse) enabledTypes.push('true_false');
    if (config.includeMultipleChoice) enabledTypes.push('multiple_choice');
    if (config.includeMatching) enabledTypes.push('matching');
    if (config.includeWritten) enabledTypes.push('written');

    if (enabledTypes.length === 0) {
      enabledTypes.push('multiple_choice');
    }

    const shuffledCards = shuffleArray(sourceCards).slice(
      0,
      Math.max(1, Math.min(config.questionCount, sourceCards.length))
    );

    // Distribute question types cleanly like Quizlet (grouped by type: True/False -> Multiple Choice -> Matching -> Written)
    const typeOrder: Record<QuizQuestionType, number> = {
      true_false: 1,
      multiple_choice: 2,
      matching: 3,
      written: 4,
    };

    const assignedTypes: QuizQuestionType[] = shuffledCards.map((_, idx) => {
      return enabledTypes[idx % enabledTypes.length];
    });
    assignedTypes.sort((a, b) => typeOrder[a] - typeOrder[b]);

    // Matching pool options if there are matching questions
    const matchingCardIndices = assignedTypes
      .map((t, i) => (t === 'matching' ? i : -1))
      .filter((i) => i !== -1);
    const matchingCards = matchingCardIndices.map((i) => shuffledCards[i]);

    const generated: QuizQuestion[] = shuffledCards.map((card, idx) => {
      const qType = assignedTypes[idx];
      // For matching, keep consistent direction so the matching bank makes sense
      const qDirection: 'ja_to_vi' | 'vi_to_ja' =
        qType === 'matching'
          ? config.direction === 'vi_to_ja'
            ? 'vi_to_ja'
            : 'ja_to_vi'
          : config.direction === 'mixed'
          ? Math.random() < 0.5
            ? 'ja_to_vi'
            : 'vi_to_ja'
          : config.direction;

      const promptText = qDirection === 'ja_to_vi' ? card.frontText : card.meaning;
      const promptSub =
        qDirection === 'ja_to_vi' ? card.readingOrFormation : card.partOfSpeech || card.jlptLevel;
      const correctAnswer = qDirection === 'ja_to_vi' ? card.meaning : card.frontText;

      const acceptableAnswers: string[] = [correctAnswer];
      if (qDirection === 'vi_to_ja') {
        acceptableAnswers.push(stripTilde(card.frontText));
        if (card.readingOrFormation) {
          acceptableAnswers.push(card.readingOrFormation);
        }
      } else {
        // Also accept parts split by '/' or ';'
        card.meaning.split(/[\/;]/).forEach((part) => {
          if (part.trim().length > 1) acceptableAnswers.push(part.trim());
        });
      }

      // Candidates for distractors (same contentType preferred)
      const sameTypeDistractors = distractorPool.filter(
        (d) =>
          d.itemType === card.itemType &&
          d.itemId !== card.itemId &&
          (qDirection === 'ja_to_vi'
            ? d.meaning !== card.meaning
            : d.frontText !== card.frontText)
      );
      const otherDistractors =
        sameTypeDistractors.length >= 3
          ? sameTypeDistractors
          : distractorPool.filter(
              (d) =>
                d.itemId !== card.itemId &&
                (qDirection === 'ja_to_vi'
                  ? d.meaning !== card.meaning
                  : d.frontText !== card.frontText)
            );

      if (qType === 'true_false') {
        const isTrue = Math.random() < 0.5 || otherDistractors.length === 0;
        const pairedCard = isTrue
          ? card
          : shuffleArray(otherDistractors)[0] || card;
        const displayedPairing =
          qDirection === 'ja_to_vi' ? pairedCard.meaning : pairedCard.frontText;

        return {
          id: `q_${idx}_${card.itemId}`,
          index: idx + 1,
          type: 'true_false',
          direction: qDirection,
          card,
          promptText,
          promptSub,
          correctAnswer: isTrue ? 'TRUE' : 'FALSE',
          acceptableAnswers: [isTrue ? 'TRUE' : 'FALSE'],
          displayedPairing,
          displayedPairingCard: pairedCard,
          isTruePairing: isTrue,
        };
      }

      if (qType === 'multiple_choice') {
        const distractorTexts = Array.from(
          new Set(
            shuffleArray(otherDistractors).map((d) =>
              qDirection === 'ja_to_vi' ? d.meaning : d.frontText
            )
          )
        ).slice(0, 3);
        const options = shuffleArray([correctAnswer, ...distractorTexts]);

        return {
          id: `q_${idx}_${card.itemId}`,
          index: idx + 1,
          type: 'multiple_choice',
          direction: qDirection,
          card,
          promptText,
          promptSub,
          correctAnswer,
          acceptableAnswers,
          options,
        };
      }

      if (qType === 'matching') {
        // Build shared matching bank from all matching cards + 1-2 extra distractors if needed
        const baseBank = matchingCards.map((mc) =>
          qDirection === 'ja_to_vi' ? mc.meaning : mc.frontText
        );
        const extraBank = shuffleArray(otherDistractors)
          .slice(0, Math.max(0, 4 - baseBank.length))
          .map((d) => (qDirection === 'ja_to_vi' ? d.meaning : d.frontText));
        const options = shuffleArray(Array.from(new Set([...baseBank, ...extraBank])));

        return {
          id: `q_${idx}_${card.itemId}`,
          index: idx + 1,
          type: 'matching',
          direction: qDirection,
          card,
          promptText,
          promptSub,
          correctAnswer,
          acceptableAnswers,
          matchingOptions: options,
        };
      }

      // Written
      return {
        id: `q_${idx}_${card.itemId}`,
        index: idx + 1,
        type: 'written',
        direction: qDirection,
        card,
        promptText,
        promptSub,
        correctAnswer,
        acceptableAnswers,
      };
    });

    setQuestions(generated);
    setAnswers({});
    setActiveQuestionIdx(0);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    setUnansweredWarning(false);
    setRevealedListeningIds({});
    setTimedOut(false);
    setBulkBookmarkMessage(null);
    autoSubmittedRef.current = false;
    setSavingResult(false);
    setSavedAttemptId(null);
    setSaveResultError(null);
    setPhase('testing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartTest = () => {
    if (eligibleCards.length === 0) return;
    buildQuestionsFromCards(eligibleCards);
  };

  // Retake test with only missed / incorrect cards
  const handleRetakeMissedCards = () => {
    const missedCards = questions
      .filter((q) => {
        const ans = answers[q.id];
        return !ans || !ans.isCorrect;
      })
      .map((q) => q.card);

    if (missedCards.length === 0) return;
    setConfig((prev) => ({ ...prev, questionCount: missedCards.length }));
    buildQuestionsFromCards(missedCards);
  };

  // Evaluate whether an answer is correct for a question
  const evaluateAnswer = (q: QuizQuestion, rawAnswer: string): boolean => {
    if (!rawAnswer.trim()) return false;
    if (q.type === 'true_false' || q.type === 'multiple_choice' || q.type === 'matching') {
      return rawAnswer === q.correctAnswer;
    }
    // Written answer evaluation: flexible Japanese/Vietnamese normalization
    const normUser = normalizeAnswer(rawAnswer);
    if (!normUser) return false;
    return q.acceptableAnswers.some((acc) => normalizeAnswer(acc) === normUser);
  };

  // Record user answer for a question
  const handleSelectAnswer = (q: QuizQuestion, value: string, autoAdvance = true) => {
    const isCorrect = evaluateAnswer(q, value);
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        questionId: q.id,
        userAnswer: value,
        isSubmitted: true,
        isCorrect,
        isSkipped: false,
      },
    }));
    setUnansweredWarning(false);

    // Smoothly scroll to next unanswered question if not written
    if (autoAdvance && q.type !== 'written' && q.index < questions.length) {
      const nextIdx = q.index; // 1-based index is next 0-based index
      setActiveQuestionIdx(nextIdx);
      setTimeout(() => {
        const el = questionRefs.current[nextIdx];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 180);
    }
  };

  const handleWrittenChange = (q: QuizQuestion, value: string) => {
    const isCorrect = evaluateAnswer(q, value);
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        questionId: q.id,
        userAnswer: value,
        isSubmitted: prev[q.id]?.isSubmitted || false,
        isCorrect,
        isSkipped: false,
      },
    }));
  };

  const handleConfirmWritten = (q: QuizQuestion) => {
    const currentVal = answers[q.id]?.userAnswer || '';
    const isCorrect = evaluateAnswer(q, currentVal);
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        questionId: q.id,
        userAnswer: currentVal,
        isSubmitted: true,
        isCorrect,
        isSkipped: !currentVal.trim(),
      },
    }));

    if (q.index < questions.length) {
      const nextIdx = q.index;
      setActiveQuestionIdx(nextIdx);
      setTimeout(() => {
        const el = questionRefs.current[nextIdx];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };

  const handleSkipQuestion = (q: QuizQuestion) => {
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        questionId: q.id,
        userAnswer: '',
        isSubmitted: true,
        isCorrect: false,
        isSkipped: true,
      },
    }));
    if (q.index < questions.length) {
      const nextIdx = q.index;
      setActiveQuestionIdx(nextIdx);
      setTimeout(() => {
        const el = questionRefs.current[nextIdx];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };

  const persistQuizAttempt = async (
    targetQuestions: QuizQuestion[],
    finalizedAnswers: Record<string, UserAnswerRecord>,
    durationSec: number
  ) => {
    if (isDemo || targetQuestions.length === 0) return;

    setSavingResult(true);
    setSaveResultError(null);

    const hasVocab = targetQuestions.some((q) => q.card.itemType === 'Vocabulary');
    const hasGrammar = targetQuestions.some((q) => q.card.itemType === 'Grammar');
    const resolvedContentType: FlashcardContentType | 'Mixed' =
      hasVocab && hasGrammar ? 'Mixed' : hasGrammar ? 'Grammar' : 'Vocabulary';

    const payload: SubmitFlashcardQuizAttemptRequest = {
      sourceType: isBookmarkSource ? 'Bookmark' : 'TopicSet',
      topicId: isBookmarkSource ? null : currentTopicId,
      contentType: resolvedContentType,
      setTitle,
      direction: config.direction,
      cardScope: config.cardScope,
      instantFeedback: config.instantFeedback,
      durationSeconds: Math.max(1, durationSec),
      items: targetQuestions.map((q) => {
        const rec = finalizedAnswers[q.id];
        const isSkipped = !rec || !!rec.isSkipped || !rec.userAnswer.trim();
        return {
          questionIndex: q.index,
          questionType: q.type,
          direction: q.direction,
          itemType: q.card.itemType,
          itemId: q.card.itemId,
          promptText: q.promptText,
          correctAnswer: q.correctAnswer,
          userAnswer: isSkipped ? null : rec.userAnswer,
          isCorrect: !isSkipped && !!rec?.isCorrect,
          isSkipped,
        };
      }),
    };

    const res = await flashcardQuizService.submitAttempt(payload);
    if (res.success && res.data) {
      setSavedAttemptId(res.data.attemptId);
    } else {
      setSaveResultError(res.message || 'Không thể lưu kết quả tự đánh giá.');
    }
    setSavingResult(false);
  };

  // Submit entire test
  const handleSubmitTest = (force = false) => {
    const unansweredCount = questions.filter((q) => {
      const rec = answers[q.id];
      return !rec || (!rec.userAnswer.trim() && !rec.isSkipped);
    }).length;

    if (unansweredCount > 0 && !force) {
      setUnansweredWarning(true);
      // Scroll to first unanswered
      const firstUnansweredIdx = questions.findIndex((q) => {
        const rec = answers[q.id];
        return !rec || (!rec.userAnswer.trim() && !rec.isSkipped);
      });
      if (firstUnansweredIdx >= 0) {
        setActiveQuestionIdx(firstUnansweredIdx);
        questionRefs.current[firstUnansweredIdx]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
      return;
    }

    // Finalize all answers
    const finalized: Record<string, UserAnswerRecord> = {};
    questions.forEach((q) => {
      const existing = answers[q.id];
      if (existing && existing.userAnswer.trim()) {
        finalized[q.id] = {
          ...existing,
          isSubmitted: true,
          isCorrect: evaluateAnswer(q, existing.userAnswer),
        };
      } else {
        finalized[q.id] = {
          questionId: q.id,
          userAnswer: '',
          isSubmitted: true,
          isCorrect: false,
          isSkipped: true,
        };
      }
    });

    const finalDuration = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    setAnswers(finalized);
    setElapsedSeconds(finalDuration);
    setPhase('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    void persistQuizAttempt(questions, finalized, finalDuration);
  };

  // Auto-submit when Timed Challenge hits 0
  useEffect(() => {
    if (
      phase === 'testing' &&
      config.timeLimitSeconds > 0 &&
      elapsedSeconds >= config.timeLimitSeconds &&
      !autoSubmittedRef.current
    ) {
      autoSubmittedRef.current = true;
      setTimedOut(true);
      handleSubmitTest(true);
    }
  }, [phase, config.timeLimitSeconds, elapsedSeconds]);

  // Keyboard shortcuts during testing phase (1-4, T/F, R to replay audio, Up/Down arrows)
  useEffect(() => {
    if (phase !== 'testing' || questions.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const activeQ = questions[activeQuestionIdx];
      if (!activeQ) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(questions.length - 1, activeQuestionIdx + 1);
        setActiveQuestionIdx(next);
        questionRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(0, activeQuestionIdx - 1);
        setActiveQuestionIdx(prev);
        questionRefs.current[prev]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        playJapaneseAudio(activeQ.card.frontText);
        return;
      }

      if (activeQ.type === 'true_false') {
        if (e.key.toLowerCase() === 't' || e.key === '1') {
          e.preventDefault();
          handleSelectAnswer(activeQ, 'TRUE');
        } else if (e.key.toLowerCase() === 'f' || e.key === '2') {
          e.preventDefault();
          handleSelectAnswer(activeQ, 'FALSE');
        }
      } else if (activeQ.type === 'multiple_choice' && activeQ.options) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= activeQ.options.length) {
          e.preventDefault();
          handleSelectAnswer(activeQ, activeQ.options[num - 1]);
        }
      } else if (activeQ.type === 'matching' && activeQ.matchingOptions) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= activeQ.matchingOptions.length) {
          e.preventDefault();
          handleSelectAnswer(activeQ, activeQ.matchingOptions[num - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, questions, activeQuestionIdx, answers]);

  const remainingSeconds =
    config.timeLimitSeconds > 0
      ? Math.max(0, config.timeLimitSeconds - elapsedSeconds)
      : 0;

  const missedUnbookmarkedCount = useMemo(() => {
    const seen = new Set<string>();
    return questions.filter((q) => {
      const rec = answers[q.id];
      if ((rec && rec.isCorrect) || q.card.isBookmarked) return false;
      const k = `${q.card.itemType}_${q.card.itemId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).length;
  }, [questions, answers]);

  // Progress & Results stats
  const answeredCount = useMemo(() => {
    return questions.filter((q) => {
      const rec = answers[q.id];
      return rec && (rec.userAnswer.trim() !== '' || rec.isSkipped);
    }).length;
  }, [questions, answers]);

  const resultStats = useMemo(() => {
    if (questions.length === 0) {
      return { total: 0, correct: 0, wrong: 0, skipped: 0, scorePercent: 0 };
    }
    let correct = 0;
    let skipped = 0;
    questions.forEach((q) => {
      const rec = answers[q.id];
      if (!rec || rec.isSkipped || !rec.userAnswer.trim()) {
        skipped++;
      } else if (rec.isCorrect) {
        correct++;
      }
    });
    const wrong = questions.length - correct - skipped;
    const scorePercent = Math.round((correct / questions.length) * 100);
    return { total: questions.length, correct, wrong, skipped, scorePercent };
  }, [questions, answers]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const backUrl = isBookmarkSource
    ? '/flashcards?tab=bookmarks'
    : `/flashcards/sets/${isDemo ? 'demo' : currentTopicId}/${currentContentType.toLowerCase()}`;

  const getQuestionTypeBadge = (type: QuizQuestionType) => {
    switch (type) {
      case 'true_false':
        return { label: 'Đúng / Sai', icon: '⚖️', color: 'bg-warning-soft text-warning border-warning/30' };
      case 'multiple_choice':
        return { label: 'Trắc nghiệm', icon: '🎯', color: 'bg-ai-soft text-ai border-ai/30' };
      case 'matching':
        return { label: 'Ghép thẻ', icon: '🔗', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' };
      case 'written':
        return { label: 'Tự luận', icon: '✍️', color: 'bg-success-soft text-success border-success/30' };
    }
  };

  return (
    <div className="min-h-screen bg-paper-100 text-sumi font-sans pb-16">
      {/* ==================== TOP STICKY BAR ==================== */}
      <header className="sticky top-0 z-30 bg-paper-50/95 backdrop-blur-md border-b border-line shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to={backUrl}
              className="w-9 h-9 rounded-xl bg-paper-100 hover:bg-paper-200 text-sumi border border-line flex items-center justify-center font-bold text-sm transition shrink-0"
              title="Quay lại bộ thẻ"
            >
              ←
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-ai-soft text-ai border border-ai/30 uppercase">
                  📝 Quizlet Test Mode
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-paper-200 text-sumi-muted border border-line">
                  {jlptLevel}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-black text-sumi truncate mt-0.5">
                {setTitle || 'Kiểm tra kiến thức Flashcard'}
              </h1>
            </div>
          </div>

          {/* Right status / actions */}
          {phase === 'setup' && (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/flashcards/test/history"
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-ai-soft hover:bg-ai/20 text-ai border border-ai/30 transition flex items-center gap-1.5"
              >
                <span>🕒</span>
                <span>Lịch sử tự đánh giá</span>
              </Link>
            </div>
          )}

          {phase === 'testing' && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2 bg-paper-100 border border-line px-3 py-1.5 rounded-xl text-xs font-bold text-sumi">
                {config.timeLimitSeconds > 0 ? (
                  <span
                    className={
                      remainingSeconds <= 10
                        ? 'text-danger animate-pulse font-black'
                        : remainingSeconds <= 30
                        ? 'text-warning font-black'
                        : 'text-ai font-bold'
                    }
                  >
                    ⏳ {formatTime(remainingSeconds)}
                  </span>
                ) : (
                  <span>⏱️ {formatTime(elapsedSeconds)}</span>
                )}
                <span className="text-line">|</span>
                <span className="text-ai">
                  Đã làm: {answeredCount}/{questions.length}
                </span>
              </div>
              <button
                onClick={() => setPhase('setup')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-sumi-muted hover:text-sumi hover:bg-paper-100 border border-line transition cursor-pointer"
              >
                ⚙️ Tùy chỉnh
              </button>
              <button
                onClick={() => handleSubmitTest(false)}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-ai hover:bg-ai-hover text-on-ai shadow-xs transition cursor-pointer"
              >
                Nộp bài ✓
              </button>
            </div>
          )}

          {phase === 'result' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPhase('setup')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-paper-100 hover:bg-paper-200 text-sumi border border-line transition cursor-pointer"
              >
                ⚙️ Thiết lập đề mới
              </button>
              <button
                onClick={handleStartTest}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-ai hover:bg-ai-hover text-on-ai shadow-xs transition cursor-pointer"
              >
                🔄 Làm đề mới
              </button>
            </div>
          )}
        </div>

        {/* Progress Bar under header during testing */}
        {phase === 'testing' && questions.length > 0 && (
          <div className="w-full bg-paper-200 h-1.5 overflow-hidden">
            <div
              className="h-full bg-ai transition-all duration-300"
              style={{ width: `${Math.round((answeredCount / questions.length) * 100)}%` }}
            />
          </div>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-sumi-faint space-y-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-[#2563EB] rounded-full animate-spin" />
            <p className="text-sm font-medium">Đang chuẩn bị ngân hàng câu hỏi từ bộ thẻ...</p>
          </div>
        ) : errorMessage ? (
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl text-sm space-y-4">
            <div>⚠️ {errorMessage}</div>
            <Link
              to={backUrl}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-paper-50 border border-red-200 text-xs font-bold text-red-700"
            >
              ← Quay lại
            </Link>
          </div>
        ) : (
          <>
            {/* ==================== PHASE 1: SETUP SCREEN (QUIZLET OPTIONS) ==================== */}
            {phase === 'setup' && (
              <div className="bg-paper-50 rounded-3xl border border-line shadow-sm overflow-hidden">
                {/* Banner */}
                <div className="bg-gradient-to-r from-[#071A44] via-[#1E3A8A] to-indigo-900 p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-bold backdrop-blur-xs">
                      <span>📝</span>
                      <span>Chế độ Kiểm tra (Quizlet Test)</span>
                    </div>
                    <h2 className="text-2xl font-black tracking-tight">
                      Thiết lập bài kiểm tra: {setTitle}
                    </h2>
                    <p className="text-xs text-blue-100 max-w-xl">
                      Hệ thống tự động sinh câu hỏi và đáp án nhiễu từ chính các thẻ {isGrammar ? 'ngữ pháp' : 'từ vựng'} trong chủ đề. Không giới hạn số lần thử và không trừ Quota thẻ mới hàng ngày.
                    </p>
                  </div>
                  <div className="bg-white/10 border border-white/15 rounded-2xl p-4 text-center shrink-0">
                    <div className="text-[11px] uppercase tracking-wider text-blue-200 font-bold">
                      Tổng số thẻ khả dụng
                    </div>
                    <div className="text-3xl font-black mt-0.5">{eligibleCards.length}</div>
                    <div className="text-[11px] text-blue-200">trên tổng {allCards.length} thẻ</div>
                  </div>
                </div>

                {/* Setup Form */}
                <div className="p-6 sm:p-8 space-y-8">
                  {/* 1. Chọn phạm vi thẻ */}
                  <div className="space-y-3">
                    <label className="block text-sm font-black text-sumi">
                      1. Phạm vi thẻ đưa vào đề kiểm tra
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { id: 'all', label: 'Tất cả thẻ', count: allCards.length, icon: '📚' },
                        {
                          id: 'learned',
                          label: 'Đã học / Đang ôn',
                          count: allCards.filter((c) => c.srsState !== 'New').length,
                          icon: '🧠',
                        },
                        {
                          id: 'due',
                          label: 'Đến hạn hôm nay',
                          count: allCards.filter((c) => c.srsState === 'Due').length,
                          icon: '🔥',
                        },
                        {
                          id: 'bookmarked',
                          label: 'Đã lưu Bookmark',
                          count: allCards.filter((c) => c.isBookmarked).length,
                          icon: '🔖',
                        },
                      ].map((scope) => {
                        const active = config.cardScope === scope.id;
                        return (
                          <button
                            key={scope.id}
                            type="button"
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                cardScope: scope.id as CardScopeFilter,
                              }))
                            }
                            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              active
                                ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20'
                                : 'bg-paper-100/80 hover:bg-paper-100 border-line'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-lg">{scope.icon}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-black ${
                                  active ? 'bg-blue-600 text-white' : 'bg-paper-200 text-sumi'
                                }`}
                              >
                                {scope.count}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-sumi mt-2">
                              {scope.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Số lượng câu hỏi & Chiều câu hỏi */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-line">
                    {/* Số lượng câu hỏi */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-black text-sumi">
                          2. Số lượng câu hỏi (Tối đa {eligibleCards.length})
                        </label>
                        <span className="px-3 py-1 rounded-xl bg-blue-50 text-blue-700 font-black text-sm border border-blue-200">
                          {config.questionCount} câu
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={Math.max(1, eligibleCards.length)}
                        value={Math.min(config.questionCount, Math.max(1, eligibleCards.length))}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            questionCount: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        {[5, 10, 15, eligibleCards.length]
                          .filter((v, i, arr) => v > 0 && v <= eligibleCards.length && arr.indexOf(v) === i)
                          .map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                setConfig((prev) => ({ ...prev, questionCount: preset }))
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                config.questionCount === preset
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-paper-50 text-sumi-muted border-line hover:bg-paper-100'
                              }`}
                            >
                              {preset === eligibleCards.length ? `Tất cả (${preset})` : `${preset} câu`}
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Chiều câu hỏi */}
                    <div className="space-y-3">
                      <label className="block text-sm font-black text-sumi">
                        3. Chiều câu hỏi & trả lời
                      </label>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          {
                            id: 'ja_to_vi',
                            label: 'Nhật ➔ Việt (Khuyên dùng)',
                            desc: 'Hiện Từ vựng / Mẫu ngữ pháp ➔ Chọn nghĩa tiếng Việt',
                          },
                          {
                            id: 'vi_to_ja',
                            label: 'Việt ➔ Nhật (Thử thách nhớ mặt chữ)',
                            desc: 'Hiện Nghĩa tiếng Việt ➔ Chọn / Gõ từ tiếng Nhật',
                          },
                          {
                            id: 'mixed',
                            label: 'Kết hợp ngẫu nhiên cả hai chiều',
                            desc: 'Đan xen câu hỏi Nhật ➔ Việt và Việt ➔ Nhật',
                          },
                        ].map((dir) => {
                          const active = config.direction === dir.id;
                          return (
                            <button
                              key={dir.id}
                              type="button"
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  direction: dir.id as AnswerDirection,
                                }))
                              }
                              className={`px-4 py-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                                active
                                  ? 'bg-blue-50 border-blue-500 text-blue-950'
                                  : 'bg-paper-50 hover:bg-paper-100 border-line text-sumi'
                              }`}
                            >
                              <div>
                                <div className="text-xs font-extrabold">{dir.label}</div>
                                <div className="text-[11px] text-sumi-muted">{dir.desc}</div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  active ? 'border-blue-600 bg-blue-600 text-white' : 'border-line'
                                }`}
                              >
                                {active && <span className="text-[10px]">✓</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 4. Các loại câu hỏi kiểu Quizlet */}
                  <div className="space-y-3 pt-4 border-t border-line">
                    <label className="block text-sm font-black text-sumi">
                      4. Loại câu hỏi (Chọn ít nhất 1 dạng câu hỏi)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          key: 'includeTrueFalse' as const,
                          icon: '⚖️',
                          title: 'Đúng / Sai (True / False)',
                          desc: 'Kiểm tra phản xạ nhanh xem cặp Từ và Nghĩa được ghép có khớp nhau không.',
                        },
                        {
                          key: 'includeMultipleChoice' as const,
                          icon: '🎯',
                          title: 'Trắc nghiệm 4 đáp án (Multiple Choice)',
                          desc: 'Chọn 1 đáp án đúng duy nhất trong 4 phương án lấy từ bộ thẻ.',
                        },
                        {
                          key: 'includeMatching' as const,
                          icon: '🔗',
                          title: 'Ghép thẻ (Matching)',
                          desc: 'Chọn nghĩa tương ứng từ bảng ngân hàng từ để ghép đúng từng mục.',
                        },
                        {
                          key: 'includeWritten' as const,
                          icon: '✍️',
                          title: 'Tự luận / Gõ đáp án (Written)',
                          desc: 'Tự gõ lại từ vựng (chấp nhận cả Kanji, Hiragana) hoặc nghĩa tiếng Việt.',
                        },
                      ].map((qType) => {
                        const checked = config[qType.key];
                        return (
                          <label
                            key={qType.key}
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                [qType.key]: !prev[qType.key],
                              }))
                            }
                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 select-none ${
                              checked
                                ? 'bg-indigo-50/60 border-indigo-500 ring-1 ring-indigo-500/20'
                                : 'bg-paper-50 hover:bg-paper-100 border-line'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-xl mt-0.5">{qType.icon}</span>
                              <div>
                                <div className="text-xs font-extrabold text-sumi">
                                  {qType.title}
                                </div>
                                <div className="text-[11px] text-sumi-muted mt-0.5 leading-relaxed">
                                  {qType.desc}
                                </div>
                              </div>
                            </div>
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition ${
                                checked
                                  ? 'bg-indigo-600 border-indigo-600 text-white font-bold text-xs'
                                  : 'bg-paper-50 border-line'
                              }`}
                            >
                              {checked && '✓'}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 5. Chế độ nâng cao: Instant Feedback, Listening Mode & Timed Challenge */}
                  <div className="pt-4 border-t border-line space-y-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-sumi">
                          ⚡ Chấm điểm tức thì sau mỗi câu (Instant Feedback)
                        </div>
                        <p className="text-xs text-sumi-muted">
                          Nếu bật, hệ thống sẽ báo Đúng/Sai ngay khi bạn chọn đáp án. Nếu tắt, hệ thống sẽ chấm toàn bộ bài thi khi bấm &quot;Nộp bài&quot; giống chuẩn Quizlet Test.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            instantFeedback: !prev.instantFeedback,
                          }))
                        }
                        className={`w-12 h-7 rounded-full transition-colors p-1 cursor-pointer shrink-0 ${
                          config.instantFeedback ? 'bg-ai' : 'bg-paper-200 border border-line'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-paper-50 shadow-xs transition-transform ${
                            config.instantFeedback ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-sumi">
                          🎧 Chế độ Nghe chọn đáp án (Listening Mode)
                        </div>
                        <p className="text-xs text-sumi-muted">
                          Ẩn mặt chữ tiếng Nhật ở các câu hỏi Nhật ➔ Việt để rèn phản xạ nghe phát âm (có nút mở gợi ý chữ nếu cần).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            listeningMode: !prev.listeningMode,
                          }))
                        }
                        className={`w-12 h-7 rounded-full transition-colors p-1 cursor-pointer shrink-0 ${
                          config.listeningMode ? 'bg-ai' : 'bg-paper-200 border border-line'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-paper-50 shadow-xs transition-transform ${
                            config.listeningMode ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      <div>
                        <div className="text-sm font-black text-sumi">
                          ⏳ Chế độ Thi bấm giờ (Timed Challenge)
                        </div>
                        <p className="text-xs text-sumi-muted">
                          Giới hạn thời gian làm bài để tăng áp lực phản xạ; hệ thống tự động nộp bài khi hết giờ.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { secs: 0, label: 'Không giới hạn' },
                          { secs: 60, label: '1 phút' },
                          { secs: 180, label: '3 phút' },
                          { secs: 300, label: '5 phút' },
                        ].map((opt) => {
                          const active = config.timeLimitSeconds === opt.secs;
                          return (
                            <button
                              key={opt.secs}
                              type="button"
                              onClick={() =>
                                setConfig((prev) => ({ ...prev, timeLimitSeconds: opt.secs }))
                              }
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                active
                                  ? 'bg-ai text-on-ai border-ai shadow-xs'
                                  : 'bg-paper-100 text-sumi-muted border-line hover:text-sumi hover:bg-paper-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Start CTA */}
                  <div className="pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4">
                    {eligibleCards.length === 0 ? (
                      <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl">
                        ⚠️ Không có thẻ nào thỏa mãn bộ lọc "{config.cardScope}". Vui lòng chọn "Tất cả thẻ".
                      </div>
                    ) : (
                      <div className="text-xs text-sumi-muted">
                        Đề kiểm tra gồm <strong className="text-sumi">{config.questionCount} câu hỏi</strong> được sinh ngẫu nhiên từ <strong className="text-sumi">{eligibleCards.length} thẻ</strong>.
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={eligibleCards.length === 0}
                      onClick={handleStartTest}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 text-white font-black text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>🚀</span>
                      <span>Bắt đầu làm bài kiểm tra</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== PHASE 2: TESTING SCREEN ==================== */}
            {phase === 'testing' && (
              <div className="space-y-6">
                {/* Question Navigator Pills */}
                <div className="bg-paper-50 rounded-2xl border border-line p-4 shadow-2xs space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-sumi uppercase tracking-wider">
                      Danh sách câu hỏi ({answeredCount}/{questions.length} đã trả lời)
                    </span>
                    <span className="text-[11px] text-sumi-muted">
                      ⌨️ Phím tắt: <kbd className="px-1.5 py-0.5 rounded bg-paper-200 border border-line font-mono text-[10px]">1-4</kbd> chọn đáp án •{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-paper-200 border border-line font-mono text-[10px]">T/F</kbd> Đúng/Sai •{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-paper-200 border border-line font-mono text-[10px]">R</kbd> nghe lại •{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-paper-200 border border-line font-mono text-[10px]">↑↓</kbd> chuyển câu
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {questions.map((q, idx) => {
                      const rec = answers[q.id];
                      const isAnswered = rec && (rec.userAnswer.trim() !== '' || rec.isSkipped);
                      const isCurrent = activeQuestionIdx === idx;

                      let pillStyle = 'bg-paper-100 text-sumi-muted border-line hover:bg-paper-200';
                      if (config.instantFeedback && rec?.isSubmitted) {
                        pillStyle = rec.isCorrect
                          ? 'bg-success-soft text-success border-success/30'
                          : 'bg-danger-soft text-danger border-danger/30';
                      } else if (isAnswered) {
                        pillStyle = 'bg-ai text-on-ai border-ai';
                      }

                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            setActiveQuestionIdx(idx);
                            questionRefs.current[idx]?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'center',
                            });
                          }}
                          className={`w-8 h-8 rounded-xl text-xs font-extrabold border transition cursor-pointer flex items-center justify-center ${pillStyle} ${
                            isCurrent ? 'ring-2 ring-offset-1 ring-ai' : ''
                          }`}
                        >
                          {q.index}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Unanswered Warning Banner */}
                {unansweredWarning && (
                  <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-amber-900 font-semibold">
                      ⚠️ Bạn còn <strong>{questions.length - answeredCount} câu hỏi</strong> chưa trả lời. Bạn muốn làm tiếp hay nộp bài luôn?
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSubmitTest(true)}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer"
                    >
                      Vẫn nộp bài ngay
                    </button>
                  </div>
                )}

                {/* Questions List (Quizlet Scrollable Sheet) */}
                <div className="space-y-6">
                  {questions.map((q, idx) => {
                    const badge = getQuestionTypeBadge(q.type);
                    const rec = answers[q.id];
                    const showFeedback = config.instantFeedback && rec?.isSubmitted;

                    return (
                      <div
                        key={q.id}
                        ref={(el) => {
                          questionRefs.current[idx] = el;
                        }}
                        onClick={() => setActiveQuestionIdx(idx)}
                        className={`bg-paper-50 rounded-3xl border p-6 sm:p-8 shadow-2xs transition-all space-y-6 ${
                          activeQuestionIdx === idx
                            ? 'border-blue-400 ring-2 ring-blue-500/10'
                            : 'border-line'
                        }`}
                      >
                        {/* Card Top Header */}
                        <div className="flex items-center justify-between gap-2 border-b border-line pb-4">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-[#071A44] text-white text-xs font-black flex items-center justify-center">
                              {q.index}
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.color}`}
                            >
                              {badge.icon} {badge.label}
                            </span>
                            <span className="text-xs text-sumi-faint font-semibold">
                              {q.direction === 'ja_to_vi' ? 'Nhật ➔ Việt' : 'Việt ➔ Nhật'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {q.direction === 'ja_to_vi' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playJapaneseAudio(q.card.frontText);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-paper-100 hover:bg-blue-50 text-sumi hover:text-blue-700 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                                title="Nghe phát âm tiếng Nhật"
                              >
                                <span>🔊</span>
                                <span>Nghe</span>
                              </button>
                            )}
                            <span className="text-xs font-bold text-sumi-faint">
                              Câu {q.index} / {questions.length}
                            </span>
                          </div>
                        </div>

                        {/* Question Body */}
                        {q.type === 'true_false' ? (
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-paper-100/80 rounded-2xl p-5 border border-line">
                              <div className="space-y-1 md:border-r md:border-line md:pr-4">
                                <div className="text-[11px] font-bold text-sumi-faint uppercase">
                                  {q.direction === 'ja_to_vi' ? 'Thuật ngữ (Tiếng Nhật)' : 'Nghĩa (Tiếng Việt)'}
                                </div>
                                <div className="text-2xl font-black text-sumi font-serif">
                                  {q.promptText}
                                </div>
                                {q.promptSub && (
                                  <div className="text-xs text-blue-600 font-mono">
                                    {q.promptSub}
                                  </div>
                                )}
                              </div>
                              <div className="space-y-1 md:pl-2">
                                <div className="text-[11px] font-bold text-sumi-faint uppercase">
                                  {q.direction === 'ja_to_vi' ? 'Nghĩa được ghép' : 'Thuật ngữ được ghép'}
                                </div>
                                <div className="text-lg font-bold text-sumi">
                                  {q.displayedPairing}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs font-bold text-sumi-muted">
                                Chọn câu trả lời của bạn:
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                {[
                                  { val: 'TRUE', label: 'Đúng (True)', icon: '✓' },
                                  { val: 'FALSE', label: 'Sai (False)', icon: '✕' },
                                ].map((btn) => {
                                  const isSelected = rec?.userAnswer === btn.val;
                                  let btnStyle =
                                    'bg-paper-50 hover:bg-paper-100 text-sumi border-line';
                                  if (showFeedback) {
                                    if (btn.val === q.correctAnswer) {
                                      btnStyle =
                                        'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20';
                                    } else if (isSelected && !rec.isCorrect) {
                                      btnStyle =
                                        'bg-red-50 border-red-400 text-red-800';
                                    }
                                  } else if (isSelected) {
                                    btnStyle =
                                      'bg-blue-50 border-blue-600 text-blue-900 ring-2 ring-blue-500/20';
                                  }

                                  return (
                                    <button
                                      key={btn.val}
                                      type="button"
                                      onClick={() => handleSelectAnswer(q, btn.val)}
                                      className={`p-4 rounded-2xl border font-extrabold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${btnStyle}`}
                                    >
                                      <span>{btn.icon}</span>
                                      <span>{btn.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Prompt for Multiple Choice, Matching, Written */
                          <div className="space-y-6">
                            <div className="bg-paper-100/80 rounded-2xl p-5 border border-line space-y-2">
                              <div className="text-[11px] font-bold text-sumi-faint uppercase">
                                {q.direction === 'ja_to_vi'
                                  ? config.listeningMode
                                    ? '🎧 Nghe phát âm tiếng Nhật'
                                    : isGrammar
                                    ? 'Mẫu ngữ pháp tiếng Nhật'
                                    : 'Từ vựng tiếng Nhật'
                                  : 'Nghĩa tiếng Việt'}
                              </div>
                              {config.listeningMode && q.direction === 'ja_to_vi' && !revealedListeningIds[q.id] ? (
                                <div className="flex flex-wrap items-center gap-3 pt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      playJapaneseAudio(q.card.frontText);
                                    }}
                                    className="px-5 py-3 rounded-2xl bg-ai hover:bg-ai-hover text-on-ai font-extrabold text-sm shadow-xs transition cursor-pointer flex items-center gap-2"
                                  >
                                    <span>🔊</span>
                                    <span>Nghe câu hỏi (Phím R)</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRevealedListeningIds((prev) => ({ ...prev, [q.id]: true }));
                                    }}
                                    className="px-3.5 py-2.5 rounded-xl bg-paper-200 hover:bg-paper-50 text-sumi-muted hover:text-sumi border border-line text-xs font-bold transition cursor-pointer"
                                  >
                                    👁️ Hiện gợi ý mặt chữ
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="text-2xl sm:text-3xl font-black text-sumi font-serif">
                                    {q.promptText}
                                  </div>
                                  {q.promptSub && (
                                    <div className="text-xs font-semibold text-ai font-mono">
                                      {q.promptSub}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Multiple Choice Options */}
                            {q.type === 'multiple_choice' && q.options && (
                              <div className="space-y-2.5">
                                <div className="text-xs font-bold text-sumi-muted">
                                  Chọn đáp án đúng nhất:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {q.options.map((opt, optIdx) => {
                                    const isSelected = rec?.userAnswer === opt;
                                    let optStyle =
                                      'bg-paper-50 hover:bg-paper-100 text-sumi border-line';
                                    if (showFeedback) {
                                      if (opt === q.correctAnswer) {
                                        optStyle =
                                          'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20';
                                      } else if (isSelected && !rec.isCorrect) {
                                        optStyle = 'bg-red-50 border-red-400 text-red-800';
                                      }
                                    } else if (isSelected) {
                                      optStyle =
                                        'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500/20';
                                    }

                                    return (
                                      <button
                                        key={`${q.id}_opt_${optIdx}`}
                                        type="button"
                                        onClick={() => handleSelectAnswer(q, opt)}
                                        className={`p-4 rounded-2xl border text-left font-bold text-sm transition-all cursor-pointer flex items-start gap-3 ${optStyle}`}
                                      >
                                        <span
                                          className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 mt-0.5 ${
                                            isSelected
                                              ? 'bg-blue-600 text-white'
                                              : 'bg-paper-100 text-sumi-muted'
                                          }`}
                                        >
                                          {optIdx + 1}
                                        </span>
                                        <span className="leading-relaxed">{opt}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Matching Options */}
                            {q.type === 'matching' && q.matchingOptions && (
                              <div className="space-y-2.5">
                                <div className="text-xs font-bold text-sumi-muted">
                                  🔗 Chọn mảnh ghép tương ứng từ ngân hàng từ bên dưới:
                                </div>
                                <div className="flex flex-wrap gap-2.5">
                                  {q.matchingOptions.map((opt, optIdx) => {
                                    const isSelected = rec?.userAnswer === opt;
                                    // Check if another matching question already used this option
                                    const usedElsewhere = questions.some(
                                      (otherQ) =>
                                        otherQ.type === 'matching' &&
                                        otherQ.id !== q.id &&
                                        answers[otherQ.id]?.userAnswer === opt
                                    );

                                    let chipStyle =
                                      'bg-paper-50 hover:bg-purple-50 text-sumi border-line';
                                    if (showFeedback) {
                                      if (opt === q.correctAnswer) {
                                        chipStyle =
                                          'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20';
                                      } else if (isSelected && !rec.isCorrect) {
                                        chipStyle = 'bg-red-50 border-red-400 text-red-800';
                                      }
                                    } else if (isSelected) {
                                      chipStyle =
                                        'bg-purple-600 border-purple-600 text-white shadow-xs';
                                    } else if (usedElsewhere) {
                                      chipStyle =
                                        'bg-paper-100 text-sumi-faint border-line line-through opacity-75';
                                    }

                                    return (
                                      <button
                                        key={`${q.id}_match_${optIdx}`}
                                        type="button"
                                        onClick={() => handleSelectAnswer(q, opt)}
                                        className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${chipStyle}`}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Written Input */}
                            {q.type === 'written' && (
                              <div className="space-y-3">
                                <div className="text-xs font-bold text-sumi-muted">
                                  {q.direction === 'vi_to_ja'
                                    ? '✍️ Nhập từ vựng / mẫu ngữ pháp tiếng Nhật (chấp nhận cả Kanji hoặc cách đọc Hiragana/Romaji):'
                                    : '✍️ Nhập nghĩa tiếng Việt của thẻ này:'}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2.5">
                                  <input
                                    type="text"
                                    value={rec?.userAnswer || ''}
                                    onChange={(e) => handleWrittenChange(q, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleConfirmWritten(q);
                                      }
                                    }}
                                    placeholder={
                                      q.direction === 'vi_to_ja'
                                        ? 'Gõ câu trả lời tiếng Nhật...'
                                        : 'Gõ nghĩa tiếng Việt...'
                                    }
                                    className="flex-1 px-4 py-3 rounded-xl border border-line focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm font-semibold text-sumi"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmWritten(q)}
                                    className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shrink-0"
                                  >
                                    Xác nhận
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSkipQuestion(q)}
                                    className="px-4 py-3 rounded-xl bg-paper-100 hover:bg-paper-200 text-sumi-muted font-bold text-xs transition cursor-pointer shrink-0"
                                  >
                                    Không nhớ
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Instant Feedback Callout */}
                        {showFeedback && (
                          <div
                            className={`rounded-2xl p-4 border text-xs flex items-start justify-between gap-3 ${
                              rec.isCorrect
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-red-50 border-red-200 text-red-900'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="font-black">
                                {rec.isCorrect ? '✅ Chính xác!' : '❌ Chưa chính xác'}
                              </div>
                              {!rec.isCorrect && (
                                <div>
                                  Đáp án đúng:{' '}
                                  <strong className="underline">
                                    {q.type === 'true_false'
                                      ? `${q.correctAnswer === 'TRUE' ? 'Đúng' : 'Sai'} (${
                                          q.direction === 'ja_to_vi'
                                            ? q.card.meaning
                                            : q.card.frontText
                                        })`
                                      : q.correctAnswer}
                                  </strong>
                                </div>
                              )}
                              {q.card.explanation && (
                                <div className="text-sumi-muted mt-1">{q.card.explanation}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Submit Card */}
                <div className="bg-paper-50 rounded-3xl border border-line p-6 sm:p-8 text-center space-y-4 shadow-sm">
                  <div className="text-2xl">🏁</div>
                  <h3 className="text-lg font-black text-sumi">
                    Bạn đã hoàn thành {answeredCount} / {questions.length} câu hỏi
                  </h3>
                  <p className="text-xs text-sumi-muted max-w-md mx-auto">
                    Kiểm tra lại các câu trả lời của bạn trước khi nộp bài để xem điểm số và phân tích chi tiết từng thẻ.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSubmitTest(false)}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm shadow-md transition-all cursor-pointer"
                  >
                    Nộp bài kiểm tra & Xem kết quả ➔
                  </button>
                </div>
              </div>
            )}

            {/* ==================== PHASE 3: RESULT & REVIEW SCREEN ==================== */}
            {phase === 'result' && (
              <div className="space-y-8">
                {/* Hero Score Card */}
                <div className="bg-paper-50 rounded-3xl border border-line p-6 sm:p-8 shadow-sm">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                    {/* Left: Circular Score & Message */}
                    <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                      <div
                        className={`w-28 h-28 rounded-full border-8 flex flex-col items-center justify-center shrink-0 ${
                          resultStats.scorePercent >= 80
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                            : resultStats.scorePercent >= 50
                            ? 'border-amber-500 bg-amber-50 text-amber-900'
                            : 'border-red-500 bg-red-50 text-red-900'
                        }`}
                      >
                        <span className="text-3xl font-black">{resultStats.scorePercent}%</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          Điểm số
                        </span>
                      </div>

                      <div className="space-y-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold ${
                            resultStats.scorePercent >= 80
                              ? 'bg-emerald-100 text-emerald-800'
                              : resultStats.scorePercent >= 50
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {resultStats.scorePercent === 100
                            ? '🏆 Tuyệt đối! Nắm vững 100% kiến thức'
                            : resultStats.scorePercent >= 80
                            ? '🌟 Rất tốt! Bạn đã thuộc hầu hết bộ thẻ'
                            : resultStats.scorePercent >= 50
                            ? '💪 Khá ổn! Hãy ôn lại các thẻ còn nhầm lẫn'
                            : '📖 Cần ôn tập thêm để nhớ mặt chữ và nghĩa'}
                        </span>
                        <h2 className="text-2xl font-black text-sumi">
                          Kết quả bài kiểm tra: {setTitle}
                        </h2>
                        <p className="text-xs text-sumi-muted">
                          Thời gian hoàn thành: <strong>{formatTime(elapsedSeconds)}</strong> • Tổng số câu:{' '}
                          <strong>{resultStats.total} câu</strong>
                        </p>
                      </div>
                    </div>

                    {/* Right: Mini Stat Counters */}
                    <div className="grid grid-cols-3 gap-3 w-full md:w-auto shrink-0">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-center min-w-[90px]">
                        <div className="text-[11px] font-bold text-emerald-700 uppercase">Đúng</div>
                        <div className="text-2xl font-black text-emerald-900 mt-0.5">
                          {resultStats.correct}
                        </div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-center min-w-[90px]">
                        <div className="text-[11px] font-bold text-red-700 uppercase">Sai</div>
                        <div className="text-2xl font-black text-red-900 mt-0.5">
                          {resultStats.wrong}
                        </div>
                      </div>
                      <div className="bg-paper-100 border border-line rounded-2xl p-3.5 text-center min-w-[90px]">
                        <div className="text-[11px] font-bold text-sumi-muted uppercase">Bỏ qua</div>
                        <div className="text-2xl font-black text-sumi mt-0.5">
                          {resultStats.skipped}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-6 mt-6 border-t border-line">
                    {resultStats.correct < resultStats.total && (
                      <button
                        type="button"
                        onClick={handleRetakeMissedCards}
                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer flex items-center gap-2"
                      >
                        <span>🔥</span>
                        <span>
                          Kiểm tra lại {resultStats.total - resultStats.correct} câu chưa đúng
                        </span>
                      </button>
                    )}

                    {missedUnbookmarkedCount > 0 && (
                      <button
                        type="button"
                        disabled={bulkBookmarking}
                        onClick={() => void handleBookmarkAllMissed()}
                        className="px-4 py-3 rounded-xl bg-warning-soft hover:bg-warning/20 text-warning border border-warning/30 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <span>🔖</span>
                        <span>
                          {bulkBookmarking
                            ? 'Đang lưu...'
                            : `Bookmark tất cả câu sai (${missedUnbookmarkedCount})`}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleStartTest}
                      className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer flex items-center gap-2"
                    >
                      <span>🔄</span>
                      <span>Làm đề kiểm tra mới</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPhase('setup')}
                      className="px-4 py-3 rounded-xl bg-paper-100 hover:bg-paper-200 text-sumi font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>⚙️</span>
                      <span>Đổi cấu hình đề</span>
                    </button>

                    <Link
                      to="/flashcards/test/history"
                      className="px-4 py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🕒</span>
                      <span>Lịch sử tự đánh giá</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          isBookmarkSource
                            ? '/flashcards/study/0/Mixed?source=bookmark'
                            : `/flashcards/study/${isDemo ? 'demo' : currentTopicId}/${currentContentType.toLowerCase()}`
                        )
                      }
                      className="px-4 py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ml-auto"
                    >
                      <span>▶</span>
                      <span>Học lại bằng thẻ lật SRS</span>
                    </button>
                  </div>

                  {/* Save status banner */}
                  <div className="mt-4 pt-4 border-t border-line space-y-2">
                    {timedOut && (
                      <div className="text-xs font-semibold text-warning bg-warning-soft border border-warning/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
                        <span>⏳</span>
                        <span>Đã hết thời gian làm bài — hệ thống tự động nộp bài cho bạn.</span>
                      </div>
                    )}
                    {bulkBookmarkMessage && (
                      <div className="text-xs font-semibold text-warning bg-warning-soft border border-warning/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
                        <span>🔖</span>
                        <span>{bulkBookmarkMessage}</span>
                      </div>
                    )}
                    {isDemo ? (
                      <div className="text-xs text-sumi-muted flex items-center gap-2">
                        <span>🧪</span>
                        <span>Chế độ Demo — kết quả tự đánh giá không lưu vào lịch sử tài khoản.</span>
                      </div>
                    ) : savingResult ? (
                      <div className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin inline-block" />
                        <span>Đang lưu kết quả tự đánh giá...</span>
                      </div>
                    ) : savedAttemptId ? (
                      <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span>✓</span>
                          <span>
                            Đã lưu kết quả tự đánh giá (#{savedAttemptId}) vào Lịch sử Tự đánh giá.
                          </span>
                        </span>
                        <Link
                          to="/flashcards/test/history"
                          className="font-extrabold text-emerald-700 hover:underline shrink-0"
                        >
                          Xem lịch sử ➔
                        </Link>
                      </div>
                    ) : saveResultError ? (
                      <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <span>⚠️ {saveResultError}</span>
                        <button
                          type="button"
                          onClick={() => void persistQuizAttempt(questions, answers, elapsedSeconds)}
                          className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
                        >
                          Thử lưu lại
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Detailed Answer Review */}
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-sumi">
                    📋 Chi tiết đáp án từng câu ({questions.length} câu)
                  </h3>

                  <div className="space-y-4">
                    {questions.map((q) => {
                      const rec = answers[q.id];
                      const isCorrect = rec?.isCorrect ?? false;
                      const badge = getQuestionTypeBadge(q.type);

                      return (
                        <div
                          key={q.id}
                          className={`bg-paper-50 rounded-2xl border p-5 sm:p-6 space-y-4 ${
                            isCorrect ? 'border-emerald-200' : 'border-red-200'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                                  isCorrect
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {isCorrect ? '✓ Đúng' : rec?.isSkipped ? '⚪ Bỏ qua' : '✕ Sai'}
                              </span>
                              <span className="text-xs font-bold text-sumi-muted">
                                Câu {q.index}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${badge.color}`}
                              >
                                {badge.icon} {badge.label}
                              </span>
                            </div>

                            {/* Audio & Bookmark actions */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => playJapaneseAudio(q.card.frontText)}
                                className="px-2.5 py-1 rounded-lg bg-paper-100 hover:bg-blue-50 text-sumi text-xs font-bold transition cursor-pointer"
                              >
                                🔊 Nghe
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleBookmark(q.card)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                  q.card.isBookmarked
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-paper-50 text-sumi-muted border-line hover:bg-paper-100'
                                }`}
                              >
                                {q.card.isBookmarked ? '🔖 Đã lưu' : '☆ Lưu thẻ'}
                              </button>
                            </div>
                          </div>

                          {/* Card Info & Answer comparison */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-paper-100 rounded-xl p-4 space-y-1">
                              <div className="text-[11px] font-bold text-sumi-faint uppercase">
                                Thẻ gốc ({q.card.jlptLevel})
                              </div>
                              <div className="text-xl font-black text-sumi font-serif">
                                {q.card.frontText}
                              </div>
                              {q.card.readingOrFormation && (
                                <div className="text-xs font-mono text-blue-600">
                                  {q.card.readingOrFormation}
                                </div>
                              )}
                              <div className="text-sm font-bold text-sumi pt-1">
                                {q.card.meaning}
                              </div>
                              {q.card.exampleSentence && (
                                <div className="text-xs text-sumi-muted italic pt-1 border-t border-line mt-2">
                                  Ví dụ: {q.card.exampleSentence}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col justify-center space-y-2.5 text-xs">
                              {q.type === 'true_false' && (
                                <div className="text-sumi-muted">
                                  Mệnh đề kiểm tra:{' '}
                                  <strong>
                                    {q.promptText} = {q.displayedPairing}
                                  </strong>
                                </div>
                              )}

                              <div
                                className={`p-3 rounded-xl border ${
                                  isCorrect
                                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                    : 'bg-red-50/70 border-red-200 text-red-900'
                                }`}
                              >
                                <div className="text-[10px] font-bold uppercase opacity-75">
                                  Câu trả lời của bạn
                                </div>
                                <div className="text-sm font-black mt-0.5">
                                  {!rec || rec.isSkipped || !rec.userAnswer.trim()
                                    ? '(Chưa trả lời / Bỏ qua)'
                                    : q.type === 'true_false'
                                    ? rec.userAnswer === 'TRUE'
                                      ? 'Đúng (True)'
                                      : 'Sai (False)'
                                    : rec.userAnswer}
                                </div>
                              </div>

                              {!isCorrect && (
                                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                                  <div className="text-[10px] font-bold uppercase opacity-75">
                                    Đáp án đúng
                                  </div>
                                  <div className="text-sm font-black mt-0.5">
                                    {q.type === 'true_false'
                                      ? q.correctAnswer === 'TRUE'
                                        ? 'Đúng (True)'
                                        : 'Sai (False)'
                                      : q.correctAnswer}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

