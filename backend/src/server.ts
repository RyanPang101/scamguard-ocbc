import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runAssessment } from './agent.js';
import { ruleBasedRiskHint } from './risk.js';
import { addPayee, executeTransfer, getAccount, listPayees, listTransactions, releaseFromMoneyLock, removePayee } from './accounts.js';
import { checkCode, clearVerification, getStaffView, startVerification, type ChannelClaim } from './verify.js';
import { runNetworkCheck } from './network.js';
import { runCareAnalysis, type CareScenario } from './care.js';
import { hasLiveKey } from './reason.js';
import { clearLayer, getRiskContext, resetRiskContext, setLayerSignals } from './riskContext.js';
import { getCase, listCases, reviewCase, shouldOpenCase, upsertCase } from './cases.js';
import { flagAccount, listRegistry, lookupByAcct } from './registry.js';
import type { AssessResult, MarcusAlert, RegistryStatus, ResolutionRecord, TransactionContext } from './types.js';

const app = express();
app.use(cors());
app.use(express.json());

const priorOutcomes: string[] = [];
const marcusAlerts: MarcusAlert[] = [];
let latestResult: AssessResult | null = null;
let latestResolution: ResolutionRecord | null = null;

const GRACE_BASE: Pick<TransactionContext, 'currency' | 'customer'> = {
  currency: 'SGD',
  customer: {
    name: 'Grace',
    age: 68,
    typical_transfer_max: 2000,
    recent_investment_liquidation: true,
    guardian_contact: 'Marcus',
    guardian_permissions: ['notify', 'participate_in_verification'],
  },
};

// Coerce any client-supplied amount to a safe, finite, non-negative number rounded to
// the cent — so a judge entering anything (decimals, huge values, junk) never crashes or
// produces NaN downstream. "Down to the dollar" coherence starts here.
function safeAmount(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

app.post('/api/assess', async (req, res) => {
  try {
    const {
      amount = 0,
      recipient_name = 'Kelvin Tan (new payee)',
      recipient_acct = null,
      recipient_is_new = true,
      recipient_overseas = false,
      new_device = false,
      onetoken_reset = false,
      transfer_limit_increased = false,
      warnings_dismissed_count = 0,
      demo = false,
    } = req.body ?? {};

    const safeTransferAmount = safeAmount(amount);
    // pct_of_balance is computed from the REAL server-held account balance, never from a
    // client-supplied percentage — a client can't fake "this drains my account" as a signal.
    const currentBalance = getAccount().balance;
    const pctOfBalance = currentBalance > 0 ? Math.min(1, safeTransferAmount / currentBalance) : 0;

    const baseCtx = {
      amount: safeTransferAmount,
      currency: GRACE_BASE.currency,
      recipient_is_new: Boolean(recipient_is_new),
      recipient_name: String(recipient_name).slice(0, 120),
      recipient_acct: typeof recipient_acct === 'string' && recipient_acct ? recipient_acct.slice(0, 40) : undefined,
      recipient_overseas: Boolean(recipient_overseas),
      customer: GRACE_BASE.customer,
      session: {
        new_device: Boolean(new_device),
        onetoken_reset: Boolean(onetoken_reset),
        transfer_limit_increased: Boolean(transfer_limit_increased),
      },
      pct_of_balance: pctOfBalance,
      warnings_dismissed_count: Math.max(0, Math.min(20, Math.round(Number(warnings_dismissed_count) || 0))),
    };

    const context: TransactionContext = {
      ...baseCtx,
      rule_based_risk_hint: ruleBasedRiskHint(baseCtx),
      prior_outcomes: [...priorOutcomes],
    };

    const result = await runAssessment(context, Boolean(demo));
    latestResult = result;
    latestResolution = null;

    // Feedback-loop entry point: MEDIUM+ (or any real intervention) opens/updates a case in
    // the Staff Console's log. Dedup-aware — see cases.ts upsertCase.
    if (shouldOpenCase(result)) {
      upsertCase(context, result);
    }

    if (result.marcus_alert) {
      marcusAlerts.push({
        id: result.id,
        message: result.marcus_alert,
        reason: String(result.tool_calls.find((t) => t.tool === 'alert_guardian')?.input.reason ?? ''),
        risk_tier: result.risk_tier,
        timestamp: result.timestamp,
      });
    }

    res.json(result);
  } catch (err) {
    console.error('assess error', err);
    res.status(500).json({ ok: false, error: 'assessment failed' });
  }
});

app.get('/api/latest', (_req, res) => {
  res.json({ result: latestResult });
});

app.get('/api/marcus/alerts', (_req, res) => {
  res.json({ alerts: marcusAlerts });
});

app.post('/api/outcome', (req, res) => {
  const { outcome } = req.body ?? {};
  if (typeof outcome === 'string' && outcome.trim()) {
    priorOutcomes.push(outcome.trim());
  }
  res.json({ ok: true, prior_outcomes: priorOutcomes });
});

app.post('/api/resolve', (req, res) => {
  const { id, resolution } = req.body ?? {};
  if (
    latestResult &&
    latestResult.id === id &&
    (resolution === 'released' || resolution === 'cancelled')
  ) {
    latestResolution = { id, resolution, timestamp: Date.now() };
    priorOutcomes.push(
      resolution === 'cancelled'
        ? `Grace stopped a held transfer herself after being asked who initiated it (case ${id}).`
        : `Grace reviewed a held transfer and confirmed it was genuinely her, releasing it herself (case ${id}).`,
    );
    // Money Lock release is tied to the SAME "this really is me" confirmation the customer
    // just gave — the spec's "release requires verification" is satisfied by reusing the
    // hold's own release step, not a separate gate. Cancelling a held transfer keeps funds
    // locked (the customer agreed something was wrong); releasing unlocks them.
    if (resolution === 'released' && latestResult.money_lock) {
      releaseFromMoneyLock();
    }
  }
  res.json({ ok: true, resolution: latestResolution });
});

app.get('/api/resolution', (_req, res) => {
  res.json({ resolution: latestResolution });
});

app.get('/api/account', (_req, res) => {
  res.json({ account: getAccount() });
});

app.get('/api/transactions', (_req, res) => {
  res.json({ transactions: listTransactions() });
});

app.get('/api/payees', (_req, res) => {
  res.json({ payees: listPayees() });
});

app.post('/api/payees', (req, res) => {
  const { name, bank, acct } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof acct !== 'string' || !acct.trim()) {
    res.status(400).json({ ok: false, error: 'name and acct are required' });
    return;
  }
  const payee = addPayee(name.trim(), typeof bank === 'string' && bank.trim() ? bank.trim() : 'DBS', acct.trim());
  res.json({ ok: true, payee });
});

