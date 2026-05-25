import { Parser } from 'expr-eval';

const parser = new Parser();

export function triggerApplies(
  trigger: { conditionExpression: string | null; entityType: string | null },
  payload: Record<string, unknown>,
): boolean {
  if (trigger.entityType && trigger.entityType !== payload.entityType) return false;
  if (!trigger.conditionExpression) return true;
  try {
    const ctx = (payload.context as Record<string, unknown>) ?? payload;
    const expr = parser.parse(trigger.conditionExpression);
    return Boolean(expr.evaluate({ ...ctx } as Record<string, number | string>));
  } catch {
    return false;
  }
}
