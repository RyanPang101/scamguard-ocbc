import type { RiskTier, ToolCall, TransactionContext } from './types.js';

interface FallbackEntry {
  risk_tier: RiskTier;
  tool_calls: ToolCall[];
  model_raw_text: string;
}

// Deterministic fallback for the transfer decision, used when the live Anthropic call errors,
// times out, or Demo mode is on — so the on-stage demo never breaks. It is CONTEXT-AWARE:
// it branches on whether the recipient is a brand-new payee vs. a long-trusted one, so it never
// wrongly calls a trusted biller a "new payee". Its recommendation is then clamped by the policy
// engine to the risk level's allowed-actions envelope, exactly like a live recommendation.
export function getCachedFallback(ctx: TransactionContext): FallbackEntry {
  const { amount } = ctx;
  const isNew = ctx.recipient_is_new;
  const ratio = Math.round(amount / Math.max(1, ctx.customer.typical_transfer_max));

  // New recipient + large amount (+ recent liquidation) — the classic scam signature.
  if (isNew && amount >= 10000) {
    return {
      risk_tier: 'CRITICAL',
      tool_calls: [
        {
          tool: 'place_hold',
          input: {
            message_to_grace: `I've paused this S$${amount.toLocaleString()} transfer to ${ctx.recipient_name} for now. This is a brand-new payee, the amount is far above what you usually send, and it follows a recent investment cash-out — a combination we often see in scams. Your money is safe and this hold isn't permanent; a specialist will take a quick look.`,
            reason:
              'New recipient, amount far exceeds typical transfer, and recent investment liquidation combine to a strong scam signature.',
          },
        },
        {
          tool: 'alert_guardian',
          input: {
            message_to_marcus: `Heads up — Guardian Angel paused a S$${amount.toLocaleString()} transfer from your mum's account to a new payee (${ctx.recipient_name}) and flagged it as high risk. She's aware and in control; this is just so you know.`,
            reason: 'Guardian Contact permissions include notify; HIGH/CRITICAL tier warrants alerting them.',
          },
        },
        {
          tool: 'escalate_to_specialist',
          input: {
            case_summary: `Customer ${ctx.customer.name} (age ${ctx.customer.age}) attempted a S$${amount.toLocaleString()} transfer to new payee ${ctx.recipient_name}, ~${ratio}x her typical transfer, immediately following a recent investment liquidation. Recommend manual review before release.`,
            reason: 'Strong scam signature and high loss exposure warrant human fraud-specialist review.',
          },
        },
      ],
      model_raw_text: `This transaction combines several strong risk signals for ${ctx.customer.name}: the recipient is new, the amount is roughly ${ratio}x her typical transfer, and it comes right after a recent investment liquidation — a classic precursor to an authorised-push-payment scam targeting seniors. The exposure is too high for just a warning. I'm placing a temporary, reversible hold, alerting her Guardian Contact Marcus (informational only), and escalating to a human fraud specialist. Grace remains in control of her money throughout.`,
    };
  }

  // New recipient, moderate amount — a proportionate contextual warning, not a hold.
  if (isNew && amount >= 2000) {
    return {
      risk_tier: 'MEDIUM',
      tool_calls: [
        {
          tool: 'issue_warning',
          input: {
            message_to_grace: `Just a heads-up: S$${amount.toLocaleString()} to ${ctx.recipient_name} is a little more than you usually send, and this is the first time you're paying them. If this feels right to you, go ahead — but if anyone pressured or rushed you into it, please pause and call us first.`,
            reason: 'New recipient and amount above typical, but not extreme — a contextual warning is proportionate.',
          },
        },
      ],
      model_raw_text: `This is a first-time payee and the amount is somewhat above ${ctx.customer.name}'s typical transfer, but without the compounding signals of the larger-amount case. A gentle contextual warning is the least-restrictive safe action.`,
    };
  }

  // TRUSTED recipient but the amount is unusually large for them — note it, don't cry scam.
  if (!isNew && amount > ctx.customer.typical_transfer_max * 3) {
    return {
      risk_tier: 'MEDIUM',
      tool_calls: [
        {
          tool: 'issue_warning',
          input: {
            message_to_grace: `Quick check: S$${amount.toLocaleString()} to ${ctx.recipient_name} is quite a bit larger than your usual payments to them. You've paid them before, so this is likely fine — but if someone asked you to send this amount, it's worth pausing first.`,
            reason: 'Trusted, previously-paid recipient but an unusually large amount — a light warning, not a hold, is proportionate.',
          },
        },
      ],
      model_raw_text: `${ctx.recipient_name} is a trusted recipient ${ctx.customer.name} has paid before, so this is not a new-payee scam pattern. The amount is larger than usual for them, which is worth a gentle heads-up — but a hold or escalation would be disproportionate.`,
    };
  }

  return {
    risk_tier: 'LOW',
    tool_calls: [
      {
        tool: 'allow_transaction',
        input: {
          reason: `S$${amount.toLocaleString()} to ${isNew ? 'this recipient' : ctx.recipient_name} is within ${ctx.customer.name}'s normal range with no compounding risk indicators.`,
        },
      },
    ],
    model_raw_text: `This transfer of S$${amount.toLocaleString()} looks like normal activity for ${ctx.customer.name}${isNew ? '' : ` — ${ctx.recipient_name} is a trusted payee`} and there are no compounding risk signals. Allowing it to proceed without disruption is the right call.`,
  };
}
