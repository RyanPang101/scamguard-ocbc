# Guardian Angel — Prototype Build Spec

## What we're building
A **web app for a live, on-stage hackathon demo** that proves an **autonomous AI backend** can intercept a scam transfer in real time. The emotional peak of the demo is two phone views side by side: an elderly customer (Grace) initiates a S$50,000 transfer, and an AI agent reasons over the context, **chooses** the proportionate intervention, places a temporary hold, and alerts her son (Marcus) — all visibly, in seconds.

This is NOT a real banking system. It is a convincing demonstration of the decision loop:
**Observe → Interpret → Decide → Act → Explain → Learn.**

The single most important design principle: **the AI's autonomy is in the DECISION to intervene, not in overriding the customer.** Grace remains the decision-maker. Marcus is a safety net, not a controller. The agent can warn, pause, hold (temporarily), and escalate to a human — it must never seize, freeze permanently, or move money on its own.

---

## Tech stack
- **React + Vite** (TypeScript preferred)
- **Tailwind CSS** for styling (OCBC look: clean, dark navy `#0A1628` panels, OCBC red `#E30613` accents, white text)
- **A small Node/Express backend** that holds the Anthropic API key and runs the agent loop. The key must NEVER be in front-end code.
- **Anthropic SDK** (`@anthropic-ai/sdk`) on the backend, using **tool use / function calling** so the model selects actions.
- State can live in memory (no database needed for the demo).

---

## The four views (routes)
Render them so two can sit side by side in two browser windows.

1. **`/grace` — Grace's phone**
   - A phone-frame mockup of the OCBC app.
   - A transfer screen: recipient name, amount field (pre-filled S$50,000, but EDITABLE so a judge can change it), "Transfer" button.
   - After submitting, this screen displays whatever the agent decided: a contextual warning, a verification prompt, or a hold notice with a plain-language explanation.

2. **`/marcus` — Marcus's phone**
   - A phone-frame mockup showing a notification feed.
   - When the agent decides to alert the Guardian Contact, an alert appears here in real time (poll the backend every ~1.5s, or use SSE/websocket).
   - The alert is INFORMATIONAL — Marcus is told what happened; he is not given a button to approve/deny Grace's money.

3. **`/agent` — The agent panel (the showpiece)**
   - A "behind the glass" view of the loop running live.
   - Show each step lighting up: **Observe** (the context the agent received), **Interpret/Decide** (the tool the model chose + its reasoning), **Act** (what was executed), **Explain** (the message generated).
   - Show the risk tier the agent settled on: LOW / MEDIUM / HIGH / CRITICAL.
   - Include a visible "thinking…" state during the live API call.

4. **`/specialist` — Fraud-specialist console (optional, build last)**
   - Where a CRITICAL case lands. Shows the flagged transaction and the agent's reasoning, with a human "Confirm scam / Mark safe" action — reinforcing that final authority is human.

---

## The risk tiers (least-restrictive intervention)
These map to the pitch deck. The agent must choose the LEAST restrictive safe action.

