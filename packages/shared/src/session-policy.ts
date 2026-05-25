import { z } from 'zod';

export const sessionPolicySchema = z.object({
  idleTimeoutMinutes: z.number().int().min(1).default(30),
  absoluteTimeoutDays: z.number().int().min(1).default(7),
  maxConcurrentSessions: z.number().int().min(1).default(5),
});

export type SessionPolicy = z.infer<typeof sessionPolicySchema>;

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleTimeoutMinutes: 30,
  absoluteTimeoutDays: 7,
  maxConcurrentSessions: 5,
};

export function parseSessionPolicy(settings: Record<string, unknown> | null | undefined): SessionPolicy {
  const raw = settings?.sessionPolicy;
  if (!raw || typeof raw !== 'object') return DEFAULT_SESSION_POLICY;
  const parsed = sessionPolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SESSION_POLICY;
}
