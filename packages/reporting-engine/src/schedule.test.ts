import { describe, it, expect } from 'vitest';
import {
  resolveDistributionEmails,
  buildReportEmailJobs,
  shouldSkipEmpty,
} from './schedule.js';

describe('report schedule', () => {
  it('resolves explicit emails', () => {
    const emails = resolveDistributionEmails({
      emails: ['a@test.com', 'b@test.com'],
    });
    expect(emails).toEqual(['a@test.com', 'b@test.com']);
  });

  it('builds email jobs with download link', () => {
    const jobs = buildReportEmailJobs(
      { emails: ['ops@test.com'] },
      'Weekly WO',
      'https://example.com/dl',
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.html).toContain('https://example.com/dl');
  });

  it('skip-if-empty when no rows', () => {
    expect(shouldSkipEmpty(true, 0)).toBe(true);
    expect(shouldSkipEmpty(true, 5)).toBe(false);
    expect(shouldSkipEmpty(false, 0)).toBe(false);
  });
});
