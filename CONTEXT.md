# Guardian Angel — Project Context

This file gives background and non-negotiable principles for the OCBC Guardian Angel
project. Read it alongside `BUILD_SPEC.md`. The build spec says WHAT to build; this
file says what the product STANDS FOR and which claims are true. When a design choice
in code could contradict a principle below, the principle wins.

---

## What Guardian Angel is
An AI-powered financial-protection system for elderly OCBC banking customers, framed
for the PolyFinTech100 hackathon under the OCBC Autonomous AI track. It is positioned
as an **intelligent decision-making layer placed across OCBC's existing ecosystem** —
not a separate program built from zero.

It runs a continuous agent loop: **Observe → Interpret → Decide → Act → Explain → Learn.**
That loop — specifically the AI *choosing* the proportionate intervention — is what makes
it an agent rather than a dashboard, chatbot, or fixed fraud rule.

### Three pillars
1. **Protect** — adaptive scam interception + detection of sustained, unexplained shifts
   in financial routines that may signal vulnerability, exploitation, confusion, or a
   major life change.
2. **Simplify** — with consent, reviews OCBC + Great Eastern holdings to surface dormant
   accounts, overlapping insurance, duplicated investments, excessive fees, liquidity gaps.
3. **Empower** — identifies relevant government support, explains eligibility, prepares
   the information, and guides the customer through the correct official channel.

**For the prototype, build PROTECT only, end to end.** Simplify and Empower stay as
narrative in the deck.

---

## The demo scenario (personas)
- **Grace, 68** — banked with OCBC 30+ years, manages her own finances, values her
  independence. Is socially engineered into attempting a S$50,000 transfer to a new
  recipient. She passes every security step correctly — authentication confirms it's
  her, but cannot confirm she is acting freely and with accurate information.
- **Marcus, 39** — Grace's son, her nominated **Guardian Contact**. He helps with digital
  matters but does NOT control her account. He is a safety net, not a decision-maker.

---

## NON-NEGOTIABLE PRINCIPLES (guard these in code and copy)

1. **Consent-forward — the senior stays the decision-maker.**
   The customer remains in control of their own money at all times. Any feature, label,
   or UI that implies automatic override, or that frames the Guardian Contact as the
   "real decision-maker" or "gatekeeper," directly contradicts the product and must not
   ship. (This was an actual error corrected in the deck — do not reintroduce it.)

2. **Bounded autonomy — autonomy is in the DECISION to intervene, not in overriding the customer.**
   The agent may: warn, pause, add verification, place a TEMPORARY (reversible) hold,
   alert the Guardian Contact, and escalate to a human specialist. The agent must NEVER:
   seize funds, permanently freeze an account, move money on its own, or give the Guardian
   Contact authority over the customer's account. There is deliberately no "seize" or
   "permanent freeze" tool in the action space.

3. **Least-restrictive intervention.**
   The agent always chooses the least restrictive safe action. A contextual warning is
   preferred over a hold when a warning is sufficient. Escalate only as risk rises.

4. **The Guardian Contact is informed, not in charge.**
   Marcus receives notifications / may participate in verification ONLY within permissions
   Grace chose herself. He never gets an approve/deny button over her money.

5. **No medical / cognitive diagnosis.**
   Guardian Angel does NOT diagnose cognitive decline or any medical condition. It
   identifies possible *financial vulnerability*, exploitation, confusion, or a major life
   change. (The deck originally over-claimed "detects cognitive decline months before
   families notice" — this was removed. Do not reintroduce clinical claims anywhere.)

6. **The model decides — not a hard-coded threshold.**
   The "autonomous AI backend" claim requires that the final action selection routes
   through the model's tool use. A rule-based risk score may be ONE input the model reads,
   but `if (amount > X) block` is NOT autonomy and must not be the thing making the call.

---

## VERIFIED CLAIMS (true — safe to state; sources checked)
- **S$1.1 billion** lost to scams in Singapore in 2024 (Singapore Police Force).
- Seniors aged 65+ are only ~8.4% of victims but **lose the most per victim** of any age
  group (SPF, 2024). NOTE: it is FALSE to say seniors lose the "largest share" of total
  losses — say "most per victim."
- **86%** of surveyed Singapore banking customers rate confidence in the safety of their
  personal information and assets as extremely/very important (FIS / Savanta survey, 2024).
- **OCBC SeniorCare** is a real 3-year programme launched March 2025, >S$2M committed,
  designed to benefit **180,000+ seniors** aged 60+. NOTE: say "designed to benefit / targeted
  by the programme," NOT "180,000 already enrolled."
- **MAS Proof-of-Value on AI scam detection** is real — announced 4 May 2026, with GovTech
  and the Singapore Police Force, pooling data from five banks.

## CLAIMS TO AVOID OR HANDLE CAREFULLY
- Do NOT state that **OCBC was named** a participant in the MAS Proof-of-Value — the five
  banks were never publicly disclosed. Frame it as regulatory direction/tailwind, not OCBC
  participation as fact.
- Do NOT claim anything is **"regulatorily pre-cleared."** Unsupportable.
- "No other bank in Singapore has this data" and Grace's exact savings figure are the
  presenter's to defend or soften — treat as persona/illustrative, not verified fact.

---

## Why OCBC is positioned to deliver (the "unfair advantages")
1. Existing SeniorCare relationships + an established platform for engaging older customers.
2. Existing fraud-monitoring / transaction-security capabilities — Guardian Angel adds
   personalised behavioural context and proportionate intervention on top.
3. Great Eastern connection → broader view across banking, insurance, retirement.

Net advantages: wider financial context (not one transaction); intergenerational protection
that supports families WITHOUT removing the senior's independence; autonomous action rather
than another warning or dashboard.

---

## Tone for any user-facing copy
- Plain language a 68-year-old can read; no jargon.
- Warm, calm, respectful of the customer's autonomy.
- Explanations always say WHY an action was taken, kindly.
- Avoid sales-y or aggressive framing ("acquiring Marcus," "gatekeeper," "files
  automatically") — it undercuts the consent-forward message that is the product's
  strongest differentiator.

---

## One-line essence
"A conventional banking system judges the transaction. Guardian Angel understands the
customer." The prototype exists to make that line literally true on stage.
