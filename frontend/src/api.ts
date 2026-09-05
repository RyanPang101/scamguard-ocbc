import type {
  Account,
  AssessResult,
  Case,
  CareResult,
  MarcusAlert,
  NetworkCheckResult,
  Payee,
  RegistryEntry,
  RegistryStatus,
  Resolution,
  ResolutionRecord,
  RiskContextSnapshot,
  StaffMetrics,
  StaffView,
  TransactionRecord,
  VerifyCheck,
  VerifyStart,
} from './types';

// In local dev, Vite proxies '/api' to the backend (see vite.config.ts).
// In production, set VITE_API_BASE to the deployed backend's URL (e.g. https://scamguard-backend.onrender.com/api).
const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export async function postAssess(overrides: {
  amount?: number;
  recipient_name?: string;
  recipient_acct?: string;
  recipient_is_new?: boolean;
  demo?: boolean;
}): Promise<AssessResult> {
  const res = await fetch(`${BASE}/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides),
  });
  if (!res.ok) throw new Error('assess failed');
  return res.json();
}

export async function getLatest(): Promise<AssessResult | null> {
  const res = await fetch(`${BASE}/latest`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.result ?? null;
}

export async function getMarcusAlerts(): Promise<MarcusAlert[]> {
  const res = await fetch(`${BASE}/marcus/alerts`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts ?? [];
}

export async function postOutcome(outcome: string): Promise<void> {
  await fetch(`${BASE}/outcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
}

export async function postResolve(id: string, resolution: Resolution): Promise<void> {
  await fetch(`${BASE}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, resolution }),
  });
}

export async function getResolution(): Promise<ResolutionRecord | null> {
  const res = await fetch(`${BASE}/resolution`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.resolution ?? null;
}

export async function postSpecialistDecision(
  id: string,
  decision: 'confirmed_scam' | 'marked_safe',
): Promise<void> {
  await fetch(`${BASE}/specialist/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, decision }),
  });
}

export async function getAccount(): Promise<Account | null> {
  const res = await fetch(`${BASE}/account`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.account ?? null;
}

export async function getTransactions(): Promise<TransactionRecord[]> {
  const res = await fetch(`${BASE}/transactions`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.transactions ?? [];
}

export async function getPayees(): Promise<Payee[]> {
  const res = await fetch(`${BASE}/payees`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.payees ?? [];
}

export async function addPayee(name: string, bank: string, acct: string): Promise<Payee | null> {
  const res = await fetch(`${BASE}/payees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, bank, acct }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.payee ?? null;
}

export async function deletePayee(id: string): Promise<boolean> {
  const res = await fetch(`${BASE}/payees/${id}`, { method: 'DELETE' });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.ok;
}

export async function getEngineStatus(): Promise<{ liveConfigured: boolean }> {
  try {
    const res = await fetch(`${BASE}/engine`);
    if (!res.ok) return { liveConfigured: false };
    return res.json();
  } catch {
    return { liveConfigured: false };
  }
}

// ---- Feature 1: Verify Caller ----
export async function verifyStart(
  callerClaim: string,
  staffIsGenuine: boolean,
): Promise<VerifyStart> {
  const res = await fetch(`${BASE}/verify/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callerClaim, staffIsGenuine }),
  });
  return res.json();
}

export async function verifyStaff(): Promise<StaffView> {
  const res = await fetch(`${BASE}/verify/staff`);
  return res.json();
}

export async function verifyCheck(code: string): Promise<VerifyCheck> {
  const res = await fetch(`${BASE}/verify/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

export async function verifyClear(): Promise<void> {
  await fetch(`${BASE}/verify/clear`, { method: 'POST' });
}

// ---- Feature 2: Recipient network check ----
export async function networkCheck(opts: {
  recipient_name: string;
  recipient_acct: string;
  recipient_is_new: boolean;
  amount: number;
  contact_email?: string;
  demo?: boolean;
}): Promise<NetworkCheckResult> {
  const res = await fetch(`${BASE}/network-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error('network-check failed');
  return res.json();
}

// ---- Feature 4: Adaptive Financial Care ----
export async function careAnalyze(
  scenario: 'grooming' | 'stable',
  demo: boolean,
): Promise<CareResult> {
  const res = await fetch(`${BASE}/care/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, demo }),
  });
  if (!res.ok) throw new Error('care analyze failed');
  return res.json();
}

// ---- Shared risk context ----
export async function getRiskContext(): Promise<RiskContextSnapshot | null> {
  const res = await fetch(`${BASE}/risk-context`);
  if (!res.ok) return null;
  return res.json();
}

export async function resetRiskContext(): Promise<void> {
  await fetch(`${BASE}/risk-context/reset`, { method: 'POST' });
}

// ---- Staff Console (OCBC Risk Operations) — PROTOTYPE-ONLY auth, see server.ts ----
export async function staffLogin(
  staffId: string,
  password: string,
): Promise<{ ok: boolean; token?: string; staffName?: string; role?: string; error?: string }> {
  const res = await fetch(`${BASE}/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, password }),
  });
  return res.json();
}

export async function getStaffMetrics(): Promise<StaffMetrics | null> {
  const res = await fetch(`${BASE}/staff/metrics`);
  if (!res.ok) return null;
  return res.json();
}

export async function getCases(): Promise<Case[]> {
  const res = await fetch(`${BASE}/cases`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.cases ?? [];
}

export async function getCaseById(id: string): Promise<Case | null> {
  const res = await fetch(`${BASE}/cases/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.case ?? null;
}

export async function reviewCase(
  id: string,
  decision: 'confirmed_scam' | 'marked_safe',
  note?: string,
): Promise<Case | null> {
  const res = await fetch(`${BASE}/cases/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, note }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.case ?? null;
}

// ---- Risk Account Registry (SIMULATED — prototype intelligence) ----
export async function getRegistry(): Promise<RegistryEntry[]> {
  const res = await fetch(`${BASE}/registry`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.registry ?? [];
}

export async function flagRegistryAccount(
  acct: string,
  riskStatus: RegistryStatus,
  category?: string,
): Promise<RegistryEntry | null> {
  const res = await fetch(`${BASE}/registry/${encodeURIComponent(acct)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ riskStatus, category }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.entry ?? null;
}

export async function executeTransfer(
  payeeName: string,
  amount: number,
  payeeId?: string,
): Promise<{ ok: boolean; error?: string; account?: Account; transaction?: TransactionRecord }> {
  const res = await fetch(`${BASE}/transfer/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payeeName, amount, payeeId }),
  });
  return res.json();
}
