import React, { useState } from 'react';
import { LoginView } from './views/LoginView';
import { ScenarioListView, type Scenario } from './views/ScenarioListView';
import { RoleplayChatView } from './views/RoleplayChatView';

// Định nghĩa 3 màn hình có thể hiển thị
type ViewType = 'login' | 'scenarios' | 'chat';

export const App: React.FC = () => {
  // Biến điều hướng màn hình (Mặc định ở màn Login)
  const [currentView, setCurrentView] = useState<ViewType>('login');

  // Lưu thông tin người dùng đang đăng nhập tạm thời
  const [user, setUser] = useState<{ email: string; level: string }>({
    email: '',
    level: 'N5',
  });

  // Lưu kịch bản người dùng chọn để vào phòng chat
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);

  // 1. Khi đăng nhập thành công ➔ Nhảy sang màn danh sách tình huống
  const handleLoginSuccess = (email: string, level: string) => {
    setUser({ email, level });
    setCurrentView('scenarios');
  };

  // 2. Khi bấm chọn 1 kịch bản ➔ Nhảy sang màn phòng luyện nói
  const handleSelectScenario = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setCurrentView('chat');
  };

  // 3. Khi bấm quay lại kịch bản
  const handleBackToScenarios = () => {
    setCurrentView('scenarios');
  };

  // 4. Khi đăng xuất ➔ Quay về màn login
  const handleLogout = () => {
    setUser({ email: '', level: 'N5' });
    setCurrentView('login');
  };

  return (
    <div>
      {/* Màn 1: Đăng nhập & Chọn Level */}
      {currentView === 'login' && (
        <LoginView onLoginSuccess={handleLoginSuccess} />
      )}

      {/* Màn 2: Danh sách Tình huống */}
      {currentView === 'scenarios' && (
        <ScenarioListView
          userEmail={user.email}
          userLevel={user.level}
          onSelectScenario={handleSelectScenario}
          onLogout={handleLogout}
        />
      )}

      {/* Màn 3: Phòng Luyện nói cùng AI */}
      {currentView === 'chat' && selectedScenario && (
        <RoleplayChatView
          scenario={selectedScenario}
          onBack={handleBackToScenarios}
        />
      )}
    </div>
  );
};

export default App;
