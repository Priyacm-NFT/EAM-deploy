import type { ReportDistribution } from './types.js';

export interface ScheduleEmailJob {
  to: string;
  subject: string;
  html: string;
}

export function resolveDistributionEmails(distribution: ReportDistribution): string[] {
  const emails = new Set<string>();
  for (const e of distribution.emails ?? []) {
    const trimmed = e.trim();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      emails.add(trimmed);
    }
  }
  return [...emails];
}

export function buildReportEmailJobs(
  distribution: ReportDistribution,
  reportName: string,
  downloadUrl: string,
): ScheduleEmailJob[] {
  const recipients = resolveDistributionEmails(distribution);
  return recipients.map((to) => ({
    to,
    subject: `Scheduled report: ${reportName}`,
    html: `<p>Your scheduled report <strong>${reportName}</strong> is ready.</p>
<p><a href="${downloadUrl}">Download report</a></p>`,
  }));
}

export function shouldSkipEmpty(skipIfEmpty: boolean, rowCount: number): boolean {
  return skipIfEmpty && rowCount === 0;
}
