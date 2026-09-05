import { Link } from 'react-router-dom';
import { ShieldCheck, HeartStraight } from '@phosphor-icons/react';
import { GracePhone } from './Grace';

/*
  USER interface — the unified OCBC customer cockpit. One screen: Grace's phone, standalone.

  This deliberately shows NO scores, AI detail, or presenter rail — that separation already
  existed (the rail was always a Guardian-Angel-only surface) and is preserved here by simply
  not rendering it. Verify Caller and Adaptive Care are reachable as compact in-app entry
  points rather than being buried behind the old side-by-side cockpit, folding the customer
  experience into one coherent app instead of scattered demo routes.
*/
export default function UserCockpit() {
  return (
    <div className="min-h-screen bg-mesh flex flex-col items-center justify-center gap-5 p-6 sm:p-10">
      <div className="w-full max-w-sm flex items-center justify-between px-1">
        <Link to="/menu" className="text-white/35 hover:text-white/60 text-xs transition">
          ← All screens
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/user/verify"
            className="flex items-center gap-1.5 text-white/45 hover:text-white/75 text-xs font-semibold transition"
          >
            <ShieldCheck size={13} weight="bold" /> Verify a caller
          </Link>
          <Link
            to="/user/care"
            className="flex items-center gap-1.5 text-white/45 hover:text-white/75 text-xs font-semibold transition"
          >
            <HeartStraight size={13} weight="bold" /> Financial care
          </Link>
        </div>
      </div>

      <GracePhone />

      <div className="text-center text-[10px] text-white/25 max-w-xs leading-relaxed">
        Guardian Angel is protecting this account. Prototype concept — not an official OCBC application.
      </div>
    </div>
  );
}
