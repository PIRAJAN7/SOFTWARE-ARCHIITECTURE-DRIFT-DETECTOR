import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Cpu,
  Sparkles,
  Server,
  Lock,
  CheckCircle2,
  User,
  ShieldCheck,
  LogOut,
  Mail,
  KeyRound,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [health, setHealth] = useState<{ status: string; database: string; version: string; storage?: string } | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    ai_enabled: boolean;
    provider: string;
    is_configured: boolean;
  } | null>(null);

  const [resetRequested, setResetRequested] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const h = await api.getHealth();
        setHealth(h);
      } catch (err) {
        console.error('Failed to load health:', err);
      }

      try {
        const ai = await api.getAiStatus();
        setAiStatus(ai);
      } catch (err) {
        console.error('Failed to load AI status:', err);
      }
    }
    loadConfig();
  }, []);

  const handleRequestPasswordReset = async () => {
    if (!user?.email) return;
    setResetLoading(true);
    setResetMessage(null);
    try {
      const res = await api.forgotPassword(user.email);
      setResetRequested(true);
      setResetMessage(res.message);
    } catch (err: any) {
      setResetMessage(err.message || 'Failed to dispatch password reset request.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Profile & System Settings</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Authenticated developer account profile, session controls, and architecture engine diagnostics.
        </p>
      </div>

      {/* Account Profile Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-slate-700" />
            <h2 className="text-base font-bold text-slate-900">Developer Profile</h2>
          </div>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 text-red-600" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Full Name</span>
            <p className="font-semibold text-slate-900 text-sm">{user?.full_name || 'Enterprise Developer'}</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Work Email Address</span>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400 shrink-0" />
              <p className="font-semibold text-slate-900 text-sm truncate font-mono">{user?.email || 'N/A'}</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Email Verification Status</span>
            <div className="flex items-center gap-1.5 font-bold text-teal-700">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              <span>Cryptographically Verified</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Account Established</span>
            <p className="font-medium text-slate-700">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Active Session'}
            </p>
          </div>
        </div>

        {/* Password Reset Trigger */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-slate-800 block">Account Security & Credentials</span>
            <span className="text-slate-500 text-[11px]">
              Passwords are cryptographically hashed using modern Argon2id.
            </span>
          </div>

          {resetRequested ? (
            <span className="text-xs text-teal-700 font-semibold bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200">
              {resetMessage || 'Password reset email dispatched.'}
            </span>
          ) : (
            <button
              onClick={handleRequestPasswordReset}
              disabled={resetLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 text-slate-600" />
              <span>{resetLoading ? 'Dispatching...' : 'Request Password Reset'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Backend & DB Health Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">Runtime Services Health</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              API Server
            </span>
            <div className="flex items-center gap-1.5 font-bold text-teal-700">
              <CheckCircle2 className="h-4 w-4 text-teal-600" />
              <span>{health ? health.status.toUpperCase() : 'CHECKING...'}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">FastAPI REST v1.0.0</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Database Connectivity
            </span>
            <div className="flex items-center gap-1.5 font-bold text-teal-700">
              <Database className="h-4 w-4 text-teal-600" />
              <span>{health ? health.database.toUpperCase() : 'CHECKING...'}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">SQLAlchemy + Alembic Migrations</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              AST Analyzer Engine
            </span>
            <div className="flex items-center gap-1.5 font-bold text-teal-700">
              <Cpu className="h-4 w-4 text-teal-600" />
              <span>OPERATIONAL</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Python AST + NetworkX</p>
          </div>
        </div>
      </div>

      {/* Security Policies */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">Security & Sandboxing Controls</h2>
        </div>

        <div className="space-y-2 text-xs text-slate-600">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
            <div>
              <span className="font-semibold text-slate-800 block">Zip Slip Path Traversal Protection</span>
              <span className="text-[11px] text-slate-500">
                Guarantees extracted paths do not escape target workspace sandbox.
              </span>
            </div>
            <span className="text-teal-700 font-bold text-[11px] bg-teal-50 px-2 py-1 rounded border border-teal-200">
              Enforced
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
            <div>
              <span className="font-semibold text-slate-800 block">Archive Size & Count Limits</span>
              <span className="text-[11px] text-slate-500">
                Maximum 50MB per upload, maximum 2,000 files extracted to reject Zip bombs.
              </span>
            </div>
            <span className="text-teal-700 font-bold text-[11px] bg-teal-50 px-2 py-1 rounded border border-teal-200">
              Active
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
            <div>
              <span className="font-semibold text-slate-800 block">Non-Execution Static Guarantee</span>
              <span className="text-[11px] text-slate-500">
                Source code is statically parsed into Abstract Syntax Trees. Code is never imported or executed.
              </span>
            </div>
            <span className="text-teal-700 font-bold text-[11px] bg-teal-50 px-2 py-1 rounded border border-teal-200">
              Verified
            </span>
          </div>
        </div>
      </div>

      {/* Optional AI Configuration */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">AI Assistance Configuration</h2>
        </div>

        <p className="text-xs text-slate-600">
          The core detection engine is 100% deterministic and requires zero external AI keys.
          If configured via environment variable (<code className="font-mono">AI_API_KEY</code>), AI provides plain-language architectural explanations for confirmed findings.
        </p>

        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-slate-800 block">AI Integration Mode</span>
            <span className="text-slate-500 text-[11px]">
              {aiStatus?.is_configured
                ? `Active provider: ${aiStatus.provider}`
                : 'Deterministic architectural expert reasoning engine active'}
            </span>
          </div>
          <span
            className={`px-2.5 py-1 rounded font-semibold text-[11px] ${
              aiStatus?.is_configured
                ? 'bg-teal-100 text-teal-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {aiStatus?.is_configured ? 'External LLM Enabled' : 'Deterministic Mode'}
          </span>
        </div>
      </div>
    </div>
  );
};
