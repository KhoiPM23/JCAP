import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { profileService } from '../services/profileService';
import type { LearnerProfile } from '../types/profile';

export const LearnerProfileView: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const formattedJoinDate = (() => {
    try {
      const date = new Date(profile.createdAt);
      return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    } catch {
      return profile.createdAt;
    }
  })();

  const avatarInitial = profile.fullName ? profile.fullName.charAt(0).toUpperCase() : 'U';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Heading & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#071A44] tracking-tight">Hồ sơ học viên</h1>
          <p className="text-sm text-[#71809A] mt-1">
            Quản lý thông tin tài khoản và trình độ tiếng Nhật của bạn
          </p>
        </div>
      </div>

      {/* Main Profile Card */}
      <div className="bg-white rounded-xl border border-[#E6EDF5] shadow-sm overflow-hidden">
        {/* Banner Decorative Header */}
        <div className="h-32 sm:h-36 bg-gradient-to-r from-[#0878EE] via-blue-500 to-sky-400"></div>

        <div className="px-6 sm:px-8 pb-8">
          {/* Avatar & Identity Header - Avatar overlaps banner, text sits comfortably on white card */}
          <div className="relative flex flex-col md:flex-row md:items-end justify-between -mt-14 sm:-mt-16 mb-8 gap-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 text-center sm:text-left">
              {/* Avatar circle */}
              <div className="relative flex-shrink-0">
                {profile.profilePictureUrl ? (
                  <img
                    src={profile.profilePictureUrl}
                    alt={profile.fullName}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white shadow-md bg-white ring-1 ring-[#E6EDF5]"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-blue-100 text-[#0878EE] font-bold text-3xl sm:text-4xl flex items-center justify-center border-4 border-white shadow-md ring-1 ring-[#E6EDF5]">
                    {avatarInitial}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full" title="Tài khoản đang hoạt động"></span>
              </div>

              {/* Name, Badge & Email Group - Placed clearly on white background below banner */}
              <div className="flex flex-col justify-end pt-3 sm:pt-5 pb-1 gap-1.5">
                <div className="flex items-center gap-3.5 justify-center sm:justify-start flex-wrap">
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#071A44] tracking-tight leading-tight">
                    {profile.fullName}
                  </h2>
                  <span className="inline-flex items-center bg-blue-50 text-[#0878EE] text-xs font-bold px-3 py-1 rounded-full border border-blue-200/80 shadow-xs tracking-wide">
                    JLPT {profile.jlptLevel}
                  </span>
                </div>
                <p className="text-sm font-medium text-[#71809A]">{profile.email}</p>
                <div className="flex items-center gap-2 justify-center sm:justify-start mt-0.5">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                    {profile.role === 'Learner' ? 'Học viên (Learner)' : profile.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex justify-center md:justify-end pb-1">
              <Button
                variant="primary"
                onClick={() => navigate('/profile/edit')}
                className="shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Chỉnh sửa hồ sơ
              </Button>
            </div>
          </div>

          {/* Detailed Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* Email Field */}
            <div className="flex items-start gap-3.5 p-5 rounded-xl bg-[#F4F9FE] border border-[#E6EDF5]">
              <div className="p-2.5 bg-white text-[#0878EE] rounded-lg border border-[#E6EDF5] shadow-xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-[#71809A] uppercase tracking-wider">
                  Địa chỉ Email
                </span>
                <span className="text-base font-semibold text-[#071A44]">{profile.email}</span>
              </div>
            </div>

            {/* Phone Number Field */}
            <div className="flex items-start gap-3.5 p-5 rounded-xl bg-[#F4F9FE] border border-[#E6EDF5]">
              <div className="p-2.5 bg-white text-[#0878EE] rounded-lg border border-[#E6EDF5] shadow-xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-[#71809A] uppercase tracking-wider">
                  Số điện thoại
                </span>
                <span className="text-base font-semibold text-[#071A44]">
                  {profile.phoneNumber || 'Chưa cập nhật số điện thoại'}
                </span>
              </div>
            </div>

            {/* JLPT Level Target */}
            <div className="flex items-start gap-3.5 p-5 rounded-xl bg-[#F4F9FE] border border-[#E6EDF5]">
              <div className="p-2.5 bg-white text-[#0878EE] rounded-lg border border-[#E6EDF5] shadow-xs flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-xs font-semibold text-[#71809A] uppercase tracking-wider">
                  Trình độ JLPT mục tiêu
                </span>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-base font-bold text-[#0878EE] whitespace-nowrap">
                    Cấp độ {profile.jlptLevel}
                  </span>
                  <span className="inline-flex items-center text-xs font-medium text-[#71809A] bg-white px-2 py-0.5 rounded border border-[#E6EDF5]">
                    Chuẩn N5 – N3
                  </span>
                </div>
                <p className="text-xs text-[#71809A] mt-0.5">
                  Áp dụng cho bài học, từ vựng và kịch bản hội thoại AI
                </p>
              </div>
            </div>

            {/* Join Date */}
            <div className="flex items-start gap-3.5 p-5 rounded-xl bg-[#F4F9FE] border border-[#E6EDF5]">
              <div className="p-2.5 bg-white text-[#0878EE] rounded-lg border border-[#E6EDF5] shadow-xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-[#71809A] uppercase tracking-wider">
                  Ngày tham gia
                </span>
                <span className="text-base font-semibold text-[#071A44]">{formattedJoinDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
