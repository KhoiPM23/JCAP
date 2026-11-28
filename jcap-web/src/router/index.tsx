import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, Outlet } from 'react-router-dom';
import { rememberRoleplaySession } from '../components/jcap/shell/recentRoleplay';
import { useAuth } from '../contexts/AuthContext';
import { shouldBypassPublicRouteRedirect } from '../utils/authSession';
import { PrivateRoute } from '../components/PrivateRoute';
import { AdminDesktopGate } from '../components/AdminDesktopGate';
import { MainLayout } from '../layouts/MainLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { usePhoneViewport } from '../hooks/usePhoneViewport';

// Core Auth Views (lightweight, kept eager for fast first paint)
import { LoginView } from '../views/LoginView';
import { RegisterView } from '../views/RegisterView';
import { EmailVerificationPendingView } from '../views/EmailVerificationPendingView';
import { ForgotPasswordView } from '../views/ForgotPasswordView';
import { ResetPasswordView } from '../views/ResetPasswordView';
import type { Scenario } from '../views/ScenarioListView';

// Route-level code splitting: tách các view nặng (FE-03, Admin, Shadowing, Flashcard, Forum...) thành chunk riêng
const ScenarioListView = React.lazy(() => import('../views/ScenarioListView').then((m) => ({ default: m.ScenarioListView })));
const ScenarioDetailsView = React.lazy(() => import('../views/ScenarioDetailsView').then((m) => ({ default: m.ScenarioDetailsView })));
const RoleplayPracticeView = React.lazy(() => import('../views/RoleplayPracticeView').then((m) => ({ default: m.RoleplayPracticeView })));
const ConversationResultDetailView = React.lazy(() => import('../views/ConversationResultDetailView').then((m) => ({ default: m.ConversationResultDetailView })));
const LearnerCompetencyView = React.lazy(() => import('../views/LearnerCompetencyView').then((m) => ({ default: m.LearnerCompetencyView })));
const PlacementTestRoomView = React.lazy(() => import('../views/PlacementTestRoomView').then((m) => ({ default: m.PlacementTestRoomView })));
const PlacementTestHistoryView = React.lazy(() => import('../views/PlacementTestHistoryView').then((m) => ({ default: m.PlacementTestHistoryView })));
const LearnerProfileView = React.lazy(() => import('../views/LearnerProfileView').then((m) => ({ default: m.LearnerProfileView })));
const StampBookView = React.lazy(() => import('../views/explore/StampBookView').then((m) => ({ default: m.StampBookView })));
const UpdateProfileView = React.lazy(() => import('../views/UpdateProfileView').then((m) => ({ default: m.UpdateProfileView })));
const CreditPackagesView = React.lazy(() => import('../views/CreditPackagesView').then((m) => ({ default: m.CreditPackagesView })));
const SubscriptionQuotaView = React.lazy(() => import('../views/SubscriptionQuotaView').then((m) => ({ default: m.SubscriptionQuotaView })));
const CreditHistoryView = React.lazy(() => import('../views/CreditHistoryView').then((m) => ({ default: m.CreditHistoryView })));
const PaymentReturnView = React.lazy(() => import('../views/PaymentReturnView').then((m) => ({ default: m.PaymentReturnView })));
const DevShowcaseView = React.lazy(() => import('../views/DevShowcaseView').then((m) => ({ default: m.DevShowcaseView })));
const VoiceVoxTestView = React.lazy(() => import('../views/VoiceVoxTestView').then((m) => ({ default: m.VoiceVoxTestView })));
const AdminDashboardView = React.lazy(() => import('../views/admin/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView })));
const AdminCreditPackagesView = React.lazy(() => import('../views/admin/AdminCreditPackagesView').then((m) => ({ default: m.AdminCreditPackagesView })));
const LearnerDashboardView = React.lazy(() => import('../views/LearnerDashboardView').then((m) => ({ default: m.LearnerDashboardView })));
const LearnerShadowingListView = React.lazy(() => import('../views/shadowing/LearnerShadowingListView').then((m) => ({ default: m.LearnerShadowingListView })));
const LearnerShadowingDetailView = React.lazy(() => import('../views/shadowing/LearnerShadowingDetailView').then((m) => ({ default: m.LearnerShadowingDetailView })));
const LearnerShadowingPracticeView = React.lazy(() => import('../views/shadowing/LearnerShadowingPracticeView').then((m) => ({ default: m.LearnerShadowingPracticeView })));
const AdminShadowingListView = React.lazy(() => import('../views/admin/AdminShadowingListView').then((m) => ({ default: m.AdminShadowingListView })));
const AdminScenarioListView = React.lazy(() => import('../views/admin/AdminScenarioListView').then((m) => ({ default: m.AdminScenarioListView })));
const AdminScenarioEditorView = React.lazy(() => import('../views/admin/AdminScenarioEditorView').then((m) => ({ default: m.AdminScenarioEditorView })));
const AdminUserManagementView = React.lazy(() => import('../views/admin/AdminUserManagementView').then((m) => ({ default: m.AdminUserManagementView })));
const AdminLearningView = React.lazy(() => import('../views/admin/learning/AdminLearningView').then((m) => ({ default: m.AdminLearningView })));
const AdminExploreView = React.lazy(() => import('../views/admin/AdminExploreView').then((m) => ({ default: m.AdminExploreView })));
const AdminExplorePrefectureView = React.lazy(() => import('../views/admin/AdminExplorePrefectureView').then((m) => ({ default: m.AdminExplorePrefectureView })));
const AdminExploreSpotEditorView = React.lazy(() => import('../views/admin/AdminExploreSpotEditorView').then((m) => ({ default: m.AdminExploreSpotEditorView })));
const ChangePasswordView = React.lazy(() => import('../views/ChangePasswordView').then((m) => ({ default: m.ChangePasswordView })));
const ResultsView = React.lazy(() => import('../views/results/ResultsView').then((m) => ({ default: m.ResultsView })));
const SettingsView = React.lazy(() => import('../views/SettingsView').then((m) => ({ default: m.SettingsView })));
const FlashcardSetsView = React.lazy(() => import('../views/self-study/FlashcardSetsView').then((m) => ({ default: m.FlashcardSetsView })));
const FlashcardSetDetailView = React.lazy(() => import('../views/self-study/FlashcardSetDetailView').then((m) => ({ default: m.FlashcardSetDetailView })));
const FlashcardSessionView = React.lazy(() => import('../views/self-study/FlashcardSessionView').then((m) => ({ default: m.FlashcardSessionView })));
const FlashcardTestView = React.lazy(() => import('../views/self-study/FlashcardTestView').then((m) => ({ default: m.FlashcardTestView })));
const FlashcardQuizHistoryView = React.lazy(() => import('../views/self-study/FlashcardQuizHistoryView').then((m) => ({ default: m.FlashcardQuizHistoryView })));
const FlashcardReviewHistoryView = React.lazy(() => import('../views/self-study/FlashcardReviewHistoryView').then((m) => ({ default: m.FlashcardReviewHistoryView })));
const LearnerFeedbackView = React.lazy(() => import('../views/LearnerFeedbackView').then((m) => ({ default: m.LearnerFeedbackView })));
const AdminFeedbackView = React.lazy(() => import('../views/admin/AdminFeedbackView').then((m) => ({ default: m.AdminFeedbackView })));
const AdminNotificationView = React.lazy(() => import('../views/admin/AdminNotificationView').then((m) => ({ default: m.AdminNotificationView })));
const CommunityForumView = React.lazy(() => import('../views/CommunityForumView').then((m) => ({ default: m.CommunityForumView })));

// Bản đồ Khám phá chứa dữ liệu hình dạng 47 tỉnh nên tách chunk riêng, chỉ tải khi mở trang
const JapanMapView = React.lazy(() =>
  import('../views/explore/JapanMapView').then((m) => ({ default: m.JapanMapView })),
);
// Landing cho khách (vẽ bản đồ từ dữ liệu 47 tỉnh) cũng tách chunk riêng
const LandingView = React.lazy(() => import('../views/landing/LandingView').then((m) => ({ default: m.LandingView })));
const LearningTopicsView = React.lazy(() => import('../views/learning/LearningTopicsView').then(m => ({ default: m.LearningTopicsView })));
const LearningTopicContentsView = React.lazy(() => import('../views/learning/LearningTopicContentsView').then(m => ({ default: m.LearningTopicContentsView })));
const LearningContentDetailView = React.lazy(() => import('../views/learning/LearningContentDetailView').then(m => ({ default: m.LearningContentDetailView })));

// ============================================================
// Route Wrappers
// ============================================================

/** Redirects if already authenticated (Admin -> /admin/dashboard, Learner -> /scenarios) */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  // Luôn cho phép mở /login?confirmed=..., /login?reset=true và /reset-password để hoàn tất luồng xác thực
  if (shouldBypassPublicRouteRedirect(location.pathname, location.search)) {
    return <>{children}</>;
  }

  if (isAuthenticated) {
    let userRole = user?.role;
    if (!userRole) {
      try {
        const saved = localStorage.getItem('jcap_user');
        if (saved) userRole = JSON.parse(saved).role;
      } catch {}
    }
    if (userRole === 'Admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

/** Protected route dành riêng cho Admin */
const AdminRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium text-sm">Đang kiểm tra quyền Admin...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }

  return <AdminDesktopGate>{children || <Outlet />}</AdminDesktopGate>;
};

/**
 * "/" cho khách chưa đăng nhập là landing page (design-handoff mục 9d); mọi trường hợp khác giữ nguyên khung bên trong.
 * Bọc quanh khối học viên thay vì tách "/" ra route riêng, để LearnerShell không bị dựng lại khi rời bản đồ.
 */
const GuestLandingGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  if (!isAuthenticated && pathname === '/') {
    return (
      <React.Suspense fallback={null}>
        <LandingView />
      </React.Suspense>
    );
  }
  return <>{children}</>;
};

const LearnerHomeRoute: React.FC = () => {
  const { user } = useAuth();
  let userRole = user?.role;
  if (!userRole) {
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) userRole = JSON.parse(saved).role;
    } catch {}
  }
  if (userRole === 'Admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  // Trang chủ của học viên là bản đồ Hành trình (design-handoff mục 3)
  return <MapRoute />;
};

/**
 * Ghi nhớ phiên Hội thoại AI đang mở để thanh bên hiện mục "đang dở" (không hiển thị gì, không đụng vào phòng hội thoại)
 */
const RememberRoleplaySession: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const learnerId = user?.id || user?.email || null;
  React.useEffect(() => {
    const id = Number(sessionId);
    if (id > 0 && learnerId) rememberRoleplaySession(id, learnerId);
  }, [sessionId, learnerId]);
  return null;
};

