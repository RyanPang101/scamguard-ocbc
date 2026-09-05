import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  Brain,
  Scales,
  Lightning,
  ChatCircleText,
  CheckCircle,
  Warning,
  MagnifyingGlass,
  PauseCircle,
  BellRinging,
  IdentificationBadge,
  Broadcast,
} from '@phosphor-icons/react';
import { getLatest } from '../../api';
import type { AssessResult, RiskTier, ToolName } from '../../types';

const TIER_STYLE: Record<RiskTier, string> = {
  LOW: 'bg-green-500/15 text-green-300 border-green-500/40',
  MEDIUM: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  CRITICAL: 'bg-ocbc-red/15 text-ocbc-red-light border-ocbc-red/50',
};

const TIER_HEX: Record<RiskTier, string> = {
  LOW: '#34D399',
  MEDIUM: '#FBBF24',
  HIGH: '#FB923C',
  CRITICAL: '#ED1C24',
};

const TIER_PCT: Record<RiskTier, number> = {
  LOW: 0.18,
  MEDIUM: 0.45,
  HIGH: 0.72,
  CRITICAL: 0.94,
};

const TOOL_LABEL: Record<string, string> = {
  allow_transaction: 'Allow Transaction',
  issue_warning: 'Issue Warning',
  request_verification: 'Request Verification',
  place_hold: 'Place Temporary Hold',
  alert_guardian: 'Alert Guardian',
  escalate_to_specialist: 'Escalate to Specialist',
};

const TOOL_ICON: Partial<Record<ToolName, typeof CheckCircle>> = {
  allow_transaction: CheckCircle,
  issue_warning: Warning,
  request_verification: MagnifyingGlass,
  place_hold: PauseCircle,
  alert_guardian: BellRinging,
  escalate_to_specialist: IdentificationBadge,
};

const STEPS = [
  { label: 'Observe', icon: Eye },
  { label: 'Interpret', icon: Brain },
  { label: 'Decide', icon: Scales },
  { label: 'Act', icon: Lightning },
  { label: 'Explain', icon: ChatCircleText },
];

