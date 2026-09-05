# Guardian Angel — Architecture

Three connected interfaces, one backend, one shared reasoning core.

```
USER (customer cockpit)        STAFF (risk operations)         GUARDIAN (trusted contact)
"/"                             "/staff/*"                      "/guardian"
Grace's OCBC app — transfer,    Login → Dashboard → Case Log    Marcus — informed, never
Verify Caller, Adaptive Care    → Case Investigation →          in charge. Read-only
folded in as one app.           Risk Account Registry.          notification feed.
No scores, no AI detail.        Fresh enterprise theme.
        \                              |                              /
         \                             |                             /
          \                            v                            /
           -----------------  BACKEND (Express) -------------------
                     shared risk context (riskContext.ts)
                     rule table + diversity gate (rules.ts)
                     AI second opinion (reasoningEngine.ts, reason.ts)
                     policy engine — recommend vs enforce (policy.ts)
                     Risk Account Registry (registry.ts) — cross-referenced every transfer
                     Scam Case Log (cases.ts) — auto-opened, staff-reviewed
```

## Why three interfaces
A real OCBC deployment would never let a customer see fraud scores, and would never let a
customer-facing screen double as a staff fraud-ops tool. Separating USER / STAFF / GUARDIAN is
not cosmetic — it enforces that boundary in the prototype the same way it would in production:
different audiences, different trust levels, different UI, one shared backend.

## Detect → Protect → Investigate → Learn
1. **Detect** — every defence layer (Verify Caller, recipient-network check, the transfer
   itself, Adaptive Care) writes signals into the shared risk context. The Risk Account
   Registry cross-reference is one more signal source, checked on every transfer.
2. **Protect** — the deterministic rule table computes a score and band; Claude gives an
   independent second opinion that can only raise it; the policy engine is the sole enforcer
   of which action actually executes (Claude recommends, it never blocks funds directly).
3. **Investigate** — any transfer scoring MEDIUM+ (or drawing any real intervention) opens a
   case in the Staff Console's Case Log automatically. A staff member investigates the same
   signals, matched rules, and AI assessment the customer's transfer produced.
4. **Learn** — a staff decision writes back to the Risk Account Registry. The next transfer to
   that same counterparty account is scored with that institutional memory already in hand —
   this is the feedback loop that makes the system smarter with use, not just per-transaction.

## Data flow for one transfer
```
Grace's phone → POST /api/network-check  → simulated mule graph + optional real breach lookup
             → POST /api/assess          → agent.ts:
                   1. build transfer signals (amount ratio, liquidation, device/session, %balance…)
                   2. registry.lookupByAcct(recipient_acct) → adds a recipient_network signal
                   3. setLayerSignals('transfer', …) → shared risk context recomputed
                   4. reasoningEngine.ts: AI second opinion (final = max(deterministic, AI))
                   5. resolveBandWithDiversity() → band, gated on signal-family diversity
                   6. Claude recommends an action; policy.ts enforces the final action
                   7. cases.ts upsertCase() → Staff Console case log (dedup-aware)
             → phone shows the enforced action; case appears in /staff/cases
```

See [RISK_MODEL.md](RISK_MODEL.md) for the scoring detail, [AI_INTEGRATION.md](AI_INTEGRATION.md)
for the recommend-vs-enforce split, [DATA_MODEL.md](DATA_MODEL.md) for the Case/RegistryEntry
shapes, and [HONESTY_BOUNDARY.md](HONESTY_BOUNDARY.md) for what's real vs simulated.