| Tier | When | Action the agent takes |
|------|------|------------------------|
| **LOW** | Normal-looking activity | `allow_transaction` + optional gentle note. No disruption. |
| **MEDIUM** | One or two mild anomalies | `issue_warning` — a contextual heads-up; transaction proceeds with awareness. |
| **HIGH** | New recipient + unusual amount + recent behavioral shift | `place_hold` (TEMPORARY) + `alert_guardian` (per Grace's permissions). |
| **CRITICAL** | Strong scam signature / very high loss exposure | `place_hold` + `alert_guardian` + `escalate_to_specialist`. |

---

## The autonomous backend (this is the core — do not shortcut it)
The backend exposes `POST /assess`. It receives a transaction context and runs an **agent loop using Anthropic tool use**. The MODEL decides which tool(s) to call — the decision must live in the model, not in hard-coded `if` statements. A rule-based risk *score* may be computed and passed in as ONE input the model considers, but the final action selection routes through the model.

### Transaction context schema (the "Observe" input)
```json
{
  "amount": 50000,
  "currency": "SGD",
  "recipient_is_new": true,
  "recipient_name": "string",
  "customer": {
    "name": "Grace",
    "age": 68,
    "typical_transfer_max": 2000,
    "recent_investment_liquidation": true,
    "guardian_contact": "Marcus",
    "guardian_permissions": ["notify", "participate_in_verification"]
  },
  "rule_based_risk_hint": "high",
  "prior_outcomes": []
}
```

### Tools to define for the model (the action space)
Define these as Anthropic tools. Note the bounded-autonomy design — there is deliberately NO tool that seizes or permanently freezes funds.

- `allow_transaction` — let it proceed. params: `{ reason }`
- `issue_warning` — show Grace a contextual warning, transaction continues. params: `{ message_to_grace, reason }`
- `request_verification` — add a verification step + short pause. params: `{ verification_prompt, reason }`
- `place_hold` — TEMPORARILY hold the transaction pending review (reversible). params: `{ message_to_grace, reason }`
- `alert_guardian` — notify the Guardian Contact per permissions. params: `{ message_to_marcus, reason }`
- `escalate_to_specialist` — route to a human fraud specialist. params: `{ case_summary, reason }`

The model may call MORE THAN ONE tool (e.g. HIGH = place_hold + alert_guardian). The backend executes each chosen tool: updates Grace's view, pushes Marcus's alert, logs to the agent panel.

### System prompt for the agent (use this as a starting point)
```
You are Guardian Angel, an autonomous financial-care agent for OCBC, protecting
elderly banking customers from authorised-push-payment scams.

You are given the full context of a transaction the customer is attempting. Your
job is to decide the SAFEST, LEAST-RESTRICTIVE intervention by selecting from the
available tools. You are the decision-maker for the intervention — do not defer to
a fixed rule; reason over the specific customer's context.

Core principles you must never violate:
- The customer remains in control of their own money. You may warn, pause, hold
  temporarily, and alert their nominated Guardian Contact, then hand off to a human
  specialist. You must NEVER permanently seize or freeze funds, and you must never
  give the Guardian Contact authority over the customer's account.
- Choose the LEAST restrictive action that is still safe. A contextual warning is
  better than a hold if a warning is sufficient.
- The Guardian Contact is a safety net who is informed, not a person who approves
  or denies the customer's transactions.
- You do not diagnose medical or cognitive conditions. You identify possible
  financial vulnerability, exploitation, confusion, or a major life change.

When you act, always produce a plain-language explanation a 68-year-old can
understand, free of jargon. Explain WHY you intervened, kindly and clearly.

Decide which tool(s) to call now.
```

### Explain step
The plain-language messages to Grace and Marcus should come from the model's tool
call params (`message_to_grace`, `message_to_marcus`) — i.e. genuinely AI-generated,
not hard-coded. Surface them in the relevant views and in the agent panel.

### Learn step (lightweight for demo)
After Grace confirms "yes, I was being scammed," append the outcome to an in-memory
`prior_outcomes` log and include it as context on the next `/assess` call, so you can
SHOW that past outcomes inform future decisions. No model training required.

---

## Stage-reliability requirements (critical — conference wifi WILL be flaky)
- Build a **DEMO MODE** toggle with a fixed Grace scenario that runs identically every time.
- **Cache a known-good agent response** for the scripted Grace scenario. On `/assess`,
  attempt the live Anthropic call first; if it errors or times out (e.g. >6s), fall back
  to the cached response so the on-stage run never breaks. The audience cannot tell.
- Keep all timings smooth and deliberate (small artificial delays are fine so the
  loop is legible to the audience).

---

## Build order (so there's always something demoable)
1. Scaffold Vite + React + Tailwind + Express. Two empty phone frames side by side.
2. Hard-code Grace's happy path end to end (transfer → hold → explanation → Marcus alert). PROTECT THIS as the fallback.
3. Build the real agent backend with tool use; wire `/assess` so the MODEL chooses the action.
4. Connect live AI-generated explanations into Grace's and Marcus's views.
5. Build the `/agent` panel visualization (the showpiece) + synchronized Marcus alert.
6. Add demo mode, cached fallback, OCBC polish. Build `/specialist` if time allows.

## Definition of done
A judge can: open Grace's and Marcus's phones side by side, watch Grace attempt
S$50,000, see the agent panel reason and CHOOSE to hold + alert, read an AI-generated
plain-language explanation on Grace's phone and an alert on Marcus's — and then CHANGE
the amount to S$200 and watch the agent choose a lighter intervention. That contrast
is the proof of autonomy.
