import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Switch } from '../components/jcap';
import { useAuth } from '../contexts/AuthContext';
import { creditService } from '../services/creditService';
import { subscriptionPlanService, type UserSubscriptionState } from '../services/subscriptionPlanService';

interface Window {
  usedCredits: number;
  totalCredits: number;
  resetsInText: string;
}

/** Số liệu mẫu cho khối "theo kỹ năng" (chưa có API); thanh tính theo SKILL_USAGE_MAX */
const SKILL_USAGE_SAMPLE = [
  { label: 'Hội thoại AI', credits: 4 },
  { label: 'Shadowing', credits: 1 }
];
const SKILL_USAGE_MAX = 5;

const usedPercent = (w: Window) => (w.totalCredits > 0 ? Math.min(100, Math.round((w.usedCredits / w.totalCredits) * 100)) : 0);

/** Câu trạng thái đậm ở đầu trang, tính từ chu kỳ đang dùng nhiều nhất */
function statusLine(five: Window, week: Window, autoUse: boolean, extra: number): string {
  const worst = Math.max(usedPercent(five), usedPercent(week));
  if (worst >= 100) {
    return autoUse && extra > 0
      ? 'Đã hết hạn mức. Bạn vẫn học tiếp được bằng Credit nạp thêm.'
      : 'Đã hết hạn mức. Chờ tới lần hồi phục tiếp theo hoặc nạp thêm Credit.';
  }
  if (worst >= 80) return 'Sắp chạm giới hạn. Hạn mức sẽ hồi phục theo chu kỳ bên dưới.';
  return 'Ổn định. Bạn còn dư hạn mức tới lần hồi phục tiếp theo.';
}

/**
 * Gói & Credit (design-handoff mục 4): một cột ~760px, các phần ngăn bằng đường kẻ, không thẻ.
 * Số liệu thật từ creditService.getQuota() và subscriptionPlanService như trước; chỉ đổi giao diện.
 */
