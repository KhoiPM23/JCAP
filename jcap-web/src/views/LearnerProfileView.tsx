import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, CreditBadge, EmptyState, Icon, JlptBadge, SegmentedControl } from '../components/jcap';
import { useAuth } from '../contexts/AuthContext';
import { placementTestService } from '../services/placementTestService';
import { profileService } from '../services/profileService';
import { roleplayResultService } from '../services/roleplayResultService';
import { shadowingService } from '../services/shadowingService';
import { formatDateFull, formatDateTime } from '../utils/dateUtils';
import type { PlacementTestCompleteResponseDto, PlacementTestStatusDto } from '../types/placementTest';
import { resolveMediaUrl } from '../utils/apiBase';
import type { JLPTLevel, LearnerProfile } from '../types/profile';
import { useExploreJourney } from './explore/exploreStore';

/**
 * Hồ sơ học viên (design-handoff mục 5): cột trái thẻ danh tính, cột phải mục tiêu JLPT + số liệu học, thông tin tài khoản,
 * bảo mật, Gói và Credit, Đăng xuất. Dữ liệu thật từ profileService; số liệu học đọc từ lịch sử có sẵn.
 */
export const LearnerProfileView: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const journey = useExploreJourney();
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);
  const [roleplayCount, setRoleplayCount] = useState<number | null>(null);
  const [shadowingCount, setShadowingCount] = useState<number | null>(null);
  const [placementStatus, setPlacementStatus] = useState<PlacementTestStatusDto | null>(null);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await profileService.getProfile();
      if (res.success && res.data) {
        setProfile(res.data);
      } else {
        setError(res.message || 'Không thể tải thông tin hồ sơ.');
      }
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // Số liệu học: số phiên Hội thoại AI và buổi Shadowing đã lưu (chỉ đọc)
    roleplayResultService
      .getHistory(1, 1)
      .then((r) => r.success && r.data && setRoleplayCount(r.data.totalCount))
      .catch(() => {});
    shadowingService
      .getHistory()
      .then((r) => r.success && r.data && setShadowingCount(r.data.length))
      .catch(() => {});
    placementTestService
      .getStatus()
      .then((r) => r.success && r.data && setPlacementStatus(r.data))
      .catch(() => {});

    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<LearnerProfile>;
      if (customEvent.detail && 'jlptLevel' in customEvent.detail) setProfile(customEvent.detail);
    };
    window.addEventListener('jcap_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
  }, []);

  // Giữ tương thích ngược nếu người dùng mở liên kết cũ /profile#radar-map
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#radar' || hash === '#radar-map') {
      navigate('/profile/competency', { replace: true });
    }
  }, [navigate]);

  /** Đổi mục tiêu JLPT ngay tại trang (cùng API với trang Chỉnh sửa hồ sơ) */
  const changeLevel = async (level: string) => {
    if (!profile || level === profile.jlptLevel) return;
    setSavingLevel(true);
    setLevelError(null);
    const res = await profileService.updateProfile({
      fullName: profile.fullName,
      phoneNumber: profile.phoneNumber,
      profilePictureUrl: profile.profilePictureUrl,
      jlptLevel: level as JLPTLevel,
    });
    setSavingLevel(false);
    if (res.success && res.data) setProfile(res.data);
    else setLevelError(res.message || 'Chưa đổi được mục tiêu. Hãy thử lại.');
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1040px] py-16 text-center text-sm text-sumi-muted" role="status">
        <Icon name="progress_activity" spin size={28} className="mx-auto mb-3 text-ai" />
        Đang tải hồ sơ…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-[1040px] py-12">
        <EmptyState icon="error" title="Không thể tải thông tin hồ sơ" action={<Button variant="primary" onClick={fetchProfile}>Thử lại</Button>}>
          {error || 'Dữ liệu hồ sơ không tìm thấy.'}
        </EmptyState>
      </div>
    );
  }

  const avatarInitial = profile.fullName ? profile.fullName.charAt(0).toUpperCase() : 'U';
  const stamps = journey.data?.chapters.reduce((sum, c) => sum + c.stampCount, 0);
  const credit = typeof profile.creditBalance === 'number' ? profile.creditBalance : 0;

  const rows: Array<{ icon: string; label: string; value: React.ReactNode; extra?: React.ReactNode }> = [
    { icon: 'mail', label: 'Email', value: profile.email, extra: <Badge tone="success" icon="verified">Đã xác minh</Badge> },
    {
      icon: 'call',
      label: 'Số điện thoại',
      value: profile.phoneNumber || <span className="text-sumi-muted">Chưa có</span>,
      extra: !profile.phoneNumber ? (
        <Button variant="ghost" size="sm" icon="add" onClick={() => navigate('/profile/edit')}>
          Thêm số điện thoại
        </Button>
      ) : undefined,
    },
    { icon: 'calendar_month', label: 'Ngày tham gia', value: formatDateFull(profile.createdAt) },
  ];

  return (
    <div className="relative bg-transparent">
      {/* Nền sóng biển nan quạt Seigaiha thanh nhã */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl seigaiha-subtle opacity-35" />
      <div className="mx-auto flex max-w-[1040px] flex-col gap-6 pb-10">
        <h1 className="m-0 text-[28px] font-bold leading-[38px]">Hồ sơ</h1>

        <div className="flex flex-wrap items-start gap-6">
          {/* Thẻ danh tính */}
          <section
            aria-label="Thông tin chính"
            className="flex max-w-[320px] flex-[1_1_280px] flex-col items-center gap-3.5 rounded-jc-xl border border-line bg-paper-50 px-6 py-7 text-center"
          >
            <div className="relative">
              {profile.profilePictureUrl ? (
                <img src={resolveMediaUrl(profile.profilePictureUrl)} alt={profile.fullName} className="h-[104px] w-[104px] rounded-full object-cover" />
              ) : (
                <span className="inline-flex h-[104px] w-[104px] items-center justify-center rounded-full bg-sora text-[40px] font-bold text-on-sora">
                  {avatarInitial}
                </span>
              )}
              <button
                type="button"
                aria-label="Đổi ảnh đại diện"
                onClick={() => navigate('/profile/edit')}
                className="absolute -bottom-0.5 -right-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-paper-50 bg-ai text-on-ai hover:bg-ai-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Icon name="photo_camera" size={20} />
              </button>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <h2 className="m-0 text-[22px] font-bold leading-[30px]">{profile.fullName}</h2>
              <span className="text-sm text-sumi-muted">{profile.email}</span>
              <span className="flex gap-1.5">
                <JlptBadge level={profile.jlptLevel} />
                <Badge tone="neutral">{profile.role === 'Learner' ? 'Học viên' : profile.role}</Badge>
              </span>
            </div>
            <p className="m-0 text-[13px] leading-5 text-sumi-muted">{`Tham gia từ ${formatDateFull(profile.createdAt)}`}</p>
            <Button variant="secondary" block icon="edit" onClick={() => navigate('/profile/edit')}>
              Chỉnh sửa hồ sơ
            </Button>
          </section>

          <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
            {/* Mục tiêu JLPT + số liệu */}
            <section aria-labelledby="goal-h" className="flex flex-col gap-3.5 rounded-jc-lg border border-line bg-paper-50 px-6 py-[22px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 id="goal-h" className="m-0 text-[17px] font-semibold leading-6">
                    Mục tiêu JLPT
                  </h2>
                  <p className="m-0 text-sm leading-[22px] text-sumi-muted">Kịch bản, bài Shadowing và từ vựng gợi ý sẽ ưu tiên cấp này.</p>
                </div>
                <SegmentedControl ariaLabel="Cấp JLPT mục tiêu" options={['N5', 'N4', 'N3']} value={profile.jlptLevel} onChange={changeLevel} />
              </div>
              {(savingLevel || levelError) && (
                <p role="status" className={`m-0 text-[13px] ${levelError ? 'text-danger' : 'text-sumi-muted'}`}>
                  {levelError || 'Đang lưu mục tiêu…'}
                </p>
              )}
              <div className="grid grid-cols-3 gap-3">
                <Stat value={roleplayCount} label="phiên Hội thoại AI" />
                <Stat value={shadowingCount} label="buổi luyện Shadowing" />
                <Stat value={stamps ?? null} label="con dấu Khám phá" />
              </div>
              <div>
                <Button variant="ghost" size="sm" iconRight="arrow_forward" onClick={() => navigate('/stamps')}>
                  Xem sổ con dấu
                </Button>
              </div>
            </section>

            {/* Đánh giá đầu vào (Placement Test) & Lịch sử xếp lớp riêng */}
            {(() => {
              const ptState = placementStatus?.placementTestStatus ?? profile.placementTestStatus ?? 'NotStarted';
              const activeSessionId = placementStatus?.activeSessionId ?? null;
              const allowRetake = placementStatus?.allowRetakeForTesting ?? false;
              const canStartOrRetake = placementStatus?.canStartOrRetake ?? (ptState !== 'Completed' || allowRetake || activeSessionId !== null);
              const estLevel = placementStatus?.initialEstimatedLevel ?? profile.initialEstimatedLevel;
              const confTier = placementStatus?.initialConfidenceTier ?? profile.initialConfidenceTier;
              const completedAt = placementStatus?.placementTestCompletedAtUtc ?? profile.placementTestCompletedAtUtc;
              const snapshotJson = placementStatus?.initialProficiencySnapshotJson ?? profile.initialProficiencySnapshotJson;

              let parsedSnapshot: PlacementTestCompleteResponseDto | null = null;
              if (snapshotJson) {
                try {
                  parsedSnapshot = JSON.parse(snapshotJson) as PlacementTestCompleteResponseDto;
                } catch {
                  parsedSnapshot = null;
                }
              }

              const statusBadge =
                ptState === 'Completed'
                  ? { tone: 'success' as const, label: 'Đã hoàn thành' }
                  : activeSessionId
                  ? { tone: 'info' as const, label: 'Đang làm dở' }
                  : ptState === 'Skipped'
                  ? { tone: 'neutral' as const, label: 'Đã bỏ qua' }
                  : ptState === 'InsufficientEvidence'
                  ? { tone: 'warning' as const, label: 'Chưa đủ dữ liệu' }
                  : { tone: 'neutral' as const, label: 'Chưa thực hiện' };

              return (
                <section aria-labelledby="placement-h" className="flex flex-col gap-3.5 rounded-jc-lg border border-line bg-paper-50 px-6 py-[22px]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 id="placement-h" className="m-0 text-[17px] font-semibold leading-6">
                          Đánh giá đầu vào (Placement Test)
                        </h2>
                        <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
                      </div>
                      <p className="m-0 text-sm leading-[22px] text-sumi-muted">
                        Phỏng vấn tình huống Khách sạn Sakura (0 Credit) giúp ước lượng năng lực giao tiếp ban đầu từ N5 đến N3.
                      </p>
                    </div>
                  </div>

                  {estLevel && (
                    <div className="grid grid-cols-1 gap-3 rounded-jc-md border border-line bg-paper-100/70 p-3.5 sm:grid-cols-3">
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-sumi-muted">Trình độ ước lượng</span>
                        <span className="mt-0.5 inline-block text-xl font-black text-ai font-mono">{estLevel}</span>
                      </div>
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-sumi-muted">Độ tin cậy / Điểm</span>
                        <span className="mt-0.5 block text-sm font-bold text-sumi">
                          {confTier || '—'}
                          {parsedSnapshot?.overallScore != null ? ` • ${parsedSnapshot.overallScore}/100` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-sumi-muted">Lần cập nhật gần nhất</span>
                        <span className="mt-0.5 block text-xs font-medium text-sumi">
                          {completedAt ? formatDateTime(completedAt) : '—'}
                        </span>
                      </div>
                    </div>
                  )}

                  {activeSessionId && (
                    <div className="rounded-jc-md border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-900">
                      Bạn đang có một phiên đánh giá chưa hoàn thành (#{activeSessionId}). Bạn có thể <strong>tiếp tục ngay tại điểm đang dừng</strong> hoặc <strong>huỷ bài đang dở để làm lại từ đầu</strong> (bài dở sẽ không lưu vào lịch sử).
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                    {activeSessionId ? (
                      <>
                        <Button variant="primary" size="sm" icon="play_arrow" onClick={() => navigate('/placement-test')}>
                          Tiếp tục bài đang dở
                        </Button>
                        <Button variant="secondary" size="sm" icon="restart_alt" onClick={() => navigate('/placement-test?reset=1')}>
                          Làm lại bài mới (Huỷ bài cũ)
                        </Button>
                      </>
                    ) : canStartOrRetake ? (
                      <Button
                        variant={ptState === 'Completed' ? 'secondary' : 'primary'}
                        size="sm"
                        icon={ptState === 'Completed' ? 'restart_alt' : 'play_arrow'}
                        onClick={() => navigate(ptState === 'Completed' ? '/placement-test?reset=1' : '/placement-test')}
                      >
                        {ptState === 'Completed' ? 'Làm lại bài đánh giá' : 'Bắt đầu đánh giá đầu vào (0 Credit)'}
                      </Button>
                    ) : null}

                    <Button variant="ghost" size="sm" icon="history" onClick={() => navigate('/placement-test/history')}>
                      Xem lịch sử xếp lớp
                    </Button>
                  </div>

                  {parsedSnapshot?.disclaimer && (
                    <p className="m-0 text-[11px] italic text-sumi-faint">{parsedSnapshot.disclaimer}</p>
                  )}
                </section>
              );
            })()}

            {/* Thông tin tài khoản */}
            <section aria-labelledby="info-h" className="flex flex-col rounded-jc-lg border border-line bg-paper-50 px-6 py-2">
              <h2 id="info-h" className="mb-1.5 mt-3.5 text-[17px] font-semibold leading-6">
                Thông tin tài khoản
              </h2>
              {rows.map((r) => (
                <div key={r.label} className="flex min-h-14 flex-wrap items-center gap-3 border-t border-line py-2">
                  <Icon name={r.icon} size={22} style={{ color: 'var(--sumi-muted)' }} />
                  <span className="flex-[0_0_140px] text-sm text-sumi-muted">{r.label}</span>
                  <span className="min-w-0 flex-[1_1_200px] text-[15px] font-medium leading-[22px]">{r.value}</span>
                  {r.extra}
                </div>
              ))}
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Bảo mật */}
              <section aria-labelledby="sec-h" className="flex flex-col gap-3 rounded-jc-lg border border-line bg-paper-50 px-6 py-[22px]">
                <h2 id="sec-h" className="m-0 text-[17px] font-semibold leading-6">
                  Bảo mật
                </h2>
                <div className="flex items-center justify-between gap-2.5">
                  <span className="flex flex-col">
                    <span className="text-[15px] font-medium leading-[22px]">Mật khẩu</span>
                    <span className="text-[13px] leading-5 text-sumi-muted">Đổi định kỳ để giữ tài khoản an toàn</span>
                  </span>
                  <Button variant="secondary" size="sm" icon="lock" onClick={() => navigate('/profile/change-password')}>
                    Đổi mật khẩu
                  </Button>
                </div>
              </section>

              {/* Gói và Credit */}
              <section aria-labelledby="cr-h" className="flex flex-col gap-3 rounded-jc-lg bg-credit-soft px-6 py-[22px]">
                <h2 id="cr-h" className="m-0 text-[17px] font-semibold leading-6">
                  Gói và Credit
                </h2>
                <CreditBadge amount={credit} size="lg" />
                <p className="m-0 text-sm leading-[22px]">Credit dùng cho Hội thoại AI và mở thêm thẻ học khi hết hạn mức của gói.</p>
                <button type="button" onClick={() => navigate('/subscription')} className="self-start text-sm font-semibold text-ai hover:underline">
                  Xem Gói &amp; Credit
                </button>
              </section>
            </div>

          </div>
        </div>

        {/* Thẻ liên kết gọn sang trang Năng lực cá nhân chuyên biệt */}
        <section
          aria-label="Năng lực cá nhân"
          className="flex flex-wrap items-center justify-between gap-4 rounded-jc-lg border border-line bg-paper-50 px-6 py-4 shadow-2xs"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ai/25 bg-ai-soft font-serif text-lg font-black text-ai select-none"
              aria-hidden="true"
            >
              総
            </div>
            <div className="min-w-0">
              <h2 className="m-0 text-[16px] font-semibold leading-6 text-sumi">
                Năng lực cá nhân
              </h2>
              <p className="m-0 text-[13px] leading-5 text-sumi-muted">
                Xem chỉ số phản xạ, độ chuẩn trợ từ, kính ngữ và lộ trình hội thoại thích ứng.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon="psychology" onClick={() => navigate('/profile/competency')}>
            Mở Năng lực cá nhân
          </Button>
        </section>

        {/* Chân trang tài khoản & Đăng xuất */}
        <div className="flex items-center justify-between border-t border-[var(--line)] pt-6 mt-4">
          <p className="text-xs text-[var(--sumi-muted)]">
            Phiên bản JCAP • Phản xạ đối thoại & Đánh giá năng lực tự động
          </p>
          <Button variant="danger" icon="logout" onClick={() => logout()}>
            Đăng xuất
          </Button>
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ value: number | null; label: string }> = ({ value, label }) => (
  <div className="flex flex-col gap-0.5 rounded-jc-md bg-paper-100 px-3.5 py-3">
    <span className="text-[22px] font-bold leading-[30px] tabular-nums">{value === null ? '—' : value.toLocaleString('vi-VN')}</span>
    <span className="text-[13px] leading-[18px] text-sumi-muted">{label}</span>
  </div>
);
