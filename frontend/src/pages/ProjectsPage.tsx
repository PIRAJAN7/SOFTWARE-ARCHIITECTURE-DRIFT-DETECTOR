import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Plus,
  Trash2,
  Upload,
  PlayCircle,
  X,
  FileArchive,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';


export const ProjectsPage: React.FC = () => {
  const { projects, activeProject, setActiveProject, refreshProjects } = useProject();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [showCreateModal, setShowCreateModal] = useState(searchParams.get('create') === 'true');
  const [uploadingProjectId, setUploadingProjectId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    primary_language: 'python',
    source_dirs: 'app,src',
    exclude_dirs: '.venv,venv,__pycache__,tests,dist,build,node_modules,.git',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const newProj = await api.createProject(formData);
      await refreshProjects();
      setActiveProject(newProj);
      setShowCreateModal(false);
      setFormData({
        name: '',
        description: '',
        primary_language: 'python',
        source_dirs: 'app,src',
        exclude_dirs: '.venv,venv,__pycache__,tests,dist,build,node_modules,.git',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete project "${name}"? This will permanently delete its scans and findings.`)) {
      return;
    }

    try {
      await api.deleteProject(id);
      await refreshProjects();
    } catch (err: any) {
      alert(`Failed to delete project: ${err.message}`);
    }
  };

  const handleUploadZip = async (projectId: string) => {
    if (!uploadFile) return;

    setIsSubmitting(true);
    setUploadStatus('Uploading & validating archive...');
    setError(null);

    try {
      await api.uploadProjectZip(projectId, uploadFile);
      setUploadStatus('Extracted and configured successfully!');
      await refreshProjects();
      setTimeout(() => {
        setUploadingProjectId(null);
        setUploadFile(null);
        setUploadStatus(null);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setUploadStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Project Management</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Register codebases, upload source code archives, and configure analysis scopes.
          </p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p) => {
          const isActive = activeProject?.id === p.id;
          return (
            <div
              key={p.id}
              className={`bg-white rounded-xl border p-5 shadow-xs flex flex-col justify-between transition-all ${
                isActive ? 'border-teal-500 ring-1 ring-teal-500/20' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                      <FolderGit2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 leading-snug">{p.name}</h3>
                      <span className="text-xs font-mono text-slate-600 capitalize font-medium">
                        {p.primary_language}
                      </span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
                      Active
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-700 mb-4 line-clamp-2 leading-relaxed">
                  {p.description || 'No description provided.'}
                </p>

                {/* Metrics pill summary */}
                <div className="grid grid-cols-3 gap-2 py-3 px-3 bg-slate-50 rounded-lg border border-slate-200 text-center mb-4 text-xs">
                  <div>
                    <span className="text-xs uppercase font-bold text-slate-700 block">Scans</span>
                    <span className="font-bold text-slate-900 text-sm">{p.total_scans ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold text-slate-700 block">Compliance</span>
                    <span
                      className={`font-bold text-sm ${
                        (p.latest_compliance_percentage ?? 100) >= 90
                          ? 'text-teal-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {p.latest_compliance_percentage !== undefined && p.latest_compliance_percentage !== null
                        ? `${p.latest_compliance_percentage}%`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold text-slate-700 block">Violations</span>
                    <span
                      className={`font-bold text-sm ${
                        (p.open_findings_count ?? 0) > 0 ? 'text-amber-700' : 'text-slate-800'
                      }`}
                    >
                      {p.open_findings_count ?? 0}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-700 font-medium space-y-1 mb-4">
                  <p className="truncate">
                    <span className="font-bold text-slate-900">Source:</span>{' '}
                    {p.repository_path ? p.repository_path : 'No source code uploaded'}
                  </p>
                  <p className="truncate">
                    <span className="font-bold text-slate-900">Dirs:</span> {p.source_dirs}
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveProject(p)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-slate-700 cursor-default'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isActive ? 'Selected' : 'Select'}
                  </button>
                  <button
                    onClick={() => {
                      setUploadingProjectId(p.id);
                      setError(null);
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                    title="Upload Source ZIP"
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setActiveProject(p);
                      navigate('/analyze');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-white bg-slate-900 hover:bg-slate-800 transition-colors"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    <span>Scan</span>
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete Project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ZIP Upload Modal */}
      {uploadingProjectId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Upload Source Code ZIP</h3>
              <button
                onClick={() => setUploadingProjectId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Upload a project ZIP archive. Unsafe path traversals and build folders will be safely filtered. Source code is analyzed statically and never executed.
              </p>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-slate-400 transition-colors bg-slate-50/50">
                <FileArchive className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <input
                  type="file"
                  id="zip-file"
                  accept=".zip"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="zip-file"
                  className="cursor-pointer text-xs font-semibold text-slate-900 hover:text-teal-600"
                >
                  {uploadFile ? uploadFile.name : 'Click to select ZIP archive'}
                </label>
                {uploadFile && (
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>

              {uploadStatus && (
                <p className="text-xs text-teal-600 font-medium text-center">{uploadStatus}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadingProjectId(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!uploadFile || isSubmitting}
                  onClick={() => handleUploadZip(uploadingProjectId)}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors"
                >
                  {isSubmitting ? 'Uploading...' : 'Confirm Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Register New Project</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payments Gateway Microservice"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of codebase domain and purpose..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Primary Language
                  </label>
                  <select
                    value={formData.primary_language}
                    onChange={(e) =>
                      setFormData({ ...formData, primary_language: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 focus:outline-none"
                  >
                    <option value="python">Python (AST Supported)</option>
                    <option value="typescript">TypeScript (Conservative)</option>
                    <option value="javascript">JavaScript (Conservative)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Source Folders</label>
                  <input
                    type="text"
                    placeholder="app,src"
                    value={formData.source_dirs}
                    onChange={(e) => setFormData({ ...formData, source_dirs: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Excluded Directories
                </label>
                <input
                  type="text"
                  value={formData.exclude_dirs}
                  onChange={(e) => setFormData({ ...formData, exclude_dirs: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-[11px] focus:ring-1 focus:ring-slate-900 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Comma-separated list of build, virtual environment, and test folders to skip.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