app.delete('/api/payees/:id', (req, res) => {
  const removed = removePayee(req.params.id);
  res.json({ ok: removed });
});

app.post('/api/transfer/execute', (req, res) => {
  const { payeeName, amount, payeeId } = req.body ?? {};
  if (typeof payeeName !== 'string' || typeof amount !== 'number') {
    res.status(400).json({ ok: false, error: 'payeeName and amount are required' });
    return;
  }
  const outcome = executeTransfer(payeeName, amount, typeof payeeId === 'string' ? payeeId : undefined);
  if (!outcome.ok) {
    res.status(400).json(outcome);
    return;
  }
  res.json(outcome);
});

// Legacy seam: the old Specialist page posted a decision against an AssessResult id, not a
// Case id. Kept working by finding that assessment's case (assess ids and case ids differ but
// upsertCase runs synchronously right after assess, so the most recent case for this customer
// is the right one in the single-session demo model) and routing through the same reviewCase
// path the new Staff Console CaseInvestigation screen uses.
app.post('/api/specialist/decision', (req, res) => {
  const { id, decision } = req.body ?? {};
  if (latestResult && latestResult.id === id && (decision === 'confirmed_scam' || decision === 'marked_safe')) {
    const relatedCase = listCases().find((c) => c.timestamp === latestResult!.timestamp);
    if (relatedCase) reviewCase(relatedCase.caseId, decision);
    priorOutcomes.push(
      `Specialist reviewed case ${id}: ${decision === 'confirmed_scam' ? 'confirmed scam' : 'marked safe'}.`,
    );
  }
  res.json({ ok: true });
});

// ---- Staff Console (OCBC Risk Operations) ----
// PROTOTYPE-ONLY authentication: a fixed demo credential pair, no session persistence beyond
// this in-memory check, no password hashing/storage — never represents production OCBC auth.
// See docs/HONESTY_BOUNDARY.md.
const STAFF_DEMO_CREDENTIALS = { staffId: 'ops001', password: 'guardian2026' };
app.post('/api/staff/login', (req, res) => {
  const { staffId, password } = req.body ?? {};
  if (staffId === STAFF_DEMO_CREDENTIALS.staffId && password === STAFF_DEMO_CREDENTIALS.password) {
    res.json({ ok: true, token: 'prototype-demo-token', staffName: 'Alex Ng', role: 'Risk Operations Analyst' });
    return;
  }
  res.status(401).json({ ok: false, error: 'Invalid staff ID or password' });
});

app.get('/api/staff/metrics', (_req, res) => {
  const allCases = listCases();
  const registryEntries = listRegistry();
  res.json({
    openCases: allCases.filter((c) => c.reviewStatus === 'open').length,
    confirmedScams: allCases.filter((c) => c.reviewStatus === 'confirmed_scam').length,
    highRiskAccounts: registryEntries.filter((r) => r.riskStatus === 'blacklisted' || r.riskStatus === 'watchlist').length,
    fundsProtected: allCases
      .filter((c) => c.riskLevel === 'HIGH' || c.riskLevel === 'CRITICAL')
      .reduce((sum, c) => sum + c.amount, 0),
    totalCases: allCases.length,
  });
});

app.get('/api/cases', (_req, res) => {
  res.json({ cases: listCases() });
});

app.get('/api/cases/:id', (req, res) => {
  const c = getCase(req.params.id);
  if (!c) {
    res.status(404).json({ ok: false, error: 'case not found' });
    return;
  }
  res.json({ case: c });
});

