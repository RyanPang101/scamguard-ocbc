import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle, HeartStraight, ChartLineUp } from '@phosphor-icons/react';
import PhoneFrame from '../../components/PhoneFrame';
import { getMarcusAlerts, getResolution } from '../../api';
import type { MarcusAlert, ResolutionRecord, RiskTier } from '../../types';

const TIER_DOT: Record<RiskTier, string> = {
  LOW: 'bg-green-400',
  MEDIUM: 'bg-yellow-400',
  HIGH: 'bg-orange-400',
  CRITICAL: 'bg-ocbc-red-light',
};

const WELFARE_TIERS: RiskTier[] = ['HIGH', 'CRITICAL'];

// Adaptive Financial Care — a mocked monthly "Financial Wellbeing Signal" for the Guardian Contact.
// Deliberately no medical/cognitive language: Guardian Angel identifies possible financial
// vulnerability or exploitation, never a diagnosis.
const WELLBEING_SIGNAL = {
  month: 'This month',
  summary:
    "We noticed some changes in your mother's spending this month — a few repeated purchases at the same merchant on the same day, and slightly more cash withdrawals than usual.",
  note: 'No diagnosis is made here. This is just a gentle nudge — you may want to check in.',
};

export default function Marcus() {
  const [alerts, setAlerts] = useState<MarcusAlert[]>([]);
  const [resolution, setResolution] = useState<ResolutionRecord | null>(null);
  const [toast, setToast] = useState('');
  const seen = useRef(new Set<string>());

  function ping(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 2200);
  }

  useEffect(() => {
    const poll = async () => {
      const [fresh, res] = await Promise.all([getMarcusAlerts(), getResolution()]);
      const newOnes = fresh.filter((a) => !seen.current.has(a.id));
      if (newOnes.length) {
        newOnes.forEach((a) => seen.current.add(a.id));
        setAlerts([...fresh].sort((a, b) => b.timestamp - a.timestamp));
      }
      setResolution(res);
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-mesh flex flex-col items-center justify-center gap-8 p-10">
      <Link to="/menu" className="absolute top-6 left-6 text-white/40 hover:text-white/70 text-sm transition">
        ← Back
      </Link>

      <PhoneFrame label="Marcus's Phone" sublabel="Guardian Contact for Grace">
        <div className="bg-navy text-white h-full flex flex-col relative">
          <div className="bg-navy-light px-6 py-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ocbc-red to-[#7a0008] flex items-center justify-center font-bold text-sm shrink-0">
              GA
            </div>
            <div>
              <div className="text-[11px] text-white/40 tracking-wide uppercase">OCBC Guardian Angel</div>
              <div className="text-lg font-bold">Notifications</div>
            </div>
          </div>

          <div className="px-5 py-3 bg-white/[0.03] text-white/50 text-[11px] text-center leading-snug border-b border-white/10">
            You're kept informed as Grace's Guardian Contact. She stays in control of her
            account — there's nothing for you to approve or deny here.
          </div>

          <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="bg-navy-light border border-agent-line rounded-2xl p-4 text-sm shadow-lg animate-fade-in-up">
              <div className="flex items-center gap-2 mb-2 text-white/70 font-semibold text-[11px] uppercase tracking-wide">
                <ChartLineUp size={13} className="text-agent-green" />
                Financial Wellbeing Signal · {WELLBEING_SIGNAL.month}
              </div>
              <div className="text-white/85 leading-relaxed">{WELLBEING_SIGNAL.summary}</div>
              <div className="text-white/40 text-xs mt-2 leading-relaxed">{WELLBEING_SIGNAL.note}</div>
              <button
                onClick={() => ping('SeniorCare welfare call requested for Grace')}
                className="mt-3 text-xs font-bold text-agent-green flex items-center gap-1.5"
              >
                <HeartStraight size={14} weight="bold" /> Request a SeniorCare welfare call
              </button>
            </div>

            {alerts.length === 0 && (
              <div className="flex flex-col items-center text-center mt-16 gap-3">
                <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
                  <Bell size={22} weight="regular" className="text-white/40" />
                </div>
                <div className="text-white/40 text-sm max-w-[220px]">
                  No notifications yet. You'll see something here only if Guardian Angel
                  thinks it's worth letting you know about.
                </div>
              </div>
            )}
            {alerts.map((a, i) => (
              <div
                key={a.id}
                className="bg-navy-light border border-white/10 rounded-2xl p-4 text-sm shadow-lg animate-fade-in-up relative overflow-hidden"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${TIER_DOT[a.risk_tier]}`} />
                <div className="flex items-center justify-between mb-2 pl-1">
                  <span className="flex items-center gap-1.5 text-white/70 font-semibold text-[11px] uppercase tracking-wide">
                    <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT[a.risk_tier]}`} />
                    {a.risk_tier} notice
                  </span>
                  <span className="text-white/35 text-xs">
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-white/90 leading-relaxed pl-1">{a.message}</div>
                <div className="text-white/40 text-xs mt-2 pl-1">{a.reason}</div>
                {WELFARE_TIERS.includes(a.risk_tier) && (
                  <div className="mt-2.5 pl-1 flex items-start gap-1.5 text-white/55 text-xs leading-relaxed">
                    <HeartStraight size={13} weight="bold" className="text-agent-green shrink-0 mt-0.5" />
                    An OCBC SeniorCare team member will call Grace within the hour for a welfare check.
                  </div>
                )}
                {resolution?.id === a.id && (
                  <div
                    className={`mt-2.5 pl-1 text-xs font-semibold flex items-center gap-1.5 ${
                      resolution.resolution === 'cancelled' ? 'text-green-400' : 'text-white/50'
                    }`}
                  >
                    {resolution.resolution === 'cancelled' && <CheckCircle size={13} weight="fill" />}
                    {resolution.resolution === 'cancelled'
                      ? 'Resolved — she stopped the transfer.'
                      : 'She confirmed it was her and released it.'}
                  </div>
                )}
              </div>
            ))}
          </div>

          {toast && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 text-ink text-xs font-semibold px-4 py-2.5 rounded-xl z-30 whitespace-nowrap animate-pop">
              {toast}
            </div>
          )}
        </div>
      </PhoneFrame>
    </div>
  );
}
