import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderGit2,
  Layers,
  PlayCircle,
  AlertTriangle,
  Network,
  History,
  FileText,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Projects', path: '/projects', icon: FolderGit2 },
  { name: 'Architecture', path: '/architecture', icon: Layers },
  { name: 'Analyze Drift', path: '/analyze', icon: PlayCircle },
  { name: 'Findings', path: '/findings', icon: AlertTriangle },
  { name: 'Dependency Graph', path: '/graph', icon: Network },
  { name: 'Scan History', path: '/history', icon: History },
  { name: 'Reports', path: '/reports', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { activeProject, latestScan } = useProject();

  return (
    <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-800 bg-slate-950">
        <div className="h-10 w-10 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-sm shrink-0">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight leading-none">
            Drift Detector
          </h1>
          <p className="text-xs text-slate-300 mt-1 font-mono font-medium">Architecture Quality</p>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
          Platform Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-md transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white font-bold border-l-4 border-teal-400 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
              {item.name === 'Findings' && latestScan && latestScan.total_findings > 0 && (
                <span className="ml-auto px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {latestScan.total_findings}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Active Project Footer Card */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70">
        <div className="px-3 py-3 rounded-lg bg-slate-800 border border-slate-700 text-xs">
          <p className="text-slate-300 text-xs uppercase font-bold tracking-wider">
            Active Scope
          </p>
          <p className="text-white font-bold text-sm truncate mt-1" title={activeProject?.name || 'No project selected'}>
            {activeProject ? activeProject.name : 'Select a Project'}
          </p>
          {latestScan && (
            <div className="flex items-center gap-2 mt-2 text-xs text-teal-300 font-semibold">
              <span className="h-2 w-2 rounded-full bg-teal-400 inline-block"></span>
              <span>Compliance: {latestScan.compliance_percentage}%</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