app.post('/api/cases/:id/review', (req, res) => {
  const { decision, note } = req.body ?? {};
  if (decision !== 'confirmed_scam' && decision !== 'marked_safe') {
    res.status(400).json({ ok: false, error: 'decision must be confirmed_scam or marked_safe' });
    return;
  }
  const updated = reviewCase(req.params.id, decision, typeof note === 'string' ? note : undefined);
  if (!updated) {
    res.status(404).json({ ok: false, error: 'case not found' });
    return;
  }
  res.json({ ok: true, case: updated });
});

// ---- Risk Account Registry (SIMULATED — prototype intelligence) ----
app.get('/api/registry', (_req, res) => {
  res.json({ registry: listRegistry() });
});

app.get('/api/registry/:acct', (req, res) => {
  res.json({ entry: lookupByAcct(req.params.acct) });
});

app.post('/api/registry/:acct', (req, res) => {
  const { riskStatus, category, name, bank } = req.body ?? {};
  const validStatuses = ['blacklisted', 'watchlist', 'cleared', 'unknown'];
  if (typeof riskStatus !== 'string' || !validStatuses.includes(riskStatus)) {
    res.status(400).json({ ok: false, error: 'riskStatus must be one of ' + validStatuses.join(', ') });
    return;
  }
  const entry = flagAccount(req.params.acct, riskStatus as RegistryStatus, String(category ?? 'Manually flagged by staff'), {
    name: typeof name === 'string' ? name : undefined,
    bank: typeof bank === 'string' ? bank : undefined,
  });
  res.json({ ok: true, entry });
});

// ---- Engine status (so the UI can show whether Live AI is even configured) ----
app.get('/api/engine', (_req, res) => {
  res.json({ liveConfigured: hasLiveKey() });
});

// ---- Feature 1: Verify Caller ----
app.post('/api/verify/start', (req, res) => {
  const { callerClaim = 'OCBC', staffIsGenuine = true } = req.body ?? {};
  const claim = (['OCBC', 'MAS', 'Police', 'Other'].includes(callerClaim) ? callerClaim : 'OCBC') as ChannelClaim;
  clearLayer('verify'); // fresh verification session starts with a clean slate
  res.json(startVerification(claim, Boolean(staffIsGenuine)));
});

app.get('/api/verify/staff', (_req, res) => {
  res.json(getStaffView());
});

app.post('/api/verify/check', (req, res) => {
  const { code = '' } = req.body ?? {};
  const result = checkCode(String(code));
  if (result.status === 'mismatch' || result.status === 'expired' || result.status === 'locked') {
    setLayerSignals('verify', [
      {
        category: 'identity',
        label: 'Caller not verified',
        detail: `A caller claiming to be ${result.callerClaim} could not be confirmed as connected to an authenticated OCBC employee session (${result.status}).`,
        severity: 'high',
      },
    ]);
  } else if (result.status === 'verified') {
    clearLayer('verify');
  }
  res.json(result);
});

app.post('/api/verify/clear', (_req, res) => {
  clearVerification();
  clearLayer('verify');
  res.json({ ok: true });
});

// ---- Shared risk context (centre of the architecture) ----
app.get('/api/risk-context', (_req, res) => {
  res.json(getRiskContext());
});

app.post('/api/risk-context/reset', (_req, res) => {
  resetRiskContext();
  res.json({ ok: true, risk_context: getRiskContext() });
});

// ---- Feature 2: Recipient network check ----
app.post('/api/network-check', async (req, res) => {
  try {
    const {
      recipient_name = 'Unknown',
      recipient_acct = '',
      recipient_is_new = true,
      amount = 0,
      contact_email,
      demo = false,
    } = req.body ?? {};
    const result = await runNetworkCheck({
      recipientName: String(recipient_name).slice(0, 120),
      recipientAcct: String(recipient_acct),
      recipientIsNew: Boolean(recipient_is_new),
      amount: safeAmount(amount),
      contactEmail: typeof contact_email === 'string' ? contact_email : undefined,
      forceDemo: Boolean(demo),
    });
    res.json(result);
  } catch (err) {
    console.error('network-check error', err);
    res.status(500).json({ ok: false, error: 'network check failed' });
  }
});

// ---- Feature 4: Adaptive Financial Care ----
app.post('/api/care/analyze', async (req, res) => {
  const { scenario = 'grooming', demo = false } = req.body ?? {};
  const scen = (scenario === 'stable' ? 'stable' : 'grooming') as CareScenario;
  const result = await runCareAnalysis(scen, Boolean(demo));
  if (result.escalation_level >= 4 && result.message_to_guardian) {
    marcusAlerts.push({
      id: result.id,
      message: result.message_to_guardian,
      reason: result.pattern_summary,
      risk_tier: result.escalation_level >= 5 ? 'CRITICAL' : 'HIGH',
      timestamp: result.timestamp,
    });
  }
  res.json(result);
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Guardian Angel backend listening on http://localhost:${PORT}`);
});
