export interface WorkflowDefCandidate {
  id: string;
  triggerEvent: string;
  isActive: string;
  version: string;
}

export function compareWorkflowVersions(a: string, b: string): number {
  const pa = a.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function pickWorkflowDefinition(
  defs: WorkflowDefCandidate[],
  triggerEvent: string,
  options?: { workflowDefId?: string },
): WorkflowDefCandidate | null {
  if (options?.workflowDefId) {
    return defs.find((d) => d.id === options.workflowDefId) ?? null;
  }
  const active = defs.filter(
    (d) => d.triggerEvent === triggerEvent && d.isActive === 'true',
  );
  if (active.length === 0) return null;
  return [...active].sort((a, b) => compareWorkflowVersions(b.version, a.version))[0]!;
}
