import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppRouter } from './router';

// ============================================================
// App root: BrowserRouter bọc ngoài cùng, AuthProvider bên trong
// AppRouter điều phối toàn bộ định tuyến và layouts của ứng dụng.
// ============================================================
export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <ThemeProvider>
        <AppRouter />
      </ThemeProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
