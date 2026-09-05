# Data Model

All stores are in-memory (module-scoped arrays/maps), session-scoped, reset on server restart —
consistent across the whole prototype (`accounts.ts` was already built this way; `registry.ts`
and `cases.ts` follow the same pattern). No database. See HONESTY_BOUNDARY.md.

## RiskContextSnapshot (`riskContext.ts` / `rules.ts`)
```
signals: RiskContextSignal[]          // union of every layer's current signals
riskScore: number                     // additive, capped 0-100
riskLevel: RiskTier                   // LOW | MEDIUM | HIGH | CRITICAL, diversity-gated
allowedActions: ToolName[]
matchedRules: MatchedRuleInfo[]       // R1-R4 / R3b that fired
distinctCategories: number
diversityCapped: boolean
reasonCode: string                    // signal labels joined — explainability
```

## Case (`cases.ts`) — the Staff Console's unit of work
```
caseId, timestamp
customer: { name, age }
counterparty: { name, acct, bank }
amount, riskScore, riskLevel
detectionTrigger: string              // reasonCode / matched-rule names
aiAssessment: string | null           // concise signal-based explanation, NOT chain-of-thought
riskSignals: RiskContextSignal[]
intervention: ToolCall[]              // the enforced actions
outcome: string | null
reviewStatus: 'open' | 'under_review' | 'confirmed_scam' | 'marked_safe'
accountRiskStatus: RegistryStatus     // snapshot of registry status AT assessment time
linkedCaseIds: string[]               // other cases sharing the same counterparty account
```
A case opens automatically when a transfer reaches MEDIUM+ or draws any intervention beyond a
plain allow (`shouldOpenCase`). Repeated `/api/assess` calls for the SAME (counterparty, amount)
pairing update the existing OPEN case rather than forking a duplicate (`upsertCase` dedup key);
a case a human already reviewed is left alone, and a genuinely new transaction opens fresh.

## RegistryEntry (`registry.ts`) — Risk Account Registry
```
acct, name, bank
riskStatus: 'blacklisted' | 'watchlist' | 'cleared' | 'unknown'
category: string
reportsCount: number
previousCaseIds: string[]
lastFlagged: number | null
registryRiskScore: number
```
`flagAccount()` is an **idempotent upsert**: re-reviewing an already-flagged case does not
inflate `reportsCount`/`lastFlagged` — only a case ID not already recorded against that account
counts as a new report. This is what keeps re-opening the same case investigation from silently
escalating the account's report count.

## Endpoints added this pass
```
POST /api/staff/login              PROTOTYPE-ONLY demo credential check
GET  /api/staff/metrics            dashboard tiles
GET  /api/cases                    case log
GET  /api/cases/:id                one case
POST /api/cases/:id/review         { decision, note } → reviewCase() → registry write-back
GET  /api/registry                 full registry
GET  /api/registry/:acct           one entry
POST /api/registry/:acct           manual staff flag → flagAccount()
```
`POST /api/assess` gained `recipient_acct` (threaded from the customer's selected payee) so the
registry cross-reference and the case's counterparty account have something to key on.
