import type { Account, MoneyLockOutcome, Payee, TransactionRecord } from './types.js';

// Feature 3 (Smart-Lock) — the amount always kept spendable even when Money Lock activates,
// so bills and daily expenses are never blocked by the protective action itself.
export const ESSENTIAL_OPERATING_BALANCE = 3000;

const account: Account = {
  product: '360 Account',
  accountNo: '•••• 4021',
  // Generous headroom so judges can test large amounts and let Guardian Angel be the thing
  // that intervenes — not a static daily-limit wall firing before the agent reasons. Amounts
  // over these still fail gracefully with a clean message, never a crash.
  balance: 328940.5,
  dailyLimit: 200000,
  moneyLockPool: 0,
  moneyLockActive: false,
};

const payees: Payee[] = [
  { id: 'p1', name: 'SP Group (Utilities)', bank: 'OCBC', acct: '•••• 4421', trusted: true, timesPaid: 36 },
  { id: 'p2', name: 'Marcus Tan (Son)', bank: 'DBS', acct: '•••• 9087', trusted: true, timesPaid: 22 },
  { id: 'p3', name: 'Mei Ling Tan', bank: 'PayNow · Mobile', acct: '•••• 2203', trusted: true, timesPaid: 18 },
  { id: 'p4', name: 'Sunrise Contractors', bank: 'DBS', acct: '•••• 9920', trusted: false, timesPaid: 0 },
  // New/untrusted payee for the golden demo scenario — same recipient the network-risk
  // check and Adaptive Care drift history already reference, so caller -> payee ->
  // network -> drift -> transfer all tie back to one name.
  { id: 'p5', name: 'David Lim', bank: 'DBS', acct: '•••• 7734', trusted: false, timesPaid: 0 },
  // Additional test payees (registry.ts) for broader judge test coverage — two SAFE new
  // payees (cleared registry, so "new" never alone means "risky") and two more RISKY
  // archetypes distinct from David Lim (fan-in velocity mule, romance-scam watchlist).
  { id: 'p6', name: 'Tan Home Renovations', bank: 'OCBC', acct: '•••• 6610', trusted: false, timesPaid: 0 },
  { id: 'p7', name: 'Ang Mo Kio CC', bank: 'DBS', acct: '•••• 2290', trusted: false, timesPaid: 0 },
  { id: 'p8', name: 'QuickCollect Trading', bank: 'UOB', acct: '•••• 3312', trusted: false, timesPaid: 0 },
  { id: 'p9', name: 'Michael Chen', bank: 'DBS', acct: '•••• 5588', trusted: false, timesPaid: 0 },
];

const transactions: TransactionRecord[] = [
  { id: 't1', name: 'NTUC FairPrice', amount: -42.1, timestamp: Date.now() - 1000 * 60 * 60 * 20 },
  { id: 't2', name: 'PUB Utilities', amount: -98.0, timestamp: Date.now() - 1000 * 60 * 60 * 44 },
  { id: 't3', name: 'Mei Ling Tan', amount: -180.0, timestamp: Date.now() - 1000 * 60 * 60 * 70 },
];

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now()}_${seq}`;
}

export function getAccount(): Account {
  return { ...account };
}

export function listTransactions(): TransactionRecord[] {
  return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
}

export function listPayees(): Payee[] {
  return [...payees];
}

export function addPayee(name: string, bank: string, acct: string): Payee {
  const payee: Payee = { id: nextId('payee'), name, bank, acct, trusted: false, timesPaid: 0 };
  payees.push(payee);
  return payee;
}

export function removePayee(id: string): boolean {
  const idx = payees.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  payees.splice(idx, 1);
  return true;
}

export interface TransferOutcome {
  ok: boolean;
  error?: string;
  account?: Account;
  transaction?: TransactionRecord;
}

export function executeTransfer(payeeName: string, amount: number, payeeId?: string): TransferOutcome {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Invalid amount' };
  }
  if (amount > account.balance) {
    return { ok: false, error: 'Insufficient balance' };
  }
  if (amount > account.dailyLimit) {
    return { ok: false, error: 'Exceeds daily transfer limit' };
  }

  account.balance = Math.round((account.balance - amount) * 100) / 100;

  const transaction: TransactionRecord = {
    id: nextId('txn'),
    name: payeeName,
    amount: -amount,
    timestamp: Date.now(),
  };
  transactions.push(transaction);

  if (payeeId) {
    const payee = payees.find((p) => p.id === payeeId);
    if (payee) {
      payee.timesPaid += 1;
      payee.trusted = true;
    }
  }

  return { ok: true, account: getAccount(), transaction };
}

// ---- Feature 3: Money Lock (real fund sequestration, not just a hold flag) ----
// Called by agent.ts ONLY when the enforced action is a hold AND the risk signals match an
// account-takeover pattern (new device / OneToken reset / limit increase / balance-drain) —
// see the spec's "move funds into Money Lock, preserve essential operating balance" behaviour.
// Moving TO the pool needs no confirmation (it's protective, reversible, and instant); RELEASING
// requires the caller to have already passed verification (enforced by the server route, not here).
export function moveToMoneyLock(): MoneyLockOutcome {
  const movable = Math.max(0, Math.round((account.balance - ESSENTIAL_OPERATING_BALANCE) * 100) / 100);
  if (movable > 0) {
    account.balance = Math.round((account.balance - movable) * 100) / 100;
    account.moneyLockPool = Math.round((account.moneyLockPool + movable) * 100) / 100;
  }
  account.moneyLockActive = true;
  return {
    moved_amount: movable,
    operating_balance_kept: account.balance,
    pool_total: account.moneyLockPool,
  };
}

export function releaseFromMoneyLock(): Account {
  account.balance = Math.round((account.balance + account.moneyLockPool) * 100) / 100;
  account.moneyLockPool = 0;
  account.moneyLockActive = false;
  return getAccount();
}
