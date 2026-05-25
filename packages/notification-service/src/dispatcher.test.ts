import { describe, it, expect } from 'vitest';
import { parseDigestConfig } from './digest.js';
import { parseRateLimitConfig } from './rate-limit.js';
import { triggerApplies } from './trigger.js';
import { renderTemplate } from './template.js';

describe('notification dispatch pipeline', () => {
  it('renders WO_ASSIGNED merge fields from template data', () => {
    const subject = renderTemplate('Work Order {{wo_num}} assigned', {
      wo_num: 'WO-1001',
      assignee: { name: 'Alex' },
      asset: { description: 'Pump A' },
    });
    const html = renderTemplate(
      '<p>{{assignee.name}} — {{asset.description}}</p>',
      { assignee: { name: 'Alex' }, asset: { description: 'Pump A' } },
    );
    expect(subject).toBe('Work Order WO-1001 assigned');
    expect(html).toContain('Alex');
    expect(html).toContain('Pump A');
  });

  it('combines digest config and rate-limit overflow into digest mode', () => {
    const digest = parseDigestConfig({ enabled: true, windowMinutes: 5 });
    const rate = parseRateLimitConfig({ max: 10, windowSeconds: 60, overflowMode: 'digest' });
    expect(digest?.enabled).toBe(true);
    expect(rate?.overflowMode).toBe('digest');
  });

  it('skips PR_APPROVED trigger when condition is not met', () => {
    const applies = triggerApplies(
      { entityType: 'PurchaseRequisition', conditionExpression: 'totalcost > 100000' },
      { entityType: 'PurchaseRequisition', context: { totalcost: 80000 } },
    );
    expect(applies).toBe(false);
  });
});
