import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { PREFECTURES } from '../../../data/japanMap';
import { roleplayService } from '../../../services/roleplayService';
import { shadowingStorageService } from '../../../services/shadowingStorageService';
import type { RoleplaySessionDetailsDto } from '../../../types/roleplay';
import type { ShadowingProgress } from '../../../types/shadowingProgress';
import { useExploreJourney } from '../../../views/explore/exploreStore';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { JpText } from '../JpText';
import { Logo } from '../Logo';
import { ProgressBar } from '../Progress';
import { Stepper } from '../Tabs';
import { cx, fmt } from '../utils';
import { recentRoleplaySessionId } from './recentRoleplay';
import { useLearnerAccount } from './useLearnerAccount';

const PREF_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));
/** Chữ Hán cho thứ tự chương (mẫu: 一, 二, 三…). Chương 0 là chương nhập môn: dùng 序 (mở đầu) thay cho 〇 vì 〇 trông như hai vòng tròn lồng nhau */
const KANJI_NUM = ['序', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

interface NavDef {
  id: string;
  label: string;
  icon: string;
  to?: string;
  /** Đường dẫn được coi là "đang ở mục này" */
  match?: (path: string) => boolean;
  /** Chưa có trang: hiện mờ, không bấm được */
  soon?: boolean;
}

const MAP_PATHS = (p: string) => p === '/' || p.startsWith('/explore');
const NAV: NavDef[] = [
  { id: 'map', label: 'Hành trình', icon: 'travel_explore', to: '/', match: MAP_PATHS },
  { id: 'role', label: 'Hội thoại AI', icon: 'forum', to: '/scenarios', match: (p) => p.startsWith('/scenarios') },
  { id: 'shadow', label: 'Shadowing', icon: 'record_voice_over', to: '/shadowing', match: (p) => p.startsWith('/shadowing') },
  // Flashcard có trong code nhưng chưa có trong thiết kế: đặt ngay dưới Shadowing, cùng kiểu
  { id: 'flash', label: 'Flashcard', icon: 'style', to: '/flashcards', match: (p) => p.startsWith('/flashcards') },
  { id: 'results', label: 'Kết quả', icon: 'insights', to: '/roleplay/results', match: (p) => p.startsWith('/roleplay/results') },
  { id: 'stamps', label: 'Sổ con dấu', icon: 'approval', to: '/stamps', match: (p) => p.startsWith('/stamps') },
];

export interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Khung đang ở dạng bản đồ hay trang (có thể trễ vài khung hình so với đường dẫn khi chuyển cảnh). Bỏ trống thì suy ra từ đường dẫn */
  onMap?: boolean;
}

/**
 * Thanh bên của học viên (thay Header + Navbar cũ). Trên bản đồ nó nổi, ở các trang khác áp sát mép trái (CSS theo lớp
 * is-page của khung). Nhóm "Đang học" lấy từ tiến độ thật: chương hiện tại, bài Shadowing đang dở, phiên hội thoại đang dở.
 */
