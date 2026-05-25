import type { AdapterType } from '../adapters/base.js';

export type ErpVendor = 'SAP' | 'ORACLE_EBS' | 'MS_DYNAMICS' | 'WORKDAY';

export interface ErpConnectorDefinition {
  vendor: ErpVendor;
  label: string;
  description: string;
  defaultAdapterType: AdapterType;
  buildConfig: (input: Record<string, unknown>) => Record<string, unknown>;
}

export const ERP_CONNECTORS: Record<ErpVendor, ErpConnectorDefinition> = {
  SAP: {
    vendor: 'SAP',
    label: 'SAP',
    description: 'SAP RFC/BAPI or OData REST integration',
    defaultAdapterType: 'REST',
    buildConfig: (input) => ({
      url: String(input.baseUrl ?? ''),
      method: 'POST',
      headers: {
        Authorization: input.apiKey ? `Bearer ${String(input.apiKey)}` : '',
        'Content-Type': 'application/json',
      },
      erpVendor: 'SAP',
      sapClient: input.client,
      sapSystemId: input.systemId,
    }),
  },
  ORACLE_EBS: {
    vendor: 'ORACLE_EBS',
    label: 'Oracle EBS',
    description: 'Oracle E-Business Suite REST adapter',
    defaultAdapterType: 'REST',
    buildConfig: (input) => ({
      url: `${String(input.baseUrl ?? '').replace(/\/$/, '')}/ords/${String(input.module ?? 'eam')}`,
      method: 'GET',
      headers: {
        ...(input.username && input.password
          ? {
              Authorization: `Basic ${Buffer.from(`${String(input.username)}:${String(input.password)}`).toString('base64')}`,
            }
          : {}),
      },
      erpVendor: 'ORACLE_EBS',
    }),
  },
  MS_DYNAMICS: {
    vendor: 'MS_DYNAMICS',
    label: 'Microsoft Dynamics 365',
    description: 'Dynamics 365 OData REST connector',
    defaultAdapterType: 'REST',
    buildConfig: (input) => ({
      url: `${String(input.tenantUrl ?? '').replace(/\/$/, '')}/api/data/v9.2/${String(input.entitySet ?? '')}`,
      method: 'POST',
      headers: {
        Authorization: input.accessToken ? `Bearer ${String(input.accessToken)}` : '',
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      erpVendor: 'MS_DYNAMICS',
    }),
  },
  WORKDAY: {
    vendor: 'WORKDAY',
    label: 'Workday',
    description: 'Workday REST/SOAP integration',
    defaultAdapterType: 'SOAP',
    buildConfig: (input) => ({
      endpoint: String(input.soapEndpoint ?? input.baseUrl ?? ''),
      soapAction: input.soapAction,
      headers: {
        Authorization: input.username
          ? `Basic ${Buffer.from(`${String(input.username)}:${String(input.password ?? '')}`).toString('base64')}`
          : '',
      },
      erpVendor: 'WORKDAY',
      tenant: input.tenant,
    }),
  },
};

export function listErpConnectors(): ErpConnectorDefinition[] {
  return Object.values(ERP_CONNECTORS);
}

export function buildErpConnection(
  vendor: ErpVendor,
  input: Record<string, unknown>,
): { adapterType: AdapterType; config: Record<string, unknown> } {
  const def = ERP_CONNECTORS[vendor];
  return {
    adapterType: def.defaultAdapterType,
    config: def.buildConfig(input),
  };
}
