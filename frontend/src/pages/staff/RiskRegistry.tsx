import { useEffect, useState } from 'react';
import { flagRegistryAccount, getRegistry } from '../../api';
import type { RegistryEntry, RegistryStatus } from '../../types';
import { RegistryStatusBadge } from './shared';

const STATUS_OPTIONS: RegistryStatus[] = ['blacklisted', 'watchlist', 'cleared', 'unknown'];

export default function RiskRegistry() {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [manualAcct, setManualAcct] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualStatus, setManualStatus] = useState<RegistryStatus>('watchlist');
  const [manualCategory, setManualCategory] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setRegistry(await getRegistry());
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  async function handleManualFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!manualAcct.trim()) return;
    setBusy(true);
    await flagRegistryAccount(manualAcct.trim(), manualStatus, manualCategory.trim() || 'Manually flagged by staff');
    setManualAcct('');
    setManualName('');
    setManualCategory('');
    await refresh();
    setBusy(false);
  }

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-xl font-extrabold text-[#0F172A]">Risk Account Registry</h1>
      <p className="text-sm text-[#64748B] mt-1 max-w-2xl">
        Institutional memory of accounts implicated in prior cases — cross-referenced against
        every new transfer's recipient.
      </p>
      <div className="inline-block text-[10px] font-extrabold tracking-wide text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-full px-2.5 py-1 mt-2 mb-6">
        SIMULATED — PROTOTYPE INTELLIGENCE, NOT REAL OCBC DATA
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] text-left text-[10.5px] font-extrabold text-[#64748B] uppercase tracking-wide">
                  <th className="px-5 py-3">Account</th>
                  <th className="px-4 py-3">Name / Bank</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Reports</th>
                  <th className="px-4 py-3">Last flagged</th>
                  <th className="px-4 py-3">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {registry.map((r) => (
                  <tr key={r.acct} className="hover:bg-[#F8FAFC] transition">
                    <td className="px-5 py-3 font-mono text-xs text-[#0F172A]">{r.acct}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#0F172A]">{r.name}</div>
                      <div className="text-[11px] text-[#94A3B8]">{r.bank}</div>
                    </td>
                    <td className="px-4 py-3">
                      <RegistryStatusBadge status={r.riskStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[#64748B] max-w-[220px] truncate" title={r.category}>
                      {r.category}
                    </td>
                    <td className="px-4 py-3 text-[#0F172A] font-semibold">{r.reportsCount}</td>
                    <td className="px-4 py-3 text-xs text-[#64748B]">
                      {r.lastFlagged ? new Date(r.lastFlagged).toLocaleDateString('en-SG') : '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0F172A]">{r.registryRiskScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-5 h-fit">
          <div className="text-sm font-extrabold text-[#0F172A] mb-1">Manually flag an account</div>
          <div className="text-[11px] text-[#94A3B8] mb-4 leading-relaxed">
            Upserts the registry — the same write path a confirmed case's feedback loop uses.
          </div>
          <form onSubmit={handleManualFlag} className="flex flex-col gap-2.5">
            <input
              value={manualAcct}
              onChange={(e) => setManualAcct(e.target.value)}
              placeholder="Account (e.g. •••• 1234)"
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-xs outline-none focus:border-[#4F46E5]"
            />
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Account holder name (optional)"
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-xs outline-none focus:border-[#4F46E5]"
            />
            <select
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value as RegistryStatus)}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-xs outline-none focus:border-[#4F46E5]"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              value={manualCategory}
              onChange={(e) => setManualCategory(e.target.value)}
              placeholder="Reason / category"
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-xs outline-none focus:border-[#4F46E5]"
            />
            <button
              type="submit"
              disabled={busy || !manualAcct.trim()}
              className="mt-1 bg-[#1E293B] hover:bg-[#0F172A] transition text-white font-bold text-xs rounded-lg py-2.5 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save to registry'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
