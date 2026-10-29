import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Network,
  Search,
  AlertTriangle,
  CheckCircle2,
  Table as TableIcon,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { DependencyGraphResponse } from '../types';

export const DependencyGraphPage: React.FC = () => {
  const { latestScan } = useProject();

  const [graphData, setGraphData] = useState<DependencyGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rfInstanceRef = React.useRef<any>(null);

  // View mode: interactive visual graph vs accessible table alternative
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');

  // Filters
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [violationsOnly, setViolationsOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected element inspection
  const [selectedElement, setSelectedElement] = useState<{
    type: 'node' | 'edge';
    data: any;
  } | null>(null);

  // React Flow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const loadGraph = useCallback(async () => {
    if (!latestScan) {
      setGraphData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.getScanGraph(latestScan.id);
      setGraphData(data);
    } catch (err: any) {
      console.error('Failed to load dependency graph:', err);
      setError(err.message || 'Failed to retrieve dependency graph from server.');
    } finally {
      setLoading(false);
    }
  }, [latestScan]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Transform graphData into React Flow nodes and edges with auto-layout
  useEffect(() => {
    if (!graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Filter nodes
    let filteredNodes = graphData.nodes;
    if (selectedComponent) {
      filteredNodes = filteredNodes.filter((n) => n.component === selectedComponent);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) => n.label.toLowerCase().includes(q) || (n.component && n.component.toLowerCase().includes(q))
      );
    }
    if (violationsOnly) {
      filteredNodes = filteredNodes.filter((n) => n.is_violation);
    }

    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges
    let filteredEdges = graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    if (violationsOnly) {
      filteredEdges = filteredEdges.filter((e) => e.is_violation);
    }

    // Assign positions in a layered / grid arrangement
    const components = graphData.components;
    const compXMap: Record<string, number> = {};
    components.forEach((c, idx) => {
      compXMap[c] = idx * 300;
    });

    const compYCounter: Record<string, number> = {};

    const rfNodes: Node[] = filteredNodes.map((n) => {
      const c = n.component || 'unmapped';
      const x = compXMap[c] !== undefined ? compXMap[c] : components.length * 300;
      const yCount = compYCounter[c] || 0;
      compYCounter[c] = yCount + 1;
      const y = yCount * 125 + 40;

      const isViol = n.is_violation || n.status === 'violation';
      const isUnmapped = !n.component || n.status === 'unmapped';

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div className="p-2.5 text-left">
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs uppercase font-bold text-slate-700 tracking-wide font-mono">
                  {n.component || 'Unmapped'}
                </span>
                {isViol ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    Violation
                  </span>
                ) : isUnmapped ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
                    Unmapped
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
                    Compliant
                  </span>
                )}
              </div>
              <p className="font-bold text-sm text-slate-900 truncate max-w-[210px]">{n.label}</p>
              <div className="text-xs text-slate-600 mt-1 font-medium">
                {n.classes_count} classes • {n.functions_count} fn • {n.imports_count} imports
              </div>
            </div>
          ),
          raw: n,
        },
        style: {
          background: isViol ? '#FEF2F2' : isUnmapped ? '#F8FAFC' : '#FFFFFF',
          border: isViol ? '2px solid #DC2626' : isUnmapped ? '1.5px dashed #94A3B8' : '1.5px solid #64748B',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(15,23,42,0.08)',
          width: 240,
        },
      };
    });

    const rfEdges: Edge[] = filteredEdges.map((e) => {
      const isViol = e.is_violation || e.status === 'violation';
      const isNotEval = e.status === 'not_evaluated' || (!e.source_component || !e.target_component);
      const strokeColor = isViol ? '#DC2626' : isNotEval ? '#94A3B8' : '#0D9488';

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: isViol,
        style: {
          stroke: strokeColor,
          strokeWidth: isViol ? 2.5 : 1.5,
          strokeDasharray: isViol ? '5 5' : isNotEval ? '4 4' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 16,
          height: 16,
        },
        data: { raw: e },
      };
    });

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData, selectedComponent, violationsOnly, searchQuery]);

  // Auto-fit view when nodes update or filters change
  useEffect(() => {
    if (rfInstanceRef.current && nodes.length > 0) {
      const timer = setTimeout(() => {
        rfInstanceRef.current?.fitView({ padding: 0.2, duration: 200 });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, selectedComponent, violationsOnly]);

  const handleNodeClick = (_: any, node: Node) => {
    setSelectedElement({ type: 'node', data: node.data.raw });
  };

  const handleEdgeClick = (_: any, edge: Edge) => {
    setSelectedElement({ type: 'edge', data: edge.data?.raw });
  };

  // Filtered lists for table view
  const filteredNodesList = graphData
    ? graphData.nodes.filter((n) => {
        if (selectedComponent && n.component !== selectedComponent) return false;
        if (violationsOnly && !n.is_violation) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return n.label.toLowerCase().includes(q) || (n.component && n.component.toLowerCase().includes(q));
        }
        return true;
      })
    : [];

  const filteredNodeIds = new Set(filteredNodesList.map((n) => n.id));

  const filteredEdgesList = graphData
    ? graphData.edges.filter((e) => {
        if (!filteredNodeIds.has(e.source) || !filteredNodeIds.has(e.target)) return false;
        if (violationsOnly && !e.is_violation) return false;
        return true;
      })
    : [];

  if (!latestScan) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-slate-300 rounded-xl text-center shadow-xs">
        <Network className="h-12 w-12 text-slate-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">No Scan Available</h2>
        <p className="text-base text-slate-600 mb-4">
          Run an architectural scan first to construct the dependency graph and view relationship models.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Header & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-300 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Interactive Dependency Graph</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Real module dependencies extracted from source code. Highlighted red edges indicate confirmed architectural drift violations.
          </p>
        </div>

        {/* View Mode Toggle & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Accessible View Mode Switcher */}
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100" role="tablist" aria-label="Graph View Mode">
            <button
              role="tab"
              aria-selected={viewMode === 'graph'}
              onClick={() => setViewMode('graph')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                viewMode === 'graph'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Network className="h-4 w-4" />
              <span>Visual Graph</span>
            </button>
            <button
              role="tab"
              aria-selected={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="h-4 w-4" />
              <span>Accessible Table View</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              aria-label="Filter modules by name or component"
              placeholder="Filter modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 w-44 sm:w-56"
            />
          </div>

          {/* Component Filter */}
          <select
            aria-label="Filter by architectural component"
            value={selectedComponent}
            onChange={(e) => setSelectedComponent(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-900 font-medium cursor-pointer"
          >
            <option value="">All Components</option>
            {graphData?.components.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Violations Only Toggle */}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-md cursor-pointer select-none">
            <input
              type="checkbox"
              checked={violationsOnly}
              onChange={(e) => setViolationsOnly(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
            />
            <span className="text-sm text-slate-800 font-semibold">Violations Only</span>
          </label>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'graph' ? (
        /* Visual Graph Canvas & Evidence Sidebar */
        <div className="flex flex-col lg:flex-row gap-4 h-[650px] min-h-[600px] w-full bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 h-full w-full relative min-h-[550px]" style={{ minHeight: '550px', height: '100%', width: '100%' }}>
            {/* Loading Indicator Overlay */}
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white/80 backdrop-blur-xs z-20 text-center">
                <div className="h-8 w-8 border-3 border-slate-300 border-t-slate-900 rounded-full animate-spin mb-3" />
                <p className="text-xs font-bold text-slate-800">
                  Loading graph structure and dependency edges...
                </p>
              </div>
            )}

            {/* Error Overlay with Retry */}
            {error && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white z-20 text-center">
                <AlertTriangle className="h-10 w-10 text-rose-600 mb-2" />
                <h3 className="text-sm font-bold text-slate-900">Failed to Load Dependency Graph</h3>
                <p className="text-xs text-slate-600 max-w-sm mt-1 mb-4">{error}</p>
                <button
                  onClick={loadGraph}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
                >
                  Retry Loading Graph
                </button>
              </div>
            )}

            {/* Scan exists but contains no discovered modules */}
            {!loading && !error && graphData && graphData.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white z-10 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500 mb-2" />
                <h3 className="text-base font-bold text-slate-900">No Discovered Modules</h3>
                <p className="text-xs text-slate-600 max-w-sm mt-1">
                  The scan completed, but no Python modules were discovered in the configured project source paths.
                </p>
              </div>
            )}

            {/* Filter Empty State Overlay */}
            {!loading && !error && graphData && graphData.nodes.length > 0 && nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white/95 backdrop-blur-xs z-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-teal-600 mb-2" />
                <h3 className="text-sm font-bold text-slate-900">No Matching Modules</h3>
                <p className="text-xs text-slate-600 max-w-sm mt-1">
                  {violationsOnly
                    ? 'No architectural violations detected matching the selected filters.'
                    : 'No modules found matching your current filter query.'}
                </p>
                <button
                  onClick={() => {
                    setSelectedComponent('');
                    setSearchQuery('');
                    setViolationsOnly(false);
                  }}
                  className="mt-3 px-3.5 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors shadow-xs"
                >
                  Clear Filters
                </button>
              </div>
            )}

            <ReactFlow
              key={latestScan?.id || 'graph-canvas'}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onInit={(instance) => {
                rfInstanceRef.current = instance;
                setTimeout(() => instance.fitView({ padding: 0.2 }), 50);
              }}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2.0}
              style={{ width: '100%', height: '100%', minHeight: '550px' }}
            >
              <Background color="#CBD5E1" gap={20} />
              <Controls />
            </ReactFlow>
          </div>

          {/* Inspector Sidebar */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-300 p-4 bg-slate-50 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-300">
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-800">
                  Element Inspector
                </h3>
                {selectedElement && (
                  <button
                    onClick={() => setSelectedElement(null)}
                    className="text-xs text-slate-600 hover:text-slate-900 underline font-medium"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {selectedElement ? (
                selectedElement.type === 'node' ? (
                  /* Node Inspector */
                  <div className="space-y-3.5 bg-white p-4 rounded-lg border border-slate-300 shadow-xs">
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-600 block">
                        Discovered Module
                      </span>
                      <h4 className="font-bold text-slate-900 text-base break-all mt-0.5">
                        {selectedElement.data.label}
                      </h4>
                    </div>

                    <div>
                      <span className="text-xs uppercase font-bold text-slate-600 block">
                        Component Layer
                      </span>
                      <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-semibold text-slate-800 text-sm capitalize">
                        {selectedElement.data.component || 'Unmapped'}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs uppercase font-bold text-slate-600 block">
                        File Path
                      </span>
                      <span className="font-mono text-xs text-slate-700 break-all block mt-0.5">
                        {selectedElement.data.file_path}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex justify-between text-xs text-slate-700 font-medium">
                      <span>Classes: {selectedElement.data.classes_count}</span>
                      <span>Functions: {selectedElement.data.functions_count}</span>
                      <span>Imports: {selectedElement.data.imports_count}</span>
                    </div>

                    {selectedElement.data.is_violation || selectedElement.data.status === 'violation' ? (
                      <div className="p-3 bg-red-50 border border-red-300 rounded text-red-900 text-xs space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-red-700">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Drift Violation</span>
                        </div>
                        {selectedElement.data.violation_rule_id && (
                          <p className="font-mono text-xs text-red-800 font-semibold">
                            Rule: {selectedElement.data.violation_rule_id}
                          </p>
                        )}
                        <p className="text-slate-700 mt-1">{selectedElement.data.status_reason || 'Involved in architectural drift violation.'}</p>
                      </div>
                    ) : !selectedElement.data.component || selectedElement.data.status === 'unmapped' ? (
                      <div className="p-2.5 bg-slate-100 border border-slate-300 rounded text-slate-800 text-xs font-medium space-y-1">
                        <span className="font-bold text-slate-900">Unmapped Module (Needs Mapping)</span>
                        <p className="text-slate-600">{selectedElement.data.status_reason || 'Module does not match configured component patterns in architecture policy.'}</p>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-teal-50 border border-teal-300 rounded text-teal-900 text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />
                        <span>{selectedElement.data.status_reason || `Compliant module mapped to '${selectedElement.data.component}'`}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Edge Inspector */
                  <div className="space-y-3.5 bg-white p-4 rounded-lg border border-slate-300 shadow-xs">
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-600 block">
                        Dependency Edge
                      </span>
                      <div className="font-semibold text-slate-900 text-sm mt-1 bg-slate-50 p-2.5 rounded border border-slate-200">
                        <p className="text-slate-700 truncate">{selectedElement.data.source}</p>
                        <p className="text-slate-500 font-bold text-center my-1 text-xs">↓ depends on</p>
                        <p className="text-slate-900 font-bold truncate">{selectedElement.data.target}</p>
                      </div>
                    </div>

                    {selectedElement.data.import_statement && (
                      <div>
                        <span className="text-xs uppercase font-bold text-slate-600 block">
                          Source Import Statement
                        </span>
                        <pre className="p-2.5 bg-slate-900 text-teal-300 rounded text-xs font-mono overflow-x-auto mt-1 border border-slate-800">
                          {selectedElement.data.import_statement}
                        </pre>
                        {selectedElement.data.import_line && (
                          <p className="text-xs text-slate-600 font-medium mt-1">
                            Line {selectedElement.data.import_line}
                          </p>
                        )}
                      </div>
                    )}

                    {selectedElement.data.is_violation || selectedElement.data.status === 'violation' ? (
                      <div className="p-3 bg-red-50 border border-red-300 rounded text-red-900 text-xs space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-red-700">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Forbidden Architectural Drift Violation</span>
                        </div>
                        {selectedElement.data.violation_rule_id && (
                          <p className="font-mono text-xs text-red-800 font-semibold">
                            Rule ID: {selectedElement.data.violation_rule_id}
                          </p>
                        )}
                        <p className="text-slate-700 mt-1">{selectedElement.data.status_reason || 'Prohibited by architecture policy.'}</p>
                      </div>
                    ) : selectedElement.data.status === 'not_evaluated' || (!selectedElement.data.source_component || !selectedElement.data.target_component) ? (
                      <div className="p-2.5 bg-slate-100 border border-slate-300 rounded text-slate-800 text-xs space-y-1">
                        <span className="font-bold text-slate-900">Not Evaluated</span>
                        <p className="text-slate-600">{selectedElement.data.status_reason || 'Source or target module is unmapped; boundary rule not evaluated.'}</p>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-teal-50 border border-teal-300 rounded text-teal-900 text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />
                        <span>{selectedElement.data.status_reason || 'Permitted architectural relationship'}</span>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <p className="text-sm text-slate-600 italic">
                  Select any node or dependency edge in the canvas to inspect code evidence and rules.
                </p>
              )}
            </div>

            <div className="text-xs text-slate-600 font-medium pt-3 border-t border-slate-300 mt-4">
              {graphData
                ? `${graphData.total_modules} modules (${graphData.unmapped_modules ?? 0} unmapped), ${graphData.total_dependencies} dependencies, ${graphData.total_violations} violations`
                : ''}
            </div>
          </div>
        </div>
      ) : (
        /* Accessible Table Alternative View (WCAG 2.2 AA) */
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-800">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Accessible Dependency Data Tables</h2>
                <p className="text-sm text-slate-600">
                  Full tabular alternative presenting all AST discovered modules, component boundaries, and import relationships.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-800">
              <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-300 flex flex-col">
                <span className="text-slate-500 font-normal">Modules ({filteredNodesList.length})</span>
                <span>
                  {filteredNodesList.filter((n) => n.component).length} Mapped • {filteredNodesList.filter((n) => !n.component).length} Unmapped
                </span>
              </div>
              <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-300 flex flex-col">
                <span className="text-slate-500 font-normal">Dependencies ({filteredEdgesList.length})</span>
                <span>
                  {filteredEdgesList.filter((e) => e.status === 'approved' || (!e.is_violation && e.status !== 'not_evaluated' && e.source_component && e.target_component)).length} Approved • {filteredEdgesList.filter((e) => e.status === 'not_evaluated' || (!e.is_violation && (!e.source_component || !e.target_component))).length} Not Evaluated
                </span>
              </div>
              <div className={`px-3 py-1.5 rounded-lg border flex flex-col ${
                filteredEdgesList.some((e) => e.is_violation || e.status === 'violation') || filteredNodesList.some((n) => n.is_violation || n.status === 'violation')
                  ? 'bg-red-50 text-red-900 border-red-300'
                  : 'bg-green-50 text-green-900 border-green-300'
              }`}>
                <span className="font-normal opacity-80">Violations</span>
                <span className="font-bold">
                  {filteredEdgesList.filter((e) => e.is_violation || e.status === 'violation').length + filteredNodesList.filter((n) => n.is_violation || n.status === 'violation').length} Confirmed
                </span>
              </div>
            </div>
          </div>

          {/* Table 1: Modules */}
          <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                1. Discovered Source Code Modules ({filteredNodesList.length})
              </h3>
              <span className="text-xs text-slate-600 font-medium">Screen reader accessible</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900">
                <caption className="sr-only">List of discovered source code modules and their architectural layer mapping</caption>
                <thead className="bg-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-300">
                  <tr>
                    <th scope="col" className="px-4 py-3">Module Identifier</th>
                    <th scope="col" className="px-4 py-3">Architecture Component</th>
                    <th scope="col" className="px-4 py-3">File Path</th>
                    <th scope="col" className="px-4 py-3 text-center">Classes</th>
                    <th scope="col" className="px-4 py-3 text-center">Functions</th>
                    <th scope="col" className="px-4 py-3 text-center">Imports</th>
                    <th scope="col" className="px-4 py-3 text-right">Drift Status & Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredNodesList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-600 italic">
                        No modules match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredNodesList.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 font-mono text-sm">
                          {m.label}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800 capitalize">
                            {m.component || 'Unmapped'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">
                          {m.file_path}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-slate-800">{m.classes_count}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-800">{m.functions_count}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-800">{m.imports_count}</td>
                        <td className="px-4 py-3 text-right">
                          {m.is_violation || m.status === 'violation' ? (
                            <div className="inline-block text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Violation
                              </span>
                              {m.violation_rule_id && (
                                <p className="text-xs font-mono text-red-800 font-semibold mt-0.5">
                                  Rule: {m.violation_rule_id}
                                </p>
                              )}
                              {m.status_reason && (
                                <p className="text-xs text-red-700 max-w-xs mt-0.5 truncate" title={m.status_reason}>
                                  {m.status_reason}
                                </p>
                              )}
                            </div>
                          ) : !m.component || m.status === 'unmapped' ? (
                            <div className="inline-block text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                                Unmapped
                              </span>
                              <p className="text-xs text-slate-500 max-w-xs mt-0.5 truncate" title={m.status_reason || 'Needs mapping to architecture component'}>
                                {m.status_reason || 'Needs mapping'}
                              </p>
                            </div>
                          ) : (
                            <div className="inline-block text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Compliant
                              </span>
                              <p className="text-xs text-green-700 max-w-xs mt-0.5 truncate" title={m.status_reason || `Mapped to ${m.component}`}>
                                {m.status_reason || `Mapped to ${m.component}`}
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Dependency Edges */}
          <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                2. Module Dependency Relationships & Violations ({filteredEdgesList.length})
              </h3>
              <span className="text-xs text-slate-600 font-medium">Directional import links</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900">
                <caption className="sr-only">List of module dependencies and architectural violation status</caption>
                <thead className="bg-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-300">
                  <tr>
                    <th scope="col" className="px-4 py-3">Source Module (Caller)</th>
                    <th scope="col" className="px-4 py-3">Direction</th>
                    <th scope="col" className="px-4 py-3">Target Module (Callee)</th>
                    <th scope="col" className="px-4 py-3">Architecture Mapping</th>
                    <th scope="col" className="px-4 py-3">Import Statement & Line</th>
                    <th scope="col" className="px-4 py-3 text-right">Relationship Status & Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredEdgesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-600 italic">
                        No dependency edges match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEdgesList.map((e) => (
                      <tr key={e.id} className={e.is_violation ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50'}>
                        <td className="px-4 py-3 font-semibold text-slate-900 font-mono text-sm">
                          {e.source}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-center font-bold">
                          <ArrowRight className="h-4 w-4 inline" />
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 font-mono text-sm">
                          {e.target}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">{e.source_component || 'Unmapped'}</span>
                          <span className="mx-1 text-slate-400">→</span>
                          <span className="font-semibold text-slate-900">{e.target_component || 'Unmapped'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {e.import_statement ? (
                            <div className="font-mono text-xs bg-slate-900 text-teal-300 px-2 py-1 rounded inline-block">
                              {e.import_statement}
                              {e.import_line && (
                                <span className="text-slate-400 ml-1.5">(Line {e.import_line})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-xs">Direct reference</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {e.is_violation || e.status === 'violation' ? (
                            <div className="inline-block text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-900 border border-red-300">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-700" />
                                Drift Violation
                              </span>
                              {e.violation_rule_id && (
                                <p className="text-xs font-mono text-rose-900 font-bold mt-0.5">
                                  Rule: {e.violation_rule_id}
                                </p>
                              )}
                              {e.status_reason && (
                                <p className="text-xs text-red-700 max-w-xs mt-0.5 truncate" title={e.status_reason}>
                                  {e.status_reason}
                                </p>
                              )}
                            </div>
                          ) : e.status === 'not_evaluated' || (!e.source_component || !e.target_component) ? (
                            <div className="inline-block text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                                Not Evaluated
                              </span>
                              <p className="text-xs text-slate-500 max-w-xs mt-0.5 truncate" title={e.status_reason || 'Unmapped component boundary'}>
                                {e.status_reason || 'Unmapped boundary'}
                              </p>
                            </div>
                          ) : (
                            <div className="inline-block text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approved
                              </span>
                              <p className="text-xs text-green-700 max-w-xs mt-0.5 truncate" title={e.status_reason || 'Permitted by architecture policy'}>
                                {e.status_reason || 'Permitted'}
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
