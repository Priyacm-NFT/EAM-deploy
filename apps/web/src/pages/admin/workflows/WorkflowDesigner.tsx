import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import { MessageBanner } from '../../../components/identity/IdentityLayout.js';

type NodeType = 'START' | 'END' | 'TASK' | 'APPROVAL' | 'DECISION' | 'NOTIFICATION' | 'INTEGRATION' | 'PARALLEL_SPLIT' | 'SYNCHRONISE';

interface WFNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  config: Record<string, string>;
}

interface WFEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

interface Workflow {
  id: string;
  name: string;
  entityType: string;
  triggerCondition: string;
  currentVersion: number;
  isActive: boolean;
  definition?: { nodes: WFNode[]; edges: WFEdge[] };
}

interface SimResult {
  simulationId?: string;
  trace?: { nodeId: string; type: string; label: string; status: string }[];
  path?: string[];
  result?: string;
  decisions?: Record<string, string>;
}

function midpoint(a: WFNode, b: WFNode) {
  return { x: (a.x + b.x) / 2 + 55, y: (a.y + b.y) / 2 + 20 };
}

const NODE_COLORS: Record<NodeType, string> = {
  START: 'bg-green-500 text-white border-green-600',
  END: 'bg-slate-700 text-white border-slate-800',
  TASK: 'bg-blue-500 text-white border-blue-600',
  APPROVAL: 'bg-orange-500 text-white border-orange-600',
  DECISION: 'bg-purple-500 text-white border-purple-600',
  NOTIFICATION: 'bg-teal-500 text-white border-teal-600',
  PARALLEL_SPLIT: 'bg-cyan-600 text-white border-cyan-700',
  SYNCHRONISE: 'bg-teal-600 text-white border-teal-700',
  INTEGRATION: 'bg-pink-500 text-white border-pink-600',
};

const NODE_PALETTE: { type: NodeType; label: string; desc: string }[] = [
  { type: 'START', label: 'Start', desc: 'Entry point' },
  { type: 'TASK', label: 'Task', desc: 'Manual assignment' },
  { type: 'APPROVAL', label: 'Approval', desc: 'Approve / reject' },
  { type: 'DECISION', label: 'Decision', desc: 'SQL condition branch' },
  { type: 'NOTIFICATION', label: 'Notify', desc: 'Email / in-app alert' },
  { type: 'PARALLEL_SPLIT', label: 'Parallel Split', desc: 'Fork into concurrent branches' },
  { type: 'SYNCHRONISE', label: 'Synchronise', desc: 'Wait for all branches' },
  { type: 'INTEGRATION', label: 'Integration', desc: 'External REST call' },
  { type: 'END', label: 'End', desc: 'Terminal node' },
];

const CANVAS_W = 900;
const CANVAS_H = 580;
const NODE_W = 110;
const NODE_H = 44;

