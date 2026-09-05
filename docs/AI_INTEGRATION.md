# AI Integration — Claude recommends, the policy engine enforces

This is the single most important architectural rule in the system, and it is enforced in code,
not just described in prose: **Claude never has the ability to directly hold, block, or move a
customer's money.** Three separate mechanisms make that true.

## 1. The AI's score can only RAISE the deterministic floor
`reasoningEngine.ts`: `final_score = max(deterministic_score, ai_risk_score)`. Claude is shown
the raw signals and matched pattern names — **never the deterministic score itself** — and gives
an independent 0–100 judgment (`assess_transfer_risk` forced tool call). This prevents anchoring
and means a strong AI read can catch a dangerous combination the fixed severity weights
undervalued, but a weak AI read can never talk the system out of a risk the rule table already
found. In Demo mode this call is skipped entirely (`ai_risk_score = 0`), so Demo stays 100%
reproducible; in Live mode the final score is always ≥ the deterministic floor.

## 2. The final band is still diversity-gated at the final score
Raising the score doesn't add new signal families — `resolveBandWithDiversity()` runs again at
`final_score`, so the AI cannot manufacture a CRITICAL band out of one weak signal family by
itself; genuine cross-category evidence (or a matched pattern / exceptionally strong indicator)
is still required. See RISK_MODEL.md §4.

## 3. `policy.ts` is the sole enforcer of the actual action
Claude recommends a tool call (e.g. `place_hold`) from the `allowedActions` the rule table
already computed. `enforcePolicy()` is direction-aware:
- if Claude's recommendation is **more restrictive** than the band's ceiling permits, it is
  clamped down (a false-positive guardrail against an overcautious model);
- if Claude's recommendation is **less restrictive** than the band's floor requires, it is
  raised to the minimum required action (a false-negative guardrail against an undercautious
  model).

Either way, the code that actually holds funds, moves them into Money Lock, or lets a transfer
proceed runs from the policy engine's decision — never directly from the model's tool call.

## AI outputs are concise, signal-based explanations — not chain-of-thought
Both the transfer-recommendation call and the second-opinion call are prompted to explain their
decision by **citing the specific signal combination that drove it**, in plain language (see the
`ai_reasoning` field description in `tools.ts`). This is a decision explanation a judge or a
customer could read, not an exposed internal reasoning trace — and it's what `Case.aiAssessment`
stores for the Staff Console.

## Model & latency
`claude-sonnet-5`, `thinking: { type: 'disabled' }` (adaptive thinking otherwise pushed live
calls past a usable demo latency), 25s timeout with an honest cached fallback
(`source: 'cached_fallback'`) if the live call times out or errors — the fallback agrees with
the deterministic score rather than inventing a number, so a network hiccup can never silently
overstate risk.
