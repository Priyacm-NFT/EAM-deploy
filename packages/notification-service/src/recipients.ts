export type DistributionRuleType = 'ROLE' | 'GROUP' | 'FIELD' | 'STATIC_EMAIL' | 'STATIC_USER';

export interface DistributionRule {
  type: DistributionRuleType;
  value: string;
}

export function deduplicateRecipients(
  recipients: Array<{ userId?: string; email?: string }>,
): Array<{ userId?: string; email?: string }> {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.userId ?? r.email ?? '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function shouldRateLimit(
  count: number,
  max: number,
  _windowMinutes: number,
): boolean {
  return count > max;
}
