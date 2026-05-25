export interface WorkflowNode {
  id: string;
  type: string;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowDefinitionJson {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
}

export interface AssigneeResult {
  userId?: string;
  role?: string;
  group?: string;
}

export interface StartWorkflowOptions {
  /** Pin to a specific published definition (in-flight isolation). */
  workflowDefId?: string;
}
