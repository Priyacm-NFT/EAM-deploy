import { describe, it, expect } from 'vitest';
import { normalizeSmtpHost, smtpAuth } from './smtp-transport.js';

describe('smtp-transport', () => {
  it('trims accidental whitespace from hostnames', () => {
    expect(normalizeSmtpHost(' localhost ')).toBe('localhost');
  });

  it('skips auth when username is blank', () => {
    expect(smtpAuth('', 'secret')).toBeUndefined();
    expect(smtpAuth(null, 'secret')).toBeUndefined();
  });
});
