import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HeartStraight,
  TrendUp,
  WarningCircle,
  Bank,
  SignIn,
  ArrowUp,
  Question,
  Clock,
  BellRinging,
  UserCircleCheck,
  Info,
} from '@phosphor-icons/react';
import { careAnalyze } from '../../api';
import { useEngine, EngineToggle, SourceBadge } from '../../engine';
import type { CareEvent, CareResult } from '../../types';

/*
  Feature 4 — Adaptive Financial Care. Analyses WEEKS of a synthetic demo history for
  SUSTAINED drift and returns one of five escalation levels via a real Claude call.
*/

const LADDER = [
  { level: 1, label: 'Clearer information', icon: Info, desc: 'Plain-language nudge, no friction.' },
  { level: 2, label: 'Contextual questions', icon: Question, desc: 'Gentle questions to understand the situation.' },
  { level: 3, label: 'Cooling-off period', icon: Clock, desc: 'A short reversible pause before more can leave.' },
  { level: 4, label: 'Guardian Contact alert', icon: BellRinging, desc: 'Marcus is informed — never in charge.' },
  { level: 5, label: 'Human SeniorCare support', icon: UserCircleCheck, desc: 'A real specialist reaches out.' },
];

const EVENT_META: Record<CareEvent['type'], { icon: React.ComponentType<{ size?: number; weight?: 'fill' | 'bold' }>; tone: string; label: string }> = {
  payment: { icon: ArrowUp, tone: '#6e7780', label: 'Payment' },
  warning_dismissed: { icon: WarningCircle, tone: '#f4a100', label: 'Warning dismissed' },
  savings_liquidation: { icon: Bank, tone: '#ff5b61', label: 'Savings liquidated' },
  login: { icon: SignIn, tone: '#3860b2', label: 'New device' },
  limit_increase: { icon: TrendUp, tone: '#f4a100', label: 'Limit raised' },
};