export default function Agent() {
  const [result, setResult] = useState<AssessResult | null>(null);
  const lastId = useRef<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);

  useEffect(() => {
    const poll = async () => {
      const latest = await getLatest();
      if (!latest) return;
      if (latest.id !== lastId.current) {
        lastId.current = latest.id;
        setResult(null);
        setThinking(true);
        setActiveStep(0);
        let step = 0;
        const stepTimer = setInterval(() => {
          step += 1;
          setActiveStep(step);
          if (step >= STEPS.length - 1) clearInterval(stepTimer);
        }, 350);
        setTimeout(() => {
          setResult(latest);
          setThinking(false);
        }, 1800);
      }
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-mesh text-white p-10 flex flex-col gap-8 relative overflow-hidden">
      <AmbientBlobs />

      <div className="flex items-center justify-between relative z-10">
        <div>
          <Link to="/staff/dashboard" className="text-white/40 hover:text-white/70 text-sm transition">
            ← Back
          </Link>
          <h1 className="text-3xl font-bold mt-2 tracking-tight">Guardian Angel</h1>
          <p className="text-white/40 text-sm mt-1">Observe → Interpret → Decide → Act → Explain → Learn</p>
        </div>
        {result && (
          <div
            className={`px-5 py-2.5 rounded-full text-sm font-bold border ${TIER_STYLE[result.risk_tier]} animate-fade-in-up`}
          >
            {result.risk_tier} RISK
          </div>
        )}
      </div>

      <div className="relative z-10">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/[0.06] -translate-y-1/2 -z-0" />
        <div className="grid grid-cols-5 gap-4 relative z-10">
          {STEPS.map(({ label, icon: StepIcon }, i) => {
            const isActive = (thinking && i <= activeStep) || !!result;
            const isCurrent = thinking && i === activeStep;
            return (
              <div
                key={label}
                className={`rounded-2xl border p-5 text-center font-semibold transition-all duration-300 relative overflow-hidden ${
                  isActive
                    ? 'border-ocbc-red bg-gradient-to-b from-ocbc-red/15 to-navy-light text-white shadow-lg shadow-ocbc-red/10'
                    : 'border-white/[0.08] bg-navy-light/40 text-white/30'
                } ${isCurrent ? 'animate-pulse-glow' : ''}`}
                style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
              >
                {isCurrent && <div className="absolute inset-0 animate-shimmer" />}
                <StepIcon size={26} weight={isActive ? 'fill' : 'regular'} className="mx-auto mb-1.5 relative" />
                <div className="relative text-sm">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {thinking && (
        <div className="flex items-center gap-3 text-white/60 text-lg justify-center mt-2 relative z-10">
          <span className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ocbc-red dot-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-ocbc-red dot-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-ocbc-red dot-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          Guardian Angel is reasoning over Grace's context…
        </div>
      )}

      {!result && !thinking && (
        <div className="flex flex-col items-center justify-center text-center mt-16 gap-3 text-white/30 relative z-10">
          <Broadcast size={48} weight="thin" />
          <div>Waiting for a transaction from Grace's phone…</div>
        </div>
      )}

      {result && !thinking && (
        <div className="grid grid-cols-2 gap-5 animate-fade-in-up relative z-10">
          <Panel title="Observe — Context Received" icon={Eye}>
            <pre className="text-xs bg-black/40 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono text-white/70 leading-relaxed">
              {JSON.stringify(result.context, null, 2)}
            </pre>
          </Panel>

          <Panel title="Interpret / Decide — Model Reasoning" icon={Brain}>
            <RiskMeter tier={result.risk_tier} />
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap animate-text-reveal">
              {result.model_raw_text}
            </p>
          </Panel>

          <Panel title="Reasoning System — Rule Table + AI Second Opinion" icon={Broadcast}>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-black/30 rounded-lg p-2 text-center border border-white/[0.06]">
                <div className="text-[9px] uppercase tracking-wide text-white/40 font-bold mb-0.5">Rule-based</div>
                <div className="text-sm font-extrabold text-white/85">{result.risk_context.riskScore}/100</div>
              </div>
              <div className="bg-black/30 rounded-lg p-2 text-center border border-white/[0.06]">
                <div className="text-[9px] uppercase tracking-wide text-white/40 font-bold mb-0.5">AI second opinion</div>
                <div className="text-sm font-extrabold text-white/85">
                  {result.ai_reasoning ? `${result.ai_risk_score}/100` : '—'}
                </div>
              </div>
              <div className="bg-ocbc-red/15 rounded-lg p-2 text-center border border-ocbc-red/40">
                <div className="text-[9px] uppercase tracking-wide text-white/40 font-bold mb-0.5">Final (max)</div>
                <div className="text-sm font-extrabold text-ocbc-red-light">{result.final_score}/100</div>
              </div>
            </div>
            <div className="text-xs text-white/50 mb-3">
              Allowed actions: {result.risk_context.allowedActions.join(', ')}
            </div>

            {result.risk_context.matchedRules.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wide font-bold text-white/40 mb-1.5">
                  Matched scam-pattern rules
                </div>
                <div className="flex flex-col gap-2">
                  {result.risk_context.matchedRules.map((r) => (
                    <div key={r.id} className="bg-ocbc-red/10 border border-ocbc-red/25 rounded-xl p-2.5">
                      <div className="text-xs font-bold text-ocbc-red-light">
                        {r.id} · {r.name} → floor {r.minBand}
                      </div>
                      <div className="text-[11px] text-white/60 mt-1 leading-relaxed">{r.rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.risk_context.signals.length === 0 ? (
              <div className="text-white/40 text-sm">No signals observed yet this session.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {result.risk_context.signals.map((s) => (
                  <div key={s.id} className="bg-black/30 rounded-xl p-3 text-xs border border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="uppercase tracking-wide text-[10px] font-bold text-white/40">{s.source}</span>
                      <span className="font-semibold text-white/85">{s.label}</span>
                    </div>
                    <div className="text-white/55">{s.detail}</div>
                  </div>
                ))}
              </div>
            )}

            {result.ai_reasoning && (
              <div className="mt-3 bg-black/30 rounded-xl p-3 border border-white/[0.06]">
                <div className="text-[10px] uppercase tracking-wide font-bold text-white/40 mb-1">
                  AI's independent reasoning
                </div>
                <div className="text-xs text-white/70 leading-relaxed">{result.ai_reasoning}</div>
              </div>
            )}

            {result.policy_downgraded && result.policy_downgrade_reason && (
              <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wide font-bold text-amber-300 mb-1.5">
                  Why this action? (policy engine)
                </div>
                <div className="text-xs text-white/80 leading-relaxed">{result.policy_downgrade_reason}</div>
              </div>
            )}

            {result.money_lock && (
              <div className="mt-3 bg-ocbc-red/10 border border-ocbc-red/30 rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wide font-bold text-ocbc-red-light mb-1.5">
                  Smart-Lock — Money Lock activated
                </div>
                <div className="text-xs text-white/80 leading-relaxed">
                  S${result.money_lock.moved_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} secured ·
                  S${result.money_lock.operating_balance_kept.toLocaleString(undefined, { minimumFractionDigits: 2 })} kept
                  spendable.
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Act — Tools Executed" icon={Lightning}>
            <div className="flex flex-col gap-2.5">
              {result.tool_calls.map((tc, i) => {
                const ToolIcon = TOOL_ICON[tc.tool] ?? CheckCircle;
                return (
                  <div
                    key={i}
                    className="bg-black/30 rounded-xl p-4 text-sm flex gap-3 items-start border border-white/[0.06] animate-fade-in-up"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <ToolIcon size={18} className="mt-0.5 shrink-0 text-ocbc-red-light" />
                    <div>
                      <div className="font-semibold text-ocbc-red-light">
                        {TOOL_LABEL[tc.tool] ?? tc.tool}
                      </div>
                      <div className="text-white/55 text-xs mt-1 leading-relaxed">{tc.input.reason}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Explain — Generated Messages" icon={ChatCircleText}>
            <div className="flex flex-col gap-3">
              {result.grace_message && (
                <div className="text-sm">
                  <div className="text-white/40 text-xs uppercase tracking-wide mb-1">To Grace</div>
                  <div className="text-white/85 leading-relaxed bg-black/20 rounded-lg p-3">
                    {result.grace_message}
                  </div>
                </div>
              )}
              {result.marcus_alert && (
                <div className="text-sm">
                  <div className="text-white/40 text-xs uppercase tracking-wide mb-1">To Marcus</div>
                  <div className="text-white/85 leading-relaxed bg-black/20 rounded-lg p-3">
                    {result.marcus_alert}
                  </div>
                </div>
              )}
              {!result.grace_message && !result.marcus_alert && (
                <div className="text-white/40 text-sm">No intervention messages generated.</div>
              )}
            </div>
            <div className="text-[10px] text-white/30 mt-4 uppercase tracking-wide flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${result.source === 'live' ? 'bg-green-400' : 'bg-white/30'}`} />
              {result.source === 'live' ? 'Live Anthropic call' : 'Cached fallback (stage-safe)'}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function RiskMeter({ tier }: { tier: RiskTier }) {
  const r = 30;
  const circumference = 2 * Math.PI * r;
  const pct = TIER_PCT[tier];
  const offset = circumference * (1 - pct);
  const color = TIER_HEX[tier];
  return (
    <div className="flex items-center gap-4 mb-4">
      <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0 -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="animate-meter-fill"
          style={
            {
              '--meter-start': circumference,
              '--meter-end': offset,
            } as CSSProperties
          }
        />
      </svg>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-white/40 font-semibold">Risk confidence</div>
        <div className="text-2xl font-bold" style={{ color }}>
          {Math.round(pct * 100)}%
        </div>
        <div className="text-xs text-white/50">{tier} tier</div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Eye; children: ReactNode }) {
  return (
    <div className="bg-navy-light/60 backdrop-blur rounded-2xl p-5 border border-white/[0.06] shadow-xl">
      <h2 className="text-xs uppercase text-white/50 mb-3 tracking-wide flex items-center gap-2 font-semibold">
        <Icon size={14} /> {title}
      </h2>
      {children}
    </div>
  );
}

function AmbientBlobs() {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
      <div
        className="absolute w-[480px] h-[480px] rounded-full opacity-[0.12] blur-3xl"
        style={{ background: '#ED1C24', top: '-10%', left: '-8%' }}
      />
      <div
        className="absolute w-[420px] h-[420px] rounded-full opacity-[0.10] blur-3xl"
        style={{ background: '#5E6AD2', top: '40%', right: '-10%' }}
      />
    </div>
  );
}
