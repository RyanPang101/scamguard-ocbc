import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { DeviceMobile, Bell, Broadcast, FolderOpen, SquaresFour } from '@phosphor-icons/react';
import UserCockpit from './pages/user/UserCockpit';
import Grace from './pages/user/Grace';
import VerifyCaller from './pages/user/VerifyCaller';
import Care from './pages/user/Care';
import Marcus from './pages/guardian/Marcus';
import Agent from './pages/staff/Agent';
import StaffLogin from './pages/staff/StaffLogin';
import StaffLayout from './pages/staff/StaffLayout';
import StaffDashboard from './pages/staff/StaffDashboard';
import CaseLog from './pages/staff/CaseLog';
import CaseInvestigation from './pages/staff/CaseInvestigation';
import RiskRegistry from './pages/staff/RiskRegistry';

// Three connected interfaces (see docs/ARCHITECTURE.md): USER (customer cockpit, "/"), STAFF
// (OCBC Risk Operations Console, "/staff/*"), GUARDIAN (trusted-contact, "/guardian"). "/menu"
// is a judge-convenience launcher, not a fourth interface.
const CARDS = [
  {
    to: '/',
    icon: DeviceMobile,
    title: 'USER — Customer Cockpit',
    desc: "Grace's unified OCBC app: transfer, Verify Caller, Adaptive Care — one interface.",
    accent: true,
  },
  {
    to: '/staff/login',
    icon: FolderOpen,
    title: 'STAFF — Risk Operations Console',
    desc: 'Login → dashboard → case log → investigation → Risk Account Registry.',
    accent: true,
  },
  {
    to: '/guardian',
    icon: Bell,
    title: 'GUARDIAN — Marcus',
    desc: 'Guardian Contact notifications — informed, never in charge.',
    accent: true,
  },
  {
    to: '/staff/dashboard',
    icon: Broadcast,
    title: 'Reasoning detail (staff)',
    desc: 'Watch the deterministic + AI reasoning loop run live, in depth.',
    accent: false,
  },
];

function Home() {
  return (
    <div className="min-h-screen bg-mesh text-white flex flex-col items-center justify-center gap-10 p-10">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-white/50 mb-5 tracking-wide uppercase">
          OCBC · PolyFinTech100 · Autonomous AI Track
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
          Guardian Angel
        </h1>
        <p className="text-white/50 mt-3 max-w-md mx-auto leading-relaxed">
          A conventional banking system judges the transaction.
          <br />
          Guardian Angel understands the customer.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-5 bg-ocbc-red hover:bg-ocbc-red-dark transition text-white text-sm font-bold px-5 py-2.5 rounded-xl"
        >
          <SquaresFour size={16} weight="bold" /> Open the cockpit
        </Link>
      </div>

      <div className="text-white/25 text-xs -mt-4">Or open any single screen directly:</div>

      <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className={`group rounded-2xl p-6 border transition-all hover:-translate-y-0.5 ${
              c.accent
                ? 'bg-gradient-to-br from-navy-light to-navy border-white/10 hover:border-ocbc-red/40 hover:shadow-lg hover:shadow-ocbc-red/10'
                : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <c.icon size={28} className="mb-3 text-ocbc-red-light" />
            <div className="font-bold text-lg group-hover:text-ocbc-red-light transition">{c.title}</div>
            <div className="text-white/45 text-sm mt-1 leading-relaxed">{c.desc}</div>
          </Link>
        ))}
      </div>

      <div className="text-white/25 text-xs">
        Observe → Interpret → Decide → Act → Explain → Learn
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* USER — unified customer cockpit */}
        <Route path="/" element={<UserCockpit />} />
        <Route path="/user/grace" element={<Grace />} />
        <Route path="/user/verify" element={<VerifyCaller />} />
        <Route path="/user/care" element={<Care />} />

        {/* STAFF — OCBC Risk Operations Console (separate login, fresh enterprise theme) */}
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff" element={<StaffLayout />}>
          <Route path="dashboard" element={<StaffDashboard />} />
          <Route path="cases" element={<CaseLog />} />
          <Route path="cases/:id" element={<CaseInvestigation />} />
          <Route path="registry" element={<RiskRegistry />} />
          <Route path="agent" element={<Agent />} />
        </Route>

        {/* GUARDIAN — trusted-contact interface, kept separate */}
        <Route path="/guardian" element={<Marcus />} />

        {/* Judge-convenience launcher */}
        <Route path="/menu" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
