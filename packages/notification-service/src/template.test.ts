import { describe, it, expect } from 'vitest';
import { renderTemplate } from './template.js';
import { deduplicateRecipients } from './recipients.js';

describe('notifications', () => {
  it('renders merge fields', () => {
    const html = renderTemplate('<p>{{name}}</p>', { name: 'Tech' });
    expect(html).toContain('Tech');
  });

  it('deduplicates recipients', () => {
    const r = deduplicateRecipients([
      { userId: 'u1' },
      { userId: 'u1' },
      { email: 'a@b.com' },
    ]);
    expect(r).toHaveLength(2);
  });
});
