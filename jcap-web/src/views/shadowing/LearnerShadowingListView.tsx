import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import { shadowingStorageService } from '../../services/shadowingStorageService';
import type { ShadowingDialogueItem } from '../../types/shadowing';
import { fromServerSession, mergeHistory } from '../../utils/shadowingHistory';
import type { ShadowingPracticeSession } from '../../types/shadowingProgress';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { useAuth } from '../../contexts/AuthContext';
import { Button as JButton, EmptyState, Icon, IconButton, JlptBadge, JpText, ProgressBar, ScoreRing } from '../../components/jcap';

type ShadowingTab = 'all' | 'in-progress' | 'completed' | 'not-started' | 'bookmarks' | 'history';

/** Lịch sử luyện Shadowing nằm ở trang Kết quả, tab Shadowing */
const RESULTS_SHADOWING = '/roleplay/results?tab=shadowing';

export const LearnerShadowingListView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const learnerId = user?.id || user?.email || 'guest_learner';

  // Sub-tabs from URL query param (?tab=...)
  const activeTab = (searchParams.get('tab') as ShadowingTab) || 'all';

  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [historyList, setHistoryList] = useState<ShadowingPracticeSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [keyword, setKeyword] = useState<string>(() => searchParams.get('q') || searchParams.get('query') || '');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');


  // Local storage state triggers
  const [storageVersion, setStorageVersion] = useState<number>(0);

  // Role selection modal for starting or restarting practice
  const [selectedDialogueForRole, setSelectedDialogueForRole] = useState<{
    dialogue: ShadowingDialogueItem;
    isRestart: boolean;
  } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const res = await shadowingService.getCatalog({
      keyword: keyword.trim() || undefined,
      jlptLevel: selectedLevel,
    });

    if (res.success && res.data) {
      setItems(res.data);
    } else {
      setErrorMessage(res.message || 'Không thể tải danh sách bài học Shadowing.');
    }

    // Lịch sử: buổi luyện lưu ở backend + bản ghi cũ còn trong trình duyệt (trước khi lịch sử được lưu ở backend)
    const localHistory = shadowingStorageService.getHistoryList(learnerId);
    const serverRes = await shadowingService.getHistory();
    const serverHistory = serverRes.success && serverRes.data
      ? serverRes.data.map((record) => fromServerSession(record, learnerId))
      : [];
    setHistoryList(mergeHistory(serverHistory, localHistory));

    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 200);
    return () => clearTimeout(timer);
  }, [keyword, selectedLevel, learnerId, storageVersion]);

  // Tab switching
  const handleTabChange = (tab: ShadowingTab) => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === 'all') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', tab);
    }
    setSearchParams(newParams);
  };

  // Bookmark toggle
  const handleToggleBookmark = (dialogueId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    shadowingStorageService.toggleBookmark(learnerId, dialogueId);
    setStorageVersion((v) => v + 1);
  };

  // Start fresh or restart with role selection
  const handleOpenRoleModal = (dialogue: ShadowingDialogueItem, isRestart: boolean) => {
    setSelectedDialogueForRole({ dialogue, isRestart });
  };

  const handleConfirmRole = (selectedRole: 'A' | 'B') => {
    if (!selectedDialogueForRole) return;
    const { dialogue, isRestart } = selectedDialogueForRole;
    setSelectedDialogueForRole(null);
    const query = `?role=${selectedRole}${isRestart ? '&restart=true' : ''}`;
    navigate(`/shadowing/practice/${dialogue.id}${query}`);
  };

  // Resume directly without role modal
  const handleResumePractice = (dialogue: ShadowingDialogueItem, role: 'A' | 'B') => {
    navigate(`/shadowing/practice/${dialogue.id}?role=${role}&resume=true`);
  };

  // Counts for tabs
  const allProgress = shadowingStorageService.getAllProgress(learnerId);
  const inProgressCount = allProgress.filter((p) => p.status === 'IN_PROGRESS').length;
  const completedCount = allProgress.filter((p) => p.status === 'COMPLETED').length;
  const bookmarkedCount = shadowingStorageService.getBookmarks(learnerId).length;
  const historyCount = historyList.length;

  const notStartedCount = items.filter((item) => {
    const p = shadowingStorageService.getProgress(learnerId, item.id);
    return !p || p.status === 'NOT_STARTED';
  }).length;

  // Filter items based on active tab
  const getFilteredItems = () => {
    if (activeTab === 'in-progress') {
      return items.filter((item) => {
        const p = shadowingStorageService.getProgress(learnerId, item.id);
        return p?.status === 'IN_PROGRESS';
      });
    }
    if (activeTab === 'completed') {
      return items.filter((item) => {
        const p = shadowingStorageService.getProgress(learnerId, item.id);
        return p?.status === 'COMPLETED';
      });
    }
    if (activeTab === 'not-started') {
      return items.filter((item) => {
        const p = shadowingStorageService.getProgress(learnerId, item.id);
        return !p || p.status === 'NOT_STARTED';
      });
    }
    if (activeTab === 'bookmarks') {
      return items.filter((item) =>
        shadowingStorageService.isBookmarked(learnerId, item.id)
      );
    }
    return items;
  };

  const displayedItems = getFilteredItems();

  // Bài đang học dở gần nhất (khối "Đang học dở" đầu trang)
  const continueProgress = shadowingStorageService.getLatestInProgress(learnerId);
  const continueItem = continueProgress ? items.find((i) => i.id === continueProgress.dialogueId) : undefined;

  // Điểm cao nhất của từng bài (từ lịch sử đã lưu)
  const bestScore = new Map<number, number>();
  historyList.forEach((h) => {
    const sc = h.averageScore ?? 0;
    if (sc > (bestScore.get(h.dialogueId) ?? -1)) bestScore.set(h.dialogueId, sc);
  });

  // Nhóm bài theo kịch bản (tình huống)
  const groups: Array<{ name: string; lessons: ShadowingDialogueItem[] }> = [];
  displayedItems.forEach((item) => {
    const name = item.scenarioTitle || 'Giao tiếp tình huống';
    const g = groups.find((x) => x.name === name);
    if (g) g.lessons.push(item);
    else groups.push({ name, lessons: [item] });
  });

  const tabs: Array<{ id: ShadowingTab; label: string; count: number }> = [
    { id: 'all', label: 'Tất cả', count: items.length },
    { id: 'in-progress', label: 'Đang học', count: inProgressCount },
    { id: 'not-started', label: 'Chưa học', count: notStartedCount },
    { id: 'bookmarks', label: 'Đã lưu', count: bookmarkedCount },
  ];

  const startLesson = (item: ShadowingDialogueItem) => {
    const progress = shadowingStorageService.getProgress(learnerId, item.id);
    if (progress?.status === 'IN_PROGRESS') handleResumePractice(item, progress.role);
    else handleOpenRoleModal(item, progress?.status === 'COMPLETED');
  };

  // Link cũ tới tab Lịch sử (?tab=history) chuyển sang trang Kết quả
  if (activeTab === 'history') return <Navigate to={RESULTS_SHADOWING} replace />;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-7 bg-transparent pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-[38px]">Shadowing</h1>
          <p className="m-0 text-[15px] leading-6 text-sumi-muted">
            Nghe câu của người bản xứ rồi nói theo. Hệ thống chấm từng âm và chỉ ra chỗ cần sửa.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <JButton variant="ghost" icon="settings" onClick={() => navigate('/admin/shadowing')}>
              Quản lý Shadowing (Admin)
            </JButton>
          )}
        </div>
      </div>

        <>
          {/* Đang học dở */}
          {continueProgress && (
            <section aria-label="Bài đang học" className="flex flex-wrap items-center gap-6 rounded-jc-xl bg-nami-soft px-7 py-6">
              <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-nami">
                  <Icon name="pending" size={18} />
                  <span>Đang học dở</span>
                </div>
                <h2 className="m-0 text-[22px] font-bold leading-[30px]">{continueProgress.dialogueTitle || continueItem?.title}</h2>
                <p className="m-0 text-sm leading-[22px] text-sumi-muted">
                  {[continueProgress.subtitle || continueProgress.scenarioTitle, continueProgress.jlptLevel, `Vai ${continueProgress.role}`]
                    .filter(Boolean)
                    .join(' · ')}
                  {`. Bạn dừng ở câu ${continueProgress.currentSentenceIndex + 1}:`}
                </p>
                {continueProgress.currentSentenceText && (
                  <div className="rounded-jc-md bg-paper-50 px-3.5 py-2.5">
                    <JpText text={continueProgress.currentSentenceText} size="md" as="p" />
                  </div>
                )}
              </div>
              <div className="flex flex-[0_1_260px] flex-col gap-3.5">
                <ProgressBar
                  value={continueProgress.completedSentenceCount}
                  max={continueProgress.totalSentenceCount || 1}
                  label={`${continueProgress.completedSentenceCount}/${continueProgress.totalSentenceCount} câu`}
                  showValue
                  size="lg"
                />
                <JButton
                  variant="primary"
                  size="lg"
                  block
                  icon="play_arrow"
                  onClick={() => navigate(`/shadowing/practice/${continueProgress.dialogueId}?role=${continueProgress.role}&resume=true`)}
                >
                  {`Tiếp tục từ câu ${continueProgress.currentSentenceIndex + 1}`}
                </JButton>
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-start gap-7">
            <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
              {/* Thanh lọc một hàng: trạng thái · cấp độ · tìm kiếm */}
              <div className="jx-shf" role="toolbar" aria-label="Lọc bài học">
                <div className="jx-shf-tabs" role="tablist" aria-label="Trạng thái">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === t.id}
                      className={`jx-shf-tab ${activeTab === t.id ? 'on' : ''}`}
                      onClick={() => handleTabChange(t.id)}
                    >
                      {t.label}
                      <span className="jx-shf-n">{t.count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex-auto" />
                <div className="jx-shf-lv" role="group" aria-label="Trình độ">
                  {['ALL', 'N5', 'N4', 'N3'].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      aria-pressed={selectedLevel === lv}
                      className={`jx-shf-chip lv-${lv} ${selectedLevel === lv ? 'on' : ''}`}
                      onClick={() => setSelectedLevel(selectedLevel === lv && lv !== 'ALL' ? 'ALL' : lv)}
                    >
                      {lv === 'ALL' ? 'Mọi cấp' : lv}
                    </button>
                  ))}
                </div>
                <span className="jx-shf-sep" aria-hidden="true" />
                <div className={`jx-shf-search ${keyword ? 'has-q' : ''}`}>
                  <label htmlFor="shf-q" title="Tìm bài học">
                    <Icon name="search" size={20} />
                  </label>
                  <input id="shf-q" type="search" placeholder="Tìm bài học" aria-label="Tìm bài học" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                </div>
              </div>

              {isLoading ? (
                <p className="m-0 text-sm text-sumi-muted" role="status">
                  Đang tải bài học Shadowing…
                </p>
              ) : errorMessage ? (
                <EmptyState icon="error" title="Có lỗi xảy ra" compact action={<JButton variant="secondary" onClick={loadData}>Thử lại</JButton>}>
                  {errorMessage}
                </EmptyState>
              ) : groups.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title={
                    activeTab === 'in-progress'
                      ? 'Không có bài nào đang học dở'
                      : activeTab === 'bookmarks'
                        ? 'Chưa lưu bài nào'
                        : activeTab === 'completed'
                          ? 'Chưa có bài nào học xong'
                          : 'Không có bài nào khớp bộ lọc'
                  }
                  compact
                  action={
                    activeTab !== 'all' || keyword || selectedLevel !== 'ALL' ? (
                      <JButton
                        variant="secondary"
                        onClick={() => {
                          setKeyword('');
                          setSelectedLevel('ALL');
                          handleTabChange('all');
                        }}
                      >
                        Xem tất cả bài học
                      </JButton>
                    ) : undefined
                  }
                />
              ) : (
                groups.map((g) => {
                  const done = g.lessons.filter((l) => shadowingStorageService.getProgress(learnerId, l.id)?.status === 'COMPLETED').length;
                  return (
                    <section key={g.name} className="flex flex-col overflow-hidden rounded-jc-lg border border-line bg-paper-50">
                      <div className="flex items-center gap-3 bg-paper-200 px-[18px] py-3.5">
                        <Icon name="forum" size={22} style={{ color: 'var(--nami)' }} />
                        <h2 className="m-0 flex-grow text-base font-semibold leading-6">{g.name}</h2>
                        <span className="text-[13px] leading-5 text-sumi-muted">{`${done}/${g.lessons.length} bài xong`}</span>
                      </div>
                      {g.lessons.map((item) => {
                        const progress = shadowingStorageService.getProgress(learnerId, item.id);
                        const isCompleted = progress?.status === 'COMPLETED';
                        const isInProgress = progress?.status === 'IN_PROGRESS';
                        const saved = shadowingStorageService.isBookmarked(learnerId, item.id);
                        const best = bestScore.get(item.id);
                        const estMinutes = Math.max(1, Math.round(item.totalSentences * 0.45));
                        return (
                          <div key={item.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5">
                            <Icon
                              name={isCompleted ? 'check_circle' : isInProgress ? 'pending' : 'radio_button_unchecked'}
                              size={22}
                              fill={isCompleted}
                              style={{ color: isCompleted ? 'var(--success)' : isInProgress ? 'var(--ai)' : 'var(--sumi-faint)' }}
                              label={isCompleted ? 'Đã xong' : isInProgress ? 'Đang học' : 'Chưa học'}
                            />
                            <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[3px]">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[15px] font-semibold leading-[22px]">{item.title}</span>
                                <JlptBadge level={item.jlptLevel as 'N5' | 'N4' | 'N3'} size="sm" />
                              </span>
                              <span className="text-[13px] leading-5 text-sumi-muted">
                                {`${item.totalSentences} câu · khoảng ${estMinutes} phút`}
                                {isInProgress && progress ? ` · đang ở câu ${progress.currentSentenceIndex + 1}/${item.totalSentences}` : ''}
                              </span>
                            </div>
                            {best !== undefined && (
                              <span className="flex min-w-[72px] flex-col items-end">
                                <span className="text-lg font-bold leading-6 tabular-nums">{Math.round(best)}</span>
                                <span className="text-xs leading-4 text-sumi-muted">điểm cao nhất</span>
                              </span>
                            )}
                            <IconButton
                              icon="bookmark"
                              label={saved ? 'Bỏ lưu bài học' : 'Lưu bài học'}
                              active={saved}
                              size="sm"
                              onClick={(e) => handleToggleBookmark(item.id, e)}
                            />
                            <JButton
                              variant={isInProgress ? 'primary' : 'secondary'}
                              size="sm"
                              icon={isCompleted ? 'replay' : 'play_arrow'}
                              onClick={() => startLesson(item)}
                            >
                              {isCompleted ? 'Luyện lại' : isInProgress ? 'Tiếp tục' : 'Bắt đầu'}
                            </JButton>
                          </div>
                        );
                      })}
                    </section>
                  );
                })
              )}
            </div>

            {/* Cột phải: buổi luyện gần đây + mẹo */}
            <aside aria-label="Lịch sử và mẹo" className="flex max-w-[340px] flex-[1_1_280px] flex-col gap-4">
              <section className="flex flex-col gap-3.5 rounded-jc-lg border border-line bg-paper-50 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="m-0 text-base font-semibold leading-6">Buổi luyện gần đây</h2>
                  <span className="text-[13px] text-sumi-muted">{`${historyCount} buổi`}</span>
                </div>
                {historyList.length === 0 ? (
                  <p className="m-0 text-sm text-sumi-muted">Chưa có buổi luyện nào được lưu.</p>
                ) : (
                  historyList.slice(0, 3).map((h) => (
                    <div key={h.id} className="flex items-center gap-3">
                      <ScoreRing value={Math.round(h.averageScore ?? 0)} size={44} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold leading-5">{h.dialogueTitle}</span>
                        <span className="text-[13px] leading-5 text-sumi-muted">
                          {[h.completedAt ? new Date(h.completedAt).toLocaleDateString('vi-VN') : null, h.role ? `Vai ${h.role}` : null].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <JButton variant="secondary" block icon="history" onClick={() => navigate(RESULTS_SHADOWING)}>
                  Xem toàn bộ lịch sử
                </JButton>
              </section>
              <section className="flex gap-3 rounded-jc-lg bg-sora-soft px-[18px] py-4">
                <Icon name="headphones" size={22} />
                <p className="m-0 text-sm leading-[22px]">Đeo tai nghe có micro khi luyện: giọng mẫu không lọt vào bản thu nên điểm chấm chính xác hơn.</p>
              </section>
            </aside>
          </div>
        </>

      {/* Role Selection Modal */}
      {selectedDialogueForRole && (
        <RoleSelectionModal
          isOpen={true}
          onClose={() => setSelectedDialogueForRole(null)}
          dialogueId={selectedDialogueForRole.dialogue.id}
          dialogueTitle={selectedDialogueForRole.dialogue.title}
          roleAName={selectedDialogueForRole.dialogue.speakerRoleA_Name}
          roleBName={selectedDialogueForRole.dialogue.speakerRoleB_Name}
          onConfirm={handleConfirmRole}
        />
      )}
    </div>
  );
};
