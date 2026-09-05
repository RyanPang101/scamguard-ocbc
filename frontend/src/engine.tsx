import { useEffect, useState } from 'react';
import { getEngineStatus } from './api';

/*
  Judge-facing engine control. Every layer that calls the model reads `demo` from here so a
  judge can force the deterministic fallback and watch it fail over honestly. `liveConfigured`
  reflects whether the backend actually has an ANTHROPIC_API_KEY — if not, we never pretend
  Live AI is available.
*/

const KEY = 'ga-demo-mode';

export function useEngine() {
  const [demo, setDemo] = useState<boolean>(() => localStorage.getItem(KEY) === '1');
  const [liveConfigured, setLiveConfigured] = useState<boolean>(true);

  useEffect(() => {
    getEngineStatus().then((s) => setLiveConfigured(s.liveConfigured));
  }, []);

  function set(v: boolean) {
    setDemo(v);
    localStorage.setItem(KEY, v ? '1' : '0');
  }

  return { demo, setDemo: set, liveConfigured };
}

export function EngineToggle({
  demo,
  setDemo,
  liveConfigured,
}: {
  demo: boolean;
  setDemo: (v: boolean) => void;
  liveConfigured: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-lg bg-black/40 border border-white/10 p-0.5">
        {[
          { k: false, label: 'Live AI' },
          { k: true, label: 'Demo' },
        ].map(({ k, label }) => (
          <button
            key={label}
            onClick={() => setDemo(k)}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition ${
              demo === k ? 'bg-white text-navy-deep' : 'text-white/60 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {!liveConfigured && (
        <span className="text-[10px] text-agent-red font-semibold">
          no API key — Live falls back
        </span>
      )}
    </div>
  );
}

export function SourceBadge({ source }: { source: 'live' | 'cached_fallback' }) {
  const live = source === 'live';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full ${
        live ? 'bg-agent-green/15 text-agent-green' : 'bg-white/10 text-white/60'
      }`}
      title={
        live
          ? 'This result came from a live Claude API call.'
          : 'This result came from the deterministic fallback (Demo mode, or the live call failed/timed out).'
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-agent-green' : 'bg-white/40'}`} />
      {live ? 'Live Claude' : 'Deterministic fallback'}
    </span>
  );
}