/** Bản đồ Hành trình (tải riêng vì nặng); nằm trong khung học viên, thanh bên nổi trên bản đồ */
const MapRoute: React.FC = () => (
  <React.Suspense
    fallback={
      <div className="min-h-screen flex items-center justify-center bg-paper-100">
        <div className="w-10 h-10 border-4 border-line border-t-ai rounded-full animate-spin" />
      </div>
    }
  >
    <JapanMapView />
  </React.Suspense>
);

/** Trang tổng quan cũ: chưa có trong thiết kế mới, vẫn mở được ở /dashboard */
const LearnerDashboardRoute: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'Admin') return <Navigate to="/admin/dashboard" replace />;
  return <LearnerDashboardView />;
};

const LoginRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <LoginView
      onLoginSuccess={() => {
        try {
          const saved = localStorage.getItem('jcap_user');
          if (saved) {
            const u = JSON.parse(saved);
            if (u.role === 'Admin') {
              navigate('/admin/dashboard', { replace: true });
              return;
            }
          }
        } catch {}
        navigate('/', { replace: true });
      }}
      onSwitchToRegister={() => navigate('/register')}
      onForgotPassword={() => navigate('/forgot-password')}
    />
  );
};

const ForgotPasswordRoute: React.FC = () => {
  const navigate = useNavigate();
  return <ForgotPasswordView onBackToLogin={() => navigate('/login')} />;
};

const ResetPasswordRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <ResetPasswordView
      onResetSuccess={() => navigate('/login?reset=true', { replace: true })}
      onBackToLogin={() => navigate('/login', { replace: true })}
    />
  );
};

const RegisterRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <RegisterView
      onRegisterSuccess={(email) => navigate('/email-verification-pending', { state: { email } })}
      onSwitchToLogin={() => navigate('/login')}
    />
  );
};

const EmailVerificationPendingRoute: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  if (!email) {
    return <Navigate to="/register" replace />;
  }

  return (
    <EmailVerificationPendingView
      email={email}
      onBackToLogin={() => navigate('/login', { replace: true })}
    />
  );
};

const ScenarioRoute: React.FC = () => {
  const navigate = useNavigate();
  const { search } = useLocation();
  const mobile = usePhoneViewport();
  const { user, userLevel, logout } = useAuth();

  const handleSelectScenario = (scenario: Scenario) => {
    navigate(`/scenarios/${scenario.id}`, { state: { scenarioId: scenario.id, scenarioListUrl: mobile ? `/scenarios${search}` : undefined } });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div>
      <ScenarioListView
        userEmail={user?.email || ''}
        userLevel={userLevel || 'N5'}
        onSelectScenario={handleSelectScenario}
        onLogout={handleLogout}
      />
    </div>
  );
};

