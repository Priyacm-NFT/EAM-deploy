import { describe, it, expect } from 'vitest';
import { buildErpConnection, listErpConnectors } from './erp.js';

describe('ERP connectors', () => {
  it('lists all vendors', () => {
    expect(listErpConnectors()).toHaveLength(4);
  });

  it('builds SAP REST config', () => {
    const { adapterType, config } = buildErpConnection('SAP', {
      baseUrl: 'https://sap.example/api',
      apiKey: 'secret',
    });
    expect(adapterType).toBe('REST');
    expect(config.url).toBe('https://sap.example/api');
    expect(config.erpVendor).toBe('SAP');
  });

  it('builds Workday SOAP config', () => {
    const { adapterType, config } = buildErpConnection('WORKDAY', {
      soapEndpoint: 'https://wd.example/ccx/service',
    });
    expect(adapterType).toBe('SOAP');
    expect(config.endpoint).toContain('wd.example');
  });
});
