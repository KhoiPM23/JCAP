import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { flashcardService } from '../../services/flashcardService';
import { DEMO_VOCAB_SET, DEMO_GRAMMAR_SET } from './demoFlashcardData';
import type {
  FlashcardSession,
  FlashcardCardItem,
  FlashcardRating,
  FlashcardSessionSummary,
} from '../../types/flashcard';

// Bóc tách câu ví dụ tiếng Nhật và phần dịch nghĩa tiếng Việt (nếu có)
const extractJapaneseSentence = (raw: string | null | undefined): { ja: string; vi?: string } => {
  if (!raw) return { ja: '' };

  const match = raw.match(/^(.*?)[(（](.*?)[)）]$/);
  if (match) {
    return {
      ja: match[1].trim(),
      vi: match[2].trim(),
    };
  }

  if (raw.includes(' - ')) {
    const parts = raw.split(' - ');
    return {
      ja: parts[0].trim(),
      vi: parts.slice(1).join(' - ').trim(),
    };
  }

  return { ja: raw.trim() };
};

// Chuẩn hóa văn bản tiếng Nhật để so khớp giọng nói
const normalizeJa = (str: string | null | undefined): string => {
  if (!str) return '';
  return str
    .replace(/[〜～・、。！？\s\(\)（）\-\+\/]/g, '')
    .trim()
    .toLowerCase();
};