const RootRedirect: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  let userRole = user?.role;
  if (!userRole) {
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) userRole = JSON.parse(saved).role;
    } catch {}
  }
  if (userRole === 'Admin') return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/scenarios" replace />;
};

// ============================================================
// App Router Configuration
// ============================================================
export const AppRouter: React.FC = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium text-sm">Đang tải JCAP...</p>
      </div>
    );
  }

  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--paper-100)]">
          <div className="w-10 h-10 border-4 border-[var(--line)] border-t-[var(--ai)] rounded-full animate-spin" />
        </div>
      }
    >
      <Routes>
      {/* Public routes wrapped in AuthLayout */}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginRoute />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterRoute />
            </PublicRoute>
          }
        />
        <Route
          path="/email-verification-pending"
          element={
            <PublicRoute>
              <EmailVerificationPendingRoute />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPasswordRoute />
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicRoute>
              <ResetPasswordRoute />
            </PublicRoute>
          }
        />
      </Route>

      {/* Admin routes: chỉ dành riêng cho tài khoản Admin, bọc trong MainLayout để luôn có Header và Navbar Sidebar */}
      <Route
        element={
          <AdminRoute>
            <MainLayout />
          </AdminRoute>
        }
      >
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboardView />} />
        <Route path="/admin/topics" element={<AdminLearningView key="topics" kind="topics" />} />
        <Route path="/admin/vocabularies" element={<AdminLearningView key="vocabularies" kind="vocabularies" />} />
        <Route path="/admin/grammars" element={<AdminLearningView key="grammars" kind="grammars" />} />
        <Route path="/admin/scenarios" element={<AdminScenarioListView />} />
        <Route path="/admin/scenarios/new" element={<AdminScenarioEditorView />} />
        <Route path="/admin/scenarios/new-scenario" element={<AdminScenarioEditorView />} />
        <Route path="/admin/scenarios/new scenario" element={<AdminScenarioEditorView />} />
        <Route path="/admin/scenarios/edit/:id" element={<AdminScenarioEditorView />} />
        <Route path="/admin/shadowing" element={<AdminShadowingListView />} />
        <Route path="/admin/audio" element={<AdminShadowingListView />} />
        <Route path="/admin/explore" element={<AdminExploreView />} />
        <Route path="/admin/explore/prefectures/:id" element={<AdminExplorePrefectureView />} />
        <Route path="/admin/explore/prefectures/:id/spots/new" element={<AdminExploreSpotEditorView key="new" />} />
        <Route path="/admin/explore/spots/:spotId" element={<AdminExploreSpotEditorView />} />
        <Route path="/admin/credits/packages" element={<AdminCreditPackagesView />} />
        {/* FE-06: Quản lý Học viên (UC-54 & UC-55) */}
        <Route path="/admin/users" element={<AdminUserManagementView />} />
        <Route path="/admin/feedback" element={<AdminFeedbackView />} />
        <Route path="/admin/community" element={<CommunityForumView />} />
        <Route path="/admin/notifications" element={<AdminNotificationView />} />
        <Route path="/admin/settings" element={<div className="p-8 text-center bg-white m-6 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-800">Cài đặt hệ thống</h2><p className="text-slate-500 mt-2">Tính năng đang được phát triển.</p></div>} />
        
        {/* Catch-all cho các route admin không tồn tại */}
        <Route path="/admin/*" element={<div className="p-8 text-center bg-white m-6 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-800">404 - Không tìm thấy trang</h2><p className="text-slate-500 mt-2">Trang quản trị này không tồn tại hoặc đã bị di dời.</p></div>} />
      </Route>

      {/* Fullscreen Interactive Roleplay Practice Room (FE-03) */}
      <Route
        path="/scenarios/practice/:sessionId"
        element={
          <PrivateRoute>
            <RememberRoleplaySession />
            <RoleplayPracticeView />
          </PrivateRoute>
        }
      />
      <Route
        path="/roleplay/:sessionId"
        element={
          <PrivateRoute>
            <RoleplayPracticeView />
          </PrivateRoute>
        }
      />
      {/* Placement Test Interactive Practice Room (Fullscreen) */}
      <Route
        path="/placement-test"
        element={
          <PrivateRoute>
            <PlacementTestRoomView />
          </PrivateRoute>
        }
      />

      {/* Interactive Shadowing Practice Room (FE Fullscreen matching Reference Image 2) */}
      <Route
        path="/shadowing/practice/:id"
        element={
          <PrivateRoute>
            <LearnerShadowingPracticeView />
          </PrivateRoute>
        }
      />
      <Route
        path="/shadowing/:id/practice"
        element={
          <PrivateRoute>
            <LearnerShadowingPracticeView />
          </PrivateRoute>
        }
      />

      {/* Fullscreen Flashcard Quizlet-style Test Mode */}
      <Route
        path="/flashcards/test/:topicId/:contentType"
        element={
          <PrivateRoute>
            <FlashcardTestView />
          </PrivateRoute>
        }
      />

      {/* Fullscreen Flashcard SRS Study Session (Zen Mode, outside MainLayout) */}
      <Route
        path="/flashcards/study/:topicId/:contentType"
        element={
          <PrivateRoute>
            <FlashcardSessionView />
          </PrivateRoute>
        }
      />
      <Route
        path="/flashcards/study/:topicId"
        element={
          <PrivateRoute>
            <FlashcardSessionView />
          </PrivateRoute>
        }
      />

      {/* Protected routes wrapped in MainLayout */}
      <Route
        element={
          <GuestLandingGate>
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          </GuestLandingGate>
        }
      >
        <Route path="/" element={<LearnerHomeRoute />} />
        {/* Khám phá = bản đồ Hành trình, cùng trang với trang chủ */}
        <Route path="/explore" element={<MapRoute />} />
        {/* Sổ con dấu: xem lại mọi con dấu của hành trình */}
        <Route path="/stamps" element={<StampBookView />} />
        <Route path="/dashboard" element={<LearnerDashboardRoute />} />
        <Route path="/scenarios" element={<ScenarioRoute />} />
        <Route path="/scenarios/:scenarioId" element={<ScenarioDetailsView />} />
        
        {/* Shadowing Flow: Real database catalog created by Admin */}
        <Route path="/shadowing" element={<LearnerShadowingListView />} />
        <Route path="/shadowing/catalog" element={<LearnerShadowingListView />} />
        <Route path="/shadowing/dialogues/:id" element={<LearnerShadowingDetailView />} />
        <Route path="/shadowing/:id" element={<LearnerShadowingDetailView />} />
        {/* UC20 & UC21: Lịch sử và chi tiết kết quả hội thoại */}
        {/* Kết quả: Hội thoại AI và Shadowing, chuyển bằng nút nhỏ trong trang */}
        <Route path="/roleplay/results" element={<ResultsView />} />
        <Route path="/roleplay/results/:resultId" element={<ConversationResultDetailView />} />
        {/* Lịch sử hoàn thành Placement Test (tách riêng, giữ thanh bên điều hướng) */}
        <Route path="/placement-test/history" element={<PlacementTestHistoryView />} />

        {/* FE-05: Học thẻ ghi nhớ (Flashcard & SRS Review) */}
        <Route path="/flashcards" element={<FlashcardSetsView />} />
        <Route path="/flashcards/bookmarks" element={<FlashcardSetsView />} />
        <Route path="/flashcards/sets/:topicId/:contentType" element={<FlashcardSetDetailView />} />
        <Route path="/flashcards/history" element={<FlashcardReviewHistoryView />} />
        <Route path="/flashcards/test/history" element={<FlashcardQuizHistoryView />} />

        {/* Kho học liệu (Learning Topics & Content) */}
        <Route path="/learning" element={<React.Suspense fallback={<div className="p-8 text-sumi-muted" role="status">Đang tải kho học liệu…</div>}><Outlet /></React.Suspense>}>
          <Route index element={<Navigate to="topics" replace />} />
          <Route path="topics" element={<LearningTopicsView />} />
          <Route path="topics/:topicId" element={<LearningTopicContentsView />} />
          <Route path="topics/:topicId/:kind/:contentId" element={<LearningContentDetailView />} />
        </Route>
        
        {/* UC07: Xem ho so hoc vien */}
        <Route path="/profile" element={<LearnerProfileView />} />
        <Route path="/profile/competency" element={<LearnerCompetencyView />} />

        {/* UC08: Cap nhat ho so hoc vien */}
        <Route path="/profile/edit" element={<UpdateProfileView />} />

        {/* Doi mat khau tai khu vuc ho so */}
        <Route path="/profile/change-password" element={<ChangePasswordView />} />

        {/* UC11 & UC12: Danh sach goi & Mua credits */}
        <Route path="/credits" element={<CreditPackagesView />} />
        {/* Goi hoi vien & Dual-Window Rolling Quota (Kieu Antigravity) */}
        <Route path="/subscription" element={<SubscriptionQuotaView />} />
        <Route path="/credits/subscription" element={<SubscriptionQuotaView />} />

        {/* UC13: Lich su giao dich credit */}
        <Route path="/credits/history" element={<CreditHistoryView />} />

        {/* Ket qua thanh toan PayOS */}
        <Route path="/credits/payment-return" element={<PaymentReturnView />} />

        {/* UC: Cai dat he thong (Giong doc AI & Thiet bi am thanh) */}
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/feedback" element={<LearnerFeedbackView />} />
        <Route path="/help" element={<LearnerFeedbackView />} />
        <Route path="/community" element={<CommunityForumView />} />
        <Route path="/forum" element={<CommunityForumView />} />
      </Route>

      {/* Development-Only Showcase & Diagnostics Routes */}
      <Route
        path="/dev/ui-foundation"
        element={import.meta.env.DEV ? <DevShowcaseView /> : <Navigate to="/" replace />}
      />
      <Route
        path="/voicevox-test"
        element={import.meta.env.DEV ? <VoiceVoxTestView /> : <Navigate to="/" replace />}
      />

      {/* Wildcard */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </React.Suspense>
  );
};
