import React from 'react';
import {
  FileText,
  Download,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';

export const ReportsPage: React.FC = () => {
  const { activeProject, latestScan } = useProject();
  const [downloadingFindingsCsv, setDownloadingFindingsCsv] = React.useState(false);
  const [downloadingFindingsJson, setDownloadingFindingsJson] = React.useState(false);
  const [downloadingHistoryCsv, setDownloadingHistoryCsv] = React.useState(false);
  const [downloadingHistoryJson, setDownloadingHistoryJson] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  if (!activeProject) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-slate-300 rounded-xl text-center shadow-xs">
        <FileText className="h-12 w-12 text-slate-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">No Project Selected</h2>
        <p className="text-base text-slate-600 mb-4">
          Select or create a project to generate and download architecture drift reports.
        </p>
      </div>
    );
  }

  const handleDownloadFindingsCsv = async () => {
    if (!latestScan) return;
    setDownloadingFindingsCsv(true);
    setDownloadError(null);
    try {
      await api.downloadCsvReport(latestScan.id, `architecture_findings_${latestScan.id.substring(0, 8)}.csv`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download Findings CSV report.');
    } finally {
      setDownloadingFindingsCsv(false);
    }
  };

  const handleDownloadFindingsJson = async () => {
    if (!latestScan) return;
    setDownloadingFindingsJson(true);
    setDownloadError(null);
    try {
      await api.downloadJsonReport(latestScan.id, `architecture_scan_report_${latestScan.id.substring(0, 8)}.json`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download Findings JSON report.');
    } finally {
      setDownloadingFindingsJson(false);
    }
  };

  const handleDownloadHistoryCsv = async () => {
    setDownloadingHistoryCsv(true);
    setDownloadError(null);
    try {
      await api.downloadProjectHistoryCsv(activeProject.id, `project_history_${activeProject.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download Project History CSV.');
    } finally {
      setDownloadingHistoryCsv(false);
    }
  };

  const handleDownloadHistoryJson = async () => {
    setDownloadingHistoryJson(true);
    setDownloadError(null);
    try {
      await api.downloadProjectHistoryJson(activeProject.id, `project_history_${activeProject.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download Project History JSON.');
    } finally {
      setDownloadingHistoryJson(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="pb-3 border-b border-slate-300">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Architecture Drift Reports & Exports</h1>
        <p className="text-base text-slate-600 mt-1">
          Export verified architectural drift findings, compliance scores, historical trends, and remediation evidence in RFC 4180 CSV and structured JSON.
        </p>
      </div>

      {downloadError && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-xs font-medium text-rose-800 flex items-center justify-between">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="underline font-bold ml-2 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Export Options Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Findings CSV Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="h-12 w-12 bg-teal-50 text-teal-800 rounded-lg flex items-center justify-center border border-teal-200">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Findings CSV Spreadsheet</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              One row per finding with 20 structured columns: Project Name, Scan ID, Rule ID, Severity, Source/Target Modules and Layers, Status, and Recommended Action. Includes UTF-8 BOM and Excel formula injection protection.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-mono font-semibold">Format: .csv (RFC 4180)</span>
            <button
              onClick={handleDownloadFindingsCsv}
              disabled={!latestScan || downloadingFindingsCsv}
              title={!latestScan ? 'Run a scan first to export findings' : undefined}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{downloadingFindingsCsv ? 'Exporting...' : 'Download Findings CSV'}</span>
            </button>
          </div>
        </div>

        {/* Findings & Scan JSON Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="h-12 w-12 bg-blue-50 text-blue-800 rounded-lg flex items-center justify-center border border-blue-200">
              <FileCode className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Full Scan Report JSON</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Standardized Schema v1.0 machine-readable report containing project and scan metadata, overall compliance score, severity breakdown summary, and complete finding objects with evidence.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-mono font-semibold">Format: .json (Schema v1.0)</span>
            <button
              onClick={handleDownloadFindingsJson}
              disabled={!latestScan || downloadingFindingsJson}
              title={!latestScan ? 'Run a scan first to export report' : undefined}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{downloadingFindingsJson ? 'Exporting...' : 'Download Scan JSON'}</span>
            </button>
          </div>
        </div>

        {/* Project History CSV Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="h-12 w-12 bg-emerald-50 text-emerald-800 rounded-lg flex items-center justify-center border border-emerald-200">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Scan History CSV</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Tabular audit log of all historical scan runs for {activeProject.name}. Tracks compliance percentage trends, module counts, dependency counts, and duration across all revisions.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-mono font-semibold">Format: .csv (UTF-8 BOM)</span>
            <button
              onClick={handleDownloadHistoryCsv}
              disabled={downloadingHistoryCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{downloadingHistoryCsv ? 'Exporting...' : 'Download History CSV'}</span>
            </button>
          </div>
        </div>

        {/* Project History JSON Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="h-12 w-12 bg-indigo-50 text-indigo-800 rounded-lg flex items-center justify-center border border-indigo-200">
              <FileCode className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Project History JSON</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Complete historical dataset for {activeProject.name} including project profile metadata and chronologically ordered scan telemetry records formatted for automated CI/CD and audit ingestion.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600 font-mono font-semibold">Format: .json (UTF-8)</span>
            <button
              onClick={handleDownloadHistoryJson}
              disabled={downloadingHistoryJson}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{downloadingHistoryJson ? 'Exporting...' : 'Download History JSON'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Summary Preview */}
      {latestScan ? (
        <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-xs space-y-5">
          <h2 className="text-lg font-bold text-slate-900 pb-2 border-b border-slate-200">
            Latest Scan Report Metadata: #{latestScan.id.substring(0, 8)}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-600 text-xs uppercase font-bold block">Target Project</span>
              <span className="font-bold text-slate-900 text-base mt-0.5 block">{activeProject.name}</span>
            </div>
            <div>
              <span className="text-slate-600 text-xs uppercase font-bold block">Scan Status</span>
              <span className="font-bold text-teal-800 text-base capitalize mt-0.5 inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-teal-700" />
                {latestScan.status}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-xs uppercase font-bold block">Compliance Score</span>
              <span className="font-bold text-slate-900 text-base mt-0.5 block">{latestScan.compliance_percentage}%</span>
            </div>
            <div>
              <span className="text-slate-600 text-xs uppercase font-bold block">Drift Findings</span>
              <span className="font-bold text-slate-900 text-base mt-0.5 block">{latestScan.total_findings}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-300 text-sm text-slate-800 space-y-1.5 font-mono">
            <p><span className="text-slate-600 font-sans font-semibold">Files Analyzed:</span> {latestScan.files_analyzed}</p>
            <p><span className="text-slate-600 font-sans font-semibold">Discovered Modules:</span> {latestScan.modules_discovered}</p>
            <p><span className="text-slate-600 font-sans font-semibold">Total Dependencies:</span> {latestScan.dependencies_discovered}</p>
            <p><span className="text-slate-600 font-sans font-semibold">Analysis Execution Duration:</span> {latestScan.duration_ms} ms</p>
            <p><span className="text-slate-600 font-sans font-semibold">Timestamp:</span> {new Date(latestScan.created_at).toLocaleString()}</p>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <p className="text-sm text-slate-600">
            No scans recorded yet for <strong className="text-slate-800">{activeProject.name}</strong>. Upload source code on the Analyze page to produce scan reports.
          </p>
        </div>
      )}
    </div>
  );
};
