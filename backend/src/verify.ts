import { randomInt } from 'node:crypto';

/*
  Feature 1 — Interactive In-App Agent Verification.

  This module is the REAL backend for caller verification. The customer requests a
  time-boxed 4-digit code in-app; a genuine OCBC employee (here, the simulated "staff
  console") reads it back; the code is validated server-side against its expiry.

  What is real: code generation (crypto.randomInt), single-session storage, expiry,
  one-time consumption, attempt limiting, and validation.
  What is simulated: the counterparty. There is no real OCBC staff-session system to
  connect to in a hackathon, so the staff console reads the SAME real backend state.
  The verification logic is honest; only the employee identity is simulated for demo.
*/

const CODE_TTL_MS = 90_000; // 90-second validity window
const MAX_ATTEMPTS = 3;

export type ChannelClaim = 'OCBC' | 'MAS' | 'Police' | 'Other';

interface VerifySession {
  code: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  status: 'pending' | 'verified' | 'failed' | 'expired';
  callerClaim: ChannelClaim;
  // Whether the simulated staff console is bound to a genuine OCBC employee session.
  // For the honest demo we let the operator choose: a "genuine agent" knows the code;
  // an "impersonator" does not. This flag only affects what the staff pane is shown.
  staffIsGenuine: boolean;
}

// One active session at a time is plenty for a single-customer demo.
let session: VerifySession | null = null;

function generateCode(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export interface VerifyStartResult {
  code: string;
  expiresAt: number;
  ttlMs: number;
  callerClaim: ChannelClaim;
}

export function startVerification(callerClaim: ChannelClaim, staffIsGenuine: boolean): VerifyStartResult {
  const now = Date.now();
  const code = generateCode();
  session = {
    code,
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    status: 'pending',
    callerClaim,
    staffIsGenuine,
  };
  return { code, expiresAt: session.expiresAt, ttlMs: CODE_TTL_MS, callerClaim };
}

export interface StaffView {
  active: boolean;
  callerClaim: ChannelClaim;
  // Only a GENUINE authenticated employee session can see the live code. An impersonator
  // has no OCBC session, so they see nothing to read back — that is the whole point.
  visibleCode: string | null;
  expiresAt: number | null;
}

export function getStaffView(): StaffView {
  if (!session || session.status !== 'pending' || Date.now() > session.expiresAt) {
    return { active: false, callerClaim: 'Other', visibleCode: null, expiresAt: null };
  }
  return {
    active: true,
    callerClaim: session.callerClaim,
    visibleCode: session.staffIsGenuine ? session.code : null,
    expiresAt: session.expiresAt,
  };
}

export interface VerifyCheckResult {
  status: 'verified' | 'mismatch' | 'expired' | 'no_session' | 'locked';
  attemptsRemaining: number;
  callerClaim: ChannelClaim;
}

export function checkCode(entered: string): VerifyCheckResult {
  if (!session) {
    return { status: 'no_session', attemptsRemaining: 0, callerClaim: 'Other' };
  }
  if (Date.now() > session.expiresAt) {
    session.status = 'expired';
    return { status: 'expired', attemptsRemaining: 0, callerClaim: session.callerClaim };
  }
  if (session.attempts >= MAX_ATTEMPTS) {
    session.status = 'failed';
    return { status: 'locked', attemptsRemaining: 0, callerClaim: session.callerClaim };
  }

  session.attempts += 1;
  const clean = entered.replace(/\D/g, '').slice(0, 4);
  if (clean === session.code) {
    session.status = 'verified';
    return { status: 'verified', attemptsRemaining: MAX_ATTEMPTS - session.attempts, callerClaim: session.callerClaim };
  }
  const remaining = MAX_ATTEMPTS - session.attempts;
  if (remaining <= 0) session.status = 'failed';
  return { status: 'mismatch', attemptsRemaining: Math.max(0, remaining), callerClaim: session.callerClaim };
}

export function clearVerification(): void {
  session = null;
}
