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
  input: Record<string, string>;
}

export interface TransactionContext {
  amount: number;
  currency: string;
  recipient_is_new: boolean;
  recipient_name: string;
  customer: {
    name: string;
    age: number;
    typical_transfer_max: number;
    recent_investment_liquidation: boolean;
    guardian_contact: string;
    guardian_permissions: string[];
  };
  rule_based_risk_hint: string;
  prior_outcomes: string[];
}

export type SignalCategory =
  | 'transaction'
  | 'behavioural'
  | 'device_security'
  | 'recipient_network'
  | 'identity'
  | 'context';

export interface RiskContextSignal {
  id: string;
  source: 'verify' | 'network' | 'transfer' | 'care';
  category: SignalCategory;
  label: string;
  detail: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  timestamp: number;
}

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
  distinctCategories: number;
  diversityCapped: boolean;
  reasonCode: string;
}

export interface MoneyLockOutcome {
  moved_amount: number;
  operating_balance_kept: number;
  pool_total: number;
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
  risk_context: RiskContextSnapshot;
  ai_risk_score: number;
  ai_reasoning: string | null;
  final_score: number;
  policy_downgraded: boolean;
  policy_downgrade_reason: string | null;
  money_lock: MoneyLockOutcome | null;
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
  moneyLockPool: number;
  moneyLockActive: boolean;
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

// ---- Risk Account Registry (SIMULATED — prototype intelligence, see backend/src/registry.ts) ----
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

// ---- Scam Case Log (SIMULATED — in-memory, session-scoped, see backend/src/cases.ts) ----
export type ReviewStatus = 'open' | 'under_review' | 'confirmed_scam' | 'marked_safe';

export interface Case {
  caseId: string;
  timestamp: number;
  customer: { name: string; age: number };
  counterparty: { name: string; acct: string | null; bank: string | null };
  amount: number;
  riskScore: number;
  riskLevel: RiskTier;
  detectionTrigger: string;
  aiAssessment: string | null;
  riskSignals: RiskContextSignal[];
  intervention: ToolCall[];
  outcome: string | null;
  reviewStatus: ReviewStatus;
  accountRiskStatus: RegistryStatus;
  linkedCaseIds: string[];
}

export interface StaffMetrics {
  openCases: number;
  confirmedScams: number;
  highRiskAccounts: number;
  fundsProtected: number;
  totalCases: number;
}

// ---- Feature 1: Verify Caller ----
export type ChannelClaim = 'OCBC' | 'MAS' | 'Police' | 'Other';

export interface VerifyStart {
  code: string;
  expiresAt: number;
  ttlMs: number;
  callerClaim: ChannelClaim;
}

export interface StaffView {
  active: boolean;
  callerClaim: ChannelClaim;
  visibleCode: string | null;
  expiresAt: number | null;
}

export interface VerifyCheck {
  status: 'verified' | 'mismatch' | 'expired' | 'no_session' | 'locked';
  attemptsRemaining: number;
  callerClaim: ChannelClaim;
}

// ---- Feature 2: Recipient network check ----
export interface NetworkSignal {
  source: 'real_api' | 'simulated';
  label: string;
  detail: string;
  severity: 'info' | 'low' | 'medium' | 'high';
}

export interface ConsortiumGraph {
  source: 'simulated';
  mule_score: number;
  linked_senders: number;
  banks_involved: number;
  rapid_outflow_pct: number;
  shared_device_flags: number;
}

export interface NetworkCheckResult {
  id: string;
  recipient_name: string;
  amount: number;
  signals: NetworkSignal[];
  consortium: ConsortiumGraph;
  real_signal_present: boolean;
  network_risk: 'clear' | 'caution' | 'high_risk' | string;
  confidence: number;
  recommended_action: 'proceed' | 'proceed_with_warning' | 'add_verification' | 'block_and_review' | string;
  explanation_to_grace: string;
  key_signals: string[];
  source: 'live' | 'cached_fallback';
  timestamp: number;
}

// ---- Feature 4: Adaptive Financial Care ----
export interface CareEvent {
  day: number;
  date: string;
  type: 'payment' | 'warning_dismissed' | 'savings_liquidation' | 'login' | 'limit_increase';
  recipient?: string;
  amount?: number;
  note: string;
}

export interface CareResult {
  id: string;
  scenario: 'grooming' | 'stable';
  dataset: 'synthetic-demo';
  events: CareEvent[];
  drift_detected: boolean;
  escalation_level: number;
  level_label: string;
  pattern_summary: string;
  contextual_questions: string[];
  message_to_grace: string;
  message_to_guardian: string;
  source: 'live' | 'cached_fallback';
  timestamp: number;
}