export const AppSidebar: React.FC<AppSidebarProps> = ({ collapsed, onToggleCollapsed, onMap }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const { logout } = useAuth();
  const { user, credit } = useLearnerAccount();
  const { isDark, themeFor } = useTheme();
  const [open, setOpen] = useState<'chap' | 'cont' | 'conv' | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);

  // Đổi trang thì đóng mọi thứ đang mở
  useEffect(() => {
    setOpen(null);
    setAcctOpen(false);
  }, [path]);

  // Bấm ra ngoài hoặc Esc: đóng menu tài khoản và thẻ chi tiết
  useEffect(() => {
    if (!acctOpen && !open) return;
    const onDown = (e: PointerEvent) => {
      if (!sideRef.current?.contains(e.target as Node)) {
        setAcctOpen(false);
        setOpen(null);
      } else if (acctOpen && !acctRef.current?.contains(e.target as Node)) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAcctOpen(false);
      setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [acctOpen, open]);

  const go = (to: string) => navigate(to);
  const name = user?.fullName || user?.email || 'Học viên';
  const initial = name.trim().charAt(0).toUpperCase();
  const accountPages = ['/subscription', '/credits', '/profile', '/settings'];
  const onAccountPage = accountPages.some((p) => path.startsWith(p));

  // Trên bản đồ thanh bên dùng theme kham-pha (nền --paper-100 = #F6EFE2); ở các trang khác dùng hoc-tap (nền --paper-50 = #FFFFFF).
  // Chế độ tối: cả hai nơi đều dùng hoc-tap-dem (bản đồ vẫn giữ kham-pha, chỉ thanh bên nổi trên nó tối đi)
  return (
    <aside ref={sideRef} className="jx-side" data-theme={isDark ? themeFor('learn') : (onMap ?? MAP_PATHS(path)) ? 'kham-pha' : 'hoc-tap'} aria-label="Thanh điều hướng">
      {/* Hai lớp vỏ chồng nhau thay cho việc animate left/top/bottom/border-radius (design-handoff/transitions, bản B): chỉ transform và opacity */}
      <span className="jx-shell jx-shell--float" data-theme={isDark ? themeFor('learn') : 'kham-pha'} aria-hidden="true" />
      <span className="jx-shell jx-shell--dock" data-theme={isDark ? themeFor('learn') : 'hoc-tap'} aria-hidden="true" />
      <div className="jx-side-body">
      <div className="jx-side-top">
      {/* Thương hiệu: logo (thu gọn: mở thanh bên), chữ JCAP (về trang chủ), nút thu gọn */}
      <div className="jx-brand">
        <button
          type="button"
          className="jx-ib jx-brand-logo"
          onClick={collapsed ? onToggleCollapsed : () => go('/')}
          aria-label={collapsed ? 'Mở thanh bên' : 'JCAP, về trang chủ'}
        >
          <span className="jx-bl-mark">
            <Logo size={36} withName={false} />
          </span>
          <span className="jx-bl-open">
            <Icon name="left_panel_open" size={22} />
          </span>
          <span className="jx-tip" role="tooltip">
            Mở thanh bên
          </span>
        </button>
        <button type="button" className="jx-lbl jx-brand-name" onClick={() => go('/')} tabIndex={collapsed ? -1 : 0} aria-label="JCAP, về trang chủ">
          JCAP
        </button>
        <button type="button" className="jx-ib jx-brand-close" onClick={onToggleCollapsed} tabIndex={collapsed ? -1 : 0} aria-label="Đóng thanh bên">
          <Icon name="left_panel_close" size={22} />
          <span className="jx-tip" role="tooltip">
            Đóng thanh bên
          </span>
        </button>
      </div>

      <LearningGroup user={user} open={open} setOpen={setOpen} go={go} />

      <nav aria-label="Điều hướng chính" className="jx-group">
        <span className="jx-lbl jx-cap">Học</span>
        {NAV.map((n) => {
          const on = !!n.match?.(path);
          return n.soon ? (
            <span key={n.id} className="jx-row is-dim" title={`${n.label} (sắp có)`} aria-disabled="true">
              <Icon name={n.icon} size={22} />
              <span className="jx-lbl">{n.label}</span>
            </span>
          ) : (
            <button
              key={n.id}
              type="button"
              className={cx('jx-row', on && 'on')}
              style={{ color: 'var(--sumi)' }}
              onClick={() => go(n.to!)}
              aria-current={on ? 'page' : undefined}
              title={n.label}
            >
              <Icon name={n.icon} size={22} fill={on} />
              <span className="jx-lbl">{n.label}</span>
            </button>
          );
        })}
      </nav>

      </div>

      <div className="jx-group jx-side-bot" style={{ gap: 4, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <button type="button" className="jx-row" title={`Số dư ${fmt(credit)} Credit`} onClick={() => go('/subscription')}>
          <span className="jx-coin">
            <Icon name="toll" size={16} />
          </span>
          <span className="jx-lbl" style={{ flexGrow: 1 }}>
            Số dư
          </span>
          <span className="jx-lbl jx-lbl-fixed" style={{ fontSize: 13, fontWeight: 700, color: 'var(--credit)' }}>
            {fmt(credit)}
          </span>
        </button>

        <div ref={acctRef} className={cx('jx-acct', acctOpen && 'is-open')}>
          <div className="jx-acct-menu" role="menu" aria-label="Tài khoản">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 10px', marginBottom: 4, borderBottom: '1px solid var(--line)' }}>
              <Avatar url={user?.avatarUrl} initial={initial} size={36} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 700 }} className="truncate">
                  {name}
                </span>
                <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--sumi-muted)' }} className="truncate">
                  {user?.email}
                </span>
              </span>
            </div>
            <MenuItem icon="toll" label="Gói & Credit" on={path.startsWith('/subscription') || path.startsWith('/credits')} onClick={() => go('/subscription')}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--credit)' }}>{fmt(credit)}</span>
            </MenuItem>
            <MenuItem icon="person" label="Hồ sơ" on={path.startsWith('/profile')} onClick={() => go('/profile')} />
            <MenuItem icon="settings" label="Cài đặt" on={path.startsWith('/settings')} onClick={() => go('/settings')} />
            <span style={{ height: 1, margin: '4px 0', background: 'var(--line)' }} />
            <button type="button" role="menuitem" className="jx-mi" style={{ color: 'var(--danger)' }} onClick={() => logout()}>
              <Icon name="logout" size={20} />
              <span style={{ flexGrow: 1 }}>Đăng xuất</span>
            </button>
          </div>
          <button
            type="button"
            className={cx('jx-row', onAccountPage && 'on')}
            onClick={() => setAcctOpen(!acctOpen)}
            aria-haspopup="menu"
            aria-expanded={acctOpen}
            title="Tài khoản"
            style={{ height: 48, paddingLeft: 8, color: 'var(--sumi)' }}
          >
            <Avatar url={user?.avatarUrl} initial={initial} size={32} />
            <span className="jx-lbl" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, lineHeight: '20px' }} className="truncate">
                {name}
              </span>
              <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: 'var(--sumi-muted)' }}>Mục tiêu JLPT {user?.level || 'N5'}</span>
            </span>
            <span className="jx-lbl jx-lbl-fixed jx-acct-chev">
              <Icon name="expand_less" size={20} />
            </span>
          </button>
        </div>
      </div>
      </div>
    </aside>
  );
};

