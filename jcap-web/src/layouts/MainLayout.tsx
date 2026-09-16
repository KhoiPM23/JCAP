import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';

export interface MainLayoutProps {
  children?: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F9FE] font-sans text-[#071A44]">
      {/* Fixed Header */}
      <Header />
      
      {/* Main Content Area */}
      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <Navbar />
        
        {/* Dynamic Content Outlet or Children */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 p-8 overflow-y-auto">
            {children || <Outlet />}
          </main>
          
          {/* Footer (Included as requested for shared foundation) */}
          <Footer />
        </div>
      </div>
    </div>
  );
};
