import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  FolderGit2,
  Layers,
  ArrowRight,
  RefreshCw,
  FileCode2,
  Download,
  ShieldCheck,
  Clock,
} from 'lucide-react';

import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { ScanRun, Finding } from '../types';

export const AnalyzePage: React.FC = () => {
  const { activeProject, latestScan, refreshLatestScan, activeArchitecture, isArchLoading, refreshArchitectures } = useProject();
  const navigate = useNavigate();

  const [versionTag, setVersionTag] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [scanResult, setScanResult] = useState<ScanRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [isLoadingFindings, setIsLoadingFindings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadCsv = async () => {
    if (!activeDisplayScan) return;
    setDownloadingCsv(true);
    setDownloadError(null);
    try {
      await api.downloadCsvReport(activeDisplayScan.id, `drift_report_${activeDisplayScan.id.substring(0, 8)}.csv`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download CSV report.');
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleDownloadJson = async () => {
    if (!activeDisplayScan) return;
    setDownloadingJson(true);
    setDownloadError(null);
    try {
      await api.downloadJsonReport(activeDisplayScan.id, `drift_report_${activeDisplayScan.id.substring(0, 8)}.json`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download JSON report.');
    } finally {
      setDownloadingJson(false);
    }
  };

  // Automatically refresh latest scan and active architecture for current project on mount or project change
  useEffect(() => {
    if (activeProject) {
      refreshLatestScan(activeProject.id);
      refreshArchitectures(activeProject.id);
    }
  }, [activeProject?.id, refreshLatestScan, refreshArchitectures]);

  // Load findings whenever a scan result is set or updated
  const loadFindingsForScan = async (scanId: string) => {
    setIsLoadingFindings(true);
    try {
      const data = await api.getScanFindings(scanId);
      setFindings(data);
    } catch (err: any) {
      console.error('Failed to load scan findings:', err);
    } finally {
      setIsLoadingFindings(false);
    }
  };

  const activeDisplayScan = scanResult || (latestScan && latestScan.project_id === activeProject?.id ? latestScan : null);

  useEffect(() => {
    if (activeDisplayScan) {
      loadFindingsForScan(activeDisplayScan.id);
    } else {
      setFindings([]);
    }
  }, [activeDisplayScan?.id]);

  const handleApplyDefaultArchitecture = async () => {
    if (!activeProject) return;
    setIsApplyingTemplate(true);
    setError(null);
    try {
      const templates = await api.getArchitectureTemplates();
      const template = templates['layered'] || {
        name: 'Standard Layered Architecture',
        description: '4-layer clean architecture policy',
        components: [
          { name: 'presentation', layer: 1, allowed_dependencies: ['application', 'domain', 'service'] },
          { name: 'service', layer: 2, allowed_dependencies: ['repository', 'domain', 'shared'] },
          { name: 'repository', layer: 3, allowed_dependencies: ['shared', 'domain'] },
          { name: 'shared', layer: 4, allowed_dependencies: [] }
        ],
        rules: [
          { id: 'LAYER-DOWNWARD-001', type: 'layer_direction', severity: 'critical', layer_direction: 'downward_only', description: 'Dependencies flow downward' },
          { id: 'NO-CYCLIC-DEPENDENCIES', type: 'circular_dependency', severity: 'critical', description: 'No cyclic coupling' }
        ]
      };

      await api.createArchitecture({
        project_id: activeProject.id,
        name: template.name || 'Standard Layered Architecture',
        format: 'json',
        raw_content: JSON.stringify(template, null, 2),
      });

      await refreshArchitectures(activeProject.id);
    } catch (err: any) {
      setError(err.message || 'Failed to apply default architecture template');
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const isArchValid = Boolean(activeArchitecture && activeArchitecture.project_id === activeProject?.id);
  const isArchReady = !isArchLoading && isArchValid;
  const isCodeReady = Boolean(activeProject?.repository_path);
  const canStartScan = !isScanning && isCodeReady && isArchReady;

  const handleStartScan = async () => {
    if (!activeProject) return;

    if (!isArchReady || !activeArchitecture || activeArchitecture.project_id !== activeProject.id) {
      setError(`No architecture definition found for project '${activeProject.name}'. Please define or select an architecture definition before scanning.`);
      return;
    }

    if (!isCodeReady) {
      setError(`Project source code directory not found. Please upload project ZIP in Projects page first.`);
      return;
    }

    setIsScanning(true);
    setError(null);
    setScanResult(null);
    setFindings([]);

    try {
      const scan = await api.triggerScan({
        project_id: activeProject.id,
        architecture_id: activeArchitecture.id,
        source_version: versionTag.trim() || undefined,
      });
      setScanResult(scan);
      await refreshLatestScan(activeProject.id);
      await loadFindingsForScan(scan.id);
    } catch (err: any) {
      setError(err.message || 'Scan execution failed');
    } finally {
      setIsScanning(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-slate-300 rounded-xl text-center shadow-xs">
        <FolderGit2 className="h-12 w-12 text-slate-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">No Project Selected</h2>
        <p className="text-sm text-slate-600 mb-4">
          Select an active project from the top bar before initiating architectural drift analysis.
        </p>
      </div>
    );
  }

  // Calculate Finding Categories Counts
  const categoryCounts = {
    forbidden_import: findings.filter((f) => f.rule_type === 'forbidden_import').length,
    forbidden_dependency: findings.filter((f) => f.rule_type === 'forbidden_dependency').length,
    layer_violation: findings.filter((f) => f.rule_type === 'layer_violation' || f.rule_type === 'layer_direction').length,
    unexpected_dependency: findings.filter((f) => f.rule_type === 'unexpected_dependency').length,
    circular_dependency: findings.filter((f) => f.rule_type === 'circular_dependency').length,
    adr_violation: findings.filter((f) => f.rule_type === 'adr_violation').length,
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-300">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Analyze Architectural Drift</h1>
            <span className="text-xs px-3 py-1 rounded-full font-bold bg-slate-100 text-slate-800 border border-slate-300">
              Project: {activeProject.name}
            </span>
          </div>
          <p className="text-base text-slate-600 mt-1">
            Execute deterministic AST static analysis, extract module dependencies, and compare against the intended architecture.
          </p>
        </div>
        <button
          onClick={() => {
            refreshLatestScan(activeProject.id);
            refreshArchitectures(activeProject.id);
            if (activeDisplayScan) loadFindingsForScan(activeDisplayScan.id);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 shadow-xs transition-colors"
          title="Refresh Pre-flight State"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Pre-flight Scope Verification */}
      <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 pb-1 border-b border-slate-100">Analysis Pre-flight Checklist</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
          {/* Target Codebase */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 flex items-start gap-3.5">
            <div className="p-2.5 bg-slate-200 text-slate-800 rounded-lg shrink-0">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-slate-900 block text-base truncate">{activeProject.name}</span>
              <p className="text-slate-600 text-xs mt-1 truncate font-mono">
                {activeProject.repository_path || 'No source files uploaded yet'}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                {isCodeReady ? (
                  <span className="inline-flex items-center gap-1.5 text-teal-700 font-bold text-xs bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" /> Source Code Ready
                  </span>
                ) : (
                  <div className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-amber-800 font-bold text-xs bg-amber-50 px-2.5 py-1 rounded-md border border-amber-300">
                      <AlertTriangle className="h-4 w-4 text-amber-600" /> Upload ZIP in Projects page first
                    </span>
                    <button
                      onClick={() => navigate('/projects')}
                      className="block text-indigo-700 hover:text-indigo-900 text-xs font-bold underline"
                    >
                      Go to Projects & Upload Code →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Architecture Definition */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 flex items-start gap-3.5">
            <div className="p-2.5 bg-slate-200 text-slate-800 rounded-lg shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-slate-900 block text-base">Active Architecture Policy</span>
              {isArchLoading ? (
                <p className="text-slate-600 text-xs mt-1 flex items-center gap-1.5 font-medium">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-500" /> Verifying policy definition...
                </p>
              ) : isArchReady && activeArchitecture ? (
                <div>
                  <p className="text-slate-900 text-xs mt-1 font-bold">
                    {activeArchitecture.name} (v{activeArchitecture.version})
                  </p>
                  <p className="text-slate-600 text-xs font-medium">
                    {activeArchitecture.components?.length || 0} Components &middot; {activeArchitecture.rules?.length || 0} Drift Rules
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-teal-700 font-bold text-xs bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                      <CheckCircle2 className="h-4 w-4 text-teal-600" /> Policy Ready for Evaluation
                    </span>
                    <button
                      onClick={() => navigate('/architecture')}
                      className="text-slate-700 hover:text-slate-900 text-xs font-bold underline"
                    >
                      Manage Policy →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 mt-1">
                  <div className="flex items-start gap-1.5 text-amber-800 font-bold text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>No architecture policy saved for '{activeProject.name}'</span>
                  </div>
                  <p className="text-slate-600 text-xs">
                    An architecture policy must be saved before scanning for structural drift.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => navigate('/architecture')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs transition-colors"
                    >
                      <span>Define Architecture</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={handleApplyDefaultArchitecture}
                      disabled={isApplyingTemplate}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 shadow-xs transition-colors disabled:opacity-50"
                    >
                      {isApplyingTemplate ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Applying...</span>
                        </>
                      ) : (
                        <span>Apply Default Layered Policy</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scan Options */}
        <div className="pt-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
            Source Version / Git Tag (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. v2.1.0 or commit sha"
            value={versionTag}
            onChange={(e) => setVersionTag(e.target.value)}
            disabled={isScanning}
            className="w-full max-w-sm px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none disabled:bg-slate-100 shadow-xs"
          />
        </div>

        {/* Trigger Button & Prevention of Duplicate Submissions */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-600 font-medium">
              Analysis runs safely via AST without executing or importing target source modules.
            </p>
            {!isArchReady && (
              <p className="text-xs text-amber-800 font-bold mt-1">
                Architecture policy definition required before scanning can proceed.
              </p>
            )}
            {!isCodeReady && (
              <p className="text-xs text-amber-800 font-bold mt-1">
                Source code directory required before scanning can proceed.
              </p>
            )}
          </div>

          <button
            onClick={handleStartScan}
            disabled={!canStartScan}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
          >
            {isScanning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Executing Static Analysis...</span>
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                <span>Start Architecture Scan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-300 text-red-900 rounded-xl text-sm font-medium flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Scan Failed:</span>
              <span>{error}</span>
            </div>
          </div>
          {error.toLowerCase().includes('architecture') && (
            <button
              onClick={() => navigate('/architecture')}
              className="px-3.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-950 font-bold rounded-lg text-xs shrink-0 transition-colors border border-red-300"
            >
              Open Architecture Policy →
            </button>
          )}
        </div>
      )}

      {/* Real Scan Results Display */}
      {activeDisplayScan && (
        <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-xs space-y-6">
          {/* Header & Telemetry */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-200 gap-2">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-6 w-6 text-teal-700" />
              <h3 className="text-lg font-bold text-slate-900">
                {scanResult ? 'Analysis Completed Successfully' : 'Latest Scan Results'}
              </h3>
              <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                Status: {activeDisplayScan.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-500" />
                {activeDisplayScan.completed_at
                  ? new Date(activeDisplayScan.completed_at).toLocaleString()
                  : new Date(activeDisplayScan.created_at).toLocaleString()}
              </span>
              <span>&middot;</span>
              <span>{activeDisplayScan.duration_ms}ms</span>
              {activeDisplayScan.source_version && (
                <>
                  <span>&middot;</span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                    Version: {activeDisplayScan.source_version}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Compliance Score & Exact Calculation Explanation */}
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900">
                <ShieldCheck className="h-6 w-6 text-slate-800" />
                <h4 className="text-base font-bold text-slate-900">Architectural Compliance Score</h4>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                Calculation: <strong>{activeDisplayScan.compliance_percentage}%</strong> adherence derived from{' '}
                <code className="bg-white px-2 py-0.5 rounded border border-slate-300 font-mono text-xs font-bold text-slate-900">
                  100 &times; (1 &minus; Violated Rules / Total Applicable Rules)
                </code>
                .
              </p>
            </div>
            <div className="flex items-baseline gap-2.5 shrink-0">
              <span
                className={`text-4xl font-extrabold ${
                  activeDisplayScan.compliance_percentage >= 90
                    ? 'text-teal-700'
                    : activeDisplayScan.compliance_percentage >= 70
                    ? 'text-amber-700'
                    : 'text-red-700'
                }`}
              >
                {activeDisplayScan.compliance_percentage}%
              </span>
              <span className="text-xs font-bold text-slate-600">
                ({activeDisplayScan.total_findings === 0 ? 'Full Conformance' : `${activeDisplayScan.total_findings} Drift Issues`})
              </span>
            </div>
          </div>

          {/* Core Telemetry Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs uppercase font-bold text-slate-700 tracking-wider block">Files Analyzed</span>
              <span className="text-2xl font-extrabold text-slate-900">{activeDisplayScan.files_analyzed}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs uppercase font-bold text-slate-700 tracking-wider block">Modules Discovered</span>
              <span className="text-2xl font-extrabold text-slate-900">{activeDisplayScan.modules_discovered}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs uppercase font-bold text-slate-700 tracking-wider block">Dependencies</span>
              <span className="text-2xl font-extrabold text-slate-900">{activeDisplayScan.dependencies_discovered}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs uppercase font-bold text-slate-700 tracking-wider block">Total Drift Findings</span>
              <span className="text-2xl font-extrabold text-slate-900">{activeDisplayScan.total_findings}</span>
            </div>
          </div>

          {/* Severity Breakdown Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-red-300 bg-red-50 text-red-950 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold block uppercase tracking-wider text-red-800">Critical</span>
                <span className="text-xl font-extrabold">{activeDisplayScan.critical_findings}</span>
              </div>
              <span className="text-xs bg-red-200 px-2.5 py-0.5 rounded-full font-bold text-red-900">Blocker</span>
            </div>
            <div className="p-3.5 rounded-xl border border-orange-300 bg-orange-50 text-orange-950 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold block uppercase tracking-wider text-orange-800">High</span>
                <span className="text-xl font-extrabold">{activeDisplayScan.high_findings}</span>
              </div>
              <span className="text-xs bg-orange-200 px-2.5 py-0.5 rounded-full font-bold text-orange-900">Policy Drift</span>
            </div>
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold block uppercase tracking-wider text-amber-800">Medium</span>
                <span className="text-xl font-extrabold">{activeDisplayScan.medium_findings}</span>
              </div>
              <span className="text-xs bg-amber-200 px-2.5 py-0.5 rounded-full font-bold text-amber-900">Coupling</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-300 bg-slate-100 text-slate-900 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold block uppercase tracking-wider text-slate-700">Low</span>
                <span className="text-xl font-extrabold">{activeDisplayScan.low_findings}</span>
              </div>
              <span className="text-xs bg-slate-200 px-2.5 py-0.5 rounded-full font-bold text-slate-800">Notice</span>
            </div>
          </div>

          {/* Finding Categories Breakdown */}
          <div className="space-y-2.5 pt-1">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Finding Categories Breakdown
            </h4>
            <div className="flex flex-wrap gap-2.5 text-xs">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-900 font-medium">
                <span className="font-extrabold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{categoryCounts.forbidden_import}</span>
                <span>Forbidden Imports</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-900 font-medium">
                <span className="font-extrabold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{categoryCounts.forbidden_dependency}</span>
                <span>Forbidden Dependencies</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-900 font-medium">
                <span className="font-extrabold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">{categoryCounts.layer_violation}</span>
                <span>Layer Violations</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-900 font-medium">
                <span className="font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{categoryCounts.unexpected_dependency}</span>
                <span>Unexpected Dependencies</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-900 font-medium">
                <span className="font-extrabold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">{categoryCounts.circular_dependency}</span>
                <span>Circular Dependencies</span>
              </span>
              {categoryCounts.adr_violation > 0 && (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-900 font-medium">
                  <span className="font-extrabold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">{categoryCounts.adr_violation}</span>
                  <span>ADR Violations</span>
                </span>
              )}
            </div>
          </div>

          {/* Detailed Findings Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <h4 className="text-base font-bold text-slate-900">
                Detailed Findings & Traceable Evidence ({findings.length})
              </h4>
              <button
                onClick={() => navigate('/findings')}
                className="text-xs font-bold text-slate-800 hover:text-slate-950 underline flex items-center gap-1"
              >
                <span>Full Triage Drawer</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {isLoadingFindings ? (
              <div className="p-8 text-center text-sm text-slate-600 font-medium">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-500" />
                <span>Loading finding records from database...</span>
              </div>
            ) : findings.length === 0 ? (
              <div className="p-6 rounded-xl bg-teal-50 border border-teal-300 text-center text-sm text-teal-900">
                <CheckCircle2 className="h-7 w-7 text-teal-700 mx-auto mb-1.5" />
                <span className="font-bold block text-base">Zero Architectural Drift Detected!</span>
                <span>All examined source files adhere to declared component boundaries and dependency directions.</span>
              </div>
            ) : (
              <div className="border border-slate-300 rounded-xl overflow-hidden overflow-x-auto shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 border-b border-slate-300 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3.5">Severity</th>
                      <th className="py-3 px-3.5">Rule</th>
                      <th className="py-3 px-3.5">Source File & Line</th>
                      <th className="py-3 px-3.5">Evidence</th>
                      <th className="py-3 px-3.5">Recommended Correction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {findings.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                              f.severity === 'critical'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : f.severity === 'high'
                                ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {f.severity}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-slate-900 block">
                            {f.rule_id}
                          </span>
                          <span className="text-xs text-slate-600 font-semibold">{f.rule_type.replace('_', ' ')}</span>
                        </td>
                        <td className="py-3 px-3.5">
                          {f.file_path ? (
                            <span className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <FileCode2 className="h-4 w-4 shrink-0 text-slate-500" />
                              <span className="truncate max-w-[220px]" title={f.file_path}>
                                {f.file_path}
                              </span>
                              {f.line_number && <span className="text-slate-600 font-semibold">:{f.line_number}</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Global Graph Cycle</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-mono text-xs font-semibold bg-slate-100 px-2.5 py-1.5 rounded-md text-slate-900 border border-slate-200 max-w-xs truncate" title={f.evidence || f.title}>
                            {f.evidence || f.title}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-slate-800 text-xs font-normal max-w-sm">
                          <span className="line-clamp-2 leading-relaxed" title={f.remediation || f.explanation}>
                            {f.remediation || f.explanation}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Navigation & Download Actions */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => navigate('/findings')}
                className="inline-flex items-center gap-2 px-4 py-2.5 font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-xs transition-colors"
              >
                <span>Triage Findings</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => navigate('/graph')}
                className="inline-flex items-center gap-2 px-4 py-2.5 font-bold rounded-lg bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 shadow-xs transition-colors"
              >
                <span>Interactive Dependency Graph</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => navigate('/history')}
                className="inline-flex items-center gap-2 px-4 py-2.5 font-semibold rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <span>View Scan History</span>
              </button>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  disabled={downloadingJson}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold transition-colors shadow-xs text-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span>{downloadingJson ? 'Downloading...' : 'JSON Report'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={downloadingCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold transition-colors shadow-xs text-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span>{downloadingCsv ? 'Downloading...' : 'CSV Report'}</span>
                </button>
              </div>
              {downloadError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded">
                  <span>{downloadError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
