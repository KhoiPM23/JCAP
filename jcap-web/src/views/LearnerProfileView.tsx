import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { profileService } from '../services/profileService';
import { formatDateFull } from '../utils/dateUtils';
import type { LearnerProfile } from '../types/profile';
import { LearnerIntelligenceRadarCard } from '../components/roleplay/LearnerIntelligenceRadarCard';
import { useAuth } from '../contexts/AuthContext';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';

export const LearnerProfileView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Chế độ mô phỏng kiểm thử dành riêng cho Quản trị viên (Admin Test / Preview Mode)
  const [isAdminTestMode, setIsAdminTestMode] = useState<boolean>(false);

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

    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<LearnerProfile>;
      if (customEvent.detail) {
        setProfile(customEvent.detail);
      }
    };

    window.addEventListener('jcap_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-white rounded-xl border border-[#E6EDF5] p-12 text-center shadow-sm">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-[#0878EE] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-medium text-[#71809A]">Đang tải thông tin hồ sơ học viên...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 bg-red-50 text-[#D92D20] rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-xl">
            !
          </div>
          <h3 className="text-lg font-bold text-[#071A44] mb-2">Không thể tải thông tin hồ sơ</h3>
          <p className="text-sm text-[#71809A] mb-6 max-w-md mx-auto">{error || 'Dữ liệu hồ sơ không tìm thấy.'}</p>
          <Button variant="primary" onClick={fetchProfile}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  const formattedJoinDate = formatDateFull(profile.createdAt);
  const avatarInitial = profile.fullName ? profile.fullName.charAt(0).toUpperCase() : 'U';
  const isAdmin = user?.role?.toLowerCase() === 'admin' || profile.role?.toLowerCase() === 'admin';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Heading & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--sumi)] tracking-tight">
              {isAdmin ? 'Hồ sơ Quản trị viên' : 'Hồ sơ học viên'}
            </h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
              isAdmin
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-blue-50 text-[var(--ai)] border-blue-200'
            }`}>
              {isAdmin ? 'Admin Authority' : 'Learner Profile'}
            </span>
          </div>
          <p className="text-sm text-[var(--sumi-faint)] mt-1">
            {isAdmin
              ? 'Quản lý tài khoản quản trị hệ thống JCAP và mô phỏng trải nghiệm học viên'
              : 'Quản lý thông tin tài khoản và hành trình làm chủ tiếng Nhật đàm thoại của bạn'}
          </p>
        </div>

        {/* Toggle Chế độ kiểm thử dành riêng cho Quản trị viên */}
        {isAdmin && (
          <div className="flex items-center gap-2.5 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-blue-50 p-2 sm:px-3 sm:py-2 rounded-xl border border-purple-200/80 shadow-2xs">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-purple-950 flex items-center gap-1">
                                <span>Chế độ mô phỏng Học viên</span>
              </span>
              <span className="text-[10px] text-purple-700/80">
                {isAdminTestMode ? 'Đang bật: Xem toàn bộ Radar & Telemetry' : 'Đang tắt: Giao diện thuần quản trị'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                ukiyoSound.playSubtleTap();
                setIsAdminTestMode(!isAdminTestMode);
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                isAdminTestMode ? 'bg-purple-600' : 'bg-slate-300'
              }`}
              title="Bật/Tắt chế độ xem trước Radar Năng lực Học viên"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  isAdminTestMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Main Profile Card */}
      <div className="bg-white rounded-2xl border border-[var(--line)] shadow-xs overflow-hidden transition-all">
        {/* Banner Decorative Header */}
        <div className={`h-32 sm:h-36 ${
          isAdmin
            ? 'bg-gradient-to-r from-slate-800 via-indigo-900 to-purple-900'
            : 'bg-gradient-to-r from-[#0878EE] via-blue-500 to-sky-400'
        }`}></div>

        <div className="px-6 sm:px-8 pb-8">
          {/* Avatar & Identity Header */}
          <div className="relative flex flex-col md:flex-row md:items-end justify-between -mt-14 sm:-mt-16 mb-8 gap-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 text-center sm:text-left">
              {/* Avatar circle */}
              <div className="relative shrink-0">
                {profile.profilePictureUrl ? (
                  <img
                    src={profile.profilePictureUrl}
                    alt={profile.fullName}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white shadow-md bg-white ring-1 ring-[var(--line)]"
                  />
                ) : (
                  <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full font-bold text-3xl sm:text-4xl flex items-center justify-center border-4 border-white shadow-md ring-1 ring-[var(--line)] ${
                    isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-[var(--ai)]'
                  }`}>
                    {avatarInitial}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" title="Tài khoản đang hoạt động"></span>
              </div>

              {/* Name, Badge & Email Group */}
              <div className="flex flex-col justify-end pt-3 sm:pt-5 pb-1 gap-1.5">
                <div className="flex items-center gap-3.5 justify-center sm:justify-start flex-wrap">
                  <h2 className="text-2xl sm:text-3xl font-bold text-[var(--sumi)] tracking-tight leading-tight">
                    {profile.fullName}
                  </h2>
                  {!isAdmin && (
                    <span className="inline-flex items-center bg-blue-50 text-[var(--ai)] text-xs font-bold px-3 py-1 rounded-full border border-blue-200/80 shadow-xs tracking-wide">
                      JLPT {profile.jlptLevel}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="inline-flex items-center bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1 rounded-full border border-purple-200/80 shadow-xs tracking-wide">
                      ⚡ Administrator
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-[var(--sumi-faint)]">{profile.email}</p>
                <div className="flex items-center gap-2 justify-center sm:justify-start mt-0.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                    isAdmin
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {isAdmin ? 'Quản trị viên Hệ thống (System Admin)' : 'Học viên Đàm thoại (Learner)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Account Actions */}
            <div className="flex flex-col sm:flex-row justify-center md:justify-end gap-3 pb-1">
              <Button
                variant="secondary"
                onClick={() => navigate('/profile/change-password')}
                className="shadow-xs text-xs font-semibold"
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1V7a5 5 0 00-10 0v4H6a2 2 0 00-2 2v6a2 2 0 002 2zm3-10V7a3 3 0 016 0v4H9z" />
                </svg>
                Đổi mật khẩu
              </Button>
              <Button
                variant="primary"
                onClick={() => navigate('/profile/edit')}
                className="shadow-xs text-xs font-semibold"
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Chỉnh sửa hồ sơ
              </Button>
            </div>
          </div>

          {/* Detailed Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 pt-2">
            {/* Email Field */}
            <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-[var(--paper-50)] border border-[var(--line)]">
              <div className="p-2.5 bg-white text-[var(--ai)] rounded-xl border border-[var(--line)] shadow-2xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider">
                  Địa chỉ Email
                </span>
                <span className="text-sm sm:text-base font-semibold text-[var(--sumi)]">{profile.email}</span>
              </div>
            </div>

            {/* Phone Number Field */}
            <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-[var(--paper-50)] border border-[var(--line)]">
              <div className="p-2.5 bg-white text-[var(--ai)] rounded-xl border border-[var(--line)] shadow-2xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider">
                  Số điện thoại
                </span>
                <span className="text-sm sm:text-base font-semibold text-[var(--sumi)]">
                  {profile.phoneNumber || 'Chưa cập nhật số điện thoại'}
                </span>
              </div>
            </div>

            {/* Field Trình độ JLPT mục tiêu HOẶC Phạm vi Quản trị */}
            {!isAdmin ? (
              <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-[var(--paper-50)] border border-[var(--line)]">
                <div className="p-2.5 bg-white text-[var(--ai)] rounded-xl border border-[var(--line)] shadow-2xs shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider">
                    Trình độ JLPT mục tiêu
                  </span>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-sm sm:text-base font-bold text-[var(--ai)] whitespace-nowrap">
                      Cấp độ {profile.jlptLevel}
                    </span>
                    <span className="inline-flex items-center text-[11px] font-medium text-[var(--sumi-faint)] bg-white px-2 py-0.5 rounded-lg border border-[var(--line)]">
                      Chuẩn N5 – N3
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--sumi-faint)] mt-0.5">
                    Áp dụng cho bài học, từ vựng và kịch bản hội thoại AI
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-purple-50/50 border border-purple-200/70">
                <div className="p-2.5 bg-white text-purple-700 rounded-xl border border-purple-200 shadow-2xs shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wider">
                    Phạm vi Quản trị & Quyền lực
                  </span>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-sm sm:text-base font-bold text-purple-950 whitespace-nowrap">
                      Toàn quyền Hệ thống
                    </span>
                    <span className="inline-flex items-center text-[11px] font-bold text-purple-800 bg-white px-2 py-0.5 rounded-lg border border-purple-200">
                      Super Admin
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800/80 mt-0.5">
                    Toàn quyền thiết kế kịch bản, giám sát Telemetry và cấu hình động cơ AI
                  </p>
                </div>
              </div>
            )}

            {/* Join Date */}
            <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-[var(--paper-50)] border border-[var(--line)]">
              <div className="p-2.5 bg-white text-[var(--ai)] rounded-xl border border-[var(--line)] shadow-2xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-[var(--sumi-faint)] uppercase tracking-wider">
                  Ngày tham gia
                </span>
                <span className="text-sm sm:text-base font-semibold text-[var(--sumi)]">{formattedJoinDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hiển thị Bản đồ Năng lực Thực chiến:
          - Với Learner: Luôn hiển thị tự nhiên
          - Với Admin: Mặc định ẩn để không bị thừa thãi dữ liệu rác, CHỈ hiển thị khi bật "Chế độ mô phỏng Học viên (Test Mode)" */}
      {(!isAdmin || isAdminTestMode) ? (
        <div className="space-y-3 animate-fadeIn">
          {isAdmin && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-purple-100/70 border border-purple-200 text-purple-950 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                                <span>Bạn đang xem bản đồ năng lực ở Chế độ Mô phỏng Kiểm thử (Admin Test Mode)</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAdminTestMode(false)}
                className="text-purple-800 hover:text-purple-950 underline font-bold cursor-pointer"
              >
                Tắt mô phỏng ✕
              </button>
            </div>
          )}
          <LearnerIntelligenceRadarCard
            onNavigateToScenario={(scenarioId) => {
              if (scenarioId) {
                navigate(`/scenarios?id=${scenarioId}`);
              } else {
                navigate('/scenarios');
              }
            }}
          />
        </div>
      ) : (
        <div className="p-6 rounded-2xl border border-[var(--line)] bg-white text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto text-xl font-bold shadow-2xs">
            
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[var(--sumi)]">Bảng điều khiển Quản trị Hệ thống</h3>
            <p className="text-xs text-[var(--sumi-faint)] max-w-md mx-auto leading-relaxed">
              Tài khoản Admin không có hồ sơ đàm thoại cá nhân để tránh làm sai lệch dữ liệu học tập. Bật chế độ kiểm thử nếu bạn muốn xem trước giao diện và đo lường của học viên.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              ukiyoSound.playSubtleTap();
              setIsAdminTestMode(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
          >
                        <span>Bật Chế độ mô phỏng Học viên (Test Mode)</span>
          </button>
        </div>
      )}
    </div>
  );
};
