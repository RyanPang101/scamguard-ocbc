import type { RiskContextSignal, RiskTier, ToolName } from './types.js';

/*
  The rule table — single source of truth for "a score matches a rule for that risk factor."

  Two tables, both plain, auditable, hand-computable data (no AI):

  1. SCORE_BANDS — the score -> risk-level -> permitted-actions mapping. Anyone can look up
     a score here and get the exact band, with no ambiguity.
  2. PATTERN_RULES — named scam-archetype rules. A signal COMBINATION can independently floor
     the risk band even if the additive score alone wouldn't reach it — this is what makes the
     system reason about PATTERNS, not just point totals. Each rule names the real-world scam
     signature it encodes, so "why did this fire" always has a plain-English answer.

  A single lone factor (e.g. "large transfer" by itself) deliberately matches NO pattern rule —
  see the R5 guard note below — so a big transfer to an otherwise-unremarkable recipient stays
  governed by the additive score alone, which keeps it well under HIGH. This is the system's
  answer to "large transfer alone is not enough to call high risk."
*/

export type Band = RiskTier;

export interface ScoreBand {
  band: Band;
  label: string;
  minScore: number;
  maxScore: number;
  allowedActions: ToolName[];
  customerTreatment: string;
}

// ---- Table 1: score -> band -> permitted actions ----
// Ordered, non-overlapping, covers 0-100 exactly. This is the literal "a score matches a rule"
// table — look up the score, read the row, that's the band and what's permitted.
export const SCORE_BANDS: ScoreBand[] = [
  {
    band: 'LOW',
    label: 'Low',
    minScore: 0,
    maxScore: 19,
    allowedActions: ['allow_transaction', 'issue_warning'],
    customerTreatment: 'No friction, or at most a mild informational note.',
  },
  {
    band: 'MEDIUM',
    label: 'Moderate',
    minScore: 20,
    maxScore: 44,
    allowedActions: ['allow_transaction', 'issue_warning', 'request_verification'],
    customerTreatment: 'A contextual warning, or a single extra verification question.',
  },
  {
    band: 'HIGH',
    label: 'High',
    minScore: 45,
    maxScore: 69,
    allowedActions: ['issue_warning', 'request_verification', 'place_hold', 'alert_guardian'],
    customerTreatment: 'Step-up verification or a reversible hold; guardian may be informed.',
  },
  {
    band: 'CRITICAL',
    label: 'Critical',
    minScore: 70,
    maxScore: 100,
    allowedActions: ['place_hold', 'alert_guardian', 'escalate_to_specialist'],
    customerTreatment: 'Reversible hold (Money Lock if account-takeover signals present), guardian alerted, human specialist review — never a permanent freeze.',
  },
];

export function bandForScore(score: number): ScoreBand {
  const clamped = Math.max(0, Math.min(100, score));
  return SCORE_BANDS.find((b) => clamped >= b.minScore && clamped <= b.maxScore) ?? SCORE_BANDS[0];
}

const BAND_RANK: Record<Band, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
function higherBand(a: Band, b: Band): Band {
  return BAND_RANK[a] >= BAND_RANK[b] ? a : b;
}

// ---- Table 2: named pattern rules (the scam-archetype combination table) ----
export interface PatternRule {
  id: string;
  name: string;
  description: string;
  minBand: Band; // the floor this pattern imposes when matched, regardless of raw score
  rationale: string; // shown verbatim in the rail when the rule fires
  predicate: (labels: Set<string>) => boolean;
}

const has = (labels: Set<string>, label: string) => labels.has(label);
const hasAny = (labels: Set<string>, ...candidates: string[]) => candidates.some((l) => labels.has(l));

