import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCases, getRegistry, getStaffMetrics } from '../../api';
import type { Case, RegistryEntry, StaffMetrics } from '../../types';
import { RiskBadge, RegistryStatusBadge } from './shared';

export default function StaffDashboard() {
  const [metrics, setMetrics] = useState<StaffMetrics | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);

  useEffect(() => {
    const poll = async () => {
      const [m, c, r] = await Promise.all([getStaffMetrics(), getCases(), getRegistry()]);
      if (m) setMetrics(m);
      setCases(c);
      setRegistry(r);
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, []);

  const tiles: [string, number | string, string][] = [
    ['Open cases', metrics?.openCases ?? '—', '#4F46E5'],
    ['Confirmed scams', metrics?.confirmedScams ?? '—', '#DC2626'],
    ['High-risk accounts', metrics?.highRiskAccounts ?? '—', '#D97706'],
    [
      'Funds under protection',
      metrics ? `S$${metrics.fundsProtected.toLocaleString()}` : '—',
      '#059669',
    ],
  ];

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-xl font-extrabold text-[#0F172A]">Dashboard</h1>
      <p className="text-sm text-[#64748B] mt-1 mb-6">
        Live view of AI-detected risk across the platform this session.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-[#E2E8F0] shadow-sm">
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide mb-2">{label}</div>
            <div className="text-2xl font-extrabold" style={{ color: tone }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-[#0F172A]">Recent cases</h2>
            <Link to="/staff/cases" className="text-xs font-bold text-[#4F46E5]">
              View all →
            </Link>
          </div>
          {cases.length === 0 ? (
            <div className="p-6 text-sm text-[#94A3B8]">No cases yet this session.</div>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {cases.slice(0, 6).map((c) => (
                <Link
                  key={c.caseId}
                  to={`/staff/cases/${c.caseId}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#F8FAFC] transition"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#0F172A]">{c.counterparty.name}</div>
                    <div className="text-[11px] text-[#94A3B8]">
                      S${c.amount.toLocaleString()} · {new Date(c.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <RiskBadge level={c.riskLevel} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-[#0F172A]">Top flagged accounts</h2>
            <Link to="/staff/registry" className="text-xs font-bold text-[#4F46E5]">
              Registry →
            </Link>
          </div>
          {registry.filter((r) => r.riskStatus !== 'cleared').length === 0 ? (
            <div className="p-6 text-sm text-[#94A3B8]">No flagged accounts.</div>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {registry
                .filter((r) => r.riskStatus !== 'cleared')
                .slice(0, 6)
                .map((r) => (
                  <div key={r.acct} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="text-sm font-semibold text-[#0F172A]">{r.name}</div>
                      <div className="text-[11px] text-[#94A3B8]">
                        {r.bank} {r.acct} · {r.reportsCount} report{r.reportsCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <RegistryStatusBadge status={r.riskStatus} />
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-[10.5px] text-[#94A3B8] mt-8 max-w-lg leading-relaxed">
        SIMULATED — PROTOTYPE INTELLIGENCE. Cases and the Risk Account Registry are in-memory,
        session-scoped, and generated by this prototype's own scoring engine — not a connection
        to any real OCBC or industry data.
      </div>
    </div>
  );
}
