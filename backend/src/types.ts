export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ToolName =
  | 'allow_transaction'
  | 'issue_warning'
  | 'request_verification'
  | 'place_hold'
  | 'alert_guardian'
  | 'escalate_to_specialist'
  | 'assess_recipient_network'
  | 'assess_financial_care'
  | 'assess_transfer_risk';

export interface ToolCall {
  tool: ToolName;
  input: Record<string, unknown>;
}

export interface TransactionContext {
  amount: number;
  currency: string;
  recipient_is_new: boolean;
  recipient_name: string;
  // Masked account string, same format accounts.ts already uses for a payee (e.g. '•••• 7734').
  // Optional because not every caller of runAssessment supplies one (e.g. tests); when present
  // it drives the Risk Account Registry cross-reference in agent.ts.
  recipient_acct?: string;
  recipient_overseas: boolean;
  customer: {
    name: string;
    age: number;
    typical_transfer_max: number;
    recent_investment_liquidation: boolean;
    guardian_contact: string;
    guardian_permissions: string[];
  };
  // Account-takeover indicators (Layer 3 / Smart-Lock spec). These describe SESSION/DEVICE
  // state around this transfer, not the transfer itself — a device change or a security
  // credential reset happening right before a transfer is a materially different risk
  // signature than the transfer amount alone.
  session: {
    new_device: boolean;
    onetoken_reset: boolean; // 2FA/OneToken was reset shortly before this transfer
    transfer_limit_increased: boolean; // daily/transfer limit was raised shortly before
  };
  // Set server-side from the real account balance — never trust a client-supplied %.
  pct_of_balance: number;
  // How many times a warning/hold has been shown and dismissed/retried on THIS recipient
  // this session — repeated dismissal is a social-engineering/manipulation signature.
  warnings_dismissed_count: number;
  rule_based_risk_hint: string;
  prior_outcomes: string[];
}

export interface AssessResult {
  id: string;
  context: TransactionContext;
  risk_tier: RiskTier;
  tool_calls: ToolCall[];
  model_raw_text: string;
  grace_message: string | null;
  marcus_alert: string | null;
  specialist_case: string | null;
  hold_active: boolean;
  timestamp: number;
  source: 'live' | 'cached_fallback';
  risk_context: RiskContextSnapshot; // the deterministic rule-table read: score, band, matched patterns
  // AI second-opinion — an INDEPENDENT read of the same raw signals, reasoned by Claude, not
  // anchored on the deterministic score. It can only ever RAISE the final score:
  // final_score = max(risk_context.riskScore, ai_risk_score). See reasoningEngine.ts.
  ai_risk_score: number;
  ai_reasoning: string | null;
  final_score: number;
  policy_downgraded: boolean;
  policy_downgrade_reason: string | null;
  money_lock: MoneyLockOutcome | null;
}

// ---- Shared risk context (centre of the architecture) ----
// Every defence layer writes a signal here. Guardian Angel reasons over the union.

// The five signal families from the refined technical spec (§3, Table 3). Every signal is
// tagged with the family it belongs to so the risk engine can require signal DIVERSITY across
// families for high-risk action — not just a raw point total (spec §5, Table 4).
export type SignalCategory =
  | 'transaction' // amount vs norm, % of balance, velocity, unusual time, overseas
  | 'behavioural' // new payees, deviation from usual, escalating pattern, savings liquidation, warning response
  | 'device_security' // new device, location, token/2FA reset, limit increase, malware
  | 'recipient_network' // mule link, fan-in/out, shared device, cross-bank movement
  | 'identity' // caller identity / verification
  | 'context'; // scam-specific context: unexpected contact, secrecy, "safe account", active call

