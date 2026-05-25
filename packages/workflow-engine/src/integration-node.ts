import { eq } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { integrationConnections } from '@eam/db';
import { getAdapter } from '@eam/integration-framework';
import type { AdapterResult } from '@eam/integration-framework';
import type { WorkflowNode } from './types.js';

export async function executeWorkflowIntegration(
  db: Database,
  node: WorkflowNode,
  instance: {
    entityType: string;
    entityId: string;
    context: Record<string, unknown>;
  },
  context: Record<string, unknown>,
): Promise<AdapterResult> {
  const connectionId = node.config?.connectionId as string | undefined;
  let config: unknown = node.config?.adapterConfig ?? node.config;
  let adapterType = (node.config?.adapterType as string) ?? 'REST';

  if (connectionId) {
    const [conn] = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, connectionId))
      .limit(1);
    if (!conn) return { success: false, error: 'Integration connection not found' };
    config = conn.config;
    adapterType = conn.adapterType;
  }

  const adapter = getAdapter(adapterType);
  if (!adapter) {
    return { success: false, error: `Unsupported integration adapter: ${adapterType}` };
  }

  const payload = {
    entityType: instance.entityType,
    entityId: instance.entityId,
    context: { ...instance.context, ...context },
    ...(node.config?.payload as Record<string, unknown> | undefined),
  };

  return adapter.execute(config, payload);
}
