import React from 'react';
import { Outlet } from 'react-router-dom';

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F4F9FE] flex flex-col justify-center items-center font-sans text-[#071A44] p-4">
      {/* Simple header for Auth */}
      <div className="absolute top-0 left-0 w-full p-8 flex justify-center sm:justify-start">
        <span className="text-3xl font-bold text-[#0878EE] tracking-tight">JCAP</span>
      </div>
      
      {/* Auth Form Container */}
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-[#E6EDF5] overflow-hidden">
        <Outlet />
      </div>
      
      {/* Simple footer for Auth */}
      <div className="absolute bottom-0 left-0 w-full p-6 text-center text-sm text-[#71809A]">
        &copy; {new Date().getFullYear()} Japanese Conversation AI Platform.
      </div>
    </div>
  );
};