export interface RiskContextSignal {
  id: string;
  source: 'verify' | 'network' | 'transfer' | 'care';
  category: SignalCategory;
  label: string;
  detail: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  timestamp: number;
  // Which recipient this signal is ABOUT (masked acct, or name if no acct available).
  // Only set on 'network' and 'care' signals — 'verify' is about the caller, not a
  // recipient, and 'transfer' is always about the current transfer, so neither needs
  // scoping. Used to stop a network/care finding about ONE recipient (e.g. a flagged
  // mule account tested earlier this session) from silently inflating a LATER transfer
  // to a completely different, unrelated recipient. Undefined = unscoped (applies broadly).
  subject?: string;
}

// A named pattern rule that matched, as surfaced to the UI (see rules.ts for the source of truth).
export interface MatchedRuleInfo {
  id: string;
  name: string;
  description: string;
  minBand: RiskTier;
  rationale: string;
}

export interface RiskContextSnapshot {
  signals: RiskContextSignal[];
  riskScore: number;
  riskLevel: RiskTier;
  allowedActions: ToolName[];
  matchedRules: MatchedRuleInfo[];
  // Diversity accounting (spec §5 / Table 4): how many distinct signal families are present,
  // and whether the band was CAPPED because a HIGH/CRITICAL score came from too few families
  // with no exceptionally-strong single indicator and no matched pattern.
  distinctCategories: number;
  diversityCapped: boolean;
  // Explainable reason code (spec §16), e.g. "new device + token reset + new payee".
  reasonCode: string;
}

export interface MarcusAlert {
  id: string;
  message: string;
  reason: string;
  risk_tier: RiskTier;
  timestamp: number;
}

export type Resolution = 'released' | 'cancelled';

export interface ResolutionRecord {
  id: string;
  resolution: Resolution;
  timestamp: number;
}

export interface Account {
  product: string;
  accountNo: string;
  balance: number;
  dailyLimit: number;
  // Feature 3 (Smart-Lock) — funds automatically secured here during a suspected
  // account-takeover event. Money in the pool is NOT spendable/transferable until
  // released; release requires the customer to pass the same verification flow that
  // stopped the original suspicious transfer.
  moneyLockPool: number;
  moneyLockActive: boolean;
}

// The outcome of Smart-Lock moving funds into Money Lock — attached to an AssessResult
// only when the enforced action is a hold AND the signals matched an account-takeover
// pattern (not every reversible hold triggers this; see agent.ts).
export interface MoneyLockOutcome {
  moved_amount: number;
  operating_balance_kept: number;
  pool_total: number;
}

export interface Payee {
  id: string;
  name: string;
  bank: string;
  acct: string;
  trusted: boolean;
  timesPaid: number;
}

export interface TransactionRecord {
  id: string;
  name: string;
  amount: number;
  timestamp: number;
}

// ---- Risk Account Registry (SIMULATED — prototype intelligence, see registry.ts) ----
export type RegistryStatus = 'blacklisted' | 'watchlist' | 'cleared' | 'unknown';

export interface RegistryEntry {
  acct: string;
  name: string;
  bank: string;
  riskStatus: RegistryStatus;
  category: string;
  reportsCount: number;
  previousCaseIds: string[];
  lastFlagged: number | null;
  registryRiskScore: number;
}

// ---- Scam Case Log (SIMULATED — in-memory, session-scoped; see cases.ts) ----
export type ReviewStatus = 'open' | 'under_review' | 'confirmed_scam' | 'marked_safe';

export interface Case {
  caseId: string;
  timestamp: number;
  customer: { name: string; age: number };
  counterparty: { name: string; acct: string | null; bank: string | null };
  amount: number;
  riskScore: number;
  riskLevel: RiskTier;
  detectionTrigger: string; // reasonCode + matched-rule names, human-readable
  aiAssessment: string | null; // concise, signal-based decision explanation (not chain-of-thought)
  riskSignals: RiskContextSignal[];
  intervention: ToolCall[];
  outcome: string | null; // e.g. "Transfer held, released by customer" / "Escalated to specialist"
  reviewStatus: ReviewStatus;
  accountRiskStatus: RegistryStatus;
  linkedCaseIds: string[];
}
