import { useEffect, useRef, useState } from 'react';
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
  path: string[];
  decisions: Record<string, string>;
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
const NODE_H = 46;

function midpoint(a: WFNode, b: WFNode) {
  const ax = a.x + NODE_W / 2;
  const ay = a.y + NODE_H / 2;
  const bx = b.x + NODE_W / 2;
  const by = b.y + NODE_H / 2;
  return { ax, ay, bx, by };
}

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
      .catch(() => {});

    api<typeof versions>(`/admin/workflows/${id}/versions`)
      .then(setVersions)
      .catch(() => {});
  }, [id]);

  const selectedNode = nodes.find((n) => n.id === selected);

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

  function deleteEdge(edgeId: string) {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  }

  async function save(publish = false) {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      await api(`/admin/workflows/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ definition: { nodes, edges }, publish }),
      });
      setMsg(publish ? 'Workflow published as a new version.' : 'Draft saved.');
      if (publish) {
        api<Workflow>(`/admin/workflows/${id}`).then((w) => setWorkflow(w));
        api<typeof versions>(`/admin/workflows/${id}/versions`).then(setVersions).catch(() => {});
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
    try {
      const result = await api<SimResult>(`/admin/workflows/${id}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ nodes, edges }),
      });
      setSimResult(result);
      setSimMode(true);
    } catch {
      setSimResult({ path: nodes.map((n) => n.id), decisions: {} });
      setSimMode(true);
    }
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
            {workflow ? `Entity: ${workflow.entityType} · Trigger: ${workflow.triggerCondition || 'none'} · v${workflow.currentVersion}` : 'Loading…'}
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
        <div className="content-card border border-purple-200 bg-purple-50 text-purple-900 text-sm space-y-1">
          <p className="font-semibold">Simulation result</p>
          <p>Path: {simResult.path.map((nid) => nodes.find((n) => n.id === nid)?.label ?? nid).join(' → ')}</p>
          <button type="button" className="btn-link text-purple-700" onClick={() => setSimMode(false)}>
            Close simulation
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-white/10 pb-0.5">
        {(['canvas', 'history'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium px-4 py-2 rounded-t-md transition-colors ${activeTab === tab ? 'bg-white text-primary' : 'text-white/70 hover:text-white'}`}
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
              {/* Grid */}
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
                const from = nodes.find((n) => n.id === edge.fromId);
                const to = nodes.find((n) => n.id === edge.toId);
                if (!from || !to) return null;
                const { ax, ay, bx, by } = midpoint(from, to);
                const mx = (ax + bx) / 2;
                const my = (ay + by) / 2;
                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${ax} ${ay} C ${ax} ${my}, ${bx} ${my}, ${bx} ${by}`}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="2"
                      markerEnd="url(#arrow)"
                    />
                    {edge.label && (
                      <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fill="#64748b">
                        {edge.label}
                      </text>
                    )}
                    <circle
                      cx={mx}
                      cy={my}
                      r={6}
                      fill="white"
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                    />
                    <text x={mx} y={my + 4} textAnchor="middle" fontSize="9" fill="#94a3b8" style={{ pointerEvents: 'none' }}>✕</text>
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const isSelected = selected === node.id;
                const isConnecting = connecting === node.id;
                const inSimPath = simMode && simResult?.path.includes(node.id);
                const colorClass = NODE_COLORS[node.type];
                const [bg] = colorClass.split(' ');
                const bgHex = bg === 'bg-green-500' ? '#22c55e' : bg === 'bg-slate-700' ? '#334155' : bg === 'bg-blue-500' ? '#3b82f6' : bg === 'bg-orange-500' ? '#f97316' : bg === 'bg-purple-500' ? '#a855f7' : bg === 'bg-teal-500' ? '#14b8a6' : '#ec4899';
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
                      <input className="form-input text-xs py-1" placeholder="Role / user / SQL" value={selectedNode.config.assignTo ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'assignTo', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label text-xs">SLA (hours)</label>
                      <input type="number" className="form-input text-xs py-1" value={selectedNode.config.slaHours ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'slaHours', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Escalation role</label>
                      <input className="form-input text-xs py-1" value={selectedNode.config.escalationRole ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'escalationRole', e.target.value)} />
                    </div>
                  </>
                )}
                {selectedNode.type === 'APPROVAL' && (
                  <>
                    <div>
                      <label className="form-label text-xs">Approver</label>
                      <input className="form-input text-xs py-1" placeholder="Role or user" value={selectedNode.config.approver ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'approver', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Auto-approve after (hrs)</label>
                      <input type="number" className="form-input text-xs py-1" value={selectedNode.config.autoApproveHrs ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'autoApproveHrs', e.target.value)} />
                    </div>
                  </>
                )}
                {selectedNode.type === 'DECISION' && (
                  <div>
                    <label className="form-label text-xs">SQL condition</label>
                    <textarea className="form-input text-xs py-1 font-mono" rows={3} placeholder=":totalcost > 500000" value={selectedNode.config.condition ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'condition', e.target.value)} />
                  </div>
                )}
                {selectedNode.type === 'NOTIFICATION' && (
                  <>
                    <div>
                      <label className="form-label text-xs">Template</label>
                      <input className="form-input text-xs py-1" placeholder="Template name" value={selectedNode.config.template ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'template', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Channel</label>
                      <select className="form-select text-xs py-1" value={selectedNode.config.channel ?? 'email'} onChange={(e) => updateNodeProp(selectedNode.id, 'channel', e.target.value)}>
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
                      <input className="form-input text-xs py-1" placeholder="Connection name" value={selectedNode.config.connection ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'connection', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Endpoint path</label>
                      <input className="form-input text-xs py-1 font-mono" placeholder="/api/sync" value={selectedNode.config.endpoint ?? ''} onChange={(e) => updateNodeProp(selectedNode.id, 'endpoint', e.target.value)} />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className="btn-danger w-full text-xs"
                  onClick={() => deleteNode(selectedNode.id)}
                >
                  Remove node
                </button>
                <button
                  type="button"
                  className={`w-full text-xs btn-outline ${connecting === selectedNode.id ? 'border-purple-400 text-purple-700' : ''}`}
                  onClick={() => setConnecting(connecting === selectedNode.id ? null : selectedNode.id)}
                >
                  {connecting === selectedNode.id ? 'Click target node…' : 'Connect →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="admin-section">
          <h2 className="admin-section-title">Version history</h2>
          <p className="text-sm text-slate-600">
            Published versions are immutable. In-flight records complete on their started version.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Published at</th>
                  <th>Published by</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-slate-400 py-8">
                      No published versions yet. Click "Publish" to create the first one.
                    </td>
                  </tr>
                )}
                {versions.map((v) => (
                  <tr key={v.version}>
                    <td>
                      <span className="font-mono font-semibold text-primary">v{v.version}</span>
                      {v.version === workflow?.currentVersion && (
                        <span className="ml-2 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">current</span>
                      )}
                    </td>
                    <td className="text-slate-600 text-sm">{new Date(v.publishedAt).toLocaleString()}</td>
                    <td className="text-slate-600 text-sm">{v.publishedBy}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-link text-sm"
                        onClick={() => api(`/admin/workflows/${id}/versions/${v.version}/restore`, { method: 'POST' }).then(() => setMsg(`Restored to v${v.version}`))}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
