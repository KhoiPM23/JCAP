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
import { RoleplayChatView } from '../views/RoleplayChatView';
import { DevShowcaseView } from '../views/DevShowcaseView';
import { ForgotPasswordView } from '../views/ForgotPasswordView';
import { ResetPasswordView } from '../views/ResetPasswordView';
import { ChangePasswordView } from '../views/ChangePasswordView';

// ============================================================
// Route Wrappers (Preserved from original App.tsx)
// ============================================================

/** Redirects to /scenarios if already authenticated */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/scenarios" replace />;
  return <>{children}</>;
};

const LoginRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <LoginView
      onLoginSuccess={() => navigate('/scenarios', { replace: true })}
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
    navigate('/chat', { state: { scenario } });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <ScenarioListView
      userEmail={user?.email || ''}
      userLevel={userLevel || 'N5'}
      onSelectScenario={handleSelectScenario}
      onLogout={handleLogout}
    />
  );
};

const ChatRoute: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const scenario = (location.state as { scenario?: Scenario } | null)?.scenario;

  if (!scenario) {
    return <Navigate to="/scenarios" replace />;
  }

  return (
    <RoleplayChatView
      scenario={scenario}
      onBack={() => navigate('/scenarios')}
    />
  );
};

const RootRedirect: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/scenarios' : '/login'} replace />;
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

      {/* Protected routes wrapped in MainLayout */}
      <Route
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route path="/scenarios" element={<ScenarioRoute />} />
        <Route path="/chat" element={<ChatRoute />} />
        
        <Route path="/profile" element={<ChangePasswordView />} />
      </Route>

      {/* Temporary Development-Only Showcase Route (Sprint 1 UI Foundation Review) */}
      <Route path="/dev/ui-foundation" element={<DevShowcaseView />} />

      {/* Root & wildcard */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
