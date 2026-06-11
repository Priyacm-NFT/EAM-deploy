export type DistributionRuleType =
  | 'ROLE'
  | 'GROUP'
  | 'FIELD'
  | 'STATIC_EMAIL'
  | 'STATIC_USER'
  | 'AD_GROUP'    // P0-8: Active Directory / LDAP group distribution
  | 'CC'          // P0-8: CC recipients (receive copy but not primary addressee)
  | 'BCC';        // P0-8: BCC recipients (blind copy)

export interface DistributionRule {
  type: DistributionRuleType;
  value: string;
}

/**
 * Resolved recipient with optional CC/BCC flag.
 * cc/bcc are used by the email dispatcher to set proper headers.
 */
export interface ResolvedRecipient {
  userId?: string;
  email: string;
  role?: 'to' | 'cc' | 'bcc';
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

/**
 * Splits resolved recipients into to/cc/bcc buckets for nodemailer.
 * Rules with type 'CC' go into cc[], type 'BCC' into bcc[], everything else into to[].
 */
export function splitRecipientsByRole(
  rules: DistributionRule[],
  resolvedByRule: Map<string, ResolvedRecipient[]>,
): { to: string[]; cc: string[]; bcc: string[] } {
  const to: string[] = [];
  const cc: string[] = [];
  const bcc: string[] = [];

  for (const rule of rules) {
    const recipients = resolvedByRule.get(rule.value) ?? [];
    for (const r of recipients) {
      if (!r.email) continue;
      if (rule.type === 'CC') cc.push(r.email);
      else if (rule.type === 'BCC') bcc.push(r.email);
      else to.push(r.email);
    }
  }

  // Deduplicate within each bucket
  return {
    to: [...new Set(to)],
    cc: [...new Set(cc)],
    bcc: [...new Set(bcc)],
  };
}
