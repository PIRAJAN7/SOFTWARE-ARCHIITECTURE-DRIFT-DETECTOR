import React, { useState, useEffect } from 'react';
import {
  History,
  GitCompare,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { ScanRun, ScanComparison } from '../types';

export const ScanHistoryPage: React.FC = () => {
  const { activeProject } = useProject();

  const [scans, setScans] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Comparison selection
  const [selectedScanA, setSelectedScanA] = useState<string>('');
  const [selectedScanB, setSelectedScanB] = useState<string>('');
  const [comparison, setComparison] = useState<ScanComparison | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!activeProject) {
      setScans([]);
      setLoading(false);
      return;
    }

    async function loadScans() {
      setLoading(true);
      try {
        const list = await api.getProjectScans(activeProject!.id);
        setScans(list);
        if (list.length >= 2) {
          setSelectedScanA(list[1].id);
          setSelectedScanB(list[0].id);
        } else if (list.length === 1) {
          setSelectedScanB(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load scan history:', err);
      } finally {
        setLoading(false);
      }
    }
    loadScans();
  }, [activeProject]);

  const handleCompare = async () => {
    if (!selectedScanA || !selectedScanB) return;
    setComparing(true);
    try {
      const data = await api.compareScans(selectedScanA, selectedScanB);
      setComparison(data);
    } catch (err: any) {
      alert(`Comparison failed: ${err.message}`);
    } finally {
      setComparing(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
        <History className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">No Project Selected</h2>
        <p className="text-xs text-slate-600 mb-4">
          Select a project from the top bar to inspect scan telemetry and historical comparisons.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Scan History & Drift Comparison</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Audit historical analysis runs and compare delta changes between any two scans.
          </p>
        </div>
      </div>

      {/* Comparison Tool Bar */}
      {scans.length >= 2 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <GitCompare className="h-4 w-4 text-slate-700" />
            <span>Compare Two Scans</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Base Scan (Earlier):</span>
              <select
                value={selectedScanA}
                onChange={(e) => setSelectedScanA(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-slate-800"
              >
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.created_at).toLocaleString()} ({s.source_version || s.id.substring(0, 6)})
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-400 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Target Scan (Later):</span>
              <select
                value={selectedScanB}
                onChange={(e) => setSelectedScanB(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-slate-800"
              >
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.created_at).toLocaleString()} ({s.source_version || s.id.substring(0, 6)})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCompare}
              disabled={comparing || selectedScanA === selectedScanB}
              className="px-4 py-1.5 text-xs font-semibold rounded-md text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {comparing ? 'Comparing...' : 'Run Comparison'}
            </button>
          </div>

          {/* Comparison Results Card */}
          {comparison && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 text-xs mt-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-xs uppercase font-bold text-slate-700 block">
                    Compliance Delta
                  </span>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {comparison.compliance_delta >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-teal-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-rose-600" />
                    )}
                    <span
                      className={`text-lg font-bold ${
                        comparison.compliance_delta >= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {comparison.compliance_delta > 0 ? `+${comparison.compliance_delta}%` : `${comparison.compliance_delta}%`}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-xs uppercase font-bold text-rose-700 block">
                    New Violations
                  </span>
                  <span className="text-lg font-bold text-rose-700 mt-1 block">
                    +{comparison.new_findings.length}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-xs uppercase font-bold text-teal-700 block">
                    Resolved Findings
                  </span>
                  <span className="text-lg font-bold text-teal-700 mt-1 block">
                    -{comparison.resolved_findings.length}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-xs uppercase font-bold text-slate-700 block">
                    Persistent Findings
                  </span>
                  <span className="text-lg font-bold text-slate-800 mt-1 block">
                    {comparison.persistent_findings.length}
                  </span>
                </div>
              </div>

              {/* Breakdown lists */}
              {comparison.new_findings.length > 0 && (
                <div className="bg-rose-50 p-3 rounded-lg border border-rose-200">
                  <span className="font-bold text-rose-900 block mb-1">
                    Newly Introduced Drift Findings:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-rose-900 text-xs font-medium">
                    {comparison.new_findings.map((f) => (
                      <li key={f.id}>
                        <b>[{f.rule_id}]</b> {f.title} ({f.file_path || f.source_module})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {comparison.resolved_findings.length > 0 && (
                <div className="bg-teal-50 p-3 rounded-lg border border-teal-200">
                  <span className="font-bold text-teal-900 block mb-1">
                    Resolved Architectural Drift:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-teal-900 text-xs font-medium">
                    {comparison.resolved_findings.map((f) => (
                      <li key={f.id}>
                        <b>[{f.rule_id}]</b> {f.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Historical Scans Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900">Analysis Runs Log</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs font-medium">Loading scan history...</div>
        ) : scans.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">No scans found for this project.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-800 bg-slate-100 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 font-bold">Scan ID / Tag</th>
                  <th className="py-3 px-4 font-bold">Timestamp</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold">Files / Modules</th>
                  <th className="py-3 px-4 font-bold">Dependencies</th>
                  <th className="py-3 px-4 font-bold">Violations</th>
                  <th className="py-3 px-4 font-bold">Compliance</th>
                  <th className="py-3 px-4 font-bold text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scans.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {s.source_version || s.id.substring(0, 8)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                          s.status === 'completed'
                            ? 'bg-teal-100 text-teal-800 border border-teal-200'
                            : s.status === 'running'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      {s.files_analyzed} files / {s.modules_discovered} mods
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-mono font-medium">
                      {s.dependencies_discovered}
                    </td>
                    <td className="py-3 px-4">
                      {s.total_findings === 0 ? (
                        <span className="text-teal-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" /> 0
                        </span>
                      ) : (
                        <span className="text-amber-800 font-bold">
                          {s.total_findings} ({s.critical_findings} crit)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                      {s.compliance_percentage}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 font-medium">
                      {s.duration_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
