import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { staffLogin } from '../../api';

/*
  Staff Console gate — PROTOTYPE-ONLY authentication. A fixed demo credential pair checked by
  the backend (server.ts STAFF_DEMO_CREDENTIALS) and a token stashed in localStorage purely to
  gate client-side routing. This is NOT production OCBC authentication — no hashing, no real
  session, no MFA. See docs/HONESTY_BOUNDARY.md.
*/
export const STAFF_TOKEN_KEY = 'ga_staff_session';

export default function StaffLogin() {
  const [staffId, setStaffId] = useState('ops001');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await staffLogin(staffId.trim(), password);
    setLoading(false);
    if (res.ok && res.token) {
      localStorage.setItem(STAFF_TOKEN_KEY, JSON.stringify({ token: res.token, staffName: res.staffName, role: res.role }));
      navigate('/staff/dashboard');
    } else {
      setError(res.error ?? 'Invalid staff ID or password');
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1220] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link to="/menu" className="text-white/35 hover:text-white/60 text-xs transition mb-6 inline-block">
          ← All screens
        </Link>
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#1E293B] flex items-center justify-center text-white">
              <ShieldCheck size={18} weight="bold" />
            </div>
            <div>
              <div className="font-extrabold text-[15px] text-[#0F172A] leading-tight">OCBC Risk Operations</div>
              <div className="text-[11px] text-[#64748B]">Staff Console · internal use only</div>
            </div>
          </div>
          <div className="text-[10.5px] text-[#94A3B8] mb-6 mt-1 leading-relaxed">
            PROTOTYPE AUTHENTICATION — demo credentials only, not a production OCBC login.
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-bold text-[#334155]">Staff ID</label>
              <input
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full mt-1.5 px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#334155]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="guardian2026"
                className="w-full mt-1.5 px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm outline-none focus:border-[#4F46E5]"
              />
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-[#DC2626] text-xs font-semibold">
                <WarningCircle size={14} weight="bold" /> {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-[#1E293B] hover:bg-[#0F172A] transition text-white font-bold text-sm rounded-lg py-2.5 disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="text-[10px] text-[#94A3B8] mt-4 text-center">
            Demo credentials: <b>ops001</b> / <b>guardian2026</b>
          </div>
        </div>
      </div>
    </div>
  );
}
