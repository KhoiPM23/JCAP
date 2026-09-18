import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

export const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  // Dang kiem tra trang thai xac thuc -> cho
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium text-sm">Dang kiem tra dang nhap...</p>
      </div>
    );
  }

  // Chua dang nhap -> redirect ve /login, ghi nho duong dan hien tai de quay lai sau
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Da dang nhap -> cho phep truy cap
  return <>{children}</>;
};
