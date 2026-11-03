import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
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

export const FlashcardSessionView: React.FC = () => {
  const { topicId, contentType } = useParams<{ topicId: string; contentType: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { themeFor, isDark } = useTheme();

  const isExtraPractice = searchParams.get('extraPractice') === 'true';
  const isDemo = topicId === 'demo' || topicId === '0';
  const isDueReview = topicId === 'due';
  const currentTopicId = topicId && !isDemo && !isDueReview ? parseInt(topicId, 10) : 101;
  const queryContentType = searchParams.get('type') || searchParams.get('contentType');
  const rawContentType = contentType || queryContentType;
  const currentContentType = rawContentType?.toLowerCase() === 'grammar'
    ? 'Grammar'
    : rawContentType?.toLowerCase() === 'mixed'
    ? 'Mixed'
    : 'Vocabulary';
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
  const [isEarlyExit, setIsEarlyExit] = useState<boolean>(false);
  const [summary, setSummary] = useState<FlashcardSessionSummary | null>(null);

  // Ratings tracking
  const [ratingCounts, setRatingCounts] = useState<{ again: number; good: number; easy: number }>({
    again: 0,
    good: 0,
    easy: 0,
  });

  // Audio State
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);




  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioTimeoutRef = useRef<any>(null);


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

      const isBookmarkSource = searchParams.get('source') === 'bookmark';
      const res = await flashcardService.startSession({
        sourceType: isDueReview ? 'DueReview' : isBookmarkSource ? 'Bookmark' : 'TopicSet',
        topicId: isDueReview ? null : isBookmarkSource ? undefined : currentTopicId,
        contentType: currentContentType,
        isExtraPractice,
      });

      if (res.success && res.data) {
        const initialCards = Array.isArray(res.data.cards) ? res.data.cards : [];
        setSession(res.data);
        setQueue(initialCards);
        setTotalOriginalCards(res.data.totalCardsInSession || initialCards.length);
        if (res.data.previouslyReviewedCount) {
          setResolvedCardsCount(res.data.previouslyReviewedCount);
        }
      }
      setLoading(false);
    };

    initSession();
  }, [currentTopicId, currentContentType, isExtraPractice, isDemo, isDueReview]);

  // Current Card
  const currentCard: FlashcardCardItem | undefined = queue[currentIndex];
  // Với phiên hỗn hợp (Mixed), kiểm tra linh hoạt theo từng thẻ hiện tại
  const isCurrentCardGrammar = currentCard ? currentCard.itemType === 'Grammar' : isGrammar;

  // Dừng phát âm mẫu an toàn (chỉ hủy khi thực sự đang phát, tránh block Main Thread)
  const stopAudio = useCallback(() => {
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    if ('speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setIsPlayingAudio(false);
  }, []);

  // Lật thẻ an toàn: tự hủy âm thanh mẫu nếu đang phát
  const handleToggleFlip = useCallback(() => {
    stopAudio();
    setIsFlipped((f) => !f);
  }, [stopAudio]);

  // Dọn dẹp âm thanh khi chuyển thẻ hoặc unmount
  useEffect(() => {
    stopAudio();
  }, [currentIndex, stopAudio]);

  // Hủy âm thanh khi rời khỏi trang
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  // Phát âm mẫu
  const playAudio = useCallback(
    (text: string) => {
      if (isPlayingAudio || !text) return;

      if ('speechSynthesis' in window) {
        stopAudio();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        utteranceRef.current = utterance;

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

        const timeoutDuration = Math.max(2500, Math.min(8000, text.length * 600));
        audioTimeoutRef.current = setTimeout(() => {
          setIsPlayingAudio(false);
          utteranceRef.current = null;
        }, timeoutDuration);

        window.speechSynthesis.speak(utterance);
      }
    },
    [isPlayingAudio, stopAudio]
  );

  // Phát âm mục tiêu: Với ngữ pháp phát âm câu ví dụ mẫu; với từ vựng phát âm từ vựng
  const playTargetAudio = useCallback(() => {
    if (!currentCard) return;
    if (isCurrentCardGrammar) {
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
  }, [currentCard, isCurrentCardGrammar, isFlipped, playAudio]);

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
  }, [leechCards]);

  // Điều hướng duyệt thẻ trong chế độ Ôn tập tự do (Extra Practice)
  const handlePrevCard = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const handleFinishExtraPractice = useCallback(async () => {
    if (session?.sessionId && !isDemo) {
      try {
        const res = await flashcardService.getSessionSummary(session.sessionId);
        if (res.success && res.data) {
          setSummary(res.data);
        }
      } catch {}
    }
    setIsCompleted(true);
  }, [session, isDemo]);

  const handleNextCard = useCallback(() => {
    if (session?.sessionId && currentCard && !isDemo) {
      flashcardService.rateCard(session.sessionId, {
        itemId: currentCard.itemId,
        itemType: currentCard.itemType,
        rating: 'Good',
      }).catch(() => {});
    }

    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      handleFinishExtraPractice();
    }
  }, [currentIndex, queue.length, session, currentCard, isDemo, handleFinishExtraPractice]);

  // Toggle Bookmark (Đồng bộ Backend SQL Server qua API /api/bookmarks/toggle)
  const handleToggleBookmark = useCallback(async () => {
    if (!currentCard) return;
    const prevStatus = !!currentCard.isBookmarked;
    const targetItemType = currentCard.itemType;
    const targetItemId = currentCard.itemId;

    // Optimistic UI update
    currentCard.isBookmarked = !prevStatus;
    setQueue([...queue]);

    if (!isDemo) {
      const res = await flashcardService.toggleBookmark(targetItemType, targetItemId);
      if (!res.success) {
        // Rollback
        currentCard.isBookmarked = prevStatus;
        setQueue([...queue]);
      } else if (res.data) {
        currentCard.isBookmarked = res.data.isBookmarked;
        setQueue([...queue]);
      }
    }
  }, [currentCard, queue, isDemo]);

  // Xử lý thoát phiên giữa chừng và lưu trữ tiến độ các thẻ đã ôn
  const handleExitSession = useCallback(async () => {
    if (isCompleted || isDemo) {
      navigate('/flashcards');
      return;
    }

    const totalRated = ratingCounts.again + ratingCounts.good + ratingCounts.easy;

    // Nếu chưa đánh giá thẻ nào -> dọn phiên rỗng và trở về danh sách
    if (totalRated === 0) {
      if (session?.sessionId) {
        try {
          await flashcardService.getSessionSummary(session.sessionId, true);
        } catch {}
      }
      navigate('/flashcards');
      return;
    }

    // Nếu đã đánh giá >= 1 thẻ -> chốt trạng thái dừng giữa chừng (isEarlyExit: true)
    if (session?.sessionId) {
      try {
        const summaryRes = await flashcardService.getSessionSummary(session.sessionId, true);
        if (summaryRes.success && summaryRes.data) {
          setSummary(summaryRes.data);
        }
      } catch {}
    }

    setIsEarlyExit(true);
    setIsCompleted(true);
  }, [isCompleted, isDemo, ratingCounts, session, navigate]);

  // Bắt phím tắt bàn phím: Space (Lật), 1/2/3 (Đánh giá), A (Nghe), B (Bookmark), Esc (Thoát)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleFlip();
      } else if (isExtraPractice && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevCard();
      } else if (isExtraPractice && (e.key === 'ArrowRight' || e.key === 'Enter')) {
        e.preventDefault();
        handleNextCard();
      } else if (!isExtraPractice && e.key === '1') {
        e.preventDefault();
        handleRate('Again');
      } else if (!isExtraPractice && e.key === '2') {
        e.preventDefault();
        handleRate('Good');
      } else if (!isExtraPractice && e.key === '3') {
        e.preventDefault();
        handleRate('Easy');
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        // Khóa phím [A] khi thẻ ngữ pháp chưa lật
        if (isGrammar && !isFlipped) return;
        if (!isPlayingAudio && currentCard) {
          playTargetAudio();
        }
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleToggleBookmark();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleExitSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCompleted,
    handleRate,
    handlePrevCard,
    handleNextCard,
    isExtraPractice,
    currentCard,
    playTargetAudio,
    handleToggleBookmark,
    handleExitSession,
    navigate,
    isPlayingAudio,
    handleToggleFlip,
    isGrammar,
    isFlipped,
  ]);

  if (loading) {
    return (
      <div data-theme={themeFor('learn')} className="min-h-screen bg-paper-100 flex flex-col items-center justify-center space-y-4 text-sumi">
        <div className="w-12 h-12 border-4 border-line border-t-ai rounded-full animate-spin" />
        <p className="text-sumi-muted font-bold text-sm">Đang chuẩn bị bộ thẻ cho bạn...</p>
      </div>
    );
  }

  // Trường hợp không có thẻ nào trong phiên học
  if (!session || queue.length === 0) {
    return (
      <div data-theme={themeFor('learn')} className="min-h-screen bg-paper-100 flex items-center justify-center p-4 font-sans text-sumi">
        <div className="max-w-md w-full bg-paper-50 rounded-3xl border border-line p-8 shadow-lg text-center space-y-6">
          <div className="w-20 h-20 bg-ai-soft border border-ai/30 text-ai rounded-full flex items-center justify-center text-4xl mx-auto">
            🗂️
          </div>
          <div>
            <h2 className="text-xl font-black text-sumi">Không có thẻ nào trong phiên học</h2>
            <p className="text-xs text-sumi-muted mt-2">
              Chưa có thẻ nào đến hạn ôn tập hoặc bộ thẻ này hiện chưa có thẻ nào trong cơ sở dữ liệu.
            </p>
          </div>
          <button
            onClick={() => navigate('/flashcards')}
            className="w-full py-3 bg-ai hover:bg-ai-hover text-on-ai font-bold rounded-xl text-sm transition-all shadow-xs cursor-pointer"
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
      <div data-theme={themeFor('learn')} className="min-h-screen bg-paper-100 flex items-center justify-center p-4 font-sans text-sumi">
        <div className="max-w-lg w-full bg-paper-50 rounded-3xl border border-line p-8 shadow-lg text-center space-y-6">
          <div className="w-20 h-20 bg-success-soft border border-success/30 text-success rounded-full flex items-center justify-center text-4xl mx-auto">
            🎉
          </div>
          <div>
            <h2 className="text-2xl font-black text-sumi">
              {isEarlyExit
                ? 'Đã tạm dừng phiên học'
                : isExtraPractice
                ? 'Hoàn thành ôn tập tự do!'
                : isMiniRound
                ? 'Hoàn thành Mini-round!'
                : 'Hoàn thành phiên học!'}
            </h2>
            <p className="text-xs text-sumi-muted mt-1">
              {isEarlyExit
                ? 'Tiến độ của các thẻ bạn vừa ôn đã được lưu lại an toàn vào lịch trình SRS.'
                : isExtraPractice
                ? `Bạn đã duyệt qua toàn bộ ${queue.length} thẻ trong phiên ôn tập tự do này.`
                : isMiniRound
                ? 'Bạn đã ôn nhanh xong các thẻ khó trong danh sách Cần chú ý.'
                : `Bạn đã hoàn thành ${totalOriginalCards} / ${totalOriginalCards} thẻ của phiên học này.`}
            </p>
          </div>

          {/* Thống kê số thẻ đã ôn & chưa ôn khi thoát giữa chừng */}
          {isEarlyExit && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-paper-100/60 rounded-2xl border border-line text-center">
              <div className="bg-success-soft/30 p-3 rounded-xl border border-success/30">
                <div className="text-[10px] font-bold text-success uppercase">Đã ghi nhận SRS</div>
                <div className="text-xl font-black text-sumi">
                  {summary?.reviewedCardsCount ?? resolvedCardsCount} thẻ
                </div>
              </div>
              <div className="bg-warning-soft/30 p-3 rounded-xl border border-warning/30">
                <div className="text-[10px] font-bold text-warning uppercase">Chưa ôn trong phiên</div>
                <div className="text-xl font-black text-sumi">
                  {summary?.unreviewedCardsCount ?? Math.max(0, totalOriginalCards - resolvedCardsCount)} thẻ
                </div>
              </div>
            </div>
          )}

          {/* Thống kê đánh giá */}
          {isExtraPractice ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 p-4 bg-paper-100/60 rounded-2xl border border-line text-center">
                <div className="bg-ai-soft/30 p-3 rounded-xl border border-ai/30">
                  <div className="text-[10px] font-bold text-ai uppercase">Số thẻ đã xem</div>
                  <div className="text-xl font-black text-sumi">{queue.length} thẻ</div>
                </div>
                <div className="bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
                  <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">Chế độ</div>
                  <div className="text-xs font-black text-sumi mt-1">Ôn tự do (Freeze SRS)</div>
                </div>
              </div>
              <div className="p-3 bg-success-soft/30 border border-success/30 rounded-xl text-xs text-success text-center font-medium">
                ✨ Lịch trình nhắc nhở SRS của các thẻ vẫn được bảo toàn nguyên vẹn!
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 p-4 bg-paper-100/60 rounded-2xl border border-line text-center">
              <div className="bg-danger-soft/40 p-2.5 rounded-xl border border-danger/30">
                <div className="text-[10px] font-bold text-danger uppercase">Lượt Học lại</div>
                <div className="text-lg font-black text-danger">{ratingCounts.again}</div>
              </div>
              <div className="bg-ai-soft/40 p-2.5 rounded-xl border border-ai/30">
                <div className="text-[10px] font-bold text-ai uppercase">Tốt</div>
                <div className="text-lg font-black text-ai">{ratingCounts.good}</div>
              </div>
              <div className="bg-success-soft/40 p-2.5 rounded-xl border border-success/30">
                <div className="text-[10px] font-bold text-success uppercase">Dễ</div>
                <div className="text-lg font-black text-success">{ratingCounts.easy}</div>
              </div>
            </div>
          )}

          {/* Danh sách thẻ Leech (cần chú ý vì chọn Again > 2 lần) */}
          {!isExtraPractice && leechCards.length > 0 && (
            <div className="p-4 bg-warning-soft/30 border border-warning/30 rounded-2xl text-left space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-warning flex items-center gap-1.5">
                  <span>📌</span>
                  <span>Danh sách thẻ cần chú ý (Leech — {leechCards.length} thẻ)</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning/30">
                  Chọn Học lại ≥ 3 lần
                </span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {leechCards.map((c) => (
                  <div
                    key={`${c.itemType}_${c.itemId}`}
                    className="flex items-center justify-between bg-paper-50 px-3 py-2 rounded-xl border border-line text-xs"
                  >
                    <span className="font-black text-sumi">{c.frontText}</span>
                    <span className="text-sumi-muted font-medium truncate max-w-[220px]">{c.meaning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isExtraPractice && (
            isDemo ? (
              <div className="p-3 bg-ai-soft/40 border border-ai/30 rounded-xl text-xs text-ai font-semibold space-y-1">
                <div className="font-bold">🧪 Chế độ trải nghiệm thử (Sandbox)</div>
                <div className="text-[11px] text-sumi-muted">
                  Bạn đã hoàn thành trọn vẹn luồng học mẫu! Toàn bộ tiến trình diễn ra trên RAM và tuyệt đối không ghi dữ liệu vào DB.
                </div>
              </div>
            ) : (
              <div className="text-xs text-sumi-muted">
                Quy mô: <span className="font-bold text-sumi">{totalOriginalCards} thẻ</span> • Tổng cộng: <span className="font-bold text-sumi">{total} lượt đánh giá</span>. Lịch ôn tập ngắt quãng (SRS) đã được cập nhật thành công!
              </div>
            )
          )}

          <div className="space-y-2.5 pt-2">
            {isEarlyExit && (
              <button
                onClick={() => {
                  setIsCompleted(false);
                  setIsEarlyExit(false);
                }}
                className="w-full py-3 bg-ai hover:bg-ai-hover text-on-ai font-extrabold rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
              >
                ▶ Tiếp tục ôn tập phiên này
              </button>
            )}
            {!isExtraPractice && leechCards.length > 0 && !isMiniRound && (
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
              className={`w-full py-3 font-bold rounded-xl text-xs transition-colors cursor-pointer ${isEarlyExit ? 'bg-paper-100 hover:bg-paper-200 text-sumi border border-line' : 'bg-ai hover:bg-ai-hover text-on-ai shadow-xs'}`}
            >
              ← Quay về danh sách bộ thẻ
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-paper-100 hover:bg-paper-200 text-sumi font-bold rounded-xl text-xs transition-colors cursor-pointer border border-line"
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
  const progressPercent = isExtraPractice ? Math.min(100, Math.round(((currentIndex + 1) / Math.max(1, queue.length)) * 100)) : Math.min(100, Math.round((resolvedCardsCount / safeTotalOriginal) * 100));
  const isGrammarFront = isCurrentCardGrammar && !isFlipped;

  return (
    <div data-theme={themeFor('learn')} className="min-h-screen bg-paper-100 flex flex-col justify-between font-sans selection:bg-ai-soft text-sumi">

      {/* ==================== 1. TOP FOCUS HEADER (3 VÙNG + PROGRESS BAR SÁT ĐÁY) ==================== */}
      <header className="relative bg-paper-50 border-b border-line px-4 sm:px-6 py-3 min-h-[60px] flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        {/* VÙNG 1 (TRÁI): Nút thoát phiên */}
        <div className="flex items-center shrink-0 min-w-[120px] sm:w-64">
          <button
            onClick={handleExitSession}
            className="px-3.5 py-1.5 bg-paper-100 hover:bg-paper-200 text-sumi border border-line rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Tạm dừng/thoát phiên học và lưu tiến độ [Esc]"
          >
            <span>✕</span>
            <span>Thoát phiên</span>
          </button>
        </div>

        {/* VÙNG 2 (GIỮA): Tiêu đề bài học đầy đủ & to rõ */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 sm:px-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-paper-100 text-sumi border border-line shrink-0">
              {currentCard.jlptLevel}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                isCurrentCardGrammar
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                  : 'bg-ai-soft text-ai border border-ai/20'
              }`}
            >
              {isCurrentCardGrammar ? '🧩 Ngữ pháp' : '📘 Từ vựng'}
            </span>
            <h2 className="text-sm sm:text-base font-black text-sumi leading-tight">
              {session?.setTitle || 'Đang ôn tập'}
            </h2>
          </div>
        </div>

        {/* VÙNG 3 (PHẢI): Số thẻ hoàn thành và trạng thái */}
        <div className="flex items-center justify-end gap-2 shrink-0 min-w-[120px] sm:w-64">
          {/* Badge chế độ Sandbox hoặc Mini-round */}
          {isDemo && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-ai-soft text-ai border border-ai/30 hidden md:inline-block">
              🧪 SANDBOX
            </span>
          )}
          {isMiniRound && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-warning-soft text-warning border border-warning/30 hidden md:inline-block">
              ⚡ MINI-ROUND
            </span>
          )}

          {/* Badge phiên tiếp tục đang dở */}
          {session?.isResumedSession && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-ai-soft text-ai border border-ai/30 hidden sm:inline-block">
              🔄 TIẾP TỤC PHIÊN DỞ
            </span>
          )}

          {/* Badge chế độ Ôn tập tự do */}
          {isExtraPractice && (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-ai-soft text-ai border border-ai/30 flex items-center gap-1">
              <span>↻</span>
              <span>ÔN TẬP TỰ DO</span>
            </span>
          )}

          {/* Trạng thái ôn lại của thẻ hiện tại hoặc hàng đợi */}
          {!isExtraPractice && currentCardRetryAttempt > 0 ? (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-warning-soft text-warning border border-warning/30 animate-pulse">
              🔄 Ôn lại {currentCardRetryAttempt}/{MAX_RETRIES_PER_CARD}
            </span>
          ) : pendingRetryCount > 0 ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-warning-soft text-warning border border-warning/30 hidden sm:inline-block">
              🔄 {pendingRetryCount} chờ ôn
            </span>
          ) : leechCards.length > 0 && !isMiniRound ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-danger-soft text-danger border border-danger/30 hidden sm:inline-block">
              📌 {leechCards.length} cần chú ý
            </span>
          ) : null}

          {/* Số thẻ hoàn thành */}
          <div className="px-3 py-1 bg-paper-100 border border-line rounded-xl text-xs font-semibold text-sumi-muted flex items-center gap-1 shadow-2xs">
            <span className="hidden sm:inline text-sumi-muted">{isExtraPractice ? 'Thẻ:' : 'Đã học:'}</span>
            <strong className="text-sumi font-black">
              {isExtraPractice ? `${currentIndex + 1}/${queue.length}` : `${resolvedCardsCount}/${safeTotalOriginal}`}
            </strong>
          </div>
        </div>

        {/* ==================== THANH TIẾN ĐỘ SÁT ĐÁY HEADER ==================== */}
        <div className="absolute bottom-0 left-0 right-0 w-full bg-paper-200 h-[3px] overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isGrammar ? 'bg-purple-600' : 'bg-ai'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* ==================== 2. MAIN FLASHCARD WORKSPACE ==================== */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-4xl mx-auto w-full my-auto">
        {/* Thông báo khi có thẻ chạm trần giới hạn 2 lần lặp lại và chuyển vào Leech */}
        {leechNotice && (
          <div className="w-full max-w-[760px] mb-3 px-4 py-2.5 bg-warning-soft border border-warning/30 text-warning rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
            <span>{leechNotice}</span>
            <button
              onClick={() => setLeechNotice(null)}
              className="text-warning hover:opacity-80 ml-3 font-black cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* ==================== THẺ FLASHCARD TỐI GIẢN (PA3 - ULTRA-MINIMALIST QUIZLET STYLE) ==================== */}
        <div
          className="w-full max-w-[760px] h-[440px] cursor-pointer select-none"
          style={{ perspective: '1200px' }}
          onClick={handleToggleFlip}
        >
          <div
            className="relative w-full h-full rounded-3xl"
            style={{
              transformStyle: 'preserve-3d',
              transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
              transform: isFlipped ? 'rotateX(180deg)' : 'rotateX(0deg)',
              willChange: 'transform',
            }}
          >
            {/* ==================== MẶT TRƯỚC (CHỈ HIỂN THỊ TỪ VỰNG / NGỮ PHÁP) ==================== */}
            <div
              className="absolute inset-0 w-full h-full bg-paper-50 rounded-3xl border border-line p-8 shadow-lg flex flex-col justify-between text-sumi"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateX(0deg) translateZ(1px)',
                WebkitFontSmoothing: 'antialiased',
                outline: '1px solid transparent',
                pointerEvents: isFlipped ? 'none' : 'auto',
                willChange: 'transform',
              }}
            >
              {/* Chỉ báo góc tối giản */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-sumi-faint">
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
                    isCurrentCardGrammar ? 'text-purple-600 dark:text-purple-400' : 'text-sumi'
                  }`}
                >
                  {currentCard.frontText}
                </h1>
              </div>

              {/* Khoảng đệm đáy giữ cân đối trục dọc */}
              <div className="h-4" />
            </div>

            {/* ==================== MẶT SAU (CẤU TRÚC / CÁCH ĐỌC + NGHĨA + CÂU MẪU + GIẢI THÍCH) ==================== */}
            <div
              className={`absolute inset-0 w-full h-full bg-paper-50 rounded-3xl border-2 p-6 sm:p-8 shadow-lg flex flex-col justify-between text-sumi ${
                isCurrentCardGrammar ? 'border-purple-500/30' : 'border-ai/30'
              }`}
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateX(180deg) translateZ(1px)',
                WebkitFontSmoothing: 'antialiased',
                outline: '1px solid transparent',
                pointerEvents: isFlipped ? 'auto' : 'none',
                willChange: 'transform',
              }}
            >
              <div className="w-full h-full flex flex-col justify-between overflow-y-auto overscroll-contain">
                {/* Chỉ báo góc tối giản + Từ loại nhẹ nhàng */}
              <div className="flex items-center justify-between shrink-0">
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest ${
                    isCurrentCardGrammar ? 'text-purple-600 dark:text-purple-400' : 'text-ai'
                  }`}
                >
                  Mặt sau
                </span>
                {currentCard.partOfSpeech && (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-paper-100 text-sumi-muted border border-line">
                    {currentCard.partOfSpeech}
                  </span>
                )}
              </div>

              {/* Nội dung chính Mặt Sau: Cách đọc / Cấu trúc + Nghĩa + Câu mẫu / Ví dụ + Giải thích */}
              <div className="flex-1 flex flex-col items-center justify-center text-center px-2 sm:px-4 py-2 space-y-2.5 max-w-full">
                {currentCard.readingOrFormation && (
                  <div
                    className={`text-lg sm:text-xl font-bold ${
                      isCurrentCardGrammar ? 'text-purple-600 dark:text-purple-400' : 'text-ai'
                    }`}
                  >
                    {currentCard.readingOrFormation}
                  </div>
                )}

                <h2 className="text-2xl sm:text-3xl font-black text-sumi leading-snug">
                  {currentCard.meaning}
                </h2>

                {/* Với thẻ Ngữ pháp: Hiển thị câu mẫu minh họa ngay bên dưới dịch nghĩa */}
                {isCurrentCardGrammar && currentCard.exampleSentence && (() => {
                  const { ja, vi } = extractJapaneseSentence(currentCard.exampleSentence);
                  return (
                    <div className="mt-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-2xl max-w-lg w-full text-center shadow-2xs">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-0.5 flex items-center justify-center gap-1.5">
                        <span>💬</span>
                        <span>Câu mẫu minh họa</span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-sumi leading-relaxed">
                        {ja}
                      </div>
                      {vi && (
                        <div className="text-xs text-sumi-muted font-medium mt-0.5">
                          {vi}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Với thẻ Từ vựng: Hiển thị câu ví dụ minh họa (nếu có) */}
                {!isCurrentCardGrammar && currentCard.exampleSentence && (
                  <div className="mt-2 px-4 py-2.5 bg-ai-soft/50 border border-ai/20 rounded-2xl max-w-lg w-full text-center shadow-2xs">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-ai flex items-center gap-1.5">
                        <span>💬</span>
                        <span>Câu ví dụ</span>
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playAudio(currentCard.exampleSentence || '');
                        }}
                        disabled={isPlayingAudio}
                        className="text-xs text-ai hover:opacity-80 font-bold px-1.5 py-0.5 rounded-md hover:bg-ai-soft transition-colors cursor-pointer"
                        title="Nghe câu ví dụ"
                      >
                        🔊
                      </button>
                    </div>
                    <div className="text-sm sm:text-base font-bold text-sumi leading-relaxed">
                      {currentCard.exampleSentence}
                    </div>
                  </div>
                )}

                {/* Giải thích chi tiết (cho cả Từ vựng và Ngữ pháp) */}
                {currentCard.explanation && (
                  <div className="mt-2 px-4 py-2 bg-paper-100 border border-line rounded-xl max-w-lg w-full text-xs text-sumi-muted leading-relaxed text-left">
                    <span className="font-bold text-sumi">💡 Giải thích:</span> {currentCard.explanation}
                  </div>
                )}
              </div>

              {/* Khoảng đệm đáy giữ cân đối trục dọc */}
              <div className="h-2 shrink-0" />
            </div>
            </div>
          </div>
        </div>

        {/* ==================== THANH CÔNG CỤ BÊN DƯỚI THẺ (ACTION TOOLBAR) ==================== */}
        <div className="w-full max-w-[760px] mt-3.5 flex flex-col items-center space-y-2">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 bg-paper-50 px-3 py-2 rounded-2xl border border-line shadow-2xs">
            {/* 1. Nút Nghe mẫu [A] */}
            <button
              onClick={playTargetAudio}
              disabled={isGrammarFront || isPlayingAudio}
              title={
                isGrammarFront
                  ? 'Lật sang mặt sau để nghe phát âm câu mẫu [A]'
                  : isPlayingAudio
                  ? 'Đang phát âm mẫu...'
                  : isGrammar
                  ? 'Nghe phát âm câu mẫu [A]'
                  : 'Nghe phát âm mẫu [A]'
              }
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-line ${
                isGrammarFront
                  ? 'bg-paper-100 text-sumi-faint border-line cursor-not-allowed opacity-40'
                  : isPlayingAudio
                  ? 'bg-paper-100 text-sumi-muted cursor-not-allowed opacity-50'
                  : 'bg-paper-100 hover:bg-paper-200 text-sumi cursor-pointer'
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

            {/* 2. Nút Đánh dấu [B] */}
            <button
              onClick={handleToggleBookmark}
              title="Đánh dấu thẻ này [B]"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border cursor-pointer ${
                currentCard.isBookmarked
                  ? 'bg-warning-soft text-warning border-warning/30'
                  : 'bg-paper-100 hover:bg-paper-200 text-sumi border-line'
              }`}
            >
              <span>{currentCard.isBookmarked ? '🔖' : '🏷️'}</span>
              <span>{currentCard.isBookmarked ? 'Đã đánh dấu [B]' : 'Đánh dấu [B]'}</span>
            </button>

            {/* 3. Nút Lật thẻ nhanh */}
            <button
              onClick={handleToggleFlip}
              title="Lật mặt thẻ [Space]"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-paper-100 hover:bg-paper-200 text-sumi border border-line transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔄</span>
              <span>{isFlipped ? 'Lật về Mặt trước' : 'Lật sang Mặt sau'}</span>
            </button>
          </div>
        </div>

        {/* ==================== 3. ĐIỀU HƯỚNG ÔN TẬP TỰ DO vs SRS RATING BAR ==================== */}
        {isExtraPractice ? (
          <div className="w-full max-w-[760px] mt-6 space-y-3">
            <div className="text-center text-xs font-semibold text-sumi-muted flex items-center justify-center gap-1.5">
              <span>↻ Chế độ duyệt tự do:</span>
              <span className="text-ai font-bold">Thẻ {currentIndex + 1} / {queue.length}</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Nút 1: Thẻ trước ◀ */}
              <button
                onClick={handlePrevCard}
                disabled={currentIndex === 0}
                className="py-3 px-4 rounded-2xl bg-paper-50 hover:bg-paper-100 border border-line text-sumi transition-all flex items-center justify-center gap-2 shadow-xs group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Quay lại thẻ trước [←]"
              >
                <span className="text-base">◀</span>
                <span className="text-xs sm:text-sm font-bold">Thẻ trước</span>
              </button>

              {/* Nút 2: Lật thẻ 🔄 */}
              <button
                onClick={handleToggleFlip}
                className="py-3 px-4 rounded-2xl bg-paper-100 hover:bg-paper-200 border border-line text-sumi transition-all flex items-center justify-center gap-2 shadow-xs group cursor-pointer"
                title="Lật thẻ [Space]"
              >
                <span className="text-base">🔄</span>
                <span className="text-xs sm:text-sm font-bold">
                  {isFlipped ? 'Mặt trước' : 'Lật xem nghĩa'}
                </span>
              </button>

              {/* Nút 3: Thẻ tiếp theo ▶ hoặc Hoàn thành */}
              {currentIndex < queue.length - 1 ? (
                <button
                  onClick={handleNextCard}
                  className="py-3 px-4 rounded-2xl bg-ai hover:bg-ai-hover text-on-ai transition-all flex items-center justify-center gap-2 shadow-xs group cursor-pointer"
                  title="Sang thẻ tiếp theo [→]"
                >
                  <span className="text-xs sm:text-sm font-bold">Thẻ tiếp theo</span>
                  <span className="text-base">▶</span>
                </button>
              ) : (
                <button
                  onClick={handleFinishExtraPractice}
                  className="py-3 px-4 rounded-2xl bg-success hover:opacity-90 text-white transition-all flex items-center justify-center gap-2 shadow-xs group cursor-pointer animate-pulse"
                  title="Hoàn thành phiên ôn tập tự do"
                >
                  <span className="text-xs sm:text-sm font-extrabold">Hoàn thành</span>
                  <span className="text-base">🎉</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[760px] mt-6 space-y-3">
            <div className="text-center text-xs font-semibold text-sumi-muted">
              Đánh giá mức độ nhớ của bạn:
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* 1. AGAIN */}
              <button
                onClick={() => handleRate('Again')}
                className="py-3 px-4 rounded-2xl bg-danger-soft/40 hover:bg-danger-soft border border-danger/30 text-danger transition-all flex flex-col items-center justify-center gap-0.5 shadow-xs group cursor-pointer"
              >
                <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-sm bg-danger/20 text-danger text-[10px] flex items-center justify-center font-black">1</span>
                  <span>Cần học lại</span>
                </div>
                <div className="text-[11px] text-danger/80 font-medium">
                  {currentCardRetryAttempt < MAX_RETRIES_PER_CARD
                    ? `Lặp lại cuối phiên (${currentCardRetryAttempt + 1}/${MAX_RETRIES_PER_CARD})`
                    : 'Ghim vào Cần chú ý (Leech)'}
                </div>
              </button>

              {/* 2. GOOD */}
              <button
                onClick={() => handleRate('Good')}
                className="py-3 px-4 rounded-2xl bg-ai-soft/40 hover:bg-ai-soft border border-ai/30 text-ai transition-all flex flex-col items-center justify-center gap-0.5 shadow-xs group cursor-pointer"
              >
                <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-sm bg-ai/20 text-ai text-[10px] flex items-center justify-center font-black">2</span>
                  <span>Tốt</span>
                </div>
                <div className="text-[11px] text-ai/80 font-medium">
                  Ôn lại sau {currentCard.intervalPreview.goodDays || 1} ngày
                </div>
              </button>

              {/* 3. EASY */}
              <button
                onClick={() => handleRate('Easy')}
                className="py-3 px-4 rounded-2xl bg-success-soft/40 hover:bg-success-soft border border-success/30 text-success transition-all flex flex-col items-center justify-center gap-0.5 shadow-xs group cursor-pointer"
              >
                <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-sm bg-success/20 text-success text-[10px] flex items-center justify-center font-black">3</span>
                  <span>Dễ</span>
                </div>
                <div className="text-[11px] text-success/80 font-medium">
                  Ôn lại sau {currentCard.intervalPreview.easyDays || 3} ngày
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ==================== 4. KEYBOARD SHORTCUTS DOCK ==================== */}
      <footer className="py-4 px-6 bg-paper-50 border-t border-line flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-sumi-muted">
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-paper-100 border border-line rounded-md text-[10px] font-bold text-sumi">Space</kbd>
            <span>Lật thẻ</span>
          </div>
          {isExtraPractice ? (
            <div className="flex items-center gap-1.5">
              <kbd className="px-2 py-0.5 bg-paper-100 border border-line rounded-md text-[10px] font-bold text-sumi">← / →</kbd>
              <span>Thẻ trước / sau</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <kbd className="px-2 py-0.5 bg-paper-100 border border-line rounded-md text-[10px] font-bold text-sumi">1 / 2 / 3</kbd>
              <span>Đánh giá SRS</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <kbd className={`px-2 py-0.5 border rounded-md text-[10px] font-bold ${
              isGrammarFront || isPlayingAudio
                ? 'bg-paper-100/50 border-line text-sumi-faint'
                : 'bg-paper-100 border-line text-sumi'
            }`}>A</kbd>
            <span className={isGrammarFront || isPlayingAudio ? 'text-sumi-faint line-through' : ''}>
              {isPlayingAudio ? 'Đang phát' : isGrammar ? 'Nghe câu mẫu' : 'Nghe mẫu'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-paper-100 border border-line rounded-md text-[10px] font-bold text-sumi">B</kbd>
            <span>Đánh dấu</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 bg-paper-100 border border-line rounded-md text-[10px] font-bold text-sumi">Esc</kbd>
            <span>Thoát</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
