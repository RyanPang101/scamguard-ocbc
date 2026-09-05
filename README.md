# ScamGuard (Guardian Angel) — Prototype

OCBC hackathon demo proving an autonomous AI backend can intercept a scam transfer in real time.
See `BUILD_SPEC.md` for the full design spec.

## Deploy a public demo (Render)

This repo includes a [`render.yaml`](./render.yaml) Blueprint that deploys the backend (Node/Express)
and frontend (static Vite build) as two free Render web services.

1. Go to [render.com/deploy](https://dashboard.render.com/blueprints) → **New Blueprint Instance** →
   connect this GitHub repo.
2. Render reads `render.yaml` and provisions both services automatically.
3. When prompted, set the `ANTHROPIC_API_KEY` environment variable on the **scamguard-backend**
   service (get a key from [console.anthropic.com](https://console.anthropic.com/settings/keys) —
   optional, the app falls back to deterministic cached responses without one).
4. Once the backend deploys, copy its URL (e.g. `https://scamguard-backend-xxxx.onrender.com`) and
   update `VITE_API_BASE` in `render.yaml` (or directly in the frontend service's env vars on Render)
   to `<that-url>/api`, then trigger a redeploy of **scamguard-frontend** so it points at the right
   backend.
5. Visit the frontend service's `.onrender.com` URL — that's your public demo link.

Free-tier Render services spin down after inactivity and take ~30–60s to wake on the first request —
expect a cold-start delay before a demo, or upgrade to a paid instance for always-on hosting.

## Run it

**Backend** (holds the Anthropic key, runs the agent loop):
```
cd backend
cp .env.example .env   # add your ANTHROPIC_API_KEY (optional — falls back to cached responses without it)
npm install
npm run dev
```
Runs on http://localhost:4000

**Frontend** (Vite dev server proxies `/api` to the backend):
```
cd frontend
npm install
npm run dev
```
Runs on http://localhost:5173

## The cockpit
`/` is the flagship view: Grace's OCBC phone (the hero, left) beside the Guardian Angel
presenter rail (right). The phone speaks OCBC — restrained banking language, no AI branding,
no risk scores or confidence shown to the customer. The rail speaks Guardian Angel — the shared
risk-context signal stack, the policy engine's "why this action?" rationale, the Verify Caller
staff console, and the Marcus alert feed, all polling the same backend state the phone drives.
Single-screen routes (`/grace`, `/verify`, `/care`, `/marcus`, `/agent`, `/specialist`) still
exist under `/menu` for two-monitor or isolated-feature demos.

**Golden scenario:** suspicious caller → Verify Caller fails → new recipient "David Lim" → network
risk signal → S$15,000 transfer → Guardian Angel evaluates → phone shows a native protection
screen and cooling-off → rail shows the accumulated signals, Claude's reasoning, and the policy
engine's proportionality rationale → Marcus alerted → human specialist escalation. Reset the
shared risk context anytime with the "Reset scenario" button in the rail.

## Architecture: shared risk context, Claude recommends, policy engine enforces
All four layers write into one session-scoped **shared risk context**
(`backend/src/riskContext.ts`) instead of reasoning in isolation — Verify Caller, Network check,
Transfer, and Adaptive Care each contribute signals, and it deterministically computes
`riskScore / riskLevel / allowedActions`. **Claude never decides the score and never blocks a
transaction directly** — it receives that packet and recommends one action from the allowed
envelope, with reasoning and a plain-language explanation. The **policy engine**
(`backend/src/policy.ts`) is the sole enforcer: if Claude's recommendation exceeds what the risk
level permits, the policy engine clamps it to the most restrictive *allowed* action instead — a
real, code-level false-positive guardrail, not just narration. That downgrade (when it happens)
is surfaced verbatim in the rail's "Why this action?" panel.

All four layers route through the shared reasoning engine (`backend/src/reason.ts`) — a real
Claude tool-use call (`claude-sonnet-5`), raced against an 8s timeout, with an honest deterministic
fallback. The `source` field (`live` / `cached_fallback`) is surfaced in the UI on every result.

1. **Verify Caller** (`/verify`, `backend/src/verify.ts`) — a real time-boxed 4-digit code
   (crypto-generated, stored with a 90s expiry, one active session, 3-attempt limit, validated
   server-side). Two panes share the same real backend state: the customer app and a *simulated*
   OCBC staff console. A genuine authenticated agent session sees the live code to read back; an
   impersonator has no session and sees nothing — which is how the customer catches them. On
   mismatch/expiry, the spec's "Caller not verified" copy + the four response actions appear.
2. **Recipient network check** (`/api/network-check`, `backend/src/network.ts`) — runs before the
   transfer is assessed. Combines a **real** live external signal (email data-breach lookup via
   XposedOrNot's free keyless API, tagged `LIVE API`) with a **deterministic simulated** interbank
   consortium graph (tagged `SIMULATED` / "demo scope"). Both are fed to Claude, which returns the
   network-risk verdict + plain-language explanation.
3. **Smart-Lock predictive automation** (`/api/assess`, `backend/src/agent.ts` + `tools.ts`) — the
   original transfer interceptor: the model chooses the least-restrictive action (allow → warn →
   verify → hold + alert guardian → escalate) from a bounded tool space. No seize/permanent-freeze
   tool exists by design.
4. **Adaptive Financial Care** (`/care`, `backend/src/care.ts`) — analyses a **synthetic demo
   history** (labelled `synthetic-demo`) spanning weeks to detect *sustained* drift (escalating
   payments to one recipient, savings liquidation, repeated dismissed warnings) and returns one of
   five escalation levels via a real Claude call. Level ≥4 pushes a Marcus alert.

### Honesty boundary (what's real vs simulated)
- **Real:** every LLM decision (Claude tool use), the verification code lifecycle, and the
  XposedOrNot breach lookup.
- **Simulated (clearly labelled in code and UI):** the OCBC staff counterparty, the interbank
  consortium graph, and the adaptive-care transaction history. Nothing simulated is ever presented
  as live data.

## Routes
- `/grace` — Grace's phone: transfer flow (network check → behavioural assessment)
- `/verify` — Verify Caller two-pane demo (Layer 1)
- `/care` — Adaptive Financial Care escalation (Layer 4)
- `/marcus` — Marcus's phone, alert feed (polls every 1.5s)
- `/agent` — the agent reasoning panel (the showpiece)
- `/specialist` — fraud-specialist console for CRITICAL cases

## Demo & engine toggle
Every AI-backed screen has a **Live AI / Demo** toggle. "Demo" forces the deterministic fallback
so the on-stage run never breaks; "Live AI" makes the real Claude call (needs `ANTHROPIC_API_KEY`).
The toggle state is honest — if no key is configured, the UI says so and Live falls back.

Flagship run: open `/grace` and `/agent` side by side, add a new payee "David Lim" (optionally with
an email to fire the live breach check), send S$15,000 → watch the network check flag a mule pattern,
then the agent hold + alert. Then open `/verify` (uncheck "genuine agent" to play the impersonator)
and `/care` (scenario: grooming drift) to show Layers 1 and 4.