export const PATTERN_RULES: PatternRule[] = [
  {
    id: 'R1',
    name: 'Account-Takeover',
    description: 'New device + credential reset + limit increase + new payee + large balance drain',
    minBand: 'CRITICAL',
    rationale:
      'Two or more account-security indicators (new device, OneToken/2FA reset, transfer-limit increase) fired ' +
      'alongside a large or balance-draining transfer to a new payee — the signature of a scammer, not the ' +
      'customer, operating the account.',
    predicate: (labels) => {
      const takeoverSignals = [
        'New / unrecognised device',
        'Security credential (OneToken) recently reset',
        'Transfer limit recently increased',
      ].filter((l) => labels.has(l)).length;
      const largeOrDraining = hasAny(
        labels,
        'Transfer drains most of the account',
        'Large share of account balance',
        'Amount far exceeds typical transfer',
      );
      return takeoverSignals >= 2 && largeOrDraining;
    },
  },
  {
    id: 'R2',
    name: 'Scam-Recipient',
    description: 'Large transfer + new overseas recipient + recipient linked to mule accounts + rapid retry after warning',
    minBand: 'CRITICAL',
    rationale:
      'A large payment to a brand-new overseas recipient that our recipient-network check flagged as ' +
      'mule-like, combined with the customer retrying immediately after a warning — consistent with a ' +
      'coached victim being pushed through the friction rather than a genuine, considered payment.',
    predicate: (labels) =>
      hasAny(labels, 'Amount far exceeds typical transfer', 'Amount above typical transfer') &&
      has(labels, 'New overseas recipient') &&
      has(labels, 'Recipient network risk') &&
      hasAny(labels, 'Repeated warning dismissals', 'Warning dismissed and retried'),
  },
  {
    id: 'R3',
    name: 'Social-Engineering',
    description: 'Escalating payments to one new recipient + savings liquidation + repeated warning dismissals',
    minBand: 'CRITICAL',
    rationale:
      'A new recipient, an unusually large payment, a recent savings/investment liquidation, and repeated ' +
      "dismissal of Guardian Angel's own warnings together match the classic long-con manipulation pattern — " +
      'a customer being coached to override caution rather than a one-off lapse in judgement.',
    predicate: (labels) =>
      has(labels, 'New recipient') &&
      hasAny(labels, 'Amount far exceeds typical transfer', 'Amount above typical transfer') &&
      has(labels, 'Recent savings liquidation') &&
      hasAny(labels, 'Repeated warning dismissals', 'Warning dismissed and retried'),
  },
  {
    id: 'R3b',
    name: 'Sustained-Drift',
    description: 'Adaptive Care detected a sustained escalating pattern across weeks of behaviour',
    minBand: 'HIGH',
    rationale:
      "Guardian Angel's Adaptive Care analysis found a sustained pattern across weeks of history — not a " +
      'single transaction — consistent with prolonged social engineering.',
    predicate: (labels) => has(labels, 'Sustained behavioural drift'),
  },
  {
    id: 'R4',
    name: 'Compromise+Mule',
    description: 'New/unrecognised device + new payee + recipient flagged by the network check',
    minBand: 'CRITICAL',
    rationale:
      'An unrecognised device combined with a payment to a new recipient that the recipient-network check ' +
      'independently flagged is BOTH an account-compromise signature and a mule-network signature at once — ' +
      'two independent risk families agreeing is stronger evidence than either alone.',
    predicate: (labels) =>
      has(labels, 'New / unrecognised device') &&
      has(labels, 'New recipient') &&
      has(labels, 'Recipient network risk'),
  },
  // R5 is deliberately NOT a rule that fires — it's documentation of a guard: a lone
  // 'Amount far exceeds typical transfer' / 'Amount above typical transfer' signal with
  // nothing else present matches none of R1-R4, so the additive score alone governs it,
  // which keeps a single large transfer well under HIGH. Verified in the golden-scenario
  // test suite (see reasoningEngine.ts tests / README).
];

export interface MatchedRule {
  rule: PatternRule;
}

export function matchRules(signals: RiskContextSignal[]): MatchedRule[] {
  const labels = new Set(signals.map((s) => s.label));
  return PATTERN_RULES.filter((r) => r.predicate(labels)).map((rule) => ({ rule }));
}

// The final band is the higher of (a) where the raw score lands and (b) the strongest floor
// any matched pattern rule imposes. Pattern rules can only ever RAISE the band, never lower it.
export function resolveBand(score: number, matched: MatchedRule[]): Band {
  let band = bandForScore(score).band;
  for (const { rule } of matched) {
    band = higherBand(band, rule.minBand);
  }
  return band;
}

// A single indicator strong enough to justify high/critical on its own PLUS corroboration
// (spec §5: "one exceptionally strong external indicator"; Table 5: a high-confidence mule
// link, or a strong account-takeover credential signal). These bypass the diversity gate.
function hasExceptionallyStrongIndicator(signals: RiskContextSignal[]): boolean {
  return signals.some(
    (s) =>
      s.severity === 'high' && (s.category === 'recipient_network' || s.category === 'device_security'),
  );
}

export interface BandResolution {
  band: Band;
  distinctCategories: number;
  diversityCapped: boolean;
}

// The diversity-gated resolution (spec §5 / Table 4). A HIGH/CRITICAL band is only allowed to
// STAND when the evidence is genuinely diverse:
//   - a matched pattern rule (R1–R4) already spans multiple families by construction → keep; or
//   - signals span ≥2 distinct families → keep; or
//   - one exceptionally strong external/security indicator is present → keep (the doc's exception).
// Otherwise a HIGH/CRITICAL score built from a SINGLE family with no strong indicator is capped
// to MEDIUM — this is the code-level enforcement of "a large transfer alone (or any one weak
// family alone) is not sufficient to call high risk."
export function resolveBandWithDiversity(
  score: number,
  matched: MatchedRule[],
  signals: RiskContextSignal[],
): BandResolution {
  const base = resolveBand(score, matched);
  const distinctCategories = new Set(signals.map((s) => s.category)).size;

  const isElevated = base === 'HIGH' || base === 'CRITICAL';
  if (!isElevated) {
    return { band: base, distinctCategories, diversityCapped: false };
  }

  const justified =
    matched.length > 0 || distinctCategories >= 2 || hasExceptionallyStrongIndicator(signals);
  if (justified) {
    return { band: base, distinctCategories, diversityCapped: false };
  }

  // Single weak family, no pattern, no strong indicator → not enough for elevated action.
  return { band: 'MEDIUM', distinctCategories, diversityCapped: true };
}

export function allowedActionsForBand(band: Band): ToolName[] {
  return (SCORE_BANDS.find((b) => b.band === band) ?? SCORE_BANDS[0]).allowedActions;
}
