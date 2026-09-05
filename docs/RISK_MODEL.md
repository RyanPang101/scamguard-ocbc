# Risk Model — exact variables, weights, thresholds

Everything here is plain, auditable, hand-computable data (`backend/src/rules.ts`,
`backend/src/riskContext.ts`, `backend/src/agent.ts`, `backend/src/registry.ts`). No AI is
involved in computing the deterministic score — it is a pure function of the signals observed.

## 1. Signal families
Every signal is tagged with one of five families. This tagging drives the diversity gate (§3).

| Family | Examples |
|---|---|
| `transaction` | amount vs typical, % of account balance |
| `behavioural` | new recipient, savings liquidation, overseas payee, warning dismissals |
| `device_security` | new device, OneToken/2FA reset, transfer-limit increase |
| `recipient_network` | mule-graph flags, breach-lookup hits, **Risk Account Registry status** |
| `identity` | caller verification outcome |

## 2. Severity weights and the additive score
Every signal carries a severity; the score is the sum, capped at 100:

| Severity | Weight |
|---|---|
| info | 0 |
| low | 8 |
| medium | 18 |
| high | 30 |

## 3. Score bands and permitted actions

| Band | Score | Permitted actions | Customer treatment |
|---|---|---|---|
| LOW | 0–19 | allow, warn | none / mild note |
| MEDIUM | 20–44 | allow, warn, request verification | contextual warning or one extra question |
| HIGH | 45–69 | warn, verify, hold, alert guardian | step-up verification or reversible hold |
| CRITICAL | 70–100 | hold, alert guardian, escalate to specialist | reversible hold (+ Money Lock if takeover pattern), specialist review |

## 4. Diversity gate — "a large amount alone is never high risk"
A HIGH/CRITICAL score is only allowed to **stand** if the evidence is genuinely diverse:
- signals span **≥2 distinct families**, OR
- a named pattern rule (§5) matched, OR
- one **exceptionally strong** single indicator is present (high-severity `recipient_network`
  or `device_security` signal — e.g. a blacklisted registry hit, or a OneToken reset).

Otherwise a HIGH/CRITICAL score built from a single weak family is capped to MEDIUM
(`diversityCapped: true`, surfaced in both the Staff Console and — historically — the rail).

## 5. Named pattern rules (scam archetypes)
A signal *combination* can floor the band even if the additive score alone wouldn't reach it.

| ID | Name | Floor | Predicate |
|---|---|---|---|
| R1 | Account-Takeover | CRITICAL | ≥2 of {new device, OneToken reset, limit increase} + large/draining transfer |
| R2 | Scam-Recipient | CRITICAL | large + new overseas + recipient-network flag + retry-after-warning |
| R3 | Social-Engineering | CRITICAL | new recipient + large + recent liquidation + repeated warning dismissals |
| R3b | Sustained-Drift | HIGH | Adaptive Care detected a multi-week escalating pattern |
| R4 | Compromise+Mule | CRITICAL | new device + new recipient + recipient-network flag |
| — | (guard) | — | a lone "amount far exceeds typical" signal matches **no** rule — this is the code-level enforcement of "large transfer alone is not enough" |

## 6. Risk Account Registry cross-reference (SIMULATED — see HONESTY_BOUNDARY.md)
Every transfer's `recipient_acct` is looked up in the registry (`registry.ts`) **before** the
snapshot is computed:

| Registry status | Signal added | Category | Severity |
|---|---|---|---|
| `blacklisted` | "Recipient on Risk Account Registry — blacklisted" | recipient_network | high |
| `watchlist` | "Recipient on Risk Account Registry — watchlist" | recipient_network | medium |
| `cleared` / `unknown` | none | — | — |

This is the "institutional memory" family the spec calls the intelligence layer — a staff
confirmation on one case changes how every future transfer to that account is scored.

## 7. AI second opinion (Claude) — can only raise the score
`final_score = max(deterministic_score, ai_risk_score)`. See
[AI_INTEGRATION.md](AI_INTEGRATION.md) for why, and how the final band is re-resolved (still
diversity-gated) at the final score.

## 8. Worked example — the golden scenario, traced live against this build
S$15,000 transfer to David Lim (new payee, watchlisted at the time):

| Signal | Family | Severity | Points |
|---|---|---|---|
| New recipient | behavioural | medium | 18 |
| Amount far exceeds typical transfer (~8×) | transaction | high | 30 |
| Recent savings liquidation | behavioural | high | 30 |
| Recipient on Risk Account Registry — watchlist | recipient_network | medium | 18 |

Deterministic score = 18+30+30+18 = 96 (78 without the registry signal, already CRITICAL on its
own) → **3 signal families present → diversity gate passes without needing a pattern rule** →
**CRITICAL**.
No pattern rule matched, no AI needed to reach CRITICAL — the band the demo claims is a direct
product of the existing scoring weights, not a hard-coded outcome. After staff confirm the case
as a scam, the registry escalates David Lim to `blacklisted`; the identical transfer re-run then
scores **100/100** (high-severity registry signal replaces the medium one).

A single S$1 transfer to an unrelated, clean new payee produces only "New recipient" (medium,
18 points, one family) — stays **LOW**, opens no case. The false-positive guard holds.