export function WorkflowDesignerPage() {
  const { id } = useParams<{ id: string }>();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<WFNode[]>([]);
  const [edges, setEdges] = useState<WFEdge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [simMode, setSimMode] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [activeTab, setActiveTab] = useState<'canvas' | 'history'>('canvas');
  const [versions, setVersions] = useState<{ version: number; publishedAt: string; publishedBy: string }[]>([]);
  const [instances, setInstances] = useState<{
    id: string; entityType: string; entityId: string;
    status: string; currentNodeId: string | null;
    startedAt: string; completedAt: string | null;
  }[]>([]);
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null);
  const [nodeTrace, setNodeTrace] = useState<Record<string, unknown[]>>({});
  const [pageLoading, setPageLoading] = useState(true);

  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    api<Workflow>(`/admin/workflows/${id}`)
      .then((w) => {
        setWorkflow(w);
        if (w.definition) {
          setNodes(w.definition.nodes ?? []);
          setEdges(w.definition.edges ?? []);
        }
      })
      .catch(() => setError('Workflow not found'))
      .finally(() => setPageLoading(false));

    api<{ action: string; version?: number; createdAt?: string; userId?: string }[]>(`/admin/workflows/${id}/history`)
      .then((history) => {
        const vList = Array.isArray(history)
          ? history
              .filter((h) => h.action === 'PUBLISHED')
              .map((h) => ({
                version: Number(h.version ?? 1),
                publishedAt: String(h.createdAt ?? ''),
                publishedBy: String(h.userId ?? ''),
              }))
          : [];
        setVersions(vList);
      })
      .catch(() => {});

    api<typeof instances>(`/admin/workflows/${id}/instances`)
      .then((rows) => setInstances(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [id]);

  const selectedNode = nodes.find((n) => n.id === selected);

  // ── FIX: if the selected node id no longer exists in `nodes` (e.g. it was
  // deleted, or stale state survived a re-render), clear the selection
  // instead of letting the Properties panel try to read fields off
  // `undefined`. This was the root cause of the blank-page crash when
  // clicking nodes — `selectedNode.config.assigneeType` etc. would throw
  // "Cannot read properties of undefined" once `selected` pointed at a
  // node id that wasn't in the current `nodes` array.
  useEffect(() => {
    if (selected && !nodes.some((n) => n.id === selected)) {
      setSelected(null);
      setConnecting(null);
    }
  }, [selected, nodes]);

  function addNode(type: NodeType) {
    const newNode: WFNode = {
      id: `node_${Date.now()}`,
      type,
      label: type.charAt(0) + type.slice(1).toLowerCase(),
      x: 60 + Math.floor(Math.random() * 400),
      y: 60 + Math.floor(Math.random() * 300),
      config: {},
    };
    setNodes((n) => [...n, newNode]);
  }

  function deleteNode(nodeId: string) {
    setNodes((n) => n.filter((nd) => nd.id !== nodeId));
    setEdges((e) => e.filter((ed) => ed.fromId !== nodeId && ed.toId !== nodeId));
    if (selected === nodeId) setSelected(null);
  }

  function handleCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    if (e.target === canvasRef.current) {
      setSelected(null);
      setConnecting(null);
    }
  }

  function handleNodeClick(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    // FIX: guard against clicking a node id that isn't in the current
    // `nodes` array (can happen if state updates land out of order during
    // a fast double-click / drag-then-click sequence).
    const targetExists = nodes.some((n) => n.id === nodeId);
    if (!targetExists) {
      setSelected(null);
      setConnecting(null);
      return;
    }

    if (connecting && connecting !== nodeId) {
      const exists = edges.some((ed) => ed.fromId === connecting && ed.toId === nodeId);
      if (!exists) {
        setEdges((eds) => [
          ...eds,
          { id: `edge_${Date.now()}`, fromId: connecting, toId: nodeId },
        ]);
      }
      setConnecting(null);
    } else {
      setSelected(nodeId);
    }
  }

  function startDrag(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y };

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === dragRef.current!.nodeId
            ? { ...n, x: Math.max(0, Math.min(CANVAS_W - NODE_W, dragRef.current!.origX + dx)), y: Math.max(0, Math.min(CANVAS_H - NODE_H, dragRef.current!.origY + dy)) }
            : n,
        ),
      );
    }

    function onMouseUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function updateNodeProp(nodeId: string, field: string, value: string) {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? field === 'label'
            ? { ...n, label: value }
            : { ...n, config: { ...n.config, [field]: value } }
          : n,
      ),
    );
  }

  async function save(publish = false) {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      await api(`/admin/workflows/${id}/designer`, {
        method: 'PUT',
        body: JSON.stringify({ definition: { nodes, edges } }),
      });
      if (publish) {
        await api(`/admin/workflows/${id}/publish`, { method: 'POST' });
        setMsg('Workflow published as a new version.');
        api<Workflow>(`/admin/workflows/${id}`).then((w) => setWorkflow(w)).catch(() => {});
      } else {
        setMsg('Draft saved.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    setError('');
    setSimResult(null);
    setSimMode(false);
    try {
      const result = await api<SimResult>(`/admin/workflows/${id}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ nodes, edges }),
      });
      setSimResult(result);
      setSimMode(true);
    } catch {
      // Fallback: build a local trace from the nodes
      const trace = nodes.map((n) => ({ nodeId: n.id, type: n.type, label: n.label, status: 'SIMULATED' }));
      setSimResult({ trace, result: 'SIMULATED (local)' });
      setSimMode(true);
    }
  }

  if (pageLoading) {
    return (
      <div className="admin-page flex items-center justify-center h-64 text-slate-400">
        <p>Loading workflow…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/admin/workflows" className="btn-link inline-block mb-1">
            ← Back to workflows
          </Link>
          <h1 className="page-title">{workflow?.name ?? 'Workflow designer'}</h1>
          <p className="page-subtitle">
            {workflow
              ? `Entity: ${workflow.entityType} · Trigger: ${workflow.triggerCondition || 'none'} · v${workflow.currentVersion}`
              : 'Loading…'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 pt-1">
          <button type="button" className="btn-outline" onClick={() => { setSimMode(false); simulate(); }}>
            Simulate
          </button>
          <button type="button" className="btn-primary !w-auto px-4" disabled={saving} onClick={() => save(false)}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" className="btn-primary !w-auto px-4" disabled={saving} onClick={() => save(true)}>
            Publish
          </button>
        </div>
      </div>

      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {simMode && simResult && (
        <div className="content-card border border-purple-200 bg-purple-50 text-purple-900 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Simulation result: <span className={simResult.result === 'COMPLETED' ? 'text-green-700' : 'text-amber-700'}>{simResult.result ?? 'SIMULATED'}</span></p>
            <button type="button" className="btn-link text-purple-700 text-xs" onClick={() => { setSimMode(false); setSimResult(null); }}>
              ✕ Close
            </button>
          </div>
          {simResult.trace && simResult.trace.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {simResult.trace.map((step, i) => (
                <div key={step.nodeId} className="flex items-center gap-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    step.status === 'SIMULATED' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                    step.type === 'END' ? 'bg-slate-700 text-white' :
                    step.type === 'START' ? 'bg-green-500 text-white' :
                    'bg-white border border-purple-200 text-purple-700'
                  }`}>
                    {step.label}
                  </span>
                  {i < simResult.trace!.length - 1 && <span className="text-purple-400 text-xs">→</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 mb-4">
        {(['canvas', 'history'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'canvas' ? 'Designer canvas' : 'Version history'}
          </button>
        ))}
      </div>

      {activeTab === 'canvas' && (
        <div className="flex gap-4">
          {/* Node Palette */}
          <div className="w-40 shrink-0 content-card space-y-2 self-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5">
              Node palette
            </p>
            {NODE_PALETTE.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => addNode(item.type)}
                className="w-full text-left px-2 py-2 rounded-md border border-slate-200 hover:border-accent hover:bg-accent/5 transition-colors text-sm"
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${NODE_COLORS[item.type].split(' ')[0]}`} />
                <span className="font-medium text-primary">{item.label}</span>
                <span className="block text-xs text-slate-400 pl-4">{item.desc}</span>
              </button>
            ))}
            <p className="text-xs text-slate-400 pt-2">
              Click to add. Drag nodes to position. Click a node then click another to connect.
            </p>
          </div>

          {/* Canvas */}
          <div className="flex-1 content-card p-0 overflow-hidden">
            <svg
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="w-full"
              style={{ background: '#f8fafc', cursor: connecting ? 'crosshair' : 'default' }}
              onClick={handleCanvasClick}
            >
              <defs>
                <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                </pattern>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
                </marker>
              </defs>
              <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid)" />

              {/* Edges */}
              {edges.map((edge) => {
                const fromNode = nodes.find((n) => n.id === edge.fromId);
                const toNode = nodes.find((n) => n.id === edge.toId);
                if (!fromNode || !toNode) return null;
                const x1 = fromNode.x + NODE_W;
                const y1 = fromNode.y + NODE_H / 2;
                const x2 = toNode.x;
                const y2 = toNode.y + NODE_H / 2;
                const mp = midpoint(fromNode, toNode);
                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="2"
                      markerEnd="url(#arrow)"
                    />
                    {edge.label && (
                      <text x={mp.x} y={mp.y} textAnchor="middle" fontSize="10" fill="#64748b">
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const isSelected = selected === node.id;
                const isConnecting = connecting === node.id;
                const inSimPath = simMode && simResult?.trace?.some((t) => t.nodeId === node.id);
                const colorClass = NODE_COLORS[node.type];
                const [bg] = colorClass.split(' ');
                const bgHex =
                  bg === 'bg-green-500' ? '#22c55e' :
                  bg === 'bg-slate-700' ? '#334155' :
                  bg === 'bg-blue-500' ? '#3b82f6' :
                  bg === 'bg-orange-500' ? '#f97316' :
                  bg === 'bg-purple-500' ? '#a855f7' :
                  bg === 'bg-teal-500' ? '#14b8a6' :
                  bg === 'bg-cyan-600' ? '#0891b2' :
                  bg === 'bg-teal-600' ? '#0d9488' : '#ec4899';
                return (
                  <g
                    key={node.id}
                    style={{ cursor: 'move', userSelect: 'none' }}
                    onMouseDown={(e) => startDrag(e, node.id)}
                    onClick={(e) => handleNodeClick(e, node.id)}
                  >
                    <rect
                      x={node.x}
                      y={node.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={node.type === 'DECISION' ? 0 : 8}
                      ry={node.type === 'DECISION' ? 0 : 8}
                      fill={bgHex}
                      stroke={isSelected ? '#f97316' : isConnecting ? '#a855f7' : inSimPath ? '#fbbf24' : bgHex}
                      strokeWidth={isSelected || isConnecting || inSimPath ? 3 : 0}
                      opacity={0.92}
                      transform={node.type === 'DECISION' ? `rotate(45, ${node.x + NODE_W / 2}, ${node.y + NODE_H / 2})` : undefined}
                    />
                    <text
                      x={node.x + NODE_W / 2}
                      y={node.y + NODE_H / 2 + 5}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="white"
                      style={{ pointerEvents: 'none' }}
                    >
                      {node.label}
                    </text>
                    {/* Connect handle */}
                    <circle
                      cx={node.x + NODE_W}
                      cy={node.y + NODE_H / 2}
                      r={5}
                      fill="white"
                      stroke={bgHex}
                      strokeWidth="2"
                      style={{ cursor: 'crosshair' }}
                      onClick={(e) => { e.stopPropagation(); setConnecting(connecting === node.id ? null : node.id); setSelected(node.id); }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Properties Panel */}
          <div className="w-56 shrink-0 content-card space-y-3 self-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5">
              Properties
            </p>
            {!selectedNode ? (
              <p className="text-xs text-slate-400">Select a node to edit its properties.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="form-label text-xs">Label</label>
                  <input
                    className="form-input text-xs py-1"
                    value={selectedNode.label}
                    onChange={(e) => updateNodeProp(selectedNode.id, 'label', e.target.value)}
                  />
                </div>

                {selectedNode.type === 'TASK' && (
                  <>
                    <div>
                      <label className="form-label text-xs">Assign to</label>
                      <select
                        className="form-select text-xs py-1"
                        value={selectedNode.config.assigneeType ?? 'role'}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'assigneeType', e.target.value)}
                      >
                        <option value="role">EAM Role</option>
                        <option value="user">Named user</option>
                        <option value="group">AD/LDAP group</option>
                        <option value="supervisor">Requester's supervisor</option>
                        <option value="asset_owner">Asset owner</option>
                        <option value="sql">SQL expression</option>
                      </select>
                      <input
                        className="form-input text-xs py-1 mt-1"
                        placeholder={
                          selectedNode.config.assigneeType === 'supervisor'
                            ? 'auto — resolves at runtime'
                            : selectedNode.config.assigneeType === 'sql'
                            ? 'e.g. SELECT supervisor FROM persons...'
                            : 'Role / user / group name'
                        }
                        value={selectedNode.config.assignTo ?? ''}
                        disabled={selectedNode.config.assigneeType === 'supervisor'}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'assignTo', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label text-xs">SLA (hours)</label>
                      <input
                        type="number"
                        className="form-input text-xs py-1"
                        value={selectedNode.config.slaHours ?? ''}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'slaHours', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label text-xs">Escalation role</label>
                      <input
                        className="form-input text-xs py-1"
                        value={selectedNode.config.escalationRole ?? ''}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'escalationRole', e.target.value)}
                      />
                    </div>
                  </>
                )}

                {selectedNode.type === 'APPROVAL' && (
                  <>
                    <div>
                      <label className="form-label text-xs">Approver</label>
                      <input
                        className="form-input text-xs py-1"
                        placeholder="Role or user"
                        value={selectedNode.config.approver ?? ''}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'approver', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label text-xs">Auto-approve after (hrs)</label>
                      <input
                        type="number"
                        className="form-input text-xs py-1"
                        value={selectedNode.config.autoApproveHrs ?? ''}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'autoApproveHrs', e.target.value)}
                      />
                    </div>
                  </>
                )}

                {selectedNode.type === 'DECISION' && (
                  <div>
                    <label className="form-label text-xs">SQL condition</label>
                    <textarea
                      className="form-input text-xs py-1 font-mono"
                      rows={3}
                      placeholder=":totalcost > 500000"
                      value={selectedNode.config.condition ?? ''}
                      onChange={(e) => updateNodeProp(selectedNode.id, 'condition', e.target.value)}
                    />
                  </div>
                )}

                {selectedNode.type === 'NOTIFICATION' && (
                  <>
                    <div>
                      <label className="form-label text-xs">Template</label>
                      <input
                        className="form-input text-xs py-1"
                        placeholder="Template name"
                        value={selectedNode.config.template ?? ''}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'template', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label text-xs">Channel</label>
                      <select
                        className="form-select text-xs py-1"
                        value={selectedNode.config.channel ?? 'email'}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'channel', e.target.value)}
                      >
                        <option value="email">Email</option>
                        <option value="in_app">In-app</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </>
                )}

                {selectedNode.type === 'INTEGRATION' && (
                  <>
                    <div>
                      <label className="form-label text-xs">Connection</label>
                      <input
                        className="form-input text-xs py-1"
                        placeholder="Connection name"
                        value={selectedNode.config.connection ?? ''}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'connection', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label text-xs">Endpoint / payload</label>
                      <textarea
                        className="form-input text-xs py-1 font-mono"
                        rows={2}
                        value={selectedNode.config.payload ?? ''}
                        onChange={(e) => updateNodeProp(selectedNode.id, 'payload', e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-accent"
                    onClick={() => setConnecting(connecting === selectedNode.id ? null : selectedNode.id)}
                  >
                    {connecting === selectedNode.id ? '✕ Cancel connect' : '→ Connect to…'}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-600 ml-auto"
                    onClick={() => deleteNode(selectedNode.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Published versions summary */}
          <div className="content-card">
            <h2 className="admin-section-title mb-1">Published versions</h2>
            <p className="text-xs text-slate-400 mb-3">Published workflows are immutable. In-flight records complete on their started version.</p>
            {versions.length === 0 ? (
              <p className="text-sm text-slate-400">No published versions yet. Click &quot;Publish&quot; to create the first one.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Version</th>
                    <th className="py-2 pr-4">Published at</th>
                    <th className="py-2 pr-4">Published by</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.version} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono font-bold">v{v.version}</td>
                      <td className="py-2 pr-4 text-slate-500">{v.publishedAt}</td>
                      <td className="py-2 pr-4 text-slate-500">{v.publishedBy}</td>
                      <td className="py-2">
                        <span className="text-xs text-green-600 font-medium">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Instance run history */}
          <div className="content-card">
            <h2 className="admin-section-title mb-3">Instance run history</h2>
            {instances.length === 0 ? (
              <p className="text-sm text-slate-400">
                No instances yet. Trigger a workflow by changing a {workflow?.entityType ?? 'record'} status to <code className="text-xs bg-slate-100 px-1 rounded">{workflow?.triggerCondition ?? 'trigger condition'}</code>.
              </p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Instance ID</th>
                    <th className="py-2 pr-4">Entity</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Current node</th>
                    <th className="py-2 pr-4">Started</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((inst) => (
                    // FIX: React.Fragment with an explicit key — the original
                    // shorthand `<>...</>` cannot carry a `key` prop, which is
                    // invalid when returned from .map(). Using the full
                    // `React.Fragment` form here is required wherever a
                    // fragment needs a key.
                    <Fragment key={inst.id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 pr-4 font-mono text-xs text-slate-500">{inst.id.slice(0, 8)}…</td>
                        <td className="py-2 pr-4 text-xs">{inst.entityType}<br /><span className="text-slate-400">{inst.entityId.slice(0, 8)}…</span></td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            inst.status === 'RUNNING' ? 'bg-blue-100 text-blue-700' :
                            inst.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            inst.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{inst.status}</span>
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-500">{inst.currentNodeId ?? '—'}</td>
                        <td className="py-2 pr-4 text-xs text-slate-500">
                          {inst.startedAt ? new Date(inst.startedAt).toLocaleString() : '—'}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="btn-link text-xs"
                            onClick={() => {
                              if (expandedInstance === inst.id) {
                                setExpandedInstance(null);
                              } else {
                                setExpandedInstance(inst.id);
                                if (!nodeTrace[inst.id]) {
                                  api<unknown[]>(`/admin/workflows/${id}/instances/${inst.id}/nodes`)
                                    .then((trace) => setNodeTrace((prev) => ({ ...prev, [inst.id]: trace })))
                                    .catch(() => {});
                                }
                              }
                            }}
                          >
                            {expandedInstance === inst.id ? 'Hide trace' : 'Show trace'}
                          </button>
                        </td>
                      </tr>
                      {expandedInstance === inst.id && (
                        <tr>
                          <td colSpan={6} className="py-3 px-4 bg-slate-50">
                            {!nodeTrace[inst.id] ? (
                              <p className="text-xs text-slate-400">Loading trace…</p>
                            ) : (nodeTrace[inst.id] as Record<string, unknown>[]).length === 0 ? (
                              <p className="text-xs text-slate-400">No node history yet.</p>
                            ) : (
                              <div className="flex gap-2 flex-wrap">
                                {(nodeTrace[inst.id] as Record<string, unknown>[]).map((h, i) => (
                                  <div key={String(h.id ?? i)} className="bg-white border border-slate-200 rounded px-3 py-1.5 text-xs">
                                    <span className="font-medium">{String(h.action ?? h.nodeId ?? 'Node')}</span>
                                    {h.comment != null && h.comment !== '' ? (
                                      <span className="ml-2 text-slate-400">— {String(h.comment)}</span>
                                    ) : null}
                                    <br />
                                    <span className="text-slate-400">{h.createdAt ? new Date(String(h.createdAt)).toLocaleTimeString() : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
