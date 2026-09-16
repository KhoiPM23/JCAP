import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppRouter } from './router';

// ============================================================
// App root: BrowserRouter bọc ngoài cùng, AuthProvider bên trong
// AppRouter sẽ chứa toàn bộ định tuyến và layouts của ứng dụng.
// ============================================================
export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </BrowserRouter>
);

export default App;
