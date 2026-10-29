import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  CheckCircle2,
  FileCode2,
  Sparkles,
  X,
  History,
  ArrowRight,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { Finding, FindingStatus } from '../types';


export const FindingsPage: React.FC = () => {
  const { latestScan, activeProject, refreshLatestScan } = useProject();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected Finding Drawer
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);

  // AI Advice State
  const [aiAdvice, setAiAdvice] = useState<{
    ai_explanation: string;
    architectural_remediation: string;
  } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (activeProject && !latestScan) {
      refreshLatestScan(activeProject.id);
    }
  }, [activeProject?.id, latestScan, refreshLatestScan]);

  useEffect(() => {
    if (!latestScan) {
      setFindings([]);
      setLoading(false);
      return;
    }

    async function loadFindings() {
      setLoading(true);
      try {
        const data = await api.getScanFindings(latestScan!.id, {
          severity: severityFilter || undefined,
          status: statusFilter || undefined,
          rule_type: ruleTypeFilter || undefined,
          search: searchTerm.trim() || undefined,
        });
        setFindings(data);
      } catch (err) {
        console.error('Failed to load findings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadFindings();
  }, [latestScan, severityFilter, statusFilter, ruleTypeFilter, searchTerm]);

  const handleOpenFinding = async (finding: Finding) => {
    setSelectedFinding(finding);
    setAiAdvice(null);
    try {
      const detailed = await api.getFindingDetails(finding.id);
      setSelectedFinding(detailed);
    } catch {
      // Keep existing
    }
  };

  const handleStatusChange = async (newStatus: FindingStatus, reason?: string) => {
    if (!selectedFinding) return;

    setIsUpdatingStatus(true);
    try {
      const updated = await api.updateFindingStatus(selectedFinding.id, newStatus, reason);
      setSelectedFinding(updated);
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setShowExceptionDialog(false);
      setExceptionReason('');
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleRequestAiAdvice = async () => {
    if (!selectedFinding) return;
    setLoadingAi(true);
    try {
      const advice = await api.explainFinding({
        rule_type: selectedFinding.rule_type,
        title: selectedFinding.title,
        explanation: selectedFinding.explanation,
        source_component: selectedFinding.source_component,
        target_component: selectedFinding.target_component,
        evidence: selectedFinding.evidence,
      });
      setAiAdvice(advice);
    } catch (err: any) {
      alert(`Failed to retrieve advice: ${err.message}`);
    } finally {
      setLoadingAi(false);
    }
  };

  if (!latestScan) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
        <AlertTriangle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">No Scans Recorded</h2>
        <p className="text-xs text-slate-600 mb-4">
          Execute a drift scan from the Analyze page to view architectural findings and violations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Architectural Drift Findings</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Traceable violations, forbidden imports, circular coupling, and layer transgressions.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">
          Showing {findings.length} findings for Scan #{latestScan.id.substring(0, 8)}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by title, module, or statement..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs font-medium text-slate-900 placeholder:text-slate-500"
          />
        </div>

        {/* Severity */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="accepted_exception">Accepted Exception</option>
        </select>

        {/* Rule Type */}
        <select
          value={ruleTypeFilter}
          onChange={(e) => setRuleTypeFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
        >
          <option value="">All Rule Types</option>
          <option value="forbidden_import">Forbidden External Import</option>
          <option value="forbidden_dependency">Forbidden Dependency</option>
          <option value="layer_violation">Layer Violation</option>
          <option value="circular_dependency">Circular Dependency</option>
          <option value="unexpected_dependency">Unexpected Dependency</option>
          <option value="unmapped_module">Unmapped Module</option>
          <option value="missing_component">Missing Component</option>
          <option value="adr_violation">Architecture Decision (ADR)</option>
        </select>

        {(severityFilter || statusFilter || ruleTypeFilter || searchTerm) && (
          <button
            onClick={() => {
              setSeverityFilter('');
              setStatusFilter('');
              setRuleTypeFilter('');
              setSearchTerm('');
            }}
            className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Findings List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 font-medium">Loading findings...</div>
      ) : findings.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <CheckCircle2 className="h-10 w-10 text-teal-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 mb-1">No Matching Drift Findings</h3>
          <p className="text-xs text-slate-600 max-w-sm mx-auto">
            The codebase matches all applicable architecture boundary rules for the selected filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {findings.map((f) => (
            <div
              key={f.id}
              onClick={() => handleOpenFinding(f)}
              className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm shadow-xs cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                      f.severity === 'critical'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : f.severity === 'high'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-yellow-100 text-yellow-900 border border-yellow-300'
                    }`}
                  >
                    {f.severity}
                  </span>

                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                    {f.rule_id}
                  </span>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      f.status === 'open'
                        ? 'bg-slate-100 text-slate-800 border border-slate-200'
                        : f.status === 'accepted_exception'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-teal-100 text-teal-800 border border-teal-200'
                    }`}
                  >
                    {f.status.replace('_', ' ')}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug">{f.title}</h3>
                <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">{f.explanation}</p>

                {/* File & Evidence Snippet */}
                {f.file_path && (
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-700 pt-1">
                    <FileCode2 className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                      {f.file_path}
                      {f.line_number ? `:${f.line_number}` : ''}
                    </span>
                    {f.evidence && (
                      <span className="text-slate-600 truncate">({f.evidence})</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <span className="text-xs font-bold text-slate-800 hover:text-slate-950 flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors">
                  Inspect Details <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Finding Detail Modal / Drawer */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-slate-200 space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                      selectedFinding.severity === 'critical'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {selectedFinding.severity}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">{selectedFinding.rule_id}</span>
                </div>
                <h2 className="text-base font-bold text-slate-900">{selectedFinding.title}</h2>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Explanation & Source Traceability */}
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-800 mb-1">Architectural Explanation</h4>
                <p className="text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  {selectedFinding.explanation}
                </p>
              </div>

              {/* Evidence & File Line */}
              {selectedFinding.evidence && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">Traceable Evidence</h4>
                  <div className="p-3.5 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
                    {selectedFinding.file_path && (
                      <div className="text-slate-300 mb-1.5 font-medium">
                        File: {selectedFinding.file_path} (Line {selectedFinding.line_number})
                      </div>
                    )}
                    <div className="text-emerald-400 font-semibold">{selectedFinding.evidence}</div>
                  </div>
                </div>
              )}

              {/* Expected vs Actual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-900 block mb-1">Expected Behavior</span>
                  <p className="text-slate-700 text-xs leading-relaxed">
                    {selectedFinding.expected_behavior || 'Preserve defined architectural layer direction'}
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-900 block mb-1">Actual Behavior</span>
                  <p className="text-slate-700 text-xs leading-relaxed">
                    {selectedFinding.actual_behavior || 'Direct dependency detected'}
                  </p>
                </div>
              </div>

              {/* Remediation Strategy */}
              {selectedFinding.remediation && (
                <div className="p-3.5 bg-teal-50 border border-teal-200 text-teal-950 rounded-lg">
                  <span className="font-bold block mb-1 text-teal-900">Remediation Guidance</span>
                  <p className="text-xs leading-relaxed text-teal-900">{selectedFinding.remediation}</p>
                </div>
              )}

              {/* Optional AI Explanation */}
              <div className="pt-2">
                {!aiAdvice ? (
                  <button
                    onClick={handleRequestAiAdvice}
                    disabled={loadingAi}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors shadow-xs"
                  >
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    <span>{loadingAi ? 'Analyzing...' : 'Generate Architectural Analysis & Advice'}</span>
                  </button>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="flex items-center gap-1.5 text-teal-800 font-bold">
                      <Sparkles className="h-4 w-4" />
                      <span>Architectural Expert Recommendation</span>
                    </div>
                    <p className="text-slate-800 text-xs leading-relaxed">
                      {aiAdvice.ai_explanation}
                    </p>
                    <div className="text-slate-900 font-bold text-xs pt-1.5 border-t border-slate-200">
                      Strategy: {aiAdvice.architectural_remediation}
                    </div>
                  </div>
                )}
              </div>

              {/* Audit History */}
              {selectedFinding.audit_logs && selectedFinding.audit_logs.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-slate-600" />
                    <span>Status Audit Trail</span>
                  </h4>
                  <div className="space-y-2">
                    {selectedFinding.audit_logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 flex justify-between"
                      >
                        <span>
                          Changed from <b className="text-slate-900">{log.previous_status}</b> to <b className="text-slate-900">{log.new_status}</b>
                          {log.reason && ` (Reason: "${log.reason}")`}
                        </span>
                        <span className="text-slate-500 font-mono text-xs">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Status Actions Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Current Status: <b className="text-slate-900">{selectedFinding.status}</b>
              </span>

              <div className="flex items-center gap-2">
                {selectedFinding.status !== 'acknowledged' && (
                  <button
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusChange('acknowledged')}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedFinding.status !== 'resolved' && (
                  <button
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusChange('resolved')}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700"
                  >
                    Mark Resolved
                  </button>
                )}
                {selectedFinding.status !== 'accepted_exception' && (
                  <button
                    disabled={isUpdatingStatus}
                    onClick={() => setShowExceptionDialog(true)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Accept Exception
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Exception Reason Dialog */}
      {showExceptionDialog && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Document Accepted Architectural Exception</h3>
            <p className="text-xs text-slate-600">
              A clear architectural justification is required to accept this violation into the audit log.
            </p>
            <textarea
              rows={3}
              required
              placeholder="e.g. Approved temporary exception pending Q3 domain service decoupling..."
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowExceptionDialog(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                disabled={!exceptionReason.trim()}
                onClick={() => handleStatusChange('accepted_exception', exceptionReason)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md"
              >
                Confirm Exception
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
