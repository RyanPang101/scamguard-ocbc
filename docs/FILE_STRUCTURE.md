# File Structure

Light grouping by interface — moved files, fixed imports, did **not** restructure into a deeper
monorepo layout (a running Vite app made a full `frontend/user`/`frontend/staff`/`frontend/guardian`
top-level split needless risk right before a demo; grouping under `pages/` gets the same clarity).

```
backend/src/
  registry.ts        Risk Account Registry (SIMULATED) — lookup, idempotent upsert
  cases.ts            Scam Case Log — dedup-aware upsertCase, reviewCase (feedback loop)
  agent.ts            orchestrates one transfer assessment; now cross-references the registry
  riskContext.ts       shared signal store — one per session, replaced per layer per run
  rules.ts             SCORE_BANDS + PATTERN_RULES + diversity gate — the rule table
  reasoningEngine.ts    AI second opinion, final = max(deterministic, AI)
  policy.ts             direction-aware enforcement of the recommended action
  reason.ts              the one function that calls Claude; live/cached-fallback + timeout
  network.ts, care.ts, verify.ts    the other three defence layers (unchanged this pass)
  accounts.ts             payees, transactions, Money Lock
  server.ts               Express routes — /api/assess, /api/staff/*, /api/cases/*, /api/registry/*
  types.ts                 every shared type, including Case / RegistryEntry added this pass

frontend/src/
  pages/user/          Grace.tsx (phone), UserCockpit.tsx (route shell, no rail),
                        VerifyCaller.tsx, Care.tsx
  pages/staff/          StaffLogin.tsx, StaffLayout.tsx (nav shell + auth gate),
                         StaffDashboard.tsx, CaseLog.tsx, CaseInvestigation.tsx,
                         RiskRegistry.tsx, Agent.tsx (reasoning detail), shared.tsx (badges)
  pages/guardian/        Marcus.tsx
  App.tsx                 routes: "/" user, "/staff/*" staff (behind StaffLayout's auth gate),
                           "/guardian" guardian, "/menu" judge-convenience launcher
  api.ts, types.ts         mirror the backend's Case / RegistryEntry / staff endpoints

docs/
  ARCHITECTURE.md   RISK_MODEL.md   DATA_MODEL.md   AI_INTEGRATION.md
  DEMO_FLOW.md      HONESTY_BOUNDARY.md   FILE_STRUCTURE.md (this file)
```

## What did NOT move
Every reasoning-core file (`rules.ts`, `riskContext.ts`, `reasoningEngine.ts`, `policy.ts`,
`reason.ts`, `tools.ts`, `network.ts`, `care.ts`, `verify.ts`) is untouched except the single
registry cross-reference injection point added to `agent.ts`. The OCBC-red phone visual language
in `Grace.tsx` is byte-for-byte the same component, just relocated.

## Production roadmap (not built — out of hackathon scope, see HONESTY_BOUNDARY.md)
A real deployment would replace every in-memory store with a database (accounts, registry,
cases), replace the demo staff credential with real OCBC SSO, replace the simulated consortium
graph with an actual interbank data-sharing integration, and calibrate the severity weights and
thresholds against real historical fraud data rather than hand-set defaults.
