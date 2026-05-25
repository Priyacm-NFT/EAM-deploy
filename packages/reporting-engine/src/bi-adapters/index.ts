import type { BiAdapterType } from '../types.js';
import type { BiAdapter } from './types.js';
import { powerBiAdapter } from './powerbi.js';
import { qlikAdapter } from './qlik.js';
import { cognosAdapter } from './cognos.js';
import { birtAdapter } from './birt.js';

const ADAPTERS: Record<BiAdapterType, BiAdapter> = {
  POWERBI: powerBiAdapter,
  QLIK: qlikAdapter,
  TABLEAU: {
    type: 'TABLEAU',
    async testConnection() {
      return { success: true, message: 'Tableau WDC endpoints active on /reporting/tableau-wdc/:subjectId' };
    },
  },
  COGNOS: cognosAdapter,
  BIRT: birtAdapter,
};

export function getBiAdapter(type: string): BiAdapter | undefined {
  return ADAPTERS[type as BiAdapterType];
}

export function supportedBiAdapterTypes(): BiAdapterType[] {
  return Object.keys(ADAPTERS) as BiAdapterType[];
}

export * from './powerbi.js';
export * from './qlik.js';
export * from './tableau.js';
export * from './cognos.js';
export * from './birt.js';
export * from './types.js';
