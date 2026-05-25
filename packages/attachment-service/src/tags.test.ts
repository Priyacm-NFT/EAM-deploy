import { describe, it, expect } from 'vitest';
import { buildAutoTags } from './tags.js';

describe('buildAutoTags', () => {
  it('adds entity and uploader tags', () => {
    const tags = buildAutoTags({
      entityType: 'work_order',
      entityId: '11111111-1111-1111-1111-111111111111',
      uploadedBy: '22222222-2222-2222-2222-222222222222',
      uploadedAt: new Date('2026-05-25T10:00:00.000Z'),
    });
    expect(tags).toContain('entity_type:work_order');
    expect(tags).toContain('entity_id:11111111-1111-1111-1111-111111111111');
    expect(tags).toContain('uploader:22222222-2222-2222-2222-222222222222');
    expect(tags).toContain('uploaded_at:2026-05-25T10:00:00.000Z');
  });

  it('adds mobile GPS and capture timestamp', () => {
    const tags = buildAutoTags({
      entityType: 'asset',
      entityId: '11111111-1111-1111-1111-111111111111',
      uploadedBy: '22222222-2222-2222-2222-222222222222',
      capture: {
        source: 'mobile',
        device: 'iPhone 15',
        capturedAt: '2026-05-25T09:59:00.000Z',
        latitude: 51.5074,
        longitude: -0.1278,
        assetId: '33333333-3333-3333-3333-333333333333',
      },
      manualTags: ['inspection'],
    });
    expect(tags).toContain('source:mobile');
    expect(tags).toContain('device:iPhone 15');
    expect(tags).toContain('captured_at:2026-05-25T09:59:00.000Z');
    expect(tags).toContain('gps:51.5074,-0.1278');
    expect(tags).toContain('asset_id:33333333-3333-3333-3333-333333333333');
    expect(tags).toContain('inspection');
  });
});
