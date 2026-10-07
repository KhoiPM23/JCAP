import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PrivateRoute } from '../components/PrivateRoute';
import { MainLayout } from '../layouts/MainLayout';
import { AuthLayout } from '../layouts/AuthLayout';

// Views
import { LoginView } from '../views/LoginView';
import { RegisterView } from '../views/RegisterView';
import { EmailVerificationPendingView } from '../views/EmailVerificationPendingView';
import { ScenarioListView, type Scenario } from '../views/ScenarioListView';
import { ScenarioDetailsView } from '../views/ScenarioDetailsView';
import { RoleplayPracticeView } from '../views/RoleplayPracticeView';
import { LearnerProfileView } from '../views/LearnerProfileView';
import { UpdateProfileView } from '../views/UpdateProfileView';
import { CreditPackagesView } from '../views/CreditPackagesView';
import { CreditHistoryView } from '../views/CreditHistoryView';
import { PaymentReturnView } from '../views/PaymentReturnView';
import { DevShowcaseView } from '../views/DevShowcaseView';
import { VoiceVoxTestView } from '../views/VoiceVoxTestView';
import { AdminDashboardView } from '../views/admin/AdminDashboardView';
import { AdminCreditPackagesView } from '../views/admin/AdminCreditPackagesView';
import { ForgotPasswordView } from '../views/ForgotPasswordView';
import { ResetPasswordView } from '../views/ResetPasswordView';
import { LearnerDashboardView } from '../views/LearnerDashboardView';
import { LearnerShadowingListView } from '../views/shadowing/LearnerShadowingListView';
import { LearnerShadowingDetailView } from '../views/shadowing/LearnerShadowingDetailView';
import { LearnerShadowingPracticeView } from '../views/shadowing/LearnerShadowingPracticeView';
import { LearnerShadowingTextbookListView } from '../views/shadowing/LearnerShadowingTextbookListView';
import { LearnerShadowingChapterListView } from '../views/shadowing/LearnerShadowingChapterListView';
import { LearnerShadowingDialogueListView } from '../views/shadowing/LearnerShadowingDialogueListView';
import { AdminShadowingListView } from '../views/admin/AdminShadowingListView';
import { AdminScenarioListView } from '../views/admin/AdminScenarioListView';
import { ChangePasswordView } from '../views/ChangePasswordView';
import { ConversationHistoryView } from '../views/ConversationHistoryView';
import { ConversationResultDetailView } from '../views/ConversationResultDetailView';

// ============================================================
// Route Wrappers
// ============================================================

/** Redirects if already authenticated (Admin -> /admin/dashboard, Learner -> /scenarios) */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
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

  return <>{children || <Outlet />}</>;
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
  return <ResetPasswordView onBackToLogin={() => navigate('/login')} />;
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
  const { user, userLevel, logout } = useAuth();

  const handleSelectScenario = (scenario: Scenario) => {
    navigate(`/scenarios/${scenario.id}`, { state: { scenarioId: scenario.id } });
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
        <Route path="/admin/scenarios" element={<AdminScenarioListView />} />
        <Route path="/admin/shadowing" element={<AdminShadowingListView />} />
        <Route path="/admin/audio" element={<AdminShadowingListView />} />
        <Route path="/admin/credits/packages" element={<AdminCreditPackagesView />} />
        {/* Placeholder cho các màn hình Admin chưa implement để tránh mất layout */}
        <Route path="/admin/users" element={<div className="p-8 text-center bg-white m-6 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-800">Quản lý Học viên</h2><p className="text-slate-500 mt-2">Tính năng đang được phát triển.</p></div>} />
        <Route path="/admin/ai-config" element={<div className="p-8 text-center bg-white m-6 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-800">Cấu hình AI & Prompt</h2><p className="text-slate-500 mt-2">Tính năng đang được phát triển.</p></div>} />
        <Route path="/admin/settings" element={<div className="p-8 text-center bg-white m-6 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-800">Cài đặt hệ thống</h2><p className="text-slate-500 mt-2">Tính năng đang được phát triển.</p></div>} />
        
        {/* Catch-all cho các route admin không tồn tại */}
        <Route path="/admin/*" element={<div className="p-8 text-center bg-white m-6 rounded-2xl border border-slate-200 shadow-sm"><h2 className="text-xl font-bold text-slate-800">404 - Không tìm thấy trang</h2><p className="text-slate-500 mt-2">Trang quản trị này không tồn tại hoặc đã bị di dời.</p></div>} />
      </Route>

      {/* Fullscreen Interactive Roleplay Practice Room (FE-03) */}
      <Route
        path="/scenarios/practice/:sessionId"
        element={
          <PrivateRoute>
            <RoleplayPracticeView />
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

      {/* Protected routes wrapped in MainLayout */}
      <Route
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route path="/" element={<LearnerHomeRoute />} />
        <Route path="/dashboard" element={<LearnerHomeRoute />} />
        <Route path="/scenarios" element={<ScenarioRoute />} />
        <Route path="/scenarios/:scenarioId" element={<ScenarioDetailsView />} />
        
        {/* Shadowing Flow: Real database catalog created by Admin */}
        <Route path="/shadowing" element={<LearnerShadowingListView />} />
        <Route path="/shadowing/catalog" element={<LearnerShadowingListView />} />
        <Route path="/shadowing/dialogues/:id" element={<LearnerShadowingDetailView />} />
        <Route path="/shadowing/:id" element={<LearnerShadowingDetailView />} />
        {/* UC20 & UC21: Lịch sử và chi tiết kết quả hội thoại */}
        <Route path="/roleplay/results" element={<ConversationHistoryView />} />
        <Route path="/roleplay/results/:resultId" element={<ConversationResultDetailView />} />
        
        {/* UC07: Xem ho so hoc vien */}
        <Route path="/profile" element={<LearnerProfileView />} />

        {/* UC08: Cap nhat ho so hoc vien */}
        <Route path="/profile/edit" element={<UpdateProfileView />} />

        {/* Doi mat khau tai khu vuc ho so */}
        <Route path="/profile/change-password" element={<ChangePasswordView />} />

        {/* UC11 & UC12: Danh sach goi & Mua credits */}
        <Route path="/credits" element={<CreditPackagesView />} />

        {/* UC13: Lich su giao dich credit */}
        <Route path="/credits/history" element={<CreditHistoryView />} />

        {/* Ket qua thanh toan PayOS */}
        <Route path="/credits/payment-return" element={<PaymentReturnView />} />
      </Route>

      {/* Temporary Development-Only Showcase Route */}
      <Route path="/dev/ui-foundation" element={<DevShowcaseView />} />
      <Route path="/voicevox-test" element={<VoiceVoxTestView />} />

      {/* Wildcard */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
