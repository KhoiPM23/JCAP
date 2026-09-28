import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
import { AdminCreditPackagesView } from '../views/admin/AdminCreditPackagesView';
import { ForgotPasswordView } from '../views/ForgotPasswordView';
import { ResetPasswordView } from '../views/ResetPasswordView';
import { LearnerShadowingListView } from '../views/shadowing/LearnerShadowingListView';
import { LearnerShadowingDetailView } from '../views/shadowing/LearnerShadowingDetailView';
import { LearnerShadowingPracticeView } from '../views/shadowing/LearnerShadowingPracticeView';
import { AdminShadowingListView } from '../views/admin/AdminShadowingListView';
import { AdminScenarioListView } from '../views/admin/AdminScenarioListView';
import { ChangePasswordView } from '../views/ChangePasswordView';
import { ConversationHistoryView } from '../views/ConversationHistoryView';
import { ConversationResultDetailView } from '../views/ConversationResultDetailView';

// ============================================================
// Route Wrappers
// ============================================================

/** Redirects if already authenticated (Redirects to /scenarios home page) */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/scenarios" replace />;
  }
  return <>{children}</>;
};

/** Protected route dành riêng cho Admin */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
    return <Navigate to="/scenarios" replace />;
  }

  return <>{children}</>;
};

const LoginRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <LoginView
      onLoginSuccess={() => {
        navigate('/scenarios', { replace: true });
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
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
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

      {/* Admin routes: chỉ dành riêng cho tài khoản Admin */}
      <Route
        path="/admin/scenarios"
        element={
          <AdminRoute>
            <AdminScenarioListView />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/shadowing"
        element={
          <AdminRoute>
            <AdminShadowingListView />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/credits/packages"
        element={
          <AdminRoute>
            <AdminCreditPackagesView />
          </AdminRoute>
        }
      />

      {/* Fullscreen Interactive Roleplay Practice Room (FE-03) */}
      <Route
        path="/scenarios/practice/:sessionId"
        element={
          <PrivateRoute>
            <RoleplayPracticeView />
          </PrivateRoute>
        }
      />

      {/* Interactive Shadowing Practice Room */}
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
        <Route path="/scenarios" element={<ScenarioRoute />} />
        <Route path="/scenarios/:scenarioId" element={<ScenarioDetailsView />} />
        <Route path="/shadowing" element={<LearnerShadowingPracticeView />} />
        <Route path="/shadowing/:id" element={<LearnerShadowingPracticeView />} />
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

      {/* Root & wildcard */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