const Avatar: React.FC<{ url?: string; initial: string; size: number }> = ({ url, initial, size }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className="jx-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {url && !broken ? <img src={url} alt="" onError={() => setBroken(true)} /> : initial}
    </span>
  );
};

const MenuItem: React.FC<{ icon: string; label: string; on?: boolean; onClick: () => void; children?: React.ReactNode }> = ({ icon, label, on, onClick, children }) => (
  <button type="button" role="menuitem" className={cx('jx-mi', on && 'on')} onClick={onClick} aria-current={on ? 'page' : undefined}>
    <Icon name={icon} size={20} />
    <span style={{ flexGrow: 1 }}>{label}</span>
    {children}
  </button>
);

// ============================================================
// Nhóm "Đang học"
// ============================================================

type OpenKey = 'chap' | 'cont' | 'conv' | null;

const LearningGroup: React.FC<{
  user: { id?: string; email?: string } | null;
  open: OpenKey;
  setOpen: (k: OpenKey) => void;
  go: (to: string) => void;
}> = ({ user, open, setOpen, go }) => {
  const journey = useExploreJourney();
  const location = useLocation();
  const [shadow, setShadow] = useState<ShadowingProgress | null>(null);
  const [conv, setConv] = useState<RoleplaySessionDetailsDto | null>(null);

  // Bài Shadowing đang dở (lưu ở trình duyệt) và phiên hội thoại gần nhất còn đang mở: đọc lại mỗi lần đổi trang
  useEffect(() => {
    const learnerId = user?.id || user?.email || 'guest_learner';
    setShadow(shadowingStorageService.getLatestInProgress(learnerId));
    const sid = recentRoleplaySessionId();
    if (!sid) {
      setConv(null);
      return;
    }
    let cancelled = false;
    roleplayService
      .getSession(sid)
      .then((res) => {
        if (cancelled) return;
        const s = res.success ? res.data : undefined;
        setConv(s && (s.status === 'Active' || s.status === 'InProgress') ? s : null);
      })
      .catch(() => !cancelled && setConv(null));
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, location.pathname]);

  // Chương hiện tại = chương đã mở có thứ tự cao nhất
  const chapters = journey.data?.chapters ?? [];
  const unlocked = chapters.filter((c) => c.isUnlocked);
  const chapter = unlocked[unlocked.length - 1];
  const next = chapter ? chapters[chapters.indexOf(chapter) + 1] : undefined;
  const toggle = (k: Exclude<OpenKey, null>) => setOpen(open === k ? null : k);

  // Chỉ một mục hiện viên tại một thời điểm: đang có mục giữ mở thì chỉ mục đó hiện (rê chuột sang mục khác không làm hiện thêm);
  // không có mục nào giữ mở thì hiện mục đang rê chuột hoặc đang có focus bàn phím
  const [hovered, setHovered] = useState<Exclude<OpenKey, null> | null>(null);
  const [focused, setFocused] = useState<Exclude<OpenKey, null> | null>(null);
  const shown = (k: Exclude<OpenKey, null>) => (open ? open === k : hovered === k || focused === k);
  const dh = (k: Exclude<OpenKey, null>) => cx('jx-dh', open === k && 'is-open', shown(k) && 'is-show');
  const dhEvents = (k: Exclude<OpenKey, null>) => ({
    onMouseEnter: () => setHovered(k),
    onMouseLeave: () => setHovered((h) => (h === k ? null : h)),
    // Chỉ focus bằng bàn phím mới hiện viên (bấm chuột cũng gây focus nhưng đã có trạng thái "giữ mở")
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (e.target.matches(':focus-visible')) setFocused(k);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused((f) => (f === k ? null : f));
    },
  });

  if (!chapter && !shadow && !conv) return null;

  const missions = conv?.missions ?? [];
  const missionsDone = missions.filter((m) => m.isCompleted).length;
  const firstTodo = missions.findIndex((m) => !m.isCompleted);

  return (
    <div className="jx-group">
      <span className="jx-lbl jx-cap" style={{ color: 'var(--shu)' }}>
        Đang học
      </span>

      {chapter && (
        <div className={dh('chap')} {...dhEvents('chap')}>
          <button
            type="button"
            className="jx-row"
            style={{ color: 'var(--sumi)' }}
            onClick={() => toggle('chap')}
            aria-label={`${chapter.title}, ${chapter.stampCount} trên ${chapter.spotCount} dấu`}
          >
            <span className="jx-kanji" lang="ja">
              {KANJI_NUM[chapter.orderIndex] ?? chapter.orderIndex}
            </span>
            <span className="jx-lbl" style={{ flexGrow: 1 }}>
              {`Chương ${chapter.orderIndex}`}
            </span>
            <span className="jx-lbl jx-lbl-fixed" style={{ fontSize: 12, fontWeight: 700, color: 'var(--shu)' }}>
              {`${chapter.stampCount}/${chapter.spotCount}`}
            </span>
          </button>
          <div className="jx-fly">
            <div className="jx-pill">
              <span className="jx-kanji jx-kanji--lg" lang="ja">
                {KANJI_NUM[chapter.orderIndex] ?? chapter.orderIndex}
              </span>
              <span className="jx-pill-title" style={{ fontWeight: 600 }} title={chapter.title}>
                {chapter.title}
              </span>
              <span className="jx-sep" />
              <MiniBar value={chapter.stampCount} max={chapter.spotCount} />
              <span style={{ fontWeight: 700 }}>{`${chapter.stampCount}/${chapter.spotCount} dấu`}</span>
              <button type="button" className="jx-chev" onClick={() => toggle('chap')} aria-expanded={open === 'chap'} aria-label="Xem chi tiết chương">
                <Icon name="expand_more" size={22} />
              </button>
            </div>
            <div className="jx-drop">
              <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--sumi-muted)' }}>
                {chapter.prefectureIds.map((id) => PREF_BY_ID.get(id)?.nameVi).filter(Boolean).join(' và ')} ·{' '}
                {chapter.minLevel === chapter.maxLevel ? chapter.minLevel : `${chapter.minLevel}–${chapter.maxLevel}`}
              </span>
              <ThresholdBar value={chapter.stampCount} max={chapter.spotCount} mark={next ? next.unlockThresholdPercent : undefined} />
              <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--sumi-muted)' }}>
                <strong style={{ color: 'var(--sumi)' }}>{`${chapter.stampCount}/${chapter.spotCount} dấu.`}</strong>
                {next &&
                  !next.isUnlocked &&
                  ` Chương ${next.orderIndex} mở ở ${Math.ceil((next.unlockThresholdPercent * chapter.spotCount) / 100)} dấu.`}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {chapter.prefectureIds.map((id) => {
                  const p = PREF_BY_ID.get(id);
                  const s = journey.prefecture(id);
                  if (!p) return null;
                  const usable = !!s?.isOpen && !s.isLocked;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={cx('jx-pref-row', !usable && 'is-locked')}
                      disabled={!usable}
                      onClick={() => go(`/?tinh=${p.slug}`)}
                    >
                      <span style={{ flexGrow: 1, textAlign: 'left', fontWeight: 600 }}>
                        {p.nameVi}{' '}
                        <span lang="ja" style={{ fontFamily: 'var(--font-jp)', fontWeight: 500, color: 'var(--sumi-muted)' }}>
                          {p.nameJp}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s?.stampCount ? 'var(--shu)' : 'var(--sumi-muted)' }}>
                        {`${s?.stampCount ?? 0}/${s?.spotCount ?? 0}`}
                      </span>
                      {usable && <Icon name="chevron_right" size={18} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {shadow && (
        <div className={dh('cont')} {...dhEvents('cont')}>
          <button
            type="button"
            className="jx-row"
            style={{ color: 'var(--sumi)' }}
            onClick={() => toggle('cont')}
            aria-label={`Tiếp tục ${shadow.dialogueTitle ?? 'bài Shadowing'}`}
          >
            <span style={{ flex: 'none', position: 'relative', display: 'inline-flex' }}>
              <Icon name="record_voice_over" size={22} />
              <span className="jx-pulse" aria-hidden="true" />
            </span>
            <span className="jx-lbl" style={{ flexGrow: 1 }} title={shadow.dialogueTitle}>
              {shadow.dialogueTitle ?? 'Bài Shadowing'}
            </span>
            <span className="jx-lbl jx-lbl-fixed" style={{ fontSize: 12, fontWeight: 700, color: 'var(--shu)' }}>
              {`${shadow.completedSentenceCount}/${shadow.totalSentenceCount}`}
            </span>
          </button>
          <div className="jx-fly">
            <div className="jx-pill">
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--shu)', boxShadow: '0 0 0 4px var(--shu-soft)' }} />
              <span style={{ fontSize: 13, color: 'var(--sumi-muted)' }}>Tiếp tục</span>
              <span className="jx-pill-title" style={{ fontWeight: 700 }} title={shadow.dialogueTitle}>
                {shadow.dialogueTitle}
              </span>
              <span style={{ fontSize: 13, color: 'var(--sumi-muted)' }}>{`Shadowing ${shadow.completedSentenceCount}/${shadow.totalSentenceCount}`}</span>
              <button
                type="button"
                className="jx-play"
                onClick={() => go(`/shadowing/practice/${shadow.dialogueId}?role=${shadow.role}&resume=true`)}
                aria-label={`Tiếp tục ${shadow.dialogueTitle ?? 'bài Shadowing'}`}
              >
                <Icon name="play_arrow" size={20} fill />
              </button>
              <button type="button" className="jx-chev" onClick={() => toggle('cont')} aria-expanded={open === 'cont'} aria-label="Xem chi tiết bài đang học">
                <Icon name="expand_more" size={22} />
              </button>
            </div>
            <div className="jx-drop">
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 15, lineHeight: '22px', fontWeight: 700 }}>{shadow.dialogueTitle}</span>
                <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--sumi-muted)' }}>
                  {[shadow.subtitle || shadow.scenarioTitle, shadow.jlptLevel, `Vai ${shadow.role}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              {shadow.currentSentenceText && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--paper-100)' }}>
                  <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: 'var(--sumi-muted)' }}>Câu đang luyện</span>
                  <JpText text={shadow.currentSentenceText} size="sm" as="p" />
                </div>
              )}
              <ProgressBar
                value={shadow.completedSentenceCount}
                max={shadow.totalSentenceCount || 1}
                label={`${shadow.completedSentenceCount}/${shadow.totalSentenceCount} câu đã luyện`}
                tone="shu"
                size="sm"
              />
              <Button
                variant="primary"
                icon="play_arrow"
                block
                onClick={() => go(`/shadowing/practice/${shadow.dialogueId}?role=${shadow.role}&resume=true`)}
              >
                {`Tiếp tục từ câu ${shadow.currentSentenceIndex + 1}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {conv && (
        <div className={dh('conv')} {...dhEvents('conv')}>
          <button
            type="button"
            className="jx-row"
            style={{ color: 'var(--sumi)' }}
            onClick={() => toggle('conv')}
            aria-label={`Tiếp tục Hội thoại AI ${conv.scenarioTitle}`}
          >
            <Icon name="forum" size={22} />
            <span className="jx-lbl" style={{ flexGrow: 1 }} title={conv.scenarioTitle}>
              {conv.scenarioTitle}
            </span>
            <span className="jx-lbl jx-lbl-fixed" style={{ fontSize: 12, fontWeight: 700 }}>{`${missionsDone}/${missions.length}`}</span>
          </button>
          <div className="jx-fly">
            <div className="jx-pill">
              <Icon name="forum" size={20} />
              <span style={{ fontSize: 13, color: 'var(--sumi-muted)' }}>Hội thoại AI</span>
              <span className="jx-pill-title" style={{ fontWeight: 700 }} title={conv.scenarioTitle}>
                {conv.scenarioTitle}
              </span>
              <span style={{ fontSize: 13, color: 'var(--sumi-muted)' }}>{`${missionsDone}/${missions.length} nhiệm vụ`}</span>
              <button
                type="button"
                className="jx-play"
                onClick={() => go(`/scenarios/practice/${conv.sessionId ?? conv.id}`)}
                aria-label={`Tiếp tục hội thoại ${conv.scenarioTitle}`}
              >
                <Icon name="play_arrow" size={20} fill />
              </button>
              <button type="button" className="jx-chev" onClick={() => toggle('conv')} aria-expanded={open === 'conv'} aria-label="Xem chi tiết phiên hội thoại">
                <Icon name="expand_more" size={22} />
              </button>
            </div>
            <div className="jx-drop">
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 15, lineHeight: '22px', fontWeight: 700 }}>{conv.scenarioTitle}</span>
                <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--sumi-muted)' }}>
                  {[conv.aiPersona, conv.jlptLevel || conv.level, `${conv.messages?.length ?? 0} lượt thoại`].filter(Boolean).join(' · ')}
                </span>
              </span>
              {missions.length > 0 && (
                <Stepper
                  orientation="vertical"
                  steps={[...missions]
                    .sort((a, b) => a.order - b.order)
                    .map((m, i) => ({ label: m.content, status: m.isCompleted ? 'done' : i === firstTodo ? 'current' : 'todo' }))}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MiniBar: React.FC<{ value: number; max: number }> = ({ value, max }) => (
  <span style={{ position: 'relative', width: 64, height: 6, borderRadius: 3, background: 'var(--paper-200)', overflow: 'hidden' }} aria-hidden="true">
    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${max ? (value / max) * 100 : 0}%`, background: 'var(--shu)' }} />
  </span>
);

/** Thanh tiến độ chương, có vạch đánh dấu ngưỡng mở chương sau */
const ThresholdBar: React.FC<{ value: number; max: number; mark?: number }> = ({ value, max, mark }) => (
  <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--paper-200)' }} role="img" aria-label={`${value} trên ${max} dấu`}>
    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${max ? (value / max) * 100 : 0}%`, borderRadius: 4, background: 'var(--shu)' }} />
    {mark !== undefined && <span style={{ position: 'absolute', left: `${mark}%`, top: -4, width: 2, height: 16, background: 'var(--sumi)' }} />}
  </div>
);