export const FlashcardSessionView: React.FC = () => {
  const { topicId, contentType } = useParams<{ topicId: string; contentType: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isExtraPractice = searchParams.get('extraPractice') === 'true';
  const isDemo = topicId === 'demo' || topicId === '0';
  const currentTopicId = topicId && !isDemo ? parseInt(topicId, 10) : 101;
  const currentContentType = contentType?.toLowerCase() === 'grammar' ? 'Grammar' : 'Vocabulary';
  const isGrammar = currentContentType === 'Grammar';

  const MAX_RETRIES_PER_CARD = 2; // Mỗi thẻ được quay lại hàng đợi tối đa 2 lần trong phiên chính

  // Session & Queue State
  const [session, setSession] = useState<FlashcardSession | null>(null);
  const [queue, setQueue] = useState<FlashcardCardItem[]>([]);
  const [totalOriginalCards, setTotalOriginalCards] = useState<number>(0);
  const [resolvedCardsCount, setResolvedCardsCount] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [cardAgainMap, setCardAgainMap] = useState<Record<string, number>>({});
  const [leechCards, setLeechCards] = useState<FlashcardCardItem[]>([]);
  const [leechNotice, setLeechNotice] = useState<string | null>(null);
  const [isMiniRound, setIsMiniRound] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [summary, setSummary] = useState<FlashcardSessionSummary | null>(null);

  // Ratings tracking
  const [ratingCounts, setRatingCounts] = useState<{ again: number; good: number; easy: number }>({
    again: 0,
    good: 0,
    easy: 0,
  });

  // Pronunciation Practice & Audio State
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [speechFeedback, setSpeechFeedback] = useState<{ success: boolean; text: string } | null>(null);
  const recognitionRef = useRef<any>(null);
  const recordingTimeoutRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioTimeoutRef = useRef<any>(null);
  const lastTranscriptRef = useRef<string>('');

  // Start Session
  useEffect(() => {
    const initSession = async () => {
      setLoading(true);
      setCardAgainMap({});
      setLeechCards([]);
      setLeechNotice(null);
      setIsMiniRound(false);
      setResolvedCardsCount(0);

      // Chế độ Sandbox Demo: chạy 100% trên React state, tuyệt đối không gọi API backend
      if (isDemo) {
        const demoSet = currentContentType === 'Grammar' ? DEMO_GRAMMAR_SET : DEMO_VOCAB_SET;
        setSession({
          sessionId: 999999,
          sourceType: 'TopicSet',
          setTitle: demoSet.title,
          contentType: currentContentType,
          isExtraPractice: false,
          totalCardsInSession: demoSet.cards.length,
          remainingCardsCount: demoSet.cards.length,
          requeuedCount: 0,
          startedAt: new Date().toISOString(),
          cards: [...demoSet.cards],
        });
        setQueue([...demoSet.cards]);
        setTotalOriginalCards(demoSet.cards.length);
        setCurrentIndex(0);
        setIsCompleted(false);
        setRatingCounts({ again: 0, good: 0, easy: 0 });
        setLoading(false);
        return;
      }

      const res = await flashcardService.startSession({
        sourceType: 'TopicSet',
        topicId: currentTopicId,
        contentType: currentContentType,
        isExtraPractice,
      });

      if (res.success && res.data) {
        const initialCards = Array.isArray(res.data.cards) ? res.data.cards : [];
        setSession(res.data);
        setQueue(initialCards);
        setTotalOriginalCards(initialCards.length);
      }
      setLoading(false);
    };

    initSession();
  }, [currentTopicId, currentContentType, isExtraPractice, isDemo]);

  // Current Card
  const currentCard: FlashcardCardItem | undefined = queue[currentIndex];

  // Dừng phát âm mẫu an toàn
  const stopAudio = useCallback(() => {
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setIsPlayingAudio(false);
  }, []);

  // Đánh giá giọng nói nhận diện được so với nội dung thẻ hiện tại
  const evaluateTranscript = useCallback((rawTranscript: string, card: FlashcardCardItem, isGrammarCard: boolean) => {
    const transcript = (rawTranscript || '').trim();
    if (!transcript) {
      setSpeechFeedback({
        success: false,
        text: 'Chưa nhận diện được từ nào. Hãy bấm và thử nói to rõ hơn nhé!',
      });
      return;
    }

    if (isGrammarCard && card.exampleSentence) {
      const { ja } = extractJapaneseSentence(card.exampleSentence);
      const targetNorm = normalizeJa(ja);
      const transcriptNorm = normalizeJa(transcript);

      const isMatch =
        transcriptNorm === targetNorm ||
        (targetNorm && transcriptNorm.includes(targetNorm)) ||
        (transcriptNorm && targetNorm.includes(transcriptNorm));

      if (isMatch) {
        setSpeechFeedback({
          success: true,
          text: `🎉 Rất tốt! Nhận diện: "${transcript}" (Khớp câu ví dụ)`,
        });
      } else {
        setSpeechFeedback({
          success: false,
          text: `Nhận diện: "${transcript}". Câu mẫu: "${ja}". Hãy thử nói lại nhé!`,
        });
      }
      return;
    }

    const target = normalizeJa(card.frontText);
    const reading = normalizeJa(card.readingOrFormation || '');
    const norm = normalizeJa(transcript);

    if (
      (target && (norm.includes(target) || target.includes(norm))) ||
      (reading && (norm.includes(reading) || reading.includes(norm)))
    ) {
      setSpeechFeedback({
        success: true,
        text: `🎉 Rất tốt! Nhận diện: "${transcript}" (Khớp 100%)`,
      });
    } else {
      setSpeechFeedback({
        success: false,
        text: `Nhận diện: "${transcript}". Bạn hãy thử phát âm lại rõ hơn nhé!`,
      });
    }
  }, []);

  // Dừng nhận diện giọng nói an toàn (Thủ công / Timeout / Cleanup / Hoàn thành)
  const stopVoicePractice = useCallback((reason?: 'manual' | 'timeout' | 'cleanup' | 'success' | 'final') => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        if (reason === 'cleanup') {
          recognitionRef.current.abort();
        } else {
          recognitionRef.current.stop();
        }
      } catch {
        // Ignore if already stopped
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Lật thẻ an toàn: tự hủy âm thanh mẫu và dừng mic nếu đang bật
  const handleToggleFlip = useCallback(() => {
    stopAudio();
    stopVoicePractice('cleanup');
    setIsFlipped((f) => !f);
  }, [stopAudio, stopVoicePractice]);

  // Dọn dẹp âm thanh & mic khi chuyển thẻ hoặc unmount
  useEffect(() => {
    stopAudio();
    stopVoicePractice('cleanup');
    lastTranscriptRef.current = '';
    setSpeechFeedback(null);
  }, [currentIndex, stopAudio, stopVoicePractice]);

  // Hủy âm thanh & mic khi rời khỏi trang
  useEffect(() => {
    return () => {
      stopAudio();
      stopVoicePractice('cleanup');
      lastTranscriptRef.current = '';
    };
  }, [stopAudio, stopVoicePractice]);

  // Phát âm mẫu (Khóa chéo: chặn khi mic đang thu âm HOẶC khi đang phát)
  const playAudio = useCallback(
    (text: string) => {
      if (isRecording || isPlayingAudio || !text) return;

      if ('speechSynthesis' in window) {
        stopAudio();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        utteranceRef.current = utterance;

        // Kích hoạt ngay trạng thái isPlayingAudio để khóa chéo nút Thử phát âm lập tức
        setIsPlayingAudio(true);

        utterance.onstart = () => {
          setIsPlayingAudio(true);
        };
        utterance.onend = () => {
          setIsPlayingAudio(false);
          utteranceRef.current = null;
          if (audioTimeoutRef.current) {
            clearTimeout(audioTimeoutRef.current);
            audioTimeoutRef.current = null;
          }
        };
        utterance.onerror = () => {
          setIsPlayingAudio(false);
          utteranceRef.current = null;
          if (audioTimeoutRef.current) {
            clearTimeout(audioTimeoutRef.current);
            audioTimeoutRef.current = null;
          }
        };

        // Fallback an toàn phòng khi trình duyệt nuốt sự kiện onend
        const timeoutDuration = Math.max(2500, Math.min(8000, text.length * 600));
        audioTimeoutRef.current = setTimeout(() => {
          setIsPlayingAudio(false);
          utteranceRef.current = null;
        }, timeoutDuration);

        window.speechSynthesis.speak(utterance);
      }
    },
    [isRecording, isPlayingAudio, stopAudio]
  );

  // Phát âm mục tiêu: Với ngữ pháp phát âm câu ví dụ mẫu; với từ vựng phát âm từ vựng
  const playTargetAudio = useCallback(() => {
    if (!currentCard) return;
    if (isGrammar) {
      if (!isFlipped) return; // Không phát khi ở mặt trước để tránh lộ bài
      const { ja } = extractJapaneseSentence(currentCard.exampleSentence);
      if (ja) {
        playAudio(ja);
      } else {
        playAudio(currentCard.frontText);
      }
    } else {
      playAudio(currentCard.frontText);
    }
  }, [currentCard, isGrammar, isFlipped, playAudio]);

  // Luyện phát âm trực tiếp với Web Speech API (Dừng ngay khi nhận diện khớp, Hiển thị từ/câu đã nhận diện khi dừng)
  const handleVoicePractice = useCallback(() => {
    if (!currentCard) return;

    // 1. Khóa chéo: Nếu đang phát âm mẫu HOẶC đang ở mặt trước của thẻ ngữ pháp
    if (isPlayingAudio || (isGrammar && !isFlipped)) {
      return;
    }

    // Xác định mục tiêu nhận diện (Với ngữ pháp: câu ví dụ mẫu; với từ vựng: frontText)
    const targetJaText = isGrammar && currentCard.exampleSentence
      ? extractJapaneseSentence(currentCard.exampleSentence).ja
      : currentCard.frontText;

    // 2. Nếu đang thu âm -> Bấm nút / Ấn [M] để Dừng thủ công (Hiển thị ngay từ/câu đã nhận diện)
    if (isRecording) {
      stopVoicePractice('manual');
      if (lastTranscriptRef.current) {
        evaluateTranscript(lastTranscriptRef.current, currentCard, isGrammar);
      } else {
        setSpeechFeedback({
          success: false,
          text: 'Đã dừng thu âm (Chưa phát hiện giọng nói). Hãy bấm để thử lại!',
        });
      }
      return;
    }

    // 3. Khóa chéo phòng hờ & reset bộ nhớ nhận diện
    stopAudio();
    lastTranscriptRef.current = '';
    setSpeechFeedback(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Giả lập nhận diện thông minh nếu trình duyệt không hỗ trợ Web Speech API native (Firefox, Safari...)
      setIsRecording(true);
      lastTranscriptRef.current = targetJaText;
      const simTimer = setTimeout(() => {
        setIsRecording(false);
        evaluateTranscript(targetJaText, currentCard, isGrammar);
      }, 1500);
      recordingTimeoutRef.current = simTimer;
      return;
    }

    try {
      let hasFinished = false;
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.interimResults = true; // Bật interimResults để nhận diện và bắt từ tức thì theo thời gian thực
      recognition.continuous = false; // Tự động kết thúc sau khi nói 1 câu/từ
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = (event: any) => {
        if (hasFinished) return;

        // Trích xuất toàn bộ văn bản nhận diện được từ các đoạn kết quả
        let currentFullTranscript = '';
        let isFinalSegment = false;
        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          currentFullTranscript += res[0].transcript;
          if (res.isFinal) {
            isFinalSegment = true;
          }
        }
        currentFullTranscript = currentFullTranscript.trim();
        if (currentFullTranscript) {
          lastTranscriptRef.current = currentFullTranscript;
        }

        const normTarget = normalizeJa(targetJaText);
        const normTranscript = normalizeJa(currentFullTranscript);

        // 1. NẾU NHẬN DIỆN KHỚP MỤC TIÊU -> DỪNG THU ÂM NGAY LẬP TỨC!
        const isMatch =
          normTranscript === normTarget ||
          (normTarget && normTranscript.includes(normTarget)) ||
          (normTranscript && normTarget.includes(normTranscript));

        if (isMatch) {
          hasFinished = true;
          stopVoicePractice('success');
          evaluateTranscript(currentFullTranscript, currentCard, isGrammar);
          return;
        }

        // 2. NẾU ĐOẠN PHÁT ÂM ĐÃ HOÀN TẤT (isFinal) -> DỪNG VÀ ĐÁNH GIÁ NGAY LẬP TỨC
        if (isFinalSegment && currentFullTranscript) {
          hasFinished = true;
          stopVoicePractice('final');
          evaluateTranscript(currentFullTranscript, currentCard, isGrammar);
          return;
        }
      };

      recognition.onerror = (event: any) => {
        if (hasFinished) return;
        hasFinished = true;

        stopVoicePractice('cleanup');

        const err = event?.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setSpeechFeedback({
            success: false,
            text: 'Vui lòng cấp quyền truy cập Micro trên trình duyệt để luyện phát âm.',
          });
        } else if (err === 'no-speech') {
          if (lastTranscriptRef.current) {
            evaluateTranscript(lastTranscriptRef.current, currentCard, isGrammar);
          } else {
            setSpeechFeedback({
              success: false,
              text: 'Không phát hiện âm thanh giọng nói. Hãy bấm và nói to rõ hơn nhé!',
            });
          }
        } else {
          if (lastTranscriptRef.current) {
            evaluateTranscript(lastTranscriptRef.current, currentCard, isGrammar);
          } else {
            setSpeechFeedback({
              success: false,
              text: 'Không thể nhận diện âm thanh. Vui lòng bấm thử lại!',
            });
          }
        }
      };

      recognition.onend = () => {
        if (hasFinished) return;
        hasFinished = true;

        stopVoicePractice('cleanup');
        if (lastTranscriptRef.current) {
          evaluateTranscript(lastTranscriptRef.current, currentCard, isGrammar);
        }
      };

      // Đặt ngay trạng thái isRecording để khóa chéo nút Nghe mẫu ngay lập tức
      setIsRecording(true);
      recognition.start();

      // Timeout chính xác 10 giây (10000ms): Sau 10s tự dừng và đánh giá từ đã nhận diện được
      recordingTimeoutRef.current = setTimeout(() => {
        if (hasFinished) return;
        hasFinished = true;

        stopVoicePractice('timeout');
        if (lastTranscriptRef.current) {
          evaluateTranscript(lastTranscriptRef.current, currentCard, isGrammar);
        } else {
          setSpeechFeedback({
            success: false,
            text: 'Đã hết thời gian chờ (10s). Hãy bấm thử lại và nói rõ hơn nhé!',
          });
        }
      }, 10000);
    } catch {
      setIsRecording(false);
      recognitionRef.current = null;
      setSpeechFeedback({
        success: false,
        text: 'Không thể khởi động Micro. Vui lòng kiểm tra cài đặt thiết bị của bạn.',
      });
    }
  }, [currentCard, isGrammar, isFlipped, isRecording, isPlayingAudio, stopAudio, stopVoicePractice, evaluateTranscript]);

  // Đánh giá SRS (Giới hạn tối đa 2 lần quay lại hàng đợi; lần 3 chọn Again đánh dấu Leech; cố định mẫu số gốc)
  const handleRate = useCallback(
    async (rating: FlashcardRating) => {
      if (!currentCard || !session) return;

      const cardKey = `${currentCard.itemType}_${currentCard.itemId}`;
      const prevAgainForCard = cardAgainMap[cardKey] || 0;

      const newAgain = rating === 'Again' ? ratingCounts.again + 1 : ratingCounts.again;
      const newGood = rating === 'Good' ? ratingCounts.good + 1 : ratingCounts.good;
      const newEasy = rating === 'Easy' ? ratingCounts.easy + 1 : ratingCounts.easy;

      // Cập nhật thống kê
      setRatingCounts({
        again: newAgain,
        good: newGood,
        easy: newEasy,
      });

      // Chỉ gọi API đánh giá khi KHÔNG phải chế độ Sandbox Demo và KHÔNG phải Mini-round (ôn nhanh thẻ Leech miễn phí)
      if (!isDemo && !isMiniRound) {
        await flashcardService.rateCard(session.sessionId, {
          itemType: currentCard.itemType,
          itemId: currentCard.itemId,
          rating,
        });
      }

      let shouldRequeue = false;
      let updatedLeechCards = leechCards;

      if (rating === 'Again') {
        const nextAgainCount = prevAgainForCard + 1;
        setCardAgainMap((prev) => ({ ...prev, [cardKey]: nextAgainCount }));

        if (nextAgainCount <= MAX_RETRIES_PER_CARD) {
          // Lần 1 hoặc Lần 2 chọn Again -> Đưa thẻ về cuối hàng đợi để ôn lại
          shouldRequeue = true;
          setQueue((prev) => [...prev, currentCard]);
          setLeechNotice(null);
        } else {
          // Lần thứ 3 chọn Again -> Chạm trần giới hạn, KHÔNG đưa vào hàng đợi nữa mà đánh dấu Leech
          shouldRequeue = false;
          setResolvedCardsCount((prev) => Math.min(totalOriginalCards, prev + 1));
          const alreadyInLeech = leechCards.some(
            (c) => c.itemType === currentCard.itemType && c.itemId === currentCard.itemId
          );
          if (!alreadyInLeech) {
            updatedLeechCards = [...leechCards, currentCard];
            setLeechCards(updatedLeechCards);
          }
          setLeechNotice(
            `📌 Thẻ "${currentCard.frontText}" đã vượt quá ${MAX_RETRIES_PER_CARD} lần lặp lại và được chuyển vào danh sách Cần chú ý cuối phiên.`
          );
        }
      } else {
        // Chọn Good hoặc Easy -> Thẻ đã hoàn thành
        setResolvedCardsCount((prev) => Math.min(totalOriginalCards, prev + 1));
        setLeechNotice(null);
      }

      const nextQueueLength = shouldRequeue ? queue.length + 1 : queue.length;

      // Chuyển thẻ tiếp theo
      if (currentIndex + 1 < nextQueueLength) {
        setIsFlipped(false);
        setSpeechFeedback(null);
        setCurrentIndex((prev) => prev + 1);
      } else {
        // Hoàn thành phiên học
        setIsCompleted(true);
        if (isDemo || isMiniRound) {
          const demoSet = currentContentType === 'Grammar' ? DEMO_GRAMMAR_SET : DEMO_VOCAB_SET;
          setSummary({
            sessionId: 999999,
            sourceType: 'TopicSet',
            setTitle: demoSet.title,
            contentType: currentContentType,
            isExtraPractice: false,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            totalReviewed: newAgain + newGood + newEasy,
            againCount: newAgain,
            goodCount: newGood,
            easyCount: newEasy,
            difficultItems: updatedLeechCards.map((c, idx) => ({
              logId: idx + 1,
              itemType: c.itemType,
              itemId: c.itemId,
              frontText: c.frontText,
              meaning: c.meaning,
              rating: 'Again',
              isNewCard: true,
              intervalBefore: 0,
              intervalAfter: 1,
              reviewedAt: new Date().toISOString(),
            })),
            durationSeconds: 30,
          });
        } else {
          const summaryRes = await flashcardService.getSessionSummary(session.sessionId);
          if (summaryRes.success && summaryRes.data) {
            setSummary(summaryRes.data);
          }
        }
      }
    },
    [
      currentCard,
      session,
      currentIndex,
      queue.length,
      isDemo,
      isMiniRound,
      currentContentType,
      ratingCounts,
      cardAgainMap,
      leechCards,
      totalOriginalCards,
    ]
  );

  // Bắt đầu Mini-round ôn nhanh các thẻ Leech (không tốn Credit)
  const handleStartMiniRound = useCallback(() => {
    if (leechCards.length === 0) return;
    setQueue([...leechCards]);
    setTotalOriginalCards(leechCards.length);
    setResolvedCardsCount(0);
    setCurrentIndex(0);
    setCardAgainMap({});
    setLeechNotice(null);
    setIsMiniRound(true);
    setIsCompleted(false);
    setIsFlipped(false);
    setSpeechFeedback(null);
  }, [leechCards]);

  // Toggle Bookmark
  const handleToggleBookmark = useCallback(() => {
    if (!currentCard) return;
    currentCard.isBookmarked = !currentCard.isBookmarked;
    setQueue([...queue]);
  }, [currentCard, queue]);

  // Bắt phím tắt bàn phím: Space (Lật), 1/2/3 (Đánh giá), A (Nghe), M (Thử nói), B (Bookmark), Esc (Thoát)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleFlip();
      } else if (e.key === '1') {
        e.preventDefault();
        handleRate('Again');
      } else if (e.key === '2') {
        e.preventDefault();
        handleRate('Good');
      } else if (e.key === '3') {
        e.preventDefault();
        handleRate('Easy');
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        // Khóa chéo phím [A] khi mic đang thu âm HOẶC loa đang phát HOẶC thẻ ngữ pháp chưa lật
        if (isGrammar && !isFlipped) return;
        if (!isRecording && !isPlayingAudio && currentCard) {
          playTargetAudio();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        // Khóa chéo phím [M] khi loa đang phát âm mẫu HOẶC thẻ ngữ pháp chưa lật
        if (isGrammar && !isFlipped) return;
        if (!isPlayingAudio) {
          handleVoicePractice();
        }
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleToggleBookmark();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        navigate('/flashcards');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCompleted,
    handleRate,
    currentCard,
    playTargetAudio,
    handleVoicePractice,
    handleToggleBookmark,
    navigate,
    isRecording,
    isPlayingAudio,
    handleToggleFlip,
    isGrammar,
    isFlipped,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-[#2563EB] rounded-full animate-spin" />
        <p className="text-slate-600 font-bold text-sm">Đang chuẩn bị bộ thẻ cho bạn...</p>
      </div>
    );
  }

  // Trường hợp không có thẻ nào trong phiên học
  if (!session || queue.length === 0) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 shadow-lg text-center space-y-6">
          <div className="w-20 h-20 bg-blue-50 border border-blue-200 text-blue-600 rounded-full flex items-center justify-center text-4xl mx-auto">
            🗂️
          </div>
          <div>
            <h2 className="text-xl font-black text-[#071A44]">Không có thẻ nào trong phiên học</h2>
            <p className="text-xs text-slate-500 mt-2">
              Chưa có thẻ nào đến hạn ôn tập hoặc bộ thẻ này hiện chưa có thẻ nào trong cơ sở dữ liệu.
            </p>
          </div>
          <button
            onClick={() => navigate('/flashcards')}
            className="w-full py-3 bg-[#2563EB] hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-xs cursor-pointer"
          >
            Quay lại danh sách bộ thẻ
          </button>
        </div>
      </div>
    );
  }

  // ==================== MÀN HÌNH HOÀN THÀNH PHIÊN ====================
  if (isCompleted || !currentCard) {
    const total = ratingCounts.again + ratingCounts.good + ratingCounts.easy;
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200 p-8 shadow-lg text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto">
            🎉
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#071A44]">
              {isMiniRound ? 'Hoàn thành Mini-round!' : 'Hoàn thành phiên học!'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isMiniRound
                ? 'Bạn đã ôn nhanh xong các thẻ khó trong danh sách Cần chú ý.'
                : `Bạn đã hoàn thành ${totalOriginalCards} / ${totalOriginalCards} thẻ của phiên học này.`}
            </p>
          </div>

          {/* Thống kê đánh giá */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
            <div className="bg-red-50 p-2.5 rounded-xl border border-red-200">
              <div className="text-[10px] font-bold text-red-700 uppercase">Lượt Học lại</div>
              <div className="text-lg font-black text-red-900">{ratingCounts.again}</div>
            </div>
            <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-200">
              <div className="text-[10px] font-bold text-blue-700 uppercase">Tốt</div>
              <div className="text-lg font-black text-blue-900">{ratingCounts.good}</div>
            </div>
            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Dễ</div>
              <div className="text-lg font-black text-emerald-900">{ratingCounts.easy}</div>
            </div>
          </div>

          {/* Danh sách thẻ Leech (cần chú ý vì chọn Again > 2 lần) */}
          {leechCards.length > 0 && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl text-left space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                  <span>📌</span>
                  <span>Danh sách thẻ cần chú ý (Leech — {leechCards.length} thẻ)</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900">
                  Chọn Học lại ≥ 3 lần
                </span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {leechCards.map((c) => (
                  <div
                    key={`${c.itemType}_${c.itemId}`}
                    className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-amber-200/80 text-xs"
                  >
                    <span className="font-black text-[#071A44]">{c.frontText}</span>
                    <span className="text-slate-600 font-medium truncate max-w-[220px]">{c.meaning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isDemo ? (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 font-semibold space-y-1">
              <div className="font-bold">🧪 Chế độ trải nghiệm thử (Sandbox)</div>
              <div className="text-[11px] text-blue-700">
                Bạn đã hoàn thành trọn vẹn luồng học mẫu! Toàn bộ tiến trình diễn ra trên RAM và tuyệt đối không ghi dữ liệu vào DB.
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Tổng cộng: <span className="font-bold text-slate-800">{total} lượt đánh giá</span>. Lịch ôn tập ngắt quãng (SRS) đã được cập nhật thành công!
            </div>
          )}

          <div className="space-y-2.5 pt-2">
            {leechCards.length > 0 && !isMiniRound && (
              <button
                onClick={handleStartMiniRound}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>⚡</span>
                <span>Ôn nhanh {leechCards.length} thẻ cần chú ý (Mini-round — Không tốn Credit)</span>
              </button>
            )}
            <button
              onClick={() => navigate('/flashcards')}
              className="w-full py-3 bg-[#2563EB] hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
            >
              ← Quay về danh sách bộ thẻ
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              ↻ Luyện tập lại bộ thẻ này từ đầu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== MÀN HÌNH LUYỆN TẬP FOCUS MODE ====================
  const currentCardKey = `${currentCard.itemType}_${currentCard.itemId}`;
  const currentCardRetryAttempt = cardAgainMap[currentCardKey] || 0;
  const pendingRetryCount = queue
    .slice(currentIndex)
    .filter((c) => (cardAgainMap[`${c.itemType}_${c.itemId}`] || 0) > 0).length;
  const safeTotalOriginal = Math.max(1, totalOriginalCards);
  const progressPercent = Math.min(100, Math.round((resolvedCardsCount / safeTotalOriginal) * 100));
  const isGrammarFront = isGrammar && !isFlipped;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between font-sans selection:bg-blue-100">

      {/* ==================== 1. TOP FOCUS HEADER (3 VÙNG + PROGRESS BAR SÁT ĐÁY) ==================== */}
      <header className="relative bg-white border-b border-slate-200 px-4 sm:px-6 py-3 min-h-[60px] flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        {/* VÙNG 1 (TRÁI): Nút thoát phiên */}
        <div className="flex items-center shrink-0 min-w-[120px] sm:w-64">
          <button
            onClick={() => navigate('/flashcards')}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Thoát phiên học và quay lại danh sách bộ thẻ [Esc]"
          >
            <span>✕</span>
            <span>Thoát phiên</span>
          </button>
        </div>

        {/* VÙNG 2 (GIỮA): Tiêu đề bài học đầy đủ & to rõ */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 sm:px-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
              {currentCard.jlptLevel}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                isGrammar
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {isGrammar ? '🧩 Ngữ pháp' : '📘 Từ vựng'}
            </span>
            <h2 className="text-sm sm:text-base font-black text-[#071A44] leading-tight">
              {session?.setTitle || 'Đang ôn tập'}
            </h2>
          </div>
        </div>

        {/* VÙNG 3 (PHẢI): Số thẻ hoàn thành và trạng thái */}
        <div className="flex items-center justify-end gap-2 shrink-0 min-w-[120px] sm:w-64">
          {/* Badge chế độ Sandbox hoặc Mini-round */}
          {isDemo && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300 hidden md:inline-block">
              🧪 SANDBOX
            </span>
          )}
          {isMiniRound && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 hidden md:inline-block">
              ⚡ MINI-ROUND
            </span>
          )}

          {/* Trạng thái ôn lại của thẻ hiện tại hoặc hàng đợi */}
          {currentCardRetryAttempt > 0 ? (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-300 animate-pulse">
              🔄 Ôn lại {currentCardRetryAttempt}/{MAX_RETRIES_PER_CARD}
            </span>
          ) : pendingRetryCount > 0 ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hidden sm:inline-block">
              🔄 {pendingRetryCount} chờ ôn
            </span>
          ) : leechCards.length > 0 && !isMiniRound ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hidden sm:inline-block">
              📌 {leechCards.length} cần chú ý
            </span>
          ) : null}

          {/* Số thẻ hoàn thành */}
          <div className="px-3 py-1 bg-slate-100/90 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-1 shadow-2xs">
            <span className="hidden sm:inline text-slate-500">Đã thuộc:</span>
            <strong className="text-[#071A44] font-black">
              {resolvedCardsCount}/{safeTotalOriginal}
            </strong>
          </div>
        </div>

        {/* ==================== THANH TIẾN ĐỘ SÁT ĐÁY HEADER ==================== */}
        <div className="absolute bottom-0 left-0 right-0 w-full bg-slate-100 h-[3px] overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isGrammar ? 'bg-purple-600' : 'bg-[#2563EB]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* ==================== 2. MAIN FLASHCARD WORKSPACE ==================== */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-4xl mx-auto w-full my-auto">
        {/* Thông báo khi có thẻ chạm trần giới hạn 2 lần lặp lại và chuyển vào Leech */}
        {leechNotice && (
          <div className="w-full max-w-[760px] mb-3 px-4 py-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
            <span>{leechNotice}</span>
            <button
              onClick={() => setLeechNotice(null)}
              className="text-amber-700 hover:text-amber-950 ml-3 font-black"
            >
              ✕
            </button>
          </div>
        )}

        {/* ==================== THẺ FLASHCARD TỐI GIẢN (PA3 - ULTRA-MINIMALIST QUIZLET STYLE) ==================== */}
        <div
          className="w-full max-w-[760px] h-[440px] cursor-pointer select-none"
          style={{ perspective: '1400px' }}
          onClick={handleToggleFlip}
        >
          <div
            className="relative w-full h-full"
            style={{
              transformStyle: 'preserve-3d',
              transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isFlipped ? 'rotateX(180deg)' : 'rotateX(0deg)',
            }}
          >
            {/* ==================== MẶT TRƯỚC (CHỈ HIỂN THỊ TỪ VỰNG / NGỮ PHÁP) ==================== */}
            <div
              className="absolute inset-0 w-full h-full bg-white rounded-3xl border border-slate-200/90 p-8 shadow-lg hover:shadow-xl transition-shadow flex flex-col justify-between"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              {/* Chỉ báo góc tối giản */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                  Mặt trước
                </span>
                {currentCard.isBookmarked && (
                  <span className="text-sm" title="Đã đánh dấu">
                    🔖
                  </span>
                )}
              </div>

              {/* Nội dung chính Mặt Trước: Duy nhất Từ / Ngữ pháp */}
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <h1
                  className={`text-5xl sm:text-6xl font-black tracking-wide leading-tight ${
                    isGrammar ? 'text-purple-950' : 'text-[#071A44]'
                  }`}
                >
                  {currentCard.frontText}
                </h1>
              </div>

              {/* Khoảng đệm đáy giữ cân đối trục dọc */}
              <div className="h-4" />
            </div>

            {/* ==================== MẶT SAU (CẤU TRÚC / CÁCH ĐỌC + NGHĨA + CÂU MẪU CHO NGỮ PHÁP) ==================== */}
            <div
              className={`absolute inset-0 w-full h-full bg-white rounded-3xl border-2 p-8 shadow-lg hover:shadow-xl transition-shadow flex flex-col justify-between ${
                isGrammar ? 'border-purple-200' : 'border-blue-200'
              }`}
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateX(180deg)',
              }}
            >
              {/* Chỉ báo góc tối giản + Từ loại nhẹ nhàng */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest ${
                    isGrammar ? 'text-purple-400' : 'text-blue-400'
                  }`}
                >
                  Mặt sau
                </span>
                {currentCard.partOfSpeech && (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200/80">
                    {currentCard.partOfSpeech}
                  </span>
                )}
              </div>

              {/* Nội dung chính Mặt Sau: Cách đọc / Cấu trúc + Nghĩa + Câu mẫu */}
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4 space-y-3">
                {currentCard.readingOrFormation && (
                  <div
                    className={`text-lg sm:text-xl font-bold ${
                      isGrammar ? 'text-purple-700' : 'text-blue-600'
                    }`}
                  >
                    {currentCard.readingOrFormation}
                  </div>
                )}

                <h2 className="text-3xl sm:text-4xl font-black text-[#071A44] leading-snug">
                  {currentCard.meaning}
                </h2>

                {/* Với thẻ Ngữ pháp: Hiển thị câu mẫu minh họa ngay bên dưới dịch nghĩa */}
                {isGrammar && currentCard.exampleSentence && (() => {
                  const { ja, vi } = extractJapaneseSentence(currentCard.exampleSentence);
                  return (
                    <div className="mt-3 px-5 py-3.5 bg-purple-50/70 border border-purple-200/90 rounded-2xl max-w-lg w-full text-center shadow-2xs">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 mb-1 flex items-center justify-center gap-1.5">
                        <span>💬</span>
                        <span>Câu mẫu minh họa</span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-purple-950 leading-relaxed">
                        {ja}
                      </div>
                      {vi && (
                        <div className="text-xs text-slate-600 font-medium mt-1">
                          {vi}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Khoảng đệm đáy giữ cân đối trục dọc */}
              <div className="h-4" />
            </div>
          </div>
        </div>

        {/* ==================== THANH CÔNG CỤ BÊN DƯỚI THẺ (ACTION TOOLBAR) ==================== */}
        <div className="w-full max-w-[760px] mt-3.5 flex flex-col items-center space-y-2">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 bg-white px-3 py-2 rounded-2xl border border-slate-200 shadow-2xs">
            {/* 1. Nút Nghe mẫu [A] */}
            <button
              onClick={playTargetAudio}
              disabled={isGrammarFront || isRecording || isPlayingAudio}
              title={
                isGrammarFront
                  ? 'Lật sang mặt sau để nghe phát âm câu mẫu [A]'
                  : isRecording
                  ? 'Đang thu âm giọng nói, tạm khóa phát âm mẫu'
                  : isPlayingAudio
                  ? 'Đang phát âm mẫu...'
                  : isGrammar
                  ? 'Nghe phát âm câu mẫu [A]'
                  : 'Nghe phát âm mẫu [A]'
              }
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                isGrammarFront
                  ? 'bg-slate-50 text-slate-300 border border-slate-200/60 cursor-not-allowed opacity-40'
                  : isRecording || isPlayingAudio
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer'
              }`}
            >
              <span>🔊</span>
              <span>
                {isPlayingAudio
                  ? 'Đang phát...'
                  : isGrammar
                  ? 'Nghe câu mẫu [A]'
                  : 'Nghe mẫu [A]'}
              </span>
            </button>

            {/* 2. Nút Thử phát âm / Dừng thu âm [M] */}
            <button
              onClick={handleVoicePractice}
              disabled={isGrammarFront || isPlayingAudio}
              title={
                isGrammarFront
                  ? 'Lật sang mặt sau để luyện nói câu mẫu [M]'
                  : isPlayingAudio
                  ? 'Đang phát âm mẫu, tạm khóa mic thu âm'
                  : isRecording
                  ? 'Bấm để dừng thu âm ngay lập tức [M]'
                  : isGrammar
                  ? 'Bấm để luyện phát âm câu mẫu (tự dừng khi nói xong) [M]'
                  : 'Bấm để thử phát âm (tự dừng sau 10s hoặc khi nói xong) [M]'
              }
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                isGrammarFront
                  ? 'bg-slate-50 text-slate-300 border border-slate-200/60 cursor-not-allowed opacity-40'
                  : isPlayingAudio
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                  : isRecording
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse shadow-sm ring-2 ring-rose-300 cursor-pointer'
                  : 'bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] border border-blue-200 cursor-pointer'
              }`}
            >
              <span>{isRecording ? '⏹️' : '🎙️'}</span>
              <span>
                {isRecording
                  ? 'Dừng thu âm [M]'
                  : isGrammar
                  ? 'Luyện nói câu mẫu [M]'
                  : 'Thử phát âm [M]'}
              </span>
            </button>

            {/* 3. Nút Đánh dấu [B] */}
            <button
              onClick={handleToggleBookmark}
              title="Đánh dấu thẻ này [B]"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border cursor-pointer ${
                currentCard.isBookmarked
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <span>{currentCard.isBookmarked ? '🔖' : '🏷️'}</span>
              <span>{currentCard.isBookmarked ? 'Đã đánh dấu [B]' : 'Đánh dấu [B]'}</span>
            </button>

            {/* 4. Nút Lật thẻ nhanh */}
            <button
              onClick={handleToggleFlip}
              title="Lật mặt thẻ [Space]"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔄</span>
              <span>{isFlipped ? 'Lật về Mặt trước' : 'Lật sang Mặt sau'}</span>
            </button>
          </div>

          {/* Trạng thái đang thu âm hoặc Phản hồi phát âm (nằm gọn dưới thanh công cụ) */}
          {isRecording && (
            <div className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              <span>
                Đang lắng nghe... Nói to rõ {isGrammar ? 'câu mẫu' : 'từ vựng'} (tối đa 10s). Bấm [M] hoặc bấm nút để dừng.
              </span>
            </div>
          )}

          {!isRecording && speechFeedback && (
            <div
              className={`text-xs font-bold px-3.5 py-1.5 rounded-full ${
                speechFeedback.success
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {speechFeedback.text}
            </div>
          )}
        </div>

        {/* ==================== KHUNG GIẢI THÍCH CHI TIẾT TÁCH RỜI BÊN DƯỚI (HIỆN KHI LẬT MẶT SAU) ==================== */}
        {isFlipped &&
          ((isGrammar && currentCard.explanation) ||
            (!isGrammar && (currentCard.explanation || currentCard.exampleSentence))) && (
            <div className="w-full max-w-[760px] mt-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs text-left text-xs space-y-2 transition-all">
              {/* Với từ vựng: hiển thị câu ví dụ minh họa (nếu có) */}
              {!isGrammar && currentCard.exampleSentence && (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">
                      Câu ví dụ minh họa
                    </div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">
                      {currentCard.exampleSentence}
                    </div>
                  </div>
                  <button
                    onClick={() => playAudio(currentCard.exampleSentence || '')}
                    disabled={isRecording || isPlayingAudio}
                    className={`px-2.5 py-1.5 border rounded-xl text-xs font-bold shrink-0 ${
                      isRecording || isPlayingAudio
                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 cursor-pointer'
                    }`}
                    title={
                      isRecording
                        ? 'Đang thu âm giọng nói, tạm khóa phát âm'
                        : isPlayingAudio
                        ? 'Đang phát âm...'
                        : 'Nghe câu ví dụ'
                    }
                  >
                    🔊 {isPlayingAudio ? 'Đang phát...' : 'Nghe ví dụ'}
                  </button>
                </div>
              )}

              {/* Giải thích chi tiết */}
              {currentCard.explanation && (
                <div
                  className={`text-slate-600 text-xs leading-relaxed ${
                    !isGrammar && currentCard.exampleSentence ? 'pt-2 border-t border-slate-100' : ''
                  }`}
                >
                  💡 <span className="font-bold text-slate-800">Giải thích:</span> {currentCard.explanation}
                </div>
              )}
            </div>
          )}

        {/* ==================== 3. SRS RATING BAR (3 Nút Đánh giá) ==================== */}
        <div className="w-full max-w-[760px] mt-6 space-y-3">
          <div className="text-center text-xs font-semibold text-slate-500">
            Đánh giá mức độ nhớ của bạn:
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* 1. AGAIN */}
            <button
              onClick={() => handleRate('Again')}
              className="py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-900 transition-all flex flex-col items-center justify-center gap-0.5 shadow-xs group cursor-pointer"
            >
              <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-sm bg-red-200 text-red-800 text-[10px] flex items-center justify-center font-black">1</span>
                <span>Cần học lại</span>
              </div>
              <div className="text-[11px] text-red-700 font-medium">
                {currentCardRetryAttempt < MAX_RETRIES_PER_CARD
                  ? `Lặp lại cuối phiên (${currentCardRetryAttempt + 1}/${MAX_RETRIES_PER_CARD})`
                  : 'Ghim vào Cần chú ý (Leech)'}
              </div>
            </button>

            {/* 2. GOOD */}
            <button
              onClick={() => handleRate('Good')}
              className="py-3 px-4 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 transition-all flex flex-col items-center justify-center gap-0.5 shadow-xs group"
            >
              <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-sm bg-blue-200 text-blue-800 text-[10px] flex items-center justify-center font-black">2</span>
                <span>Tốt</span>
              </div>
              <div className="text-[11px] text-blue-700 font-medium">
                Ôn lại sau {currentCard.intervalPreview.goodDays || 1} ngày
              </div>
            </button>

            {/* 3. EASY */}
            <button
              onClick={() => handleRate('Easy')}
              className="py-3 px-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 transition-all flex flex-col items-center justify-center gap-0.5 shadow-xs group"
            >
              <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-sm bg-emerald-200 text-emerald-800 text-[10px] flex items-center justify-center font-black">3</span>
                <span>Dễ</span>
              </div>
              <div className="text-[11px] text-emerald-700 font-medium">
                Ôn lại sau {currentCard.intervalPreview.easyDays || 3} ngày
              </div>
            </button>
          </div>
        </div>
      </main>

      {/* ==================== 4. KEYBOARD SHORTCUTS DOCK ==================== */}
      <footer className="py-4 px-6 bg-white border-t border-slate-200 flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded-md text-[10px] font-bold text-slate-800">Space</kbd>
            <span>Lật thẻ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded-md text-[10px] font-bold text-slate-800">1 / 2 / 3</kbd>
            <span>Đánh giá</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className={`px-2 py-0.5 border rounded-md text-[10px] font-bold ${
              isGrammarFront || isRecording || isPlayingAudio
                ? 'bg-slate-50 border-slate-200 text-slate-300'
                : 'bg-slate-100 border-slate-300 text-slate-800'
            }`}>A</kbd>
            <span className={isGrammarFront || isRecording || isPlayingAudio ? 'text-slate-400 line-through' : ''}>
              {isPlayingAudio ? 'Đang phát' : isGrammar ? 'Nghe câu mẫu' : 'Nghe mẫu'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className={`px-2 py-0.5 border rounded-md text-[10px] font-bold ${
              isGrammarFront || isPlayingAudio
                ? 'bg-slate-50 border-slate-200 text-slate-300'
                : isRecording
                ? 'bg-rose-100 border-rose-300 text-rose-900 animate-pulse'
                : 'bg-blue-100 border-blue-300 text-blue-900'
            }`}>M</kbd>
            <span className={isGrammarFront || isPlayingAudio ? 'text-slate-400 line-through' : isRecording ? 'text-rose-600 font-bold' : ''}>
              {isRecording ? 'Dừng nói' : isGrammar ? 'Luyện nói mẫu' : 'Thử nói'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded-md text-[10px] font-bold text-slate-800">B</kbd>
            <span>Đánh dấu</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded-md text-[10px] font-bold text-slate-800">Esc</kbd>
            <span>Thoát</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
