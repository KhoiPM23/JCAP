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
import { ScenarioListView, type Scenario } from './views/ScenarioListView';
import { RoleplayChatView } from './views/RoleplayChatView';
import { PrivateRoute } from './components/PrivateRoute';
import { AdminCreditPackagesView } from './views/admin/AdminCreditPackagesView';
import { LearnerBillingView } from './views/learner/LearnerBillingView';

// ============================================================
// Route Wrappers: inject navigate callbacks vao cac View component
// ============================================================

/** Neu da dang nhap: Admin sang trang admin, Learner sang /scenarios */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={user?.role === 'Admin' ? '/admin/credits/packages' : '/scenarios'} replace />;
  }
  return <>{children}</>;
};

/** Protected route danh rieng cho Admin */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium text-sm">Dang kiem tra quyen Admin...</p>
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
        // Kiem tra role de dieu huong dung trang
        const savedUserStr = localStorage.getItem('jcap_user');
        const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
        if (savedUser?.role === 'Admin') {
          navigate('/admin/credits/packages', { replace: true });
        } else {
          navigate('/scenarios', { replace: true });
        }
      }}
      onSwitchToRegister={() => navigate('/register')}
    />
  );
};

const RegisterRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <RegisterView
      onRegisterSuccess={() => navigate('/scenarios', { replace: true })}
      onSwitchToLogin={() => navigate('/login')}
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
    <div>
      {/* Banner nhanh cho Admin neu dang xem man hinh hoc vien */}
      {user?.role === 'Admin' && (
        <div className="bg-slate-900 text-white px-4 py-2 text-xs flex justify-between items-center">
          <span>🛡️ Ban dang dang nhap voi tu cach <strong>Admin ({user.email})</strong>.</span>
          <button
            onClick={() => navigate('/admin/credits/packages')}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-semibold transition"
          >
            Vao Trang Quan Tri Goi Credit &rarr;
          </button>
        </div>
      )}
      <ScenarioListView
        userEmail={user?.email || ''}
        userLevel={userLevel || 'N5'}
        onSelectScenario={handleSelectScenario}
        onLogout={handleLogout}
      />
    </div>
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

/** Redirect thong minh: Admin -> /admin/credits/packages, Learner -> /scenarios, chua dang nhap -> /login */
const RootRedirect: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'Admin' ? '/admin/credits/packages' : '/scenarios'} replace />;
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
      {/* Public routes: neu da dang nhap -> redirect thong minh theo role */}
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

      {/* Admin routes: chi danh rieng cho tai khoan Admin */}
      <Route
        path="/admin/credits/packages"
        element={
          <AdminRoute>
            <AdminCreditPackagesView />
          </AdminRoute>
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
      <Route
        path="/billing"
        element={
          <PrivateRoute>
            <LearnerBillingView />
          </PrivateRoute>
        }
      />

      {/* Root & wildcard: redirect theo trang thai dang nhap va role */}
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
