import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Toast, type ToastType } from '../components/ui/Toast';
import { profileService } from '../services/profileService';
import type { JLPTLevel } from '../types/profile';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

// JCAP JLPT Levels strictly restricted to N5, N4, N3 (NO N2, NO N1)
const AVAILABLE_JLPT_LEVELS: JLPTLevel[] = ['N5', 'N4', 'N3'];

export const UpdateProfileView: React.FC = () => {
  const navigate = useNavigate();

  // Form states
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [jlptLevel, setJlptLevel] = useState<JLPTLevel>('N5');
  const [email, setEmail] = useState('');

  // UI / Async states
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; phoneNumber?: string }>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastType) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load existing profile to populate form
  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const res = await profileService.getProfile();
        if (res.success && res.data) {
          const p = res.data;
          setFullName(p.fullName || '');
          setPhoneNumber(p.phoneNumber || '');
          setProfilePictureUrl(p.profilePictureUrl || '');
          setJlptLevel(p.jlptLevel || 'N5');
          setEmail(p.email || '');
        } else {
          addToast('Không thể tải thông tin hồ sơ hiện tại.', 'error');
        }
      } catch (err: any) {
        addToast(err.message || 'Lỗi khi tải hồ sơ.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Validation day du cho UC08
  const validateForm = (): boolean => {
    const newErrors: { fullName?: string; phoneNumber?: string } = {};

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      newErrors.fullName = 'Họ và tên không được để trống.';
    } else if (trimmedName.length < 2) {
      newErrors.fullName = 'Họ và tên phải có ít nhất 2 ký tự.';
    } else if (trimmedName.length > 100) {
      newErrors.fullName = 'Họ và tên không được vượt quá 100 ký tự.';
    }

    const trimmedPhone = phoneNumber.trim();
    if (trimmedPhone) {
      const phoneRegex = /^(0[0-9]{9})?$/;
      if (!phoneRegex.test(trimmedPhone)) {
        newErrors.phoneNumber = 'Số điện thoại không hợp lệ (gồm 10 chữ số và bắt đầu bằng số 0).';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      addToast('Vui lòng kiểm tra lại thông tin nhập vào!', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await profileService.updateProfile({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        profilePictureUrl: profilePictureUrl.trim(),
        jlptLevel,
      });

      if (res.success) {
        addToast('Cập nhật hồ sơ học viên thành công!', 'success');
        // Sau 1 giay chuyen ve trang xem Profile
        setTimeout(() => {
          navigate('/profile');
        }, 1000);
      } else {
        addToast(res.message || 'Cập nhật thất bại. Vui lòng thử lại!', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Đã xảy ra lỗi khi lưu hồ sơ.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="bg-white rounded-xl border border-[#E6EDF5] p-12 text-center shadow-sm">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-[#0878EE] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-medium text-[#71809A]">Đang chuẩn bị biểu mẫu chỉnh sửa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Toast Notifications */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 pointer-events-none w-auto max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            id={t.id}
            message={t.message}
            type={t.type}
            onClose={removeToast}
          />
        ))}
      </div>

      {/* Header & Back Action */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#071A44] tracking-tight">Chỉnh sửa hồ sơ</h1>
          <p className="text-sm text-[#71809A] mt-0.5">
            Cập nhật thông tin cá nhân và thiết lập trình độ JLPT của bạn
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/profile')}
        >
          ← Quay lại hồ sơ
        </Button>
      </div>

      {/* Edit Form Card */}
      <div className="bg-white rounded-xl border border-[#E6EDF5] shadow-sm p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Preview & URL */}
          <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-[#E6EDF5]">
            <div className="relative">
              {profilePictureUrl ? (
                <img
                  src={profilePictureUrl}
                  alt="Avatar Preview"
                  className="w-20 h-20 rounded-full object-cover border-2 border-[#0878EE] shadow-sm"
                  onError={(e) => {
                    // Fallback on broken image link
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-100 text-[#0878EE] font-bold text-2xl flex items-center justify-center border-2 border-[#E6EDF5]">
                  {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
            </div>

            <div className="flex-1 w-full">
              <Input
                label="Đường dẫn ảnh đại diện (Avatar URL)"
                placeholder="https://example.com/avatar.jpg"
                value={profilePictureUrl}
                onChange={(e) => setProfilePictureUrl(e.target.value)}
                helperText="Dán liên kết ảnh đại diện của bạn hoặc để trống để dùng avatar chữ cái mặc định."
              />
            </div>
          </div>

          {/* Readonly Email Display */}
          <div>
            <Input
              label="Địa chỉ Email (Định danh tài khoản)"
              value={email}
              disabled
              helperText="Email là mã định danh tài khoản và không thể thay đổi."
            />
          </div>

          {/* Full Name */}
          <div>
            <Input
              label="Họ và tên"
              required
              placeholder="Nhập họ và tên đầy đủ..."
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
              error={errors.fullName}
              helperText="Tên học viên sẽ được hiển thị khi tham gia phòng luyện Kaiwa Roleplay."
            />
          </div>

          {/* Phone Number */}
          <div>
            <Input
              label="Số điện thoại"
              placeholder="Ví dụ: 0905123456"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                if (errors.phoneNumber) setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
              }}
              error={errors.phoneNumber}
              helperText="Dùng để hỗ trợ xác minh tài khoản và liên hệ học tập (tùy chọn)."
            />
          </div>

          {/* JLPT Level Selection (N5, N4, N3) */}
          <div>
            <label className="block text-sm font-medium text-[#071A44] mb-2">
              Trình độ JLPT mục tiêu <span className="text-[#D92D20]">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {AVAILABLE_JLPT_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setJlptLevel(lvl)}
                  className={`
                    py-2.5 px-3 rounded-lg text-sm font-bold border transition-all text-center
                    ${jlptLevel === lvl
                      ? 'bg-[#0878EE] text-white border-[#0878EE] shadow-sm ring-2 ring-[#0878EE]/20'
                      : 'bg-white text-[#071A44] border-[#E6EDF5] hover:bg-blue-50 hover:border-blue-200'
                    }
                  `}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#71809A] mt-2">
              AI sẽ tự động áp dụng từ vựng, ngữ pháp và tốc độ đàm thoại tương ứng với trình độ này.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-[#E6EDF5]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/profile')}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
            >
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
