import { SYSTEM_PROMPT, TOOLS } from './tools.js';
import { getCachedFallback } from './fallback.js';
import { reason } from './reason.js';
import { getRiskContext, setLayerSignals, type SignalInput } from './riskContext.js';
import { enforcePolicy } from './policy.js';
import { moveToMoneyLock } from './accounts.js';
import { runReasoningEngine } from './reasoningEngine.js';
import { lookupByAcct } from './registry.js';
import type { AssessResult, MoneyLockOutcome, TransactionContext } from './types.js';

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export async function runAssessment(
  context: TransactionContext,
  forceDemo: boolean,
): Promise<AssessResult> {
  // This transfer's own signals REPLACE any prior transfer signals in the shared risk
  // context (so re-running with a different amount/payee never stacks). Severity is
  // deliberately lower for a TRUSTED payee: paying a long-known biller a large amount is
  // unusual, but it is not the same scam signature as paying a brand-new recipient.
  const isNew = context.recipient_is_new;
  const ratio = context.amount / Math.max(1, context.customer.typical_transfer_max);
  const transferSignals: SignalInput[] = [];
  if (isNew) {
    transferSignals.push({
      category: 'behavioural',
      label: 'New recipient',
      detail: `${context.recipient_name} has never been paid before.`,
      severity: 'medium',
    });
  }
  if (ratio >= 5) {
    transferSignals.push({
      category: 'transaction',
      label: 'Amount far exceeds typical transfer',
      detail: `S$${context.amount.toLocaleString()} is ~${Math.round(ratio)}x this customer's typical transfer${isNew ? ', to a brand-new recipient' : ' (recipient is a trusted, previously-paid payee)'}.`,
      severity: isNew ? 'high' : 'medium',
    });
  } else if (ratio >= 1.5) {
    transferSignals.push({
      category: 'transaction',
      label: 'Amount above typical transfer',
      detail: `S$${context.amount.toLocaleString()} is ~${ratio.toFixed(1)}x this customer's typical transfer.`,
      severity: isNew ? 'medium' : 'low',
    });
  }
  // Recent savings liquidation is a strong scam precursor only when a MATERIAL sum is heading
  // to a NEW recipient. Paying a trusted biller, or sending a small amount, after a deposit
  // matures is ordinary behaviour — so this never inflates a tiny transfer to HIGH.
  const MATERIAL = 5000;
  if (context.customer.recent_investment_liquidation && isNew && context.amount >= MATERIAL) {
    transferSignals.push({
      category: 'behavioural',
      label: 'Recent savings liquidation',
      detail: `A fixed deposit or investment was liquidated shortly before this S$${context.amount.toLocaleString()} transfer to a new recipient — a common scam precursor.`,
      severity: 'high',
    });
  }

  // --- Account-takeover indicators (Layer 3 / Smart-Lock spec) ---
  // Each of these on its own is a mild signal (people do get new phones). Combined with
  // each other or with a large new-recipient transfer, they compound into an
  // account-takeover pattern — exactly the "combination, not any single factor" logic
  // the spec calls for.
  if (context.session.new_device) {
    transferSignals.push({
      category: 'device_security',
      label: 'New / unrecognised device',
      detail: 'This session originates from a device not previously seen on this account.',
      severity: 'medium',
    });
  }
  if (context.session.onetoken_reset) {
    transferSignals.push({
      category: 'device_security',
      label: 'Security credential (OneToken) recently reset',
      detail: 'The 2FA/OneToken credential was reset shortly before this transfer — a common account-takeover step.',
      severity: 'high',
    });
  }
  if (context.session.transfer_limit_increased) {
    transferSignals.push({
      category: 'device_security',
      label: 'Transfer limit recently increased',
      detail: "The account's daily transfer limit was raised shortly before this transfer.",
      severity: 'medium',
    });
  }
  if (context.pct_of_balance >= 0.7) {
    transferSignals.push({
      category: 'transaction',
      label: 'Transfer drains most of the account',
      detail: `This transfer is ${Math.round(context.pct_of_balance * 100)}% of the account balance.`,
      severity: 'high',
    });
  } else if (context.pct_of_balance >= 0.4) {
    transferSignals.push({
      category: 'transaction',
      label: 'Large share of account balance',
      detail: `This transfer is ${Math.round(context.pct_of_balance * 100)}% of the account balance.`,
      severity: 'medium',
    });
  }
  if (isNew && context.recipient_overseas) {
    transferSignals.push({
      category: 'behavioural',
      label: 'New overseas recipient',
      detail: `${context.recipient_name} is an overseas recipient this account has never paid before.`,
      severity: 'low',
    });
  }
  // Repeatedly dismissing a warning and retrying is the social-engineering signature —
  // it means the customer is being coached through the friction, not just careless once.
  if (context.warnings_dismissed_count >= 2) {
    transferSignals.push({
      category: 'behavioural',
      label: 'Repeated warning dismissals',
      detail: `Guardian Angel's caution has been dismissed ${context.warnings_dismissed_count} times for this recipient — consistent with a customer being coached to push through warnings.`,
      severity: 'high',
    });
  } else if (context.warnings_dismissed_count === 1) {
    transferSignals.push({
      category: 'behavioural',
      label: 'Warning dismissed and retried',
      detail: `Guardian Angel's caution was dismissed once and the transfer was retried immediately.`,
      severity: 'medium',
    });
  }

  // --- Risk Account Registry cross-reference (SIMULATED — prototype intelligence) ---
  // Every transfer's recipient account is checked against the registry every defence layer
  // and staff review write into (registry.ts). This is the "institutional memory" signal: an
  // account staff previously confirmed as a scam recipient is a materially different risk than
  // an unknown new payee, independent of anything about THIS transfer.
  if (context.recipient_acct) {
    const registryEntry = lookupByAcct(context.recipient_acct);
    if (registryEntry?.riskStatus === 'blacklisted') {
      transferSignals.push({
        category: 'recipient_network',
        label: 'Recipient on Risk Account Registry — blacklisted',
        detail: `${registryEntry.name} (${registryEntry.acct}) is blacklisted on the Risk Account Registry: ${registryEntry.category}.`,
        severity: 'high',
      });
    } else if (registryEntry?.riskStatus === 'watchlist') {
      transferSignals.push({
        category: 'recipient_network',
        label: 'Recipient on Risk Account Registry — watchlist',
        detail: `${registryEntry.name} (${registryEntry.acct}) is on the Risk Account Registry watchlist: ${registryEntry.category}.`,
        severity: 'medium',
      });
    }
  }

  setLayerSignals('transfer', transferSignals);

  // Deterministic risk context (computed by the rule table, never by Claude) — the
  // reproducible floor. See rules.ts for the score-band and pattern-rule tables.
  // Scoped to THIS transfer's recipient so a network/care finding about a DIFFERENT
  // recipient tested earlier this session can't silently inflate an unrelated transfer.
  // Pass BOTH identifiers — network signals key on account, care signals key on name.
  const riskContext = getRiskContext([context.recipient_acct, context.recipient_name].filter((v): v is string => !!v));

  // AI second opinion — an independent read of the raw signals that can only RAISE the
  // score (final = max(deterministic, AI)). See reasoningEngine.ts.
  const trace = await runReasoningEngine(riskContext, forceDemo);

  const cached = getCachedFallback(context);

  const { tool_calls: recommended, model_raw_text, source } = await reason({
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    userContent: `Here is the transaction context to assess:\n\n${JSON.stringify(
      context,
      null,
      2,
    )}\n\nHere is the FINAL risk context — the deterministic rule-table score combined with an independent AI second opinion that can only raise it (you did NOT compute this — reason over it):\nrisk_level: ${trace.finalBand}\nfinal_score: ${trace.finalScore}/100 (deterministic: ${riskContext.riskScore}, AI second opinion: ${trace.aiRiskScore})\nallowed_actions: ${JSON.stringify(trace.finalAllowedActions)}\nmatched_patterns: ${JSON.stringify(riskContext.matchedRules.map((r) => r.name))}\nsignals: ${JSON.stringify(riskContext.signals.map((s) => ({ source: s.source, label: s.label, severity: s.severity })))}\n\nRecommend which tool(s) to call now (choosing from allowed_actions where possible), and briefly explain your reasoning in text before calling them.`,
    cached: { tool_calls: cached.tool_calls, model_raw_text: cached.model_raw_text },
    forceDemo,
  });

  // Claude recommends; the policy engine is the sole enforcer of the final action.
  const { finalTools: tool_calls, downgraded, downgradeReason } = enforcePolicy(
    recommended,
    trace.finalAllowedActions,
  );

  const warnCall = tool_calls.find((t) => t.tool === 'issue_warning');
  const verifyCall = tool_calls.find((t) => t.tool === 'request_verification');
  const holdCall = tool_calls.find((t) => t.tool === 'place_hold');
  const guardianCall = tool_calls.find((t) => t.tool === 'alert_guardian');
  const specialistCall = tool_calls.find((t) => t.tool === 'escalate_to_specialist');

  const grace_message =
    str(holdCall?.input.message_to_grace) ??
    str(verifyCall?.input.verification_prompt) ??
    str(warnCall?.input.message_to_grace) ??
    null;

  const marcus_alert = str(guardianCall?.input.message_to_marcus) ?? null;
  const specialist_case = str(specialistCall?.input.case_summary) ?? null;

  // Feature 3 (Smart-Lock) — Money Lock activates specifically for the ACCOUNT-TAKEOVER
  // pattern, not every hold. A hold triggered purely by e.g. a large new-payee transfer
  // (no device/credential/limit signals) stays a plain reversible hold — the spec's
  // fund-sequestration mechanic is the response to a takeover indicator, not to amount alone.
  const takeoverPatternPresent =
    context.session.new_device ||
    context.session.onetoken_reset ||
    context.session.transfer_limit_increased ||
    context.pct_of_balance >= 0.7;
  let money_lock: MoneyLockOutcome | null = null;
  if (holdCall && takeoverPatternPresent) {
    money_lock = moveToMoneyLock();
  }

  return {
    id: `assess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    context,
    risk_tier: trace.finalBand, // deterministic rule table + AI second-opinion floor — Claude never sets this
    tool_calls,
    model_raw_text,
    grace_message,
    marcus_alert,
    specialist_case,
    hold_active: !!holdCall,
    timestamp: Date.now(),
    source,
    risk_context: riskContext,
    ai_risk_score: trace.aiRiskScore,
    ai_reasoning: trace.aiReasoning,
    final_score: trace.finalScore,
    policy_downgraded: downgraded,
    policy_downgrade_reason: downgradeReason,
    money_lock,
  };
}
