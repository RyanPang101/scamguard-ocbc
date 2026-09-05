import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export default function PhoneFrame({
  label,
  sublabel,
  light,
  children,
}: {
  label: string;
  sublabel?: string;
  light?: boolean;
  children: ReactNode;
}) {
  const [time, setTime] = useState(() => formatTime());

  useEffect(() => {
    const t = setInterval(() => setTime(formatTime()), 30_000);
    return () => clearInterval(t);
  }, []);

  const statusColor = light ? 'text-ink' : 'text-white';
  const screenBg = light ? 'bg-app-bg' : 'bg-navy';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <div className="text-white text-base font-semibold tracking-wide">{label}</div>
        {sublabel && <div className="text-white/40 text-xs mt-0.5">{sublabel}</div>}
      </div>

      <div className="relative">
        <div className="absolute -inset-3 rounded-[52px] bg-gradient-to-b from-white/10 to-transparent blur-xl opacity-50 pointer-events-none" />
        <div className="relative w-[380px] h-[800px] rounded-[46px] bg-gradient-to-b from-[#2a2d35] to-[#15171c] p-[3px] shadow-2xl">
          <div className="w-full h-full rounded-[43px] bg-black p-2">
            <div className={`relative w-full h-full rounded-[36px] overflow-hidden ${screenBg} flex flex-col`}>
              <div className={`relative h-11 flex items-center justify-between px-7 text-xs font-medium shrink-0 z-20 ${statusColor}`}>
                <span>{time}</span>
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full" />
                <div className="flex items-center gap-1.5">
                  <SignalIcon light={light} />
                  <WifiIcon light={light} />
                  <BatteryIcon light={light} />
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime() {
  return new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function SignalIcon({ light }: { light?: boolean }) {
  const fill = light ? '#1A1A1A' : 'white';
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
      <rect x="0" y="6" width="3" height="5" rx="0.5" fill={fill} />
      <rect x="4.5" y="4" width="3" height="7" rx="0.5" fill={fill} />
      <rect x="9" y="2" width="3" height="9" rx="0.5" fill={fill} />
      <rect x="13.5" y="0" width="3" height="11" rx="0.5" fill={fill} />
    </svg>
  );
}
function WifiIcon({ light }: { light?: boolean }) {
  const stroke = light ? '#1A1A1A' : 'white';
  return (
    <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
      <path d="M7.5 9.5a1 1 0 100-2 1 1 0 000 2z" fill={stroke} />
      <path d="M4.8 6.3a3.8 3.8 0 015.4 0" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M2.3 3.8a7.2 7.2 0 0110.4 0" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function BatteryIcon({ light }: { light?: boolean }) {
  const stroke = light ? '#1A1A1A' : 'white';
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
      <rect x="0.5" y="0.5" width="20" height="11" rx="2.5" stroke={stroke} strokeOpacity="0.5" />
      <rect x="2" y="2" width="17" height="8" rx="1.5" fill={stroke} />
      <rect x="21.5" y="3.5" width="1.5" height="5" rx="0.7" fill={stroke} fillOpacity="0.5" />
    </svg>
  );
}
