import type { TransactionContext } from './types.js';

export function ruleBasedRiskHint(ctx: Omit<TransactionContext, 'rule_based_risk_hint' | 'prior_outcomes'>): string {
  let score = 0;
  if (ctx.recipient_is_new) score += 1;
  if (ctx.amount > ctx.customer.typical_transfer_max * 5) score += 2;
  else if (ctx.amount > ctx.customer.typical_transfer_max * 1.5) score += 1;
  if (ctx.customer.recent_investment_liquidation) score += 1;
  if (ctx.customer.age >= 65) score += 1;

  if (score >= 4) return 'critical';
  if (score >= 3) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}