export default function Care() {
  const { demo, setDemo, liveConfigured } = useEngine();
  const [scenario, setScenario] = useState<'grooming' | 'stable'>('grooming');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CareResult | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      setResult(await careAnalyze(scenario, demo));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-mesh p-8 text-white">
      <div className="flex items-center justify-between mb-2">
        <Link to="/" className="text-white/40 hover:text-white/70 text-sm transition">
          ← Back
        </Link>
        <EngineToggle demo={demo} setDemo={setDemo} liveConfigured={liveConfigured} />
      </div>

      <div className="text-center mb-5">
        <h1 className="text-2xl font-extrabold flex items-center justify-center gap-2">
          <HeartStraight size={24} weight="fill" className="text-ocbc-red-light" /> Adaptive Financial Care
        </h1>
        <p className="text-white/45 text-sm mt-1 max-w-xl mx-auto">
          Layer 4 — detects sustained behavioural drift over <i>weeks</i>, not a single transaction, and
          escalates proportionately. The model reads the whole history and chooses the least-restrictive
          safe level.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
        <div className="inline-flex rounded-lg bg-black/40 border border-white/10 p-0.5">
          {(['grooming', 'stable'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setScenario(s);
                setResult(null);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                scenario === s ? 'bg-white text-navy-deep' : 'text-white/60'
              }`}
            >
              {s === 'grooming' ? 'Scenario: grooming drift' : 'Scenario: stable / normal'}
            </button>
          ))}
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="bg-ocbc-red text-white font-bold text-sm px-5 py-2 rounded-lg shadow-lg shadow-ocbc-red/20 disabled:opacity-50"
        >
          {loading ? 'Analysing history…' : 'Analyse 4 weeks of activity'}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
        {/* History */}
        <div className="rounded-2xl border border-white/10 bg-navy/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-sm">Transaction history</div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/10 text-white/60">
              SYNTHETIC DEMO DATASET
            </span>
          </div>
          <Timeline scenario={scenario} events={result?.events} />
        </div>

        {/* Analysis */}
        <div className="rounded-2xl border border-white/10 bg-navy/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-sm">Guardian Angel assessment</div>
            {result && <SourceBadge source={result.source} />}
          </div>
          {!result && !loading && (
            <div className="text-white/40 text-sm text-center mt-16">
              Run the analysis to see which escalation level the model chooses.
            </div>
          )}
          {loading && (
            <div className="text-white/50 text-sm text-center mt-16">
              <span className="inline-block w-8 h-8 rounded-full border-2 border-white/20 border-t-ocbc-red-light animate-spin-slow mb-3" />
              <div>Reading four weeks of behaviour…</div>
            </div>
          )}
          {result && <Assessment result={result} />}
        </div>
      </div>
    </div>
  );
}

function Timeline({ scenario, events }: { scenario: string; events?: CareEvent[] }) {
  // Before running, show a lightweight placeholder count so the panel isn't empty.
  if (!events) {
    return (
      <div className="text-white/40 text-sm">
        {scenario === 'grooming'
          ? 'Four weeks of escalating payments to a new recipient, a broken fixed deposit, a raised limit, and three dismissed warnings — hidden until you run the analysis.'
          : 'Four weeks of ordinary spending — groceries, utilities, regular helper and family transfers.'}
      </div>
    );
  }
  return (
    <div className="relative pl-4">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
      {events.map((e, i) => {
        const m = EVENT_META[e.type];
        const Icon = m.icon;
        return (
          <div key={i} className="relative flex items-start gap-3 py-2 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
            <div
              className="absolute -left-[9px] w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: m.tone }}
            >
              <Icon size={9} weight="bold" />
            </div>
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: m.tone }}>
                  {m.label}
                </span>
                <span className="text-[10px] text-white/40">{e.date}</span>
              </div>
              <div className="text-[13px] text-white/80">
                {e.recipient ? <span className="font-semibold">{e.recipient} · </span> : null}
                {e.amount ? `S$${e.amount.toLocaleString()} — ` : ''}
                {e.note}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Assessment({ result }: { result: CareResult }) {
  const lvl = result.escalation_level;
  return (
    <div className="animate-fade-in-up">
      <div
        className={`rounded-xl px-3.5 py-3 mb-4 ${
          result.drift_detected ? 'bg-ocbc-red/10 border border-ocbc-red/40' : 'bg-agent-green/10 border border-agent-green/40'
        }`}
      >
        <div className="text-xs uppercase tracking-wide text-white/50">
          {result.drift_detected ? 'Sustained drift detected' : 'No sustained drift'}
        </div>
        <div className="text-sm text-white/90 mt-1 leading-relaxed">{result.pattern_summary}</div>
      </div>

      {/* Escalation ladder */}
      <div className="space-y-1.5 mb-4">
        {LADDER.map((step) => {
          const active = step.level === lvl;
          const passed = step.level < lvl;
          const Icon = step.icon;
          return (
            <div
              key={step.level}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                active
                  ? 'bg-ocbc-red/15 border-ocbc-red/50'
                  : passed
                    ? 'bg-white/5 border-white/10'
                    : 'border-white/5 opacity-45'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  active ? 'bg-ocbc-red text-white' : passed ? 'bg-white/10 text-white/70' : 'bg-white/5 text-white/40'
                }`}
              >
                <Icon size={15} weight="fill" />
              </div>
              <div className="flex-1">
                <div className={`text-[13px] font-bold ${active ? 'text-white' : 'text-white/70'}`}>
                  Level {step.level} · {step.label}
                </div>
                <div className="text-[11px] text-white/45">{step.desc}</div>
              </div>
              {active && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-navy-deep">
                  CHOSEN
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* AI messages */}
      <div className="rounded-xl bg-app-card p-4 mb-3">
        <div className="text-[10px] font-bold text-sub uppercase tracking-wide mb-1">Message to Grace</div>
        <p className="text-[13px] text-ink leading-relaxed">{result.message_to_grace}</p>
      </div>

      {result.contextual_questions.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-3">
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-2">
            Contextual questions the agent would ask
          </div>
          <ul className="space-y-1.5">
            {result.contextual_questions.map((q, i) => (
              <li key={i} className="text-[13px] text-white/80 flex gap-2">
                <span className="text-ocbc-red-light">•</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lvl >= 4 && result.message_to_guardian && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-400/30 p-4">
          <div className="text-[10px] font-bold text-blue-300 uppercase tracking-wide mb-1">
            Sent to Marcus (Guardian Contact — informational only)
          </div>
          <p className="text-[13px] text-white/85 leading-relaxed">{result.message_to_guardian}</p>
        </div>
      )}
    </div>
  );
}
