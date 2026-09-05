import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { SquaresFour, FolderOpen, ShieldWarning, SignOut } from '@phosphor-icons/react';
import { STAFF_TOKEN_KEY } from './StaffLogin';

interface StaffSession {
  token: string;
  staffName?: string;
  role?: string;
}

function readSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(STAFF_TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StaffSession) : null;
  } catch {
    return null;
  }
}

const NAV = [
  { to: '/staff/dashboard', label: 'Dashboard', icon: SquaresFour },
  { to: '/staff/cases', label: 'Case Log', icon: FolderOpen },
  { to: '/staff/registry', label: 'Risk Registry', icon: ShieldWarning },
];

// Fresh enterprise theme, deliberately distinct from the OCBC-red customer phone and the dark
// navy presenter rail — a light, data-dense admin console (the "internal system" register).
export default function StaffLayout() {
  const [session, setSession] = useState<StaffSession | null | 'loading'>('loading');
  const navigate = useNavigate();

  useEffect(() => {
    setSession(readSession());
  }, []);

  if (session === 'loading') return null;
  if (!session) return <Navigate to="/staff/login" replace />;

  function logout() {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    navigate('/staff/login');
  }

  return (
    <div className="min-h-screen flex bg-[#F1F5F9]">
      <aside className="w-56 shrink-0 bg-[#0F172A] text-white flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="font-extrabold text-sm tracking-tight">OCBC Risk Operations</div>
          <div className="text-[10.5px] text-white/40 mt-0.5">Staff Console</div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-5 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-white/10 text-white border-r-2 border-[#6366F1]' : 'text-white/55 hover:text-white/85 hover:bg-white/5'
                }`
              }
            >
              <item.icon size={16} weight="bold" /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <div className="text-xs font-bold text-white/85">{session.staffName ?? 'Staff'}</div>
          <div className="text-[10.5px] text-white/40 mb-2.5">{session.role ?? 'Risk Operations Analyst'}</div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 hover:text-white/80 transition"
          >
            <SignOut size={13} weight="bold" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
