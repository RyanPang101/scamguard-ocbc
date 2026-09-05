import { loadJson, saveJson } from './persist.js';
import type { RegistryEntry, RegistryStatus } from './types.js';

/*
  Risk Account Registry — SIMULATED, PROTOTYPE INTELLIGENCE.

  This is a file-backed, hackathon-scope stand-in for what a real OCBC risk-operations team
  would maintain: a running memory of accounts implicated in prior scam cases. It is NOT a
  connection to any real OCBC or industry blacklist — every entry here is either seeded for
  the demo or written by the staff feedback loop. Labelled as such wherever it reaches the UI
  (see docs/HONESTY_BOUNDARY.md).

  PERSISTENCE: staff decisions (blacklist / cleared) are written to data/registry.json after
  every change and reloaded on startup, so a confirmed-safe or confirmed-scam verdict sticks
  across server restarts — "confirmed once, remembered forever (until re-reviewed)" is the
  actual requirement here, not any particular storage technology.

  Keyed on the same masked account string the rest of the prototype already uses for a payee
  (e.g. '•••• 7734' — see accounts.ts payees), so a transfer's recipient_acct looks up here
  with no format translation needed.
*/

const REGISTRY_FILE = 'registry.json';

const registry = new Map<string, RegistryEntry>(
  Object.entries(loadJson<Record<string, RegistryEntry>>(REGISTRY_FILE, {})),
);

function persist(): void {
  saveJson(REGISTRY_FILE, Object.fromEntries(registry));
}

// Seed only fills in entries that AREN'T already persisted from a prior session — a staff
// decision on disk must never be silently overwritten by the demo's default seed data.
function seed(entry: RegistryEntry) {
  if (!registry.has(entry.acct)) registry.set(entry.acct, entry);
}

// Seed data — enough to drive the golden demo scenario and a couple of contrast cases.
// David Lim starts on WATCHLIST (not blacklisted) so the feedback-loop demo has somewhere
// to escalate TO: staff confirming the case is what pushes him to blacklisted.
seed({
  acct: '•••• 7734',
  name: 'David Lim',
  bank: 'DBS',
  riskStatus: 'watchlist',
  category: 'Reported as a suspected scam-recipient account',
  reportsCount: 2,
  previousCaseIds: [],
  lastFlagged: Date.now() - 1000 * 60 * 60 * 24 * 3,
  registryRiskScore: 55,
});
seed({
  acct: '•••• 9920',
  name: 'Sunrise Contractors',
  bank: 'DBS',
  riskStatus: 'blacklisted',
  category: 'Confirmed mule account — multiple unrelated victims',
  reportsCount: 6,
  previousCaseIds: [],
  lastFlagged: Date.now() - 1000 * 60 * 60 * 24 * 11,
  registryRiskScore: 92,
});
seed({
  acct: '•••• 4421',
  name: 'SP Group (Utilities)',
  bank: 'OCBC',
  riskStatus: 'cleared',
  category: 'Verified billing organisation',
  reportsCount: 0,
  previousCaseIds: [],
  lastFlagged: null,
  registryRiskScore: 0,
});

// --- Additional test accounts (more coverage: safe cases + a second risky archetype) ---

// SAFE — a brand-new payee that is nonetheless a verified, legitimate business. Demonstrates
// that "new recipient" alone never drives risk: novelty is a mild signal, not a verdict —
// only an actual registry status (or a genuine combination of signals) does that.
seed({
  acct: '•••• 6610',
  name: 'Tan Home Renovations',
  bank: 'OCBC',
  riskStatus: 'cleared',
  category: 'Verified local contractor — ACRA-registered, no reports',
  reportsCount: 0,
  previousCaseIds: [],
  lastFlagged: null,
  registryRiskScore: 0,
});

// SAFE — a second cleared new payee, so the demo isn't relying on just one "safe new" case.
seed({
  acct: '•••• 2290',
  name: 'Ang Mo Kio CC',
  bank: 'DBS',
  riskStatus: 'cleared',
  category: 'Verified community organisation',
  reportsCount: 0,
  previousCaseIds: [],
  lastFlagged: null,
  registryRiskScore: 0,
});

// RISKY — a distinct archetype from David Lim/Sunrise: a mule "collection" account
// identified by transaction VELOCITY (rapid fan-in) rather than a single victim report.
seed({
  acct: '•••• 3312',
  name: 'QuickCollect Trading',
  bank: 'UOB',
  riskStatus: 'blacklisted',
  category: 'Rapid fan-in mule pattern — 14 unrelated incoming transfers within a single hour, funds moved out within minutes of each',
  reportsCount: 9,
  previousCaseIds: [],
  lastFlagged: Date.now() - 1000 * 60 * 60 * 6,
  registryRiskScore: 95,
});

// RISKY — watchlist-tier, a different scam archetype again (romance/relationship scam),
// so the demo can show a MEDIUM-severity registry hit, not only high-severity ones.
seed({
  acct: '•••• 5588',
  name: 'Michael Chen',
  bank: 'DBS',
  riskStatus: 'watchlist',
  category: 'Reported by 3 unrelated customers as a romance-scam recipient',
  reportsCount: 3,
  previousCaseIds: [],
  lastFlagged: Date.now() - 1000 * 60 * 60 * 24 * 5,
  registryRiskScore: 48,
});

export function lookupByAcct(acct: string): RegistryEntry | null {
  return registry.get(acct) ?? null;
}

export function listRegistry(): RegistryEntry[] {
  return [...registry.values()].sort((a, b) => (b.lastFlagged ?? 0) - (a.lastFlagged ?? 0));
}

// Idempotent upsert — the feedback-loop write path. Re-reviewing an already-blacklisted
// account (e.g. a second staff member opening the same case) must NOT inflate reportsCount
// or lastFlagged again; only a genuinely NEW confirmation (a caseId we haven't recorded
// against this account yet) counts as a new report. Clearing an account is a POSITIVE
// confirmation, not a report, so it never bumps reportsCount — see the `blacklisted` check.
export function flagAccount(
  acct: string,
  status: RegistryStatus,
  category: string,
  opts: { name?: string; bank?: string; caseId?: string } = {},
): RegistryEntry {
  const existing = registry.get(acct);
  const isNewCaseLink = !!opts.caseId && !(existing?.previousCaseIds.includes(opts.caseId));
  const countsAsReport = (status === 'blacklisted' || status === 'watchlist') && isNewCaseLink;

  const entry: RegistryEntry = {
    acct,
    name: opts.name ?? existing?.name ?? 'Unknown',
    bank: opts.bank ?? existing?.bank ?? 'Unknown',
    riskStatus: status,
    category,
    reportsCount: existing ? existing.reportsCount + (countsAsReport ? 1 : 0) : countsAsReport ? 1 : 0,
    previousCaseIds:
      opts.caseId && isNewCaseLink
        ? [...(existing?.previousCaseIds ?? []), opts.caseId]
        : (existing?.previousCaseIds ?? []),
    lastFlagged: isNewCaseLink || !existing ? Date.now() : existing.lastFlagged,
    registryRiskScore:
      status === 'blacklisted' ? 90 : status === 'watchlist' ? 50 : status === 'cleared' ? 0 : existing?.registryRiskScore ?? 20,
  };
  registry.set(acct, entry);
  persist();
  return entry;
}
