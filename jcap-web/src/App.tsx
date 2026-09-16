import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginView } from './views/LoginView';
import { RegisterView } from './views/RegisterView';
import { EmailVerificationPendingView } from './views/EmailVerificationPendingView';
import { ScenarioListView, type Scenario } from './views/ScenarioListView';
import { RoleplayChatView } from './views/RoleplayChatView';
import { PrivateRoute } from './components/PrivateRoute';

// ============================================================
// Route Wrappers: inject navigate callbacks vao cac View component
// Cac View component giu nguyen 100%, khong can sua.
// ============================================================

/** Neu da dang nhap thi redirect thang vao /scenarios */
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

  // Neu khong co scenario trong state (vi du F5 tai /chat) -> quay ve /scenarios
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

/** Redirect thong minh: dang nhap -> /scenarios, chua dang nhap -> /login */
const RootRedirect: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/scenarios' : '/login'} replace />;
};

// ============================================================
// AppRoutes: Dinh nghia toan bo route cua ung dung
// ============================================================
const AppRoutes: React.FC = () => {
  const { isLoading } = useAuth();

  // Hien loading toan man hinh trong khi AuthContext kiem tra token / xu ly Google OAuth
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium text-sm">Dang tai JCAP...</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes: neu da dang nhap -> redirect sang /scenarios */}
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

      {/* Protected routes: chua dang nhap -> redirect sang /login */}
      <Route
        path="/scenarios"
        element={
          <PrivateRoute>
            <ScenarioRoute />
          </PrivateRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <PrivateRoute>
            <ChatRoute />
          </PrivateRoute>
        }
      />

      {/* Root & wildcard: redirect theo trang thai dang nhap */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

// ============================================================
// App root: BrowserRouter boc ngoai cung, AuthProvider ben trong
// de useNavigate() co the su dung ben trong AuthProvider neu can.
// ============================================================
export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </BrowserRouter>
);

export default App;
