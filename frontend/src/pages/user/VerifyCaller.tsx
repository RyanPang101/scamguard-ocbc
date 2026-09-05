import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Phone,
  PhoneX,
  ArrowCounterClockwise,
  Lock,
  Warning,
  CheckCircle,
  Headset,
} from '@phosphor-icons/react';
import PhoneFrame from '../../components/PhoneFrame';
import { verifyStart, verifyStaff, verifyCheck, verifyClear } from '../../api';
import type { ChannelClaim, StaffView, VerifyStart, VerifyCheck } from '../../types';

/*
  Feature 1 — Interactive In-App Agent Verification.
  Left: Grace's app requests a REAL time-boxed 4-digit code.
  Right: a SIMULATED OCBC staff console reading the SAME real backend state — a genuine
  authenticated employee session sees the live code; an impersonator has no session and
  sees nothing to read back. Verification logic is real; only the counterparty is simulated.
*/

type Stage = 'idle' | 'code_issued' | 'verified' | 'failed';

export default function VerifyCaller() {
  const [claim, setClaim] = useState<ChannelClaim>('OCBC');
  const [genuine, setGenuine] = useState(false); // demo control for the simulated counterparty
  const [stage, setStage] = useState<Stage>('idle');
  const [start, setStart] = useState<VerifyStart | null>(null);
  const [entry, setEntry] = useState('');
  const [check, setCheck] = useState<VerifyCheck | null>(null);
  const [staff, setStaff] = useState<StaffView | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [toast, setToast] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    poll.current = setInterval(async () => setStaff(await verifyStaff()), 1000);
    return () => {
      if (poll.current) clearInterval(poll.current);
      verifyClear();
    };
  }, []);

  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => {
      setRemaining(Math.max(0, Math.round((start.expiresAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [start]);

  function ping(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 2600);
  }

  async function requestCode() {
    setEntry('');
    setCheck(null);
    const s = await verifyStart(claim, genuine);
    setStart(s);
    setStage('code_issued');
    setStaff(await verifyStaff());
  }

  async function submit() {
    const r = await verifyCheck(entry);
    setCheck(r);
    if (r.status === 'verified') setStage('verified');
    else if (r.status === 'expired' || r.status === 'locked') setStage('failed');
    else if (r.status === 'mismatch' && r.attemptsRemaining <= 0) setStage('failed');
  }

  function reset() {
    verifyClear();
    setStage('idle');
    setStart(null);
    setEntry('');
    setCheck(null);
    setStaff(null);
  }

  const claimLabel: Record<ChannelClaim, string> = {
    OCBC: 'an OCBC officer',
    MAS: 'from MAS',
    Police: 'a police officer',
    Other: 'a bank representative',
  };

  return (
    <div className="min-h-screen bg-mesh p-8 flex flex-col items-center">
      <Link to="/" className="self-start text-white/40 hover:text-white/70 text-sm transition mb-4">
        ← Back
      </Link>
      <div className="text-center mb-2">
        <h1 className="text-2xl font-extrabold text-white flex items-center justify-center gap-2">
          <ShieldCheck size={24} className="text-ocbc-red-light" weight="fill" /> Verify Caller
        </h1>
        <p className="text-white/45 text-sm mt-1 max-w-lg">
          Layer 1 — confirm a caller claiming to be OCBC / MAS / police is genuinely connected to an
          authenticated employee session, using a live in-app code they must read back.
        </p>
      </div>

      {/* Demo control strip */}
      <div className="flex flex-wrap items-center justify-center gap-3 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 my-4">
        <span className="text-[11px] text-white/40 uppercase tracking-wide">Demo setup</span>
        <div className="inline-flex rounded-lg bg-black/40 border border-white/10 p-0.5">
          {(['OCBC', 'MAS', 'Police'] as ChannelClaim[]).map((c) => (
            <button
              key={c}
              onClick={() => setClaim(c)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                claim === c ? 'bg-white text-navy-deep' : 'text-white/60'
              }`}
            >
              Caller: {c}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-white/70 cursor-pointer">
          <input type="checkbox" checked={genuine} onChange={(e) => setGenuine(e.target.checked)} />
          Caller is a <b className="text-agent-green">genuine</b> OCBC agent
          <span className="text-white/35">(uncheck = impersonator)</span>
        </label>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* ---- Customer pane ---- */}
        <PhoneFrame label="Grace's OCBC App" sublabel="Caller verification" light>
          <div className="h-full flex flex-col bg-app-bg p-4 overflow-y-auto">
            <div className="bg-app-card rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-ocbc-red font-bold text-sm">
                <Phone size={16} weight="fill" /> Incoming call in progress
              </div>
              <p className="text-xs text-sub mt-1.5 leading-relaxed">
                Someone on the phone says they are <b>{claimLabel[claim]}</b>. Before trusting them, ask
                them to read back the code below. A real officer can see it instantly; a scammer cannot.
              </p>
            </div>

            {stage === 'idle' && (
              <button onClick={requestCode} className="ocbc-btn mt-4">
                Request verification code
              </button>
            )}

            {stage !== 'idle' && start && (
              <div className="mt-4 bg-app-card rounded-2xl p-5 shadow-sm text-center">
                <div className="text-[11px] text-sub uppercase tracking-wide">Your live verification code</div>
                <div className="text-[40px] font-extrabold tracking-[0.3em] text-ink mt-1 font-heading">
                  {start.code}
                </div>
                <div className={`text-xs mt-1 font-semibold ${remaining <= 15 ? 'text-ocbc-red' : 'text-sub'}`}>
                  {remaining > 0 ? `Expires in ${remaining}s` : 'Expired'}
                </div>
                <div className="text-[11px] text-faint mt-2 leading-relaxed">
                  Read this to no one. Ask the caller to tell it to <i>you</i>.
                </div>
              </div>
            )}

            {stage === 'code_issued' && (
              <div className="mt-4">
                <label className="text-xs font-bold text-sub">Enter the code the caller read back</label>
                <input
                  value={entry}
                  onChange={(e) => setEntry(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  placeholder="4-digit code"
                  className="w-full px-3.5 py-3 border border-app-line rounded-xl text-lg tracking-widest text-center mt-1.5 outline-none focus:border-ocbc-red"
                />
                {check?.status === 'mismatch' && (
                  <div className="text-ocbc-red text-xs font-semibold mt-2">
                    That code is wrong. {check.attemptsRemaining} attempt
                    {check.attemptsRemaining === 1 ? '' : 's'} left.
                  </div>
                )}
                <button disabled={entry.length !== 4 || remaining <= 0} onClick={submit} className="ocbc-btn mt-3 disabled:opacity-50">
                  Verify caller
                </button>
              </div>
            )}

            {stage === 'verified' && (
              <div className="mt-4 bg-ocbc-green/10 border border-ocbc-green/40 rounded-2xl p-5 text-center animate-pop">
                <CheckCircle size={44} weight="fill" className="text-ocbc-green mx-auto" />
                <div className="font-extrabold text-ink mt-2">Caller verified</div>
                <p className="text-xs text-sub mt-1.5 leading-relaxed">
                  This caller is genuinely connected to an authenticated OCBC session. It's safe to
                  continue the conversation — but OCBC will still never ask you to move money or share a
                  password.
                </p>
                <button onClick={reset} className="ocbc-btn-ghost mt-4">
                  Done
                </button>
              </div>
            )}

            {stage === 'failed' && <NotVerified onAction={ping} onReset={reset} claim={claim} />}
          </div>
        </PhoneFrame>

        {/* ---- Staff console pane ---- */}
        <div className="w-[380px]">
          <StaffConsole staff={staff} genuine={genuine} />
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white text-navy-deep text-sm font-semibold px-5 py-3 rounded-xl shadow-xl animate-pop">
          {toast}
        </div>
      )}
    </div>
  );
}

function NotVerified({
  onAction,
  onReset,
  claim,
}: {
  onAction: (m: string) => void;
  onReset: () => void;
  claim: ChannelClaim;
}) {
  const actions: [string, string, React.ReactNode][] = [
    ['End & report call', 'Call ended and reported to OCBC Fraud team.', <PhoneX size={16} weight="fill" key="a" />],
    ['Request official callback', 'OCBC will call Grace back on her registered number.', <ArrowCounterClockwise size={16} weight="bold" key="b" />],
    ['Temporarily restrict transfers', 'Outgoing transfers paused for 24h (reversible by Grace).', <Lock size={16} weight="fill" key="c" />],
    ['Activate emergency protection', 'Guardian Angel emergency mode on; SeniorCare notified.', <ShieldCheck size={16} weight="fill" key="d" />],
  ];
  return (
    <div className="mt-4 bg-ocbc-red/[0.06] border border-ocbc-red/40 rounded-2xl p-5 animate-pop">
      <div className="flex items-center gap-2 text-ocbc-red font-extrabold">
        <Warning size={20} weight="fill" /> Caller not verified
      </div>
      <p className="text-xs text-ink mt-2 leading-relaxed">
        This caller could not prove they are {claim === 'Police' ? 'a genuine police officer' : `genuinely from ${claim}`}.
        A real officer can always read back your code. <b>Do not share any passwords, OTPs, or move any
        money.</b> Please choose what to do:
      </p>
      <div className="grid gap-2 mt-3">
        {actions.map(([label, msg, icon]) => (
          <button
            key={label}
            onClick={() => onAction(msg)}
            className="flex items-center gap-2.5 bg-app-card border border-app-line rounded-xl px-3.5 py-3 text-left text-sm font-bold text-ink hover:border-ocbc-red/40"
          >
            <span className="text-ocbc-red">{icon}</span>
            {label}
          </button>
        ))}
      </div>
      <button onClick={onReset} className="ocbc-btn-ghost mt-3">
        Start over
      </button>
    </div>
  );
}

function StaffConsole({ staff, genuine }: { staff: StaffView | null; genuine: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-navy-light to-navy overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-black/20">
        <Headset size={18} className="text-ocbc-red-light" weight="fill" />
        <div>
          <div className="text-white font-bold text-sm">OCBC Staff Console</div>
          <div className="text-white/40 text-[10px]">Simulated counterparty · same real backend state</div>
        </div>
        <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full bg-white/10 text-white/60">
          SIMULATED
        </span>
      </div>
      <div className="p-5 min-h-[320px]">
        <div className="flex items-center gap-2 mb-4">
          <span
            className={`w-2 h-2 rounded-full ${genuine ? 'bg-agent-green' : 'bg-agent-red'}`}
          />
          <span className="text-xs text-white/70">
            {genuine ? 'Authenticated OCBC employee session' : 'No authenticated OCBC session (impersonator)'}
          </span>
        </div>

        {!staff?.active ? (
          <div className="text-white/40 text-sm text-center mt-16">
            No active verification request.
            <div className="text-white/25 text-xs mt-1">Waiting for the customer to request a code…</div>
          </div>
        ) : staff.visibleCode ? (
          <div className="text-center mt-8">
            <div className="text-[11px] text-white/40 uppercase tracking-wide">
              Customer's live code (visible to genuine agents)
            </div>
            <div className="text-[46px] font-extrabold tracking-[0.3em] text-agent-green mt-2 font-mono">
              {staff.visibleCode}
            </div>
            <p className="text-white/50 text-xs mt-3 leading-relaxed max-w-[260px] mx-auto">
              Read this code aloud to the customer to prove you are genuinely from OCBC.
            </p>
          </div>
        ) : (
          <div className="text-center mt-8 animate-pop">
            <Warning size={40} weight="fill" className="text-agent-red mx-auto" />
            <div className="text-agent-red font-bold mt-2">No code available</div>
            <p className="text-white/50 text-xs mt-2 leading-relaxed max-w-[260px] mx-auto">
              This caller has no authenticated OCBC session, so there is no code to read back. A genuine
              officer would see it here. This is exactly how the customer catches an impersonator.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