export const SubscriptionQuotaView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Thông tin gói hội viên động từ subscriptionPlanService
  const [subscription, setSubscription] = useState<UserSubscriptionState>(() => subscriptionPlanService.getUserSubscription());

  // Hai chu kỳ hạn mức (tính từ các phiên học thật trong DB)
  const [weeklyLimit, setWeeklyLimit] = useState<Window>(() => ({
    usedCredits: 0,
    totalCredits: subscriptionPlanService.getUserSubscription()?.creditsAmount || 2500,
    resetsInText: '7 ngày',
  }));
  const [fiveHourLimit, setFiveHourLimit] = useState<Window>(() => ({
    usedCredits: 0,
    totalCredits: subscriptionPlanService.getUserSubscription()?.fiveHourQuota || 150,
    resetsInText: '5 giờ',
  }));

  // Số dư Credit nạp thêm
  const [extraCredits, setExtraCredits] = useState<number>(() => (typeof user?.creditBalance === 'number' ? user.creditBalance : 0));

  // Tuỳ chọn: tự dùng Credit nạp thêm khi hết hạn mức (lưu ở trình duyệt như trước)
  // TODO: nối với cài đặt ở backend khi có API.
  const [allowAutoUseExtraCredits, setAllowAutoUseExtraCredits] = useState<boolean>(() => {
    const saved = localStorage.getItem('jcap_allow_auto_use_credit');
    return saved !== null ? saved === 'true' : true;
  });

  const [showFeatures, setShowFeatures] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadQuotaFromBackend = async () => {
    setIsRefreshing(true);
    try {
      const res = await creditService.getQuota();
      if (res.success && res.data) {
        const d = res.data;
        const currentSub = subscriptionPlanService.getUserSubscription();
        setWeeklyLimit({
          usedCredits: d.weeklyUsedCredits,
          totalCredits: currentSub?.creditsAmount || d.weeklyTotalCredits || 1000,
          resetsInText: d.weeklyResetsInText,
        });
        setFiveHourLimit({
          usedCredits: d.fiveHourUsedCredits,
          totalCredits: currentSub?.fiveHourQuota || d.fiveHourTotalCredits || 50,
          resetsInText: d.fiveHourResetsInText,
        });
        setExtraCredits(d.extraCreditBalance);
        setUpdatedAt(new Date());
      }
    } catch (err) {
      console.error('Lỗi tải hạn ngạch Quota:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadQuotaFromBackend();
    const handleSubscriptionUpdate = () => {
      setSubscription(subscriptionPlanService.getUserSubscription());
      void loadQuotaFromBackend();
    };
    const handleProfileUpdate = () => void loadQuotaFromBackend();
    window.addEventListener('jcap_subscription_updated', handleSubscriptionUpdate);
    window.addEventListener('jcap_profile_updated', handleProfileUpdate);
    window.addEventListener('storage', handleSubscriptionUpdate);
    return () => {
      window.removeEventListener('jcap_subscription_updated', handleSubscriptionUpdate);
      window.removeEventListener('jcap_profile_updated', handleProfileUpdate);
      window.removeEventListener('storage', handleSubscriptionUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const handleToggleAutoUseCredit = (checked: boolean) => {
    setAllowAutoUseExtraCredits(checked);
    localStorage.setItem('jcap_allow_auto_use_credit', checked ? 'true' : 'false');
    setNotice(checked ? 'Đã bật: tự dùng Credit nạp thêm khi hết hạn mức.' : 'Đã tắt: khi hết hạn mức, bài học tạm dừng chờ hồi phục.');
  };

  const [planName, planTier] = splitPlanName(subscription.planName, subscription.planTier);
  const expires = new Date(subscription.expiresAt);

  return (
    <div data-theme="hoc-tap" className="bg-transparent">
      <div className="jx-um" style={{ paddingTop: 8, paddingBottom: 32 }}>
        <div className="flex items-baseline gap-2.5 pb-2">
          <h1 className="m-0 text-2xl font-bold leading-8">Mức dùng của bạn</h1>
          <span className="text-sm text-sumi-muted">{planName}</span>
        </div>

        <section className="jx-um-sec" style={{ paddingTop: 16 }} aria-labelledby="um-1">
          <h2 id="um-1" className="jx-um-h" style={{ paddingBottom: 14, marginBottom: 6, borderBottom: '1px solid var(--line)' }}>
            {statusLine(fiveHourLimit, weeklyLimit, allowAutoUseExtraCredits, extraCredits)}
          </h2>
          <UsageRow label="Chu kỳ 5 giờ" sub={`Hồi đầy sau ${fiveHourLimit.resetsInText}`} w={fiveHourLimit} aria="hạn mức 5 giờ" />
          <UsageRow label="Tuần này" sub={`Làm mới sau ${weeklyLimit.resetsInText}`} w={weeklyLimit} aria="hạn mức tuần" />
        </section>

        <section className="jx-um-sec" aria-labelledby="um-2">
          <div className="jx-um-line">
            <div>
              <h2 id="um-2" className="jx-um-h">
                {planName} {planTier && <span className="font-medium text-sumi-muted">{planTier}</span>}
              </h2>
              <p className="jx-um-muted">
                {`Hết hạn ${Number.isNaN(expires.getTime()) ? '—' : expires.toLocaleDateString('vi-VN')}. Mỗi 5 giờ có ${fiveHourLimit.totalCredits.toLocaleString('vi-VN')} credit, mỗi tuần ${weeklyLimit.totalCredits.toLocaleString('vi-VN')} credit.`}
              </p>
            </div>
            <span className="jx-um-big">{subscription.status === 'Expired' ? 'Đã hết hạn' : `Còn ${subscription.daysRemaining} ngày`}</span>
          </div>
          {showFeatures && subscription.features.length > 0 && (
            <ul className="jx-um-feat">
              {subscription.features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button type="button" className="jx-um-link" onClick={() => setShowFeatures(!showFeatures)} aria-expanded={showFeatures}>
              {showFeatures ? 'Ẩn quyền lợi của gói' : 'Xem quyền lợi của gói'}
            </button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/credits')}>
              Đổi gói
            </Button>
          </div>
        </section>

        <section className="jx-um-sec" aria-labelledby="um-3">
          <div className="jx-um-line">
            <div>
              <h2 id="um-3" className="jx-um-h">
                Credit nạp thêm
              </h2>
              <p className="jx-um-muted">Không hết hạn. Chỉ dùng khi bạn chạm giới hạn của gói.</p>
            </div>
            <span className="jx-um-big">{extraCredits.toLocaleString('vi-VN')}</span>
          </div>
          <div className="jx-um-line" style={{ alignItems: 'center', marginTop: 18 }}>
            <span className="text-sm leading-[22px] text-sumi-muted">Bật để tự dùng credit và học tiếp khi hết hạn mức.</span>
            <Switch checked={allowAutoUseExtraCredits} onChange={handleToggleAutoUseCredit} />
          </div>
          {notice && (
            <p role="status" className="mt-2 text-[13px] text-sumi-muted">
              {notice}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <Button variant="primary" size="sm" icon="add" onClick={() => navigate('/credits')}>
              Nạp thêm credit
            </Button>
          </div>
        </section>

        {/* Chưa có API tách credit theo kỹ năng: số liệu dưới đây là mẫu cố định, kèm thông báo cho người dùng.
            TODO: thay SKILL_USAGE_SAMPLE bằng dữ liệu thật khi creditService.getQuota trả credit theo từng kỹ năng. */}
        <section className="jx-um-sec" aria-labelledby="um-4">
          <div className="jx-um-line" style={{ alignItems: 'center' }}>
            <h2 id="um-4" className="jx-um-h">
              Mức dùng tuần này theo kỹ năng
            </h2>
            <Badge tone="warning" icon="construction">
              Chưa hoàn chỉnh
            </Badge>
          </div>
          <div className="mt-2">
            {SKILL_USAGE_SAMPLE.map((r) => (
              <div key={r.label} className="jx-um-row">
                <b className="text-[15px] font-semibold leading-[22px]">{r.label}</b>
                <span className="jx-um-bar" role="img" aria-label={`${r.label}: ${r.credits} credit (số liệu mẫu)`}>
                  <i style={{ width: `${Math.round((r.credits / SKILL_USAGE_MAX) * 100)}%` }} />
                </span>
                <span className="jx-um-val">{`${r.credits} credit`}</span>
              </div>
            ))}
          </div>
          <p className="jx-um-muted" style={{ marginTop: 8, fontSize: 13 }}>
            Chức năng này chưa hoàn chỉnh, số liệu đang hiển thị chỉ là mẫu và chưa phản ánh mức dùng thật của bạn.
          </p>
        </section>

        <div className="flex items-center gap-4 border-t border-line pt-5 text-[13px] text-sumi-muted">
          <span className="flex-auto">
            {`Mô hình AI: Gemini 3.1 Flash / Live AI · ${updatedAt ? `Cập nhật lúc ${updatedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Chưa cập nhật'}`}
          </span>
          <button type="button" className="jx-um-link" onClick={() => void loadQuotaFromBackend()} disabled={isRefreshing}>
            {isRefreshing ? 'Đang làm mới…' : 'Làm mới'}
          </button>
          <Link to="/credits/history" className="text-ai underline underline-offset-[3px]">
            Lịch sử giao dịch
          </Link>
        </div>
      </div>
    </div>
  );
};

const UsageRow: React.FC<{ label: string; sub: string; w: Window; aria: string }> = ({ label, sub, w, aria }) => {
  const pct = usedPercent(w);
  return (
    <div className="jx-um-row">
      <span className="jx-um-lab">
        <b>{label}</b>
        <span>{sub}</span>
      </span>
      <span className={`jx-um-bar ${pct >= 100 ? 'is-empty' : pct >= 80 ? 'is-low' : ''}`} role="img" aria-label={`Đã dùng ${pct}% ${aria}`}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="jx-um-val">{`${pct}% đã dùng`}</span>
    </div>
  );
};

/** "Gói Tháng Pro (Cơ Bản)" -> ["Gói Tháng Pro", "Cơ Bản"]; không có ngoặc thì dùng planTier */
function splitPlanName(name: string, tier: string): [string, string] {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name || '');
  if (m) return [m[1], m[2]];
  return [name || 'Gói miễn phí', tier || ''];
}
