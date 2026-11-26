import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Icon } from '../../components/jcap';
import { bestScores, buildTopics, lessonState, SAVED, topicOf } from '../../components/shadowing/library';
import { ShadowingContinueStrip } from '../../components/shadowing/ShadowingContinueStrip';
import { ShadowingLessonList, type LessonRowData } from '../../components/shadowing/ShadowingLessonList';
import { ShadowingLessonPreview } from '../../components/shadowing/ShadowingLessonPreview';
import { ShadowingSectionNav } from '../../components/shadowing/ShadowingSectionNav';
import '../../components/shadowing/shadowingLibrary.css';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { shadowingService } from '../../services/shadowingService';
import { shadowingStorageService } from '../../services/shadowingStorageService';
import type { ShadowingDialogueItem } from '../../types/shadowing';
import type { ShadowingPracticeSession } from '../../types/shadowingProgress';
import { fromServerSession, mergeHistory } from '../../utils/shadowingHistory';

/** Lịch sử luyện Shadowing nằm ở trang Kết quả, tab Shadowing */
const RESULTS_SHADOWING = '/roleplay/results?tab=shadowing';

const MOBILE = '(max-width: 760px)';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE).matches);
  useEffect(() => {
    const media = window.matchMedia(MOBILE);
    const onChange = () => setMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

/** Thư viện Shadowing (HANDOFF 9j): cột mục, cột bài và cột kịch bản xem trước */
export const LearnerShadowingListView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const learnerId = user?.id || user?.email || 'guest_learner';
  const mobile = useIsMobile();

  const [items, setItems] = useState<ShadowingDialogueItem[]>([]);
  const [history, setHistory] = useState<ShadowingPracticeSession[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [level, setLevel] = useState('ALL');
  /** Mở trang thì ẩn furigana, bấm nút mới hiện */
  const [furigana, setFurigana] = useState(false);
  const [query, setQuery] = useState(() => params.get('q') || params.get('query') || '');
  /** Kết quả tìm từ máy chủ (null = chưa có kết quả nào) */
  const [found, setFound] = useState<ShadowingDialogueItem[] | null>(null);
  /** Tăng sau khi lưu hoặc bỏ lưu để đọc lại trình duyệt */
  const [, setStorageVersion] = useState(0);

  const load = useCallback(async () => {
    setStatus('loading');
    const res = await shadowingService.getCatalog();
    if (res.success && res.data) {
      setItems(res.data);
      setStatus('ok');
    } else {
      setErrorMessage(res.message || 'Không thể tải danh sách bài học Shadowing.');
      setStatus('error');
    }
    // Lịch sử: buổi luyện lưu ở backend + bản ghi cũ còn trong trình duyệt
    const local = shadowingStorageService.getHistoryList(learnerId);
    const server = await shadowingService.getHistory();
    setHistory(mergeHistory(server.success && server.data ? server.data.map((r) => fromServerSession(r, learnerId)) : [], local));
  }, [learnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tìm trong mọi chủ đề (máy chủ lọc theo từ khoá và cấp như trước)
  const q = query.trim();
  const searchSeq = useRef(0);
  useEffect(() => {
    const seq = ++searchSeq.current;
    // Đang gõ tiếp thì giữ kết quả cũ cho tới khi có kết quả mới, danh sách không nháy
    if (!q) {
      setFound(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      const res = await shadowingService.getCatalog({ keyword: q, jlptLevel: level });
      if (seq === searchSeq.current) setFound(res.success && res.data ? res.data : []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, level]);

  const progressOf = (id: number) => shadowingStorageService.getProgress(learnerId, id);
  const isSaved = (id: number) => shadowingStorageService.isBookmarked(learnerId, id);
  const stateOf = (id: number) => lessonState(progressOf(id));
  const best = bestScores(history);

  const topics = buildTopics(items, stateOf);
  const saved = items.filter((i) => isSaved(i.id));

  // Mục đang xem lấy từ URL; link cũ ?tab=bookmarks vẫn dùng được. Không chỉ định thì mở chủ đề đầu tiên
  const tab = params.get('tab');
  const requested = params.get('muc') ?? (tab === 'bookmarks' ? SAVED : null);
  const known = requested === SAVED || topics.some((t) => t.key === requested);
  const section = known ? requested! : (topics[0]?.key ?? '');
  const topic = topics.find((t) => t.key === section);

  const pickedId = Number(params.get('bai')) || null;

  const update = (change: Record<string, string | null>, options?: { replace?: boolean; state?: unknown }) => {
    const next = new URLSearchParams(params);
    next.delete('tab');
    for (const [key, value] of Object.entries(change)) value === null ? next.delete(key) : next.set(key, value);
    setParams(next, options);
  };
  const pickSection = (key: string) => {
    setQuery('');
    update({ muc: key, bai: null, q: null, query: null }, { replace: true });
  };
  const selectLesson = (id: number) => {
    // Điện thoại: cột xem trước phủ toàn màn, nút Back của trình duyệt đóng lại
    update({ muc: section, bai: String(id) }, mobile && !pickedId ? { state: { pushed: true } } : { replace: true, state: location.state });
  };
  const closePreview = () => {
    if ((location.state as { pushed?: boolean } | null)?.pushed) navigate(-1);
    else update({ bai: null }, { replace: true });
  };

  const sectionItems = section === SAVED ? saved : items.filter((i) => topicOf(i) === topic?.name);
  const shown = q ? (found ?? []) : sectionItems.filter((i) => level === 'ALL' || i.jlptLevel === level);
  const rows: LessonRowData[] = shown.map((item) => ({ item, progress: progressOf(item.id), best: best.get(item.id), saved: isSaved(item.id) }));
  // Màn rộng chọn sẵn bài đầu danh sách; điện thoại chỉ mở xem trước khi bấm vào bài
  const selected = items.find((i) => i.id === pickedId) ?? (mobile ? null : (shown[0] ?? null));

  const heading = q ? `Kết quả cho “${q}”` : section === SAVED ? 'Đã lưu' : (topic?.name ?? 'Bài học');
  // Dòng phụ dưới đầu cột chỉ dùng khi tìm kiếm
  const summary = q && found !== null ? `${shown.length} bài trong mọi chủ đề` : '';

  let placeholder: React.ReactNode;
  if (status === 'loading') {
    placeholder = (
      <div className="shl-skel" role="status" aria-label="Đang tải bài học Shadowing">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="jc-skel" />
        ))}
      </div>
    );
  } else if (status === 'error') {
    placeholder = (
      <EmptyState icon="error" title="Có lỗi xảy ra" compact action={<Button variant="secondary" onClick={load}>Thử lại</Button>}>
        {errorMessage}
      </EmptyState>
    );
  } else if (q && found === null) {
    placeholder = <p className="shl-none">Đang tìm…</p>;
  } else if (shown.length === 0) {
    placeholder = (
      <p className="shl-none">
        {q
          ? `Không có bài nào khớp với “${q}”${level !== 'ALL' ? ` ở cấp ${level}` : ''}.`
          : level !== 'ALL' && sectionItems.length > 0
            ? `Không có bài ${level} trong mục này.`
            : section === SAVED
              ? 'Chưa lưu bài nào. Mở một bài rồi bấm biểu tượng đánh dấu để lưu.'
              : 'Chưa có bài học nào.'}
      </p>
    );
  }

  const resumeProgress = shadowingStorageService.getLatestInProgress(learnerId);
  const resumeItem = resumeProgress ? items.find((i) => i.id === resumeProgress.dialogueId) : undefined;

  // Link cũ tới tab Lịch sử chuyển sang trang Kết quả
  if (tab === 'history') return <Navigate to={RESULTS_SHADOWING} replace />;

  // Admin xem trang này trong khung quản trị (luôn sáng), không phải khung học viên
  return (
    <div className={`shl ${isAdmin ? 'in-admin' : ''}`} data-theme={isDark && !isAdmin ? 'hoc-tap-dem' : 'kham-pha'}>
      <div className="shl-wrap">
        <header className="shl-head">
          <h1>
            Shadowing
            <span className="kj" lang="ja">
              シャドーイング
            </span>
          </h1>
          <span className="sp" />
          {isAdmin && (
            <Button variant="ghost" size="sm" icon="settings" onClick={() => navigate('/admin/shadowing')}>
              Quản lý Shadowing
            </Button>
          )}
          <Link className="hist" to={RESULTS_SHADOWING}>
            <Icon name="history" size={18} />
            <span>
              Lịch sử luyện
              {history.length > 0 && ` · ${history.length} buổi`}
            </span>
          </Link>
        </header>

        {resumeProgress && (
          <ShadowingContinueStrip
            progress={resumeProgress}
            title={resumeProgress.dialogueTitle || resumeItem?.title || 'Bài đang học'}
            onResume={() => navigate(`/shadowing/practice/${resumeProgress.dialogueId}?role=${resumeProgress.role}&resume=true`)}
          />
        )}

        <div className="shl-cols">
          <ShadowingSectionNav
            active={q ? null : section}
            topics={topics}
            savedCount={saved.length}
            onPick={pickSection}
          />
          <ShadowingLessonList
            heading={heading}
            summary={summary}
            rows={rows}
            showTopic={!!q || section === SAVED}
            selectedId={selected?.id ?? null}
            onSelect={selectLesson}
            level={level}
            onLevel={setLevel}
            query={query}
            onQuery={setQuery}
            placeholder={placeholder}
          />
          {selected ? (
            <ShadowingLessonPreview
              key={selected.id}
              item={selected}
              progress={progressOf(selected.id)}
              best={best.get(selected.id)}
              saved={isSaved(selected.id)}
              furigana={furigana}
              onToggleFurigana={() => setFurigana((v) => !v)}
              onToggleSave={() => {
                shadowingStorageService.toggleBookmark(learnerId, selected.id);
                setStorageVersion((v) => v + 1);
                // Giữ bài đang xem, kể cả khi bỏ lưu làm nó rời mục Đã lưu
                if (!pickedId) update({ muc: section, bai: String(selected.id) }, { replace: true });
              }}
              onStart={(url) => navigate(url)}
              onBack={closePreview}
            />
          ) : (
            <section className="shl-pv none" aria-label="Xem trước bài học">
              <Icon name="record_voice_over" size={34} />
              <p className="t">Chọn một bài để xem kịch bản</p>
              <p>Bạn sẽ thấy các câu, nghe giọng mẫu và chọn vai trước khi luyện.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
