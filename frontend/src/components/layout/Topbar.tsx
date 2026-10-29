import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  PlayCircle,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  LogOut,
  Settings,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useAuth } from '../../context/AuthContext';

export const Topbar: React.FC = () => {
  const { projects, activeProject, setActiveProject, latestScan, refreshProjects } = useProject();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshProjects();
    setIsRefreshing(false);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'AR';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs z-20">
      {/* Left: Active Project Selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FolderGit2 className="h-4 w-4 text-slate-700" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Project:
          </span>
        </div>

        {projects.length > 0 ? (
          <select
            aria-label="Select active software project"
            value={activeProject?.id || ''}
            onChange={(e) => {
              const selected = projects.find((p) => p.id === e.target.value);
              if (selected) setActiveProject(selected);
            }}
            className="text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer max-w-xs truncate shadow-xs"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-slate-600 italic">No projects registered</span>
        )}

        <button
          onClick={() => navigate('/projects?create=true')}
          className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors border border-slate-300"
          title="Create New Project"
          aria-label="Create New Project"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          onClick={handleRefresh}
          className={`p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors border border-slate-300 ${
            isRefreshing ? 'animate-spin text-slate-900' : ''
          }`}
          title="Refresh Data"
          aria-label="Refresh Data"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right: Scan Status Indicator, Analyze Drift & User Account Menu */}
      <div className="flex items-center gap-3.5">
        {latestScan ? (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border bg-slate-50 border-slate-300">
            {latestScan.status === 'completed' ? (
              latestScan.total_findings === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-teal-700" />
                  <span className="text-teal-900 font-bold">Architecture Compliant (100%)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <span className="text-amber-950 font-bold">
                    {latestScan.total_findings} Drift Violations ({latestScan.compliance_percentage}%)
                  </span>
                </>
              )
            ) : latestScan.status === 'running' ? (
              <>
                <Clock className="h-4 w-4 text-blue-700 animate-spin" />
                <span className="text-blue-900 font-bold">Analyzing Project...</span>
              </>
            ) : (
              <span className="text-slate-800 font-bold">Scan Status: {latestScan.status}</span>
            )}
          </div>
        ) : (
          <span className="hidden sm:inline text-xs text-slate-600 font-medium">No scans executed</span>
        )}

        <button
          onClick={() => navigate('/analyze')}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs"
        >
          <PlayCircle className="h-4 w-4" />
          <span className="hidden md:inline">Analyze Drift</span>
        </button>

        {/* User Account Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            title="User Profile Menu"
          >
            <div className="h-8 w-8 rounded-full bg-slate-900 text-teal-300 flex items-center justify-center font-bold text-xs shadow-xs">
              {getInitials(user?.full_name, user?.email)}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[120px]">
                {user?.full_name || user?.email?.split('@')[0] || 'User'}
              </span>
              <span className="text-[10px] text-teal-700 font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500"></span>
                Verified
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 text-xs">
              <div className="px-4 py-2.5 border-b border-slate-100 space-y-1">
                <p className="font-semibold text-slate-900 text-sm truncate">
                  {user?.full_name || 'Enterprise Developer'}
                </p>
                <p className="text-slate-500 font-mono text-[11px] truncate">{user?.email}</p>
                <div className="pt-1 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-teal-600" />
                    Verified Email
                  </span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium transition-colors"
                >
                  <Settings className="h-4 w-4 text-slate-400" />
                  <span>Account & System Settings</span>
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-red-700 hover:bg-red-50 flex items-center gap-2.5 font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4 text-red-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
