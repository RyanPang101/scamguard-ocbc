import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCases } from '../../api';
import type { Case } from '../../types';
import { RiskBadge, ReviewStatusBadge } from './shared';

export default function CaseLog() {
  const [cases, setCases] = useState<Case[]>([]);

  useEffect(() => {
    const poll = async () => setCases(await getCases());
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-xl font-extrabold text-[#0F172A]">Scam Case Log</h1>
      <p className="text-sm text-[#64748B] mt-1 mb-6">
        Every transfer Guardian Angel scored MEDIUM or above, or intervened on, this session.
      </p>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] text-left text-[10.5px] font-extrabold text-[#64748B] uppercase tracking-wide">
                <th className="px-5 py-3">Case ID</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Counterparty</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {cases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[#94A3B8]">
                    No cases yet — run a transfer in the customer app to generate one.
                  </td>
                </tr>
              )}
              {cases.map((c) => (
                <tr key={c.caseId} className="hover:bg-[#F8FAFC] transition">
                  <td className="px-5 py-3">
                    <Link to={`/staff/cases/${c.caseId}`} className="font-mono text-xs font-bold text-[#4F46E5]">
                      {c.caseId.slice(-10)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">
                    {new Date(c.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 text-[#0F172A] font-semibold">{c.customer.name}</td>
                  <td className="px-4 py-3 text-[#0F172A]">{c.counterparty.name}</td>
                  <td className="px-4 py-3 font-semibold text-[#0F172A]">S${c.amount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <RiskBadge level={c.riskLevel} />
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748B] max-w-[220px] truncate" title={c.detectionTrigger}>
                    {c.detectionTrigger}
                  </td>
                  <td className="px-4 py-3">
                    <ReviewStatusBadge status={c.reviewStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
