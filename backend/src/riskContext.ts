import { allowedActionsForBand, matchRules, resolveBandWithDiversity } from './rules.js';
import type { RiskContextSignal, RiskContextSnapshot } from './types.js';

/*
  Shared risk context — the centre of the architecture.

  Every defence layer (Verify Caller, Network check, Transfer, Adaptive Care) writes
  signals into this ONE session-scoped store instead of reasoning in isolation. Guardian
  Angel's transfer decision therefore sees the union of everything observed so far —
  e.g. it "knows" the caller failed verification and that the recipient has a drift
  history, not just the transfer amount.

  ROBUSTNESS: signals are stored PER SOURCE, and each layer REPLACES its own contribution
  every time it runs (setLayerSignals). Re-running the same layer — a judge testing the
  same transfer twice, or a different amount — never stacks signals, and a layer that no
  longer sees risk (e.g. a now-clear network check) clears its own signals by passing [].
  Distinct layers still combine (a failed caller verification + a large new-payee transfer),
  which is the whole point. This module is deterministic; Claude never touches it.
*/

type Source = RiskContextSignal['source'];

const bySource: Record<Source, RiskContextSignal[]> = {
  verify: [],
  network: [],
  transfer: [],
  care: [],
};

let seq = 0;
function nextId(): string {
  seq += 1;
  return `sig_${Date.now()}_${seq}`;
}

export interface SignalInput {
  category: RiskContextSignal['category'];
  label: string;
  detail: string;
  severity: RiskContextSignal['severity'];
  // See RiskContextSignal.subject — only meaningful for 'network'/'care' layers.
  subject?: string;
}

// Replace ALL signals for one layer with the given list (may be empty to clear the layer).
export function setLayerSignals(source: Source, inputs: SignalInput[]): void {
  bySource[source] = inputs.map((i) => ({
    id: nextId(),
    source,
    category: i.category,
    label: i.label,
    detail: i.detail,
    severity: i.severity,
    timestamp: Date.now(),
    subject: i.subject,
  }));
}

export function clearLayer(source: Source): void {
  bySource[source] = [];
}

export function resetRiskContext(): void {
  (Object.keys(bySource) as Source[]).forEach((s) => (bySource[s] = []));
}

const SEVERITY_WEIGHT: Record<RiskContextSignal['severity'], number> = {
  info: 0,
  low: 8,
  medium: 18,
  high: 30,
};

function normalizeSubject(s: string): string {
  return s.trim().toLowerCase();
}

// currentSubjects scopes 'network'/'care' signals to a specific recipient. Different layers
// key on different identifiers for the SAME recipient — network.ts keys on masked account
// number, care.ts keys on display name (it has no account context) — so a caller must supply
// every identifier it knows (acct AND name) and a signal matches if ANY of them match. A
// network/care signal ABOUT recipient X must never inflate a transfer TO a DIFFERENT recipient
// Y just because they both happened in the same session — that produced exactly the "SP Group
// scored CRITICAL because David Lim was tested earlier" false positive this guards against.
// Signals with no subject (older callers, or intentionally session-wide findings) still apply
// everywhere; 'verify' and 'transfer' are never filtered.
function allSignals(currentSubjects?: string[]): RiskContextSignal[] {
  const subjs = currentSubjects?.filter(Boolean).map(normalizeSubject);
  const scoped = (source: Source, sig: RiskContextSignal) => {
    if (source !== 'network' && source !== 'care') return true;
    if (!sig.subject) return true;
    if (!subjs || subjs.length === 0) return true; // no current subject (e.g. staff/rail view)
    return subjs.includes(normalizeSubject(sig.subject));
  };
  return [bySource.verify, bySource.network, bySource.transfer, bySource.care]
    .flat()
    .filter((sig) => scoped(sig.source, sig))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Band and allowed-actions now come from rules.ts (the rule table) — this module's job is
// purely accumulating signals and the additive score; rules.ts is the single source of truth
// for what a score/pattern combination MEANS.
export function computeSnapshot(currentSubjects?: string[]): RiskContextSnapshot {
  const signals = allSignals(currentSubjects);
  const riskScore = Math.min(100, signals.reduce((sum, s) => sum + SEVERITY_WEIGHT[s.severity], 0));
  const matched = matchRules(signals);
  const { band, distinctCategories, diversityCapped } = resolveBandWithDiversity(riskScore, matched, signals);
  // Explainable reason code (spec §16): the signals that drove the decision, joined.
  const reasonCode = signals.map((s) => s.label).join(' + ');
  return {
    signals,
    riskScore,
    riskLevel: band,
    allowedActions: allowedActionsForBand(band),
    matchedRules: matched.map(({ rule }) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      minBand: rule.minBand,
      rationale: rule.rationale,
    })),
    distinctCategories,
    diversityCapped,
    reasonCode,
  };
}

export function getRiskContext(currentSubjects?: string[]): RiskContextSnapshot {
  return computeSnapshot(currentSubjects);
}
