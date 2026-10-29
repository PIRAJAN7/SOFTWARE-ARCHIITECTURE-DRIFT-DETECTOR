import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  History,
  CheckCircle2,
  FolderGit2,
  ArrowRight,
  TrendingUp,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from 'recharts';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { OverviewMetrics } from '../types';

export const OverviewPage: React.FC = () => {
  const { activeProject, projects } = useProject();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadMetrics() {
      setLoading(true);
      try {
        const data = await api.getOverview(activeProject?.id);
        if (isMounted) setMetrics(data);
      } catch (err) {
        console.error('Failed to load overview metrics:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, [activeProject]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-600">
        <div className="animate-spin h-9 w-9 border-3 border-slate-300 border-t-slate-900 rounded-full mb-3.5"></div>
        <p className="text-base font-medium">Loading architectural compliance metrics...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-8 bg-white border border-slate-300 rounded-xl shadow-xs text-center">
        <div className="h-14 w-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-700 mb-4">
          <FolderGit2 className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Projects Registered</h2>
        <p className="text-base text-slate-600 mb-6 max-w-md mx-auto">
          Get started by registering a project or uploading a source code repository archive to begin detecting architectural drift.
        </p>
        <button
          onClick={() => navigate('/projects?create=true')}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-base font-semibold rounded-lg text-white bg-slate-900 hover:bg-slate-800 transition-colors"
        >
          <span>Create First Project</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const severityData = metrics
    ? [
        { name: 'Critical', count: metrics.critical_findings, color: '#B91C1C' },
        { name: 'High', count: metrics.high_findings, color: '#C2410C' },
        { name: 'Medium', count: metrics.medium_findings, color: '#B45309' },
        { name: 'Low', count: metrics.low_findings, color: '#475569' },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Scope Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-300">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Architecture Overview</h1>
          <p className="text-base text-slate-600 mt-1">
            Real-time compliance, boundary violations, and drift telemetry for{' '}
            <span className="font-bold text-slate-900">
              {activeProject ? activeProject.name : 'All Projects'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/analyze')}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs"
          >
            Run New Scan
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Compliance */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs">
          <div className="flex items-center justify-between text-slate-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Compliance Rate</span>
            <ShieldCheck
              className={`h-5 w-5 ${
                (metrics?.compliance_percentage ?? 100) >= 90
                  ? 'text-teal-700'
                  : (metrics?.compliance_percentage ?? 100) >= 70
                  ? 'text-amber-700'
                  : 'text-red-700'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {metrics ? `${metrics.compliance_percentage}%` : '100%'}
            </span>
            <span className="text-xs font-semibold text-slate-600">rule adherence</span>
          </div>
          <p className="text-xs text-slate-600 mt-2 font-medium">
            Formula: 100 × (1 − violated rules / total rules)
          </p>
        </div>

        {/* Total Findings */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs">
          <div className="flex items-center justify-between text-slate-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Total Drift Findings</span>
            <AlertTriangle className="h-5 w-5 text-amber-700" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {metrics?.total_findings ?? 0}
            </span>
            <span className="text-xs font-semibold text-slate-600">active violations</span>
          </div>
          <p className="text-xs text-slate-600 mt-2 font-medium">
            Across components & layer boundaries
          </p>
        </div>

        {/* Critical & High */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs">
          <div className="flex items-center justify-between text-slate-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Critical / High Severity</span>
            <AlertOctagon className="h-5 w-5 text-red-700" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-red-700">
              {(metrics?.critical_findings ?? 0) + (metrics?.high_findings ?? 0)}
            </span>
            <span className="text-xs font-bold text-slate-600">
              ({metrics?.critical_findings ?? 0} crit, {metrics?.high_findings ?? 0} high)
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-2 font-medium">
            Immediate remediation recommended
          </p>
        </div>

        {/* Total Scans & Duration */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs">
          <div className="flex items-center justify-between text-slate-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Completed Scans</span>
            <History className="h-5 w-5 text-slate-700" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {metrics?.total_scans ?? 0}
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {metrics?.latest_scan ? `${metrics.latest_scan.duration_ms}ms last run` : 'no runs'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-2 font-medium">
            {metrics?.latest_scan?.completed_at
              ? `Last scan: ${new Date(metrics.latest_scan.completed_at).toLocaleTimeString()}`
              : 'Awaiting first analysis'}
          </p>
        </div>
      </div>

      {/* Compliance Formula Explanation Alert */}
      <div className="bg-slate-100 border border-slate-300 rounded-lg p-4 flex items-start gap-3 text-sm text-slate-800">
        <Info className="h-5 w-5 text-slate-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-900">Compliance Calculation Policy:</span>{' '}
          Compliance percentage is deterministically calculated as{' '}
          <code className="bg-white px-2 py-0.5 rounded border border-slate-300 font-mono text-xs font-semibold text-slate-900">
            100 × (1 − violated applicable rules / total applicable rules)
          </code>
          . This measures rule compliance against approved policies, not complete architectural correctness.
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Findings by Severity</h2>
          <p className="text-sm text-slate-600 mb-4">Distribution of active architectural drift issues</p>
          <div className="h-64 w-full">
            {metrics && metrics.total_findings > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fill: '#334155', fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 13, fill: '#334155', fontWeight: 600 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {severityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <CheckCircle2 className="h-8 w-8 text-green-700 mb-2" />
                <p className="text-sm font-semibold text-slate-900">Zero Architecture Drift Violations</p>
                <p className="text-xs text-slate-600">All modules conform to declared component boundaries.</p>
              </div>
            )}
          </div>
        </div>

        {/* Drift Trends Over Time */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Compliance Trend</h2>
          <p className="text-sm text-slate-600 mb-4">Historical rule compliance over previous scans</p>
          <div className="h-64 w-full">
            {metrics && metrics.trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="compliance_percentage"
                    stroke="#0D9488"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#0D9488' }}
                    activeDot={{ r: 6 }}
                    name="Compliance %"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <TrendingUp className="h-8 w-8 text-slate-400 mb-2" />
                <p className="text-sm font-semibold text-slate-800">Trend History Unavailable</p>
                <p className="text-xs text-slate-600">Run multiple scans over time to see trends.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tables: Top Violated Rules & Component Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Frequently Violated Architecture Rules */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs">
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            Most Frequently Violated Rules
          </h2>
          <p className="text-sm text-slate-600 mb-4">Top rules triggering architectural drift</p>
          {metrics && metrics.top_violated_rules.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900">
                <caption className="sr-only">Top violated architectural rules</caption>
                <thead>
                  <tr className="border-b border-slate-300 text-xs font-bold text-slate-700 uppercase">
                    <th scope="col" className="pb-2.5">Rule</th>
                    <th scope="col" className="pb-2.5">Type</th>
                    <th scope="col" className="pb-2.5">Severity</th>
                    <th scope="col" className="pb-2.5 text-right">Violations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {metrics.top_violated_rules.map((rule, idx) => (
                    <tr key={`${rule.rule_id}-${idx}`} className="hover:bg-slate-50/80">
                      <td className="py-2.5 font-semibold text-slate-900">
                        {rule.description || rule.rule_id}
                      </td>
                      <td className="py-2.5 text-slate-700 font-mono text-xs">
                        {rule.rule_type}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            rule.severity === 'critical'
                              ? 'bg-red-100 text-red-900 border border-red-300'
                              : rule.severity === 'high'
                              ? 'bg-orange-100 text-orange-900 border border-orange-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {rule.severity}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900">
                        {rule.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600 italic py-6 text-center">
              No rule violations recorded.
            </p>
          )}
        </div>

        {/* Component Health & Compliance */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-xs">
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            Component Boundaries & Status
          </h2>
          <p className="text-sm text-slate-600 mb-4">Modules and dependency distribution per component</p>
          {metrics && metrics.component_stats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900">
                <caption className="sr-only">Component compliance status and dependency counts</caption>
                <thead>
                  <tr className="border-b border-slate-300 text-xs font-bold text-slate-700 uppercase">
                    <th scope="col" className="pb-2.5">Component</th>
                    <th scope="col" className="pb-2.5">Modules</th>
                    <th scope="col" className="pb-2.5">In/Out Deps</th>
                    <th scope="col" className="pb-2.5">Violations</th>
                    <th scope="col" className="pb-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {metrics.component_stats.map((comp, idx) => (
                    <tr key={`${comp.component || 'unmapped'}-${idx}`} className="hover:bg-slate-50/80">
                      <td className="py-2.5 font-bold text-slate-900 capitalize">
                        {comp.component}
                      </td>
                      <td className="py-2.5 text-slate-700 font-medium">{comp.modules_count}</td>
                      <td className="py-2.5 text-slate-700 font-mono text-xs">
                        {comp.incoming_dependencies} / {comp.outgoing_dependencies}
                      </td>
                      <td className="py-2.5 font-bold text-slate-900">
                        {comp.violations_count}
                      </td>
                      <td className="py-2.5 text-right">
                        {comp.is_compliant ? (
                          <span className="inline-flex items-center gap-1 text-teal-800 font-bold text-xs">
                            <CheckCircle2 className="h-4 w-4 text-teal-700" /> Compliant
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-xs">
                            <AlertTriangle className="h-4 w-4 text-amber-700" /> Drifted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600 italic py-6 text-center">
              No component data available. Run an architecture scan to populate.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
