# Demo Flow — the golden scenario across all three interfaces

Verified live against this build (see RISK_MODEL.md §8 for the exact numbers).

## Setup
```bash
cd "OCBC FinTech/backend"  && npm run dev      # http://localhost:4000
cd "OCBC FinTech/frontend" && npm run dev      # http://localhost:5173
```
Open `http://localhost:5173/menu` for a launcher linking all three interfaces, or go straight to
`/` for the customer app.

## 1. USER — the transfer
1. `/` — Grace's OCBC app. Pay & Transfer → New recipient or select **David Lim** (seeded,
   watchlisted) → **S$15,000**.
2. Network gate fires first (simulated mule-graph check) — "This account looks like a scam
   collection point…" → Confirm & send.
3. Guardian Angel reviews (live AI call, ~5–20s, or instant in Demo mode) → **transfer paused**,
   24-hour safety hold, Marcus notified, "Why we're asking" shows the real signals.

## 2. STAFF — investigate
1. `/staff/login` — demo credentials `ops001` / `guardian2026` (labelled prototype-only).
2. Dashboard shows the new open case, funds under protection, top flagged accounts.
3. Case Log → the David Lim case → **Case Investigation**: full signal breakdown (5 signals,
   3 families), the registry cross-reference signal, matched-pattern context, the enforced
   intervention (`place_hold` + `alert_guardian` + `escalate_to_specialist`).
4. Click **Confirm scam** → account risk status flips **Watchlist → Blacklisted** in front of
   the reviewer, case marked `confirmed_scam`.

## 3. Feedback loop — the point of the whole exercise
1. `/staff/registry` — David Lim now shows **Blacklisted**, reports count incremented once
   (not per-review — idempotent).
2. Back on `/`, run the **identical S$15,000 transfer to David Lim again**: the registry signal
   is now **high severity** (blacklisted, not watchlist) and the score reaches 100/100 — the
   system scored the second attempt with the institutional memory the first one produced.

## 4. GUARDIAN — Marcus stays informed, never in charge
`/guardian` shows the CRITICAL alert with a plain-language summary and the SeniorCare welfare
call note. No approve/deny control exists on this screen — that's the point.

## False-positive control (say this if a judge tries to break it)
A S$1 (or any small) transfer to a clean, unrelated new payee produces exactly one weak signal
("New recipient") — stays LOW, opens no case, changes nothing in the registry. "A large amount
alone is never high risk" and "an unremarkable small transfer is never escalated" both hold
because the diversity gate and the registry both require corroborating evidence, not just a
number.
