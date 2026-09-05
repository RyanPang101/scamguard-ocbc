import { loadJson, saveJson } from './persist.js';
import type { AssessResult, Case, RegistryStatus, ReviewStatus, TransactionContext } from './types.js';
import { flagAccount, lookupByAcct } from './registry.js';

/*
  Scam Case Log — SIMULATED, file-backed (data/cases.json — see persist.ts). A case is the
  Staff Console's unit of work: it is what an AI-detected, MEDIUM+ (or intervened-on) transfer
  becomes so a human can investigate and close the loop. Case history now survives a server
  restart, same as the registry it feeds.

  DEDUP: repeated /api/assess calls for the SAME transaction (same counterparty account + same
  amount, still the "open" case for that pairing) update the existing case rather than creating
  a new one — a judge re-testing an amount, or the frontend retrying, should never fork the case
  log. A genuinely different transaction (different amount or different counterparty) opens a
  new case even to the same counterparty, and is auto-linked via linkedCaseIds.
*/

const CASES_FILE = 'cases.json';

const cases = new Map<string, Case>(
  Object.entries(loadJson<Record<string, Case>>(CASES_FILE, {})),
);

function persist(): void {
  saveJson(CASES_FILE, Object.fromEntries(cases));
}

let seq = 0;
function nextCaseId(): string {
  seq += 1;
  return `case_${Date.now()}_${seq}`;
}

// A transfer becomes a case when it reached at least MEDIUM or any intervention beyond a plain
// allow fired — mirrors the customer-facing threshold, not an arbitrary separate cutoff.
export function shouldOpenCase(result: AssessResult): boolean {
  if (result.risk_tier !== 'LOW') return true;
  return result.tool_calls.some((t) => t.tool !== 'allow_transaction');
}

function dedupKey(counterpartyAcct: string | null, amount: number): string {
  return `${counterpartyAcct ?? 'unknown'}::${amount}`;
}

export function upsertCase(context: TransactionContext, result: AssessResult): Case {
  const counterpartyAcct = context.recipient_acct ?? null;
  const key = dedupKey(counterpartyAcct, context.amount);

  // Find an existing OPEN case for the exact same (counterparty, amount) pairing — that is the
  // "same transaction" a repeated assess call represents. A case already reviewed by staff is
  // left alone; a new assess for that same pairing opens a fresh case instead of reopening one
  // a human already closed.
  const existing = [...cases.values()].find(
    (c) => dedupKey(c.counterparty.acct, c.amount) === key && c.reviewStatus === 'open',
  );

  const accountRiskStatus: RegistryStatus = counterpartyAcct
    ? (lookupByAcct(counterpartyAcct)?.riskStatus ?? 'unknown')
    : 'unknown';

  const detectionTrigger =
    result.risk_context.reasonCode ||
    (result.risk_context.matchedRules.map((r) => r.name).join(' + ') || 'Score-based');

  const outcome = result.hold_active
    ? 'Transfer held pending review'
    : result.tool_calls.some((t) => t.tool === 'escalate_to_specialist')
      ? 'Escalated to specialist'
      : result.tool_calls.some((t) => t.tool === 'issue_warning' || t.tool === 'request_verification')
        ? 'Warned / step-up verification shown'
        : 'Allowed';

  const linkedCaseIds = counterpartyAcct
    ? [...cases.values()].filter((c) => c.counterparty.acct === counterpartyAcct).map((c) => c.caseId)
    : [];

  if (existing) {
    const updated: Case = {
      ...existing,
      timestamp: result.timestamp,
      amount: context.amount,
      riskScore: result.final_score,
      riskLevel: result.risk_tier,
      detectionTrigger,
      aiAssessment: result.ai_reasoning,
      riskSignals: result.risk_context.signals,
      intervention: result.tool_calls,
      outcome,
      accountRiskStatus,
      linkedCaseIds: linkedCaseIds.filter((id) => id !== existing.caseId),
    };
    cases.set(updated.caseId, updated);
    persist();
    return updated;
  }

  const caseId = nextCaseId();
  const created: Case = {
    caseId,
    timestamp: result.timestamp,
    customer: { name: context.customer.name, age: context.customer.age },
    counterparty: { name: context.recipient_name, acct: counterpartyAcct, bank: null },
    amount: context.amount,
    riskScore: result.final_score,
    riskLevel: result.risk_tier,
    detectionTrigger,
    aiAssessment: result.ai_reasoning,
    riskSignals: result.risk_context.signals,
    intervention: result.tool_calls,
    outcome,
    reviewStatus: 'open',
    accountRiskStatus,
    linkedCaseIds,
  };
  cases.set(caseId, created);
  persist();
  return created;
}

export function listCases(): Case[] {
  return [...cases.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export function getCase(id: string): Case | null {
  return cases.get(id) ?? null;
}

// Staff review — the other half of the feedback loop. Both outcomes write back to the
// registry, because both are real institutional memory:
//   - 'confirmed_scam' → blacklisted. A genuine new report against this account.
//   - 'marked_safe'    → cleared, UNLESS the account is already blacklisted/watchlisted from
//     a SEPARATE prior confirmed case. One clean transfer doesn't erase an existing scam
//     finding — a staff officer would have to deliberately re-review that account itself to
//     downgrade it. But if this account has no prior blacklist/watchlist history, a staff
//     confirmation of "no scam" now sticks as CLEARED — future transfers to it are allowed
//     through without a registry-driven risk signal, until new evidence reopens the question.
export function reviewCase(
  id: string,
  decision: 'confirmed_scam' | 'marked_safe',
  note?: string,
): Case | null {
  const c = cases.get(id);
  if (!c) return null;
  const reviewStatus: ReviewStatus = decision;
  const updated: Case = { ...c, reviewStatus, outcome: note ? `${c.outcome} — ${note}` : c.outcome };
  cases.set(id, updated);

  if (decision === 'confirmed_scam' && c.counterparty.acct) {
    const entry = flagAccount(c.counterparty.acct, 'blacklisted', 'Confirmed scam recipient by staff review', {
      name: c.counterparty.name,
      caseId: id,
    });
    updated.accountRiskStatus = entry.riskStatus;
    cases.set(id, updated);
  } else if (decision === 'marked_safe' && c.counterparty.acct) {
    const existing = lookupByAcct(c.counterparty.acct);
    const alreadyFlaggedElsewhere =
      (existing?.riskStatus === 'blacklisted' || existing?.riskStatus === 'watchlist') &&
      existing.previousCaseIds.some((linkedId) => linkedId !== id);
    if (!alreadyFlaggedElsewhere) {
      const entry = flagAccount(c.counterparty.acct, 'cleared', 'Confirmed safe by staff review — no scam pattern found', {
        name: c.counterparty.name,
        caseId: id,
      });
      updated.accountRiskStatus = entry.riskStatus;
      cases.set(id, updated);
    }
  }

  persist();
  return updated;
}
