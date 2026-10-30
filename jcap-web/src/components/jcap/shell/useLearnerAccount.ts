import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { creditService } from '../../../services/creditService';
import type { User } from '../../../types/auth';

/**
 * Người dùng đang đăng nhập + số dư Credit cho thanh bên (cùng cách Header cũ làm):
 * hỏi máy chủ số dư khi mở app, và cập nhật theo sự kiện 'jcap_profile_updated' (đổi hồ sơ, trừ/nạp Credit).
 */
export function useLearnerAccount(): { user: User | null; credit: number } {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<User | null>(authUser);

  useEffect(() => {
    if (authUser) {
      setUser((prev) => ({
        ...authUser,
        creditBalance: typeof prev?.creditBalance === 'number' && prev.creditBalance > 0 ? prev.creditBalance : (authUser.creditBalance ?? prev?.creditBalance),
      }));
    }
  }, [authUser]);

  useEffect(() => {
    if (!localStorage.getItem('jcap_token') || authUser?.role === 'Admin') return;
    creditService
      .getHistory(1, 1)
      .then((res) => {
        if (res.success && res.data && typeof res.data.currentCreditBalance === 'number') {
          creditService.updateLocalCreditBalance(res.data.currentCreditBalance);
          setUser((prev) => ({ ...(prev || authUser || {}), creditBalance: res.data!.currentCreditBalance }) as User);
        }
      })
      .catch(() => {});
  }, [authUser?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (!d) return;
      setUser((prev) => ({
        ...(prev || authUser || {}),
        id: d.id || prev?.id || authUser?.id || '',
        email: d.email || prev?.email || authUser?.email || '',
        role: d.role || prev?.role || authUser?.role || 'Learner',
        fullName: d.fullName !== undefined ? d.fullName : prev?.fullName || authUser?.fullName,
        level: d.jlptLevel || d.level || prev?.level || authUser?.level,
        avatarUrl: d.profilePictureUrl || d.avatarUrl || prev?.avatarUrl || authUser?.avatarUrl,
        creditBalance: typeof d.creditBalance === 'number' ? d.creditBalance : (prev?.creditBalance ?? authUser?.creditBalance),
      }));
    };
    window.addEventListener('jcap_profile_updated', onUpdate);
    return () => window.removeEventListener('jcap_profile_updated', onUpdate);
  }, [authUser]);

  const credit = useMemo(() => {
    if (typeof user?.creditBalance === 'number') return user.creditBalance;
    if (typeof authUser?.creditBalance === 'number') return authUser.creditBalance;
    return 0;
  }, [user?.creditBalance, authUser?.creditBalance]);

  return { user: user || authUser, credit };
}
