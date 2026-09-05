# Honesty Boundary — real vs simulated vs static demo data

Say this plainly if judges ask "is this real?" — different parts of the system have genuinely
different answers, and the UI/code label them accordingly.

## Real
- **Claude reasoning** — every AI call (transfer recommendation, second-opinion score, network
  verdict, care analysis) is a genuine live API call to `claude-sonnet-5` when a key is
  configured, with an honestly-labelled cached fallback on error/timeout (`source` field).
- **Verification-code lifecycle** — a real time-boxed 4-digit code, checked server-side.
- **XposedOrNot breach lookup** — a real HTTP call to a free public breach-analytics API when a
  contact email is supplied for a recipient.
- **The deterministic rule engine** — signal weights, score bands, pattern rules, the diversity
  gate, the policy engine's enforcement — all real code, not mocked.
- **Money Lock** — real fund sequestration against the in-memory account balance.
- **The staff feedback loop** — a staff decision genuinely rewrites the registry, and the next
  scoring run genuinely reads the updated state. This is real code executing a real write/read
  cycle; what's synthetic is the *starting data*, not the mechanism.

## SIMULATED (clearly labelled in the UI and API responses)
- **Interbank consortium mule-graph** (`network.ts`) — no hackathon team has access to a real
  interbank fraud consortium; this is a deterministic simulation, labelled `source: 'simulated'`.
- **The Risk Account Registry** (`registry.ts`) — in-memory, seeded with a handful of demo
  accounts, updated only by this prototype's own staff actions this session. Labelled
  **"SIMULATED — PROTOTYPE INTELLIGENCE"** everywhere it reaches the UI. It is NOT a connection
  to any real OCBC or industry blacklist.
- **The Scam Case Log** (`cases.ts`) — generated entirely by this prototype's own scoring
  engine, in-memory, session-scoped.
- **Verify Caller's staff-console counterparty** — the verification code logic is real; the
  "OCBC employee" reading it back is a simulated second view of the same real backend state.
- **Adaptive Care's history** — a synthetic multi-week event dataset, analysed by a real
  Claude call.

## Explicitly prototype-only
- **Staff Console authentication** — a single fixed demo credential pair
  (`ops001` / `guardian2026`) checked server-side, with a token stashed in `localStorage` purely
  to gate client-side routing. No password hashing, no real session store, no MFA. This never
  represents production OCBC authentication and is labelled as such on the login screen itself.

## Everything resets on server restart
All stores (`accounts.ts`, `registry.ts`, `cases.ts`, `riskContext.ts`) are in-memory. There is
no database in this prototype. This is a deliberate scope decision, not an oversight — see
FILE_STRUCTURE.md for what a production build would add.
