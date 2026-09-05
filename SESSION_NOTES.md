# Guardian Angel — Session Export / Working Notes

A running record of what was built and decided while developing the OCBC Guardian Angel
prototype (PolyFinTech100 2026, OCBC "Intelligent Banking" track).

---

## What the app is
A four-layer autonomous scam-defence system for OCBC, presented as **three connected
interfaces** — USER (Grace's phone, `/`), STAFF (OCBC Risk Operations Console, `/staff/*`), and
GUARDIAN (Marcus, `/guardian`) — sharing one backend and one reasoning core. See
`docs/ARCHITECTURE.md`. (The presenter-rail cockpit from earlier sessions has been retired;
its reasoning-detail view lives on in the Staff Console's Agent screen.)

- **Layer 1 — Verify Caller:** real time-boxed 4-digit code; simulated OCBC staff console as counterparty.
- **Layer 2 — Recipient network check:** real breach-lookup API (XposedOrNot) + simulated interbank mule-graph.
- **Layer 3 — Smart-Lock:** account-takeover detection → reversible hold + real **Money Lock** fund-sequestration.
- **Layer 4 — Adaptive Care:** AI analysis of weeks of (synthetic) history → 5-level escalation.

## Architecture (the defensible core)
1. **Shared risk context** (`backend/src/riskContext.ts`) — all four layers write signals into ONE
   session store; each layer REPLACES its own signals per run (no accumulation across tests).
2. **Rule table** (`backend/src/rules.ts`) — `SCORE_BANDS` (score→band→actions) + `PATTERN_RULES`
   (named scam archetypes R1–R4). A score matches a band; a matched pattern can floor it higher.
3. **Diversity gate** (`resolveBandWithDiversity` in `rules.ts`) — HIGH/CRITICAL only stands with
   signals across ≥2 **categories**, OR a matched pattern, OR one exceptionally strong indicator;
   else capped to MEDIUM. This enforces the confirmed doc's "amount alone is not high risk."
4. **Claude recommends, policy engine enforces** — the AI (`reason.ts` → `claude-sonnet-5`) gives an
   independent second-opinion score (can only RAISE, `final = max(rules, AI)`) and picks an action;
   `policy.ts` clamps out-of-envelope recommendations (both directions) — the AI never blocks money directly.

## Signal categories (the 5 families from the confirmed spec)
`transaction · behavioural · device_security · recipient_network · identity · context` — every signal
is tagged; the diversity gate and the rail's "N signal families" badge use these.

---

## Key decisions made this session
- **UI = full cockpit** (`/`), OCBC-native phone + premium rail, strict separation: phone shows no
  scores/AI/technical detail; all AI detail lives in the rail.
- **AI = `claude-sonnet-5`**, second-opinion-can-only-raise scoring; **Demo mode is fully deterministic**
  (AI skipped), Live mode floors at the deterministic score.
- **Money Lock built for real** (Feature 3 gap closed): `moveToMoneyLock()` preserves an essential
  operating balance; shown on phone + Cards tab + rail.
- **Refined to match the confirmed DOCX** ("Final Refined Technical Solution"): signal categories +
  diversity gate + explainable reason codes; band label aligned to "MEDIUM".
- **Customer copy = short.** Buttons standardised to **Confirm & send** (proceed) vs **Cancel / Stop
  transfer** (don't send). AI customer messages constrained to one short sentence; specifics shown as
  **"Why we're asking"** bullets from the real signals; frontend `clampText` hard-caps length.

## Honesty boundary (say this to judges)
- **Real:** all Claude reasoning, the verification-code lifecycle, the XposedOrNot breach lookup, the
  rule engine, the policy enforcement, Money Lock.
- **Simulated (labelled SIMULATED in the rail):** interbank consortium graph, staff console, care history.

---

## Current state
- Backend + frontend both typecheck / build clean.
- Live AI works (`ANTHROPIC_API_KEY` is set in `backend/.env`; `/api/engine` → `liveConfigured:true`).
  Live calls take ~15–25s (two sequential model calls, new-key tier) — **run the demo in Demo mode**
  for instant/reproducible results, switch to Live for the "it's real" moment.
- `thinking:{type:'disabled'}` on decision calls + 25s timeout (sonnet-5 defaults thinking on).
- Validated against the doc's Table 5: large-transfer-alone → capped MEDIUM; account-takeover / mule /
  social-engineering → CRITICAL; golden David Lim S$15k → CRITICAL.

## How to run
```
cd "OCBC FinTech/backend"  && npm run dev      # http://localhost:4000
cd "OCBC FinTech/frontend" && npm run dev      # http://localhost:5173/menu — launcher for all 3 interfaces
```
`/` = customer app, `/staff/login` = Risk Operations Console (demo creds `ops001` /
`guardian2026`), `/guardian` = Marcus. Everything is in-memory — restart the backend to reset
all stores (account, risk context, registry, case log) between full demo runs. If live calls
silently fall back, kill stray node processes (they accumulate) and restart the backend.

## Golden demo scenario
Suspicious caller → Verify Caller fails → new recipient **David Lim** → network flag → **S$15,000**
transfer → Guardian Angel evaluates → phone shows protection + cooling-off (+ Money Lock on takeover
signals) → rail shows signals, families, matched rules, "Why this action?", Marcus alert → specialist.

## Three-interface restructure (this pass)
The single cockpit (phone + presenter rail) was reorganised into three connected interfaces —
see `docs/ARCHITECTURE.md` for the full picture:
- **USER** (`/`) — Grace's phone, standalone, no rail, no scores. Verify Caller (`/user/verify`)
  and Adaptive Care (`/user/care`) reachable as compact in-app entry points.
- **STAFF** (`/staff/*`) — new OCBC Risk Operations Console: prototype-only login → dashboard →
  Case Log → Case Investigation → Risk Account Registry, fresh light enterprise theme, separate
  from the customer's OCBC-red visual language.
- **GUARDIAN** (`/guardian`) — Marcus, unchanged, kept separate as its own interface.

New backend: `registry.ts` (Risk Account Registry, SIMULATED — prototype intelligence, idempotent
upsert) and `cases.ts` (Scam Case Log, dedup-aware). `agent.ts` now cross-references the registry
on every transfer as a real `recipient_network` signal. Staff confirming a case as a scam writes
back to the registry — the feedback loop — verified live end-to-end through the actual UI:
David Lim watchlist (score 96, CRITICAL) → staff confirms → blacklisted → re-run scores 100.
See `docs/DEMO_FLOW.md` for the full walkthrough and `docs/RISK_MODEL.md` for the worked numbers.

## Outstanding / not yet done
- Model thresholds are reasonable hand-set defaults, not calibrated on real fraud data (by design).
- Everything is in-memory / session-scoped — no database (see `docs/HONESTY_BOUNDARY.md` for the
  production roadmap this implies).
