import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, XCircle, ShieldWarning } from '@phosphor-icons/react';
import { flagRegistryAccount, getCaseById, reviewCase } from '../../api';
import type { Case } from '../../types';
import { RiskBadge, ReviewStatusBadge, RegistryStatusBadge } from './shared';

const SEV_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3 };

export default function CaseInvestigation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [c, setC] = useState<Case | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const poll = async () => setC(await getCaseById(id));
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [id]);

  async function handleDecision(decision: 'confirmed_scam' | 'marked_safe') {
    if (!c) return;
    setBusy(true);
    const updated = await reviewCase(c.caseId, decision);
    if (updated) setC(updated);
    setBusy(false);
  }

  async function handleBlacklist() {
    if (!c?.counterparty.acct) return;
    setBusy(true);
    await flagRegistryAccount(c.counterparty.acct, 'blacklisted', 'Manually blacklisted by staff during case investigation');
    const updated = await getCaseById(c.caseId);
    if (updated) setC(updated);
    setBusy(false);
  }

  if (!c) {
    return (
      <div className="p-8">
        <Link to="/staff/cases" className="text-[#4F46E5] text-sm font-semibold">
          ← Case log
        </Link>
        <div className="text-[#94A3B8] text-sm mt-6">Loading case…</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/staff/cases" className="text-[#4F46E5] text-sm font-semibold">
        ← Case log
      </Link>

      <div className="flex items-center justify-between mt-4 mb-1">
        <h1 className="text-xl font-extrabold text-[#0F172A] font-mono">{c.caseId}</h1>
        <div className="flex items-center gap-2">
          <RiskBadge level={c.riskLevel} />
          <ReviewStatusBadge status={c.reviewStatus} />
        </div>
      </div>
      <p className="text-sm text-[#64748B] mb-6">{new Date(c.timestamp).toLocaleString('en-SG')}</p>

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <Section title="Transaction">
          <Row k="Amount" v={`S$${c.amount.toLocaleString()}`} />
          <Row k="Customer" v={`${c.customer.name}, age ${c.customer.age}`} />
          <Row k="Counterparty" v={c.counterparty.name} />
          <Row k="Counterparty account" v={c.counterparty.acct ?? '—'} last />
        </Section>
        <Section title="Account risk status">
          <div className="flex items-center gap-2 mb-2">
            <RegistryStatusBadge status={c.accountRiskStatus} />
          </div>
          <div className="text-xs text-[#64748B] leading-relaxed">
            Cross-referenced against the Risk Account Registry (SIMULATED — prototype
            intelligence) at the moment this transfer was assessed.
          </div>
        </Section>
      </div>

      <Section title={`Risk signals (${c.riskSignals.length}) — detection trigger`} full>
        <div className="text-xs text-[#64748B] mb-3">{c.detectionTrigger}</div>
        <div className="flex flex-col gap-2">
          {[...c.riskSignals]
            .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])
            .map((s) => (
              <div key={s.id} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-xs">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="uppercase tracking-wide text-[9px] font-bold text-[#4F46E5]">
                    {s.category.replace('_', ' ')}
                  </span>
                  <span className="font-semibold text-[#0F172A]">{s.label}</span>
                  <span className="ml-auto text-[9px] font-bold uppercase text-[#94A3B8]">{s.severity}</span>
                </div>
                <div className="text-[#64748B]">{s.detail}</div>
              </div>
            ))}
        </div>
      </Section>

      {c.aiAssessment && (
        <Section title="AI assessment" full>
          <p className="text-sm text-[#334155] leading-relaxed">{c.aiAssessment}</p>
        </Section>
      )}

      <Section title="Intervention & outcome" full>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {c.intervention.map((t, i) => (
            <span key={i} className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5]">
              {t.tool.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        <div className="text-sm text-[#334155]">{c.outcome}</div>
      </Section>

      {c.linkedCaseIds.length > 0 && (
        <Section title="Linked cases (same counterparty)" full>
          <div className="flex flex-col gap-1.5">
            {c.linkedCaseIds.map((lid) => (
              <button
                key={lid}
                onClick={() => navigate(`/staff/cases/${lid}`)}
                className="text-left text-xs font-mono text-[#4F46E5] hover:underline"
              >
                {lid}
              </button>
            ))}
          </div>
        </Section>
      )}

      {c.reviewStatus === 'open' ? (
        <div className="flex gap-3 mt-6">
          <button
            disabled={busy}
            onClick={() => handleDecision('confirmed_scam')}
            className="flex-1 bg-[#DC2626] hover:bg-[#B91C1C] transition text-white rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <XCircle size={16} weight="bold" /> Confirm scam
          </button>
          <button
            disabled={busy}
            onClick={() => handleDecision('marked_safe')}
            className="flex-1 border border-[#E2E8F0] hover:bg-[#F8FAFC] transition text-[#0F172A] rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <CheckCircle size={16} weight="bold" /> Mark safe
          </button>
          {c.counterparty.acct && c.accountRiskStatus !== 'blacklisted' && (
            <button
              disabled={busy}
              onClick={handleBlacklist}
              className="border border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2] transition rounded-xl px-4 py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <ShieldWarning size={16} weight="bold" /> Blacklist
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-4 flex items-center gap-2.5 text-sm text-[#166534] font-semibold">
          <CheckCircle size={16} weight="fill" />
          Reviewed — {c.reviewStatus === 'confirmed_scam' ? 'confirmed as scam' : 'marked safe'}. Registry updated
          where applicable.
        </div>
      )}
    </div>
  );
}

function Section({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 mb-4 ${full ? '' : ''}`}>
      <div className="text-[10.5px] font-extrabold text-[#64748B] uppercase tracking-wide mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${last ? '' : 'border-b border-[#F1F5F9]'}`}>
      <span className="text-xs text-[#64748B]">{k}</span>
      <span className="text-sm font-semibold text-[#0F172A]">{v}</span>
    </div>
  );
}
