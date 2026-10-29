import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center text-teal-400 shadow-sm animate-pulse mb-4">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-700">Verifying session...</p>
        <p className="text-xs text-slate-400 mt-1">Software Architecture Drift Detector</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
